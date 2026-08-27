from django.urls import path

from .views import (
    DealerCardSubmissionListCreateView,
    PublicCardDetailView,
    PublicCardSetDetailView,
    PublicCardSetListView,
    PublicCollectionsCompanyListView,
    PublicCollectionsSearchView,
    PublicCollectionsYearListView,
    PublicSetCardListView,
)

urlpatterns = [
    path("years/", PublicCollectionsYearListView.as_view(), name="collections-year-list"),
    path("companies/", PublicCollectionsCompanyListView.as_view(), name="collections-company-list"),
    path("search/", PublicCollectionsSearchView.as_view(), name="collections-search"),
    path("sets/", PublicCardSetListView.as_view(), name="collections-set-list"),
    path("sets/<int:pk>/", PublicCardSetDetailView.as_view(), name="collections-set-detail"),
    path("sets/<int:pk>/cards/", PublicSetCardListView.as_view(), name="collections-set-cards"),
    path("cards/<int:pk>/", PublicCardDetailView.as_view(), name="collections-card-detail"),
    path(
        "submissions/",
        DealerCardSubmissionListCreateView.as_view(),
        name="collections-dealer-submissions",
    ),
]
