# Listing permission behavior (pending vs approved vendor, non-vendor
# access) is covered by apps.users.tests.VendorApprovalFlowTests, which
# needs a real admin + approval flow already set up there.

from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User

from .models import Listing


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


class PublicListingFeedTests(APITestCase):
    """Covers the cross-vendor public feed backing the homepage/cards page."""

    def setUp(self):
        self.approved_vendor = User.objects.create_user(
            email="feed-approved@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Approved Feed Co",
            vendor_status=User.VendorStatus.APPROVED,
        )
        self.pending_vendor = User.objects.create_user(
            email="feed-pending@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Pending Feed Co",
            vendor_status=User.VendorStatus.PENDING_REVIEW,
        )

        access = self.client.post(
            "/api/v1/auth/login/",
            {"email": "feed-approved@example.com", "password": "s3cret!23"},
        ).data["access"]
        self.client.post(
            "/api/v1/listings/",
            {"title": "Rookie Card", "category": "vintage", "price": "20.00", "condition": "mint"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )

        # A pending vendor can still list their own items on their own
        # dashboard (see ListingListCreateView), but those shouldn't leak
        # into the public feed until they're approved.
        self.pending_vendor.vendor_status = User.VendorStatus.PENDING_REVIEW
        self.pending_vendor.save(update_fields=["vendor_status"])

    def test_shows_only_approved_vendors_listings(self):
        response = self.client.get("/api/v1/listings/public/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item["title"] for item in response.data["results"]]
        self.assertEqual(titles, ["Rookie Card"])

    def test_includes_vendor_identity_for_linking(self):
        response = self.client.get("/api/v1/listings/public/")
        result = response.data["results"][0]
        self.assertEqual(result["vendor"], self.approved_vendor.pk)
        self.assertEqual(result["vendor_name"], "Approved Feed Co")

    def test_empty_when_no_approved_vendors_have_listings(self):
        Listing = self.approved_vendor.listings.model
        Listing.objects.all().delete()
        response = self.client.get("/api/v1/listings/public/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"], [])

    def test_category_filter(self):
        response = self.client.get("/api/v1/listings/public/?category=modern")
        self.assertEqual(response.data["results"], [])
        response = self.client.get("/api/v1/listings/public/?category=vintage")
        self.assertEqual(len(response.data["results"]), 1)


class PublicListingDetailTests(APITestCase):
    """Covers the single-card page a "Recent listings"/Browse Cards click lands on."""

    def setUp(self):
        self.approved_vendor = User.objects.create_user(
            email="detail-approved@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Approved Detail Co",
            vendor_status=User.VendorStatus.APPROVED,
        )
        self.pending_vendor = User.objects.create_user(
            email="detail-pending@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Pending Detail Co",
            vendor_status=User.VendorStatus.PENDING_REVIEW,
        )
        self.listing = Listing.objects.create(
            vendor=self.approved_vendor,
            title="Rookie Card",
            category="vintage",
            price="20.00",
            condition="mint",
        )
        self.pending_listing = Listing.objects.create(
            vendor=self.pending_vendor,
            title="Not Yet Public",
            category="vintage",
            price="5.00",
            condition="good",
        )

    def test_anonymous_visitor_can_view_a_listing(self):
        response = self.client.get(f"/api/v1/listings/public/{self.listing.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "Rookie Card")
        self.assertEqual(response.data["vendor"], self.approved_vendor.pk)
        self.assertEqual(response.data["vendor_name"], "Approved Detail Co")

    def test_404_for_listing_from_a_pending_vendor(self):
        response = self.client.get(f"/api/v1/listings/public/{self.pending_listing.pk}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_404_for_missing_listing(self):
        response = self.client.get("/api/v1/listings/public/999999/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
