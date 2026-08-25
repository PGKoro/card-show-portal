import io
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User

from .models import Category, HomeCarouselSlide, SiteSettings


def make_test_image(name="slide.png", content_type="image/png"):
    """A minimal valid 1x1 PNG, small enough to keep tests fast."""
    buffer = io.BytesIO()
    Image.new("RGB", (1, 1)).save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type=content_type)


class HealthCheckTests(APITestCase):
    def test_health_check_returns_ok(self):
        url = reverse("health-check")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertTrue(response.data["database"])


class CategoryModelTests(APITestCase):
    def setUp(self):
        # The 0002_seed_categories data migration seeds 5 categories
        # (vintage, modern, ...) into every fresh test database — clear
        # them so these tests can freely reuse those exact names/slugs
        # without colliding with pre-existing rows.
        Category.objects.all().delete()

    def test_slug_auto_generated_from_name(self):
        category = Category.objects.create(name="Sports Memorabilia")
        self.assertEqual(category.slug, "sports-memorabilia")

    def test_slug_collision_gets_a_numeric_suffix(self):
        Category.objects.create(name="Modern")
        second = Category.objects.create(name="Modern")
        self.assertEqual(second.slug, "modern-2")

    def test_editing_name_does_not_change_an_existing_slug(self):
        category = Category.objects.create(name="Vintage")
        category.name = "Vintage Cards"
        category.save()
        category.refresh_from_db()
        self.assertEqual(category.slug, "vintage")
        self.assertEqual(category.name, "Vintage Cards")


