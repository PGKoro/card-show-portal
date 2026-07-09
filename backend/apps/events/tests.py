import datetime

from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User

from .models import Event


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
