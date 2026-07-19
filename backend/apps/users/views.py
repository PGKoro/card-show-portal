from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.microsoft.views import MicrosoftGraphOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import RegisterView, SocialLoginView
from dj_rest_auth.views import LoginView, PasswordResetView
from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAdminRole

from .models import User
from .serializers import (
    OnboardingBasicSerializer,
    OnboardingDetailsSerializer,
    ProfileSerializer,
    PublicVendorSerializer,
    UserDetailsSerializer,
)


class OnboardingView(generics.UpdateAPIView):
    """
    Onboarding step 1: PATCH /api/v1/auth/onboarding/. Collects name and
    role for the currently-authenticated user (who registered with just
    email/password). Doesn't finalize onboarding — the frontend follows up
    with /onboarding/customer or /onboarding/vendor, which hits
    OnboardingDetailsView below.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = OnboardingBasicSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        # Respond with the full user shape (same as /auth/user/) so the
        # frontend can update its auth state in one round trip.
        return Response(UserDetailsSerializer(request.user).data)


class OnboardingDetailsView(generics.UpdateAPIView):
    """
    Onboarding step 2: PATCH /api/v1/auth/onboarding/details/.
    Role-specific details (business info for vendors, interests for
    customers) — role itself was already set by OnboardingView. Setting
    role=vendor here sets vendor_status to pending_review — see
    apps.core.permissions.IsApprovedVendor for how that gates listing
    creation.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = OnboardingDetailsSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        return Response(UserDetailsSerializer(request.user).data)


class ProfileView(generics.UpdateAPIView):
    """
    PATCH /api/v1/auth/profile/ — "Profile Settings" for an
    already-onboarded user: edit your own name and role-specific details
    (business info for vendors, interests for customers) after the fact.
    See ProfileSerializer for exactly what's editable — role itself is
    never touched here.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ProfileSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        return Response(UserDetailsSerializer(request.user).data)


class PendingVendorListView(generics.ListAPIView):
    """GET /api/v1/admin/vendors/pending/ — vendors awaiting approval."""

    permission_classes = [IsAdminRole]
    serializer_class = UserDetailsSerializer

    def get_queryset(self):
        return User.objects.filter(
            role=User.Role.VENDOR, vendor_status=User.VendorStatus.PENDING_REVIEW
        ).order_by("date_joined")


class VendorDecisionView(APIView):
    """
    POST /api/v1/admin/vendors/<id>/approve/ or /reject/. `decision` is
    fixed per-URL (see urls.py) rather than taken from the request body, so
    an admin can't approve/reject the wrong account by mistyping a field.
    """

    permission_classes = [IsAdminRole]
    decision = None

    def post(self, request, pk):
        vendor = get_object_or_404(User, pk=pk, role=User.Role.VENDOR)
        vendor.vendor_status = self.decision
        vendor.save(update_fields=["vendor_status"])
        return Response(UserDetailsSerializer(vendor).data, status=status.HTTP_200_OK)


class ApproveVendorView(VendorDecisionView):
    decision = User.VendorStatus.APPROVED


class RejectVendorView(VendorDecisionView):
    decision = User.VendorStatus.REJECTED


class AdminUserSearchView(generics.ListAPIView):
    """
    GET /api/v1/admin/users/?search=<email or business name>&role=<vendor|customer|admin>.
    Backs the "Manage Roles" tool (search any user to change their role), the
    event vendor-picker (?role=vendor, to find vendors to attach to an
    event), and the floor-map booth vendor-picker. `search` matches email OR
    business_name — vendors are more often found by their business name than
    their account email, and business_name is blank for non-vendor users so
    this is a no-op there.
    """

    permission_classes = [IsAdminRole]
    serializer_class = UserDetailsSerializer

    def get_queryset(self):
        search = self.request.query_params.get("search", "").strip()
        role = self.request.query_params.get("role", "").strip()
        queryset = User.objects.order_by("email")
        if role in (User.Role.VENDOR, User.Role.CUSTOMER, User.Role.ADMIN):
            queryset = queryset.filter(role=role)
        if search:
            queryset = queryset.filter(
                Q(email__icontains=search) | Q(business_name__icontains=search)
            )
        return queryset


class AdminUserDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/admin/users/<id>/ — full submitted profile for one user
    (used by the "view details" link on a pending vendor approval).
    UserDetailsSerializer never includes password, so there's nothing to
    exclude there.
    """

    permission_classes = [IsAdminRole]
    serializer_class = UserDetailsSerializer
    queryset = User.objects.all()


