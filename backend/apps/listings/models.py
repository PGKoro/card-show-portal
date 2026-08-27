from django.conf import settings
from django.db import models

from apps.core.models import validate_image_upload


class Listing(models.Model):
    """
    A single item a vendor has for sale. Creation is gated by
    apps.core.permissions.IsApprovedVendor — a vendor whose account is
    still pending_review can't create these yet.

    A Listing is a specific *physical copy* a dealer is selling — distinct
    from the underlying Set Registry `Card` it may represent (see
    apps.collections.models.Card). Many dealers can each list their own
    copy of the same registry Card, each with its own grading/serial/price/
    photos. `card` is optional so a listing can still exist without being
    tied into Collections (e.g. non-card items, or before a matching
    registry Card exists — see apps.collections.models.CardSubmission for
    the "can't find your card" flow).
    """

    class Grading(models.TextChoices):
        UNGRADED = "ungraded", "Ungraded"
        PSA = "psa", "PSA"
        BGS = "bgs", "BGS"
        SGC = "sgc", "SGC"
        CGC = "cgc", "CGC"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        AVAILABLE = "available", "Available"
        RESERVED = "reserved", "Reserved"
        SOLD = "sold", "Sold"

    vendor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="listings"
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    # Validated against apps.core.models.Category's live slugs at the
    # serializer level (see ListingSerializer.validate_category) rather
    # than a hardcoded choices= tuple, so admins can add/remove categories
    # without a migration.
    category = models.CharField(max_length=20)

    # Set Registry link — which Card (if any) this listing is a physical
    # copy of. SET_NULL rather than CASCADE/PROTECT: deleting a registry
    # Card must never destroy a dealer's marketplace listing (see
    # apps.collections app docstring on data-integrity requirements) — the
    # listing just becomes registry-unlinked, same as it would be if it
    # had never been linked at all.
    card = models.ForeignKey(
        "collections.Card",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="listings",
    )

    # Required for every *new* dealer listing (enforced in
    # ListingSerializer.validate, not at the DB level, so this migration
    # doesn't fail against any pre-existing photo-less rows).
    front_image = models.ImageField(
        upload_to="listings/", null=True, blank=True, validators=[validate_image_upload]
    )
    back_image = models.ImageField(
        upload_to="listings/", null=True, blank=True, validators=[validate_image_upload]
    )

    # Price is optional at the DB/model level because a dealer can instead
    # (or additionally) flag accepting_offers/accepting_trades — see
    # ListingSerializer.validate for the "at least one of price/offers/
    # trades" rule.
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    accepting_offers = models.BooleanField(default=False)
    accepting_trades = models.BooleanField(default=False)

    grading = models.CharField(max_length=20, choices=Grading.choices, default=Grading.UNGRADED)
    # Only meaningful when grading=OTHER — lets a dealer name a grading
    # company beyond the fixed PSA/BGS/SGC/CGC choices without a code
    # change/migration, e.g. "HGA" or "ISA".
    grading_company_other = models.CharField(max_length=50, blank=True, default="")
    # The actual numeric grade a grading company assigned (e.g. 9.5, 10) —
    # standard 1-10 scale with half-point increments. Only meaningful once
    # `grading` names a real company; null/blank while ungraded (see
    # ListingSerializer.validate for the "exactly one of grading vs grade"
    # pairing rule).
    grade = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)

    # "Is this card serial numbered?" — copy_number/print_run store the
    # structural halves of e.g. "57/99" so the site can render/search on
    # them individually, rather than parsing a single free-text string.
    is_serial_numbered = models.BooleanField(default=False)
    serial_copy_number = models.PositiveIntegerField(null=True, blank=True)
    serial_print_run = models.PositiveIntegerField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["card"])]

    def __str__(self):
        return f"{self.title} ({self.vendor.email})"

