from django.urls import path

from .views import PublicArticleDetailView, PublicArticleListView

urlpatterns = [
    path("", PublicArticleListView.as_view(), name="public-article-list"),
    path("<slug:slug>/", PublicArticleDetailView.as_view(), name="public-article-detail"),
]
