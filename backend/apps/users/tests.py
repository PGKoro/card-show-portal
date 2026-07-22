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


class ProfileEndpointTests(APITestCase):
    """Covers the "Profile Settings" self-service edit endpoint."""

    url = "/api/v1/auth/profile/"

    def setUp(self):
        self.customer = User.objects.create_user(
            email="settings-customer@example.com",
            password="s3cret!23",
            first_name="Cara",
            role=User.Role.CUSTOMER,
            onboarding_completed=True,
        )
        self.vendor = User.objects.create_user(
            email="settings-vendor@example.com",
            password="s3cret!23",
            first_name="Val",
            role=User.Role.VENDOR,
            business_name="Val's Cards",
            vendor_status=User.VendorStatus.APPROVED,
            onboarding_completed=True,
        )

    def access_for(self, email, password="s3cret!23"):
        login = self.client.post("/api/v1/auth/login/", {"email": email, "password": password})
        return login.data["access"]

    def test_requires_auth(self):
        response = self.client.patch(self.url, {"first_name": "No"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_can_update_name_and_interests(self):
        access = self.access_for("settings-customer@example.com")
        response = self.client.patch(
            self.url,
            {"first_name": "Caroline", "last_name": "Customer", "category_tags": ["vintage"]},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["first_name"], "Caroline")
        self.assertEqual(response.data["category_tags"], ["vintage"])
        # Role, approval state, and onboarding status must never move here.
        self.assertEqual(response.data["role"], User.Role.CUSTOMER)

    def test_customer_cannot_set_vendor_fields(self):
        access = self.access_for("settings-customer@example.com")
        response = self.client.patch(
            self.url,
            {"first_name": "Cara", "business_name": "Sneaky Shop"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.business_name, "")

    def test_vendor_can_update_business_info(self):
        access = self.access_for("settings-vendor@example.com")
        response = self.client.patch(
            self.url,
            {
                "first_name": "Val",
                "business_name": "Val's Vintage Cards",
                "business_description": "Now with more Pokémon.",
                "location": "Denver, CO",
                "category_tags": ["vintage", "pokemon"],
            },
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["business_name"], "Val's Vintage Cards")
        self.assertEqual(response.data["location"], "Denver, CO")
        # Editing profile info must not reset an already-approved vendor
        # back to pending review.
        self.assertEqual(response.data["vendor_status"], User.VendorStatus.APPROVED)

    def test_vendor_can_set_social_links_scheme_optional(self):
        access = self.access_for("settings-vendor@example.com")
        response = self.client.patch(
            self.url,
            {
                "instagram_url": "instagram.com/valscards",
                "youtube_url": "https://youtube.com/@valscards",
                "x_url": "",
                "website_url": "valscards.example.com",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["instagram_url"], "https://instagram.com/valscards")
        self.assertEqual(response.data["youtube_url"], "https://youtube.com/@valscards")
        self.assertEqual(response.data["website_url"], "https://valscards.example.com")
        self.assertEqual(response.data["x_url"], "")

    def test_social_link_rejects_garbage_input(self):
        access = self.access_for("settings-vendor@example.com")
        response = self.client.patch(
            self.url,
            {"instagram_url": "not a url"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_cannot_set_social_links(self):
        access = self.access_for("settings-customer@example.com")
        response = self.client.patch(
            self.url,
            {"instagram_url": "instagram.com/notavendor"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.instagram_url, "")

    def test_vendor_can_set_extra_detail_fields(self):
        access = self.access_for("settings-vendor@example.com")
        response = self.client.patch(
            self.url,
            {
                "tagline": "Vintage cards, fair prices.",
                "collection_size": 5000,
                "selling_since_year": 2015,
                "also_buying": True,
                "payment_methods": ["cash", "venmo"],
            },
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["tagline"], "Vintage cards, fair prices.")
        self.assertEqual(response.data["collection_size"], 5000)
        self.assertEqual(response.data["selling_since_year"], 2015)
        self.assertTrue(response.data["also_buying"])
        self.assertEqual(response.data["payment_methods"], ["cash", "venmo"])

    def test_extra_detail_fields_reject_invalid_input(self):
        access = self.access_for("settings-vendor@example.com")
        response = self.client.patch(
            self.url,
            {"payment_methods": ["bitcoin"]},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.patch(
            self.url,
            {"selling_since_year": 1800},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_cannot_set_vendor_extra_detail_fields(self):
        access = self.access_for("settings-customer@example.com")
        response = self.client.patch(
            self.url,
            {"tagline": "Sneaky tagline", "also_buying": True},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.tagline, "")
        self.assertFalse(self.customer.also_buying)

    def test_vendor_cannot_blank_out_business_name(self):
        access = self.access_for("settings-vendor@example.com")
        response = self.client.patch(
            self.url,
            {"business_name": ""},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_change_own_role(self):
        access = self.access_for("settings-customer@example.com")
        response = self.client.patch(
            self.url,
            {"first_name": "Cara", "role": "admin"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.role, User.Role.CUSTOMER)


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
            {"title": "Card", "category": "vintage", "price": "10.00"},
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
            {"title": "Card", "category": "vintage", "price": "10.00"},
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
            {"title": "Card", "category": "vintage", "price": "10.00"},
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

    def test_search_finds_matching_vendor_by_business_name(self):
        User.objects.create_user(
            email="cardking@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Card King Collectibles",
        )
        response = self.client.get("/api/v1/admin/users/?search=card king", **self.auth_header())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        emails = [u["email"] for u in response.data["results"]]
        self.assertIn("cardking@example.com", emails)

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


class AdminUserDetailTests(APITestCase):
    """Covers the "view full submitted details" link on a vendor approval."""

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
        self.assertEqual(response.data["first_name"], "Dana")
        self.assertEqual(response.data["business_name"], "Dana's Cards")
        self.assertEqual(response.data["business_description"], "Vintage and modern singles.")
        self.assertEqual(response.data["location"], "Reno, NV")
        self.assertEqual(response.data["category_tags"], ["vintage"])
        self.assertNotIn("password", response.data)

    def test_non_admin_cannot_view_user_details(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "detail-vendor@example.com", "password": "s3cret!23"},
        )
        access = login.data["access"]
        response = self.client.get(
            f"/api/v1/admin/users/{self.admin.pk}/", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unknown_pk_returns_404(self):
        response = self.client.get(
            "/api/v1/admin/users/999999/", HTTP_AUTHORIZATION=f"Bearer {self.admin_access}"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_edit_another_accounts_info(self):
        response = self.client.patch(
            f"/api/v1/admin/users/{self.vendor.pk}/",
            {
                "first_name": "Danielle",
                "business_name": "Danielle's Cards",
                "location": "Las Vegas, NV",
                "category_tags": ["vintage", "modern"],
            },
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {self.admin_access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.vendor.refresh_from_db()
        self.assertEqual(self.vendor.first_name, "Danielle")
        self.assertEqual(self.vendor.business_name, "Danielle's Cards")
        self.assertEqual(self.vendor.location, "Las Vegas, NV")
        self.assertEqual(self.vendor.category_tags, ["vintage", "modern"])

    def test_editing_cannot_blank_out_vendor_business_name(self):
        response = self.client.patch(
            f"/api/v1/admin/users/{self.vendor.pk}/",
            {"business_name": ""},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {self.admin_access}",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_editing_rejects_invalid_category_tag(self):
        response = self.client.patch(
            f"/api/v1/admin/users/{self.vendor.pk}/",
            {"category_tags": ["not-a-real-category"]},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {self.admin_access}",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_editing_cannot_change_role_or_email(self):
        response = self.client.patch(
            f"/api/v1/admin/users/{self.vendor.pk}/",
            {"role": "admin", "email": "hijacked@example.com"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {self.admin_access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.vendor.refresh_from_db()
        self.assertEqual(self.vendor.role, User.Role.VENDOR)
        self.assertEqual(self.vendor.email, "detail-vendor@example.com")

    def test_non_admin_cannot_edit_another_account(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "detail-vendor@example.com", "password": "s3cret!23"},
        )
        access = login.data["access"]
        response = self.client.patch(
            f"/api/v1/admin/users/{self.admin.pk}/",
            {"first_name": "Hacked"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class PublicVendorDetailTests(APITestCase):
    """Covers the public vendor profile endpoint (floor map click-through target)."""

    def setUp(self):
        self.vendor = User.objects.create_user(
            email="public-vendor@example.com",
            password="s3cret!23",
            business_name="Public Cards Co",
            business_description="Selling vintage and modern.",
            location="Reno, NV",
            category_tags=["vintage"],
            role=User.Role.VENDOR,
            vendor_status=User.VendorStatus.PENDING_REVIEW,
        )
        self.customer = User.objects.create_user(
            email="public-cust@example.com", password="s3cret!23"
        )

    def test_anonymous_visitor_can_view_vendor_profile(self):
        response = self.client.get(f"/api/v1/vendors/{self.vendor.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["business_name"], "Public Cards Co")
        self.assertEqual(response.data["business_description"], "Selling vintage and modern.")
        self.assertEqual(response.data["location"], "Reno, NV")
        self.assertEqual(response.data["category_tags"], ["vintage"])

    def test_vendor_profile_exposes_date_joined(self):
        response = self.client.get(f"/api/v1/vendors/{self.vendor.pk}/")
        self.assertIn(str(self.vendor.date_joined.year), response.data["date_joined"])

    def test_vendor_profile_never_exposes_sensitive_fields(self):
        response = self.client.get(f"/api/v1/vendors/{self.vendor.pk}/")
        self.assertNotIn("email", response.data)
        self.assertNotIn("vendor_status", response.data)
        self.assertNotIn("password", response.data)

    def test_visible_regardless_of_approval_status(self):
        # The floor map reflects who's physically at the show, not who's
        # cleared to list online yet — a still-pending vendor's profile
        # should still be reachable via a linked booth's click-through.
        self.assertEqual(self.vendor.vendor_status, User.VendorStatus.PENDING_REVIEW)
        response = self.client.get(f"/api/v1/vendors/{self.vendor.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_social_links_are_exposed_when_set(self):
        self.vendor.instagram_url = "https://instagram.com/publiccardsco"
        self.vendor.website_url = "https://publiccardsco.example.com"
        self.vendor.save()
        response = self.client.get(f"/api/v1/vendors/{self.vendor.pk}/")
        self.assertEqual(response.data["instagram_url"], "https://instagram.com/publiccardsco")
        self.assertEqual(response.data["website_url"], "https://publiccardsco.example.com")
        self.assertEqual(response.data["youtube_url"], "")
        self.assertEqual(response.data["x_url"], "")

    def test_extra_detail_fields_are_exposed_when_set(self):
        self.vendor.tagline = "Vintage cards, fair prices."
        self.vendor.collection_size = 5000
        self.vendor.selling_since_year = 2015
        self.vendor.also_buying = True
        self.vendor.payment_methods = ["cash", "venmo"]
        self.vendor.save()
        response = self.client.get(f"/api/v1/vendors/{self.vendor.pk}/")
        self.assertEqual(response.data["tagline"], "Vintage cards, fair prices.")
        self.assertEqual(response.data["collection_size"], 5000)
        self.assertEqual(response.data["selling_since_year"], 2015)
        self.assertTrue(response.data["also_buying"])
        self.assertEqual(response.data["payment_methods"], ["cash", "venmo"])


class PublicVendorListTests(APITestCase):
    """Covers the public vendor directory (backs /vendors and the homepage)."""

    def setUp(self):
        self.approved = User.objects.create_user(
            email="dir-approved@example.com",
            password="s3cret!23",
            business_name="Approved Cards Co",
            location="Reno, NV",
            role=User.Role.VENDOR,
            vendor_status=User.VendorStatus.APPROVED,
        )
        self.pending = User.objects.create_user(
            email="dir-pending@example.com",
            password="s3cret!23",
            business_name="Pending Cards Co",
            role=User.Role.VENDOR,
            vendor_status=User.VendorStatus.PENDING_REVIEW,
        )
        self.rejected = User.objects.create_user(
            email="dir-rejected@example.com",
            password="s3cret!23",
            business_name="Rejected Cards Co",
            role=User.Role.VENDOR,
            vendor_status=User.VendorStatus.REJECTED,
        )
        self.customer = User.objects.create_user(
            email="dir-cust@example.com", password="s3cret!23"
        )

    def test_only_approved_vendors_are_listed(self):
        response = self.client.get("/api/v1/vendors/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [item["business_name"] for item in response.data["results"]]
        self.assertEqual(names, ["Approved Cards Co"])

    def test_empty_when_no_vendors_are_approved_yet(self):
        self.approved.vendor_status = User.VendorStatus.PENDING_REVIEW
        self.approved.save(update_fields=["vendor_status"])
        response = self.client.get("/api/v1/vendors/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"], [])

    def test_search_by_business_name(self):
        response = self.client.get("/api/v1/vendors/?search=Approved")
        self.assertEqual(len(response.data["results"]), 1)
        response = self.client.get("/api/v1/vendors/?search=nonexistent")
        self.assertEqual(response.data["results"], [])

    def test_404_for_non_vendor_account(self):
        response = self.client.get(f"/api/v1/vendors/{self.customer.pk}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_404_for_unknown_pk(self):
        response = self.client.get("/api/v1/vendors/999999/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_archived_vendor_excluded_from_list_and_detail(self):
        self.approved.archived = True
        self.approved.save(update_fields=["archived"])
        response = self.client.get("/api/v1/vendors/")
        self.assertEqual(response.data["results"], [])
        response = self.client.get(f"/api/v1/vendors/{self.approved.pk}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class AdminAccountManagementTests(APITestCase):
    """
    Covers the "Manage Accounts"/"Account Creator" admin tools: an admin
    archiving/restoring/deleting any account, and directly provisioning a
    new customer/vendor account.
    """

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="acct-admin@example.com", password="s3cret!23"
        )
        self.other_admin = User.objects.create_superuser(
            email="acct-admin2@example.com", password="s3cret!23"
        )
        self.customer = User.objects.create_user(
            email="acct-cust@example.com", password="s3cret!23"
        )
        login = self.client.post(
            "/api/v1/auth/login/", {"email": "acct-admin@example.com", "password": "s3cret!23"}
        )
        self.admin_access = login.data["access"]

    def _auth(self, token=None):
        return {"HTTP_AUTHORIZATION": f"Bearer {token or self.admin_access}"}

    # -- archive --

    def test_admin_can_archive_another_account(self):
        response = self.client.post(
            f"/api/v1/admin/users/{self.customer.pk}/archive/", **self._auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.archived)

    def test_archived_account_can_still_log_in(self):
        # Archiving is a soft-disable, not a lockout — an archived account
        # can still authenticate; the frontend redirects it to a "contact
        # support" page, and apps.core.permissions.HasRole blocks it from
        # any role-gated action (see test_archived_vendor_cannot_create_listing).
        self.client.post(f"/api/v1/admin/users/{self.customer.pk}/archive/", **self._auth())
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "acct-cust@example.com", "password": "s3cret!23"},
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)

        me = self.client.get(
            "/api/v1/auth/user/", HTTP_AUTHORIZATION=f"Bearer {login.data['access']}"
        )
        self.assertTrue(me.data["archived"])

    def test_archived_vendor_cannot_create_listing(self):
        vendor = User.objects.create_user(
            email="acct-archived-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Archived Vendor Co",
            vendor_status=User.VendorStatus.APPROVED,
        )
        self.client.post(f"/api/v1/admin/users/{vendor.pk}/archive/", **self._auth())
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "acct-archived-vendor@example.com", "password": "s3cret!23"},
        )
        response = self.client.post(
            "/api/v1/listings/",
            {
                "title": "Test card",
                "description": "",
                "category": "vintage",
                "price": "10.00",
                "grading": "ungraded",
            },
            format="json",
            **self._auth(login.data["access"]),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_archive_own_account(self):
        response = self.client.post(f"/api/v1/admin/users/{self.admin.pk}/archive/", **self._auth())
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.archived)

    def test_non_admin_cannot_archive(self):
        login = self.client.post(
            "/api/v1/auth/login/", {"email": "acct-cust@example.com", "password": "s3cret!23"}
        )
        response = self.client.post(
            f"/api/v1/admin/users/{self.other_admin.pk}/archive/",
            **self._auth(login.data["access"]),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # -- restore --

    def test_admin_can_restore_archived_account(self):
        self.customer.archived = True
        self.customer.save(update_fields=["archived"])
        response = self.client.post(
            f"/api/v1/admin/users/{self.customer.pk}/restore/", **self._auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.archived)

    # -- delete --

    def test_admin_can_delete_another_account(self):
        response = self.client.delete(
            f"/api/v1/admin/users/{self.customer.pk}/", **self._auth()
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=self.customer.pk).exists())

    def test_admin_cannot_delete_own_account(self):
        response = self.client.delete(f"/api/v1/admin/users/{self.admin.pk}/", **self._auth())
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_non_admin_cannot_delete(self):
        login = self.client.post(
            "/api/v1/auth/login/", {"email": "acct-cust@example.com", "password": "s3cret!23"}
        )
        response = self.client.delete(
            f"/api/v1/admin/users/{self.other_admin.pk}/",
            **self._auth(login.data["access"]),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_deleting_vendor_cascades_their_listings(self):
        vendor = User.objects.create_user(
            email="acct-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Acct Vendor Co",
            vendor_status=User.VendorStatus.APPROVED,
        )
        Listing.objects.create(
            vendor=vendor,
            title="Test card",
            description="",
            category="vintage",
            price="10.00",
            grading="ungraded",
        )
        self.client.delete(f"/api/v1/admin/users/{vendor.pk}/", **self._auth())
        self.assertEqual(Listing.objects.filter(vendor_id=vendor.pk).count(), 0)

    # -- create --

    def test_admin_can_create_customer_account(self):
        response = self.client.post(
            "/api/v1/admin/users/create/",
            {
                "email": "created-cust@example.com",
                "password": "s3cret!23",
                "first_name": "Cam",
                "role": "customer",
            },
            **self._auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="created-cust@example.com")
        self.assertEqual(user.role, User.Role.CUSTOMER)
        self.assertTrue(user.onboarding_completed)
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "created-cust@example.com", "password": "s3cret!23"},
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)

    def test_admin_can_create_vendor_account_auto_approved(self):
        response = self.client.post(
            "/api/v1/admin/users/create/",
            {
                "email": "created-vendor@example.com",
                "password": "s3cret!23",
                "first_name": "Val",
                "role": "vendor",
                "business_name": "Val's Cards",
                "category_tags": ["vintage"],
            },
            **self._auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="created-vendor@example.com")
        self.assertEqual(user.vendor_status, User.VendorStatus.APPROVED)
        self.assertTrue(user.onboarding_completed)

    def test_create_vendor_requires_business_name(self):
        response = self.client.post(
            "/api/v1/admin/users/create/",
            {
                "email": "no-biz@example.com",
                "password": "s3cret!23",
                "first_name": "No",
                "role": "vendor",
            },
            **self._auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("business_name", response.data)

    def test_create_rejects_duplicate_email(self):
        response = self.client.post(
            "/api/v1/admin/users/create/",
            {
                "email": "acct-cust@example.com",
                "password": "s3cret!23",
                "first_name": "Dup",
                "role": "customer",
            },
            **self._auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_create_rejects_weak_password(self):
        response = self.client.post(
            "/api/v1/admin/users/create/",
            {
                "email": "weak-pw@example.com",
                "password": "123",
                "first_name": "Weak",
                "role": "customer",
            },
            **self._auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_non_admin_cannot_create_account(self):
        login = self.client.post(
            "/api/v1/auth/login/", {"email": "acct-cust@example.com", "password": "s3cret!23"}
        )
        response = self.client.post(
            "/api/v1/admin/users/create/",
            {
                "email": "blocked@example.com",
                "password": "s3cret!23",
                "first_name": "No",
                "role": "customer",
            },
            **self._auth(login.data["access"]),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
