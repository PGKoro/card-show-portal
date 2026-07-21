from rest_framework import serializers

from apps.core.models import Category

from .models import Listing


class ListingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Listing
        fields = (
            "id",
            "title",
            "description",
            "category",
            "price",
            "grading",
            "grade",
            "status",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def validate_category(self, value):
        if not Category.objects.filter(slug=value).exists():
            raise serializers.ValidationError("Not a valid category.")
        return value

    def validate_grade(self, value):
        if value is not None and not (1 <= value <= 10):
            raise serializers.ValidationError("Grade must be between 1 and 10.")
        return value

    def validate(self, attrs):
        grading = attrs.get("grading", getattr(self.instance, "grading", Listing.Grading.UNGRADED))
        grade = attrs.get("grade", getattr(self.instance, "grade", None))
        if grading == Listing.Grading.UNGRADED:
            if grade is not None:
                raise serializers.ValidationError(
                    {"grade": "Ungraded items can't have a grade."}
                )
        elif grade is None:
            raise serializers.ValidationError(
                {"grade": "A grade is required once a grading company is set."}
            )
        return attrs


class PublicListingSerializer(serializers.ModelSerializer):
    """
    Adds the vendor identity fields ListingSerializer deliberately omits
    (that one's used for a vendor's own dashboard, where the vendor is
    already implied) — needed here since this backs a cross-vendor feed
    where each card must link back to whichever vendor posted it.
    """

    vendor = serializers.IntegerField(source="vendor_id", read_only=True)
    vendor_name = serializers.CharField(source="vendor.business_name", read_only=True)

    class Meta:
        model = Listing
        fields = (
            "id",
            "title",
            "description",
            "category",
            "price",
            "grading",
            "grade",
            "status",
            "created_at",
            "vendor",
            "vendor_name",
        )
        read_only_fields = fields
