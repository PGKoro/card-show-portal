from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0015_merge_0002_event_notes_0014_venue_archived"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql='ALTER TABLE "events_event" ADD COLUMN IF NOT EXISTS "announcement" text NOT NULL DEFAULT \'\';',
                    reverse_sql=migrations.RunSQL.noop,
                )
            ],
            state_operations=[
                migrations.AddField(
                    model_name="event",
                    name="announcement",
                    field=models.TextField(blank=True, default=""),
                )
            ],
        )
    ]
