from django.urls import path

from .views import (
    BoothAssignmentDetailView,
    BoothAssignmentListCreateView,
    EventDetailView,
    EventListCreateView,
    EventMapImageUploadView,
    EventMapPresetView,
    EventMapView,
)

urlpatterns = [
    path("", EventListCreateView.as_view(), name="event-list-create"),
    path("<int:pk>/", EventDetailView.as_view(), name="event-detail"),
    path("<int:pk>/map/", EventMapView.as_view(), name="event-map"),
    path("<int:pk>/map-image/", EventMapImageUploadView.as_view(), name="event-map-image-upload"),
    path("<int:pk>/map-preset/", EventMapPresetView.as_view(), name="event-map-preset"),
    path("<int:pk>/booths/", BoothAssignmentListCreateView.as_view(), name="event-booths"),
    path("booths/<int:pk>/", BoothAssignmentDetailView.as_view(), name="booth-detail"),
]
