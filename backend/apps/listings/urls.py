from django.urls import path

from .views import ListingListCreateView, PublicListingListView

urlpatterns = [
    path("public/", PublicListingListView.as_view(), name="public-listing-list"),
    path("", ListingListCreateView.as_view(), name="listing-list-create"),
]
