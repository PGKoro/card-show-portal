from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import DefaultPagination
from apps.core.permissions import IsAdminRole, IsApprovedVendor

from .models import Card, CardSet, CardSubmission, Company
from .serializers import (
    AdminCardSerializer,
    AdminCardSetSerializer,
    AdminCardSubmissionSerializer,
    CompanySerializer,
    DealerCardSubmissionCreateSerializer,
    PublicCardDetailSerializer,
    PublicCardListSerializer,
    PublicCardSetDetailSerializer,
    PublicCardSetListSerializer,
    SearchResultCardSerializer,
    SearchResultSetSerializer,
)


class SetPagination(DefaultPagination):
    """10 sets per page in Collections browsing, per the product spec —
    distinct from the site's general default (20) since a set tile is a
    heavier visual unit than a row in an admin table."""

    page_size = 10


# ---------------------------------------------------------------------------
# Guided browsing: Category -> Year -> Company -> Set -> Cards
# ---------------------------------------------------------------------------


class PublicCollectionsYearListView(APIView):
    """
    GET /api/v1/collections/years/?category=football — years that
    actually have at least one Set in this category, so the guided
    picker never shows an empty next step (per "do not show irrelevant
    empty choices").
    """

    permission_classes = [AllowAny]

    def get(self, request):
        category = request.query_params.get("category", "").strip()
        if not category:
            return Response({"category": ["This field is required."]}, status=400)
        years = (
            CardSet.objects.filter(category=category)
            .order_by("-year")
            .values_list("year", flat=True)
            .distinct()
        )
        return Response(list(years))


class PublicCollectionsCompanyListView(APIView):
    """
    GET /api/v1/collections/companies/?category=football&year=2020 —
    companies with at least one matching Set for this category+year.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        category = request.query_params.get("category", "").strip()
        year = request.query_params.get("year", "").strip()
        if not category or not year:
            return Response({"detail": "category and year are both required."}, status=400)
        companies = Company.objects.filter(sets__category=category, sets__year=year).distinct()
        return Response(CompanySerializer(companies, many=True).data)


class PublicCardSetListView(generics.ListAPIView):
    """
    GET /api/v1/collections/sets/?category=&year=&company=&search= — the
    paginated (10/page) set grid backing Collections browsing at every
    depth: category-only, category+year, or category+year+company, plus
    free-text search across set name/company/category. All filters are
    optional and combine with AND, so this one endpoint backs every step
    of the guided hierarchy instead of a different endpoint per depth.
    """

    permission_classes = [AllowAny]
    serializer_class = PublicCardSetListSerializer
    pagination_class = SetPagination

    def get_queryset(self):
        queryset = CardSet.objects.select_related("company").annotate(Count("cards")).order_by(
            "-year", "company__name", "name"
        )
        params = self.request.query_params
        category = params.get("category", "").strip()
        year = params.get("year", "").strip()
        company = params.get("company", "").strip()
        search = params.get("search", "").strip()
        if category:
            queryset = queryset.filter(category=category)
        if year:
            queryset = queryset.filter(year=year)
        if company:
            queryset = queryset.filter(company_id=company)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(company__name__icontains=search)
            )
        return queryset


class PublicCardSetDetailView(generics.RetrieveAPIView):
    """GET /api/v1/collections/sets/<id>/ — a set's own page header."""

    permission_classes = [AllowAny]
    serializer_class = PublicCardSetDetailSerializer
    queryset = CardSet.objects.select_related("company").annotate(Count("cards"))


class PublicSetCardListView(generics.ListAPIView):
    """
    GET /api/v1/collections/sets/<id>/cards/?search= — a set's card grid,
    paginated with the site default (20/page) since a card tile is much
    lighter than a set tile. `search` here is the "search this set..."
    field (player/character/card number/title).
    """

    permission_classes = [AllowAny]
    serializer_class = PublicCardListSerializer

    def get_queryset(self):
        queryset = Card.objects.filter(set_id=self.kwargs["pk"]).annotate(Count("listings")).order_by(
            "card_number", "player_name"
        )
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(player_name__icontains=search)
                | Q(card_number__icontains=search)
                | Q(variation__icontains=search)
            )
        return queryset


