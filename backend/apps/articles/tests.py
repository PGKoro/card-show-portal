import io
import shutil
import tempfile
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User

from .models import Article


def make_test_image(name="cover.png", content_type="image/png"):
    """A minimal valid 1x1 PNG, small enough to keep tests fast."""
    buffer = io.BytesIO()
    Image.new("RGB", (1, 1)).save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type=content_type)


class ArticleModelTests(APITestCase):
    def test_slug_auto_generated_from_title(self):
        article = Article.objects.create(title="Spring Show Recap")
        self.assertEqual(article.slug, "spring-show-recap")

    def test_slug_collision_gets_a_numeric_suffix(self):
        Article.objects.create(title="Big News")
        second = Article.objects.create(title="Big News")
        self.assertEqual(second.slug, "big-news-2")

    def test_editing_title_does_not_change_an_existing_slug(self):
        article = Article.objects.create(title="Original Title")
        article.title = "Updated Title"
        article.save()
        article.refresh_from_db()
        self.assertEqual(article.slug, "original-title")
        self.assertEqual(article.title, "Updated Title")

    def test_publishing_sets_published_at_once(self):
        article = Article.objects.create(title="Draft to Publish", status=Article.Status.DRAFT)
        self.assertIsNone(article.published_at)
        article.status = Article.Status.PUBLISHED
        article.save()
        article.refresh_from_db()
        first_published_at = article.published_at
        self.assertIsNotNone(first_published_at)

        # Unpublishing and republishing doesn't reset the original date —
        # it stays meaningful for "first published" sorting/display.
        article.status = Article.Status.DRAFT
        article.save()
        article.status = Article.Status.PUBLISHED
        article.save()
        article.refresh_from_db()
        self.assertEqual(article.published_at, first_published_at)


