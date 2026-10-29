from rest_framework.exceptions import PermissionDenied

from .models import Membership, RoleAccess


PERMISSION_LABELS = {
    "organizations.view": "View organization details",
    "organizations.update": "Update organization details",
    "members.view": "View organization members",
    "inventory.view": "View categories and products",
    "inventory.manage": "Create, update, and remove inventory; adjust stock",
    "customers.view": "View customers",
    "customers.manage": "Create, update, and remove customers",
    "sales.confirm": "Confirm sales orders",
    "sales.view": "View sales orders",
    "sales.manage": "Create and edit draft sales orders",
    "sales.cancel": "Cancel sales orders",
    "sales.invoice": "Download sales invoices",
    "analytics.view": "View dashboard summary",
}

DEFAULT_ROLE_PERMISSIONS = {
    Membership.Role.MANAGER: list(PERMISSION_LABELS),
    Membership.Role.STAFF: [
        "organizations.view",
        "members.view",
        "inventory.view",
        "customers.view",
        "customers.manage",
        "sales.confirm",
        "sales.view",
        "sales.invoice",
        "analytics.view",
    ],
}


def permissions_for(membership):
    if membership.role == Membership.Role.OWNER:
        return list(PERMISSION_LABELS)
    configured = RoleAccess.objects.filter(
        organization_id=membership.organization_id, role=membership.role
    ).first()
    if configured is not None:
        return configured.permissions
    return DEFAULT_ROLE_PERMISSIONS.get(membership.role, [])


def require_access(membership, permission):
    if permission not in permissions_for(membership):
        raise PermissionDenied("You do not have permission to perform this action.")
