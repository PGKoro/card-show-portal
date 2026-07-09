from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from apps.core.permissions import IsApprovedVendor, IsVendor

from .models import Listing
from .serializers import ListingSerializer


class ListingListCreateView(generics.ListCreateAPIView):
    """
    GET /api/v1/listings/ — a vendor's own listings (even while still
    pending approval, so their dashboard has something to render).
    POST /api/v1/listings/ — create a listing; requires an *approved*
    vendor account (IsApprovedVendor), not just any vendor.
    """

    serializer_class = ListingSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsApprovedVendor()]
        return [IsAuthenticated(), IsVendor()]

    def get_queryset(self):
        return Listing.objects.filter(vendor=self.request.user)

    def perform_create(self, serializer):
        serializer.save(vendor=self.request.user)
