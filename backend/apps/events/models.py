import datetime

from django.conf import settings
from django.db import models

from apps.core.constants import CATEGORY_CHOICES

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

    # Floor map — an aerial/floor-plan image with booth markers placed on
    # top (see BoothAssignment below). No map until an admin uploads one or
    # picks a generic preset (map_image_preset) for venues without a real
    # floor plan — exactly one of the two is meaningful at a time; setting
    # one clears the other (see views.EventMapImageUploadView/EventMapPresetView).
    # map_visible is a separate switch so an admin can prep the map/booths
    # before making it public.
    map_image = models.ImageField(upload_to="event_maps/", null=True, blank=True)
    map_image_preset = models.CharField(
        max_length=30, blank=True, choices=MAP_IMAGE_PRESET_CHOICES
    )
    map_visible = models.BooleanField(default=False)

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


class BoothAssignment(models.Model):
    """
    A single booth marker placed on an event's floor map. Position/size are
    stored as percentages (0-100) of the map image's width/height, not raw
    pixels, so a marker stays correctly placed regardless of how large the
    image renders on a given screen.

    A booth is either linked to a real vendor account (`vendor`) or has a
    manually-entered name for a vendor without one (`unlinked_vendor_*`) —
    never both, never neither (enforced in BoothAssignmentSerializer, not
    here, since the "exactly one of" rule needs clean error messages per
    field rather than a blunt DB constraint).
    """

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="booth_assignments")
    booth_number = models.CharField(max_length=50)

    position_x = models.DecimalField(max_digits=5, decimal_places=2)
    position_y = models.DecimalField(max_digits=5, decimal_places=2)
    width = models.DecimalField(max_digits=5, decimal_places=2)
    height = models.DecimalField(max_digits=5, decimal_places=2)

    # Set when the booth belongs to a real, registered vendor account.
    vendor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booth_assignments",
        limit_choices_to={"role": "vendor"},
    )
    # Set instead of `vendor` when the assigned vendor has no account.
    # `unlinked_vendor_contact` is for the admin's own reference only and
    # is never included in any public-facing response.
    unlinked_vendor_name = models.CharField(max_length=200, blank=True)
    unlinked_vendor_category = models.CharField(max_length=50, blank=True)
    unlinked_vendor_contact = models.CharField(max_length=200, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["booth_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["event", "booth_number"], name="unique_booth_number_per_event"
            )
        ]

    def __str__(self):
        return f"Booth {self.booth_number} ({self.event.name})"


class MapSection(models.Model):
    """
    A labeled zone drawn on an event's floor map to indicate what a general
    area is for (e.g. "top-left corner is Pokémon vendors") — purely a
    wayfinding overlay, independent of individual BoothAssignment markers.
    Position/size use the same percentage convention as BoothAssignment.
    """

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="map_sections")
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)

    position_x = models.DecimalField(max_digits=5, decimal_places=2)
    position_y = models.DecimalField(max_digits=5, decimal_places=2)
    width = models.DecimalField(max_digits=5, decimal_places=2)
    height = models.DecimalField(max_digits=5, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.get_category_display()} section ({self.event.name})"
