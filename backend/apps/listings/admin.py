from django.contrib import admin

from .models import Listing


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = ("title", "vendor", "category", "price", "status", "created_at")
    list_filter = ("category", "status", "grading")
    search_fields = ("title", "vendor__email", "vendor__business_name")
