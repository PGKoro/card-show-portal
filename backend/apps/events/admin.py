from django.contrib import admin

from .models import BoothAssignment, Event


class BoothAssignmentInline(admin.TabularInline):
    model = BoothAssignment
    extra = 0
    fields = (
        "booth_number",
        "position_x",
        "position_y",
        "width",
        "height",
        "vendor",
        "unlinked_vendor_name",
        "unlinked_vendor_category",
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
        "map_visible",
    )
    list_filter = ("city", "map_visible")
    search_fields = ("name", "venue", "city")
    filter_horizontal = ("vendors",)
    inlines = [BoothAssignmentInline]
