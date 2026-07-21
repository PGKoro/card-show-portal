from rest_framework import serializers

from apps.core.models import Category
from apps.users.models import User

from .models import Booth, BoothRegistration, Event, Venue, VenueSection


def _validate_percentage(value, field_name, allow_zero=True):
    lower_bound = 0 if allow_zero else 0.01
    if value < lower_bound or value > 100:
        raise serializers.ValidationError(f"{field_name} must be between 0 and 100.")
    return value


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
    map_venue_detail = serializers.SerializerMethodField()

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
            "archived",
            "map_venue",
            "map_venue_detail",
            # Deliberately NOT the venue's map image here — whether a map
            # image has been uploaded is only exposed through the gated
            # /map/ endpoint (see EventMapView), never on the general event
            # payload. The visibility booleans alone don't leak that.
            "map_visible",
            "map_visible_to_vendors",
            "loyalty_priority_deadline",
        )

    def get_vendors_detail(self, obj):
        return [
            {"pk": vendor.pk, "label": vendor.business_name or vendor.email}
            for vendor in obj.vendors.all()
        ]

    def get_map_venue_detail(self, obj):
        if not obj.map_venue_id:
            return None
        return {"pk": obj.map_venue_id, "name": obj.map_venue.name}


class VenueSerializer(serializers.ModelSerializer):
    """
    Admin-facing CRUD for a Venue — the reusable floor plan (image/preset +
    booth slots + category zones) shared across every event held there.
    Deliberately doesn't include the map image/preset here (same reasoning
    as EventSerializer): use the venue detail/map endpoints for that.
    """

    booth_count = serializers.SerializerMethodField()

    class Meta:
        model = Venue
        fields = ("id", "name", "city", "booth_count", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def get_booth_count(self, obj):
        return obj.booths.count()


class BoothSerializer(serializers.ModelSerializer):
    """
    Admin-facing read/write serializer for a physical booth slot on a
    Venue's floor plan — position/size/price. `venue` is supplied by the
    view from the URL, never part of the payload (matches the old
    BoothAssignment pattern). Who's actually assigned to this slot for a
    given event is tracked separately by BoothRegistration.
    """

    class Meta:
        model = Booth
        fields = (
            "id",
            "booth_number",
            "position_x",
            "position_y",
            "width",
            "height",
            "price",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_position_x(self, value):
        return _validate_percentage(value, "position_x")

    def validate_position_y(self, value):
        return _validate_percentage(value, "position_y")

    def validate_width(self, value):
        return _validate_percentage(value, "width", allow_zero=False)

    def validate_height(self, value):
        return _validate_percentage(value, "height", allow_zero=False)

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price can't be negative.")
        return value

    def validate_booth_number(self, value):
        venue = self.instance.venue if self.instance else self.context["venue"]
        queryset = Booth.objects.filter(venue=venue, booth_number=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError(
                "A booth with this number already exists for this venue."
            )
        return value

    def create(self, validated_data):
        validated_data["venue"] = self.context["venue"]
        return super().create(validated_data)


class VenueSectionSerializer(serializers.ModelSerializer):
    """
    Admin-facing read/write serializer for a category zone (e.g. "top-left
    corner is Pokémon vendors") on a Venue's floor plan — a purely visual
    wayfinding overlay, with no vendor/booth relationship. `venue` is
    supplied by the view from the URL, same as BoothSerializer.
    """

    class Meta:
        model = VenueSection
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

    def validate_category(self, value):
        if not Category.objects.filter(slug=value).exists():
            raise serializers.ValidationError("Not a valid category.")
        return value

    def validate_position_x(self, value):
        return _validate_percentage(value, "position_x")

    def validate_position_y(self, value):
        return _validate_percentage(value, "position_y")

    def validate_width(self, value):
        return _validate_percentage(value, "width", allow_zero=False)

    def validate_height(self, value):
        return _validate_percentage(value, "height", allow_zero=False)

    def create(self, validated_data):
        validated_data["venue"] = self.context["venue"]
        return super().create(validated_data)


class VenueMapSerializer(serializers.ModelSerializer):
    """Backs the admin venue floor-plan editor: image/preset + every booth/section on it."""

    map_image_url = serializers.SerializerMethodField()
    booths = BoothSerializer(many=True, read_only=True)
    sections = VenueSectionSerializer(many=True, read_only=True)

    class Meta:
        model = Venue
        fields = ("id", "name", "map_image_url", "map_image_preset", "booths", "sections")

    def get_map_image_url(self, obj):
        if not obj.map_image:
            return None
        request = self.context.get("request")
        url = obj.map_image.url
        return request.build_absolute_uri(url) if request else url


class BoothRegistrationSerializer(serializers.ModelSerializer):
    """
    Admin-facing read/write serializer for a vendor's claim on a booth for
    one event — covers both the legacy "admin directly assigns a vendor"
    workflow and reviewing a vendor-initiated request. `booth` is a normal
    writable field (the booth an event has many of, referenced by id) —
    `event` alone is supplied by the view from the URL.
    """

    vendor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.VENDOR), required=False, allow_null=True
    )
    vendor_detail = serializers.SerializerMethodField()
    booth = serializers.PrimaryKeyRelatedField(queryset=Booth.objects.all())
    booth_number = serializers.CharField(source="booth.booth_number", read_only=True)

    class Meta:
        model = BoothRegistration
        fields = (
            "id",
            "booth",
            "booth_number",
            "status",
            "vendor",
            "vendor_detail",
            "unlinked_vendor_name",
            "unlinked_vendor_category",
            "unlinked_vendor_contact",
            "price",
            "requested_at",
            "decided_at",
        )
        read_only_fields = ("id", "price", "requested_at", "decided_at")

    def get_vendor_detail(self, obj):
        if not obj.vendor_id:
            return None
        return {"pk": obj.vendor.pk, "label": obj.vendor.business_name or obj.vendor.email}

    def validate_booth(self, value):
        event = self.instance.event if self.instance else self.context["event"]
        if not event.map_venue_id or value.venue_id != event.map_venue_id:
            raise serializers.ValidationError("This booth doesn't belong to this event's venue.")
        return value

    def validate(self, attrs):
        # Same "exactly one of vendor or unlinked name" rule as the old
        # BoothAssignmentSerializer, with the same partial-update precedence
        # (whichever side is explicitly provided in *this* request wins).
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
        if validated_data.get("vendor") is not None:
            validated_data.setdefault("unlinked_vendor_name", "")
            validated_data.setdefault("unlinked_vendor_category", "")
            validated_data.setdefault("unlinked_vendor_contact", "")
        elif validated_data.get("unlinked_vendor_name"):
            validated_data.setdefault("vendor", None)
        return validated_data

    def create(self, validated_data):
        booth = validated_data["booth"]
        validated_data["event"] = self.context["event"]
        validated_data.setdefault("status", BoothRegistration.Status.CONFIRMED)
        validated_data["price"] = booth.price
        validated_data = self._clear_the_other_assignment_type(validated_data)
        return super().create(validated_data)


class PendingBoothRegistrationSerializer(serializers.ModelSerializer):
    """
    Read-only — backs the site-wide "Booth Requests" admin tool, which lists
    every pending request across every event (unlike BoothRegistrationSerializer,
    which is scoped to one event). Includes enough about the booth/venue for
    the frontend to render a floor-plan thumbnail with the requested booth
    highlighted, without a per-row extra fetch through the event.
    """

    event_name = serializers.CharField(source="event.name", read_only=True)
    booth_number = serializers.CharField(source="booth.booth_number", read_only=True)
    venue_id = serializers.IntegerField(source="booth.venue_id", read_only=True)
    vendor_detail = serializers.SerializerMethodField()

    class Meta:
        model = BoothRegistration
        fields = (
            "id",
            "event",
            "event_name",
            "booth",
            "booth_number",
            "venue_id",
            "status",
            "vendor_detail",
            "unlinked_vendor_name",
            "unlinked_vendor_category",
            "price",
            "requested_at",
        )

    def get_vendor_detail(self, obj):
        if not obj.vendor_id:
            return None
        return {"pk": obj.vendor.pk, "label": obj.vendor.business_name or obj.vendor.email}

    def update(self, instance, validated_data):
        validated_data = self._clear_the_other_assignment_type(validated_data)
        return super().update(instance, validated_data)


class PublicBoothSerializer(serializers.Serializer):
    """
    Public-facing read-only view of one occupied booth — deliberately never
    includes price or unlinked_vendor_contact. Built from a confirmed
    BoothRegistration, not a bare Booth (an empty slot has nothing to show
    publicly).
    """

    id = serializers.IntegerField(source="booth_id")
    booth_number = serializers.CharField(source="booth.booth_number")
    position_x = serializers.DecimalField(source="booth.position_x", max_digits=5, decimal_places=2)
    position_y = serializers.DecimalField(source="booth.position_y", max_digits=5, decimal_places=2)
    width = serializers.DecimalField(source="booth.width", max_digits=5, decimal_places=2)
    height = serializers.DecimalField(source="booth.height", max_digits=5, decimal_places=2)
    vendor_pk = serializers.IntegerField(source="vendor_id")
    vendor_name = serializers.SerializerMethodField()
    vendor_category_tags = serializers.SerializerMethodField()

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
    Backs GET /api/v1/events/<id>/map/ — the venue's map image plus every
    *confirmed* booth on it for this event. Only reachable (see
    EventMapView) when map_visible is True, unless the caller is an admin
    previewing before making it public.
    """

    map_image_url = serializers.SerializerMethodField()
    map_image_preset = serializers.SerializerMethodField()
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
        if not obj.map_venue_id or not obj.map_venue.map_image:
            return None
        request = self.context.get("request")
        url = obj.map_venue.map_image.url
        return request.build_absolute_uri(url) if request else url

    def get_map_image_preset(self, obj):
        return obj.map_venue.map_image_preset if obj.map_venue_id else ""

    def get_booths(self, obj):
        if not obj.map_venue_id:
            return []
        registrations = obj.booth_registrations.filter(
            status=BoothRegistration.Status.CONFIRMED
        ).select_related("booth", "vendor")
        return PublicBoothSerializer(registrations, many=True).data

    def get_sections(self, obj):
        if not obj.map_venue_id:
            return []
        # No sensitive data here (just a category + position), so this is
        # safe to expose as-is — no separate public-vs-admin serializer
        # needed like BoothRegistration has.
        return VenueSectionSerializer(obj.map_venue.sections.all(), many=True).data


class VendorBoothSerializer(serializers.Serializer):
    """
    Vendor-facing read-only view of one booth slot for an event they can
    browse — includes price (they need it to decide) and their own
    relationship to it (is it available, already theirs, someone else's,
    or a loyalty hold they can claim), but never any other vendor's
    identity beyond what's already public once confirmed.
    """

    id = serializers.IntegerField()
    booth_number = serializers.CharField()
    position_x = serializers.DecimalField(max_digits=5, decimal_places=2)
    position_y = serializers.DecimalField(max_digits=5, decimal_places=2)
    width = serializers.DecimalField(max_digits=5, decimal_places=2)
    height = serializers.DecimalField(max_digits=5, decimal_places=2)
    price = serializers.DecimalField(max_digits=8, decimal_places=2)
    availability = serializers.CharField()
    is_mine = serializers.BooleanField()
    registration_status = serializers.CharField(allow_null=True)
    registration_id = serializers.IntegerField(allow_null=True)
