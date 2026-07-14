from django.urls import path

from .views import (
    BoothAssignmentDetailView,
    BoothAssignmentListCreateView,
    EventDetailView,
    EventListCreateView,
    EventMapImageUploadView,
    EventMapPresetView,
    EventMapView,
    MapSectionDetailView,
    MapSectionListCreateView,
)

urlpatterns = [
    path("", EventListCreateView.as_view(), name="event-list-create"),
    path("<int:pk>/", EventDetailView.as_view(), name="event-detail"),
    path("<int:pk>/map/", EventMapView.as_view(), name="event-map"),
    path("<int:pk>/map-image/", EventMapImageUploadView.as_view(), name="event-map-image-upload"),
    path("<int:pk>/map-preset/", EventMapPresetView.as_view(), name="event-map-preset"),
    path("<int:pk>/booths/", BoothAssignmentListCreateView.as_view(), name="event-booths"),
    path("booths/<int:pk>/", BoothAssignmentDetailView.as_view(), name="booth-detail"),
    path("<int:pk>/sections/", MapSectionListCreateView.as_view(), name="event-sections"),
    path("sections/<int:pk>/", MapSectionDetailView.as_view(), name="section-detail"),
]
