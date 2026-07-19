from django.urls import path

from .views import (
    BoothDetailView,
    BoothListCreateView,
    VenueDetailView,
    VenueListCreateView,
    VenueMapImageUploadView,
    VenueMapPresetView,
    VenueMapView,
    VenueSectionDetailView,
    VenueSectionListCreateView,
)

urlpatterns = [
    path("", VenueListCreateView.as_view(), name="venue-list-create"),
    path("<int:pk>/", VenueDetailView.as_view(), name="venue-detail"),
    path("<int:pk>/map/", VenueMapView.as_view(), name="venue-map"),
    path("<int:pk>/map-image/", VenueMapImageUploadView.as_view(), name="venue-map-image-upload"),
    path("<int:pk>/map-preset/", VenueMapPresetView.as_view(), name="venue-map-preset"),
    path("<int:pk>/booths/", BoothListCreateView.as_view(), name="venue-booths"),
    path("booths/<int:pk>/", BoothDetailView.as_view(), name="venue-booth-detail"),
    path("<int:pk>/sections/", VenueSectionListCreateView.as_view(), name="venue-sections"),
    path("sections/<int:pk>/", VenueSectionDetailView.as_view(), name="venue-section-detail"),
]
