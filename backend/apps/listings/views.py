from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated

from apps.core.permissions import IsApprovedVendor, IsVendor
from apps.users.models import User

from .models import Listing
from .serializers import ListingSerializer, PublicListingSerializer


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


class PublicListingListView(generics.ListAPIView):
    """
    GET /api/v1/listings/public/ — cross-vendor public feed (backs the
    homepage's "Recent listings" and the /cards browse page). Scoped to
    approved vendors only, same reasoning as PublicVendorListView — a
    listing from a still-pending vendor shouldn't appear in public browsing.
    """

    permission_classes = [AllowAny]
    serializer_class = PublicListingSerializer

    def get_queryset(self):
        queryset = Listing.objects.select_related("vendor").filter(
            vendor__role=User.Role.VENDOR,
            vendor__vendor_status=User.VendorStatus.APPROVED,
        )
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) | Q(description__icontains=search)
            )
        category = self.request.query_params.get("category", "").strip()
        if category:
            queryset = queryset.filter(category=category)
        return queryset


class PublicListingDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/listings/public/<id>/ — a single listing's own page (backs
    the "click a card" flow from the homepage/Browse Cards feeds, which
    used to dead-end on the vendor's whole inventory instead of the actual
    card). Same approved-vendor scoping as PublicListingListView.
    """

    permission_classes = [AllowAny]
    serializer_class = PublicListingSerializer

    def get_queryset(self):
        return Listing.objects.select_related("vendor").filter(
            vendor__role=User.Role.VENDOR,
            vendor__vendor_status=User.VendorStatus.APPROVED,
        )
