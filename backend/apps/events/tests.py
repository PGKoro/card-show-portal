import datetime
import io
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User

from .models import Booth, BoothRegistration, Event, Venue, VenueSection
from .services import create_loyalty_holds


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

        self.venue = Venue.objects.create(name="Test Venue", city="Test City")

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
                "map_venue": self.venue.pk,
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

    def test_create_derives_venue_and_city_from_map_venue(self):
        # venue/city are read-only — a client-supplied value is ignored in
        # favor of whatever the selected Venue's own name/city are.
        access = self.access_for("events-admin@example.com")
        response = self.client.post(
            "/api/v1/events/",
            {
                "name": "New Show",
                "map_venue": self.venue.pk,
                "venue": "Should be ignored",
                "city": "Should be ignored",
                "start_date": "2027-01-01",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["venue"], "Test Venue")
        self.assertEqual(response.data["city"], "Test City")

    def test_create_requires_a_map_venue(self):
        access = self.access_for("events-admin@example.com")
        response = self.client.post(
            "/api/v1/events/",
            {"name": "New Show", "start_date": "2027-01-01"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("map_venue", response.data)

    def test_create_rejects_non_vendor_user_in_vendors_field(self):
        access = self.access_for("events-admin@example.com")
        response = self.client.post(
            "/api/v1/events/",
            {
                "name": "New Show",
                "map_venue": self.venue.pk,
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

    def test_archived_event_is_hidden_from_the_default_list(self):
        archived = Event.objects.create(
            name="Archived Show",
            venue="Archive Hall",
            city="Archive City",
            start_date=datetime.date.today(),
            archived=True,
        )
        response = self.client.get("/api/v1/events/")
        names = [e["name"] for e in response.data["results"]]
        self.assertNotIn(archived.name, names)

    def test_archived_event_is_hidden_from_upcoming_and_past_filters(self):
        Event.objects.create(
            name="Archived Upcoming",
            venue="Archive Hall",
            city="Archive City",
            start_date=datetime.date.today() + datetime.timedelta(days=5),
            archived=True,
        )
        Event.objects.create(
            name="Archived Past",
            venue="Archive Hall",
            city="Archive City",
            start_date=datetime.date.today() - datetime.timedelta(days=5),
            archived=True,
        )
        upcoming = self.client.get("/api/v1/events/?status=upcoming").data["results"]
        past = self.client.get("/api/v1/events/?status=past").data["results"]
        self.assertNotIn("Archived Upcoming", [e["name"] for e in upcoming])
        self.assertNotIn("Archived Past", [e["name"] for e in past])

    def test_anonymous_status_archived_returns_empty(self):
        Event.objects.create(
            name="Archived Show",
            venue="Archive Hall",
            city="Archive City",
            start_date=datetime.date.today(),
            archived=True,
        )
        response = self.client.get("/api/v1/events/?status=archived")
        self.assertEqual(response.data["results"], [])

    def test_admin_can_see_archived_events_via_status_filter(self):
        archived = Event.objects.create(
            name="Archived Show",
            venue="Archive Hall",
            city="Archive City",
            start_date=datetime.date.today(),
            archived=True,
        )
        access = self.access_for("events-admin@example.com")
        response = self.client.get(
            "/api/v1/events/?status=archived", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        names = [e["name"] for e in response.data["results"]]
        self.assertEqual(names, [archived.name])

    def test_archived_event_detail_404s_for_anonymous_visitor(self):
        archived = Event.objects.create(
            name="Archived Show",
            venue="Archive Hall",
            city="Archive City",
            start_date=datetime.date.today(),
            archived=True,
        )
        response = self.client.get(f"/api/v1/events/{archived.pk}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_archived_event_detail_404s_for_a_non_admin_customer(self):
        archived = Event.objects.create(
            name="Archived Show",
            venue="Archive Hall",
            city="Archive City",
            start_date=datetime.date.today(),
            archived=True,
        )
        access = self.access_for("events-cust@example.com")
        response = self.client.get(
            f"/api/v1/events/{archived.pk}/", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_still_view_and_unarchive_an_archived_event(self):
        archived = Event.objects.create(
            name="Archived Show",
            venue="Archive Hall",
            city="Archive City",
            start_date=datetime.date.today(),
            archived=True,
        )
        access = self.access_for("events-admin@example.com")
        auth = {"HTTP_AUTHORIZATION": f"Bearer {access}"}
        get_response = self.client.get(f"/api/v1/events/{archived.pk}/", **auth)
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)

        restore_response = self.client.patch(
            f"/api/v1/events/{archived.pk}/", {"archived": False}, format="json", **auth
        )
        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)
        self.assertFalse(restore_response.data["archived"])


class VenueTests(APITestCase):
    """Covers basic Venue CRUD — the reusable floor-plan container."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="venue-admin@example.com", password="s3cret!23"
        )
        self.customer = User.objects.create_user(
            email="venue-cust@example.com", password="s3cret!23"
        )

    def access_for(self, email, password="s3cret!23"):
        login = self.client.post("/api/v1/auth/login/", {"email": email, "password": password})
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('venue-admin@example.com')}"}

    def test_admin_can_create_venue(self):
        response = self.client.post(
            "/api/v1/venues/",
            {"name": "Donald E. Stephens Convention Center", "city": "Rosemont"},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["booth_count"], 0)

    def test_non_admin_cannot_create_venue(self):
        access = self.access_for("venue-cust@example.com")
        response = self.client.post(
            "/api/v1/venues/",
            {"name": "V", "city": "C"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_rename_and_delete_venue(self):
        venue = Venue.objects.create(name="Old Name", city="City")
        rename = self.client.patch(
            f"/api/v1/venues/{venue.pk}/", {"name": "New Name"}, format="json", **self.admin_auth()
        )
        self.assertEqual(rename.status_code, status.HTTP_200_OK)
        self.assertEqual(rename.data["name"], "New Name")

        delete = self.client.delete(f"/api/v1/venues/{venue.pk}/", **self.admin_auth())
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Venue.objects.filter(pk=venue.pk).exists())

    def test_venue_list_supports_search_by_name_or_city(self):
        Venue.objects.create(name="Austin Convention Center", city="Austin")
        Venue.objects.create(name="McCormick Place", city="Chicago")

        by_name = self.client.get("/api/v1/venues/?search=austin", **self.admin_auth())
        self.assertEqual(by_name.data["count"], 1)
        self.assertEqual(by_name.data["results"][0]["name"], "Austin Convention Center")

        by_city = self.client.get("/api/v1/venues/?search=chicago", **self.admin_auth())
        self.assertEqual(by_city.data["count"], 1)
        self.assertEqual(by_city.data["results"][0]["name"], "McCormick Place")


class VenueMapTests(APITestCase):
    """Covers venue map image upload/preset selection and the admin map-editor endpoint."""

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
        self.admin = User.objects.create_superuser(
            email="vmap-admin@example.com", password="s3cret!23"
        )
        self.customer = User.objects.create_user(
            email="vmap-cust@example.com", password="s3cret!23"
        )
        self.venue = Venue.objects.create(name="Map Hall", city="Map City")

    def access_for(self, email, password="s3cret!23"):
        login = self.client.post("/api/v1/auth/login/", {"email": email, "password": password})
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('vmap-admin@example.com')}"}

    def test_admin_can_upload_map_image(self):
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/map-image/",
            {"map_image": make_test_image()},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["map_image_url"])
        self.venue.refresh_from_db()
        self.assertTrue(bool(self.venue.map_image))

    def test_non_admin_cannot_upload_map_image(self):
        access = self.access_for("vmap-cust@example.com")
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/map-image/",
            {"map_image": make_test_image()},
            format="multipart",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_upload_without_file_is_rejected(self):
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/map-image/",
            {},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_choose_a_preset(self):
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/map-preset/",
            {"preset": "single_hall"},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.venue.refresh_from_db()
        self.assertEqual(self.venue.map_image_preset, "single_hall")

    def test_invalid_preset_key_is_rejected(self):
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/map-preset/",
            {"preset": "not-a-real-preset"},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_choosing_a_preset_clears_a_real_uploaded_image(self):
        self.client.post(
            f"/api/v1/venues/{self.venue.pk}/map-image/",
            {"map_image": make_test_image()},
            format="multipart",
            **self.admin_auth(),
        )
        self.client.post(
            f"/api/v1/venues/{self.venue.pk}/map-preset/",
            {"preset": "l_shaped"},
            format="json",
            **self.admin_auth(),
        )
        self.venue.refresh_from_db()
        self.assertFalse(bool(self.venue.map_image))
        self.assertEqual(self.venue.map_image_preset, "l_shaped")

    def test_admin_map_editor_endpoint_includes_booths_and_sections(self):
        Booth.objects.create(
            venue=self.venue,
            booth_number="1",
            position_x=1,
            position_y=1,
            width=5,
            height=5,
            price="25.00",
        )
        VenueSection.objects.create(
            venue=self.venue, category="pokemon", position_x=0, position_y=0, width=25, height=25
        )
        response = self.client.get(f"/api/v1/venues/{self.venue.pk}/map/", **self.admin_auth())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["booths"]), 1)
        self.assertEqual(response.data["booths"][0]["price"], "25.00")
        self.assertEqual(len(response.data["sections"]), 1)

    def test_non_admin_cannot_view_admin_map_editor_endpoint(self):
        access = self.access_for("vmap-cust@example.com")
        response = self.client.get(
            f"/api/v1/venues/{self.venue.pk}/map/", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class BoothTests(APITestCase):
    """Covers physical booth-slot CRUD on a venue, including price."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="booth-admin@example.com", password="s3cret!23"
        )
        self.customer = User.objects.create_user(
            email="booth-cust@example.com", password="s3cret!23"
        )
        self.venue = Venue.objects.create(name="Booth Hall", city="Booth City")

    def access_for(self, email, password="s3cret!23"):
        login = self.client.post("/api/v1/auth/login/", {"email": email, "password": password})
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('booth-admin@example.com')}"}

    def booth_payload(self, **overrides):
        payload = {
            "booth_number": "101",
            "position_x": "10.00",
            "position_y": "20.00",
            "width": "5.00",
            "height": "5.00",
            "price": "50.00",
        }
        payload.update(overrides)
        return payload

    def test_admin_can_create_booth_with_price(self):
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/booths/",
            self.booth_payload(),
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["price"], "50.00")

    def test_price_defaults_to_zero_when_omitted(self):
        payload = self.booth_payload()
        del payload["price"]
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/booths/", payload, format="json", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["price"], "0.00")

    def test_negative_price_is_rejected(self):
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/booths/",
            self.booth_payload(price="-5.00"),
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_booth_position_and_size_are_range_validated(self):
        for field, bad_value in [
            ("position_x", "-1"),
            ("position_x", "101"),
            ("width", "0"),
            ("height", "0"),
        ]:
            response = self.client.post(
                f"/api/v1/venues/{self.venue.pk}/booths/",
                self.booth_payload(**{field: bad_value}),
                format="json",
                **self.admin_auth(),
            )
            self.assertEqual(
                response.status_code,
                status.HTTP_400_BAD_REQUEST,
                f"{field}={bad_value} should have been rejected",
            )

    def test_duplicate_booth_number_within_venue_is_rejected(self):
        self.client.post(
            f"/api/v1/venues/{self.venue.pk}/booths/",
            self.booth_payload(),
            format="json",
            **self.admin_auth(),
        )
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/booths/",
            self.booth_payload(),
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_same_booth_number_allowed_across_different_venues(self):
        other_venue = Venue.objects.create(name="Other Hall", city="C")
        self.client.post(
            f"/api/v1/venues/{self.venue.pk}/booths/",
            self.booth_payload(),
            format="json",
            **self.admin_auth(),
        )
        response = self.client.post(
            f"/api/v1/venues/{other_venue.pk}/booths/",
            self.booth_payload(),
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_admin_can_reposition_and_reprice_booth(self):
        created = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/booths/",
            self.booth_payload(),
            format="json",
            **self.admin_auth(),
        )
        booth_id = created.data["id"]
        response = self.client.patch(
            f"/api/v1/venues/booths/{booth_id}/",
            {"position_x": "60.00", "price": "75.00"},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["position_x"]), "60.00")
        self.assertEqual(response.data["price"], "75.00")

    def test_admin_can_delete_booth(self):
        created = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/booths/",
            self.booth_payload(),
            format="json",
            **self.admin_auth(),
        )
        booth_id = created.data["id"]
        response = self.client.delete(f"/api/v1/venues/booths/{booth_id}/", **self.admin_auth())
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Booth.objects.filter(pk=booth_id).exists())

    def test_non_admin_cannot_manage_booths(self):
        access = self.access_for("booth-cust@example.com")
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/booths/",
            self.booth_payload(),
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class VenueSectionTests(APITestCase):
    """Covers category-zone overlay CRUD on a venue's floor plan."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="section-admin@example.com", password="s3cret!23"
        )
        self.customer = User.objects.create_user(
            email="section-cust@example.com", password="s3cret!23"
        )
        self.venue = Venue.objects.create(name="Section Hall", city="Section City")

    def access_for(self, email, password="s3cret!23"):
        login = self.client.post("/api/v1/auth/login/", {"email": email, "password": password})
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('section-admin@example.com')}"}

    def section_payload(self, **overrides):
        payload = {
            "category": "pokemon",
            "position_x": "0.00",
            "position_y": "0.00",
            "width": "25.00",
            "height": "25.00",
        }
        payload.update(overrides)
        return payload

    def test_admin_can_create_section(self):
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/sections/",
            self.section_payload(),
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.venue.refresh_from_db()
        self.assertEqual(self.venue.sections.count(), 1)

    def test_non_admin_cannot_create_section(self):
        access = self.access_for("section-cust@example.com")
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/sections/",
            self.section_payload(),
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_category_is_rejected(self):
        response = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/sections/",
            self.section_payload(category="not-a-real-category"),
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_delete_section(self):
        create = self.client.post(
            f"/api/v1/venues/{self.venue.pk}/sections/",
            self.section_payload(),
            format="json",
            **self.admin_auth(),
        )
        section_id = create.data["id"]
        response = self.client.delete(
            f"/api/v1/venues/sections/{section_id}/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.venue.sections.count(), 0)


class PublicEventMapTests(APITestCase):
    """Covers the public /events/<id>/map/ endpoint against the new venue/registration schema."""

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
        self.admin = User.objects.create_superuser(
            email="pubmap-admin@example.com", password="s3cret!23"
        )
        self.vendor = User.objects.create_user(
            email="pubmap-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Booth Vendor Co",
            category_tags=["vintage"],
        )
        self.venue = Venue.objects.create(name="Pub Hall", city="Pub City")
        self.booth1 = Booth.objects.create(
            venue=self.venue,
            booth_number="1",
            position_x=0,
            position_y=0,
            width=5,
            height=5,
            price=10,
        )
        self.booth2 = Booth.objects.create(
            venue=self.venue,
            booth_number="2",
            position_x=10,
            position_y=0,
            width=5,
            height=5,
            price=10,
        )
        self.event = Event.objects.create(
            name="Map Show", venue="Map Hall", city="Map City", start_date=datetime.date.today()
        )

    def access_for(self, email, password="s3cret!23"):
        login = self.client.post("/api/v1/auth/login/", {"email": email, "password": password})
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('pubmap-admin@example.com')}"}

    def make_confirmed_registration(self, booth, **overrides):
        payload = {"booth": booth.pk, "status": "confirmed"}
        payload.update(overrides)
        return self.client.post(
            f"/api/v1/events/{self.event.pk}/registrations/",
            payload,
            format="json",
            **self.admin_auth(),
        )

    def test_404_when_event_has_no_venue(self):
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_404_when_venue_has_no_map_image_even_if_linked_and_visible(self):
        self.event.map_venue = self.venue
        self.event.map_visible = True
        self.event.save()
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_404_when_not_visible(self):
        self.venue.map_image_preset = "single_hall"
        self.venue.save()
        self.event.map_venue = self.venue
        self.event.save()
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_view_even_when_not_visible(self):
        self.venue.map_image_preset = "single_hall"
        self.venue.save()
        self.event.map_venue = self.venue
        self.event.save()
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/", **self.admin_auth())
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_404_when_archived_even_if_otherwise_visible(self):
        self.venue.map_image_preset = "single_hall"
        self.venue.save()
        self.event.map_venue = self.venue
        self.event.map_visible = True
        self.event.archived = True
        self.event.save()
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_still_view_map_for_an_archived_event(self):
        self.venue.map_image_preset = "single_hall"
        self.venue.save()
        self.event.map_venue = self.venue
        self.event.map_visible = True
        self.event.archived = True
        self.event.save()
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/", **self.admin_auth())
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_returns_only_confirmed_registrations_with_correct_data(self):
        self.venue.map_image_preset = "single_hall"
        self.venue.save()
        self.event.map_venue = self.venue
        self.event.map_visible = True
        self.event.save()

        self.make_confirmed_registration(self.booth1, vendor=self.vendor.pk)
        self.make_confirmed_registration(
            self.booth2,
            unlinked_vendor_name="Walk-in Dealer",
            unlinked_vendor_category="vintage",
            unlinked_vendor_contact="555-1234",
        )
        # A pending request should never show up publicly.
        pending_booth = Booth.objects.create(
            venue=self.venue, booth_number="3", position_x=20, position_y=0, width=5, height=5
        )
        self.client.post(
            f"/api/v1/events/{self.event.pk}/registrations/",
            {"booth": pending_booth.pk, "status": "requested", "vendor": self.vendor.pk},
            format="json",
            **self.admin_auth(),
        )

        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["booths"]), 2)

        by_number = {b["booth_number"]: b for b in response.data["booths"]}
        linked = by_number["1"]
        self.assertEqual(linked["vendor_pk"], self.vendor.pk)
        self.assertEqual(linked["vendor_name"], "Booth Vendor Co")
        self.assertEqual(linked["vendor_category_tags"], ["vintage"])

        unlinked = by_number["2"]
        self.assertIsNone(unlinked["vendor_pk"])
        self.assertEqual(unlinked["vendor_name"], "Walk-in Dealer")

    def test_never_exposes_price_or_unlinked_contact(self):
        self.venue.map_image_preset = "single_hall"
        self.venue.save()
        self.event.map_venue = self.venue
        self.event.map_visible = True
        self.event.save()
        self.make_confirmed_registration(
            self.booth2,
            unlinked_vendor_name="Walk-in Dealer",
            unlinked_vendor_category="vintage",
            unlinked_vendor_contact="555-1234",
        )
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/")
        response_text = str(response.data)
        self.assertNotIn("555-1234", response_text)
        for booth in response.data["booths"]:
            self.assertNotIn("price", booth)
            self.assertNotIn("unlinked_vendor_contact", booth)

    def test_includes_sections(self):
        VenueSection.objects.create(
            venue=self.venue, category="pokemon", position_x=0, position_y=0, width=25, height=25
        )
        self.venue.map_image_preset = "single_hall"
        self.venue.save()
        self.event.map_venue = self.venue
        self.event.map_visible = True
        self.event.save()
        response = self.client.get(f"/api/v1/events/{self.event.pk}/map/")
        self.assertEqual(len(response.data["sections"]), 1)
        self.assertEqual(response.data["sections"][0]["category"], "pokemon")


class BoothRegistrationAdminTests(APITestCase):
    """Covers admin-driven registration management (direct assign + confirm/decline)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="reg-admin@example.com", password="s3cret!23"
        )
        self.customer = User.objects.create_user(
            email="reg-cust@example.com", password="s3cret!23"
        )
        self.vendor = User.objects.create_user(
            email="reg-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Reg Vendor Co",
        )
        self.venue = Venue.objects.create(name="Reg Hall", city="Reg City")
        self.booth = Booth.objects.create(
            venue=self.venue,
            booth_number="1",
            position_x=0,
            position_y=0,
            width=5,
            height=5,
            price=40,
        )
        self.event = Event.objects.create(
            name="Reg Show",
            venue="Reg Hall",
            city="Reg City",
            start_date=datetime.date.today(),
            map_venue=self.venue,
        )

    def access_for(self, email, password="s3cret!23"):
        login = self.client.post("/api/v1/auth/login/", {"email": email, "password": password})
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('reg-admin@example.com')}"}

    def test_admin_can_directly_confirm_a_vendor(self):
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/registrations/",
            {"booth": self.booth.pk, "vendor": self.vendor.pk},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "confirmed")
        self.assertEqual(response.data["price"], "40.00")

    def test_requires_exactly_one_of_vendor_or_unlinked_name(self):
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/registrations/",
            {"booth": self.booth.pk},
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_only_one_active_registration_per_booth_per_event(self):
        self.client.post(
            f"/api/v1/events/{self.event.pk}/registrations/",
            {"booth": self.booth.pk, "vendor": self.vendor.pk},
            format="json",
            **self.admin_auth(),
        )
        other_vendor = User.objects.create_user(
            email="other-reg-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Other",
        )
        with self.assertRaises(Exception):
            BoothRegistration.objects.create(
                event=self.event,
                booth=self.booth,
                vendor=other_vendor,
                status=BoothRegistration.Status.REQUESTED,
                price=40,
            )

    def test_admin_can_confirm_a_pending_request(self):
        created = self.client.post(
            f"/api/v1/events/{self.event.pk}/registrations/",
            {"booth": self.booth.pk, "vendor": self.vendor.pk, "status": "requested"},
            format="json",
            **self.admin_auth(),
        )
        registration_id = created.data["id"]
        response = self.client.post(
            f"/api/v1/events/registrations/{registration_id}/confirm/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "confirmed")
        self.assertIsNotNone(response.data["decided_at"])

    def test_admin_can_decline_a_pending_request(self):
        created = self.client.post(
            f"/api/v1/events/{self.event.pk}/registrations/",
            {"booth": self.booth.pk, "vendor": self.vendor.pk, "status": "requested"},
            format="json",
            **self.admin_auth(),
        )
        registration_id = created.data["id"]
        response = self.client.post(
            f"/api/v1/events/registrations/{registration_id}/decline/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "declined")

    def test_non_admin_cannot_manage_registrations(self):
        access = self.access_for("reg-cust@example.com")
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/registrations/",
            {"booth": self.booth.pk, "vendor": self.vendor.pk},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_pending_registrations_endpoint_lists_only_requested_across_events(self):
        other_booth = Booth.objects.create(
            venue=self.venue, booth_number="2", position_x=0, position_y=0, width=5, height=5,
            price=25,
        )
        self.client.post(
            f"/api/v1/events/{self.event.pk}/registrations/",
            {"booth": self.booth.pk, "vendor": self.vendor.pk, "status": "requested"},
            format="json",
            **self.admin_auth(),
        )
        self.client.post(
            f"/api/v1/events/{self.event.pk}/registrations/",
            {"booth": other_booth.pk, "vendor": self.vendor.pk},
            format="json",
            **self.admin_auth(),
        )

        response = self.client.get("/api/v1/events/registrations/pending/", **self.admin_auth())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["status"], "requested")
        self.assertEqual(row["event"], self.event.pk)
        self.assertEqual(row["event_name"], "Reg Show")
        self.assertEqual(row["venue_id"], self.venue.pk)
        self.assertNotIn("unlinked_vendor_contact", row)

    def test_non_admin_cannot_view_pending_registrations(self):
        access = self.access_for("reg-cust@example.com")
        response = self.client.get(
            "/api/v1/events/registrations/pending/", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class VendorBoothSelectionTests(APITestCase):
    """Covers the vendor-facing browse/select/release flow."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="vsel-admin@example.com", password="s3cret!23"
        )
        self.vendor = User.objects.create_user(
            email="vsel-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Selecting Vendor",
            vendor_status=User.VendorStatus.APPROVED,
        )
        self.pending_vendor = User.objects.create_user(
            email="vsel-pending@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Pending Vendor",
            vendor_status=User.VendorStatus.PENDING_REVIEW,
        )
        self.other_vendor = User.objects.create_user(
            email="vsel-other@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Other Vendor",
            vendor_status=User.VendorStatus.APPROVED,
        )
        self.venue = Venue.objects.create(name="Sel Hall", city="Sel City")
        self.booth = Booth.objects.create(
            venue=self.venue,
            booth_number="1",
            position_x=0,
            position_y=0,
            width=5,
            height=5,
            price=30,
        )
        self.event = Event.objects.create(
            name="Sel Show",
            venue="Sel Hall",
            city="Sel City",
            start_date=datetime.date.today(),
            map_venue=self.venue,
            map_visible_to_vendors=True,
        )

    def access_for(self, email, password="s3cret!23"):
        login = self.client.post("/api/v1/auth/login/", {"email": email, "password": password})
        return login.data["access"]

    def vendor_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('vsel-vendor@example.com')}"}

    def other_vendor_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('vsel-other@example.com')}"}

    def test_404_when_vendor_visibility_off(self):
        self.event.map_visible_to_vendors = False
        self.event.save()
        response = self.client.get(
            f"/api/v1/events/{self.event.pk}/vendor-booths/", **self.vendor_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_404_when_event_archived_even_if_vendor_visibility_on(self):
        self.event.archived = True
        self.event.save()
        response = self.client.get(
            f"/api/v1/events/{self.event.pk}/vendor-booths/", **self.vendor_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_select_a_booth_for_an_archived_event(self):
        self.event.archived = True
        self.event.save()
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/{self.booth.pk}/select/", **self.vendor_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_pending_vendor_cannot_browse_booths(self):
        access = self.access_for("vsel-pending@example.com")
        response = self.client.get(
            f"/api/v1/events/{self.event.pk}/vendor-booths/",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_vendor_sees_booth_as_available(self):
        response = self.client.get(
            f"/api/v1/events/{self.event.pk}/vendor-booths/", **self.vendor_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["booths"][0]["availability"], "available")
        self.assertEqual(response.data["booths"][0]["price"], "30.00")

    def test_vendor_can_select_available_booth(self):
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/{self.booth.pk}/select/", **self.vendor_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "requested")
        self.assertEqual(BoothRegistration.objects.get().vendor_id, self.vendor.pk)

    def test_vendor_cannot_select_a_taken_booth(self):
        self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/{self.booth.pk}/select/", **self.vendor_auth()
        )
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/{self.booth.pk}/select/",
            **self.other_vendor_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_vendor_cannot_double_request_same_booth(self):
        self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/{self.booth.pk}/select/", **self.vendor_auth()
        )
        response = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/{self.booth.pk}/select/", **self.vendor_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_vendor_can_release_their_own_registration(self):
        created = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/{self.booth.pk}/select/", **self.vendor_auth()
        )
        registration_id = created.data["id"]
        response = self.client.post(
            f"/api/v1/events/registrations/{registration_id}/release/", **self.vendor_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "released")

        # Now available again for someone else.
        reselect = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/{self.booth.pk}/select/",
            **self.other_vendor_auth(),
        )
        self.assertEqual(reselect.status_code, status.HTTP_201_CREATED)

    def test_vendor_cannot_release_someone_elses_registration(self):
        created = self.client.post(
            f"/api/v1/events/{self.event.pk}/booths/{self.booth.pk}/select/", **self.vendor_auth()
        )
        registration_id = created.data["id"]
        response = self.client.post(
            f"/api/v1/events/registrations/{registration_id}/release/", **self.other_vendor_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class LoyaltyHoldTests(APITestCase):
    """Covers automatic returning-vendor priority holds across events at the same venue."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="loy-admin@example.com", password="s3cret!23"
        )
        self.vendor = User.objects.create_user(
            email="loy-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Returning Vendor",
            vendor_status=User.VendorStatus.APPROVED,
        )
        self.other_vendor = User.objects.create_user(
            email="loy-other@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="New Vendor",
            vendor_status=User.VendorStatus.APPROVED,
        )
        self.venue = Venue.objects.create(name="Loyalty Hall", city="Loyalty City")
        self.booth = Booth.objects.create(
            venue=self.venue,
            booth_number="1",
            position_x=0,
            position_y=0,
            width=5,
            height=5,
            price=20,
        )
        self.prior_event = Event.objects.create(
            name="Prior Show",
            venue="Loyalty Hall",
            city="Loyalty City",
            start_date=datetime.date.today() - datetime.timedelta(days=100),
            map_venue=self.venue,
        )
        BoothRegistration.objects.create(
            event=self.prior_event,
            booth=self.booth,
            vendor=self.vendor,
            status=BoothRegistration.Status.CONFIRMED,
            price=20,
        )

    def access_for(self, email, password="s3cret!23"):
        login = self.client.post("/api/v1/auth/login/", {"email": email, "password": password})
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('loy-admin@example.com')}"}

    def vendor_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('loy-vendor@example.com')}"}

    def other_vendor_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('loy-other@example.com')}"}

    def make_new_event(self, deadline=None):
        # Direct ORM creation, same as any other test fixture — but this
        # bypasses EventDetailView.perform_update (the real trigger point
        # for create_loyalty_holds when an admin PATCHes the venue/deadline
        # via the API), so call it explicitly to set up holds correctly.
        event = Event.objects.create(
            name="New Show",
            venue="Loyalty Hall",
            city="Loyalty City",
            start_date=datetime.date.today() + datetime.timedelta(days=30),
            map_venue=self.venue,
            map_visible_to_vendors=True,
            loyalty_priority_deadline=deadline,
        )
        create_loyalty_holds(event)
        return event

    def test_no_hold_without_deadline_set(self):
        new_event = self.make_new_event(deadline=None)
        self.assertEqual(
            BoothRegistration.objects.filter(event=new_event).count(), 0
        )
        # Setting the deadline afterward (a normal PATCH) should trigger it.
        self.client.patch(
            f"/api/v1/events/{new_event.pk}/",
            {
                "loyalty_priority_deadline": (
                    timezone.now() + datetime.timedelta(days=7)
                ).isoformat()
            },
            format="json",
            **self.admin_auth(),
        )
        self.assertEqual(
            BoothRegistration.objects.filter(
                event=new_event, status=BoothRegistration.Status.LOYALTY_HOLD
            ).count(),
            1,
        )

    def test_hold_created_for_returning_vendor_when_venue_set_via_patch(self):
        new_event = Event.objects.create(
            name="New Show 2",
            venue="Loyalty Hall",
            city="Loyalty City",
            start_date=datetime.date.today() + datetime.timedelta(days=30),
        )
        self.client.patch(
            f"/api/v1/events/{new_event.pk}/",
            {
                "map_venue": self.venue.pk,
                "loyalty_priority_deadline": (
                    timezone.now() + datetime.timedelta(days=7)
                ).isoformat(),
            },
            format="json",
            **self.admin_auth(),
        )
        hold = BoothRegistration.objects.get(event=new_event)
        self.assertEqual(hold.status, BoothRegistration.Status.LOYALTY_HOLD)
        self.assertEqual(hold.vendor_id, self.vendor.pk)
        self.assertEqual(hold.booth_id, self.booth.pk)

    def test_other_vendor_cannot_select_held_booth_before_deadline(self):
        new_event = self.make_new_event(deadline=timezone.now() + datetime.timedelta(days=7))
        response = self.client.post(
            f"/api/v1/events/{new_event.pk}/booths/{self.booth.pk}/select/",
            **self.other_vendor_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_original_vendor_sees_their_hold_and_can_claim_it(self):
        new_event = self.make_new_event(deadline=timezone.now() + datetime.timedelta(days=7))

        listing = self.client.get(
            f"/api/v1/events/{new_event.pk}/vendor-booths/", **self.vendor_auth()
        )
        self.assertEqual(listing.data["booths"][0]["availability"], "loyalty_hold_mine")

        claim = self.client.post(
            f"/api/v1/events/{new_event.pk}/booths/{self.booth.pk}/select/", **self.vendor_auth()
        )
        self.assertEqual(claim.status_code, status.HTTP_201_CREATED)
        self.assertEqual(claim.data["status"], "requested")
        self.assertEqual(claim.data["vendor"], self.vendor.pk)

    def test_expired_hold_becomes_available_to_anyone(self):
        new_event = self.make_new_event(deadline=timezone.now() - datetime.timedelta(days=1))

        listing = self.client.get(
            f"/api/v1/events/{new_event.pk}/vendor-booths/", **self.other_vendor_auth()
        )
        self.assertEqual(listing.data["booths"][0]["availability"], "available")

        response = self.client.post(
            f"/api/v1/events/{new_event.pk}/booths/{self.booth.pk}/select/",
            **self.other_vendor_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["vendor"], self.other_vendor.pk)

    def test_no_hold_without_a_prior_event_at_the_venue(self):
        fresh_venue = Venue.objects.create(name="Fresh Hall", city="Fresh City")
        Booth.objects.create(
            venue=fresh_venue, booth_number="1", position_x=0, position_y=0, width=5, height=5
        )
        new_event = Event.objects.create(
            name="First Show Ever",
            venue="Fresh Hall",
            city="Fresh City",
            start_date=datetime.date.today() + datetime.timedelta(days=30),
            map_venue=fresh_venue,
            loyalty_priority_deadline=timezone.now() + datetime.timedelta(days=7),
        )
        create_loyalty_holds(new_event)
        self.assertEqual(BoothRegistration.objects.filter(event=new_event).count(), 0)
