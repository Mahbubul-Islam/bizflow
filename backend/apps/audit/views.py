from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from uuid import UUID

from apps.organizations.models import Membership
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

        logs = AuditLog.objects.filter(organization=membership.organization)
        return Response({
            "success": True,
            "data": [
                {
                    "id": str(log.id),
                    "action": log.action,
                    "entity_type": log.entity_type,
                    "entity_id": str(log.entity_id),
                    "changes": log.changes,
                    "created_at": log.created_at.isoformat(),
                }
                for log in logs
            ],
        })
