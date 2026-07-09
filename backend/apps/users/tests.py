from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.listings.models import Listing

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
        # Superusers are created directly (create_admin/createsuperuser),
        # never through /signup + /onboarding, which doesn't even offer an
        # "admin" role choice — so they must never get routed there.
        admin = User.objects.create_superuser(email="admin3@example.com", password="s3cret!23")
        self.assertTrue(admin.onboarding_completed)


class RegistrationEndpointTests(APITestCase):
    url = "/api/v1/auth/registration/"

    def test_register_creates_customer_with_tokens(self):
        # Registration only collects email/password now — name and role
        # are collected afterwards by the onboarding endpoint.
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
        # Regression test: dj-rest-auth's default validate_email only
        # rejects *verified* duplicate emails. With
        # ACCOUNT_EMAIL_VERIFICATION="optional" nothing gets auto-verified,
        # so without our override this used to fall through to the DB's
        # unique constraint and blow up with a raw IntegrityError (500).
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


class OnboardingEndpointTests(APITestCase):
    """
    Onboarding is two steps now: OnboardingView (step 1: name + role, does
    NOT complete onboarding) followed by OnboardingDetailsView (step 2:
    role-specific fields, which finalizes onboarding_completed).
    """

    basic_url = "/api/v1/auth/onboarding/"
    details_url = "/api/v1/auth/onboarding/details/"

    def setUp(self):
        self.user = User.objects.create_user(email="onboarding@example.com", password="s3cret!23")
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "onboarding@example.com", "password": "s3cret!23"},
        )
        self.access = login.data["access"]

    def auth_header(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access}"}

    def test_step_one_requires_auth(self):
        response = self.client.patch(
            self.basic_url, {"role": "customer", "first_name": "No"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_step_one_sets_name_and_role_without_completing(self):
        response = self.client.patch(
            self.basic_url,
            {"role": "vendor", "first_name": "Val", "last_name": "Vendor"},
            format="json",
            **self.auth_header(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], User.Role.VENDOR)
        self.assertEqual(response.data["first_name"], "Val")
        self.assertFalse(response.data["onboarding_completed"])
        self.assertIsNone(response.data["vendor_status"])

    def test_customer_step_two_completes_onboarding(self):
        self.client.patch(
            self.basic_url,
            {"role": "customer", "first_name": "Cara", "last_name": "Customer"},
            format="json",
            **self.auth_header(),
        )
        response = self.client.patch(
            self.details_url,
            {"category_tags": ["pokemon", "modern"]},
            format="json",
            **self.auth_header(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["onboarding_completed"])
        self.assertEqual(response.data["category_tags"], ["pokemon", "modern"])
        self.assertIsNone(response.data["vendor_status"])

    def test_vendor_step_two_requires_business_name(self):
        self.client.patch(
            self.basic_url,
            {"role": "vendor", "first_name": "Val"},
            format="json",
            **self.auth_header(),
        )
        response = self.client.patch(
            self.details_url, {"category_tags": ["vintage"]}, format="json", **self.auth_header()
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("business_name", response.data)

    def test_vendor_step_two_sets_pending_review(self):
        self.client.patch(
            self.basic_url,
            {"role": "vendor", "first_name": "Val", "last_name": "Vendor"},
            format="json",
            **self.auth_header(),
        )
        response = self.client.patch(
            self.details_url,
            {
                "business_name": "Val's Cards",
                "business_description": "Vintage and modern.",
                "location": "Austin, TX",
                "category_tags": ["vintage"],
            },
            format="json",
            **self.auth_header(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["vendor_status"], User.VendorStatus.PENDING_REVIEW)
        self.assertTrue(response.data["onboarding_completed"])

    def test_invalid_category_tag_rejected(self):
        self.client.patch(
            self.basic_url,
            {"role": "customer", "first_name": "Cara"},
            format="json",
            **self.auth_header(),
        )
        response = self.client.patch(
            self.details_url,
            {"category_tags": ["not-a-real-category"]},
            format="json",
            **self.auth_header(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class VendorApprovalFlowTests(APITestCase):
    """Covers the full "vendor can't post until approved" requirement."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin2@example.com", password="s3cret!23")
        self.vendor = User.objects.create_user(
            email="pendingvendor@example.com", password="s3cret!23"
        )
        self.vendor.role = User.Role.VENDOR
        self.vendor.business_name = "Pending Cards"
        self.vendor.vendor_status = User.VendorStatus.PENDING_REVIEW
        self.vendor.save()

    def access_for(self, email, password):
        login = self.client.post("/api/v1/auth/login/", {"email": email, "password": password})
        return login.data["access"]

    def test_pending_vendor_cannot_create_listing(self):
        access = self.access_for("pendingvendor@example.com", "s3cret!23")
        response = self.client.post(
            "/api/v1/listings/",
            {"title": "Card", "category": "vintage", "price": "10.00", "condition": "mint"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_pending_vendor_can_still_list_own_empty_listings(self):
        access = self.access_for("pendingvendor@example.com", "s3cret!23")
        response = self.client.get(
            "/api/v1/listings/", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"], [])

    def test_customer_cannot_create_listing(self):
        User.objects.create_user(email="cust@example.com", password="s3cret!23")
        access = self.access_for("cust@example.com", "s3cret!23")
        response = self.client.post(
            "/api/v1/listings/",
            {"title": "Card", "category": "vintage", "price": "10.00", "condition": "mint"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_see_and_approve_pending_vendor(self):
        admin_access = self.access_for("admin2@example.com", "s3cret!23")

        pending = self.client.get(
            "/api/v1/admin/vendors/pending/", HTTP_AUTHORIZATION=f"Bearer {admin_access}"
        )
        self.assertEqual(pending.status_code, status.HTTP_200_OK)
        self.assertEqual(len(pending.data["results"]), 1)
        self.assertEqual(pending.data["results"][0]["email"], "pendingvendor@example.com")

        approve = self.client.post(
            f"/api/v1/admin/vendors/{self.vendor.pk}/approve/",
            HTTP_AUTHORIZATION=f"Bearer {admin_access}",
        )
        self.assertEqual(approve.status_code, status.HTTP_200_OK)
        self.assertEqual(approve.data["vendor_status"], User.VendorStatus.APPROVED)

        vendor_access = self.access_for("pendingvendor@example.com", "s3cret!23")
        create = self.client.post(
            "/api/v1/listings/",
            {"title": "Card", "category": "vintage", "price": "10.00", "condition": "mint"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {vendor_access}",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Listing.objects.filter(vendor=self.vendor).count(), 1)

    def test_non_admin_cannot_see_pending_vendors(self):
        access = self.access_for("pendingvendor@example.com", "s3cret!23")
        response = self.client.get(
            "/api/v1/admin/vendors/pending/", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_reject_sets_rejected_status(self):
        admin_access = self.access_for("admin2@example.com", "s3cret!23")
        response = self.client.post(
            f"/api/v1/admin/vendors/{self.vendor.pk}/reject/",
            HTTP_AUTHORIZATION=f"Bearer {admin_access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["vendor_status"], User.VendorStatus.REJECTED)

    def test_pending_vendors_are_paginated(self):
        for i in range(5):
            extra = User.objects.create_user(
                email=f"extra-pending-{i}@example.com", password="s3cret!23"
            )
            extra.role = User.Role.VENDOR
            extra.vendor_status = User.VendorStatus.PENDING_REVIEW
            extra.save()

        admin_access = self.access_for("admin2@example.com", "s3cret!23")
        response = self.client.get(
            "/api/v1/admin/vendors/pending/?page_size=5",
            HTTP_AUTHORIZATION=f"Bearer {admin_access}",
        )
        self.assertEqual(response.data["count"], 6)
        self.assertEqual(len(response.data["results"]), 5)
        self.assertIsNotNone(response.data["next"])


class AdminUserManagementTests(APITestCase):
    """Covers the "Manage Roles" tool: searching for a user and flipping their role."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin3@example.com", password="s3cret!23")
        self.customer = User.objects.create_user(
            email="future.admin@example.com", password="s3cret!23"
        )
        login = self.client.post(
            "/api/v1/auth/login/", {"email": "admin3@example.com", "password": "s3cret!23"}
        )
        self.admin_access = login.data["access"]

    def auth_header(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.admin_access}"}

    def set_role(self, user_pk, role):
        return self.client.post(
            f"/api/v1/admin/users/{user_pk}/set-role/",
            {"role": role},
            format="json",
            **self.auth_header(),
        )

    def test_search_finds_matching_user_by_email(self):
        response = self.client.get(
            "/api/v1/admin/users/?search=future.admin", **self.auth_header()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        emails = [u["email"] for u in response.data["results"]]
        self.assertIn("future.admin@example.com", emails)

    def test_search_includes_existing_admins(self):
        # Manage Roles needs to find admins too, so they can be demoted.
        response = self.client.get("/api/v1/admin/users/?search=admin3", **self.auth_header())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        emails = [u["email"] for u in response.data["results"]]
        self.assertIn("admin3@example.com", emails)

    def test_search_filters_by_role(self):
        vendor = User.objects.create_user(email="somevendor@example.com", password="s3cret!23")
        vendor.role = User.Role.VENDOR
        vendor.save()

        response = self.client.get("/api/v1/admin/users/?role=vendor", **self.auth_header())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        emails = [u["email"] for u in response.data["results"]]
        self.assertIn("somevendor@example.com", emails)
        self.assertNotIn("future.admin@example.com", emails)

    def test_search_results_are_paginated(self):
        for i in range(5):
            User.objects.create_user(email=f"paged-{i}@example.com", password="s3cret!23")

        response = self.client.get(
            "/api/v1/admin/users/?search=paged&page_size=5", **self.auth_header()
        )
        self.assertEqual(response.data["count"], 5)
        self.assertEqual(len(response.data["results"]), 5)
        self.assertIsNone(response.data["next"])

        response = self.client.get("/api/v1/admin/users/?page_size=5", **self.auth_header())
        self.assertEqual(len(response.data["results"]), 5)
        self.assertIsNotNone(response.data["next"])

    def test_set_role_to_admin_promotes_user(self):
        response = self.set_role(self.customer.pk, "admin")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], User.Role.ADMIN)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.role, User.Role.ADMIN)

    def test_set_role_to_admin_skips_onboarding_for_unfinished_user(self):
        # Regression test: a user promoted before finishing /onboarding
        # must not get routed into the vendor/customer onboarding wizard on
        # their next login — it has no "admin" choice and would let them
        # clobber their own role back to customer/vendor.
        self.assertFalse(self.customer.onboarding_completed)
        response = self.set_role(self.customer.pk, "admin")
        self.assertTrue(response.data["onboarding_completed"])
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.onboarding_completed)

    def test_set_role_to_vendor_starts_pending_review(self):
        response = self.set_role(self.customer.pk, "vendor")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], User.Role.VENDOR)
        self.assertEqual(response.data["vendor_status"], User.VendorStatus.PENDING_REVIEW)

    def test_set_role_to_customer_clears_vendor_status(self):
        self.customer.role = User.Role.VENDOR
        self.customer.vendor_status = User.VendorStatus.APPROVED
        self.customer.save()

        response = self.set_role(self.customer.pk, "customer")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], User.Role.CUSTOMER)
        self.assertIsNone(response.data["vendor_status"])

    def test_set_role_rejects_invalid_role(self):
        response = self.set_role(self.customer.pk, "superadmin")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_cannot_search_or_change_roles(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "future.admin@example.com", "password": "s3cret!23"},
        )
        access = login.data["access"]

        search = self.client.get(
            "/api/v1/admin/users/", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        self.assertEqual(search.status_code, status.HTTP_403_FORBIDDEN)

        promote = self.client.post(
            f"/api/v1/admin/users/{self.admin.pk}/set-role/",
            {"role": "admin"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(promote.status_code, status.HTTP_403_FORBIDDEN)
