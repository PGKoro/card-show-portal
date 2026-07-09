from django.db.models import Q
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated

from apps.core.permissions import IsAdminRole

from .models import Event
from .serializers import EventSerializer


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
    """GET /api/v1/events/<id>/ — public. PATCH — admin-only."""

    queryset = Event.objects.all()
    serializer_class = EventSerializer

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT"):
            return [IsAuthenticated(), IsAdminRole()]
        return [AllowAny()]
