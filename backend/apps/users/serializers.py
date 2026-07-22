import re
from datetime import date

from dj_rest_auth.registration.serializers import (
    RegisterSerializer as BaseRegisterSerializer,
)
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from rest_framework import serializers

from apps.core.models import Category

from .models import User

SOCIAL_LINK_FIELDS = ("instagram_url", "youtube_url", "x_url", "website_url")

# Optional, vendor-only "extra details" shown on the public profile page —
# collected via Profile Settings (and its admin-driven equivalent) rather
# than during onboarding, to keep that flow short. See ProfileSerializer.
VENDOR_DETAIL_FIELDS = (
    "tagline",
    "collection_size",
    "selling_since_year",
    "also_buying",
    "payment_methods",
)


def _validate_category_tags(value):
    """
    Shared by OnboardingDetailsSerializer/ProfileSerializer below — checks
    each tag against the live Category vocabulary (apps.core.models.
    Category) instead of a hardcoded choices= list, so admins can add/
    remove categories without a code deploy.
    """
    valid_slugs = set(Category.objects.values_list("slug", flat=True))
    invalid = sorted(set(value) - valid_slugs)
    if invalid:
        raise serializers.ValidationError(f"Not valid categories: {', '.join(invalid)}.")
    return value


def _validate_payment_methods(value):
    """Shared by ProfileSerializer — checks against User.PaymentMethod."""
    valid_values = set(User.PaymentMethod.values)
    invalid = sorted(set(value) - valid_values)
    if invalid:
        raise serializers.ValidationError(f"Not valid payment methods: {', '.join(invalid)}.")
    return value


def _normalize_url(value):
    """
    Shared by SocialLinksMixin below — a vendor typing "instagram.com/shop"
    without a scheme shouldn't get a raw validation error, so this prepends
    https:// before validating instead of rejecting it outright.
    """
    value = value.strip()
    if not value:
        return value
    if not re.match(r"^https?://", value, re.IGNORECASE):
        value = f"https://{value}"
    try:
        URLValidator()(value)
    except DjangoValidationError:
        raise serializers.ValidationError("Enter a valid URL.")
    return value


class SocialLinksMixin(serializers.Serializer):
    """
    Optional instagram_url/youtube_url/x_url/website_url fields with lenient
    validation (see _normalize_url) — shared by every serializer that lets a
    vendor set these: onboarding, self-service Profile Settings (also reused
    for admin-driven edits — see AdminUserDetailView), and admin-created
    accounts. Declared here as plain CharFields rather than left to
    ModelSerializer's auto-generated URLField so _normalize_url gets a
    chance to add a missing scheme before Django's stricter URLValidator
    ever sees the raw input.
    """

    instagram_url = serializers.CharField(required=False, allow_blank=True)
    youtube_url = serializers.CharField(required=False, allow_blank=True)
    x_url = serializers.CharField(required=False, allow_blank=True)
    website_url = serializers.CharField(required=False, allow_blank=True)

    def validate_instagram_url(self, value):
        return _normalize_url(value)

    def validate_youtube_url(self, value):
        return _normalize_url(value)

    def validate_x_url(self, value):
        return _normalize_url(value)

    def validate_website_url(self, value):
        return _normalize_url(value)


class RegisterSerializer(BaseRegisterSerializer):
    """
    Registration only collects email/password — name, role, and
    role-specific details are collected afterwards by the onboarding
    endpoint (OnboardingSerializer below), once the user already has a
    session. The base serializer always declares a `username` field; our
    User model has no username (email is the USERNAME_FIELD), so it's
    dropped here by assigning None, which removes an inherited DRF field.
    """

    username = None

    def validate_email(self, email):
        # dj-rest-auth's own validate_email only rejects the address if a
        # *verified* EmailAddress already uses it (EmailAddress.objects.
        # is_verified). With ACCOUNT_EMAIL_VERIFICATION="optional" nothing
        # gets verified automatically, so that check never fires and a
        # second signup with the same email falls through to `user.save()`,
        # where the DB's unique constraint raises a raw IntegrityError
        # (500) instead of a clean validation error. Checking the User
        # table directly here catches it before that point.
        email = super().validate_email(email)
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                "A user is already registered with this email address."
            )
        return email


