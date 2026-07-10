from django.contrib import admin
from django.urls import include, path

from apps.users.views import (
    AdminUserDetailView,
    AdminUserSearchView,
    ApproveVendorView,
    GoogleLoginView,
    MicrosoftLoginView,
    OnboardingDetailsView,
    OnboardingView,
    PendingVendorListView,
    ProfileView,
    RejectVendorView,
    SetUserRoleView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    # Health check + future first-party API endpoints.
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/listings/", include("apps.listings.urls")),
    path("api/v1/events/", include("apps.events.urls")),
    # Email/password auth (login, logout, password reset) + registration,
    # both returning JWTs via dj-rest-auth.
    path("api/v1/auth/", include("dj_rest_auth.urls")),
    path("api/v1/auth/registration/", include("dj_rest_auth.registration.urls")),
    path("api/v1/auth/onboarding/", OnboardingView.as_view(), name="onboarding"),
    path(
        "api/v1/auth/onboarding/details/",
        OnboardingDetailsView.as_view(),
        name="onboarding-details",
    ),
    path("api/v1/auth/profile/", ProfileView.as_view(), name="profile"),
    path("api/v1/auth/google/", GoogleLoginView.as_view(), name="google-login"),
    path("api/v1/auth/microsoft/", MicrosoftLoginView.as_view(), name="microsoft-login"),
    # Admin vendor approval.
    path(
        "api/v1/admin/vendors/pending/",
        PendingVendorListView.as_view(),
        name="pending-vendors",
    ),
    path(
        "api/v1/admin/vendors/<int:pk>/approve/",
        ApproveVendorView.as_view(),
        name="approve-vendor",
    ),
    path(
        "api/v1/admin/vendors/<int:pk>/reject/",
        RejectVendorView.as_view(),
        name="reject-vendor",
    ),
    # Admin user management (search + change a user's role).
    path("api/v1/admin/users/", AdminUserSearchView.as_view(), name="admin-user-search"),
    path("api/v1/admin/users/<int:pk>/", AdminUserDetailView.as_view(), name="admin-user-detail"),
    path(
        "api/v1/admin/users/<int:pk>/set-role/",
        SetUserRoleView.as_view(),
        name="set-user-role",
    ),
    # allauth's own URLs, needed internally for the OAuth handshake and
    # account email flows even though the frontend never renders them.
    path("accounts/", include("allauth.urls")),
]
