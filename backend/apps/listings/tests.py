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