class UserDetailsSerializer(serializers.ModelSerializer):
    """Returned by dj-rest-auth's /api/v1/auth/user/ endpoint.

    The frontend uses `role` to decide which dashboard to route a user to,
    and `onboarding_completed`/`vendor_status` to decide whether to send
    them through /onboarding or show a "pending approval" state first.
    """

    class Meta:
        model = User
        fields = (
            "pk",
            "email",
            "first_name",
            "last_name",
            "role",
            "onboarding_completed",
            "business_name",
            "business_description",
            "location",
            "category_tags",
            "instagram_url",
            "youtube_url",
            "x_url",
            "website_url",
            "banner_image_url",
            "avatar_image_url",
            "profile_theme",
            "vendor_status",
            "archived",
            "date_joined",
        ) + VENDOR_DETAIL_FIELDS
        read_only_fields = (
            "email",
            "role",
            "onboarding_completed",
            "vendor_status",
            "archived",
            "date_joined",
        )


class OnboardingBasicSerializer(serializers.ModelSerializer):
    """
    Onboarding step 1 (PATCH /api/v1/auth/onboarding/): name + role for a
    user who has already registered with just email/password. Does *not*
    mark onboarding_completed — that only happens once the role-specific
    step 2 (OnboardingDetailsSerializer) is submitted, on
    /onboarding/customer or /onboarding/vendor.
    """

    role = serializers.ChoiceField(choices=[User.Role.VENDOR, User.Role.CUSTOMER])

    class Meta:
        model = User
        fields = ("role", "first_name", "last_name")
        extra_kwargs = {
            "first_name": {"required": True},
            "last_name": {"required": False, "allow_blank": True},
        }

    def update(self, instance, validated_data):
        instance.role = validated_data["role"]
        instance.first_name = validated_data["first_name"]
        instance.last_name = validated_data.get("last_name", "")
        instance.save()
        return instance


class OnboardingDetailsSerializer(SocialLinksMixin, serializers.ModelSerializer):
    """
    Onboarding step 2 (PATCH /api/v1/auth/onboarding/details/):
    role-specific details, submitted from /onboarding/customer or
    /onboarding/vendor once step 1 has already set `role`. Reads role off
    the existing instance (not the request) since it was already decided
    in step 1 — this endpoint only fills in what's left and finalizes
    onboarding_completed.
    """

    category_tags = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
    )

    class Meta:
        model = User
        fields = (
            "business_name",
            "business_description",
            "location",
            "category_tags",
        ) + SOCIAL_LINK_FIELDS
        extra_kwargs = {
            "business_name": {"required": False, "allow_blank": True},
            "business_description": {"required": False, "allow_blank": True},
            "location": {"required": False, "allow_blank": True},
        }

    def validate_category_tags(self, value):
        return _validate_category_tags(value)

    def validate(self, attrs):
        if self.instance.role == User.Role.VENDOR and not attrs.get("business_name"):
            raise serializers.ValidationError(
                {"business_name": "This field is required for vendors."}
            )
        return attrs

    def update(self, instance, validated_data):
        instance.category_tags = validated_data.get("category_tags", [])

        if instance.role == User.Role.VENDOR:
            instance.business_name = validated_data.get("business_name", "")
            instance.business_description = validated_data.get("business_description", "")
            instance.location = validated_data.get("location", "")
            for field in SOCIAL_LINK_FIELDS:
                setattr(instance, field, validated_data.get(field, ""))
            instance.vendor_status = User.VendorStatus.PENDING_REVIEW

        instance.onboarding_completed = True
        instance.save()
        return instance


