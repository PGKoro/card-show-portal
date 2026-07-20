from django.db import connection, transaction
from django.db.models import Max
from django.db.utils import OperationalError
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category
from .permissions import IsAdminRole
from .serializers import CategorySerializer


class HealthCheckView(APIView):
    """Confirms the app is up and can talk to the database."""

    permission_classes = [AllowAny]

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            database_ok = True
        except OperationalError:
            database_ok = False

        status_code = 200 if database_ok else 503
        return Response(
            {"status": "ok" if database_ok else "error", "database": database_ok},
            status=status_code,
        )


class PublicCategoryListView(generics.ListAPIView):
    """
    GET /api/v1/categories/ — the live, admin-managed category vocabulary,
    used everywhere a category needs to be picked or filtered on (vendor/
    customer onboarding, Browse Cards/Vendors, the Add Item form, venue
    floor-plan zones). No pagination — this list is always short enough to
    render in full (filter buttons, dropdowns, tag pickers).
    """

    permission_classes = [AllowAny]
    serializer_class = CategorySerializer
    queryset = Category.objects.all()
    pagination_class = None


class AdminCategoryListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/admin/categories/ — admin-only list/create."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = CategorySerializer
    queryset = Category.objects.all()
    pagination_class = None

    def perform_create(self, serializer):
        # New categories always land at the end of the order — appending
        # rather than accepting a client-supplied order avoids collisions
        # with whatever's already there. `or -1` would be wrong here: a
        # legitimate max order of 0 is falsy, so that must be an explicit
        # None check rather than a truthiness fallback.
        max_order = Category.objects.aggregate(Max("order"))["order__max"]
        next_order = 0 if max_order is None else max_order + 1
        serializer.save(order=next_order)


class AdminCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PATCH (name only) / DELETE /api/v1/admin/categories/<id>/."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = CategorySerializer
    queryset = Category.objects.all()


class AdminCategoryReorderView(APIView):
    """
    POST /api/v1/admin/categories/reorder/ — bulk-applies a full new
    ordering in one request, backing the Manage Categories page's
    drag-and-drop + "Save changes" flow (rather than firing one request
    per position change). Body: {"order": [id, id, ...]} — every existing
    Category id, exactly once, in the desired order.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        new_order = request.data.get("order")
        if not isinstance(new_order, list):
            return Response({"order": ["Must be a list of category ids."]}, status=400)

        existing_ids = set(Category.objects.values_list("id", flat=True))
        if set(new_order) != existing_ids or len(new_order) != len(existing_ids):
            return Response(
                {"order": ["Must contain every existing category id exactly once."]}, status=400
            )

        with transaction.atomic():
            for index, category_id in enumerate(new_order):
                Category.objects.filter(pk=category_id).update(order=index)

        return Response(CategorySerializer(Category.objects.all(), many=True).data)
