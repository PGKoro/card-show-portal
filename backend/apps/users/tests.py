from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from .models import User


class UserModelTests(TestCase):
    def test_create_user_uses_email_as_identifier(self):
        user = User.objects.create_user(email="vendor@example.com", password="s3cret!23")
        self.assertEqual(user.email, "vendor@example.com")
        self.assertEqual(user.role, User.Role.CUSTOMER)
        self.assertTrue(user.check_password("s3cret!23"))

    def test_create_superuser_defaults_to_admin_role(self):
        admin = User.objects.create_superuser(email="admin@example.com", password="s3cret!23")
        self.assertEqual(admin.role, User.Role.ADMIN)
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)

    def test_create_superuser_skips_onboarding(self):
        admin = User.objects.create_superuser(email="admin3@example.com", password="s3cret!23")
        self.assertTrue(admin.onboarding_completed)


class RegistrationEndpointTests(APITestCase):
    url = "/api/v1/auth/registration/"

    def test_register_creates_customer_with_tokens(self):
        response = self.client.post(
            self.url,
            {
                "email": "newuser@example.com",
                "password1": "S3curePass!23",
                "password2": "S3curePass!23",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["role"], User.Role.CUSTOMER)
        self.assertFalse(response.data["user"]["onboarding_completed"])

    def test_duplicate_email_returns_clean_validation_error_not_500(self):
        User.objects.create_user(email="dupe@example.com", password="s3cret!23")
        response = self.client.post(
            self.url,
            {
                "email": "dupe@example.com",
                "password1": "S3curePass!23",
                "password2": "S3curePass!23",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)


class LoginLogoutEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="loginuser@example.com", password="s3cret!23")

    def test_login_returns_tokens_and_role(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {"email": "loginuser@example.com", "password": "s3cret!23"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["role"], User.Role.CUSTOMER)

    def test_login_with_wrong_password_fails_cleanly(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {"email": "loginuser@example.com", "password": "wrong-password"},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_endpoint_requires_auth_and_returns_role(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "loginuser@example.com", "password": "s3cret!23"},
        )
        access = login.data["access"]

        response = self.client.get(
            "/api/v1/auth/user/", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], User.Role.CUSTOMER)

    def test_logout_blacklists_refresh_token(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "loginuser@example.com", "password": "s3cret!23"},
        )
        access = login.data["access"]
        refresh = login.data["refresh"]

        logout = self.client.post(
            "/api/v1/auth/logout/",
            {"refresh": refresh},
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(logout.status_code, status.HTTP_200_OK)

        refresh_attempt = self.client.post(
            "/api/v1/auth/token/refresh/", {"refresh": refresh}
        )
        self.assertEqual(refresh_attempt.status_code, status.HTTP_401_UNAUTHORIZED)


class AdminUserSearchAndRoleTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="s3cret!23")
        self.customer = User.objects.create_user(
            email="future.admin@example.com",
            password="s3cret!23",
            first_name="Future",
            last_name="Admin",
        )
        self.vendor = User.objects.create_user(
            email="vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Vendor Shop",
            vendor_status=User.VendorStatus.APPROVED,
        )
        self.flagged = User.objects.create_user(
            email="flagged@example.com",
            password="s3cret!23",
            first_name="Flag",
            last_name="Gable",
        )
        self.flagged.flagged = True
        self.flagged.save(update_fields=["flagged"])
        login = self.client.post(
            "/api/v1/auth/login/", {"email": "admin@example.com", "password": "s3cret!23"}
        )
        self.admin_access = login.data["access"]

    def auth_header(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.admin_access}"}

    def test_search_by_name_matches_first_or_last_name(self):
        response = self.client.get(
            "/api/v1/admin/users/?search=future", **self.auth_header()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        emails = [u["email"] for u in response.data["results"]]
        self.assertIn("future.admin@example.com", emails)

    def test_search_by_role_filters_customer_vendor_admin(self):
        response = self.client.get(
            "/api/v1/admin/users/?role=vendor", **self.auth_header()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        emails = [u["email"] for u in response.data["results"]]
        self.assertIn("vendor@example.com", emails)
        self.assertNotIn("future.admin@example.com", emails)

    def test_search_flagged_only_filters_flagged_accounts(self):
        response = self.client.get(
            "/api/v1/admin/users/?flagged=true", **self.auth_header()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        emails = [u["email"] for u in response.data["results"]]
        self.assertIn("flagged@example.com", emails)
        self.assertNotIn("future.admin@example.com", emails)

    def test_flag_and_unflag_user(self):
        flag = self.client.post(
            f"/api/v1/admin/users/{self.customer.pk}/flag/", **self.auth_header()
        )
        self.assertEqual(flag.status_code, status.HTTP_200_OK)
        self.assertTrue(flag.data["flagged"])

        unflag = self.client.post(
            f"/api/v1/admin/users/{self.customer.pk}/unflag/", **self.auth_header()
        )
        self.assertEqual(unflag.status_code, status.HTTP_200_OK)
        self.assertFalse(unflag.data["flagged"])

    def test_non_admin_cannot_access_flag_endpoints(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "future.admin@example.com", "password": "s3cret!23"},
        )
        access = login.data["access"]
        response = self.client.post(
            f"/api/v1/admin/users/{self.customer.pk}/flag/",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class AdminUserDetailTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin4@example.com", password="s3cret!23")
        self.vendor = User.objects.create_user(
            email="detail-vendor@example.com",
            password="s3cret!23",
            first_name="Dana",
            last_name="Dealer",
            role=User.Role.VENDOR,
            business_name="Dana's Cards",
            business_description="Vintage and modern singles.",
            location="Reno, NV",
            category_tags=["vintage"],
            vendor_status=User.VendorStatus.PENDING_REVIEW,
        )
        login = self.client.post(
            "/api/v1/auth/login/", {"email": "admin4@example.com", "password": "s3cret!23"}
        )
        self.admin_access = login.data["access"]

    def test_admin_can_view_full_submitted_details(self):
        response = self.client.get(
            f"/api/v1/admin/users/{self.vendor.pk}/",
            HTTP_AUTHORIZATION=f"Bearer {self.admin_access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "detail-vendor@example.com")
        self.assertIn("notes", response.data)

    def test_admin_can_edit_email_and_notes(self):
        response = self.client.patch(
            f"/api/v1/admin/users/{self.vendor.pk}/",
            {"email": "updated-vendor@example.com", "notes": "Follow up in March"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {self.admin_access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "updated-vendor@example.com")
        self.assertEqual(response.data["notes"], "Follow up in March")

    def test_admin_note_changes_are_recorded(self):
        self.client.patch(
            f"/api/v1/admin/users/{self.vendor.pk}/",
            {"notes": "First note"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {self.admin_access}",
        )
        self.client.patch(
            f"/api/v1/admin/users/{self.vendor.pk}/",
            {"notes": "Updated note"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {self.admin_access}",
        )
        history = self.client.get(
            f"/api/v1/admin/users/{self.vendor.pk}/history/",
            HTTP_AUTHORIZATION=f"Bearer {self.admin_access}",
        )
        self.assertEqual(history.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(history.data), 1)
        self.assertEqual(history.data[0]["admin"], "admin4@example.com")
        self.assertEqual(history.data[0]["note"], "Updated note")
