# Generated manually to add archived support to Event

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0011_restore_example_events"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="archived",
            field=models.BooleanField(default=False),
        ),
    ]
