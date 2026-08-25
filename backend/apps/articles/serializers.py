import re

from rest_framework import serializers

from .models import Article

ALLOWED_BLOCK_TYPES = {"heading", "paragraph", "bulleted_list", "numbered_list"}
# Inline markup the admin editor's toolbar can insert into any block's text
# (**bold**, *italic*, [label](url)) — validated here so a body can never
# contain a link to something other than http(s):// or a same-site path,
# same allow-list reasoning as validate_image_upload's content-type check.
_LINK_HREF_PATTERN = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def _validate_href(href: str) -> bool:
    return href.startswith("http://") or href.startswith("https://") or href.startswith("/")


class PublicArticleListSerializer(serializers.ModelSerializer):
    """
    The Articles listing page's card shape — everything shown on the
    /articles grid without needing the full body (kept off this one; the
    detail page fetches that separately, same split as
    PublicListingSerializer vs the full listing detail).
    """

    cover_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = (
            "id",
            "slug",
            "title",
            "summary",
            "author_name",
            "published_at",
            "cover_image_url",
            "tags",
        )
        read_only_fields = fields

    def get_cover_image_url(self, obj):
        if not obj.cover_image:
            return None
        url = obj.cover_image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class PublicArticleDetailSerializer(PublicArticleListSerializer):
    """Adds the full body for an individual article's own page."""

    class Meta(PublicArticleListSerializer.Meta):
        fields = PublicArticleListSerializer.Meta.fields + ("body",)
        read_only_fields = fields


def validate_article_body(value):
    """
    Shared body validator for the admin create/edit serializer below.
    `body` is never raw HTML (see Article.body's docstring) — it's a list
    of typed blocks the frontend maps straight to real tags, so there's no
    injection surface to sanitize beyond: enforcing the block shape itself
    (a malformed block could otherwise crash the public renderer) and
    checking that any [label](href) markup only points at http(s):// or a
    same-site path, never something like javascript:.
    """
    if not isinstance(value, list):
        raise serializers.ValidationError("Body must be a list of content blocks.")

    for index, block in enumerate(value):
        if not isinstance(block, dict):
            raise serializers.ValidationError(f"Block {index + 1} must be an object.")
        block_type = block.get("type")
        if block_type not in ALLOWED_BLOCK_TYPES:
            raise serializers.ValidationError(
                f"Block {index + 1} has an unsupported type: {block_type!r}."
            )

        if block_type in ("heading", "paragraph"):
            text = block.get("text")
            if not isinstance(text, str):
                raise serializers.ValidationError(
                    f"Block {index + 1} ({block_type}) must have string text."
                )
            for _, href in _LINK_HREF_PATTERN.findall(text):
                if not _validate_href(href):
                    raise serializers.ValidationError(
                        f"Block {index + 1} has a link with an unsupported URL: {href!r}. "
                        "Links must start with http://, https://, or /."
                    )
        else:  # bulleted_list / numbered_list
            items = block.get("items")
            if not isinstance(items, list) or not all(isinstance(i, str) for i in items):
                raise serializers.ValidationError(
                    f"Block {index + 1} ({block_type}) must have a list of string items."
                )
            for item in items:
                for _, href in _LINK_HREF_PATTERN.findall(item):
                    if not _validate_href(href):
                        raise serializers.ValidationError(
                            f"Block {index + 1} has a link with an unsupported URL: {href!r}. "
                            "Links must start with http://, https://, or /."
                        )
    return value


def validate_article_tags(value):
    if not isinstance(value, list) or not all(isinstance(t, str) for t in value):
        raise serializers.ValidationError("Tags must be a list of strings.")
    cleaned = []
    for tag in value:
        tag = tag.strip()
        if not tag:
            continue
        if len(tag) > 40:
            raise serializers.ValidationError("Each tag must be 40 characters or fewer.")
        if tag not in cleaned:
            cleaned.append(tag)
    return cleaned


class AdminArticleSerializer(serializers.ModelSerializer):
    """
    Article Creator's full read/write shape. `cover_image` is write-only
    (accepts a fresh upload on create, optional replace on update) —
    `cover_image_url` is what the admin UI actually renders back, same
    split HomeCarouselSlideAdminSerializer uses for its image field.
    `status`/`archived` are writable here (unlike HomeCarouselSlide's
    `active`, which only ever gets flipped, an article's lifecycle is a
    first-class part of this editor) but publish/unpublish/archive/
    restore also have their own dedicated action endpoints for the list
    page's one-click buttons, so the editor form doesn't have to be open
    to change status.
    """

    cover_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = (
            "id",
            "slug",
            "title",
            "summary",
            "author_name",
            "body",
            "cover_image",
            "cover_image_url",
            "tags",
            "status",
            "archived",
            "published_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "published_at", "created_at", "updated_at")
        extra_kwargs = {"cover_image": {"write_only": True, "required": False}}

    def get_cover_image_url(self, obj):
        if not obj.cover_image:
            return None
        url = obj.cover_image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def validate_title(self, value):
        if not value.strip():
            raise serializers.ValidationError("Title can't be blank.")
        return value

    def validate_body(self, value):
        return validate_article_body(value)

    def validate_tags(self, value):
        return validate_article_tags(value)
