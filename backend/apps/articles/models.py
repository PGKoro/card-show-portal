from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from apps.core.models import validate_image_upload


class Article(models.Model):
    """
    A publishable long-form article (news/blog-style content), separate
    from Listing/Event — no vendor/venue relationship, just editorial
    content an admin writes and publishes. Kept intentionally simple: no
    rich-text/HTML field (nothing in this stack renders sanitized HTML —
    see `body`), no per-tag model (tags are informal here, same reasoning
    as Listing.category being a plain string rather than a FK before
    apps.core.Category existed).
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    title = models.CharField(max_length=200)
    # Generated once at creation from title (see save()) and never changed
    # afterwards, even if title is later edited — an already-shared
    # article URL (/articles/<slug>) has to keep resolving. Same frozen-
    # slug convention as apps.core.Category.
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    summary = models.CharField(max_length=300, blank=True)
    author_name = models.CharField(max_length=120, blank=True)
    # A list of typed content blocks, e.g.
    # [{"type": "heading", "text": "..."}, {"type": "paragraph", "text": "..."}]
    # rather than one HTML/markdown string — this stack has no
    # rich-text-rendering or HTML-sanitizing library, so a structured list
    # the frontend maps straight to real <h2>/<p> tags is both simpler and
    # safer than storing/rendering raw HTML.
    body = models.JSONField(default=list, blank=True)
    cover_image = models.ImageField(
        upload_to="articles/", null=True, blank=True, validators=[validate_image_upload]
    )
    tags = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    # Independent of `status` — same soft-hide pattern as Event.archived /
    # Venue.archived: an archived article is pulled from every public
    # listing without losing the row (its history, tags, body, etc.).
    archived = models.BooleanField(default=False)
    # Set the first time an article's status flips to `published` (see
    # save()) and never touched again afterwards — a later unpublish/
    # republish cycle doesn't reset it, so "publish date" stays meaningful
    # for sorting/display even if an admin briefly drafts it again.
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-published_at", "-created_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.title)[:220] or "article"
            slug = base_slug
            suffix = 2
            while Article.objects.filter(slug=slug).exists():
                suffix_str = f"-{suffix}"
                slug = f"{base_slug[:220 - len(suffix_str)]}{suffix_str}"
                suffix += 1
            self.slug = slug
        if self.status == Article.Status.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)
