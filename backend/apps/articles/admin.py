from django.contrib import admin

from .models import Article


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "archived", "author_name", "published_at", "updated_at")
    list_filter = ("status", "archived")
    search_fields = ("title", "summary", "author_name")
    prepopulated_fields = {"slug": ("title",)}
