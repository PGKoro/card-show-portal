from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.microsoft.views import MicrosoftGraphOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import RegisterView, SocialLoginView
from dj_rest_auth.views import LoginView, PasswordResetView
from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.permissions import IsAdminRole

from .models import AdminNoteChange, User
from .serializers import (
    AdminAccountNoteLogSerializer,
    AdminCreateUserSerializer,
    AdminGlobalNoteLogSerializer,
    AdminNoteChangeSerializer,
    AdminUserDetailSerializer,
    AdminUserNoteCreateSerializer,
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

    permission_classes = [IsAdminRole]
    serializer_class = UserDetailsSerializer

    def get_queryset(self):
        search = self.request.query_params.get("search", "").strip()
        role = self.request.query_params.get("role", "").strip()
        queryset = User.objects.order_by("email")
        if role in (User.Role.VENDOR, User.Role.CUSTOMER, User.Role.ADMIN):
            queryset = queryset.filter(role=role)
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
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(business_name__icontains=search)
            )
        return queryset


class AdminUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE a single user for Manage Accounts."""

    permission_classes = [IsAdminRole]
    queryset = User.objects.all()

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return AdminUserDetailSerializer
        return UserDetailsSerializer

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        return Response(UserDetailsSerializer(self.get_object()).data)

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise ValidationError("You can't delete your own account.")
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
        archived = request.data.get("archived")
        if archived is None:
            archived = True
        elif isinstance(archived, str):
            archived = archived.strip().lower() in ("1", "true", "yes", "on")
        else:
            archived = bool(archived)
        user.archived = archived
        user.save(update_fields=["archived"])
        return Response(UserDetailsSerializer(user).data)

    def post(self, request, pk):
        return self.patch(request, pk)


class RestoreUserView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        user.archived = False
        user.save(update_fields=["archived"])
        return Response(UserDetailsSerializer(user).data)


class FlagUserView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        user.flagged = True
        user.save(update_fields=["flagged"])
        return Response(UserDetailsSerializer(user).data)


class UnflagUserView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        user.flagged = False
        user.save(update_fields=["flagged"])
        return Response(UserDetailsSerializer(user).data)


class AdminCreateUserView(generics.CreateAPIView):
    """POST /api/v1/admin/users/create/ — admin provisioning tool."""

    permission_classes = [IsAdminRole]
    serializer_class = AdminCreateUserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserDetailsSerializer(user).data, status=status.HTTP_201_CREATED)


class SetUserRoleView(APIView):
    """POST /api/v1/admin/users/<id>/set-role/."""

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        new_role = request.data.get("role")
        if new_role not in (User.Role.CUSTOMER, User.Role.VENDOR, User.Role.ADMIN):
            return Response(
                {"role": "Must be one of: customer, vendor, admin."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = get_object_or_404(User, pk=pk)
        user.role = new_role

        if new_role == User.Role.ADMIN:
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
    permission_classes = [IsAdminRole]

    def delete(self, request, pk, note_id):
        user = get_object_or_404(User, pk=pk)
        note = get_object_or_404(
            AdminNoteChange,
            pk=note_id,
            target_type=AdminNoteChange.TARGET_USER,
            target_id=pk,
        )
        note.delete()
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
        changes = AdminNoteChange.objects.filter(
            target_type=AdminNoteChange.TARGET_USER,
            target_id=pk,
        )
        return Response(AdminAccountNoteLogSerializer(changes, many=True).data)


class AdminUserImpersonateView(APIView):
    """
    Issues a fresh JWT pair for the target user so an admin can view the
    app exactly as that user sees it. Locked to admins only, blocks
    impersonating another admin (avoids one admin silently acting as
    another), and logs every use into AdminNoteChange so it shows up in
    the site-wide Admin Note History feed for accountability.
    """

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)

        if user.pk == request.user.pk:
            return Response(
                {"detail": "You can't impersonate your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.role == User.Role.ADMIN or user.is_superuser:
            return Response(
                {"detail": "Admin accounts can't be impersonated."},
                status=status.HTTP_400_BAD_REQUEST,
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
