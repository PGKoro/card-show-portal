from django.contrib import admin

from .models import Event


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("name", "venue", "city", "start_date", "end_date", "estimated_attendees")
    list_filter = ("city",)
    search_fields = ("name", "venue", "city")
    filter_horizontal = ("vendors",)
