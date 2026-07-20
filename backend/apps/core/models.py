from django.db import models
from django.utils.text import slugify


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
