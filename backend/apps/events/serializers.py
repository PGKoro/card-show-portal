from rest_framework import serializers

from apps.users.models import User

from .models import BoothAssignment, Event, MapSection


class EventSerializer(serializers.ModelSerializer):
    status = serializers.ReadOnlyField()
    vendor_count = serializers.ReadOnlyField()
    vendors = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.VENDOR), many=True, required=False
    )
    # {pk, label} pairs rather than parallel `vendors`/`vendor_names` arrays,
    # so the frontend never has to assume the two arrays come back in the
    # same order (obj.vendors.all() has no guaranteed ordering across two
    # separate evaluations).
    vendors_detail = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = (
            "id",
            "name",
            "venue",
            "city",
            "description",
            "start_date",
            "end_date",
            "vendors",
            "vendors_detail",
            "vendor_count",
            "estimated_cards",
            "estimated_attendees",
            "status",
            # Deliberately NOT map_image_url here — whether a map image has
            # been uploaded is only exposed through the gated /map/
            # endpoint (see EventMapView), never on the general event
            # payload. map_visible alone doesn't leak that, since it's
            # meaningful even before any image exists.
            "map_visible",
        )

    def get_vendors_detail(self, obj):
        return [
            {"pk": vendor.pk, "label": vendor.business_name or vendor.email}
            for vendor in obj.vendors.all()
        ]