class PublicArticleApiTests(APITestCase):
    def setUp(self):
        Article.objects.all().delete()

    def make_published(self, title, **kwargs):
        published_at = kwargs.pop("published_at", timezone.now())
        article = Article.objects.create(
            title=title, status=Article.Status.PUBLISHED, **kwargs
        )
        # Bypass save()'s "only set on first publish" logic in tests that
        # need explicit control over ordering.
        Article.objects.filter(pk=article.pk).update(published_at=published_at)
        article.refresh_from_db()
        return article

    def test_list_only_returns_published_non_archived_articles(self):
        self.make_published("Visible Article")
        Article.objects.create(title="Still a Draft", status=Article.Status.DRAFT)
        self.make_published("Archived Article", archived=True)

        response = self.client.get("/api/v1/articles/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item["title"] for item in response.data["results"]]
        self.assertEqual(titles, ["Visible Article"])

    def test_list_sorts_newest_published_first(self):
        now = timezone.now()
        oldest = self.make_published("Oldest", published_at=now - timedelta(days=2))
        newest = self.make_published("Newest", published_at=now)
        middle = self.make_published("Middle", published_at=now - timedelta(days=1))

        response = self.client.get("/api/v1/articles/")
        titles = [item["title"] for item in response.data["results"]]
        self.assertEqual(titles, [newest.title, middle.title, oldest.title])

    def test_list_includes_expected_public_fields(self):
        self.make_published(
            "Full Fields",
            summary="A quick summary",
            author_name="Jane Doe",
            tags=["news", "shows"],
        )
        response = self.client.get("/api/v1/articles/")
        item = response.data["results"][0]
        self.assertEqual(item["summary"], "A quick summary")
        self.assertEqual(item["author_name"], "Jane Doe")
        self.assertEqual(item["tags"], ["news", "shows"])
        self.assertIn("slug", item)
        self.assertIn("published_at", item)
        self.assertIn("cover_image_url", item)
        # The body is intentionally omitted from the list shape.
        self.assertNotIn("body", item)

    def test_detail_returns_full_body_for_a_published_article(self):
        article = self.make_published(
            "Detailed Article",
            body=[
                {"type": "heading", "text": "Section one"},
                {"type": "paragraph", "text": "Some paragraph text."},
            ],
        )
        response = self.client.get(f"/api/v1/articles/{article.slug}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "Detailed Article")
        self.assertEqual(len(response.data["body"]), 2)
        self.assertEqual(response.data["body"][0]["type"], "heading")

    def test_detail_404s_for_a_draft_article(self):
        draft = Article.objects.create(title="Not Published Yet", status=Article.Status.DRAFT)
        response = self.client.get(f"/api/v1/articles/{draft.slug}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_detail_404s_for_an_archived_article(self):
        archived = self.make_published("Was Public", archived=True)
        response = self.client.get(f"/api/v1/articles/{archived.slug}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_detail_404s_for_an_unknown_slug(self):
        response = self.client.get("/api/v1/articles/does-not-exist/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


@override_settings(MEDIA_URL="/media/")
class ArticleCoverImageTests(APITestCase):
    def test_list_serializes_a_null_cover_image_as_null(self):
        Article.objects.all().delete()
        article = Article.objects.create(title="No Cover Image", status=Article.Status.PUBLISHED)
        Article.objects.filter(pk=article.pk).update(published_at=timezone.now())
        response = self.client.get("/api/v1/articles/")
        self.assertIsNone(response.data["results"][0]["cover_image_url"])


class AdminArticleApiTests(APITestCase):
    """Covers Article Creator: the full admin lifecycle + permissions + validation."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._temp_media_root = tempfile.mkdtemp()
        cls._media_override = override_settings(MEDIA_ROOT=cls._temp_media_root)
        cls._media_override.enable()
        cls._shutil = shutil

    @classmethod
    def tearDownClass(cls):
        cls._media_override.disable()
        cls._shutil.rmtree(cls._temp_media_root, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        Article.objects.all().delete()
        self.admin = User.objects.create_user(
            email="article-admin@example.com", password="s3cret!23", role=User.Role.ADMIN
        )
        self.customer = User.objects.create_user(
            email="article-cust@example.com", password="s3cret!23"
        )

    def access_for(self, email):
        login = self.client.post(
            "/api/v1/auth/login/", {"email": email, "password": "s3cret!23"}
        )
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('article-admin@example.com')}"}

    def customer_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('article-cust@example.com')}"}

    # -- permissions --

    def test_anonymous_cannot_list_admin_articles(self):
        response = self.client.get("/api/v1/admin/articles/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_admin_cannot_create_an_article(self):
        response = self.client.post(
            "/api/v1/admin/articles/",
            {"title": "Sneaky Article"},
            format="json",
            **self.customer_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_cannot_delete_an_article(self):
        article = Article.objects.create(title="Protected")
        response = self.client.delete(
            f"/api/v1/admin/articles/{article.pk}/", **self.customer_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Article.objects.filter(pk=article.pk).exists())

    def test_non_admin_cannot_publish_an_article(self):
        article = Article.objects.create(title="Draft")
        response = self.client.post(
            f"/api/v1/admin/articles/{article.pk}/publish/", **self.customer_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # -- create --

    def test_admin_can_create_a_draft_article(self):
        response = self.client.post(
            "/api/v1/admin/articles/",
            {
                "title": "New Article",
                "summary": "A quick summary",
                "author_name": "Jane Doe",
                "tags": ["news"],
                "body": [{"type": "paragraph", "text": "Hello world."}],
            },
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], Article.Status.DRAFT)
        self.assertIsNone(response.data["published_at"])
        article = Article.objects.get(pk=response.data["id"])
        self.assertEqual(article.title, "New Article")

    def test_admin_can_create_article_with_cover_image(self):
        response = self.client.post(
            "/api/v1/admin/articles/",
            {"title": "With Cover", "cover_image": make_test_image()},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNotNone(response.data["cover_image_url"])

    def test_create_rejects_a_blank_title(self):
        response = self.client.post(
            "/api/v1/admin/articles/",
            {"title": "   "},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_rejects_an_unsupported_body_block_type(self):
        response = self.client.post(
            "/api/v1/admin/articles/",
            {"title": "Bad Body", "body": [{"type": "script", "text": "alert(1)"}]},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_rejects_an_unsafe_link_url_in_body_text(self):
        response = self.client.post(
            "/api/v1/admin/articles/",
            {
                "title": "Bad Link",
                "body": [{"type": "paragraph", "text": "Click [here](javascript:alert(1))."}],
            },
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_accepts_a_safe_link_url_in_body_text(self):
        response = self.client.post(
            "/api/v1/admin/articles/",
            {
                "title": "Good Link",
                "body": [{"type": "paragraph", "text": "See [our events](/events) page."}],
            },
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_create_rejects_malformed_list_block(self):
        response = self.client.post(
            "/api/v1/admin/articles/",
            {"title": "Bad List", "body": [{"type": "bulleted_list", "items": "not-a-list"}]},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_accepts_valid_list_blocks(self):
        response = self.client.post(
            "/api/v1/admin/articles/",
            {
                "title": "Good Lists",
                "body": [
                    {"type": "bulleted_list", "items": ["First", "Second"]},
                    {"type": "numbered_list", "items": ["Step one", "Step two"]},
                ],
            },
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_create_deduplicates_and_trims_tags(self):
        response = self.client.post(
            "/api/v1/admin/articles/",
            {"title": "Tag Test", "tags": [" news ", "news", "shows"]},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["tags"], ["news", "shows"])

    # -- list / filters --

    def test_admin_list_includes_every_status_and_archived_state(self):
        Article.objects.create(title="Draft One")
        published = Article.objects.create(title="Published One", status=Article.Status.PUBLISHED)
        Article.objects.filter(pk=published.pk).update(archived=True)

        response = self.client.get("/api/v1/admin/articles/", **self.admin_auth())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {item["title"] for item in response.data}
        self.assertEqual(titles, {"Draft One", "Published One"})

    def test_admin_list_supports_status_filter(self):
        Article.objects.create(title="Draft One")
        Article.objects.create(title="Published One", status=Article.Status.PUBLISHED)
        response = self.client.get(
            "/api/v1/admin/articles/?status=draft", **self.admin_auth()
        )
        titles = [item["title"] for item in response.data]
        self.assertEqual(titles, ["Draft One"])

    # -- edit --

    def test_admin_can_edit_a_draft(self):
        article = Article.objects.create(title="Original Title", summary="Old summary")
        response = self.client.patch(
            f"/api/v1/admin/articles/{article.pk}/",
            {"title": "Original Title", "summary": "New summary"},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        article.refresh_from_db()
        self.assertEqual(article.summary, "New summary")

    def test_editing_a_published_article_does_not_reset_published_at(self):
        article = Article.objects.create(title="Live Article", status=Article.Status.PUBLISHED)
        original_published_at = article.published_at
        self.assertIsNotNone(original_published_at)

        response = self.client.patch(
            f"/api/v1/admin/articles/{article.pk}/",
            {"summary": "Updated after publish"},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        article.refresh_from_db()
        self.assertEqual(article.published_at, original_published_at)
        self.assertEqual(article.summary, "Updated after publish")

    # -- publish / unpublish --

    def test_publish_action_makes_article_publicly_visible(self):
        article = Article.objects.create(title="To Publish")
        response = self.client.post(
            f"/api/v1/admin/articles/{article.pk}/publish/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Article.Status.PUBLISHED)
        self.assertIsNotNone(response.data["published_at"])

        public_response = self.client.get(f"/api/v1/articles/{article.slug}/")
        self.assertEqual(public_response.status_code, status.HTTP_200_OK)

    def test_unpublish_action_returns_article_to_draft_without_deleting(self):
        article = Article.objects.create(title="Live", status=Article.Status.PUBLISHED)
        response = self.client.post(
            f"/api/v1/admin/articles/{article.pk}/unpublish/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Article.Status.DRAFT)
        self.assertTrue(Article.objects.filter(pk=article.pk).exists())

        public_response = self.client.get(f"/api/v1/articles/{article.slug}/")
        self.assertEqual(public_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_republishing_after_unpublish_keeps_the_original_published_at(self):
        article = Article.objects.create(title="Cycle", status=Article.Status.PUBLISHED)
        original_published_at = article.published_at

        self.client.post(f"/api/v1/admin/articles/{article.pk}/unpublish/", **self.admin_auth())
        response = self.client.post(
            f"/api/v1/admin/articles/{article.pk}/publish/", **self.admin_auth()
        )
        expected = original_published_at.isoformat().replace("+00:00", "Z")
        self.assertEqual(response.data["published_at"], expected)

    # -- archive / restore --

    def test_archive_action_removes_article_from_public_feed_but_keeps_content(self):
        article = Article.objects.create(
            title="To Archive",
            status=Article.Status.PUBLISHED,
            body=[{"type": "paragraph", "text": "Important content."}],
        )
        response = self.client.post(
            f"/api/v1/admin/articles/{article.pk}/archive/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["archived"])

        public_response = self.client.get(f"/api/v1/articles/{article.slug}/")
        self.assertEqual(public_response.status_code, status.HTTP_404_NOT_FOUND)

        article.refresh_from_db()
        self.assertEqual(article.body, [{"type": "paragraph", "text": "Important content."}])

    def test_restore_action_makes_a_published_archived_article_public_again(self):
        article = Article.objects.create(
            title="To Restore", status=Article.Status.PUBLISHED, archived=True
        )
        response = self.client.post(
            f"/api/v1/admin/articles/{article.pk}/restore/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["archived"])

        public_response = self.client.get(f"/api/v1/articles/{article.slug}/")
        self.assertEqual(public_response.status_code, status.HTTP_200_OK)

    def test_restoring_a_draft_article_does_not_make_it_public(self):
        article = Article.objects.create(
            title="Draft Restore", status=Article.Status.DRAFT, archived=True
        )
        response = self.client.post(
            f"/api/v1/admin/articles/{article.pk}/restore/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        public_response = self.client.get(f"/api/v1/articles/{article.slug}/")
        self.assertEqual(public_response.status_code, status.HTTP_404_NOT_FOUND)

    # -- delete --

    def test_admin_can_permanently_delete_an_article(self):
        article = Article.objects.create(title="Doomed")
        response = self.client.delete(
            f"/api/v1/admin/articles/{article.pk}/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Article.objects.filter(pk=article.pk).exists())
