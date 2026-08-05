from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0015_merge_0002_event_notes_0014_venue_archived"),
    ]

    def add_announcement_column(apps, schema_editor):
        if schema_editor.connection.vendor != "postgresql":
            return
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                'ALTER TABLE "events_event" ADD COLUMN IF NOT EXISTS "announcement" text NOT NULL DEFAULT \'\';'
            )

    operations = [
        migrations.RunPython(add_announcement_column, migrations.RunPython.noop),
        migrations.AddField(
            model_name="event",
            name="announcement",
            field=models.TextField(blank=True, default=""),
        ),
    ]