class PublicCategoryListTests(APITestCase):
    def setUp(self):
        Category.objects.all().delete()

    def test_anonymous_visitor_sees_categories_in_order(self):
        Category.objects.create(name="Modern", order=1)
        Category.objects.create(name="Vintage", order=0)
        response = self.client.get("/api/v1/categories/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [item["name"] for item in response.data]
        self.assertEqual(names, ["Vintage", "Modern"])

    def test_response_is_not_paginated(self):
        Category.objects.create(name="Vintage", order=0)
        response = self.client.get("/api/v1/categories/")
        self.assertIsInstance(response.data, list)


class AdminCategoryManagementTests(APITestCase):
    def setUp(self):
        Category.objects.all().delete()
        self.admin = User.objects.create_user(
            email="cat-admin@example.com", password="s3cret!23", role=User.Role.ADMIN
        )
        self.customer = User.objects.create_user(
            email="cat-cust@example.com", password="s3cret!23"
        )

    def access_for(self, email):
        login = self.client.post(
            "/api/v1/auth/login/", {"email": email, "password": "s3cret!23"}
        )
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('cat-admin@example.com')}"}

    def customer_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('cat-cust@example.com')}"}

    def test_admin_can_create_category_appended_to_end(self):
        Category.objects.create(name="Vintage", order=0)
        response = self.client.post(
            "/api/v1/admin/categories/", {"name": "Basketball"}, format="json", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["slug"], "basketball")
        self.assertEqual(response.data["order"], 1)

    def test_non_admin_cannot_create_category(self):
        response = self.client.post(
            "/api/v1/admin/categories/",
            {"name": "Basketball"},
            format="json",
            **self.customer_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_rename_but_not_slug(self):
        category = Category.objects.create(name="Vintage", order=0)
        response = self.client.patch(
            f"/api/v1/admin/categories/{category.pk}/",
            {"name": "Vintage Cards", "slug": "hijacked"},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Vintage Cards")
        self.assertEqual(response.data["slug"], "vintage")

    def test_admin_can_delete_category(self):
        category = Category.objects.create(name="Vintage", order=0)
        response = self.client.delete(
            f"/api/v1/admin/categories/{category.pk}/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Category.objects.filter(pk=category.pk).exists())

    def test_reorder_applies_the_given_sequence(self):
        first = Category.objects.create(name="Vintage", order=0)
        second = Category.objects.create(name="Modern", order=1)
        third = Category.objects.create(name="Pokemon", order=2)
        response = self.client.post(
            "/api/v1/admin/categories/reorder/",
            {"order": [third.pk, first.pk, second.pk]},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first.refresh_from_db()
        second.refresh_from_db()
        third.refresh_from_db()
        self.assertEqual(third.order, 0)
        self.assertEqual(first.order, 1)
        self.assertEqual(second.order, 2)

    def test_reorder_rejects_a_non_list_body(self):
        Category.objects.create(name="Vintage", order=0)
        response = self.client.post(
            "/api/v1/admin/categories/reorder/",
            {"order": "not-a-list"},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reorder_rejects_a_mismatched_set_of_ids(self):
        first = Category.objects.create(name="Vintage", order=0)
        second = Category.objects.create(name="Modern", order=1)
        response = self.client.post(
            "/api/v1/admin/categories/reorder/",
            {"order": [first.pk]},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.order, 0)
        self.assertEqual(second.order, 1)

    def test_reorder_rejects_a_duplicate_id(self):
        first = Category.objects.create(name="Vintage", order=0)
        second = Category.objects.create(name="Modern", order=1)
        response = self.client.post(
            "/api/v1/admin/categories/reorder/",
            {"order": [first.pk, first.pk]},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.order, 0)
        self.assertEqual(second.order, 1)

    def test_non_admin_cannot_reorder(self):
        first = Category.objects.create(name="Vintage", order=0)
        second = Category.objects.create(name="Modern", order=1)
        response = self.client.post(
            "/api/v1/admin/categories/reorder/",
            {"order": [second.pk, first.pk]},
            format="json",
            **self.customer_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class HomeCarouselTests(APITestCase):
    """Covers the homepage carousel: public feed + admin add/remove/reorder/edit."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._temp_media_root = tempfile.mkdtemp()
        cls._media_override = override_settings(MEDIA_ROOT=cls._temp_media_root)
        cls._media_override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._media_override.disable()
        shutil.rmtree(cls._temp_media_root, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        HomeCarouselSlide.objects.all().delete()
        self.admin = User.objects.create_user(
            email="carousel-admin@example.com", password="s3cret!23", role=User.Role.ADMIN
        )
        self.customer = User.objects.create_user(
            email="carousel-cust@example.com", password="s3cret!23"
        )

    def access_for(self, email):
        login = self.client.post(
            "/api/v1/auth/login/", {"email": email, "password": "s3cret!23"}
        )
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('carousel-admin@example.com')}"}

    def customer_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('carousel-cust@example.com')}"}

    # -- public feed --

    def test_public_feed_only_returns_active_slides_in_order(self):
        HomeCarouselSlide.objects.create(
            image=make_test_image("a.png"), order=1, active=True, caption="Second"
        )
        HomeCarouselSlide.objects.create(
            image=make_test_image("b.png"), order=0, active=True, caption="First"
        )
        HomeCarouselSlide.objects.create(
            image=make_test_image("c.png"), order=2, active=False, caption="Hidden"
        )
        response = self.client.get("/api/v1/home-carousel/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        captions = [item["caption"] for item in response.data]
        self.assertEqual(captions, ["First", "Second"])

    def test_public_feed_has_no_pagination_envelope(self):
        HomeCarouselSlide.objects.create(image=make_test_image(), order=0)
        response = self.client.get("/api/v1/home-carousel/")
        self.assertIsInstance(response.data, list)

    def test_anonymous_cannot_manage_carousel(self):
        response = self.client.get("/api/v1/admin/home-carousel/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_admin_cannot_manage_carousel(self):
        response = self.client.post(
            "/api/v1/admin/home-carousel/",
            {"image": make_test_image(), "caption": "Nope"},
            format="multipart",
            **self.customer_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # -- add --

    def test_admin_can_add_a_slide(self):
        response = self.client.post(
            "/api/v1/admin/home-carousel/",
            {
                "image": make_test_image(),
                "caption": "Spring show floor",
                "alt_text": "Vendors and customers browsing tables",
                "link_url": "/events/1",
            },
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["caption"], "Spring show floor")
        self.assertIsNotNone(response.data["image_url"])
        slide = HomeCarouselSlide.objects.get(pk=response.data["id"])
        self.assertEqual(slide.order, 0)

    def test_new_slide_appends_after_existing_order(self):
        HomeCarouselSlide.objects.create(image=make_test_image("a.png"), order=0)
        HomeCarouselSlide.objects.create(image=make_test_image("b.png"), order=1)
        response = self.client.post(
            "/api/v1/admin/home-carousel/",
            {"image": make_test_image("c.png")},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["order"], 2)

    def test_add_requires_an_image(self):
        response = self.client.post(
            "/api/v1/admin/home-carousel/",
            {"caption": "No image attached"},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("image", response.data)

    def test_add_rejects_a_non_image_file(self):
        bogus = SimpleUploadedFile("notes.txt", b"not an image", content_type="text/plain")
        response = self.client.post(
            "/api/v1/admin/home-carousel/",
            {"image": bogus},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_add_rejects_an_unsupported_image_content_type(self):
        # A real BMP-encoded image — DRF's ImageField re-derives the
        # actual content-type from the decoded bytes (via Pillow) rather
        # than trusting whatever the upload's Content-Type header claims,
        # so this has to be genuine BMP data for the allow-list check to
        # see "image/bmp" and reject it.
        buffer = io.BytesIO()
        Image.new("RGB", (1, 1)).save(buffer, format="BMP")
        buffer.seek(0)
        image = SimpleUploadedFile("slide.bmp", buffer.read(), content_type="image/bmp")
        response = self.client.post(
            "/api/v1/admin/home-carousel/",
            {"image": image},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # -- remove --

    def test_admin_can_remove_a_slide(self):
        first = HomeCarouselSlide.objects.create(image=make_test_image("a.png"), order=0)
        HomeCarouselSlide.objects.create(image=make_test_image("b.png"), order=1)
        response = self.client.delete(
            f"/api/v1/admin/home-carousel/{first.pk}/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(HomeCarouselSlide.objects.filter(pk=first.pk).exists())

    def test_cannot_delete_the_last_remaining_slide(self):
        only = HomeCarouselSlide.objects.create(image=make_test_image(), order=0)
        response = self.client.delete(
            f"/api/v1/admin/home-carousel/{only.pk}/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(HomeCarouselSlide.objects.filter(pk=only.pk).exists())

    # -- reorder --

    def test_reorder_applies_the_given_sequence(self):
        first = HomeCarouselSlide.objects.create(image=make_test_image("a.png"), order=0)
        second = HomeCarouselSlide.objects.create(image=make_test_image("b.png"), order=1)
        third = HomeCarouselSlide.objects.create(image=make_test_image("c.png"), order=2)
        response = self.client.post(
            "/api/v1/admin/home-carousel/reorder/",
            {"order": [third.pk, first.pk, second.pk]},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first.refresh_from_db()
        second.refresh_from_db()
        third.refresh_from_db()
        self.assertEqual(third.order, 0)
        self.assertEqual(first.order, 1)
        self.assertEqual(second.order, 2)

    def test_reorder_rejects_a_mismatched_set_of_ids(self):
        first = HomeCarouselSlide.objects.create(image=make_test_image("a.png"), order=0)
        HomeCarouselSlide.objects.create(image=make_test_image("b.png"), order=1)
        response = self.client.post(
            "/api/v1/admin/home-carousel/reorder/",
            {"order": [first.pk]},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # -- edit --

    def test_admin_can_edit_caption_without_reuploading_image(self):
        slide = HomeCarouselSlide.objects.create(
            image=make_test_image(), order=0, caption="Old caption"
        )
        response = self.client.patch(
            f"/api/v1/admin/home-carousel/{slide.pk}/",
            {"caption": "New caption", "alt_text": "New alt", "link_url": "/events"},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["caption"], "New caption")
        slide.refresh_from_db()
        self.assertEqual(slide.caption, "New caption")
        self.assertEqual(slide.alt_text, "New alt")
        self.assertEqual(slide.link_url, "/events")

    def test_admin_can_deactivate_a_slide_to_hide_it_without_deleting(self):
        slide = HomeCarouselSlide.objects.create(image=make_test_image(), order=0, active=True)
        HomeCarouselSlide.objects.create(image=make_test_image("b.png"), order=1, active=True)
        response = self.client.patch(
            f"/api/v1/admin/home-carousel/{slide.pk}/",
            {"active": False},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        slide.refresh_from_db()
        self.assertFalse(slide.active)
        # Deactivating still leaves it in the admin list — only the public
        # feed hides it — so nothing here should have deleted the row.
        self.assertTrue(HomeCarouselSlide.objects.filter(pk=slide.pk).exists())


class SiteSettingsTests(APITestCase):
    """Covers the Manage Website settings toggle (currently just articles_tab_enabled)."""

    def setUp(self):
        SiteSettings.objects.all().delete()
        self.admin = User.objects.create_user(
            email="settings-admin@example.com", password="s3cret!23", role=User.Role.ADMIN
        )
        self.customer = User.objects.create_user(
            email="settings-cust@example.com", password="s3cret!23"
        )

    def access_for(self, email):
        login = self.client.post(
            "/api/v1/auth/login/", {"email": email, "password": "s3cret!23"}
        )
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('settings-admin@example.com')}"}

    def customer_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('settings-cust@example.com')}"}

    def test_public_settings_defaults_to_articles_enabled_with_no_row_yet(self):
        self.assertEqual(SiteSettings.objects.count(), 0)
        response = self.client.get("/api/v1/settings/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["articles_tab_enabled"])
        # Reading it also created the singleton row (see SiteSettings.load).
        self.assertEqual(SiteSettings.objects.count(), 1)

    def test_anonymous_cannot_read_admin_settings(self):
        response = self.client.get("/api/v1/admin/settings/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_admin_cannot_read_admin_settings(self):
        response = self.client.get("/api/v1/admin/settings/", **self.customer_auth())
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_cannot_update_settings(self):
        response = self.client.patch(
            "/api/v1/admin/settings/",
            {"articles_tab_enabled": False},
            format="json",
            **self.customer_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(SiteSettings.load().articles_tab_enabled)

    def test_admin_can_turn_articles_tab_off_and_public_feed_reflects_it(self):
        response = self.client.patch(
            "/api/v1/admin/settings/",
            {"articles_tab_enabled": False},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["articles_tab_enabled"])

        public_response = self.client.get("/api/v1/settings/")
        self.assertFalse(public_response.data["articles_tab_enabled"])

    def test_admin_can_turn_articles_tab_back_on(self):
        SiteSettings.objects.create(pk=SiteSettings.SINGLETON_PK, articles_tab_enabled=False)
        response = self.client.patch(
            "/api/v1/admin/settings/",
            {"articles_tab_enabled": True},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["articles_tab_enabled"])

    def test_setting_persists_across_separate_requests(self):
        # Simulates "survives a restart" — nothing in this app caches the
        # setting in memory, every request re-reads the DB row.
        self.client.patch(
            "/api/v1/admin/settings/",
            {"articles_tab_enabled": False},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(SiteSettings.objects.count(), 1)
        reloaded = SiteSettings.objects.get(pk=SiteSettings.SINGLETON_PK)
        self.assertFalse(reloaded.articles_tab_enabled)

    def test_only_one_settings_row_ever_exists(self):
        SiteSettings.load()
        SiteSettings.load()
        SiteSettings.load()
        self.assertEqual(SiteSettings.objects.count(), 1)
