from rest_framework import serializers

from .models import Category


class CategorySerializer(serializers.ModelSerializer):
    """
    `name` is the only writable field once created — `slug` and `order`
    are server-managed (slug is frozen at creation, see Category.save();
    order is only ever changed via the dedicated move endpoint) so this
    serializer never accepts either from the client.
    """

    class Meta:
        model = Category
        fields = ("id", "name", "slug", "order")
        read_only_fields = ("id", "slug", "order")
