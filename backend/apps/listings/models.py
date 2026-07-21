from django.conf import settings
from django.db import models


class Listing(models.Model):
    """
    A single item a vendor has for sale. Creation is gated by
    apps.core.permissions.IsApprovedVendor — a vendor whose account is
    still pending_review can't create these yet.
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
    price = models.DecimalField(max_digits=10, decimal_places=2)
    grading = models.CharField(max_length=20, choices=Grading.choices, default=Grading.UNGRADED)
    # The actual numeric grade a grading company assigned (e.g. 9.5, 10) —
    # standard 1-10 scale with half-point increments. Only meaningful once
    # `grading` names a real company; null/blank while ungraded (see
    # ListingSerializer.validate for the "exactly one of grading vs grade"
    # pairing rule).
    grade = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.vendor.email})"
