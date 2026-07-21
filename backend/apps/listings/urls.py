from django.urls import path

from .views import ListingListCreateView, PublicListingDetailView, PublicListingListView

urlpatterns = [
    path("public/", PublicListingListView.as_view(), name="public-listing-list"),
    path("public/<int:pk>/", PublicListingDetailView.as_view(), name="public-listing-detail"),
    path("", ListingListCreateView.as_view(), name="listing-list-create"),
]
