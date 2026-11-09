from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from uuid import UUID

from apps.organizations.models import Membership
from apps.inventory.models import Category, PurchaseOrderItem
from .models import AuditLog


class AuditLogListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        organization_id = request.headers.get("X-Organization-ID")
        if not organization_id:
            raise ValidationError({"organization": "X-Organization-ID header is required."})
        try:
            organization_id = UUID(organization_id)
        except ValueError as exc:
            raise ValidationError({"organization": "Invalid organization ID."}) from exc
        membership = Membership.objects.filter(
            organization_id=organization_id,
            organization__is_active=True,
            user=request.user,
            is_active=True,
            role=Membership.Role.OWNER,
        ).first()
        if membership is None:
            raise PermissionDenied("Only organization owners can view audit logs.")

        try:
            page = max(1, int(request.query_params.get("page", "1")))
        except ValueError as exc:
            raise ValidationError({"page": "Page must be a number."}) from exc
        page_size = 20
        logs = AuditLog.objects.filter(organization=membership.organization)
        count = logs.count()
        page_logs = list(logs[(page - 1) * page_size:page * page_size])
        item_ids = {
            item.get("item_id")
            for log in page_logs
            for value in log.changes.values()
            for item in (value.get("new", []) if isinstance(value, dict) and isinstance(value.get("new"), list) else [])
            if isinstance(item, dict) and item.get("item_id") and not item.get("item_name")
        }
        item_names = {str(item_id): name for item_id, name in PurchaseOrderItem.objects.filter(
            id__in=item_ids, purchase_order__organization=membership.organization
        ).values_list("id", "product__name")}
        category_ids = {
            value.get(side)
            for log in page_logs
            for field, value in log.changes.items()
            for side in ("old", "new")
            if field == "category" and isinstance(value, dict) and value.get(side)
        }
        category_names = {str(category_id): name for category_id, name in Category.objects.filter(
            id__in=category_ids, organization=membership.organization
        ).values_list("id", "name")}

        def display_changes(log):
            changes = log.changes.copy()
            for field, value in changes.items():
                if field == "category" and isinstance(value, dict):
                    changes[field] = {
                        side: category_names.get(category_id, category_id)
                        for side, category_id in value.items()
                    }
                    continue
                if isinstance(value, dict) and isinstance(value.get("new"), list):
                    changes[field] = {**value, "new": [
                        {**item, "item_name": item_names[item["item_id"]]}
                        if isinstance(item, dict) and item.get("item_id") in item_names and not item.get("item_name")
                        else item for item in value["new"]
                    ]}
            return changes

        return Response({
            "success": True,
            "count": count,
            "next": page + 1 if page * page_size < count else None,
            "data": [
                {
                    "id": str(log.id),
                    "action": log.action,
                    "entity_type": log.entity_type,
                    "entity_id": str(log.entity_id),
                    "changes": display_changes(log),
                    "created_at": log.created_at.isoformat(),
                }
                for log in page_logs
            ],
        })
