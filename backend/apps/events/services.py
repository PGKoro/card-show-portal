from .models import BoothRegistration, Event


def create_loyalty_holds(event):
    """
    For every booth that had a CONFIRMED registration at the venue's most
    recent PRIOR event, create a loyalty_hold registration for that same
    vendor on `event` — giving them first refusal until
    event.loyalty_priority_deadline (see BoothRegistration.Status). A no-op
    if the event has no venue, no deadline set (a deadline is what makes a
    hold meaningful), or no prior event at that venue. Safe to call more
    than once (e.g. after either the venue or the deadline is set/changed)
    — already-active registrations on a booth are left alone.
    """
    if not event.map_venue_id or not event.loyalty_priority_deadline:
        return

    prior_event = (
        Event.objects.filter(map_venue_id=event.map_venue_id, start_date__lt=event.start_date)
        .exclude(pk=event.pk)
        .order_by("-start_date")
        .first()
    )
    if not prior_event:
        return

    prior_confirmed = BoothRegistration.objects.filter(
        event=prior_event, status=BoothRegistration.Status.CONFIRMED
    ).select_related("booth")

    for prior_registration in prior_confirmed:
        already_active = BoothRegistration.objects.filter(
            event=event,
            booth_id=prior_registration.booth_id,
            status__in=BoothRegistration.ACTIVE_STATUSES,
        ).exists()
        if already_active:
            continue

        BoothRegistration.objects.create(
            event=event,
            booth_id=prior_registration.booth_id,
            vendor_id=prior_registration.vendor_id,
            unlinked_vendor_name=prior_registration.unlinked_vendor_name,
            unlinked_vendor_category=prior_registration.unlinked_vendor_category,
            unlinked_vendor_contact=prior_registration.unlinked_vendor_contact,
            status=BoothRegistration.Status.LOYALTY_HOLD,
            price=prior_registration.booth.price,
        )
