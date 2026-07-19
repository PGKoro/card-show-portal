from django.db import migrations


def port_data(apps, schema_editor):
    Event = apps.get_model("events", "Event")
    Venue = apps.get_model("events", "Venue")
    Booth = apps.get_model("events", "Booth")
    VenueSection = apps.get_model("events", "VenueSection")
    BoothAssignment = apps.get_model("events", "BoothAssignment")
    MapSection = apps.get_model("events", "MapSection")
    BoothRegistration = apps.get_model("events", "BoothRegistration")

    for event in Event.objects.all():
        assignments = list(BoothAssignment.objects.filter(event=event))
        sections = list(MapSection.objects.filter(event=event))
        has_map = bool(event.map_image) or bool(event.map_image_preset)
        if not (has_map or assignments or sections):
            continue

        venue = Venue.objects.create(
            name=event.venue or event.name,
            city=event.city,
            map_image=event.map_image,
            map_image_preset=event.map_image_preset,
        )
        event.map_venue = venue
        event.save(update_fields=["map_venue"])

        for assignment in assignments:
            booth = Booth.objects.create(
                venue=venue,
                booth_number=assignment.booth_number,
                position_x=assignment.position_x,
                position_y=assignment.position_y,
                width=assignment.width,
                height=assignment.height,
                price=0,
            )
            # Existing assignments were already admin-placed, so they carry
            # over as "confirmed" — there was no request/decision step
            # before this feature existed.
            BoothRegistration.objects.create(
                event=event,
                booth=booth,
                vendor=assignment.vendor,
                unlinked_vendor_name=assignment.unlinked_vendor_name,
                unlinked_vendor_category=assignment.unlinked_vendor_category,
                unlinked_vendor_contact=assignment.unlinked_vendor_contact,
                status="confirmed",
                price=0,
                decided_at=assignment.updated_at,
            )

        for section in sections:
            VenueSection.objects.create(
                venue=venue,
                category=section.category,
                position_x=section.position_x,
                position_y=section.position_y,
                width=section.width,
                height=section.height,
            )


def unport_data(apps, schema_editor):
    # Not meaningfully reversible (would mean folding Venue data back into
    # Event's old fields) — acceptable since this is a local-dev migration,
    # not a production rollback path.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0006_venue_event_loyalty_priority_deadline_and_more"),
    ]

    operations = [
        migrations.RunPython(port_data, unport_data),
    ]