class SetUserRoleView(APIView):
    """
    POST /api/v1/admin/users/<id>/set-role/ with {"role": "customer" |
    "vendor" | "admin"} — backs the "Manage Roles" tool's three-way flip.
    """

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        new_role = request.data.get("role")
        if new_role not in (User.Role.CUSTOMER, User.Role.VENDOR, User.Role.ADMIN):
            return Response(
                {"role": "Must be one of: customer, vendor, admin."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = get_object_or_404(User, pk=pk)
        user.role = new_role

        if new_role == User.Role.ADMIN:
            # Same reasoning as create_superuser (see UserManager): admins
            # never go through the vendor/customer /onboarding wizard, which
            # has no "admin" role choice — so a promoted user who hadn't
            # finished onboarding yet must not get routed there.
            user.onboarding_completed = True
        elif new_role == User.Role.VENDOR:
            # A user becoming a vendor for the first time still needs
            # approval before they can list anything (see IsApprovedVendor).
            # If they were already a vendor before (vendor_status already
            # set), leave that decision as-is rather than resetting it.
            if user.vendor_status is None:
                user.vendor_status = User.VendorStatus.PENDING_REVIEW
        else:
            # Customers don't have a vendor_status.
            user.vendor_status = None

        user.save(update_fields=["role", "onboarding_completed", "vendor_status"])
        return Response(UserDetailsSerializer(user).data, status=status.HTTP_200_OK)


class ThrottledLoginView(LoginView):
    """
    Same as dj-rest-auth's LoginView, just rate-limited — login is the
    highest-value target for credential-stuffing/brute-force, and the
    project-wide anon/user throttle rates (settings.REST_FRAMEWORK) are
    deliberately loose enough not to interfere with normal public browsing,
    so this needs its own tighter scope. See config/urls.py for where this
    is swapped in ahead of dj_rest_auth.urls' own unthrottled route.

    No throttle_classes override here — ScopedRateThrottle is picked up from
    settings.REST_FRAMEWORK's DEFAULT_THROTTLE_CLASSES (it's a no-op on any
    view that doesn't set throttle_scope), so local/test settings can still
    disable throttling project-wide without these views ignoring it.
    """

    throttle_scope = "auth"


class ThrottledRegisterView(RegisterView):
    """Same reasoning as ThrottledLoginView — signup can otherwise be spammed."""

    throttle_scope = "auth"


class ThrottledPasswordResetView(PasswordResetView):
    """Same reasoning as ThrottledLoginView — otherwise floods a user's inbox."""

    throttle_scope = "auth"


class GoogleLoginView(SocialLoginView):
    """
    Exchanges a Google OAuth2 `code` (obtained by the frontend via Google's
    consent screen) for an authenticated session, returning our own JWT
    pair. POST body: {"code": "..."}.
    """

    adapter_class = GoogleOAuth2Adapter
    client_class = OAuth2Client
    callback_url = settings.GOOGLE_OAUTH_CALLBACK_URL


class MicrosoftLoginView(SocialLoginView):
    """Same flow as GoogleLoginView, for Microsoft/Azure AD OAuth2."""

    adapter_class = MicrosoftGraphOAuth2Adapter
    client_class = OAuth2Client
    callback_url = settings.MICROSOFT_OAUTH_CALLBACK_URL


class PublicVendorDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/vendors/<id>/ — public profile for a vendor account
    (business_name/description/location/category_tags only). Backs the
    floor map's click-through for booths linked to a real account, and
    that vendor's own minimal public profile page. Any vendor account
    qualifies regardless of approval status — the map reflects who's
    physically at the show, not who's cleared to list online yet.
    """

    permission_classes = [AllowAny]
    serializer_class = PublicVendorSerializer
    queryset = User.objects.filter(role=User.Role.VENDOR)
