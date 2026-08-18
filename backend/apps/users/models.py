from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class AdminNoteChange(models.Model):
    TARGET_USER = "user"
    TARGET_EVENT = "event"
    TARGET_CHOICES = ((TARGET_USER, "User"), (TARGET_EVENT, "Event"))

    target_type = models.CharField(max_length=20, choices=TARGET_CHOICES)
    target_id = models.PositiveIntegerField()
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admin_note_changes",
    )
    old_text = models.TextField(blank=True, default="")
    new_text = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "users"
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["target_type", "target_id", "-created_at"])]

    def __str__(self):
        return f"{self.target_type}:{self.target_id} note change"




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
        # "Admin for admins" — everything a regular admin can do, plus the
        # ability to edit/archive/flag/delete/impersonate other admin (and
        # owner) accounts, which regular admins are explicitly blocked from
        # touching. See apps.core.permissions for the enforcement.
        OWNER = "owner", "Owner"

    class VendorStatus(models.TextChoices):
        PENDING_REVIEW = "pending_review", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    class ProfileTheme(models.TextChoices):
        # A handful of preset color pairs for the public profile page's
        # banner gradient + avatar circle — reusing the site's existing
        # brand palette (see globals.css) rather than a color picker, since
        # there's no image-upload flow yet (see banner_image_url below).
        BLUE = "blue", "Blue"
        CRIMSON = "crimson", "Crimson"
        TEAL = "teal", "Teal"
        ORANGE = "orange", "Orange"
        CHARCOAL = "charcoal", "Charcoal"

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        CREDIT_CARD = "credit_card", "Credit/Debit Card"
        VENMO = "venmo", "Venmo"
        PAYPAL = "paypal", "PayPal"
        CASHAPP = "cashapp", "Cash App"
        ZELLE = "zelle", "Zelle"

    class VendorTier(models.TextChoices):
        PREMIUM = "premium", "Premium"
        STANDARD = "standard", "Standard"
        BASIC = "basic", "Basic"

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

    # Optional social links shown on a vendor's public profile — each one
    # simply doesn't render an icon when blank (see PublicVendorSerializer).
    instagram_url = models.URLField(max_length=300, blank=True)
    youtube_url = models.URLField(max_length=300, blank=True)
    x_url = models.URLField(max_length=300, blank=True)
    website_url = models.URLField(max_length=300, blank=True)

    # No upload flow exists yet for either of these — they're just DB
    # columns ready for whenever that's built. Until then they stay blank
    # and the public profile page always renders its placeholder banner/
    # avatar graphics regardless.
    banner_image_url = models.URLField(max_length=500, blank=True)
    avatar_image_url = models.URLField(max_length=500, blank=True)

    # Vendor-only: which preset color pair (see ProfileTheme above) renders
    # the public profile page's banner/avatar. Defaults to the site's own
    # blue/navy brand colors.
    profile_theme = models.CharField(
        max_length=20, choices=ProfileTheme.choices, default=ProfileTheme.BLUE
    )

    # Vendor-only, all optional — a few extra trust/practical signals shown
    # on the public profile page. None of these are collected during
    # onboarding (kept out to avoid lengthening that flow); a vendor fills
    # them in later via Profile Settings if they want to.
    tagline = models.CharField(max_length=100, blank=True)
    collection_size = models.PositiveIntegerField(null=True, blank=True)
    selling_since_year = models.PositiveIntegerField(null=True, blank=True)
    also_buying = models.BooleanField(default=False)
    payment_methods = models.JSONField(default=list, blank=True)

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

    # Only meaningful when role=vendor. Deliberately never exposed to the
    # vendor themselves (see UserDetailsSerializer/ProfileSerializer, which
    # both omit it) — only admin-facing serializers/endpoints touch this
    # field, and it can only be changed via SetVendorTierView (the Vendor
    # Tiers admin tool), never through a vendor's own profile edit.
    vendor_tier = models.CharField(
        max_length=20, choices=VendorTier.choices, default=VendorTier.BASIC
    )

    # Admin-driven "soft disable" — deliberately separate from is_active
    # (which Django's auth backends use to block login outright). An
    # archived account can still log in, but every role-gated permission
    # (see apps.core.permissions.HasRole) rejects it, and the frontend
    # redirects it to a "contact support" page instead of any real page.
    archived = models.BooleanField(default=False)

    # Admin moderation flag used by Manage Accounts for quick triage.
    flagged = models.BooleanField(default=False)

    # Internal admin notes shown in Manage Accounts.
    notes = models.TextField(blank=True, default="")

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email