class BoothAssignmentSerializer(serializers.ModelSerializer):
    """
    Admin-facing read/write serializer for a single booth marker — used by
    the floor-map editor to create/reposition/reassign booths. `event` is
    never part of the payload; the view supplies it (from the URL) via
    `perform_create`/context, matching the Listing app's
    `vendor=self.request.user` pattern.
    """

    vendor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.VENDOR), required=False, allow_null=True
    )
    vendor_detail = serializers.SerializerMethodField()

    class Meta:
        model = BoothAssignment
        fields = (
            "id",
            "booth_number",
            "position_x",
            "position_y",
            "width",
            "height",
            "vendor",
            "vendor_detail",
            "unlinked_vendor_name",
            "unlinked_vendor_category",
            "unlinked_vendor_contact",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def get_vendor_detail(self, obj):
        if not obj.vendor_id:
            return None
        return {"pk": obj.vendor.pk, "label": obj.vendor.business_name or obj.vendor.email}

    def validate_position_x(self, value):
        return self._validate_percentage(value, "position_x")

    def validate_position_y(self, value):
        return self._validate_percentage(value, "position_y")

    def validate_width(self, value):
        return self._validate_percentage(value, "width", allow_zero=False)

    def validate_height(self, value):
        return self._validate_percentage(value, "height", allow_zero=False)

    @staticmethod
    def _validate_percentage(value, field_name, allow_zero=True):
        lower_bound = 0 if allow_zero else 0.01
        if value < lower_bound or value > 100:
            raise serializers.ValidationError(f"{field_name} must be between 0 and 100.")
        return value

    def validate_booth_number(self, value):
        # `event` comes from the instance being updated, or from context
        # when creating (see BoothAssignmentListCreateView.perform_create).
        event = self.instance.event if self.instance else self.context["event"]
        queryset = BoothAssignment.objects.filter(event=event, booth_number=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError(
                "A booth with this number already exists for this event."
            )
        return value

    def validate(self, attrs):
        # Figures out what the booth's linked/unlinked state would be
        # *after* this save. A partial update (PATCH) that only touches
        # one side — e.g. `{"unlinked_vendor_name": "..."}` with no
        # `vendor` key at all — is how flipping a booth from linked to
        # unlinked (or back) works in a single request: whichever side is
        # explicitly provided here wins over whatever the instance
        # currently has, and _clear_the_other_assignment_type (below)
        # clears the loser at save time. Providing *both* sides at once
        # with real values is always rejected outright, since that's an
        # unambiguous client error rather than an intended flip.
        vendor_provided = "vendor" in attrs
        unlinked_provided = "unlinked_vendor_name" in attrs
        vendor_value = attrs.get("vendor")
        unlinked_value = attrs.get("unlinked_vendor_name", "")

        if vendor_provided and unlinked_provided and vendor_value is not None and unlinked_value:
            raise serializers.ValidationError(
                "Assign exactly one of an existing vendor or a manually-entered vendor "
                "name — not both."
            )

        has_vendor = (
            vendor_value is not None
            if vendor_provided
            else bool(self.instance and self.instance.vendor_id)
        )
        has_unlinked_name = (
            bool(unlinked_value)
            if unlinked_provided
            else bool(self.instance and self.instance.unlinked_vendor_name)
        )

        if vendor_provided and vendor_value is not None:
            has_unlinked_name = False
        elif unlinked_provided and unlinked_value:
            has_vendor = False

        if has_vendor == has_unlinked_name:
            raise serializers.ValidationError(
                "Assign exactly one of an existing vendor or a manually-entered vendor name."
            )
        return attrs

    def _clear_the_other_assignment_type(self, validated_data):
        # Whichever side of the XOR wasn't explicitly set should be
        # cleared, so a booth can be flipped from linked to unlinked (or
        # back) in a single PATCH instead of needing two requests.
        if validated_data.get("vendor") is not None:
            validated_data.setdefault("unlinked_vendor_name", "")
            validated_data.setdefault("unlinked_vendor_category", "")
            validated_data.setdefault("unlinked_vendor_contact", "")
        elif validated_data.get("unlinked_vendor_name"):
            validated_data.setdefault("vendor", None)
        return validated_data

    def create(self, validated_data):
        validated_data["event"] = self.context["event"]
        validated_data = self._clear_the_other_assignment_type(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data = self._clear_the_other_assignment_type(validated_data)
        return super().update(instance, validated_data)


class MapSectionSerializer(serializers.ModelSerializer):
    """
    Admin-facing read/write serializer for a category zone (e.g. "top-left
    corner is Pokémon vendors") — a purely visual wayfinding overlay, with
    no vendor/booth relationship. `event` is supplied by the view from the
    URL, same as BoothAssignmentSerializer.
    """

    class Meta:
        model = MapSection
        fields = (
            "id",
            "category",
            "position_x",
            "position_y",
            "width",
            "height",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_position_x(self, value):
        return self._validate_percentage(value, "position_x")

    def validate_position_y(self, value):
        return self._validate_percentage(value, "position_y")

    def validate_width(self, value):
        return self._validate_percentage(value, "width", allow_zero=False)

    def validate_height(self, value):
        return self._validate_percentage(value, "height", allow_zero=False)

    @staticmethod
    def _validate_percentage(value, field_name, allow_zero=True):
        lower_bound = 0 if allow_zero else 0.01
        if value < lower_bound or value > 100:
            raise serializers.ValidationError(f"{field_name} must be between 0 and 100.")
        return value

    def create(self, validated_data):
        validated_data["event"] = self.context["event"]
        return super().create(validated_data)


class PublicBoothAssignmentSerializer(serializers.ModelSerializer):
    """
    Public-facing read-only view of a booth — deliberately never includes
    unlinked_vendor_contact. Shows either the linked vendor's public info
    or the manually-entered name/category, never both/neither.
    """

    vendor_pk = serializers.IntegerField(source="vendor_id", read_only=True)
    vendor_name = serializers.SerializerMethodField()
    vendor_category_tags = serializers.SerializerMethodField()

    class Meta:
        model = BoothAssignment
        fields = (
            "id",
            "booth_number",
            "position_x",
            "position_y",
            "width",
            "height",
            "vendor_pk",
            "vendor_name",
            "vendor_category_tags",
        )

    def get_vendor_name(self, obj):
        if obj.vendor_id:
            return obj.vendor.business_name or obj.vendor.email
        return obj.unlinked_vendor_name

    def get_vendor_category_tags(self, obj):
        if obj.vendor_id:
            return obj.vendor.category_tags
        return [obj.unlinked_vendor_category] if obj.unlinked_vendor_category else []


class EventMapSerializer(serializers.ModelSerializer):
    """
    Backs GET /api/v1/events/<id>/map/ — the map image plus every booth on
    it. Only reachable (see EventMapView) when map_visible is True, unless
    the caller is an admin previewing before making it public.
    """

    map_image_url = serializers.SerializerMethodField()
    booths = serializers.SerializerMethodField()
    sections = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = (
            "id",
            "name",
            "map_image_url",
            "map_image_preset",
            "map_visible",
            "booths",
            "sections",
        )

    def get_map_image_url(self, obj):
        # Deliberately doesn't fall back to a URL for map_image_preset —
        # presets are static frontend assets (frontend/public/preset-maps/),
        # so the frontend resolves the key to a path itself rather than
        # this backend assuming where the frontend is hosted.
        if not obj.map_image:
            return None
        request = self.context.get("request")
        url = obj.map_image.url
        return request.build_absolute_uri(url) if request else url

    def get_booths(self, obj):
        booths = obj.booth_assignments.select_related("vendor").all()
        return PublicBoothAssignmentSerializer(booths, many=True).data

    def get_sections(self, obj):
        # No sensitive data here (just a category + position), so this is
        # safe to expose as-is — no separate public-vs-admin serializer
        # needed like BoothAssignment has.
        return MapSectionSerializer(obj.map_sections.all(), many=True).data
