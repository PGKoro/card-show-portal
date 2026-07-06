from django.contrib import admin
from django.urls import include, path

from apps.users.views import GoogleLoginView, MicrosoftLoginView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Health check + future first-party API endpoints.
    path("api/v1/", include("apps.core.urls")),
    # Email/password auth (login, logout, password reset) + registration,
    # both returning JWTs via dj-rest-auth.
    path("api/v1/auth/", include("dj_rest_auth.urls")),
    path("api/v1/auth/registration/", include("dj_rest_auth.registration.urls")),
    path("api/v1/auth/google/", GoogleLoginView.as_view(), name="google-login"),
    path("api/v1/auth/microsoft/", MicrosoftLoginView.as_view(), name="microsoft-login"),
    # allauth's own URLs, needed internally for the OAuth handshake and
    # account email flows even though the frontend never renders them.
    path("accounts/", include("allauth.urls")),
]
