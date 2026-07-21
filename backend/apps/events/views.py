from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAdminRole, IsApprovedVendor
from apps.users.models import User

from .models import MAP_IMAGE_PRESET_KEYS, Booth, BoothRegistration, Event, Venue, VenueSection
from .serializers import (
    BoothRegistrationSerializer,
    BoothSerializer,
    EventMapSerializer,
    EventSerializer,
    PendingBoothRegistrationSerializer,
    VendorBoothSerializer,
    VenueMapSerializer,
    VenueSectionSerializer,
    VenueSerializer,
)
from .services import create_loyalty_holds


class EventListCreateView(generics.ListCreateAPIView):
    """
    GET /api/v1/events/ — public, every event. Supports ?search=
    (name/venue/city) and ?status=upcoming|past so the admin "Manage
    Events" page can split upcoming and completed events cleanly.
    POST — admin-only, create a new event.
    """

    serializer_class = EventSerializer

    def get_queryset(self):
        queryset = Event.objects.all()
        search = self.request.query_params.get("search", "").strip()
        status = self.request.query_params.get("status", "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(venue__icontains=search) | Q(city__icontains=search)
            )
        if status in {"upcoming", "past", "archived"}:
            today = timezone.localdate()
            if status == "upcoming":
                queryset = queryset.filter(archived=False).filter(
                    Q(end_date__isnull=True, start_date__gte=today)
                    | Q(end_date__gte=today)
                )
            elif status == "past":
                queryset = queryset.filter(archived=False).filter(
                    Q(end_date__isnull=True, start_date__lt=today)
                    | Q(end_date__lt=today)
                )
            else:
                queryset = queryset.filter(archived=True)
        return queryset

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsAdminRole()]
        return [AllowAny()]


class EventDetailView(generics.RetrieveUpdateAPIView):
    """
    GET /api/v1/events/<id>/ — public. PATCH — admin-only; this is also how
    the floor map's visibility toggles, venue link, and loyalty deadline
    are set (all normal fields on EventSerializer).
    """

    queryset = Event.objects.all()
    serializer_class = EventSerializer

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT"):
            return [IsAuthenticated(), IsAdminRole()]
        return [AllowAny()]

    def perform_update(self, serializer):
        event = serializer.save()
        # Idempotent (see services.create_loyalty_holds) — cheap to call on
        # every PATCH rather than trying to detect exactly which field
        # changed.
        create_loyalty_holds(event)