class ProfileSerializer(SocialLinksMixin, serializers.ModelSerializer):
    """
    PATCH /api/v1/auth/profile/ — "Profile Settings": lets an
    already-onboarded user edit their own name and role-specific details
    afterwards. Deliberately never touches role/vendor_status/
    onboarding_completed — role changes stay admin-only (see
    apps.users.views.SetUserRoleView), so a user can't use this to grant
    themselves vendor/admin access.

    Also reused as-is by AdminUserDetailView's PATCH (an admin editing
    someone else's account from Manage Accounts) — this serializer only
    ever touches whatever instance get_object() resolves to, never
    self.context['request'].user, so it works unmodified either way.
    """

    category_tags = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    payment_methods = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )

    class Meta:
        model = User
        fields = (
            "first_name",
            "last_name",
            "business_name",
            "business_description",
            "location",
            "category_tags",
            "profile_theme",
        ) + SOCIAL_LINK_FIELDS + VENDOR_DETAIL_FIELDS
        extra_kwargs = {
            "last_name": {"required": False, "allow_blank": True},
            "business_name": {"required": False, "allow_blank": True},
            "business_description": {"required": False, "allow_blank": True},
            "location": {"required": False, "allow_blank": True},
            "tagline": {"required": False, "allow_blank": True},
            "collection_size": {"required": False, "allow_null": True},
            "selling_since_year": {"required": False, "allow_null": True},
            "also_buying": {"required": False},
        }

    def validate_category_tags(self, value):
        return _validate_category_tags(value)

    def validate_payment_methods(self, value):
        return _validate_payment_methods(value)

    def validate_selling_since_year(self, value):
        if value is not None and not (1900 <= value <= date.today().year):
            raise serializers.ValidationError(f"Enter a year between 1900 and {date.today().year}.")
        return value

    def validate(self, attrs):
        if (
            self.instance.role == User.Role.VENDOR
            and "business_name" in attrs
            and not attrs["business_name"]
        ):
            raise serializers.ValidationError({"business_name": "Business name can't be blank."})
        return attrs

    def update(self, instance, validated_data):
        # Vendor-only fields shouldn't apply to non-vendors even if somehow
        # included in the request — defense in depth, since the frontend
        # settings form never shows these fields to a customer.
        if instance.role != User.Role.VENDOR:
            validated_data.pop("business_name", None)
            validated_data.pop("business_description", None)
            validated_data.pop("location", None)
            validated_data.pop("profile_theme", None)
            for field in SOCIAL_LINK_FIELDS:
                validated_data.pop(field, None)
            for field in VENDOR_DETAIL_FIELDS:
                validated_data.pop(field, None)
        return super().update(instance, validated_data)


class PublicVendorSerializer(serializers.ModelSerializer):
    """
    GET /api/v1/vendors/<id>/ — public-safe profile for a vendor account
    (business info only; never email/vendor_status/etc). Backs the floor
    map's click-through for booths linked to a real account, and that
    vendor's own public profile page (banner/avatar images, social links,
    and the events list all read straight off this).
    """

    class Meta:
        model = User
        fields = (
            "pk",
            "business_name",
            "business_description",
            "location",
            "category_tags",
            "banner_image_url",
            "avatar_image_url",
            "profile_theme",
            "date_joined",
        ) + SOCIAL_LINK_FIELDS + VENDOR_DETAIL_FIELDS


class AdminCreateUserSerializer(SocialLinksMixin, serializers.ModelSerializer):
    """
    POST /api/v1/admin/users/create/ — an admin directly provisions a
    customer or vendor account (e.g. onboarding someone over the phone)
    instead of them going through public signup + the onboarding wizard.
    The account is created fully set up (onboarding_completed=True) so it
    can log in immediately; a vendor account created this way is
    auto-approved, since the admin creating it is already vouching for it.
    """

    password = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(choices=[User.Role.CUSTOMER, User.Role.VENDOR])
    category_tags = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
    )

    class Meta:
        model = User
        fields = (
            "email",
            "password",
            "first_name",
            "last_name",
            "role",
            "business_name",
            "business_description",
            "location",
            "category_tags",
        ) + SOCIAL_LINK_FIELDS
        extra_kwargs = {
            "first_name": {"required": True},
            "last_name": {"required": False, "allow_blank": True},
            "business_name": {"required": False, "allow_blank": True},
            "business_description": {"required": False, "allow_blank": True},
            "location": {"required": False, "allow_blank": True},
        }

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "A user is already registered with this email address."
            )
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_category_tags(self, value):
        return _validate_category_tags(value)

    def validate(self, attrs):
        if attrs["role"] == User.Role.VENDOR and not attrs.get("business_name"):
            raise serializers.ValidationError(
                {"business_name": "This field is required for vendor accounts."}
            )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        role = validated_data["role"]
        vendor_status = User.VendorStatus.APPROVED if role == User.Role.VENDOR else None
        return User.objects.create_user(
            password=password,
            onboarding_completed=True,
            vendor_status=vendor_status,
            **validated_data,
        )
