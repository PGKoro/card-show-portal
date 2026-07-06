from dj_rest_auth.registration.serializers import (
    RegisterSerializer as BaseRegisterSerializer,
)
from rest_framework import serializers

from .models import User


class RegisterSerializer(BaseRegisterSerializer):
    """
    The base serializer always declares a `username` field. Our User model
    has no username (email is the USERNAME_FIELD), so it's dropped here —
    assigning None removes an inherited DRF field.
    """

    username = None


class UserDetailsSerializer(serializers.ModelSerializer):
    """Returned by dj-rest-auth's /api/v1/auth/user/ endpoint.

    The frontend uses `role` to decide which dashboard to route a user to
    after login.
    """

    class Meta:
        model = User
        fields = ("pk", "email", "first_name", "last_name", "role")
        read_only_fields = ("email", "role")
