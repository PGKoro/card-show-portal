from django.db.models import Max
from rest_framework import serializers

from apps.core.models import Category

from .models import Card, CardSet, CardSubmission, Company


class CompanySerializer(serializers.ModelSerializer):
    """
    Admin-managed Company (brand) vocabulary — same read/write shape for
    both the public "which companies have sets" list and Manage Sets'
    company picker/creator.
    """

    class Meta:
        model = Company
        fields = ("id", "name", "slug")
        read_only_fields = ("id", "slug")


class PublicCardSetListSerializer(serializers.ModelSerializer):
    """
    A Set as it appears in a paginated Collections browse list (Category ->
    Year -> Company -> Sets) — deliberately light, no card list, since the
    grid only needs enough to identify/link to the set.
    """

    company_name = serializers.CharField(source="company.name", read_only=True)
    category_name = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    card_count = serializers.IntegerField(source="cards__count", read_only=True)

    class Meta:
        model = CardSet
        fields = (
            "id",
            "name",
            "year",
            "company",
            "company_name",
            "category",
            "category_name",
            "image_url",
            "card_count",
        )

    def get_category_name(self, obj):
        return Category.objects.filter(slug=obj.category).values_list("name", flat=True).first() or obj.category

    def get_image_url(self, obj):
        if not obj.image:
            return None
        url = obj.image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class PublicCardListSerializer(serializers.ModelSerializer):
    """
    A Card as it appears inside a Set's card grid — just what's needed to
    identify it and link through; full metadata (team, print run, etc.)
    is reserved for the individual card page (PublicCardDetailSerializer)
    to keep the grid uncluttered per the "don't overwhelm the customer"
    requirement.
    """

    image_front_url = serializers.SerializerMethodField()
    listing_count = serializers.IntegerField(source="listings__count", read_only=True)

    class Meta:
        model = Card
        fields = (
            "id",
            "card_number",
            "player_name",
            "variation",
            "print_run",
            "image_front_url",
            "listing_count",
        )

    def get_image_front_url(self, obj):
        if not obj.image_front:
            return None
        url = obj.image_front.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class PublicCardSetDetailSerializer(PublicCardSetListSerializer):
    """The set page — same fields as the list shape, no cards embedded
    (cards are fetched separately/paginated via PublicSetCardListView so a
    huge set doesn't load in one response)."""


class PublicCardDetailSerializer(serializers.ModelSerializer):
    """
    The individual card page. Includes the parent Set's derived
    year/company/category (Card itself never stores these — see
    Card's docstring) so the page can render the full identity without a
    second request.
    """

    image_front_url = serializers.SerializerMethodField()
    image_back_url = serializers.SerializerMethodField()
    set_id = serializers.IntegerField(source="set.id", read_only=True)
    set_name = serializers.CharField(source="set.name", read_only=True)
    year = serializers.IntegerField(source="set.year", read_only=True)
    company_id = serializers.IntegerField(source="set.company.id", read_only=True)
    company_name = serializers.CharField(source="set.company.name", read_only=True)
    category = serializers.CharField(source="set.category", read_only=True)
    category_name = serializers.SerializerMethodField()

    class Meta:
        model = Card
        fields = (
            "id",
            "set_id",
            "set_name",
            "year",
            "company_id",
            "company_name",
            "category",
            "category_name",
            "card_number",
            "player_name",
            "team",
            "variation",
            "print_run",
            "image_front_url",
            "image_back_url",
        )

    def get_category_name(self, obj):
        slug = obj.set.category
        return Category.objects.filter(slug=slug).values_list("name", flat=True).first() or slug

    def get_image_front_url(self, obj):
        if not obj.image_front:
            return None
        url = obj.image_front.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def get_image_back_url(self, obj):
        if not obj.image_back:
            return None
        url = obj.image_back.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class SearchResultSetSerializer(PublicCardSetListSerializer):
    """Collections global search's "matching sets" shape — identical to the
    browse-list shape, kept as its own name for clarity at the call site."""


class SearchResultCardSerializer(serializers.ModelSerializer):
    """
    Collections global search's "matching cards" shape — unlike the
    in-set card grid, a global search result also has to say *which*
    category/year/company/set it belongs to, since it isn't already
    implied by the page the user is on.
    """

    set_id = serializers.IntegerField(source="set.id", read_only=True)
    set_name = serializers.CharField(source="set.name", read_only=True)
    year = serializers.IntegerField(source="set.year", read_only=True)
    company_name = serializers.CharField(source="set.company.name", read_only=True)
    category = serializers.CharField(source="set.category", read_only=True)
    category_name = serializers.SerializerMethodField()
    image_front_url = serializers.SerializerMethodField()

    class Meta:
        model = Card
        fields = (
            "id",
            "card_number",
            "player_name",
            "variation",
            "set_id",
            "set_name",
            "year",
            "company_name",
            "category",
            "category_name",
            "image_front_url",
        )

    def get_category_name(self, obj):
        slug = obj.set.category
        return Category.objects.filter(slug=slug).values_list("name", flat=True).first() or slug

    def get_image_front_url(self, obj):
        if not obj.image_front:
            return None
        url = obj.image_front.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


