from django.db import migrations


class Migration(migrations.Migration):
    """
    A prior `state` field on Event was added via a migration that was never
    committed to source control and was later removed from the codebase
    entirely (the feature was reverted) — but the DB column it created was
    never dropped. This migration removes it on PostgreSQL and no-ops on
    databases that never had the column.
    """

    dependencies = [
        ("events", "0008_remove_mapsection_event_remove_event_map_image_and_more"),
    ]

    def drop_state_column(apps, schema_editor):
        if schema_editor.connection.vendor != "postgresql":
            return
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_name = 'events_event'
                          AND column_name = 'state'
                    ) THEN
                        EXECUTE 'ALTER TABLE events_event DROP COLUMN state';
                    END IF;
                END $$;
                """
            )

    operations = [
        migrations.RunPython(drop_state_column, migrations.RunPython.noop),
    ]
