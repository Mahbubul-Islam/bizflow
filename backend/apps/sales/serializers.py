from rest_framework import serializers

from .models import SalesOrder, SalesOrderItem


class DraftOrderItemInputSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class DraftOrderInputSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    items = DraftOrderItemInputSerializer(many=True, required=False, allow_empty=False)
    discount_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=0, required=False
    )
    tax_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=0, required=False
    )
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_items(self, items):
        product_ids = [item["product_id"] for item in items]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError("Each product may appear only once.")
        return items


class SalesOrderItemSerializer(serializers.ModelSerializer):
    product_id = serializers.UUIDField(read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = SalesOrderItem
        fields = ["product_id", "product_name", "quantity", "unit_price", "line_total"]


class SalesOrderSerializer(serializers.ModelSerializer):
    customer_id = serializers.UUIDField(read_only=True)
    items = SalesOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = SalesOrder
        fields = [
            "id", "order_number", "status", "customer_id", "items",
            "subtotal", "discount_amount", "tax_amount", "total_amount",
            "notes", "created_at", "confirmed_at",
        ]
