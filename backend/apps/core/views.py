from django.db import connection, transaction
from django.db.models import Max
from django.db.utils import OperationalError
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, HomeCarouselSlide, SiteSettings
from .permissions import IsAdminRole
from .serializers import (
    CategorySerializer,
    HomeCarouselSlideAdminSerializer,
    HomeCarouselSlidePublicSerializer,
    SiteSettingsSerializer,
)


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


class PublicHomeCarouselListView(generics.ListAPIView):
    """
    GET /api/v1/home-carousel/ — the live, admin-managed set of homepage
    hero images, in display order. Replaces what used to be a hardcoded
    HERO_IMAGES list in the frontend (app/page.tsx). Only ever returns
    active slides — an admin can hide a slide (see `active` on the model)
    without it briefly flashing on the homepage. No pagination, same
    reasoning as PublicCategoryListView: always short enough to render in
    full as a slideshow.
    """

    permission_classes = [AllowAny]
    serializer_class = HomeCarouselSlidePublicSerializer
    queryset = HomeCarouselSlide.objects.filter(active=True)
    pagination_class = None


class AdminHomeCarouselListCreateView(generics.ListCreateAPIView):
    """
    GET/POST /api/v1/admin/home-carousel/ — Manage Website's carousel
    editor: lists every slide (active or not) and accepts a new one.
    Multipart parsing since creating a slide always includes an image
    upload (see HomeCarouselSlideAdminSerializer.validate).
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = HomeCarouselSlideAdminSerializer
    queryset = HomeCarouselSlide.objects.all()
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser]

    def perform_create(self, serializer):
        # New slides always land at the end of the order — appending
        # rather than accepting a client-supplied order avoids collisions
        # with whatever's already there, same convention as
        # AdminCategoryListCreateView.perform_create.
        max_order = HomeCarouselSlide.objects.aggregate(Max("order"))["order__max"]
        next_order = 0 if max_order is None else max_order + 1
        serializer.save(order=next_order)


class AdminHomeCarouselDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    PATCH (caption/alt_text/link_url/active, optionally a replacement
    image) / DELETE /api/v1/admin/home-carousel/<id>/. DELETE refuses to
    remove the last remaining slide — the homepage carousel has to always
    have at least one image rather than silently disappearing (see
    perform_destroy).
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = HomeCarouselSlideAdminSerializer
    queryset = HomeCarouselSlide.objects.all()
    parser_classes = [MultiPartParser, FormParser]

    def perform_destroy(self, instance):
        if HomeCarouselSlide.objects.count() <= 1:
            raise ValidationError(
                {"detail": "Can't delete the last carousel image — upload a replacement first."}
            )
        instance.delete()


class AdminHomeCarouselReorderView(APIView):
    """
    POST /api/v1/admin/home-carousel/reorder/ — bulk-applies a full new
    ordering in one request, backing the carousel editor's drag-and-drop +
    "Save changes" flow (rather than firing one request per position
    change), same shape as AdminCategoryReorderView. Body:
    {"order": [id, id, ...]} — every existing slide id, exactly once, in
    the desired display order.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        new_order = request.data.get("order")
        if not isinstance(new_order, list):
            return Response({"order": ["Must be a list of slide ids."]}, status=400)

        existing_ids = set(HomeCarouselSlide.objects.values_list("id", flat=True))
        if set(new_order) != existing_ids or len(new_order) != len(existing_ids):
            return Response(
                {"order": ["Must contain every existing slide id exactly once."]}, status=400
            )

        with transaction.atomic():
            for index, slide_id in enumerate(new_order):
                HomeCarouselSlide.objects.filter(pk=slide_id).update(order=index)

        return Response(
            HomeCarouselSlideAdminSerializer(
                HomeCarouselSlide.objects.all(), many=True, context={"request": request}
            ).data
        )


class PublicSiteSettingsView(APIView):
    """
    GET /api/v1/settings/ — the small set of site-wide toggles the public
    frontend needs to render correctly (currently just
    articles_tab_enabled, read by NavBar/Footer to decide whether to show
    the Articles link). Always returns the singleton row, creating it
    with defaults on first request if it doesn't exist yet (see
    SiteSettings.load) — so a fresh environment doesn't need a manual
    seed step before the site works.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(SiteSettingsSerializer(SiteSettings.load()).data)


class AdminSiteSettingsView(APIView):
    """
    GET/PATCH /api/v1/admin/settings/ — Manage Website's toggles section.
    PATCH accepts a partial update (just the fields being changed), same
    as any other admin PATCH endpoint.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        return Response(SiteSettingsSerializer(SiteSettings.load()).data)

    def patch(self, request):
        settings_obj = SiteSettings.load()
        serializer = SiteSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
