from django.db import transaction
from django.db.models import F
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from apps.audit.services import record_audit
from .models import Product, PurchaseOrder, PurchaseOrderItem, StockMovement


class PurchaseOrderItemInputSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity_ordered = serializers.IntegerField(min_value=1, max_value=2147483647)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)


class PurchaseOrderCreateSerializer(serializers.Serializer):
    supplier_name = serializers.CharField(max_length=200)
    notes = serializers.CharField(required=False, allow_blank=True)
    items = PurchaseOrderItemInputSerializer(many=True, allow_empty=False)

    def validate_items(self, items):
        ids = [item["product_id"] for item in items]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Each product can appear only once.")
        organization = self.context["request"].organization
        if Product.objects.filter(id__in=ids, organization=organization, is_active=True).count() != len(ids):
            raise serializers.ValidationError("Select active products in this organization.")
        return items


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    product_id = serializers.UUIDField(read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    sku = serializers.CharField(source="product.sku", read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = ["id", "product_id", "product_name", "sku", "quantity_ordered", "quantity_received", "unit_cost"]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = ["id", "supplier_name", "status", "notes", "created_at", "updated_at", "items"]


class ReceiptItemSerializer(serializers.Serializer):
    item_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=2147483647)


class ReceiptSerializer(serializers.Serializer):
    items = ReceiptItemSerializer(many=True, allow_empty=False)

    def validate_items(self, items):
        ids = [item["item_id"] for item in items]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Each order item can appear only once.")
        return items


@transaction.atomic
def create_purchase_order(*, organization, user, data):
    order = PurchaseOrder.objects.create(
        organization=organization, created_by=user,
        supplier_name=data["supplier_name"], notes=data.get("notes", ""),
    )
    PurchaseOrderItem.objects.bulk_create([
        PurchaseOrderItem(purchase_order=order, product_id=item["product_id"],
                          quantity_ordered=item["quantity_ordered"], unit_cost=item["unit_cost"])
        for item in data["items"]
    ])
    record_audit(organization=organization, actor=user, action="PURCHASE_ORDER_CREATED",
                 entity_type="PurchaseOrder", entity_id=order.id,
                 changes={"supplier_name": {"old": None, "new": order.supplier_name}})
    return order


@transaction.atomic
def receive_purchase_order(*, organization, order_id, user, items):
    order = PurchaseOrder.objects.select_for_update().filter(id=order_id, organization=organization).first()
    if order is None:
        raise ValidationError("Purchase order not found.")
    lines = {line.id: line for line in PurchaseOrderItem.objects.select_for_update().filter(
        purchase_order=order).select_related("product")}
    for entry in items:
        line = lines.get(entry["item_id"])
        if line is None:
            raise ValidationError("Order item not found.")
        if line.quantity_received + entry["quantity"] > line.quantity_ordered:
            raise ValidationError(f"Received quantity exceeds ordered quantity for {line.product.name}.")
    for entry in items:
        line = lines[entry["item_id"]]
        product = Product.objects.select_for_update().get(id=line.product_id, organization=organization)
        before = product.stock_quantity
        quantity = entry["quantity"]
        if before + quantity > 2147483647:
            raise ValidationError(f"Stock quantity is too large for {product.name}.")
        Product.objects.filter(id=product.id).update(stock_quantity=F("stock_quantity") + quantity)
        line.quantity_received += quantity
        line.save(update_fields=["quantity_received"])
        StockMovement.objects.create(
            organization=organization, product=product, quantity_delta=quantity,
            quantity_before=before, quantity_after=before + quantity,
            reason=f"Purchase order receipt from {order.supplier_name}",
            reference_id=order.id, created_by=user,
        )
    order.status = (PurchaseOrder.Status.RECEIVED if all(
        line.quantity_received == line.quantity_ordered for line in lines.values()
    ) else PurchaseOrder.Status.PARTIALLY_RECEIVED)
    order.save(update_fields=["status", "updated_at"])
    record_audit(organization=organization, actor=user, action="PURCHASE_ORDER_RECEIVED",
                 entity_type="PurchaseOrder", entity_id=order.id,
                 changes={"received": {"old": None, "new": [
                     {"item_id": str(entry["item_id"]), "item_name": lines[entry["item_id"]].product.name, "quantity": entry["quantity"]} for entry in items
                 ]}})
    return order