class EventMapView(APIView):
    """
    GET /api/v1/events/<id>/map/ — the venue's map image (real upload or
    chosen preset) plus every confirmed booth on it for this event.

    Admins always see it (so they can preview before making it public).
    Everyone else only sees it once map_visible is True *and* the event has
    a venue with an actual map surface (real image or preset) — otherwise
    this 404s exactly like a nonexistent event, so the response never
    reveals whether a map exists or is just hidden.
    """

    permission_classes = [AllowAny]

    def get(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        user = request.user
        is_admin = user.is_authenticated and (user.is_superuser or user.role == User.Role.ADMIN)
        venue = event.map_venue
        has_map = bool(venue and (venue.map_image or venue.map_image_preset))
        if not has_map or (not is_admin and not event.map_visible):
            raise Http404
        return Response(EventMapSerializer(event, context={"request": request}).data)


class VenueListCreateView(generics.ListCreateAPIView):
    """
    GET/POST /api/v1/venues/ — admin-only listing/creation of venues.
    Supports ?search= (name/city) so the venue picker stays usable once
    there are more than a handful of venues.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = VenueSerializer

    def get_queryset(self):
        queryset = Venue.objects.all()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(city__icontains=search))
        return queryset


class VenueDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/v1/venues/<id>/ — admin-only (rename, remove)."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = VenueSerializer
    queryset = Venue.objects.all()


class VenueMapView(APIView):
    """
    GET /api/v1/venues/<id>/map/ — admin-only view of a venue's floor plan
    (image/preset + every booth/section on it), backing the floor-plan
    editor. Unlike EventMapView, there's no public-visibility gate here —
    a Venue is never exposed directly to the public, only indirectly
    through an event's gated /map/ endpoint.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request, pk):
        venue = get_object_or_404(Venue, pk=pk)
        return Response(VenueMapSerializer(venue, context={"request": request}).data)


class VenueMapImageUploadView(APIView):
    """
    POST /api/v1/venues/<id>/map-image/ — admin uploads or replaces a
    venue's floor-plan image. Separate from the general venue PATCH since
    it needs multipart parsing instead of JSON.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        venue = get_object_or_404(Venue, pk=pk)
        image = request.FILES.get("map_image")
        if not image:
            return Response({"map_image": ["This field is required."]}, status=400)
        venue.map_image = image
        # A real upload always wins over a previously-chosen preset.
        venue.map_image_preset = ""
        venue.save(update_fields=["map_image", "map_image_preset"])
        return Response(VenueMapSerializer(venue, context={"request": request}).data)


class VenueMapPresetView(APIView):
    """
    POST /api/v1/venues/<id>/map-preset/ — admin picks one of the generic
    layout diagrams (MAP_IMAGE_PRESET_KEYS) as a stand-in floor map for
    venues that can't provide a real one. Clears any previously-uploaded
    real image, mirroring how uploading a real image clears a preset.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        venue = get_object_or_404(Venue, pk=pk)
        preset = request.data.get("preset")
        if preset not in MAP_IMAGE_PRESET_KEYS:
            return Response(
                {"preset": [f"Must be one of: {', '.join(MAP_IMAGE_PRESET_KEYS)}."]}, status=400
            )
        venue.map_image_preset = preset
        venue.map_image = None
        venue.save(update_fields=["map_image", "map_image_preset"])
        return Response(VenueMapSerializer(venue, context={"request": request}).data)


class BoothListCreateView(generics.ListCreateAPIView):
    """
    GET/POST /api/v1/venues/<id>/booths/ — admin-only listing/placement of
    physical booth slots on a venue's floor plan. Persists across every
    event held at that venue — see BoothRegistration for per-event claims.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = BoothSerializer

    def get_venue(self):
        return get_object_or_404(Venue, pk=self.kwargs["pk"])

    def get_queryset(self):
        return Booth.objects.filter(venue=self.get_venue())

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["venue"] = self.get_venue()
        return context

    def perform_create(self, serializer):
        serializer.save(venue=self.get_venue())


class BoothDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/v1/venues/booths/<id>/ — admin-only edit
    (reposition/resize/reprice) or removal of a single booth slot.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = BoothSerializer
    queryset = Booth.objects.all()


class VenueSectionListCreateView(generics.ListCreateAPIView):
    """
    GET/POST /api/v1/venues/<id>/sections/ — admin-only listing/placement
    of category-zone overlays on a venue's floor plan. Publicly exposed
    (read-only, no sensitive data) via EventMapView/EventMapSerializer.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = VenueSectionSerializer

    def get_venue(self):
        return get_object_or_404(Venue, pk=self.kwargs["pk"])

    def get_queryset(self):
        return VenueSection.objects.filter(venue=self.get_venue())

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["venue"] = self.get_venue()
        return context

    def perform_create(self, serializer):
        serializer.save(venue=self.get_venue())


class VenueSectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/v1/venues/sections/<id>/ — admin-only edit
    (reposition/resize/recategorize) or removal of a single category zone.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = VenueSectionSerializer
    queryset = VenueSection.objects.all()


class BoothRegistrationListCreateView(generics.ListCreateAPIView):
    """
    GET/POST /api/v1/events/<id>/registrations/ — admin-only listing of
    every booth claim for an event (any status — pending requests, loyalty
    holds, confirmed, declined/released history) and the legacy "admin
    directly assigns a vendor to a booth" workflow (defaults new rows to
    status=confirmed, standing in for the pre-self-service behavior).
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = BoothRegistrationSerializer

    def get_event(self):
        return get_object_or_404(Event, pk=self.kwargs["pk"])

    def get_queryset(self):
        return BoothRegistration.objects.filter(event=self.get_event()).select_related(
            "booth", "vendor"
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["event"] = self.get_event()
        return context


class BoothRegistrationDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/v1/events/registrations/<id>/ — admin-only edit
    (reassign vendor) or removal of a single registration. Prefer the
    dedicated confirm/decline actions below for status changes.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = BoothRegistrationSerializer
    queryset = BoothRegistration.objects.all()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["event"] = self.get_object().event
        return context


class BoothRegistrationDecisionView(APIView):
    """
    POST /api/v1/events/registrations/<id>/confirm/ or /decline/. `decision`
    is fixed per-URL (see urls.py) rather than taken from the request body,
    matching apps.users.views.VendorDecisionView's reasoning — an admin
    can't confirm/decline the wrong registration by mistyping a field.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    decision = None

    def post(self, request, pk):
        registration = get_object_or_404(BoothRegistration, pk=pk)
        registration.status = self.decision
        registration.decided_at = timezone.now()
        registration.save(update_fields=["status", "decided_at"])
        return Response(BoothRegistrationSerializer(registration).data)


class ConfirmBoothRegistrationView(BoothRegistrationDecisionView):
    decision = BoothRegistration.Status.CONFIRMED


class DeclineBoothRegistrationView(BoothRegistrationDecisionView):
    decision = BoothRegistration.Status.DECLINED


class PendingBoothRegistrationListView(generics.ListAPIView):
    """
    GET /api/v1/events/registrations/pending/ — every booth request awaiting
    admin action, across every event, oldest first. Backs the site-wide
    "Booth Requests" admin tool and its pending-count badge on the Admin
    Tools hub (same pattern as PendingVendorListView).
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = PendingBoothRegistrationSerializer

    def get_queryset(self):
        return (
            BoothRegistration.objects.filter(status=BoothRegistration.Status.REQUESTED)
            .select_related("event", "booth", "vendor")
            .order_by("requested_at")
        )


def _is_expired_hold(registration, event):
    return (
        registration is not None
        and registration.status == BoothRegistration.Status.LOYALTY_HOLD
        and event.loyalty_priority_deadline is not None
        and timezone.now() > event.loyalty_priority_deadline
    )


class VendorEventBoothsView(APIView):
    """
    GET /api/v1/events/<id>/vendor-booths/ — the venue's map image/sections
    plus every booth, from the requesting vendor's point of view (available
    / theirs / someone else's / a loyalty hold they can claim). Gated on
    map_visible_to_vendors, independent of the public map_visible switch —
    a vendor needs the map image here too since map_visible might still be
    off while booth selection is open.
    """

    permission_classes = [IsAuthenticated, IsApprovedVendor]

    def get(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        if not event.map_venue_id or not event.map_visible_to_vendors:
            raise Http404
        venue = event.map_venue

        active_by_booth = {
            registration.booth_id: registration
            for registration in BoothRegistration.objects.filter(
                event=event, status__in=BoothRegistration.ACTIVE_STATUSES
            )
        }

        rows = []
        for booth in venue.booths.all():
            registration = active_by_booth.get(booth.id)
            expired = _is_expired_hold(registration, event)
            is_mine = bool(registration and registration.vendor_id == request.user.id)

            if registration is None or expired:
                availability = "available"
                registration_status = None
            elif registration.status == BoothRegistration.Status.LOYALTY_HOLD:
                availability = "loyalty_hold_mine" if is_mine else "loyalty_held"
                registration_status = registration.status
            elif is_mine:
                availability = "mine"
                registration_status = registration.status
            else:
                availability = "taken"
                registration_status = registration.status

            rows.append(
                {
                    "id": booth.id,
                    "booth_number": booth.booth_number,
                    "position_x": booth.position_x,
                    "position_y": booth.position_y,
                    "width": booth.width,
                    "height": booth.height,
                    "price": booth.price,
                    "availability": availability,
                    "is_mine": is_mine,
                    "registration_status": registration_status,
                    "registration_id": registration.id if is_mine and registration else None,
                }
            )

        map_image_url = None
        if venue.map_image:
            map_image_url = request.build_absolute_uri(venue.map_image.url)

        return Response(
            {
                "map_image_url": map_image_url,
                "map_image_preset": venue.map_image_preset,
                "loyalty_priority_deadline": event.loyalty_priority_deadline,
                "sections": VenueSectionSerializer(venue.sections.all(), many=True).data,
                "booths": VendorBoothSerializer(rows, many=True).data,
            }
        )


class VendorSelectBoothView(APIView):
    """
    POST /api/v1/events/<id>/booths/<booth_id>/select/ — a vendor requests
    a booth (or claims their own loyalty hold). Creates a `requested`
    registration either way — an admin still confirms it (standing in for
    "payment received" until real payment processing exists).
    """

    permission_classes = [IsAuthenticated, IsApprovedVendor]

    def post(self, request, pk, booth_id):
        event = get_object_or_404(Event, pk=pk)
        if not event.map_venue_id or not event.map_visible_to_vendors:
            raise Http404
        booth = get_object_or_404(Booth, pk=booth_id, venue_id=event.map_venue_id)

        existing = (
            BoothRegistration.objects.filter(
                event=event, booth=booth, status__in=BoothRegistration.ACTIVE_STATUSES
            )
            .order_by("-requested_at")
            .first()
        )

        if existing and not _is_expired_hold(existing, event):
            is_mine = existing.vendor_id == request.user.id
            if existing.status == BoothRegistration.Status.LOYALTY_HOLD:
                if is_mine:
                    # Claiming their own hold converts it into a normal
                    # request — still needs admin confirmation, same as
                    # anyone else's request.
                    existing.status = BoothRegistration.Status.REQUESTED
                    existing.save(update_fields=["status"])
                    return Response(BoothRegistrationSerializer(existing).data, status=201)
                return Response(
                    {
                        "detail": "This booth is being held for a returning vendor until "
                        f"{event.loyalty_priority_deadline:%b %d, %Y %I:%M %p}."
                    },
                    status=400,
                )
            if is_mine:
                return Response(
                    {"detail": "You already have a pending or confirmed request for this booth."},
                    status=400,
                )
            return Response({"detail": "This booth isn't available."}, status=400)

        if existing:
            # An expired, unclaimed loyalty hold — release it to free up
            # the (event, booth) slot before creating the new request.
            existing.status = BoothRegistration.Status.RELEASED
            existing.decided_at = timezone.now()
            existing.save(update_fields=["status", "decided_at"])

        registration = BoothRegistration.objects.create(
            event=event,
            booth=booth,
            vendor=request.user,
            status=BoothRegistration.Status.REQUESTED,
            price=booth.price,
        )
        return Response(BoothRegistrationSerializer(registration).data, status=201)


class VendorReleaseBoothView(APIView):
    """
    POST /api/v1/events/registrations/<id>/release/ — a vendor voluntarily
    gives up their own pending/confirmed/held booth, reopening it.
    """

    permission_classes = [IsAuthenticated, IsApprovedVendor]

    def post(self, request, pk):
        registration = get_object_or_404(
            BoothRegistration,
            pk=pk,
            vendor=request.user,
            status__in=BoothRegistration.ACTIVE_STATUSES,
        )
        registration.status = BoothRegistration.Status.RELEASED
        registration.decided_at = timezone.now()
        registration.save(update_fields=["status", "decided_at"])
        return Response(BoothRegistrationSerializer(registration).data)
