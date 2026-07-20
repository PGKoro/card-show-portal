from django.urls import path

from .views import HealthCheckView, PublicCategoryListView

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("categories/", PublicCategoryListView.as_view(), name="category-list"),
]
