from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class User(AbstractUser):
    """
    Custom user model identified by email instead of username.

    `role` is a coarse-grained switch used for routing/UX (which dashboard,
    which nav). Fine-grained access control should still use Django's
    built-in Groups/Permissions on top of this, e.g. granting a vendor
    specific model permissions rather than branching purely on role.
    """

    class Role(models.TextChoices):
        VENDOR = "vendor", "Vendor"
        CUSTOMER = "customer", "Customer"
        ADMIN = "admin", "Admin"

    class VendorStatus(models.TextChoices):
        PENDING_REVIEW = "pending_review", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    username = None
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER)

    # Registration only collects email/password; the rest is collected in a
    # second "onboarding" step (name, role, role-specific fields) once the
    # user already has a session. This flag lets the frontend tell "signed
    # up but hasn't finished onboarding" apart from "fully set up".
    onboarding_completed = models.BooleanField(default=False)

    # Vendor-only fields, filled in during onboarding when role=vendor.
    # Left blank for customers.
    business_name = models.CharField(max_length=200, blank=True)
    business_description = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)

    # For vendors: categories they sell. For customers: categories they're
    # interested in. Same vocabulary (see apps.core.models.Category),
    # reused across both roles rather than duplicating the field.
    category_tags = models.JSONField(default=list, blank=True)

    # Only meaningful when role=vendor. A vendor can't create listings until
    # this is "approved" (see apps.core.permissions.IsApprovedVendor). Null
    # for customers/admins, who never need approval.
    vendor_status = models.CharField(
        max_length=20, choices=VendorStatus.choices, null=True, blank=True
    )

    # Admin-driven "soft disable" — deliberately separate from is_active
    # (which Django's auth backends use to block login outright). An
    # archived account can still log in, but every role-gated permission
    # (see apps.core.permissions.HasRole) rejects it, and the frontend
    # redirects it to a "contact support" page instead of any real page.
    archived = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email
