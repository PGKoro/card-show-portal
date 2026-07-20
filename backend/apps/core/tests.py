from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User

from .models import Category


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
