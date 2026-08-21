from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.articles.views import (
    AdminArticleArchiveView,
    AdminArticleDetailView,
    AdminArticleListCreateView,
    AdminArticlePublishView,
    AdminArticleRestoreView,
    AdminArticleUnpublishView,
)
from apps.core.views import (
    AdminCategoryDetailView,
    AdminCategoryListCreateView,
    AdminCategoryReorderView,
    AdminHomeCarouselDetailView,
    AdminHomeCarouselListCreateView,
    AdminHomeCarouselReorderView,
    AdminSiteSettingsView,
)
from apps.listings.views import PublicVendorListingsView
from apps.users.views import (
    AdminCreateUserView,
    AdminGlobalNoteDetailView,
    AdminGlobalNoteHistoryView,
    AdminUserDetailView,
    AdminUserImpersonateView,
    AdminUserNoteDetailView,
    AdminUserNoteHistoryView,
    AdminUserSearchView,
    ApproveVendorView,
    ArchiveUserView,
    FlagUserView,
    GoogleLoginView,
    MicrosoftLoginView,
    OnboardingDetailsView,
    OnboardingView,
    PendingVendorListView,
    ProfileView,
    PublicVendorDetailView,
    PublicVendorListView,
    RejectVendorView,
    RestoreUserView,
    SetUserRoleView,
    SetVendorTierView,
    ThrottledLoginView,
    ThrottledPasswordResetView,
    ThrottledRegisterView,
    UnflagUserView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    # Health check + future first-party API endpoints.
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/listings/", include("apps.listings.urls")),
    path("api/v1/events/", include("apps.events.urls")),
    path("api/v1/venues/", include("apps.events.venue_urls")),
    path("api/v1/articles/", include("apps.articles.urls")),
    # Rate-limited overrides for the three sensitive auth endpoints — placed
    # ahead of the dj_rest_auth includes below so these match first (same
    # path, first pattern wins). Everything else dj_rest_auth.urls handles
    # (logout, token refresh/verify, password change, user details) doesn't
    # need the stricter throttle, since it requires an existing valid session.
    path("api/v1/auth/login/", ThrottledLoginView.as_view(), name="rest_login"),
    path(
        "api/v1/auth/password/reset/",
        ThrottledPasswordResetView.as_view(),
        name="rest_password_reset",
    ),
    path(
        "api/v1/auth/registration/",
        ThrottledRegisterView.as_view(),
        name="rest_register",
    ),
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
    # Admin category management (create/rename/delete/reorder the shared
    # category vocabulary — see apps.core.models.Category).
    path(
        "api/v1/admin/categories/",
        AdminCategoryListCreateView.as_view(),
        name="admin-category-list-create",
    ),
    path(
        "api/v1/admin/categories/reorder/",
        AdminCategoryReorderView.as_view(),
        name="admin-category-reorder",
    ),
    path(
        "api/v1/admin/categories/<int:pk>/",
        AdminCategoryDetailView.as_view(),
        name="admin-category-detail",
    ),
    # Admin homepage carousel management (see apps.core.models.HomeCarouselSlide).
    path(
        "api/v1/admin/home-carousel/",
        AdminHomeCarouselListCreateView.as_view(),
        name="admin-home-carousel-list-create",
    ),
    path(
        "api/v1/admin/home-carousel/reorder/",
        AdminHomeCarouselReorderView.as_view(),
        name="admin-home-carousel-reorder",
    ),
    path(
        "api/v1/admin/home-carousel/<int:pk>/",
        AdminHomeCarouselDetailView.as_view(),
        name="admin-home-carousel-detail",
    ),
    # Admin site settings (Manage Website's toggles, e.g. the Articles nav
    # tab — see apps.core.models.SiteSettings).
    path(
        "api/v1/admin/settings/",
        AdminSiteSettingsView.as_view(),
        name="admin-site-settings",
    ),
    # Admin article management (Article Creator — see apps.articles.models.Article).
    path(
        "api/v1/admin/articles/",
        AdminArticleListCreateView.as_view(),
        name="admin-article-list-create",
    ),
    path(
        "api/v1/admin/articles/<int:pk>/",
        AdminArticleDetailView.as_view(),
        name="admin-article-detail",
    ),
    path(
        "api/v1/admin/articles/<int:pk>/publish/",
        AdminArticlePublishView.as_view(),
        name="admin-article-publish",
    ),
    path(
        "api/v1/admin/articles/<int:pk>/unpublish/",
        AdminArticleUnpublishView.as_view(),
        name="admin-article-unpublish",
    ),
    path(
        "api/v1/admin/articles/<int:pk>/archive/",
        AdminArticleArchiveView.as_view(),
        name="admin-article-archive",
    ),
    path(
        "api/v1/admin/articles/<int:pk>/restore/",
        AdminArticleRestoreView.as_view(),
        name="admin-article-restore",
    ),
    # Admin user management (search + change a user's role + create/archive/
    # restore/delete accounts directly).
    path("api/v1/admin/users/", AdminUserSearchView.as_view(), name="admin-user-search"),
    path(
        "api/v1/admin/notes/history/",
        AdminGlobalNoteHistoryView.as_view(),
        name="admin-global-note-history",
    ),
    path(
        "api/v1/admin/notes/history/<int:note_id>/",
        AdminGlobalNoteDetailView.as_view(),
        name="admin-global-note-detail",
    ),
    path(
        "api/v1/admin/users/create/",
        AdminCreateUserView.as_view(),
        name="admin-user-create",
    ),
    path("api/v1/admin/users/<int:pk>/", AdminUserDetailView.as_view(), name="admin-user-detail"),
    path(
        "api/v1/admin/users/<int:pk>/set-role/",
        SetUserRoleView.as_view(),
        name="set-user-role",
    ),
    path(
        "api/v1/admin/users/<int:pk>/set-tier/",
        SetVendorTierView.as_view(),
        name="set-vendor-tier",
    ),
    path(
        "api/v1/admin/users/<int:pk>/archive/",
        ArchiveUserView.as_view(),
        name="archive-user",
    ),
    path(
        "api/v1/admin/users/<int:pk>/restore/",
        RestoreUserView.as_view(),
        name="restore-user",
    ),
    path(
        "api/v1/admin/users/<int:pk>/flag/",
        FlagUserView.as_view(),
        name="flag-user",
    ),
    path(
        "api/v1/admin/users/<int:pk>/unflag/",
        UnflagUserView.as_view(),
        name="unflag-user",
    ),
    path(
        "api/v1/admin/users/<int:pk>/history/",
        AdminUserNoteHistoryView.as_view(),
        name="admin-user-note-history",
    ),
    path(
        "api/v1/admin/users/<int:pk>/history/<int:note_id>/",
        AdminUserNoteDetailView.as_view(),
        name="admin-user-note-detail",
    ),
    path(
        "api/v1/admin/users/<int:pk>/impersonate/",
        AdminUserImpersonateView.as_view(),
        name="admin-user-impersonate",
    ),

    # the homepage's "Featured vendors").
    path("api/v1/vendors/", PublicVendorListView.as_view(), name="public-vendor-list"),
    # Public vendor profile (business info + their listings) — backs the
    # floor map's click-through for booths linked to a real account.
    path("api/v1/vendors/<int:pk>/", PublicVendorDetailView.as_view(), name="public-vendor-detail"),
    path(
        "api/v1/vendors/<int:pk>/listings/",
        PublicVendorListingsView.as_view(),
        name="public-vendor-listings",
    ),
    # allauth's own URLs, needed internally for the OAuth handshake and
    # account email flows even though the frontend never renders them.
    path("accounts/", include("allauth.urls")),
]

# User-uploaded media (event floor maps) — served directly by the dev
# server. Production would need a real storage/CDN backend instead; out of
# scope for this project (local Docker only, no Supabase/cloud infra).
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
