from django.db import transaction
from django.db.models import Q
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Organization, Membership, RoleAccess
from .access import PERMISSION_LABELS, permissions_for, require_access
from .serializers import (
    AddMemberSerializer,
    ChangeMemberRoleSerializer,
    MembershipSerializer,
    MemberAccessSerializer,
    OrganizationSerializer,
    RoleAccessSerializer,
)


def get_organization_membership(user, organization_id, *, lock=False):
    organization_query = Organization.objects.filter(is_active=True)
    if lock:
        organization_query = organization_query.select_for_update()
    organization = get_object_or_404(organization_query, id=organization_id)
    membership = Membership.objects.filter(
        organization=organization, user=user, is_active=True
    ).first()
    if membership is None:
        raise PermissionDenied("You cannot access this organization.")
    return organization, membership


def require_role(membership, *roles):
    if membership.role not in roles:
        raise PermissionDenied("You do not have permission to perform this action.")


def require_another_owner(organization, member):
    if member.role == Membership.Role.OWNER and not Membership.objects.filter(
        organization=organization, role=Membership.Role.OWNER, is_active=True
    ).exclude(id=member.id).exists():
        raise ValidationError({"role": "An organization must have an active owner."})


class OrganizationListCreateView(generics.ListCreateAPIView):
    serializer_class = OrganizationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Organization.objects.filter(
            membership__user=self.request.user,
            membership__is_active=True,
            is_active=True
        ).distinct()

    @transaction.atomic
    def perform_create(self, serializer):
        organization = serializer.save()
        Membership.objects.create(
            organization=organization,
            user=self.request.user,
            role=Membership.Role.OWNER
        )


class OrganizationDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, organization_id):
        organization, membership = get_organization_membership(request.user, organization_id)
        require_access(membership, "organizations.view")
        return Response(OrganizationSerializer(organization).data)

    def patch(self, request, organization_id):
        organization, membership = get_organization_membership(
            request.user, organization_id
        )
        require_access(membership, "organizations.update")
        serializer = OrganizationSerializer(organization, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class OrganizationMembersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, organization_id):
        organization, membership = get_organization_membership(request.user, organization_id)
        require_access(membership, "members.view")
        members = Membership.objects.filter(
            organization=organization, is_active=True
        ).select_related("user").order_by("joined_at", "id")
        return Response(MembershipSerializer(members, many=True).data)

    @transaction.atomic
    def post(self, request, organization_id):
        organization, membership = get_organization_membership(
            request.user, organization_id, lock=True
        )
        require_role(membership, Membership.Role.OWNER)
        serializer = AddMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = get_user_model().objects.filter(
            email__iexact=serializer.validated_data["email"], is_active=True
        ).first()
        if user is None:
            raise ValidationError({"email": "No active user has this email."})

        member, created = Membership.objects.get_or_create(
            organization=organization,
            user=user,
            defaults={"role": serializer.validated_data["role"]},
        )
        if not created:
            if member.is_active:
                raise ValidationError({"email": "User is already a member."})
            member.role = serializer.validated_data["role"]
            member.permissions_override = None
            member.is_active = True
            member.save(update_fields=["role", "permissions_override", "is_active"])

        return Response(
            MembershipSerializer(member).data,
            status=status.HTTP_201_CREATED,
        )


class AvailableMembersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, organization_id):
        organization, membership = get_organization_membership(request.user, organization_id)
        require_role(membership, Membership.Role.OWNER)
        query = request.query_params.get("q", "").strip()[:100]
        if len(query) < 2:
            return Response([])

        active_member_ids = Membership.objects.filter(
            organization=organization, is_active=True
        ).values("user_id")
        users = (
            get_user_model().objects.filter(is_active=True)
            .filter(Q(email__icontains=query) | Q(username__icontains=query))
            .exclude(id__in=active_member_ids)
            .order_by("email")[:10]
        )
        return Response(list(users.values("email", "username", "first_name", "last_name")))


class OrganizationMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def patch(self, request, organization_id, member_id):
        organization, membership = get_organization_membership(
            request.user, organization_id, lock=True
        )
        require_role(membership, Membership.Role.OWNER)
        member = get_object_or_404(
            Membership.objects.select_related("user"),
            id=member_id, organization=organization, is_active=True,
        )
        serializer = ChangeMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_role = serializer.validated_data["role"]
        if member.role == Membership.Role.OWNER and new_role != Membership.Role.OWNER:
            require_another_owner(organization, member)
        member.role = new_role
        member.permissions_override = None
        member.save(update_fields=["role", "permissions_override"])
        return Response(MembershipSerializer(member).data)

    @transaction.atomic
    def delete(self, request, organization_id, member_id):
        organization, membership = get_organization_membership(
            request.user, organization_id, lock=True
        )
        require_role(membership, Membership.Role.OWNER)
        member = get_object_or_404(
            Membership, id=member_id, organization=organization, is_active=True
        )
        require_another_owner(organization, member)
        member.is_active = False
        member.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrganizationMemberAccessView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, organization_id, member_id):
        organization, membership = get_organization_membership(request.user, organization_id)
        require_role(membership, Membership.Role.OWNER)
        member = get_object_or_404(
            Membership.objects.select_related("user"),
            id=member_id, organization=organization, is_active=True,
        )
        if member.role == Membership.Role.OWNER:
            raise ValidationError({"permissions": "Owner access cannot be changed."})
        serializer = MemberAccessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member.permissions_override = serializer.validated_data["permissions"]
        member.save(update_fields=["permissions_override"])
        return Response(MembershipSerializer(member).data)


class OrganizationRoleAccessListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, organization_id):
        _, membership = get_organization_membership(request.user, organization_id)
        require_role(membership, Membership.Role.OWNER)
        return Response({
            "available_permissions": PERMISSION_LABELS,
            "roles": {
                role: permissions_for(Membership(
                    organization_id=organization_id, role=role
                ))
                for role in Membership.Role.values
            },
        })


class OrganizationRoleAccessDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, organization_id, role):
        organization, membership = get_organization_membership(
            request.user, organization_id
        )
        require_role(membership, Membership.Role.OWNER)
        if role not in (Membership.Role.MANAGER, Membership.Role.STAFF):
            raise ValidationError({"role": "Only MANAGER and STAFF access can be edited."})
        serializer = RoleAccessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        RoleAccess.objects.update_or_create(
            organization=organization,
            role=role,
            defaults={"permissions": serializer.validated_data["permissions"]},
        )
        return Response({"role": role, "permissions": serializer.validated_data["permissions"]})
