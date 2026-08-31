import io

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User

from .models import Listing


def make_test_image(name="card.png"):
    """A minimal valid 1x1 PNG, small enough to keep tests fast."""
    buffer = io.BytesIO()
    Image.new("RGB", (1, 1)).save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


# Listing permission behavior (pending vs approved vendor, non-vendor
# access) is covered by apps.users.tests.VendorApprovalFlowTests, which
# needs a real admin + approval flow already set up there.


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
        payload = {
            "title": "Card",
            "category": "vintage",
            "price": "10.00",
            "front_image": make_test_image("front.png"),
            "back_image": make_test_image("back.png"),
        }
        payload.update(extra)
        return self.client.post(
            "/api/v1/listings/",
            payload,
            format="multipart",
            HTTP_AUTHORIZATION=f"Bearer {self.access()}",
        )

    def test_defaults_to_ungraded(self):
        response = self.create_listing()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["grading"], "ungraded")
        self.assertIsNone(response.data["grade"])

    def test_accepts_psa_grading_with_a_grade(self):
        response = self.create_listing(grading="psa", grade="9.5")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["grading"], "psa")
        self.assertEqual(response.data["grade"], "9.5")

    def test_rejects_invalid_grading(self):
        response = self.create_listing(grading="not-a-real-grader", grade="9")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_a_grading_company_without_a_grade(self):
        response = self.create_listing(grading="psa")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("grade", response.data)

    def test_rejects_a_grade_while_ungraded(self):
        response = self.create_listing(grade="9.5")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("grade", response.data)

    def test_rejects_a_grade_outside_one_to_ten(self):
        response = self.create_listing(grading="psa", grade="11")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("grade", response.data)

    def test_other_grading_company_requires_a_name(self):
        response = self.create_listing(grading="other", grade="9")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("grading_company_other", response.data)

    def test_other_grading_company_with_a_name_succeeds(self):
        response = self.create_listing(grading="other", grade="9", grading_company_other="HGA")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["grading_company_other"], "HGA")


class ListingRequiredFieldsTests(APITestCase):
    """Covers the required photos / price-or-offer / serial numbering rules."""

    def setUp(self):
        self.vendor = User.objects.create_user(
            email="fields-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Fields Cards Co",
            vendor_status=User.VendorStatus.APPROVED,
        )

    def access(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "fields-vendor@example.com", "password": "s3cret!23"},
        )
        return login.data["access"]

    def create_listing(self, **extra):
        payload = {
            "title": "Card",
            "category": "vintage",
            "price": "10.00",
            "front_image": make_test_image("front.png"),
            "back_image": make_test_image("back.png"),
        }
        payload.update(extra)
        return self.client.post(
            "/api/v1/listings/",
            payload,
            format="multipart",
            HTTP_AUTHORIZATION=f"Bearer {self.access()}",
        )

    def test_front_image_is_required(self):
        response = self.create_listing(front_image="")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("front_image", response.data)

    def test_back_image_is_required(self):
        response = self.create_listing(back_image="")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("back_image", response.data)

    def test_editing_does_not_require_reuploading_photos(self):
        create = self.create_listing()
        listing_id = create.data["id"]
        response = self.client.patch(
            f"/api/v1/listings/{listing_id}/",
            {"description": "Updated description"},
            format="multipart",
            HTTP_AUTHORIZATION=f"Bearer {self.access()}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_requires_price_or_offers_or_trades(self):
        response = self.create_listing(price="")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_accepting_offers_without_a_price_is_allowed(self):
        response = self.create_listing(price="", accepting_offers=True)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data["price"])
        self.assertTrue(response.data["accepting_offers"])

    def test_accepting_trades_without_a_price_is_allowed(self):
        response = self.create_listing(price="", accepting_trades=True)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["accepting_trades"])

    def test_serial_numbering_requires_both_parts(self):
        response = self.create_listing(is_serial_numbered=True, serial_copy_number=57)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_serial_numbering_with_both_parts_succeeds(self):
        response = self.create_listing(
            is_serial_numbered=True, serial_copy_number=57, serial_print_run=99
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["serial_copy_number"], 57)
        self.assertEqual(response.data["serial_print_run"], 99)

    def test_rejects_serial_number_without_toggle(self):
        response = self.create_listing(serial_copy_number=57, serial_print_run=99)
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
            {
                "title": "My Card",
                "category": "vintage",
                "price": "10.00",
                "front_image": make_test_image("front.png"),
                "back_image": make_test_image("back.png"),
            },
            format="multipart",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )

        other_access = self.client.post(
            "/api/v1/auth/login/",
            {"email": "other-vendor@example.com", "password": "s3cret!23"},
        ).data["access"]
        self.client.post(
            "/api/v1/listings/",
            {
                "title": "Other Card",
                "category": "modern",
                "price": "5.00",
                "front_image": make_test_image("front2.png"),
                "back_image": make_test_image("back2.png"),
            },
            format="multipart",
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
            {
                "title": "Rookie Card",
                "category": "vintage",
                "price": "20.00",
                "front_image": make_test_image("front.png"),
                "back_image": make_test_image("back.png"),
            },
            format="multipart",
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

    def test_card_filter(self):
        response = self.client.get("/api/v1/listings/public/?card=999999")
        self.assertEqual(response.data["results"], [])


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
        )
        self.pending_listing = Listing.objects.create(
            vendor=self.pending_vendor,
            title="Not Yet Public",
            category="vintage",
            price="5.00",
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
