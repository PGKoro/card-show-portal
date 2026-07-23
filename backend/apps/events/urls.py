from django.urls import path

from .views import (
    BoothRegistrationDetailView,
    BoothRegistrationListCreateView,
    ConfirmBoothRegistrationView,
    DeclineBoothRegistrationView,
    EventDetailView,
    EventListCreateView,
    EventMapView,
    MyBoothRegistrationListView,
    PendingBoothRegistrationListView,
    VendorEventBoothsView,
    VendorReleaseBoothView,
    VendorSelectBoothView,
)

urlpatterns = [
    path("", EventListCreateView.as_view(), name="event-list-create"),
    path("<int:pk>/", EventDetailView.as_view(), name="event-detail"),
    path("<int:pk>/map/", EventMapView.as_view(), name="event-map"),
    path(
        "<int:pk>/registrations/",
        BoothRegistrationListCreateView.as_view(),
        name="event-registrations",
    ),
    path(
        "registrations/pending/",
        PendingBoothRegistrationListView.as_view(),
        name="registrations-pending",
    ),
    path(
        "registrations/mine/",
        MyBoothRegistrationListView.as_view(),
        name="registrations-mine",
    ),
    path(
        "registrations/<int:pk>/",
        BoothRegistrationDetailView.as_view(),
        name="registration-detail",
    ),
    path(
        "registrations/<int:pk>/confirm/",
        ConfirmBoothRegistrationView.as_view(),
        name="registration-confirm",
    ),
    path(
        "registrations/<int:pk>/decline/",
        DeclineBoothRegistrationView.as_view(),
        name="registration-decline",
    ),
    path(
        "registrations/<int:pk>/release/",
        VendorReleaseBoothView.as_view(),
        name="registration-release",
    ),
    path("<int:pk>/vendor-booths/", VendorEventBoothsView.as_view(), name="event-vendor-booths"),
    path(
        "<int:pk>/booths/<int:booth_id>/select/",
        VendorSelectBoothView.as_view(),
        name="event-booth-select",
    ),
]
