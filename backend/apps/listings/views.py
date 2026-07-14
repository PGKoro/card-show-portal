from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated

from apps.core.permissions import IsApprovedVendor, IsVendor
from apps.users.models import User

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


class PublicVendorListingsView(generics.ListAPIView):
    """
    GET /api/v1/vendors/<id>/listings/ — a vendor's listings for their
    public profile page (floor map click-through). Unlike the vendor's
    own /api/v1/listings/, this is public and scoped to whichever vendor
    the URL names, not the requesting user.
    """

    permission_classes = [AllowAny]
    serializer_class = ListingSerializer

    def get_queryset(self):
        vendor = get_object_or_404(User, pk=self.kwargs["pk"], role=User.Role.VENDOR)
        return Listing.objects.filter(vendor=vendor)
