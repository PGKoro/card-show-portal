from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.microsoft.views import MicrosoftGraphOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import RegisterView, SocialLoginView
from dj_rest_auth.views import LoginView, PasswordResetView
from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.permissions import (
    IsAdminRole,
    can_manage_note,
    can_manage_staff_target,
    is_last_active_owner,
)

from .models import AdminNoteChange, User
from .serializers import (
    AdminAccountNoteLogSerializer,
    AdminCreateUserSerializer,
    AdminGlobalNoteLogSerializer,
    AdminNoteChangeSerializer,
    AdminUserDetailSerializer,
    AdminUserNoteCreateSerializer,
    AdminUserSerializer,
    OnboardingBasicSerializer,
    OnboardingDetailsSerializer,
    ProfileSerializer,
    PublicVendorSerializer,
    UserDetailsSerializer,
)


class OnboardingView(generics.UpdateAPIView):
    """
    Onboarding step 1: PATCH /api/v1/auth/onboarding/. Collects name and
    role for the currently-authenticated user (who registered with just
    email/password). Doesn't finalize onboarding — the frontend follows up
    with /onboarding/customer or /onboarding/vendor, which hits
    OnboardingDetailsView below.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = OnboardingBasicSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        return Response(UserDetailsSerializer(request.user).data)


class OnboardingDetailsView(generics.UpdateAPIView):
    """
    Onboarding step 2: PATCH /api/v1/auth/onboarding/details/.
    Role-specific details (business info for vendors, interests for
    customers) — role itself was already set by OnboardingView.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = OnboardingDetailsSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        return Response(UserDetailsSerializer(request.user).data)


class ProfileView(generics.UpdateAPIView):
    """PATCH /api/v1/auth/profile/ — self-service profile settings."""

    permission_classes = [IsAuthenticated]
    serializer_class = ProfileSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        return Response(UserDetailsSerializer(request.user).data)


class PendingVendorListView(generics.ListAPIView):
    """GET /api/v1/admin/vendors/pending/ — vendors awaiting approval."""

    permission_classes = [IsAdminRole]
    serializer_class = UserDetailsSerializer

    def get_queryset(self):
        return User.objects.filter(
            role=User.Role.VENDOR, vendor_status=User.VendorStatus.PENDING_REVIEW
        ).order_by("date_joined")


class VendorDecisionView(APIView):
    permission_classes = [IsAdminRole]
    decision = None

    def post(self, request, pk):
        vendor = get_object_or_404(User, pk=pk, role=User.Role.VENDOR)
        vendor.vendor_status = self.decision
        vendor.save(update_fields=["vendor_status"])
        return Response(UserDetailsSerializer(vendor).data, status=status.HTTP_200_OK)


class ApproveVendorView(VendorDecisionView):
    decision = User.VendorStatus.APPROVED


class RejectVendorView(VendorDecisionView):
    decision = User.VendorStatus.REJECTED


