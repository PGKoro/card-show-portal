from django.urls import path

from .views import (
    HealthCheckView,
    PublicCategoryListView,
    PublicHomeCarouselListView,
    PublicSiteSettingsView,
)

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("categories/", PublicCategoryListView.as_view(), name="category-list"),
    path("home-carousel/", PublicHomeCarouselListView.as_view(), name="home-carousel-list"),
    path("settings/", PublicSiteSettingsView.as_view(), name="public-site-settings"),
]
