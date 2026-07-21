import datetime

from django.db import migrations

EXAMPLE_EVENTS = [
    {
        "name": "Chicagoland Summer Slam",
        "city": "Rosemont, IL",
        "venue": "Donald E. Stephens Convention Center",
        "start_date": datetime.date(2026, 7, 18),
        "end_date": datetime.date(2026, 7, 19),
        "description": (
            "The Midwest's biggest summer show, with a full floor of vintage, modern, and "
            "Pokémon dealers plus a dedicated grading submission booth."
        ),
        "estimated_cards": 250000,
        "estimated_attendees": 5500,
    },
    {
        "name": "Lone Star Card Expo",
        "city": "Austin, TX",
        "venue": "Austin Convention Center",
        "start_date": datetime.date(2026, 8, 8),
        "end_date": datetime.date(2026, 8, 9),
        "description": (
            "Texas' premier card show, known for its strong autograph and memorabilia "
            "presence alongside the usual vintage and modern tables."
        ),
        "estimated_cards": 160000,
        "estimated_attendees": 3800,
    },
    {
        "name": "Pacific Northwest Showdown",
        "city": "Seattle, WA",
        "venue": "Seattle Center Exhibition Hall",
        "start_date": datetime.date(2026, 9, 5),
        "end_date": datetime.date(2026, 9, 6),
        "description": (
            "A growing regional show with a heavy Pokémon and modern sports presence, "
            "plus a Saturday-night charity auction."
        ),
        "estimated_cards": 130000,
        "estimated_attendees": 3200,
    },
    {
        "name": "East Coast Card Fest",
        "city": "Philadelphia, PA",
        "venue": "Philadelphia Expo Center",
        "start_date": datetime.date(2026, 9, 26),
        "end_date": None,
        "description": (
            "A one-day show focused on vintage baseball and football, with several "
            "PSA/BGS-graded showcase cases on the floor."
        ),
        "estimated_cards": 95000,
        "estimated_attendees": 2400,
    },
    {
        "name": "Gulf Coast Collectors Con",
        "city": "Tampa, FL",
        "venue": "Tampa Convention Center",
        "start_date": datetime.date(2026, 5, 16),
        "end_date": datetime.date(2026, 5, 17),
        "description": (
            "One of the largest shows in the Southeast, drawing dealers from across "
            "Florida, Georgia, and the Carolinas."
        ),
        "estimated_cards": 180000,
        "estimated_attendees": 4200,
    },
    {
        "name": "Midwest Vintage Classic",
        "city": "Columbus, OH",
        "venue": "Greater Columbus Convention Center",
        "start_date": datetime.date(2026, 4, 11),
        "end_date": datetime.date(2026, 4, 12),
        "description": (
            "A vintage-focused show specializing in pre-war and golden-age cards, with "
            "several PSA-graded set breaks throughout the weekend."
        ),
        "estimated_cards": 210000,
        "estimated_attendees": 5100,
    },
    {
        "name": "Winter Hobby Showcase",
        "city": "Chicago, IL",
        "venue": "McCormick Place",
        "start_date": datetime.date(2026, 2, 21),
        "end_date": datetime.date(2026, 2, 22),
        "description": (
            "The largest indoor show of the year, spanning three exhibition halls with "
            "vintage, modern, Pokémon, and supplies all represented."
        ),
        "estimated_cards": 300000,
        "estimated_attendees": 6800,
    },
]


def seed_example_events(apps, schema_editor):
    Event = apps.get_model("events", "Event")
    for event_data in EXAMPLE_EVENTS:
        Event.objects.get_or_create(name=event_data["name"], defaults=event_data)


def remove_example_events(apps, schema_editor):
    Event = apps.get_model("events", "Event")
    Event.objects.filter(name__in=[event["name"] for event in EXAMPLE_EVENTS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0010_alter_venuesection_category"),
    ]

    operations = [
        migrations.RunPython(seed_example_events, remove_example_events),
    ]
