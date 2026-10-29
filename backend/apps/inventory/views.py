from rest_framework import viewsets
from django.db import transaction
from apps.audit.services import record_audit
from .models import Category, Product, StockMovement
from .serializers import (
    CategorySerializer,
    ProductSerializer,
    StockMovementFilterSerializer,
    StockMovementSerializer,
)
from common.permissions import HasOrganizationAccess

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import serializers
from .services import adjust_stock


class TenantModelViewSet(viewsets.ModelViewSet):
    permission_classes = [HasOrganizationAccess]
    access_resource = "inventory"

    def get_required_access(self):
        action = "view" if self.action in ("list", "retrieve") else "manage"
        return f"{self.access_resource}.{action}"

    def get_queryset(self):
        return self.queryset.filter(
            organization=self.request.organization
        )

    def perform_create(self, serializer):
        serializer.save(organization=self.request.organization)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class CategoryViewSet(TenantModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class ProductViewSet(TenantModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    search_fields = ["name", "sku"]
    ordering_fields = ["name", "created_at", "selling_price"]

    @transaction.atomic
    def perform_create(self, serializer):
        super().perform_create(serializer)
        product = serializer.instance
        record_audit(
            organization=self.request.organization,
            actor=self.request.user,
            action="PRODUCT_CREATED",
            entity_type="Product",
            entity_id=product.id,
            changes={"name": {"old": None, "new": product.name}},
        )

    @transaction.atomic
    def perform_update(self, serializer):
        old_values = ProductSerializer(serializer.instance).data
        serializer.save()
        new_values = ProductSerializer(serializer.instance).data
        changes = {
            field: {"old": old_values[field], "new": new_values[field]}
            for field in new_values
            if old_values.get(field) != new_values[field]
        }
        if changes:
            record_audit(
                organization=self.request.organization,
                actor=self.request.user,
                action="PRODUCT_UPDATED",
                entity_type="Product",
                entity_id=serializer.instance.id,
                changes=changes,
            )

    @transaction.atomic
    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        record_audit(
            organization=self.request.organization,
            actor=self.request.user,
            action="PRODUCT_DELETED",
            entity_type="Product",
            entity_id=instance.id,
            changes={"is_active": {"old": True, "new": False}},
        )

class StockAdjustmentSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity_delta = serializers.IntegerField()
    reason = serializers.CharField(max_length=255)


class StockAdjustmentView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "inventory.manage"

    def post(self, request):
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        movement = adjust_stock(
            organization=request.organization,
            product_id=serializer.validated_data["product_id"],
            delta=serializer.validated_data["quantity_delta"],
            reason=serializer.validated_data["reason"],
            user=request.user
        )

        return Response({
            "success": True,
            "data": {
                "quantity_before": movement.quantity_before,
                "quantity_delta": movement.quantity_delta,
                "quantity_after": movement.quantity_after
            }
        })


class StockMovementListView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "inventory.view"

    def get(self, request):
        movements = StockMovement.objects.filter(
            organization=request.organization
        ).order_by("-created_at", "-id")

        filter_serializer = StockMovementFilterSerializer(data=request.query_params)
        filter_serializer.is_valid(raise_exception=True)
        product_id = filter_serializer.validated_data.get("product_id")
        if product_id is not None:
            movements = movements.filter(
                product_id=product_id
            )

        return Response({
            "success": True,
            "data": StockMovementSerializer(movements, many=True).data,
        })
