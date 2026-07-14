# Listing permission behavior (pending vs approved vendor, non-vendor
# access) is covered by apps.users.tests.VendorApprovalFlowTests, which
# needs a real admin + approval flow already set up there.

from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User


class ListingGradingTests(APITestCase):
    """Covers the "grading" dropdown (PSA/BGS/SGC/CGC/ungraded/other)."""

    def setUp(self):
        self.vendor = User.objects.create_user(
            email="grading-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Graded Cards Co",
            vendor_status=User.VendorStatus.APPROVED,
        )

    def access(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "grading-vendor@example.com", "password": "s3cret!23"},
        )
        return login.data["access"]

    def create_listing(self, **extra):
        payload = {"title": "Card", "category": "vintage", "price": "10.00", "condition": "mint"}
        payload.update(extra)
        return self.client.post(
            "/api/v1/listings/",
            payload,
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {self.access()}",
        )

    def test_defaults_to_ungraded(self):
        response = self.create_listing()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["grading"], "ungraded")

    def test_accepts_psa_grading(self):
        response = self.create_listing(grading="psa")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["grading"], "psa")

    def test_rejects_invalid_grading(self):
        response = self.create_listing(grading="not-a-real-grader")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PublicVendorListingsTests(APITestCase):
    """Covers the public "a vendor's listings" endpoint (their profile page)."""

    def setUp(self):
        self.vendor = User.objects.create_user(
            email="listings-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Listings Vendor Co",
            vendor_status=User.VendorStatus.APPROVED,
        )
        self.other_vendor = User.objects.create_user(
            email="other-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Other Vendor Co",
            vendor_status=User.VendorStatus.APPROVED,
        )
        self.customer = User.objects.create_user(
            email="listings-cust@example.com", password="s3cret!23"
        )

        access = self.client.post(
            "/api/v1/auth/login/",
            {"email": "listings-vendor@example.com", "password": "s3cret!23"},
        ).data["access"]
        self.client.post(
            "/api/v1/listings/",
            {"title": "My Card", "category": "vintage", "price": "10.00", "condition": "mint"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )

        other_access = self.client.post(
            "/api/v1/auth/login/",
            {"email": "other-vendor@example.com", "password": "s3cret!23"},
        ).data["access"]
        self.client.post(
            "/api/v1/listings/",
            {"title": "Other Card", "category": "modern", "price": "5.00", "condition": "mint"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {other_access}",
        )

    def test_anonymous_visitor_can_view_vendor_listings(self):
        response = self.client.get(f"/api/v1/vendors/{self.vendor.pk}/listings/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item["title"] for item in response.data["results"]]
        self.assertEqual(titles, ["My Card"])
        self.assertNotIn("Other Card", titles)

    def test_404_for_non_vendor_account(self):
        response = self.client.get(f"/api/v1/vendors/{self.customer.pk}/listings/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
