from rest_framework import serializers

from .models import Category, HomeCarouselSlide, SiteSettings


class CategorySerializer(serializers.ModelSerializer):
    """
    `name` is the only writable field once created — `slug` and `order`
    are server-managed (slug is frozen at creation, see Category.save();
    order is only ever changed via the dedicated move endpoint) so this
    serializer never accepts either from the client.
    """

    class Meta:
        model = Category
        fields = ("id", "name", "slug", "order")
        read_only_fields = ("id", "slug", "order")


class HomeCarouselSlidePublicSerializer(serializers.ModelSerializer):
    """
    Read-only shape the homepage fetches — just what's needed to render a
    slide. `image` resolves to an absolute URL (see get_image) rather than
    the raw storage path, same convention as EventSerializer's
    logo_image_url/map_image_url.
    """

    image = serializers.SerializerMethodField()

    class Meta:
        model = HomeCarouselSlide
        fields = ("id", "image", "caption", "alt_text", "link_url")

    def get_image(self, obj):
        if not obj.image:
            return None
        url = obj.image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class HomeCarouselSlideAdminSerializer(serializers.ModelSerializer):
    """
    Manage Website's carousel editor. `image` is write-only (accepts a
    fresh upload on create, optional on update — an admin editing just the
    caption shouldn't have to re-upload the file) — `image_url` is what
    the admin UI actually renders back, same split as VenueMapImageUploadView's
    map_image/map_image_url. `order` is set by AdminCarouselSlideReorderView,
    not accepted here, matching Category's move-endpoint-only ordering.
    """

    image_url = serializers.SerializerMethodField()

    class Meta:
        model = HomeCarouselSlide
        fields = (
            "id",
            "image",
            "image_url",
            "caption",
            "alt_text",
            "link_url",
            "order",
            "active",
            "created_at",
        )
        read_only_fields = ("id", "order", "created_at")
        extra_kwargs = {"image": {"write_only": True, "required": False}}

    def get_image_url(self, obj):
        if not obj.image:
            return None
        url = obj.image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def validate(self, attrs):
        # A brand-new slide has to come with an image — updating an
        # existing one doesn't (self.instance is set, and it already has
        # one), same distinction VenueMapImageUploadView draws between a
        # required upload and an optional replace.
        if self.instance is None and not attrs.get("image"):
            raise serializers.ValidationError({"image": ["This field is required."]})
        return attrs


class SiteSettingsSerializer(serializers.ModelSerializer):
    """
    Shared by the public GET (NavBar/Footer deciding whether to show
    Articles) and the admin GET/PATCH (Manage Website's toggle) — same
    read shape either way, just gated differently at the view level.
    """

    class Meta:
        model = SiteSettings
        fields = ("articles_tab_enabled",)
