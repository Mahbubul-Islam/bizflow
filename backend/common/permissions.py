from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied, ValidationError
from apps.organizations.models import Membership
from apps.organizations.access import require_access


def get_current_membership(request):
    organization_id = request.headers.get("X-Organization-ID")

    if not organization_id:
        raise ValidationError({
            "organization": "X-Organization-ID header is required."
        })

    membership = Membership.objects.filter(
        organization_id=organization_id,
        organization__is_active=True,
        user=request.user,
        is_active=True
    ).first()

    if membership is None:
        raise PermissionDenied("You cannot access this organization.")

    return membership


class IsOrganizationMember(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False

        request.membership = get_current_membership(request)
        request.organization = request.membership.organization
        return True


class IsManagerOrOwner(IsOrganizationMember):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False

        return request.membership.role in [
            Membership.Role.OWNER,
            Membership.Role.MANAGER
        ]


class HasOrganizationAccess(IsOrganizationMember):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        permission = view.get_required_access()
        require_access(request.membership, permission)
        return True
