from rest_framework import serializers

from apps.users.models import User

from .models import Event


class EventSerializer(serializers.ModelSerializer):
    status = serializers.ReadOnlyField()
    vendor_count = serializers.ReadOnlyField()
    vendors = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.VENDOR), many=True, required=False
    )
    # {pk, label} pairs rather than parallel `vendors`/`vendor_names` arrays,
    # so the frontend never has to assume the two arrays come back in the
    # same order (obj.vendors.all() has no guaranteed ordering across two
    # separate evaluations).
    vendors_detail = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = (
            "id",
            "name",
            "venue",
            "city",
            "description",
            "start_date",
            "end_date",
            "vendors",
            "vendors_detail",
            "vendor_count",
            "estimated_cards",
            "estimated_attendees",
            "status",
        )

    def get_vendors_detail(self, obj):
        return [
            {"pk": vendor.pk, "label": vendor.business_name or vendor.email}
            for vendor in obj.vendors.all()
        ]