# ---------------------------------------------------------------------------
# Admin (Manage Collections)
# ---------------------------------------------------------------------------


class AdminCardSetSerializer(serializers.ModelSerializer):
    """
    Manage Sets' create/edit form. `image` write-only + `image_url`
    read-back, same split as HomeCarouselSlideAdminSerializer/
    ArticleSerializer's cover image handling elsewhere in this codebase.
    """

    image_url = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True)
    card_count = serializers.IntegerField(source="cards.count", read_only=True)

    class Meta:
        model = CardSet
        fields = (
            "id",
            "name",
            "year",
            "company",
            "company_name",
            "category",
            "image",
            "image_url",
            "card_count",
            "created_at",
        )
        read_only_fields = ("id", "created_at")
        extra_kwargs = {"image": {"write_only": True, "required": False}}

    def get_image_url(self, obj):
        if not obj.image:
            return None
        url = obj.image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def validate_category(self, value):
        if not Category.objects.filter(slug=value).exists():
            raise serializers.ValidationError("Not a valid category.")
        return value

    def validate_year(self, value):
        if value < 1800 or value > 2100:
            raise serializers.ValidationError("Enter a realistic year.")
        return value

    def validate(self, attrs):
        # Mirrors the DB-level unique_set_per_category_year_company_name
        # constraint with a friendlier error message (a raw IntegrityError
        # would otherwise surface as an opaque 500) — same "prevent
        # duplicate registry records" requirement called out for Sets.
        name = attrs.get("name", getattr(self.instance, "name", None))
        year = attrs.get("year", getattr(self.instance, "year", None))
        company = attrs.get("company", getattr(self.instance, "company", None))
        category = attrs.get("category", getattr(self.instance, "category", None))
        existing = CardSet.objects.filter(
            name__iexact=name, year=year, company=company, category=category
        )
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError(
                {"name": "A set with this name/year/company/category already exists."}
            )
        return attrs


class AdminCardSerializer(serializers.ModelSerializer):
    """
    Manage Cards' create/edit form. `set` is a plain writable FK — the
    admin UI resolves it through the dependent Category -> Year -> Company
    -> Set dropdowns, same guided-selection pattern the dealer listing form
    uses (see apps.listings.serializers.ListingSerializer).
    """

    image_front_url = serializers.SerializerMethodField()
    image_back_url = serializers.SerializerMethodField()
    set_name = serializers.CharField(source="set.name", read_only=True)
    listing_count = serializers.IntegerField(source="listings.count", read_only=True)

    class Meta:
        model = Card
        fields = (
            "id",
            "set",
            "set_name",
            "player_name",
            "team",
            "card_number",
            "variation",
            "print_run",
            "image_front",
            "image_back",
            "image_front_url",
            "image_back_url",
            "listing_count",
            "created_at",
        )
        read_only_fields = ("id", "created_at")
        extra_kwargs = {
            "image_front": {"write_only": True, "required": False},
            "image_back": {"write_only": True, "required": False},
        }

    def get_image_front_url(self, obj):
        if not obj.image_front:
            return None
        url = obj.image_front.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def get_image_back_url(self, obj):
        if not obj.image_back:
            return None
        url = obj.image_back.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def validate(self, attrs):
        card_set = attrs.get("set", getattr(self.instance, "set", None))
        card_number = attrs.get("card_number", getattr(self.instance, "card_number", None))
        variation = attrs.get("variation", getattr(self.instance, "variation", ""))
        player_name = attrs.get("player_name", getattr(self.instance, "player_name", "N/A"))
        existing = Card.objects.filter(
            set=card_set,
            card_number=card_number,
            variation=variation,
            player_name__iexact=player_name,
        )
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError(
                {"card_number": "A card with this number/variation/player already exists in this set."}
            )
        return attrs


class AdminCardSubmissionSerializer(serializers.ModelSerializer):
    """Manage Card Submissions' review queue — read-mostly; the actual
    approve/reject transitions go through dedicated action endpoints
    (AdminCardSubmissionApproveView/RejectView), same convention as
    Article publish/unpublish/archive/restore."""

    set_name = serializers.CharField(source="set.name", read_only=True)
    submitted_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CardSubmission
        fields = (
            "id",
            "set",
            "set_name",
            "player_name",
            "team",
            "card_number",
            "variation",
            "print_run",
            "notes",
            "status",
            "resulting_card",
            "submitted_by_name",
            "created_at",
        )
        read_only_fields = fields

    def get_submitted_by_name(self, obj):
        if not obj.submitted_by:
            return None
        return obj.submitted_by.business_name or obj.submitted_by.email


class DealerCardSubmissionCreateSerializer(serializers.ModelSerializer):
    """A dealer's own "Can't find your card?" submission form."""

    class Meta:
        model = CardSubmission
        fields = (
            "id",
            "set",
            "player_name",
            "team",
            "card_number",
            "variation",
            "print_run",
            "notes",
            "listing",
            "status",
            "created_at",
        )
        read_only_fields = ("id", "status", "created_at")

    def validate_listing(self, value):
        request = self.context.get("request")
        if value is not None and request and value.vendor_id != request.user.id:
            raise serializers.ValidationError("That listing doesn't belong to you.")
        return value
