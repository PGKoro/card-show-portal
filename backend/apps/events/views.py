from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAdminRole
from apps.users.models import User

from .models import MAP_IMAGE_PRESET_KEYS, BoothAssignment, Event
from .serializers import BoothAssignmentSerializer, EventMapSerializer, EventSerializer


class EventListCreateView(generics.ListCreateAPIView):
    """
    GET /api/v1/events/ — public, every event (frontend splits
    upcoming/past by `status`). Supports ?search= (name/venue/city),
    used by the admin "Manage Events" tool — the public browse pages don't
    pass it. POST — admin-only, create a new event.
    """

    serializer_class = EventSerializer

    def get_queryset(self):
        queryset = Event.objects.all()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(venue__icontains=search) | Q(city__icontains=search)
            )
        return queryset

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsAdminRole()]
        return [AllowAny()]


class EventDetailView(generics.RetrieveUpdateAPIView):
    """
    GET /api/v1/events/<id>/ — public. PATCH — admin-only; this is also
    how the floor map's visibility toggle is set (`map_visible` is a
    normal field on EventSerializer).
    """

    queryset = Event.objects.all()
    serializer_class = EventSerializer

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT"):
            return [IsAuthenticated(), IsAdminRole()]
        return [AllowAny()]


class EventMapImageUploadView(APIView):
    """
    POST /api/v1/events/<id>/map-image/ — admin uploads or replaces a
    show's floor-plan image. Separate from the general event PATCH since
    it needs multipart parsing instead of JSON.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        image = request.FILES.get("map_image")
        if not image:
            return Response({"map_image": ["This field is required."]}, status=400)
        event.map_image = image
        # A real upload always wins over a previously-chosen preset.
        event.map_image_preset = ""
        event.save(update_fields=["map_image", "map_image_preset"])
        return Response(EventMapSerializer(event, context={"request": request}).data)


class EventMapPresetView(APIView):
    """
    POST /api/v1/events/<id>/map-preset/ — admin picks one of the generic
    layout diagrams (MAP_IMAGE_PRESET_KEYS) as a stand-in floor map for
    venues that can't provide a real one. Clears any previously-uploaded
    real image, mirroring how uploading a real image clears a preset.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        preset = request.data.get("preset")
        if preset not in MAP_IMAGE_PRESET_KEYS:
            return Response(
                {"preset": [f"Must be one of: {', '.join(MAP_IMAGE_PRESET_KEYS)}."]}, status=400
            )
        event.map_image_preset = preset
        event.map_image = None
        event.save(update_fields=["map_image", "map_image_preset"])
        return Response(EventMapSerializer(event, context={"request": request}).data)


class EventMapView(APIView):
    """
    GET /api/v1/events/<id>/map/ — the map image (real upload or chosen
    preset) plus every booth on it.

    Admins always see it (so they can preview the map/booths before
    flipping map_visible on). Everyone else only sees it once map_visible
    is True *and* a map surface actually exists (real image or preset) —
    otherwise this 404s exactly like a nonexistent event, so the response
    never reveals whether a map exists or is just hidden.
    """

    permission_classes = [AllowAny]

    def get(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        user = request.user
        is_admin = user.is_authenticated and (user.is_superuser or user.role == User.Role.ADMIN)
        has_map = bool(event.map_image or event.map_image_preset)
        if not has_map or (not is_admin and not event.map_visible):
            raise Http404
        return Response(EventMapSerializer(event, context={"request": request}).data)


class BoothAssignmentListCreateView(generics.ListCreateAPIView):
    """
    GET/POST /api/v1/events/<id>/booths/ — admin-only listing/placement of
    booth markers for one event. Booth data itself is otherwise only
    exposed publicly through the gated EventMapView above.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = BoothAssignmentSerializer

    def get_event(self):
        return get_object_or_404(Event, pk=self.kwargs["pk"])

    def get_queryset(self):
        return BoothAssignment.objects.filter(event=self.get_event())

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["event"] = self.get_event()
        return context

    def perform_create(self, serializer):
        serializer.save(event=self.get_event())


class BoothAssignmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/v1/events/booths/<id>/ — admin-only edit
    (reposition/resize/reassign) or removal of a single booth marker.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = BoothAssignmentSerializer
    queryset = BoothAssignment.objects.all()
