from rest_framework import serializers

from apps.core.models import Category

from .models import Listing


class ListingSerializer(serializers.ModelSerializer):
    """
    A vendor's own listing create/edit form. `card` links this listing to
    a Set Registry Card (apps.collections.models.Card) — selecting one
    lets the frontend auto-fill the read-only card_* fields below rather
    than the dealer retyping player/team/year/set/etc. Front/back photos
    are required for every new listing (see validate), and grading/serial
    numbering follow the same pairing rules as before, extended to also
    require a price/offer/trade and a named "other" grading company when
    applicable.
    """

    card_title = serializers.SerializerMethodField()
    card_player_name = serializers.CharField(source="card.player_name", read_only=True)
    card_team = serializers.CharField(source="card.team", read_only=True)
    card_year = serializers.IntegerField(source="card.set.year", read_only=True)
    card_category = serializers.CharField(source="card.set.category", read_only=True)
    card_company_name = serializers.CharField(source="card.set.company.name", read_only=True)
    card_set_name = serializers.CharField(source="card.set.name", read_only=True)
    front_image_url = serializers.SerializerMethodField()
    back_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = (
            "id",
            "title",
            "description",
            "category",
            "card",
            "card_title",
            "card_player_name",
            "card_team",
            "card_year",
            "card_category",
            "card_company_name",
            "card_set_name",
            "front_image",
            "back_image",
            "front_image_url",
            "back_image_url",
            "price",
            "accepting_offers",
            "accepting_trades",
            "grading",
            "grading_company_other",
            "grade",
            "is_serial_numbered",
            "serial_copy_number",
            "serial_print_run",
            "status",
            "created_at",
        )
        read_only_fields = ("id", "created_at")
        extra_kwargs = {
            "front_image": {"write_only": True, "required": False},
            "back_image": {"write_only": True, "required": False},
        }

    def get_card_title(self, obj):
        if not obj.card:
            return None
        return str(obj.card)

    def get_front_image_url(self, obj):
        if not obj.front_image:
            return None
        url = obj.front_image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def get_back_image_url(self, obj):
        if not obj.back_image:
            return None
        url = obj.back_image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def validate_category(self, value):
        if not Category.objects.filter(slug=value).exists():
            raise serializers.ValidationError("Not a valid category.")
        return value

    def validate_grade(self, value):
        if value is not None and not (1 <= value <= 10):
            raise serializers.ValidationError("Grade must be between 1 and 10.")
        return value

    def validate(self, attrs):
        grading = attrs.get("grading", getattr(self.instance, "grading", Listing.Grading.UNGRADED))
        grade = attrs.get("grade", getattr(self.instance, "grade", None))
        grading_company_other = attrs.get(
            "grading_company_other", getattr(self.instance, "grading_company_other", "")
        )
        if grading == Listing.Grading.UNGRADED:
            if grade is not None:
                raise serializers.ValidationError(
                    {"grade": "Ungraded items can't have a grade."}
                )
        elif grade is None:
            raise serializers.ValidationError(
                {"grade": "A grade is required once a grading company is set."}
            )
        if grading == Listing.Grading.OTHER and not grading_company_other:
            raise serializers.ValidationError(
                {"grading_company_other": "Name the grading company when \"Other\" is selected."}
            )
        if grading != Listing.Grading.OTHER and grading_company_other:
            raise serializers.ValidationError(
                {"grading_company_other": "Only set this when grading is \"Other\"."}
            )

        is_serial_numbered = attrs.get(
            "is_serial_numbered", getattr(self.instance, "is_serial_numbered", False)
        )
        copy_number = attrs.get(
            "serial_copy_number", getattr(self.instance, "serial_copy_number", None)
        )
        print_run = attrs.get("serial_print_run", getattr(self.instance, "serial_print_run", None))
        if is_serial_numbered:
            if copy_number is None or print_run is None:
                raise serializers.ValidationError(
                    {"serial_copy_number": "Enter both the copy number and print run (e.g. 57/99)."}
                )
        elif copy_number is not None or print_run is not None:
            raise serializers.ValidationError(
                {"is_serial_numbered": "Turn this on before entering a serial number."}
            )

        price = attrs.get("price", getattr(self.instance, "price", None))
        accepting_offers = attrs.get(
            "accepting_offers", getattr(self.instance, "accepting_offers", False)
        )
        accepting_trades = attrs.get(
            "accepting_trades", getattr(self.instance, "accepting_trades", False)
        )
        if price is None and not accepting_offers and not accepting_trades:
            raise serializers.ValidationError(
                {"price": "Set a price, or turn on accepting offers/trades."}
            )

        # Front AND back photos are required for a brand-new listing (an
        # edit that isn't touching the photos doesn't have to re-upload
        # them — same distinction HomeCarouselSlideAdminSerializer draws).
        if self.instance is None:
            front_image = attrs.get("front_image")
            back_image = attrs.get("back_image")
            missing = []
            if not front_image:
                missing.append("front_image")
            if not back_image:
                missing.append("back_image")
            if missing:
                raise serializers.ValidationError(
                    {field: ["This field is required."] for field in missing}
                )

        return attrs


class PublicListingSerializer(serializers.ModelSerializer):
    """
    Adds the vendor identity fields ListingSerializer deliberately omits
    (that one's used for a vendor's own dashboard, where the vendor is
    already implied) — needed here since this backs a cross-vendor feed
    where each card must link back to whichever vendor posted it. Also
    surfaces dealer/business-profile fields (per "pull dealer info from
    the existing profile") and the Set Registry card link so a card's
    detail page can show "Available From Dealers".
    """

    vendor = serializers.IntegerField(source="vendor_id", read_only=True)
    vendor_name = serializers.CharField(source="vendor.business_name", read_only=True)
    vendor_location = serializers.CharField(source="vendor.location", read_only=True)
    front_image_url = serializers.SerializerMethodField()
    back_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = (
            "id",
            "title",
            "description",
            "category",
            "card",
            "front_image_url",
            "back_image_url",
            "price",
            "accepting_offers",
            "accepting_trades",
            "grading",
            "grading_company_other",
            "grade",
            "is_serial_numbered",
            "serial_copy_number",
            "serial_print_run",
            "status",
            "created_at",
            "vendor",
            "vendor_name",
            "vendor_location",
        )
        read_only_fields = fields

    def get_front_image_url(self, obj):
        if not obj.front_image:
            return None
        url = obj.front_image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def get_back_image_url(self, obj):
        if not obj.back_image:
            return None
        url = obj.back_image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url