class PublicCardDetailView(generics.RetrieveAPIView):
    """GET /api/v1/collections/cards/<id>/ — the individual card page."""

    permission_classes = [AllowAny]
    serializer_class = PublicCardDetailSerializer
    queryset = Card.objects.select_related("set", "set__company")


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


class PublicCollectionsSearchView(APIView):
    """
    GET /api/v1/collections/search/?q=... — the main Collections page's
    global search. Matches both sets (by name/company/category) and cards
    (by player, card number, set name, or "<year> <set> <player>"-style
    combined queries) and returns both, each result flagged with which
    category/year/company/set it belongs to so it's clear at a glance —
    see PublicCardSetListSerializer/SearchResultCardSerializer.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response({"sets": [], "cards": []})

        # A leading "#123" should search card numbers specifically, since
        # that's an unambiguous signal (per the guided-search examples).
        number_query = query[1:].strip() if query.startswith("#") else None

        set_matches = (
            CardSet.objects.select_related("company")
            .annotate(Count("cards"))
            .filter(Q(name__icontains=query) | Q(company__name__icontains=query))[:10]
        )

        card_filter = (
            Q(player_name__icontains=query)
            | Q(card_number__icontains=query)
            | Q(variation__icontains=query)
            | Q(set__name__icontains=query)
            | Q(set__company__name__icontains=query)
        )
        if number_query:
            card_filter |= Q(card_number__icontains=number_query)
        card_matches = Card.objects.select_related("set", "set__company").filter(card_filter)[:20]

        return Response(
            {
                "sets": SearchResultSetSerializer(set_matches, many=True, context={"request": request}).data,
                "cards": SearchResultCardSerializer(card_matches, many=True, context={"request": request}).data,
            }
        )


# ---------------------------------------------------------------------------
# Admin — Manage Collections (Companies, Sets, Cards, Submissions)
# ---------------------------------------------------------------------------


class AdminCompanyListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/admin/collections/companies/."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = CompanySerializer
    queryset = Company.objects.all()
    pagination_class = None


class AdminCompanyDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PATCH/DELETE /api/v1/admin/collections/companies/<id>/. PROTECT on
    CardSet.company means deleting a company still in use surfaces as a
    clean 400 (see perform_destroy) rather than an opaque 500."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = CompanySerializer
    queryset = Company.objects.all()

    def perform_destroy(self, instance):
        if instance.sets.exists():
            raise ValidationError(
                {"detail": "Can't delete a company that still has sets. Reassign or delete those sets first."}
            )
        instance.delete()


class AdminCardSetListCreateView(generics.ListCreateAPIView):
    """
    GET/POST /api/v1/admin/collections/sets/ — Manage Sets. Supports the
    same category/year/company/search filters as the public list, plus
    admin-side pagination (site default, not the public 10/page).
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = AdminCardSetSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        queryset = CardSet.objects.select_related("company")
        params = self.request.query_params
        category = params.get("category", "").strip()
        year = params.get("year", "").strip()
        company = params.get("company", "").strip()
        search = params.get("search", "").strip()
        if category:
            queryset = queryset.filter(category=category)
        if year:
            queryset = queryset.filter(year=year)
        if company:
            queryset = queryset.filter(company_id=company)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(company__name__icontains=search)
            )
        return queryset


class AdminCardSetDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    PATCH/DELETE /api/v1/admin/collections/sets/<id>/. Deleting a set
    cascades to its Cards (CardSet -> Card is CASCADE, see models.py), but
    any dealer Listing pointing at one of those cards just becomes
    registry-unlinked (Listing.card is SET_NULL) rather than being
    destroyed — see perform_destroy for the explicit warning-free check
    plus apps.listings.models.Listing's on_delete choice.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = AdminCardSetSerializer
    queryset = CardSet.objects.select_related("company")
    parser_classes = [MultiPartParser, FormParser, JSONParser]


class AdminCardListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/admin/collections/cards/ — Manage Cards. ?set=<id>
    scopes to one set's cards (the set page's card management view);
    ?search= matches player/card number/variation for the standalone card
    search tool."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = AdminCardSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        queryset = Card.objects.select_related("set", "set__company").order_by(
            "card_number", "player_name"
        )
        set_id = self.request.query_params.get("set", "").strip()
        search = self.request.query_params.get("search", "").strip()
        if set_id:
            queryset = queryset.filter(set_id=set_id)
        if search:
            queryset = queryset.filter(
                Q(player_name__icontains=search)
                | Q(card_number__icontains=search)
                | Q(variation__icontains=search)
            )
        return queryset


class AdminCardDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PATCH/DELETE /api/v1/admin/collections/cards/<id>/. Deleting a card
    just SET_NULLs any dealer Listing.card pointing at it (see Listing's
    on_delete) — the listing itself is never destroyed."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = AdminCardSerializer
    queryset = Card.objects.select_related("set", "set__company")
    parser_classes = [MultiPartParser, FormParser, JSONParser]


class AdminCardSubmissionListView(generics.ListAPIView):
    """GET /api/v1/admin/collections/submissions/?status=pending — the
    review queue for dealer "can't find your card" submissions. No
    pagination — this queue is always short enough to render in full,
    same reasoning as AdminCompanyListCreateView, and the frontend calls
    this expecting a plain array, not a paginated envelope."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = AdminCardSubmissionSerializer
    pagination_class = None

    def get_queryset(self):
        queryset = CardSubmission.objects.select_related("set", "submitted_by")
        status_filter = self.request.query_params.get("status", "").strip()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset


class AdminCardSubmissionApproveView(APIView):
    """
    POST /api/v1/admin/collections/submissions/<id>/approve/ — creates the
    real registry Card from the submission's details, links it back
    (resulting_card), and — if the submission came from a dealer's pending
    listing — attaches that listing to the new Card so the dealer doesn't
    have to redo anything.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        submission = get_object_or_404(CardSubmission, pk=pk)
        if submission.status != CardSubmission.Status.PENDING:
            raise ValidationError({"detail": "This submission has already been reviewed."})

        card, _ = Card.objects.get_or_create(
            set=submission.set,
            card_number=submission.card_number,
            variation=submission.variation,
            player_name=submission.player_name,
            defaults={
                "team": submission.team,
                "print_run": submission.print_run,
            },
        )
        submission.status = CardSubmission.Status.APPROVED
        submission.resulting_card = card
        submission.reviewed_at = timezone.now()
        submission.save(update_fields=["status", "resulting_card", "reviewed_at"])

        if submission.listing_id:
            submission.listing.card = card
            submission.listing.save(update_fields=["card"])

        return Response(AdminCardSubmissionSerializer(submission).data)


class AdminCardSubmissionRejectView(APIView):
    """POST /api/v1/admin/collections/submissions/<id>/reject/."""

    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        submission = get_object_or_404(CardSubmission, pk=pk)
        if submission.status != CardSubmission.Status.PENDING:
            raise ValidationError({"detail": "This submission has already been reviewed."})
        submission.status = CardSubmission.Status.REJECTED
        submission.reviewed_at = timezone.now()
        submission.save(update_fields=["status", "reviewed_at"])
        return Response(AdminCardSubmissionSerializer(submission).data)


# ---------------------------------------------------------------------------
# Dealer-facing: guided registry lookup + "can't find your card"
# ---------------------------------------------------------------------------


class DealerCardSubmissionListCreateView(generics.ListCreateAPIView):
    """
    GET/POST /api/v1/collections/submissions/ — a dealer's own "Can't find
    your card?" submissions (list scoped to themselves; create requires an
    approved vendor account, same gate as creating a Listing).
    """

    serializer_class = DealerCardSubmissionCreateSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsApprovedVendor()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return CardSubmission.objects.filter(submitted_by=self.request.user)

    def perform_create(self, serializer):
        serializer.save(submitted_by=self.request.user)
