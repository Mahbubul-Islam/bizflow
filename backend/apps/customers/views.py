from rest_framework import viewsets
from .models import Customer
from .serializers import CustomerSerializer
from common.permissions import HasOrganizationAccess


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        action = "view" if self.action in ("list", "retrieve") else "manage"
        return f"customers.{action}"

    def get_queryset(self):
        return Customer.objects.filter(
            organization=self.request.organization
        )

    def perform_create(self, serializer):
        serializer.save(organization=self.request.organization)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])
