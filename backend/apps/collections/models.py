from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify

from apps.core.models import validate_image_upload


class Company(models.Model):
    """
    A card manufacturer/brand (Panini, Topps, Leaf, ...) — admin-managed,
    shared across every Set regardless of category. Deliberately its own
    small vocabulary rather than reusing apps.core.Category: companies
    aren't a per-listing classification like category is, they're a
    property of a Set, and the two vocabularies don't overlap (a company
    sells across many categories).
    """

    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=110, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)[:110] or "company"
            slug = base_slug
            suffix = 2
            while Company.objects.filter(slug=slug).exists():
                suffix_str = f"-{suffix}"
                slug = f"{base_slug[:110 - len(suffix_str)]}{suffix_str}"
                suffix += 1
            self.slug = slug
        super().save(*args, **kwargs)


class CardSet(models.Model):
    """
    A specific product release — e.g. "2020 Panini Prizm Football". This is
    the Set Registry's core organizing object: Collections browsing narrows
    Category -> Year -> Company -> Set, and every Card belongs to exactly
    one CardSet.

    `category` deliberately stores the admin-managed Category's slug as a
    plain string (validated against apps.core.models.Category in the
    serializer) rather than a ForeignKey — same convention already used by
    Listing.category and VenueSection.category, so deleting a Category
    later doesn't cascade-delete every Set that referenced it.

    Named CardSet (not "Set") to avoid shadowing the Python builtin.
    """

    name = models.CharField(max_length=200)
    year = models.PositiveIntegerField()
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="sets")
    category = models.CharField(max_length=50)
    image = models.ImageField(
        upload_to="collections/sets/", null=True, blank=True, validators=[validate_image_upload]
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-year", "company__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["category", "year", "company", "name"],
                name="unique_set_per_category_year_company_name",
            )
        ]
        indexes = [
            models.Index(fields=["category", "year"]),
            models.Index(fields=["category", "year", "company"]),
        ]

    def __str__(self):
        return f"{self.year} {self.company.name} {self.name}"


class Card(models.Model):
    """
    A single card *design* in the Set Registry — the identity every dealer
    listing of a physical copy points back to (see apps.listings.Listing.card).
    Deliberately NOT the same object as a dealer listing: many dealers can
    each list their own physical copy of this same Card.

    Year/company/category are intentionally not duplicated here — they're
    always reached via `card.set.year` / `card.set.company` /
    `card.set.category` (see CardSet), so renaming/recategorizing a Set
    doesn't require touching every Card inside it.
    """

    set = models.ForeignKey(CardSet, on_delete=models.CASCADE, related_name="cards")
    # "Player(s)/Character(s)". Free text (rather than a name registry) so a
    # multi-player card can just list them together; "N/A" is a normal
    # value for non-sports/character-less cards.
    player_name = models.CharField(max_length=200, default="N/A")
    # "N/A" is a normal value here too — non-sports cards (TCG) have no team.
    team = models.CharField(max_length=200, blank=True, default="N/A")
    card_number = models.CharField(max_length=30)
    # Parallel/variation name, e.g. "Blue Ice Prizm" — blank for a base card.
    variation = models.CharField(max_length=200, blank=True, default="")
    # The parallel's fixed print run when it's a known/numbered parallel
    # (e.g. Blue Ice is always /99) — NOT which specific copy a dealer has;
    # that's the dealer's own serial_copy_number on the Listing. Left blank
    # for unnumbered cards/parallels.
    print_run = models.PositiveIntegerField(null=True, blank=True)
    image_front = models.ImageField(
        upload_to="collections/cards/", null=True, blank=True, validators=[validate_image_upload]
    )
    image_back = models.ImageField(
        upload_to="collections/cards/", null=True, blank=True, validators=[validate_image_upload]
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["card_number", "player_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["set", "card_number", "variation", "player_name"],
                name="unique_card_per_set_number_variation_player",
            )
        ]
        indexes = [
            models.Index(fields=["set", "card_number"]),
            models.Index(fields=["player_name"]),
        ]

    def __str__(self):
        variation_suffix = f" {self.variation}" if self.variation else ""
        return f"{self.set} #{self.card_number}{variation_suffix} {self.player_name}"

    def clean(self):
        if not self.player_name.strip():
            raise ValidationError({"player_name": "Use \"N/A\" instead of leaving this blank."})


class CardSubmission(models.Model):
    """
    "Can't find your card?" — a dealer's request to add a new Card to the
    registry when nothing matching exists yet. Deliberately NOT allowed to
    silently create a real Card row (see apps.collections views/serializers):
    an admin has to review and approve it first, same
    submit-then-moderate shape as vendor approval
    (apps.users.models.User.VendorStatus). Approving creates the real Card
    and links it to `resulting_card`; the dealer's pending Listing
    (submission.listing) then gets attached to it.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    submitted_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, related_name="card_submissions"
    )
    # The dealer's in-progress listing that triggered this submission, if
    # any — once approved, the admin links this listing to the newly
    # created Card (see AdminCardSubmissionApproveView) so the dealer
    # doesn't have to come back and re-attach it manually.
    listing = models.ForeignKey(
        "listings.Listing",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="card_submissions",
    )
    # The set the dealer says this card belongs to — required so an admin
    # doesn't have to guess where to file it once approved. If the set
    # itself doesn't exist yet either, the dealer/admin creates that first
    # (Set creation is comparatively low-friction, unlike Card creation).
    set = models.ForeignKey(CardSet, on_delete=models.CASCADE, related_name="card_submissions")
    player_name = models.CharField(max_length=200, default="N/A")
    team = models.CharField(max_length=200, blank=True, default="N/A")
    card_number = models.CharField(max_length=30)
    variation = models.CharField(max_length=200, blank=True, default="")
    print_run = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    resulting_card = models.ForeignKey(
        Card, on_delete=models.SET_NULL, null=True, blank=True, related_name="submissions"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.set} #{self.card_number} {self.player_name} ({self.status})"