class AdminUserSearchView(generics.ListAPIView):
    """GET /api/v1/admin/users/?search=&role=&flagged=1&archived=1"""
    """
    GET /api/v1/admin/users/?search=<email, business name, or person's
    name>&role=<vendor|customer|admin>&tier=<premium|standard|basic>&flagged=1.
    Backs the "Manage Roles" tool (search any user to change their role), the
    event vendor-picker (?role=vendor, to find vendors to attach to an
    event), the floor-map booth vendor-picker, the "Vendor Tiers" tool
    (?role=vendor&tier=..., paginated per tab), and the flagged-accounts
    filter in Manage Accounts. `search` matches email, business name, or
    first/last name — business_name/first_name/last_name are blank for
    accounts that don't use them, so matching is a no-op there rather than a
    false positive.
    """

    permission_classes = [IsAdminRole]
    serializer_class = AdminUserSerializer

    def get_queryset(self):
        search = self.request.query_params.get("search", "").strip()
        role = self.request.query_params.get("role", "").strip()
        tier = self.request.query_params.get("tier", "").strip()
        queryset = User.objects.order_by("email")
        if role in (User.Role.VENDOR, User.Role.CUSTOMER, User.Role.ADMIN, User.Role.OWNER):
            queryset = queryset.filter(role=role)
        if tier in (User.VendorTier.PREMIUM, User.VendorTier.STANDARD, User.VendorTier.BASIC):
            queryset = queryset.filter(vendor_tier=tier)
        if self.request.query_params.get("flagged", "").strip().lower() in ("1", "true", "yes"):
            queryset = queryset.filter(flagged=True)
        archived_param = self.request.query_params.get("archived", "").strip().lower()
        if archived_param in ("1", "true", "yes"):
            queryset = queryset.filter(archived=True)
        elif archived_param in ("0", "false", "no"):
            queryset = queryset.filter(archived=False)
        if search:
            queryset = queryset.filter(
                Q(email__icontains=search)
                | Q(business_name__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
        return queryset


class AdminUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE a single user for Manage Accounts."""

    permission_classes = [IsAdminRole]
    queryset = User.objects.all()

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return AdminUserDetailSerializer
        return AdminUserSerializer

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if not can_manage_staff_target(request.user, instance):
            raise PermissionDenied("Only an owner can edit another admin's account.")
        super().update(request, *args, **kwargs)
        return Response(AdminUserSerializer(self.get_object()).data)

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise ValidationError("You can't delete your own account.")
        if not can_manage_staff_target(self.request.user, instance):
            raise PermissionDenied("Only an owner can delete another admin's account.")
        if is_last_active_owner(instance):
            raise ValidationError(
                "Can't delete the last owner account — promote another account to "
                "owner first."
            )
        instance.delete()


class ArchiveUserView(APIView):
    permission_classes = [IsAdminRole]

    def patch(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if user.pk == request.user.pk:
            return Response(
                {"detail": "You can't archive your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not can_manage_staff_target(request.user, user):
            return Response(
                {"detail": "Only an owner can archive another admin's account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        archived = request.data.get("archived")
        if archived is None:
            archived = True
        elif isinstance(archived, str):
            archived = archived.strip().lower() in ("1", "true", "yes", "on")
        else:
            archived = bool(archived)
        if archived and is_last_active_owner(user):
            return Response(
                {"detail": "Can't archive the last owner account — promote another account to owner first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.archived = archived
        user.save(update_fields=["archived"])
        return Response(UserDetailsSerializer(user).data)

    def post(self, request, pk):
        return self.patch(request, pk)


class RestoreUserView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if not can_manage_staff_target(request.user, user):
            return Response(
                {"detail": "Only an owner can restore another admin's account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user.archived = False
        user.save(update_fields=["archived"])
        return Response(UserDetailsSerializer(user).data)


class FlagUserView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if not can_manage_staff_target(request.user, user):
            return Response(
                {"detail": "Only an owner can flag another admin's account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user.flagged = True
        user.save(update_fields=["flagged"])
        return Response(UserDetailsSerializer(user).data)


class UnflagUserView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if not can_manage_staff_target(request.user, user):
            return Response(
                {"detail": "Only an owner can unflag another admin's account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user.flagged = False
        user.save(update_fields=["flagged"])
        return Response(UserDetailsSerializer(user).data)


class AdminCreateUserView(generics.CreateAPIView):
    """
    POST /api/v1/admin/users/create/ — admin provisioning tool.

    Regular admins may only provision customer/vendor accounts. Creating
    an admin or owner account is itself a staff-management action, so it's
    restricted to owners (and superusers) — same rule as editing an
    existing admin's account.
    """

    permission_classes = [IsAdminRole]
    serializer_class = AdminCreateUserSerializer

    def create(self, request, *args, **kwargs):
        requested_role = request.data.get("role")
        if requested_role in (User.Role.ADMIN, User.Role.OWNER) and not (
            request.user.is_superuser or request.user.role == User.Role.OWNER
        ):
            return Response(
                {"detail": "Only an owner can create an admin or owner account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserDetailsSerializer(user).data, status=status.HTTP_201_CREATED)


class SetUserRoleView(APIView):
    """POST /api/v1/admin/users/<id>/set-role/."""

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        new_role = request.data.get("role")
        if new_role not in (User.Role.CUSTOMER, User.Role.VENDOR, User.Role.ADMIN, User.Role.OWNER):
            return Response(
                {"role": "Must be one of: customer, vendor, admin, owner."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = get_object_or_404(User, pk=pk)

        # Promoting/demoting into or out of admin/owner is itself a
        # staff-management action, on top of the target already being
        # staff — a plain admin can't touch either direction.
        target_is_or_will_be_staff = new_role in (User.Role.ADMIN, User.Role.OWNER)
        if not can_manage_staff_target(request.user, user) or (
            target_is_or_will_be_staff
            and not (request.user.is_superuser or request.user.role == User.Role.OWNER)
        ):
            return Response(
                {"detail": "Only an owner can change another admin's role, or promote someone to admin/owner."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if new_role != User.Role.OWNER and is_last_active_owner(user):
            return Response(
                {"detail": "Can't change the last owner's role — promote another account to owner first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.role = new_role

        if new_role in (User.Role.ADMIN, User.Role.OWNER):
            user.onboarding_completed = True
        elif new_role == User.Role.VENDOR:
            if user.vendor_status is None:
                user.vendor_status = User.VendorStatus.PENDING_REVIEW
        else:
            user.vendor_status = None

        user.save(update_fields=["role", "onboarding_completed", "vendor_status"])
        return Response(UserDetailsSerializer(user).data, status=status.HTTP_200_OK)


class NoteHistoryPagination(PageNumberPagination):
    page_size = 5
    page_size_query_param = "page_size"
    max_page_size = 50


class GlobalNoteHistoryPagination(PageNumberPagination):
    """20/page, matches what the site-wide Admin Note History tool expects."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminGlobalNoteHistoryView(APIView):
    """
    Read-only, site-wide feed of every note change (accounts + events),
    newest first — backs the Admin Tools > Admin Note History page.

    Supports optional query params:
      - ``admin``: case-insensitive match against the author's name/email.
      - ``type``: "user" or "event", matches AdminNoteChange.target_type.
    """

    permission_classes = [IsAdminRole]
    pagination_class = GlobalNoteHistoryPagination

    def get(self, request):
        changes = AdminNoteChange.objects.select_related("author").order_by(
            "-created_at", "-id"
        )

        admin_query = request.query_params.get("admin", "").strip()
        if admin_query:
            changes = changes.filter(
                Q(author__first_name__icontains=admin_query)
                | Q(author__last_name__icontains=admin_query)
                | Q(author__email__icontains=admin_query)
            )

        type_query = request.query_params.get("type", "").strip().lower()
        if type_query in (AdminNoteChange.TARGET_USER, AdminNoteChange.TARGET_EVENT):
            changes = changes.filter(target_type=type_query)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(changes, request, view=self)
        return paginator.get_paginated_response(
            AdminGlobalNoteLogSerializer(page, many=True).data
        )


class AdminGlobalNoteDetailView(APIView):
    """
    PATCH/DELETE a single note from the site-wide Admin Note History feed,
    regardless of whether it's attached to an account or an event. Same
    authoring rule as the dedicated account/event note endpoints: an
    owner (or superuser) can manage any note, a plain admin can only
    edit/delete a note they personally wrote (see can_manage_note). Notes
    on an admin/owner's own account additionally require an owner
    regardless of who wrote the note (see can_manage_staff_target).
    """

    permission_classes = [IsAdminRole]

    def _get_note(self, note_id):
        return get_object_or_404(AdminNoteChange, pk=note_id)

    def _check_permissions(self, request, note):
        if note.target_type == AdminNoteChange.TARGET_USER:
            target_user = User.objects.filter(pk=note.target_id).first()
            if target_user and not can_manage_staff_target(request.user, target_user):
                raise PermissionDenied(
                    "Only an owner can manage notes on another admin's account."
                )
        if not can_manage_note(request.user, note):
            raise PermissionDenied("You can only edit or delete notes you posted yourself.")

    def _sync_denormalized_field(self, target_type, target_id):
        if target_type == AdminNoteChange.TARGET_USER:
            target = User.objects.filter(pk=target_id).first()
        elif target_type == AdminNoteChange.TARGET_EVENT:
            from apps.events.models import Event  # local import avoids a circular import

            target = Event.objects.filter(pk=target_id).first()
        else:
            return
        if not target:
            return
        latest_note = (
            AdminNoteChange.objects.filter(target_type=target_type, target_id=target_id)
            .order_by("-created_at", "-id")
            .first()
        )
        target.notes = latest_note.new_text if latest_note else ""
        target.save(update_fields=["notes"])

    def patch(self, request, note_id):
        note = self._get_note(note_id)
        self._check_permissions(request, note)
        serializer = AdminUserNoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note.new_text = serializer.validated_data["note"]
        note.save(update_fields=["new_text"])
        self._sync_denormalized_field(note.target_type, note.target_id)
        return Response(AdminGlobalNoteLogSerializer(note).data)

    def delete(self, request, note_id):
        note = self._get_note(note_id)
        self._check_permissions(request, note)
        target_type, target_id = note.target_type, note.target_id
        note.delete()
        self._sync_denormalized_field(target_type, target_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminUserNoteHistoryView(APIView):
    permission_classes = [IsAdminRole]
    pagination_class = NoteHistoryPagination

    def _get_changes_queryset(self, pk):
        return AdminNoteChange.objects.filter(
            target_type=AdminNoteChange.TARGET_USER,
            target_id=pk,
        )

    def _serialize_changes(self, changes):
        return AdminAccountNoteLogSerializer(changes, many=True).data

    def _get_paginated_response(self, request, pk):
        paginator = self.pagination_class()
        changes = self._get_changes_queryset(pk)
        page = paginator.paginate_queryset(changes, request, view=self)
        return paginator.get_paginated_response(self._serialize_changes(page))

    def get(self, request, pk):
        return self._get_paginated_response(request, pk)

    def post(self, request, pk):
        serializer = AdminUserNoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.validated_data["note"]
        user = get_object_or_404(User, pk=pk)
        if not can_manage_staff_target(request.user, user):
            raise PermissionDenied("Only an owner can add notes on another admin's account.")
        previous = user.notes or ""
        user.notes = note
        user.save(update_fields=["notes"])
        AdminNoteChange.objects.create(
            target_type=AdminNoteChange.TARGET_USER,
            target_id=user.pk,
            author=request.user if request.user.is_authenticated else None,
            old_text=previous,
            new_text=note,
        )
        return self._get_paginated_response(request, pk)


class AdminUserNoteDetailView(APIView):
    """
    PATCH/DELETE a single account note. Editing/deleting someone else's
    note requires an owner — a plain admin can only manage notes they
    personally authored (see can_manage_note). This is on top of, not a
    replacement for, can_manage_staff_target: touching a note attached to
    an admin/owner's account still requires an owner regardless of who
    wrote the note.
    """

    permission_classes = [IsAdminRole]

    def _get_note(self, pk, note_id):
        return get_object_or_404(
            AdminNoteChange,
            pk=note_id,
            target_type=AdminNoteChange.TARGET_USER,
            target_id=pk,
        )

    def _refresh_user_notes_field(self, user, pk):
        latest_note = (
            AdminNoteChange.objects.filter(
                target_type=AdminNoteChange.TARGET_USER,
                target_id=pk,
            )
            .order_by("-created_at", "-id")
            .first()
        )
        user.notes = latest_note.new_text if latest_note else ""
        user.save(update_fields=["notes"])

    def patch(self, request, pk, note_id):
        user = get_object_or_404(User, pk=pk)
        if not can_manage_staff_target(request.user, user):
            raise PermissionDenied("Only an owner can edit notes on another admin's account.")
        note = self._get_note(pk, note_id)
        if not can_manage_note(request.user, note):
            raise PermissionDenied("You can only edit notes you posted yourself.")
        serializer = AdminUserNoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note.new_text = serializer.validated_data["note"]
        note.save(update_fields=["new_text"])
        # Keep the account's denormalized `notes` field in sync — it
        # always mirrors the most recent note, and editing the most
        # recent note is the common case (editing an older one leaves the
        # field alone, matching how delete only re-derives from what's
        # left after removal).
        latest_note = (
            AdminNoteChange.objects.filter(
                target_type=AdminNoteChange.TARGET_USER,
                target_id=pk,
            )
            .order_by("-created_at", "-id")
            .first()
        )
        if latest_note and latest_note.pk == note.pk:
            user.notes = note.new_text
            user.save(update_fields=["notes"])
        changes = AdminNoteChange.objects.filter(
            target_type=AdminNoteChange.TARGET_USER,
            target_id=pk,
        )
        return Response(AdminAccountNoteLogSerializer(changes, many=True).data)

    def delete(self, request, pk, note_id):
        user = get_object_or_404(User, pk=pk)
        if not can_manage_staff_target(request.user, user):
            raise PermissionDenied("Only an owner can delete notes on another admin's account.")
        note = self._get_note(pk, note_id)
        if not can_manage_note(request.user, note):
            raise PermissionDenied("You can only delete notes you posted yourself.")
        note.delete()
        self._refresh_user_notes_field(user, pk)
        changes = AdminNoteChange.objects.filter(
            target_type=AdminNoteChange.TARGET_USER,
            target_id=pk,
        )
        return Response(AdminAccountNoteLogSerializer(changes, many=True).data)


class AdminUserImpersonateView(APIView):
    """
    Issues a fresh JWT pair for the target user so an admin/owner can view
    the app exactly as that user sees it.

    - Owner (or superuser) can impersonate a regular admin account, on top
      of every customer/vendor account — owner is "admin for admins" and
      this extends that to impersonation.
    - A plain admin can impersonate customer/vendor accounts but NOT
      another admin account (uses the same `can_manage_staff_target` rule
      as editing/archiving another admin).
    - Owner accounts themselves can never be impersonated by anyone,
      including other owners — there's no legitimate "view as" use case
      for the top of the privilege chain, and it would be too easy for
      one owner's session to quietly act as another's. This check is
      based on the target's actual `role` field, not `is_superuser` —
      some legacy admin accounts (e.g. the original seed superuser) carry
      `is_superuser=True` with `role="admin"`, and those should follow
      normal admin impersonation rules, not be treated as owners.

    Every successful impersonation is logged into AdminNoteChange so it
    shows up in the site-wide Admin Note History feed for accountability.
    """

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)

        if user.pk == request.user.pk:
            return Response(
                {"detail": "You can't impersonate your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.role == User.Role.OWNER:
            return Response(
                {"detail": "Owner accounts can't be impersonated."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.role == User.Role.ADMIN and not can_manage_staff_target(request.user, user):
            return Response(
                {"detail": "Only an owner can impersonate an admin account."},
                status=status.HTTP_403_FORBIDDEN,
            )

        refresh = RefreshToken.for_user(user)
        AdminNoteChange.objects.create(
            target_type=AdminNoteChange.TARGET_USER,
            target_id=user.pk,
            author=request.user if request.user.is_authenticated else None,
            old_text="",
            new_text=f"Started impersonating {user.email}.",
        )
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserDetailsSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )
class SetVendorTierView(APIView):
    """
    POST /api/v1/admin/users/<id>/set-tier/ with {"tier": "premium" |
    "standard" | "basic"} — backs the "Vendor Tiers" admin tool. This is the
    *only* place a vendor's tier can change (deliberately not exposed
    through ProfileSerializer/AdminCreateUserSerializer or any vendor-facing
    endpoint — see AdminUserSerializer/User.vendor_tier). Only meaningful
    for vendor accounts, so this rejects any other role outright rather than
    silently no-op-ing.
    """

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        new_tier = request.data.get("tier")
        if new_tier not in (
            User.VendorTier.PREMIUM,
            User.VendorTier.STANDARD,
            User.VendorTier.BASIC,
        ):
            return Response(
                {"tier": "Must be one of: premium, standard, basic."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = get_object_or_404(User, pk=pk)
        if user.role != User.Role.VENDOR:
            return Response(
                {"detail": "Only vendor accounts have a tier."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.vendor_tier = new_tier
        user.save(update_fields=["vendor_tier"])
        return Response(AdminUserSerializer(user).data, status=status.HTTP_200_OK)


class ThrottledLoginView(LoginView):
    throttle_scope = "auth"


class ThrottledRegisterView(RegisterView):
    throttle_scope = "auth"


class ThrottledPasswordResetView(PasswordResetView):
    throttle_scope = "auth"


class GoogleLoginView(SocialLoginView):
    adapter_class = GoogleOAuth2Adapter
    client_class = OAuth2Client
    callback_url = settings.GOOGLE_OAUTH_CALLBACK_URL


class MicrosoftLoginView(SocialLoginView):
    adapter_class = MicrosoftGraphOAuth2Adapter
    client_class = OAuth2Client
    callback_url = settings.MICROSOFT_OAUTH_CALLBACK_URL


class PublicVendorDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicVendorSerializer
    queryset = User.objects.filter(role=User.Role.VENDOR, archived=False)


class PublicVendorListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicVendorSerializer

    def get_queryset(self):
        queryset = User.objects.filter(
            role=User.Role.VENDOR,
            vendor_status=User.VendorStatus.APPROVED,
            archived=False,
        )
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(business_name__icontains=search) | Q(location__icontains=search)
            )
        return queryset.order_by("business_name")
