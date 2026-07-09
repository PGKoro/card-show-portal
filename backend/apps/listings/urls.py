from django.urls import path

from .views import ListingListCreateView

urlpatterns = [
    path("", ListingListCreateView.as_view(), name="listing-list-create"),
]
