from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0004_add_flagged_to_user"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="notes",
            field=models.TextField(blank=True, default=""),
        ),
    ]
