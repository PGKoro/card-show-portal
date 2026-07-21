from django.db import migrations

# The same placeholder show names originally seeded by 0002_seed_events and
# re-seeded by 0011_restore_example_events (get_or_create brought them back
# even after they'd been removed as part of the site's "no fake data"
# pass). Deleted for good this time — real events come from admins using
# Manage Events; this project doesn't ship with example show data.
EXAMPLE_EVENT_NAMES = [
    "Chicagoland Summer Slam",
    "Lone Star Card Expo",
    "Pacific Northwest Showdown",
    "East Coast Card Fest",
    "Gulf Coast Collectors Con",
    "Midwest Vintage Classic",
    "Winter Hobby Showcase",
]


def remove_example_events(apps, schema_editor):
    Event = apps.get_model("events", "Event")
    Event.objects.filter(name__in=EXAMPLE_EVENT_NAMES).delete()


def noop(apps, schema_editor):
    # Deliberately doesn't restore the placeholder events on a
    # migrate-backwards — there's no scenario where bringing them back is
    # the right move.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0012_add_archived_to_event"),
    ]

    operations = [
        migrations.RunPython(remove_example_events, noop),
    ]
