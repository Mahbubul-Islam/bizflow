from rest_framework import serializers
from .models import Category, Product, StockMovement


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "description", "is_active"]
        read_only_fields = ["id"]


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            "id", "category", "name", "sku", "description",
            "cost_price", "selling_price", "stock_quantity",
            "reorder_level", "is_active", "created_at"
        ]
        read_only_fields = ["id", "stock_quantity", "created_at"]

    def validate_category(self, category):
        if category and category.organization_id != self.context[
            "request"
        ].organization.id:
            raise serializers.ValidationError("Invalid category.")
        return category

class StockAdjustmentSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity_delta = serializers.IntegerField()
    reason = serializers.CharField(max_length=255)


class StockMovementSerializer(serializers.ModelSerializer):
    product_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            "id", "product_id", "quantity_before", "quantity_delta",
            "quantity_after", "reason", "created_at",
        ]


class StockMovementFilterSerializer(serializers.Serializer):
    product_id = serializers.UUIDField(required=False)
