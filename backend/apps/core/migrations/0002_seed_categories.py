from django.db import migrations

# The five categories that existed as a hardcoded choices= list before this
# migration (apps.core.constants.CATEGORY_CHOICES) — seeded here with their
# original slugs so every existing Listing.category / User.category_tags /
# VenueSection.category value still validates correctly afterwards.
CATEGORIES = [
    ("Vintage", "vintage"),
    ("Modern", "modern"),
    ("Pokémon", "pokemon"),
    ("Memorabilia", "memorabilia"),
    ("Supplies", "supplies"),
]


def seed_categories(apps, schema_editor):
    Category = apps.get_model("core", "Category")
    for order, (name, slug) in enumerate(CATEGORIES):
        Category.objects.get_or_create(slug=slug, defaults={"name": name, "order": order})


def remove_seeded_categories(apps, schema_editor):
    Category = apps.get_model("core", "Category")
    Category.objects.filter(slug__in=[slug for _, slug in CATEGORIES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_categories, remove_seeded_categories),
    ]
