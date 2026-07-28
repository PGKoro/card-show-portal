from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0006_user_also_buying_user_collection_size_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="flagged",
            field=models.BooleanField(default=False),
        ),
    ]
