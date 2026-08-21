from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify

# Real image types accepted for any admin-managed image upload on the site
# (currently just the homepage carousel) — kept as a shared constant so any
# future upload field validates against the same allow-list rather than
# each one drifting independently.
ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB


def validate_image_upload(file):
    """
    Shared validator for admin image uploads: enforced content-type
    allow-list plus a size cap, on top of whatever ImageField's own
    Pillow-backed validation already does (rejecting non-image bytes
    entirely). Raises ValidationError so it surfaces through DRF the same
    way any other field error would.
    """
    content_type = getattr(file, "content_type", None)
    if content_type and content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise ValidationError(
            "Unsupported image type. Please upload a JPEG, PNG, WEBP, or GIF file."
        )
    if file.size > MAX_IMAGE_UPLOAD_BYTES:
        raise ValidationError("Image files must be 8MB or smaller.")


class Category(models.Model):
    """
    Admin-managed vocabulary shared across the whole site: a listing's
    category, a vendor/customer's interest tags, and a venue floor-plan
    zone's category all validate against this same live list — instead of
    a hardcoded `choices=` tuple — so admins can add/remove/reorder entries
    without a code deploy. Existing rows elsewhere store the category as a
    plain slug string (Listing.category, User.category_tags,
    VenueSection.category) rather than a real ForeignKey, so deleting a
    Category here doesn't touch data that already used it — same as
    removing a value from an enum wouldn't.
    """

    name = models.CharField(max_length=50)
    # Generated once at creation (see save()) and never changed afterwards,
    # even if `name` is later edited — existing stored references (the
    # fields listed above) key off this value, so it has to stay stable.
    slug = models.SlugField(max_length=60, unique=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)[:60] or "category"
            slug = base_slug
            suffix = 2
            while Category.objects.filter(slug=slug).exists():
                suffix_str = f"-{suffix}"
                slug = f"{base_slug[:60 - len(suffix_str)]}{suffix_str}"
                suffix += 1
            self.slug = slug
        super().save(*args, **kwargs)


class HomeCarouselSlide(models.Model):
    """
    A single image in the homepage hero carousel — admin-managed so the
    slideshow can be edited (add/remove/reorder/caption) without a code
    deploy, replacing what used to be a hardcoded frontend image list
    (HERO_IMAGES in app/page.tsx). `order` controls display sequence, same
    convention as Category.order; `active` lets an admin hide a slide
    without losing its caption/link/upload (soft toggle, same shape as
    Event.archived) rather than only ever deleting.
    """

    image = models.ImageField(upload_to="carousel/", validators=[validate_image_upload])
    caption = models.CharField(max_length=200, blank=True)
    alt_text = models.CharField(max_length=200, blank=True)
    link_url = models.CharField(max_length=500, blank=True)
    order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.caption or f"Slide {self.pk}"


class SiteSettings(models.Model):
    """
    A single-row table of site-wide toggles an admin manages from Manage
    Website — the general-purpose home for any future "flip a feature on/
    off without a deploy" setting, starting with the public Articles nav
    tab. Deliberately not per-feature tables: one row, one field per
    toggle, so adding the next setting is a migration adding a column here
    rather than a whole new model.

    Enforced as a true singleton via load()/save() below rather than a
    OneToOneField pattern — there's no "owner" row this settings object
    belongs to, so a plain single-row table with a fixed pk is the
    simplest fit.
    """

    SINGLETON_PK = 1

    # Controls whether "Articles" appears in the public site's top nav —
    # never touches Article rows themselves (drafts/published/archived
    # all persist regardless), same soft-hide reasoning as
    # HomeCarouselSlide.active.
    articles_tab_enabled = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Site settings"
        verbose_name_plural = "Site settings"

    def __str__(self):
        return "Site settings"

    def save(self, *args, **kwargs):
        self.pk = self.SINGLETON_PK
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=cls.SINGLETON_PK)
        return obj
