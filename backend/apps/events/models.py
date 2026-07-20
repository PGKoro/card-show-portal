import datetime

from django.conf import settings
from django.db import models

from apps.core.models import Category

# Generic layout diagrams an admin can fall back to when a venue can't
# provide a real floor plan. The actual image assets are static frontend
# files (frontend/public/preset-maps/) — this backend only needs to
# validate/store which one was picked; the frontend owns resolving the key
# to an image path, so nothing here is coupled to frontend hosting.
MAP_IMAGE_PRESET_CHOICES = [
    ("single_hall", "Single Open Hall"),
    ("center_aisle", "Hall with Center Aisle"),
    ("l_shaped", "L-Shaped Hall"),
    ("two_room", "Two Connected Rooms"),
]
MAP_IMAGE_PRESET_KEYS = [key for key, _ in MAP_IMAGE_PRESET_CHOICES]


class Venue(models.Model):
    """
    A physical location that hosts card shows. Owns the floor map (image or
    preset) and the physical booth slots/category zones on it — all of
    which persist across every Event held here, so an admin builds the
    floor plan once and reuses it (see Booth, VenueSection). Per-event
    specifics (who's actually claimed a booth for a given show, at what
    price) live on BoothRegistration instead, keyed by (event, booth).
    """

    name = models.CharField(max_length=200)
    city = models.CharField(max_length=200, blank=True)

    map_image = models.ImageField(upload_to="venue_maps/", null=True, blank=True)
    map_image_preset = models.CharField(
        max_length=30, blank=True, choices=MAP_IMAGE_PRESET_CHOICES
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Booth(models.Model):
    """
    A physical booth slot at a Venue's floor map — position/size (percentage
    of the map image, same convention as VenueSection) and the standard
    price an admin sets for it. Persists across every Event at that venue;
    who's actually claimed it for a specific show is tracked separately by
    BoothRegistration, so the same slot can be rebooked show after show.
    """

    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name="booths")
    booth_number = models.CharField(max_length=50)

    position_x = models.DecimalField(max_digits=5, decimal_places=2)
    position_y = models.DecimalField(max_digits=5, decimal_places=2)
    width = models.DecimalField(max_digits=5, decimal_places=2)
    height = models.DecimalField(max_digits=5, decimal_places=2)

    price = models.DecimalField(max_digits=8, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["booth_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["venue", "booth_number"], name="unique_booth_number_per_venue"
            )
        ]

    def __str__(self):
        return f"Booth {self.booth_number} ({self.venue.name})"


class VenueSection(models.Model):
    """
    A labeled zone drawn on a Venue's floor map to indicate what a general
    area is for (e.g. "top-left corner is Pokémon vendors") — purely a
    wayfinding overlay, independent of individual Booth markers. Position/
    size use the same percentage convention as Booth. Persists across every
    Event at that venue, same as Booth.
    """

    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name="sections")
    # Validated against apps.core.models.Category's live slugs at the
    # serializer level (see VenueSectionSerializer.validate_category)
    # rather than a hardcoded choices= tuple.
    category = models.CharField(max_length=50)

    position_x = models.DecimalField(max_digits=5, decimal_places=2)
    position_y = models.DecimalField(max_digits=5, decimal_places=2)
    width = models.DecimalField(max_digits=5, decimal_places=2)
    height = models.DecimalField(max_digits=5, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        label = Category.objects.filter(slug=self.category).values_list("name", flat=True).first()
        return f"{label or self.category} section ({self.venue.name})"


class Event(models.Model):
    """
    A card show/convention. Publicly browsable; only admins can create or
    edit one (see apps.core.permissions.IsAdminRole).
    """

    name = models.CharField(max_length=200)
    venue = models.CharField(max_length=200)
    city = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    start_date = models.DateField()
    # Optional — a single-day event can leave this blank.
    end_date = models.DateField(null=True, blank=True)

    # Real vendor accounts attached to the event. estimated_cards/attendees
    # below are manually-entered admin estimates, not derived from anything,
    # since we have no real way to measure those yet.
    vendors = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="events_attending",
        limit_choices_to={"role": "vendor"},
    )
    estimated_cards = models.PositiveIntegerField(default=0)
    estimated_attendees = models.PositiveIntegerField(default=0)

    # Floor map — the map image/preset and booth slots live on Venue (see
    # above), reused across every event held there. map_venue is nullable:
    # an event doesn't have to have a floor map at all.
    map_venue = models.ForeignKey(
        Venue, on_delete=models.SET_NULL, null=True, blank=True, related_name="events"
    )
    # Controls whether the *public* can see the map (once map_venue has an
    # image/preset). Separate from map_visible_to_vendors below.
    map_visible = models.BooleanField(default=False)
    # Separate from map_visible (which controls whether the *public* can see
    # the map): this controls whether vendors can browse/select booths for
    # this event at all. An admin can open vendor selection without making
    # the map public yet, or vice versa.
    map_visible_to_vendors = models.BooleanField(default=False)
    # Until this passes, a booth a vendor held at the venue's most recent
    # prior event is held exclusively for them (see BoothRegistration's
    # loyalty_hold status) — nobody else can request it. Null means no
    # loyalty window (booths open to everyone immediately).
    loyalty_priority_deadline = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_date"]

    def __str__(self):
        return self.name

    @property
    def status(self):
        reference_date = self.end_date or self.start_date
        return "upcoming" if reference_date >= datetime.date.today() else "past"

    @property
    def vendor_count(self):
        return self.vendors.count()


