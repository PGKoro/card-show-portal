from rest_framework.permissions import BasePermission

from apps.users.models import User


class HasRole(BasePermission):
    """
    Base class for role-gated endpoints. Subclass and set `required_role`,
    or use one of the concrete permissions below.

    Role checks are meant to be combined with Django's Groups/Permissions
    for finer-grained access (e.g. `IsVendor` gates "this is a vendor
    endpoint", while a model permission like `shows.add_booth` gates
    "this vendor can create booths").
    """

    required_role = None
    message = "You do not have the required role to access this resource."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_superuser or user.role == self.required_role)
        )


class IsVendor(HasRole):
    required_role = User.Role.VENDOR


class IsCustomer(HasRole):
    required_role = User.Role.CUSTOMER


class IsAdminRole(HasRole):
    required_role = User.Role.ADMIN
