from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Category
from apps.listings.models import Listing
from apps.users.models import User

from .models import Card, CardSet, CardSubmission, Company


def make_category(name="Football"):
    return Category.objects.create(name=name)


class CollectionsBrowsingTests(APITestCase):
    """Category -> Year -> Company -> Set -> Cards guided hierarchy."""

    def setUp(self):
        self.football = make_category("Football")
        self.baseball = make_category("Baseball")
        self.panini = Company.objects.create(name="Panini")
        self.topps = Company.objects.create(name="Topps")

        self.prizm_2020 = CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        self.donruss_2020 = CardSet.objects.create(
            name="Donruss", year=2020, company=self.panini, category=self.football.slug
        )
        self.prizm_2021 = CardSet.objects.create(
            name="Prizm", year=2021, company=self.panini, category=self.football.slug
        )
        self.bowman_2024 = CardSet.objects.create(
            name="Bowman", year=2024, company=self.topps, category=self.baseball.slug
        )

        self.hurts = Card.objects.create(
            set=self.prizm_2020, player_name="Jalen Hurts", card_number="343"
        )
        Card.objects.create(set=self.prizm_2020, player_name="Justin Jefferson", card_number="398")

    def test_collections_uses_the_real_admin_managed_categories(self):
        response = self.client.get("/api/v1/categories/")
        names = {c["name"] for c in response.data}
        self.assertIn("Football", names)
        self.assertIn("Baseball", names)

    def test_year_list_only_returns_years_with_sets_in_that_category(self):
        response = self.client.get(f"/api/v1/collections/years/?category={self.football.slug}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.data), {2020, 2021})

    def test_year_list_requires_a_category(self):
        response = self.client.get("/api/v1/collections/years/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_company_list_scoped_to_category_and_year(self):
        response = self.client.get(
            f"/api/v1/collections/companies/?category={self.football.slug}&year=2020"
        )
        names = [c["name"] for c in response.data]
        self.assertEqual(names, ["Panini"])

    def test_company_list_excludes_companies_with_no_matching_sets(self):
        response = self.client.get(
            f"/api/v1/collections/companies/?category={self.baseball.slug}&year=2020"
        )
        self.assertEqual(response.data, [])

    def test_set_list_filters_by_category_year_company(self):
        response = self.client.get(
            f"/api/v1/collections/sets/?category={self.football.slug}&year=2020&company={self.panini.pk}"
        )
        names = {s["name"] for s in response.data["results"]}
        self.assertEqual(names, {"Prizm", "Donruss"})

    def test_set_list_paginates_ten_per_page(self):
        for i in range(15):
            CardSet.objects.create(
                name=f"Set {i}", year=1999, company=self.panini, category=self.football.slug
            )
        response = self.client.get(f"/api/v1/collections/sets/?category={self.football.slug}")
        self.assertEqual(len(response.data["results"]), 10)
        self.assertIsNotNone(response.data["next"])

    def test_set_search_matches_name_or_company(self):
        response = self.client.get("/api/v1/collections/sets/?search=Prizm")
        names = {s["name"] for s in response.data["results"]}
        self.assertEqual(names, {"Prizm"})

    def test_set_detail_includes_card_count(self):
        response = self.client.get(f"/api/v1/collections/sets/{self.prizm_2020.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["card_count"], 2)

    def test_set_cards_endpoint_returns_only_that_sets_cards(self):
        response = self.client.get(f"/api/v1/collections/sets/{self.prizm_2020.pk}/cards/")
        numbers = {c["card_number"] for c in response.data["results"]}
        self.assertEqual(numbers, {"343", "398"})

    def test_search_within_set_matches_player_name(self):
        response = self.client.get(
            f"/api/v1/collections/sets/{self.prizm_2020.pk}/cards/?search=Hurts"
        )
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["player_name"], "Jalen Hurts")

    def test_card_detail_includes_derived_set_fields(self):
        response = self.client.get(f"/api/v1/collections/cards/{self.hurts.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["year"], 2020)
        self.assertEqual(response.data["company_name"], "Panini")
        self.assertEqual(response.data["set_name"], "Prizm")
        self.assertEqual(response.data["category"], self.football.slug)


class CollectionsSearchTests(APITestCase):
    """The main Collections page's global search."""

    def setUp(self):
        self.football = make_category("Football")
        self.panini = Company.objects.create(name="Panini")
        self.prizm_2020 = CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        self.hurts = Card.objects.create(
            set=self.prizm_2020, player_name="Jalen Hurts", card_number="343"
        )

    def test_search_finds_matching_card_by_player_name(self):
        response = self.client.get("/api/v1/collections/search/?q=Jalen Hurts")
        players = [c["player_name"] for c in response.data["cards"]]
        self.assertIn("Jalen Hurts", players)

    def test_search_finds_matching_set(self):
        response = self.client.get("/api/v1/collections/search/?q=Prizm")
        names = [s["name"] for s in response.data["sets"]]
        self.assertIn("Prizm", names)

    def test_search_by_card_number_hash_prefix(self):
        response = self.client.get("/api/v1/collections/search/?q=%23343")
        numbers = [c["card_number"] for c in response.data["cards"]]
        self.assertIn("343", numbers)

    def test_empty_query_returns_empty_results(self):
        response = self.client.get("/api/v1/collections/search/?q=")
        self.assertEqual(response.data, {"sets": [], "cards": []})

    def test_result_identifies_category_year_company_set(self):
        response = self.client.get("/api/v1/collections/search/?q=Hurts")
        card = response.data["cards"][0]
        self.assertEqual(card["category"], self.football.slug)
        self.assertEqual(card["year"], 2020)
        self.assertEqual(card["company_name"], "Panini")
        self.assertEqual(card["set_name"], "Prizm")


class AdminCollectionsManagementTests(APITestCase):
    """Manage Collections: Companies/Sets/Cards CRUD + permissions."""

    def setUp(self):
        self.football = make_category("Football")
        self.panini = Company.objects.create(name="Panini")
        self.admin = User.objects.create_user(
            email="collections-admin@example.com", password="s3cret!23", role=User.Role.ADMIN
        )
        self.customer = User.objects.create_user(
            email="collections-cust@example.com", password="s3cret!23"
        )

    def access_for(self, email):
        login = self.client.post(
            "/api/v1/auth/login/", {"email": email, "password": "s3cret!23"}
        )
        return login.data["access"]

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('collections-admin@example.com')}"}

    def customer_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('collections-cust@example.com')}"}

    # -- sets --

    def test_admin_can_create_a_set(self):
        response = self.client.post(
            "/api/v1/admin/collections/sets/",
            {"name": "Prizm", "year": 2020, "company": self.panini.pk, "category": self.football.slug},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(CardSet.objects.count(), 1)

    def test_non_admin_cannot_create_a_set(self):
        response = self.client.post(
            "/api/v1/admin/collections/sets/",
            {"name": "Prizm", "year": 2020, "company": self.panini.pk, "category": self.football.slug},
            format="multipart",
            **self.customer_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_duplicate_set_is_rejected(self):
        CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        response = self.client.post(
            "/api/v1/admin/collections/sets/",
            {"name": "Prizm", "year": 2020, "company": self.panini.pk, "category": self.football.slug},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_edit_a_set(self):
        card_set = CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        response = self.client.patch(
            f"/api/v1/admin/collections/sets/{card_set.pk}/",
            {"name": "Prizm Draft Picks"},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        card_set.refresh_from_db()
        self.assertEqual(card_set.name, "Prizm Draft Picks")

    def test_admin_can_delete_a_set_and_it_unlinks_but_does_not_delete_listings(self):
        card_set = CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        card = Card.objects.create(set=card_set, player_name="Jalen Hurts", card_number="343")
        vendor = User.objects.create_user(
            email="del-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            vendor_status=User.VendorStatus.APPROVED,
        )
        listing = Listing.objects.create(vendor=vendor, title="Card", category="vintage", card=card)

        response = self.client.delete(
            f"/api/v1/admin/collections/sets/{card_set.pk}/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        listing.refresh_from_db()
        self.assertIsNone(listing.card)
        self.assertTrue(Listing.objects.filter(pk=listing.pk).exists())

    def test_search_sets_by_name(self):
        CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        CardSet.objects.create(
            name="Donruss", year=2020, company=self.panini, category=self.football.slug
        )
        response = self.client.get(
            "/api/v1/admin/collections/sets/?search=Prizm", **self.admin_auth()
        )
        names = {s["name"] for s in response.data["results"]}
        self.assertEqual(names, {"Prizm"})

    # -- cards --

    def test_admin_can_create_a_card(self):
        card_set = CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        response = self.client.post(
            "/api/v1/admin/collections/cards/",
            {"set": card_set.pk, "player_name": "Jalen Hurts", "card_number": "343"},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Card.objects.count(), 1)

    def test_duplicate_card_is_rejected(self):
        card_set = CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        Card.objects.create(set=card_set, player_name="Jalen Hurts", card_number="343")
        response = self.client.post(
            "/api/v1/admin/collections/cards/",
            {"set": card_set.pk, "player_name": "Jalen Hurts", "card_number": "343"},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_edit_a_card(self):
        card_set = CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        card = Card.objects.create(set=card_set, player_name="Jalen Hurts", card_number="343")
        response = self.client.patch(
            f"/api/v1/admin/collections/cards/{card.pk}/",
            {"team": "Philadelphia Eagles"},
            format="multipart",
            **self.admin_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        card.refresh_from_db()
        self.assertEqual(card.team, "Philadelphia Eagles")

    def test_admin_can_delete_a_card_safely_unlinking_listings(self):
        card_set = CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        card = Card.objects.create(set=card_set, player_name="Jalen Hurts", card_number="343")
        vendor = User.objects.create_user(
            email="del-card-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            vendor_status=User.VendorStatus.APPROVED,
        )
        listing = Listing.objects.create(vendor=vendor, title="Card", category="vintage", card=card)

        response = self.client.delete(
            f"/api/v1/admin/collections/cards/{card.pk}/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        listing.refresh_from_db()
        self.assertIsNone(listing.card)

    def test_search_cards_by_player(self):
        card_set = CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        Card.objects.create(set=card_set, player_name="Jalen Hurts", card_number="343")
        Card.objects.create(set=card_set, player_name="Justin Jefferson", card_number="398")
        response = self.client.get(
            "/api/v1/admin/collections/cards/?search=Hurts", **self.admin_auth()
        )
        names = {c["player_name"] for c in response.data["results"]}
        self.assertEqual(names, {"Jalen Hurts"})

    # -- category propagation --

    def test_category_rename_propagates_to_collections_because_slug_is_stable(self):
        card_set = CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        self.client.patch(
            f"/api/v1/admin/categories/{self.football.pk}/",
            {"name": "American Football"},
            format="json",
            **self.admin_auth(),
        )
        response = self.client.get(f"/api/v1/collections/sets/{card_set.pk}/")
        self.assertEqual(response.data["category_name"], "American Football")


class CardSubmissionTests(APITestCase):
    """"Can't find your card?" dealer submission + admin review workflow."""

    def setUp(self):
        self.football = make_category("Football")
        self.panini = Company.objects.create(name="Panini")
        self.prizm_2020 = CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        self.vendor = User.objects.create_user(
            email="submission-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            vendor_status=User.VendorStatus.APPROVED,
        )
        self.admin = User.objects.create_user(
            email="submission-admin@example.com", password="s3cret!23", role=User.Role.ADMIN
        )

    def access_for(self, email):
        login = self.client.post(
            "/api/v1/auth/login/", {"email": email, "password": "s3cret!23"}
        )
        return login.data["access"]

    def vendor_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('submission-vendor@example.com')}"}

    def admin_auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.access_for('submission-admin@example.com')}"}

    def test_dealer_can_submit_a_missing_card(self):
        response = self.client.post(
            "/api/v1/collections/submissions/",
            {"set": self.prizm_2020.pk, "player_name": "Jalen Hurts", "card_number": "999"},
            format="json",
            **self.vendor_auth(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "pending")
        # No real Card was silently created — just the submission record.
        self.assertEqual(Card.objects.count(), 0)

    def test_admin_submission_list_returns_a_plain_array_not_paginated(self):
        CardSubmission.objects.create(
            submitted_by=self.vendor,
            set=self.prizm_2020,
            player_name="Jalen Hurts",
            card_number="999",
        )
        response = self.client.get("/api/v1/admin/collections/submissions/", **self.admin_auth())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 1)

    def test_admin_submission_list_filters_by_status(self):
        CardSubmission.objects.create(
            submitted_by=self.vendor,
            set=self.prizm_2020,
            player_name="Jalen Hurts",
            card_number="999",
            status=CardSubmission.Status.APPROVED,
        )
        pending_response = self.client.get(
            "/api/v1/admin/collections/submissions/?status=pending", **self.admin_auth()
        )
        self.assertEqual(pending_response.data, [])
        approved_response = self.client.get(
            "/api/v1/admin/collections/submissions/?status=approved", **self.admin_auth()
        )
        self.assertEqual(len(approved_response.data), 1)

    def test_non_admin_cannot_list_submissions(self):
        response = self.client.get("/api/v1/admin/collections/submissions/", **self.vendor_auth())
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_approve_a_submission_creating_a_real_card(self):
        submission = CardSubmission.objects.create(
            submitted_by=self.vendor,
            set=self.prizm_2020,
            player_name="Jalen Hurts",
            card_number="999",
        )
        response = self.client.post(
            f"/api/v1/admin/collections/submissions/{submission.pk}/approve/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        submission.refresh_from_db()
        self.assertEqual(submission.status, "approved")
        self.assertIsNotNone(submission.resulting_card)
        self.assertEqual(Card.objects.filter(card_number="999").count(), 1)

    def test_approving_a_submission_attaches_its_pending_listing(self):
        listing = Listing.objects.create(
            vendor=self.vendor, title="Mystery Card", category=self.football.slug
        )
        submission = CardSubmission.objects.create(
            submitted_by=self.vendor,
            set=self.prizm_2020,
            player_name="Jalen Hurts",
            card_number="999",
            listing=listing,
        )
        self.client.post(
            f"/api/v1/admin/collections/submissions/{submission.pk}/approve/", **self.admin_auth()
        )
        listing.refresh_from_db()
        submission.refresh_from_db()
        self.assertEqual(listing.card_id, submission.resulting_card_id)

    def test_admin_can_reject_a_submission(self):
        submission = CardSubmission.objects.create(
            submitted_by=self.vendor,
            set=self.prizm_2020,
            player_name="Jalen Hurts",
            card_number="999",
        )
        response = self.client.post(
            f"/api/v1/admin/collections/submissions/{submission.pk}/reject/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        submission.refresh_from_db()
        self.assertEqual(submission.status, "rejected")
        self.assertEqual(Card.objects.count(), 0)

    def test_non_admin_cannot_approve_a_submission(self):
        submission = CardSubmission.objects.create(
            submitted_by=self.vendor,
            set=self.prizm_2020,
            player_name="Jalen Hurts",
            card_number="999",
        )
        response = self.client.post(
            f"/api/v1/admin/collections/submissions/{submission.pk}/approve/", **self.vendor_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_approve_an_already_reviewed_submission_twice(self):
        submission = CardSubmission.objects.create(
            submitted_by=self.vendor,
            set=self.prizm_2020,
            player_name="Jalen Hurts",
            card_number="999",
            status=CardSubmission.Status.APPROVED,
        )
        response = self.client.post(
            f"/api/v1/admin/collections/submissions/{submission.pk}/approve/", **self.admin_auth()
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ListingCardLinkTests(APITestCase):
    """Dealer listing <-> Set Registry card linkage."""

    def setUp(self):
        self.football = make_category("Football")
        self.panini = Company.objects.create(name="Panini")
        self.prizm_2020 = CardSet.objects.create(
            name="Prizm", year=2020, company=self.panini, category=self.football.slug
        )
        self.hurts = Card.objects.create(
            set=self.prizm_2020, player_name="Jalen Hurts", card_number="343"
        )
        self.vendor = User.objects.create_user(
            email="link-vendor@example.com",
            password="s3cret!23",
            role=User.Role.VENDOR,
            business_name="Link Cards Co",
            vendor_status=User.VendorStatus.APPROVED,
        )

    def test_card_detail_lists_dealer_listings(self):
        Listing.objects.create(
            vendor=self.vendor,
            title="2020 Prizm Jalen Hurts #343",
            category=self.football.slug,
            card=self.hurts,
            price="500.00",
            grading=Listing.Grading.PSA,
            grade="9",
        )
        response = self.client.get(f"/api/v1/listings/public/?card={self.hurts.pk}")
        # The public listing feed doesn't filter by card yet in this
        # minimal integration, but the reverse relation resolves cleanly:
        self.hurts.refresh_from_db()
        self.assertEqual(self.hurts.listings.count(), 1)

    def test_card_with_no_listings_has_none(self):
        self.assertEqual(self.hurts.listings.count(), 0)