class BoothRegistration(models.Model):
    """
    A vendor's claim on a Booth for one specific Event — kept separate from
    the physical Booth slot so the same slot can be reused/rebooked across
    every event at that venue instead of being recreated each time.

    Status lifecycle:
      loyalty_hold -> the vendor who had this booth at the venue's most
                       recent prior event gets first refusal until
                       Event.loyalty_priority_deadline passes (see
                       apps.events.services.create_loyalty_holds). Nobody
                       else can request the booth while a hold is active
                       and unexpired.
      requested    -> a vendor asked for this booth (via loyalty claim or
                       from the open pool); pending admin decision.
      confirmed    -> admin approved it — standing in for "payment
                       received" until real payment processing exists.
      declined     -> admin rejected a request; booth reopens.
      released     -> vendor gave up a confirmed/held booth voluntarily.

    Only one *active* (loyalty_hold/requested/confirmed) registration can
    exist per (event, booth) at a time — enforced by the partial unique
    constraint below — but declined/released rows are kept for history
    (e.g. so a future event's loyalty lookup can see who was last confirmed).
    """

    class Status(models.TextChoices):
        LOYALTY_HOLD = "loyalty_hold", "Loyalty hold"
        REQUESTED = "requested", "Requested"
        CONFIRMED = "confirmed", "Confirmed"
        DECLINED = "declined", "Declined"
        RELEASED = "released", "Released"

    ACTIVE_STATUSES = (Status.LOYALTY_HOLD, Status.REQUESTED, Status.CONFIRMED)

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="booth_registrations")
    booth = models.ForeignKey(Booth, on_delete=models.CASCADE, related_name="registrations")

    # Set when the booth belongs to a real, registered vendor account.
    vendor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booth_registrations",
        limit_choices_to={"role": "vendor"},
    )
    # Set instead of `vendor` when the assigned vendor has no account.
    # `unlinked_vendor_contact` is for the admin's own reference only and
    # is never included in any public-facing response.
    unlinked_vendor_name = models.CharField(max_length=200, blank=True)
    unlinked_vendor_category = models.CharField(max_length=50, blank=True)
    unlinked_vendor_contact = models.CharField(max_length=200, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REQUESTED)
    # Snapshot of Booth.price at the time of request/hold-creation — so a
    # later change to the booth's standard price doesn't retroactively
    # change what an already-registered vendor owes.
    price = models.DecimalField(max_digits=8, decimal_places=2)

    requested_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-requested_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["event", "booth"],
                condition=models.Q(status__in=["loyalty_hold", "requested", "confirmed"]),
                name="unique_active_registration_per_booth_per_event",
            )
        ]

    def __str__(self):
        return f"Booth {self.booth.booth_number} — {self.event.name} ({self.status})"
