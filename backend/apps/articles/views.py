from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAdminRole

from .models import Article
from .serializers import (
    AdminArticleSerializer,
    PublicArticleDetailSerializer,
    PublicArticleListSerializer,
)


def published_articles_queryset():
    """
    Shared scoping for every public articles endpoint: only published,
    non-archived articles, newest published first — never drafts or
    archived rows regardless of how they're reached (list or a direct
    detail URL by slug/id).
    """
    return Article.objects.filter(status=Article.Status.PUBLISHED, archived=False)


class PublicArticleListView(generics.ListAPIView):
    """
    GET /api/v1/articles/ — the public Articles page feed. Model ordering
    (Article.Meta.ordering) already sorts newest-published-first.
    """

    permission_classes = [AllowAny]
    serializer_class = PublicArticleListSerializer
    queryset = published_articles_queryset()


class PublicArticleDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/articles/<slug>/ — an individual article's own page.
    Looked up by slug (not id) so URLs read like /articles/some-title
    rather than /articles/42 — same reasoning as apps.core.Category
    freezing a readable slug at creation. 404s for a draft/archived
    article exactly like it doesn't exist, rather than exposing its
    existence via a 403.
    """

    permission_classes = [AllowAny]
    serializer_class = PublicArticleDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return published_articles_queryset()


class AdminArticleListCreateView(generics.ListCreateAPIView):
    """
    GET/POST /api/v1/admin/articles/ — Article Creator's main screen: every
    article regardless of status/archived (the list page itself filters
    what it displays), plus creating a new one. Multipart parsing since an
    article can be created with a cover image attached; JSONParser is also
    allowed so a save that isn't touching the image can send plain JSON
    (matches how AdminUserDetailView-style PATCHes work elsewhere).
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = AdminArticleSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None

    def get_queryset(self):
        queryset = Article.objects.all()
        status_filter = self.request.query_params.get("status", "").strip()
        if status_filter in (Article.Status.DRAFT, Article.Status.PUBLISHED):
            queryset = queryset.filter(status=status_filter)
        archived_filter = self.request.query_params.get("archived", "").strip()
        if archived_filter == "1":
            queryset = queryset.filter(archived=True)
        elif archived_filter == "0":
            queryset = queryset.filter(archived=False)
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(author_name__icontains=search)
                | Q(summary__icontains=search)
            )
        return queryset.order_by("-updated_at")


class AdminArticleDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET (load into the editor) / PATCH (save draft/edit) /
    DELETE (permanent delete) /api/v1/admin/articles/<id>/. Looked up by
    id, not slug — unlike the public detail view, the admin editor always
    knows the exact row it's working with from the list page, and an id
    stays stable even across a title edit (a slug only changes at
    creation, per Article.save(), but there's no reason to depend on that
    invariant here too).
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = AdminArticleSerializer
    queryset = Article.objects.all()
    parser_classes = [MultiPartParser, FormParser, JSONParser]


class AdminArticleActionView(APIView):
    """
    POST /api/v1/admin/articles/<id>/<action>/ — the list page's one-click
    status buttons, so flipping status doesn't require opening the full
    editor. `action` is one of publish/unpublish/archive/restore, wired as
    separate URL entries below rather than a single endpoint taking an
    action in the body — matches the rest of this codebase's convention
    (see ApproveVendorView/RejectVendorView, RestoreUserView) of a
    dedicated endpoint per lifecycle transition.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    action_name = None

    def post(self, request, pk):
        article = get_object_or_404(Article, pk=pk)
        if self.action_name == "publish":
            article.status = Article.Status.PUBLISHED
            article.save()
        elif self.action_name == "unpublish":
            article.status = Article.Status.DRAFT
            article.save(update_fields=["status", "updated_at"])
        elif self.action_name == "archive":
            article.archived = True
            article.save(update_fields=["archived", "updated_at"])
        elif self.action_name == "restore":
            article.archived = False
            article.save(update_fields=["archived", "updated_at"])
        return Response(AdminArticleSerializer(article, context={"request": request}).data)


class AdminArticlePublishView(AdminArticleActionView):
    action_name = "publish"


class AdminArticleUnpublishView(AdminArticleActionView):
    action_name = "unpublish"


class AdminArticleArchiveView(AdminArticleActionView):
    action_name = "archive"


class AdminArticleRestoreView(AdminArticleActionView):
    action_name = "restore"
