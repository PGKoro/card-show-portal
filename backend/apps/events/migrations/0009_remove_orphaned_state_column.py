from django.db import migrations


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    """
    A prior `state` field on Event was added via a migration that was never
    committed to source control and was later removed from the codebase
    entirely (the feature was reverted) — but the DB column it created was
    never dropped, leaving a NOT NULL column with no way to populate it via
    the current model/serializer. This drops that orphaned column.
    """

    dependencies = [
        ("events", "0008_remove_mapsection_event_remove_event_map_image_and_more"),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER TABLE events_event DROP COLUMN IF EXISTS state;",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
