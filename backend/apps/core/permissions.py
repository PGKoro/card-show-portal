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
            and not user.archived
            and (user.is_superuser or user.role == self.required_role)
        )


class IsVendor(HasRole):
    required_role = User.Role.VENDOR


class IsCustomer(HasRole):
    required_role = User.Role.CUSTOMER


class IsAdminRole(HasRole):
    """
    Gates every existing admin tool. Deliberately admits both ``admin`` and
    ``owner`` — owner is "admin for admins" and keeps every admin
    capability on top of its own (editing other admin/owner accounts).
    Endpoints that must additionally block a plain admin from touching
    another admin/owner account layer `IsOwnerOrNotTargetingStaff` (or an
    equivalent explicit check) on top of this.
    """

    message = "You do not have the required role to access this resource."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and not user.archived
            and (user.is_superuser or user.role in (User.Role.ADMIN, User.Role.OWNER))
        )


class IsOwnerRole(HasRole):
    required_role = User.Role.OWNER


def is_staff_role(user) -> bool:
    """True for admin/owner/superuser — the roles considered protected
    staff for the purposes of `can_manage_staff_target` below."""
    return bool(user and (user.is_superuser or user.role in (User.Role.ADMIN, User.Role.OWNER)))


def can_manage_staff_target(actor, target) -> bool:
    """
    True if `actor` is allowed to edit/archive/flag/delete/impersonate/
    change the role of `target`. A plain admin can manage any non-staff
    account (customer/vendor) but not another admin or owner account —
    only an owner (or superuser) can touch staff accounts. Always true
    when the target isn't staff, or when acting on your own account (that's
    governed by the separate "can't delete/archive yourself" checks each
    view already has, not this staff-vs-staff rule).
    """
    if not is_staff_role(target) or (actor and target and actor.pk == target.pk):
        return True
    return bool(actor and (actor.is_superuser or actor.role == User.Role.OWNER))


def is_last_active_owner(user) -> bool:
    """
    True if `user` is currently the only non-archived owner account —
    used to block demoting/archiving/deleting the last owner, which would
    otherwise permanently lock everyone out of owner-only tools with no
    way back in short of a database edit.
    """
    if not user or user.role != User.Role.OWNER:
        return False
    return not (
        User.objects.filter(role=User.Role.OWNER, archived=False)
        .exclude(pk=user.pk)
        .exists()
    )


def can_manage_note(actor, note) -> bool:
    """
    True if `actor` may edit or delete an existing AdminNoteChange
    (account note or event note). An owner (or superuser) can manage any
    note on anything; a plain admin can only manage a note they
    personally authored — editing/deleting someone else's note requires
    an owner, regardless of what the note is attached to.
    """
    if not actor:
        return False
    if actor.is_superuser or actor.role == User.Role.OWNER:
        return True
    return bool(note and note.author_id == actor.pk)


class IsApprovedVendor(IsVendor):
    """
    Gates actions a vendor can only do once an admin has approved their
    account — e.g. creating a listing. `IsVendor` alone would let a
    still-pending vendor through.
    """

    message = "Your vendor account is still pending admin approval."

    def has_permission(self, request, view):
        return bool(
            super().has_permission(request, view)
            and (
                request.user.is_superuser
                or request.user.vendor_status == User.VendorStatus.APPROVED
            )
        )
