from django.conf import settings
from django.db import models

from apps.core.constants import CATEGORY_CHOICES


class Listing(models.Model):
    """
    A single item a vendor has for sale. Creation is gated by
    apps.core.permissions.IsApprovedVendor — a vendor whose account is
    still pending_review can't create these yet.
    """

    class Condition(models.TextChoices):
        MINT = "mint", "Mint"
        NEAR_MINT = "near-mint", "Near Mint"
        EXCELLENT = "excellent", "Excellent"
        GOOD = "good", "Good"
        FAIR = "fair", "Fair"

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
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    condition = models.CharField(max_length=20, choices=Condition.choices)
    grading = models.CharField(max_length=20, choices=Grading.choices, default=Grading.UNGRADED)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.vendor.email})"
