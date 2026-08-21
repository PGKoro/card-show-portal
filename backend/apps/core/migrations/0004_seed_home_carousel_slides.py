"""
Seeds the 3 homepage hero-carousel images that used to be hardcoded as
HERO_IMAGES in frontend/app/page.tsx (frontend/public/cardshow{1,2,3}.*)
into HomeCarouselSlide rows, so the site keeps showing the same photos on
day one after this feature ships, and every environment (including a
fresh `docker compose up` or CI's test database) gets the same starting
carousel rather than an empty one.

The source images live in the frontend's static /public folder, which
this backend app has no import-time access to across environments (CI,
production) — so this migration copies the bytes in directly rather than
pointing ImageField at a path, matching how any other data migration must
be self-contained.
"""

import os

from django.core.files.base import ContentFile
from django.db import migrations

# Relative to this migration file: backend/apps/core/migrations/ -> repo
# root -> frontend/public/.
_REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
)
_SEED_IMAGES = [
    ("cardshow1.webp", "Card show floor"),
    ("cardshow2.avif", "Card show floor"),
    ("cardshow3.jpeg", "Card show floor"),
]


def seed_carousel_slides(apps, schema_editor):
    HomeCarouselSlide = apps.get_model("core", "HomeCarouselSlide")
    if HomeCarouselSlide.objects.exists():
        return

    for order, (filename, alt_text) in enumerate(_SEED_IMAGES):
        source_path = os.path.join(_REPO_ROOT, "frontend", "public", filename)
        if not os.path.exists(source_path):
            # Best-effort seed: an environment without the frontend
            # checkout alongside it (e.g. a backend-only deploy) just
            # skips straight to an empty carousel rather than failing the
            # migration outright.
            continue
        with open(source_path, "rb") as f:
            content = ContentFile(f.read(), name=filename)
        HomeCarouselSlide.objects.create(
            image=content,
            alt_text=alt_text,
            order=order,
            active=True,
        )


def remove_seeded_slides(apps, schema_editor):
    HomeCarouselSlide = apps.get_model("core", "HomeCarouselSlide")
    seeded_names = {filename for filename, _ in _SEED_IMAGES}
    for slide in HomeCarouselSlide.objects.all():
        if os.path.basename(slide.image.name) in seeded_names:
            slide.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_home_carousel_slide"),
    ]

    operations = [
        migrations.RunPython(seed_carousel_slides, remove_seeded_slides),
    ]
