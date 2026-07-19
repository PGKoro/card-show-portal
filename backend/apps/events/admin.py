from django.contrib import admin

from .models import Booth, BoothRegistration, Event, Venue, VenueSection


class BoothInline(admin.TabularInline):
    model = Booth
    extra = 0
    fields = ("booth_number", "position_x", "position_y", "width", "height", "price")


class VenueSectionInline(admin.TabularInline):
    model = VenueSection
    extra = 0
    fields = ("category", "position_x", "position_y", "width", "height")


@admin.register(Venue)
class VenueAdmin(admin.ModelAdmin):
    list_display = ("name", "city", "created_at")
    search_fields = ("name", "city")
    inlines = [BoothInline, VenueSectionInline]


class BoothRegistrationInline(admin.TabularInline):
    model = BoothRegistration
    extra = 0
    fields = (
        "booth",
        "status",
        "vendor",
        "unlinked_vendor_name",
        "unlinked_vendor_category",
        "price",
    )


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "venue",
        "city",
        "start_date",
        "end_date",
        "estimated_attendees",
        "map_venue",
        "map_visible",
        "map_visible_to_vendors",
    )
    list_filter = ("city", "map_visible", "map_visible_to_vendors")
    search_fields = ("name", "venue", "city")
    filter_horizontal = ("vendors",)
    inlines = [BoothRegistrationInline]
