import datetime

from django.conf import settings
from django.db import models


class Event(models.Model):
    """
    A card show/convention. Publicly browsable; only admins can create or
    edit one (see apps.core.permissions.IsAdminRole).
    """

    name = models.CharField(max_length=200)
    venue = models.CharField(max_length=200)
    city = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    start_date = models.DateField()
    # Optional — a single-day event can leave this blank.
    end_date = models.DateField(null=True, blank=True)

    # Real vendor accounts attached to the event. estimated_cards/attendees
    # below are manually-entered admin estimates, not derived from anything,
    # since we have no real way to measure those yet.
    vendors = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="events_attending",
        limit_choices_to={"role": "vendor"},
    )
    estimated_cards = models.PositiveIntegerField(default=0)
    estimated_attendees = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_date"]

    def __str__(self):
        return self.name

    @property
    def status(self):
        reference_date = self.end_date or self.start_date
        return "upcoming" if reference_date >= datetime.date.today() else "past"

    @property
    def vendor_count(self):
        return self.vendors.count()
