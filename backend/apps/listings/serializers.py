from rest_framework import serializers

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
            "condition",
            "status",
            "created_at",
        )
        read_only_fields = ("id", "created_at")
