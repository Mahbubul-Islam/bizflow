import uuid
from django.conf import settings
from django.db import models
from django.db.models import Q


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"],
                name="unique_category_per_organization"
            )
        ]


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        null=True,
        blank=True
    )
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2)
    stock_quantity = models.PositiveIntegerField(default=0)
    reorder_level = models.PositiveIntegerField(default=5)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "sku"],
                name="unique_product_sku_per_organization"
            ),
            models.CheckConstraint(
                condition=Q(cost_price__gte=0),
                name="product_cost_nonnegative"
            ),
            models.CheckConstraint(
                condition=Q(selling_price__gte=0),
                name="product_price_nonnegative"
            ),
        ]


class StockMovement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.PROTECT
    )
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity_delta = models.IntegerField()
    quantity_before = models.PositiveIntegerField()
    quantity_after = models.PositiveIntegerField()
    reason = models.CharField(max_length=255)
    reference_id = models.UUIDField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(quantity_delta=0),
                name="movement_delta_nonzero"
            )
        ]


class PurchaseOrder(models.Model):
    class Status(models.TextChoices):
        ORDERED = "ordered", "Ordered"
        PARTIALLY_RECEIVED = "partially_received", "Partially received"
        RECEIVED = "received", "Received"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey("organizations.Organization", on_delete=models.PROTECT)
    supplier_name = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ORDERED)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class PurchaseOrderItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_order = models.ForeignKey(PurchaseOrder, related_name="items", on_delete=models.PROTECT)
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity_ordered = models.PositiveIntegerField()
    quantity_received = models.PositiveIntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["purchase_order", "product"], name="unique_purchase_order_product"),
            models.CheckConstraint(condition=Q(quantity_ordered__gt=0), name="purchase_order_quantity_positive"),
            models.CheckConstraint(condition=Q(unit_cost__gte=0), name="purchase_order_cost_nonnegative"),
            models.CheckConstraint(condition=Q(quantity_received__lte=models.F("quantity_ordered")), name="purchase_order_received_within_ordered"),
        ]
