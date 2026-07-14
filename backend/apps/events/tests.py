import datetime
import io
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User

from .models import BoothAssignment, Event


def make_test_image(name="map.png"):
    """A minimal valid 1x1 PNG, small enough to keep tests fast."""
    buffer = io.BytesIO()
    Image.new("RGB", (1, 1)).save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/png")


class EventApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="events-admin@example.com", password="s3cret!23"
        )
        self.customer = User.objects.create_user(
            email="events-cust@example.com", password="s3cret!23"
        )
        self.vendor = User.objects.create_user(
            email="events-vendor@example.com", password="s3cret!23"
        )
        self.vendor.role = User.Role.VENDOR
        self.vendor.business_name = "Vendor Co"
        self.vendor.save()

        today = datetime.date.today()
        self.upcoming = Event.objects.create(
            name="Upcoming Show",
            venue="Some Hall",
            city="Some City",
            start_date=today + datetime.timedelta(days=10),
            estimated_cards=1000,
            estimated_attendees=200,
        )
        self.past = Event.objects.create(
            name="Past Show",
            venue="Old Hall",
            city="Old City",
            start_date=today - datetime.timedelta(days=10),
            estimated_cards=2000,
            estimated_attendees=400,
        )

    def access_for(self, email, password="s3cret!23"):
        login = self.client.post("/api/v1/auth/login/", {"email": email, "password": password})
        return login.data["access"]

    def test_list_is_public_and_reports_status(self):
        response = self.client.get("/api/v1/events/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        by_name = {e["name"]: e for e in response.data["results"]}
        self.assertEqual(by_name["Upcoming Show"]["status"], "upcoming")
        self.assertEqual(by_name["Past Show"]["status"], "past")

    def test_detail_is_public(self):
        response = self.client.get(f"/api/v1/events/{self.upcoming.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Upcoming Show")

    def test_non_admin_cannot_create_event(self):
        access = self.access_for("events-cust@example.com")
        response = self.client.post(
            "/api/v1/events/",
            {"name": "New Show", "venue": "V", "city": "C", "start_date": "2027-01-01"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_event_with_vendors(self):
        access = self.access_for("events-admin@example.com")
        response = self.client.post(
            "/api/v1/events/",
            {
                "name": "New Show",
                "venue": "V",
                "city": "C",
                "start_date": "2027-01-01",
                "end_date": "2027-01-02",
                "description": "A new show",
                "estimated_cards": 5000,
                "estimated_attendees": 1000,
                "vendors": [self.vendor.pk],
            },
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["vendor_count"], 1)
        self.assertEqual(
            response.data["vendors_detail"], [{"pk": self.vendor.pk, "label": "Vendor Co"}]
        )

    def test_create_rejects_non_vendor_user_in_vendors_field(self):
        access = self.access_for("events-admin@example.com")
        response = self.client.post(
            "/api/v1/events/",
            {
                "name": "New Show",
                "venue": "V",
                "city": "C",
                "start_date": "2027-01-01",
                "vendors": [self.customer.pk],
            },
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_cannot_update_event(self):
        access = self.access_for("events-cust@example.com")
        response = self.client.patch(
            f"/api/v1/events/{self.upcoming.pk}/",
            {"estimated_attendees": 9999},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_update_event_fields(self):
        access = self.access_for("events-admin@example.com")
        response = self.client.patch(
            f"/api/v1/events/{self.upcoming.pk}/",
            {
                "name": "Renamed Show",
                "estimated_attendees": 9999,
                "vendors": [self.vendor.pk],
            },
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Renamed Show")
        self.assertEqual(response.data["estimated_attendees"], 9999)
        self.assertEqual(response.data["vendor_count"], 1)

    def test_admin_can_update_a_past_event(self):
        # Regression guard: nothing should make past events read-only.
        access = self.access_for("events-admin@example.com")
        response = self.client.patch(
            f"/api/v1/events/{self.past.pk}/",
            {"estimated_attendees": 4242},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "past")
        self.assertEqual(response.data["estimated_attendees"], 4242)

    def test_search_matches_name_venue_or_city(self):
        by_name = self.client.get("/api/v1/events/?search=Upcoming Show").data["results"]
        self.assertEqual([e["name"] for e in by_name], ["Upcoming Show"])

        by_venue = self.client.get("/api/v1/events/?search=Old Hall").data["results"]
        self.assertEqual([e["name"] for e in by_venue], ["Past Show"])

        by_city = self.client.get("/api/v1/events/?search=Some City").data["results"]
        self.assertEqual([e["name"] for e in by_city], ["Upcoming Show"])

    def test_page_size_query_param_is_respected(self):
        # Start from a clean slate — the events migration seeds 7 shows of
        # its own, which would otherwise throw off the exact counts below.
        Event.objects.all().delete()
        for i in range(7):
            Event.objects.create(
                name=f"Extra Show {i}",
                venue="V",
                city="C",
                start_date=datetime.date.today() + datetime.timedelta(days=i),
            )

        response = self.client.get("/api/v1/events/?page_size=5")
        self.assertEqual(response.data["count"], 7)
        self.assertEqual(len(response.data["results"]), 5)
        self.assertIsNotNone(response.data["next"])

        second_page = self.client.get("/api/v1/events/?page_size=5&page=2")
        self.assertEqual(len(second_page.data["results"]), 2)
        self.assertIsNone(second_page.data["next"])
        self.assertIsNotNone(second_page.data["previous"])


class EventFloorMapTests(APITestCase):
    """Covers map image upload, map_visible, booth CRUD, and the public /map/ endpoint."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Uploaded test images must not land in the real MEDIA_ROOT (they'd
        # pile up in backend/media/ on every test run) — redirect to a
        # throwaway temp dir for the duration of this class instead.
        cls._temp_media_root = tempfile.mkdtemp()
        cls._media_override = override_settings(MEDIA_ROOT=cls._temp_media_root)
        cls._media_override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._media_override.disable()
        shutil.rmtree(cls._temp_media_root, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="map-admin@example.com", password="s3cret!23"
        )
        self.customer = User.objects.create_user(
            email="map-cust@example.com", password="s3cret!23"
        )
        self.vendor = User.objects.create_user(
            email="map-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Booth Vendor Co",
            category_tags=["vintage"],
        )
        self.event = Event.objects.create(
            name="Map Show",
            venue="Map Hall",
            city="Map City",
            start_date=datetime.date.today(),
        )

    def access_for(self, email, password="s3cret!23"):
        login = self.client.post("/api/v1/auth/login/", {"email": email, "password": password})
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('map-admin@example.com')}"}

    # --- Map image upload ---

    def test_admin_can_upload_map_image(self):
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/map-image/",
            {"map_image": make_test_image()},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["map_image_url"])
        self.event.refresh_from_db()
        self.assertTrue(bool(self.event.map_image))

    def test_non_admin_cannot_upload_map_image(self):
        access = self.access_for("map-cust@example.com")
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/map-image/",
            {"map_image": make_test_image()},
            format="multipart",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_upload_without_file_is_rejected(self):
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/map-image/",
            {},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upload_replaces_existing_image(self):
        self.client.post(
            f"/api/v1/events/{self.event.pk}/map-image/",
            {"map_image": make_test_image("first.png")},
            format="multipart",
            **self.admin_auth(),
        )
        self.event.refresh_from_db()
        first_name = self.event.map_image.name

        self.client.post(
            f"/api/v1/events/{self.event.pk}/map-image/",
            {"map_image": make_test_image("second.png")},
            format="multipart",
            **self.admin_auth(),
        )
        self.event.refresh_from_db()
        self.assertNotEqual(self.event.map_image.name, first_name)

    # --- Preset (generic layout) selection ---

    def test_admin_can_choose_a_preset(self):
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/map-preset/",
            {"preset": "single_hall"},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["map_image_preset"], "single_hall")
        self.event.refresh_from_db()
        self.assertEqual(self.event.map_image_preset, "single_hall")

    def test_invalid_preset_key_is_rejected(self):
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/map-preset/",
            {"preset": "not-a-real-preset"},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_cannot_choose_a_preset(self):
        access = self.access_for("map-cust@example.com")
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/map-preset/",
            {"preset": "single_hall"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_choosing_a_preset_clears_a_real_uploaded_image(self):
        self.client.post(
            f"/api/v1/events/{self.event.pk}/map-image/",
            {"map_image": make_test_image()},
            format="multipart",
            **self.admin_auth(),
        )
        self.client.post(
            f"/api/v1/events/{self.event.pk}/map-preset/",
            {"preset": "l_shaped"},
            format="json",
            **self.admin_auth(),
        )
        self.event.refresh_from_db()
        self.assertFalse(bool(self.event.map_image))
        self.assertEqual(self.event.map_image_preset, "l_shaped")

    def test_uploading_a_real_image_clears_a_chosen_preset(self):
        self.client.post(
            f"/api/v1/events/{self.event.pk}/map-preset/",
            {"preset": "two_room"},
            format="json",
            **self.admin_auth(),
        )
        self.client.post(
            f"/api/v1/events/{self.event.pk}/map-image/",
            {"map_image": make_test_image()},
            format="multipart",
            **self.admin_auth(),
        )
        self.event.refresh_from_db()
        self.assertTrue(bool(self.event.map_image))
        self.assertEqual(self.event.map_image_preset, "")

    def test_public_map_treats_preset_only_as_a_map_existing(self):
        self.client.post(
            f"/api/v1/events/{self.event.pk}/map-preset/",
            {"preset": "center_aisle"},
            format="json",
            **self.admin_auth(),
        )
        self.client.patch(
            f"/api/v1/events/{self.event.pk}/",
            {"map_visible": True},
            format="json",
            **self.admin_auth(),
        )
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["map_image_preset"], "center_aisle")
        self.assertIsNone(response.data["map_image_url"])

    # --- map_visible toggle (via the general event PATCH) ---

    def test_admin_can_toggle_map_visible(self):
        response = self.client.patch(
            f"/api/v1/events/{self.event.pk}/",
            {"map_visible": True},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["map_visible"])
        self.event.refresh_from_db()
        self.assertTrue(self.event.map_visible)

    def test_non_admin_cannot_toggle_map_visible(self):
        access = self.access_for("map-cust@example.com")
        response = self.client.patch(
            f"/api/v1/events/{self.event.pk}/",
            {"map_visible": True},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --- Booth CRUD ---

    def booth_payload(self, **overrides):
        payload = {
            "booth_number": "101",
            "position_x": "10.00",
            "position_y": "20.00",
            "width": "5.00",
            "height": "5.00",
        }
        payload.update(overrides)
        return payload

    def test_admin_can_create_booth_linked_to_vendor(self):
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/",
            self.booth_payload(vendor=self.vendor.pk),
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["vendor"], self.vendor.pk)
        self.assertEqual(
            response.data["vendor_detail"], {"pk": self.vendor.pk, "label": "Booth Vendor Co"}
        )
        self.assertEqual(response.data["unlinked_vendor_name"], "")

    def test_admin_can_create_booth_with_unlinked_vendor(self):
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/",
            self.booth_payload(
                unlinked_vendor_name="Walk-in Dealer",
                unlinked_vendor_category="vintage",
                unlinked_vendor_contact="555-1234",
            ),
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data["vendor"])
        self.assertEqual(response.data["unlinked_vendor_name"], "Walk-in Dealer")
        # Contact is admin-only reference, but this IS the admin-facing
        # serializer, so it's fine for it to appear here (the public one
        # never includes it — see test_public_map_never_exposes_contact).
        self.assertEqual(response.data["unlinked_vendor_contact"], "555-1234")

    def test_booth_requires_exactly_one_of_vendor_or_unlinked_name(self):
        neither = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/",
            self.booth_payload(),
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(neither.status_code, status.HTTP_400_BAD_REQUEST)

        both = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/",
            self.booth_payload(vendor=self.vendor.pk, unlinked_vendor_name="Someone Else"),
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(both.status_code, status.HTTP_400_BAD_REQUEST)

    def test_booth_position_and_size_are_range_validated(self):
        for field, bad_value in [
            ("position_x", "-1"),
            ("position_x", "101"),
            ("position_y", "101"),
            ("width", "0"),
            ("width", "101"),
            ("height", "0"),
        ]:
            response = self.client.post(
                f"/api/v1/events/{self.event.pk}/booths/",
                self.booth_payload(vendor=self.vendor.pk, **{field: bad_value}),
                format="json",
                **self.admin_auth(),
            )
            self.assertEqual(
                response.status_code,
                status.HTTP_400_BAD_REQUEST,
                f"{field}={bad_value} should have been rejected",
            )

    def test_duplicate_booth_number_within_event_is_rejected(self):
        self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/",
            self.booth_payload(vendor=self.vendor.pk),
            format="json",
            **self.admin_auth(),
        )
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/",
            self.booth_payload(unlinked_vendor_name="Someone Else"),
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_same_booth_number_allowed_across_different_events(self):
        other_event = Event.objects.create(
            name="Other Show", venue="V", city="C", start_date=datetime.date.today()
        )
        self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/",
            self.booth_payload(vendor=self.vendor.pk),
            format="json",
            **self.admin_auth(),
        )
        response = self.client.post(
            f"/api/v1/events/{other_event.pk}/booths/",
            self.booth_payload(unlinked_vendor_name="Someone Else"),
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_admin_can_reposition_and_reassign_booth(self):
        created = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/",
            self.booth_payload(vendor=self.vendor.pk),
            format="json",
            **self.admin_auth(),
        )
        booth_id = created.data["id"]

        reposition = self.client.patch(
            f"/api/v1/events/booths/{booth_id}/",
            {"position_x": "50.00"},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(reposition.status_code, status.HTTP_200_OK)
        self.assertEqual(str(reposition.data["position_x"]), "50.00")
        # Untouched fields (vendor link) should survive a partial update.
        self.assertEqual(reposition.data["vendor"], self.vendor.pk)

        flipped = self.client.patch(
            f"/api/v1/events/booths/{booth_id}/",
            {"unlinked_vendor_name": "New Walk-in"},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(flipped.status_code, status.HTTP_200_OK)
        self.assertIsNone(flipped.data["vendor"])
        self.assertEqual(flipped.data["unlinked_vendor_name"], "New Walk-in")

    def test_admin_can_delete_booth(self):
        created = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/",
            self.booth_payload(vendor=self.vendor.pk),
            format="json",
            **self.admin_auth(),
        )
        booth_id = created.data["id"]

        response = self.client.delete(
            f"/api/v1/events/booths/{booth_id}/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(BoothAssignment.objects.filter(pk=booth_id).exists())

    def test_non_admin_cannot_manage_booths(self):
        access = self.access_for("map-cust@example.com")
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/",
            self.booth_payload(vendor=self.vendor.pk),
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --- Public map endpoint ---

    def _make_visible_map_with_booths(self):
        self.client.post(
            f"/api/v1/events/{self.event.pk}/map-image/",
            {"map_image": make_test_image()},
            format="multipart",
            **self.admin_auth(),
        )
        self.client.patch(
            f"/api/v1/events/{self.event.pk}/",
            {"map_visible": True},
            format="json",
            **self.admin_auth(),
        )
        self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/",
            self.booth_payload(booth_number="1", vendor=self.vendor.pk),
            format="json",
            **self.admin_auth(),
        )
        self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/",
            self.booth_payload(
                booth_number="2",
                unlinked_vendor_name="Walk-in Dealer",
                unlinked_vendor_category="vintage",
                unlinked_vendor_contact="555-1234",
            ),
            format="json",
            **self.admin_auth(),
        )

    def test_public_map_404s_when_not_visible(self):
        self.client.post(
            f"/api/v1/events/{self.event.pk}/map-image/",
            {"map_image": make_test_image()},
            format="multipart",
            **self.admin_auth(),
        )
        # map_visible defaults to False — never toggled on here.
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_map_404s_when_no_image_even_if_visible(self):
        self.client.patch(
            f"/api/v1/events/{self.event.pk}/",
            {"map_visible": True},
            format="json",
            **self.admin_auth(),
        )
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_map_404s_for_nonexistent_event(self):
        response = self.client.get("/api/v1/events/999999/map/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_view_map_even_when_not_visible(self):
        self.client.post(
            f"/api/v1/events/{self.event.pk}/map-image/",
            {"map_image": make_test_image()},
            format="multipart",
            **self.admin_auth(),
        )
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/", **self.admin_auth())
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_public_map_returns_correct_booth_data_when_visible(self):
        self._make_visible_map_with_booths()

        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["map_image_url"])

        by_number = {b["booth_number"]: b for b in response.data["booths"]}

        linked = by_number["1"]
        self.assertEqual(linked["vendor_pk"], self.vendor.pk)
        self.assertEqual(linked["vendor_name"], "Booth Vendor Co")
        self.assertEqual(linked["vendor_category_tags"], ["vintage"])

        unlinked = by_number["2"]
        self.assertIsNone(unlinked["vendor_pk"])
        self.assertEqual(unlinked["vendor_name"], "Walk-in Dealer")
        self.assertEqual(unlinked["vendor_category_tags"], ["vintage"])

    def test_public_map_never_exposes_unlinked_contact(self):
        self._make_visible_map_with_booths()
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/")

        response_text = str(response.data)
        self.assertNotIn("555-1234", response_text)
        for booth in response.data["booths"]:
            self.assertNotIn("unlinked_vendor_contact", booth)
