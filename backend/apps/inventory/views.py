from rest_framework import viewsets
from django.db import transaction
from uuid import UUID
from django.core.serializers.json import DjangoJSONEncoder
import json
from django.db.models import F, Q
from django.core.paginator import Paginator
from apps.audit.services import record_audit
from .models import Category, Product, StockMovement
from .serializers import (
    CategorySerializer,
    ProductSerializer,
    StockMovementFilterSerializer,
    StockMovementSerializer,
)
from common.permissions import HasOrganizationAccess
from apps.organizations.access import permissions_for

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from .services import adjust_stock
from .product_import import read_product_rows
from .purchasing import (
    PurchaseOrderCreateSerializer, PurchaseOrderSerializer, ReceiptSerializer,
    create_purchase_order, receive_purchase_order,
)
from .models import PurchaseOrder


class TenantModelViewSet(viewsets.ModelViewSet):
    permission_classes = [HasOrganizationAccess]
    access_resource = "inventory"

    def get_required_access(self):
        action = "view" if self.action in ("list", "retrieve") else "manage"
        if action == "view" and "sales.manage" in permissions_for(self.request.membership):
            return "sales.manage"
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
        old_values = json.loads(json.dumps(ProductSerializer(serializer.instance).data, cls=DjangoJSONEncoder))
        serializer.save()
        new_values = json.loads(json.dumps(ProductSerializer(serializer.instance).data, cls=DjangoJSONEncoder))
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


class BulkProductRowSerializer(ProductSerializer):
    stock_quantity = serializers.IntegerField(min_value=0, max_value=2147483647)

    class Meta(ProductSerializer.Meta):
        read_only_fields = ["id", "created_at"]


class BulkProductImportView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "inventory.manage"

    def post(self, request):
        upload = request.FILES.get("file")
        if not upload or upload.size > 2 * 1024 * 1024:
            raise ValidationError({"file": "Upload a CSV or XLSX file smaller than 2 MB."})
        rows = read_product_rows(upload)

        existing_skus = set(Product.objects.filter(organization=request.organization).values_list("sku", flat=True))
        categories = {}
        for category in Category.objects.filter(organization=request.organization):
            categories.setdefault(category.name.casefold(), []).append(category)
        seen = set()
        validated = []
        new_categories = {}
        for line, row in rows:
            if None in row:
                raise ValidationError({"file": f"Row {line} has too many columns."})
            sku = (row.get("sku") or "").strip()
            if sku in seen or sku in existing_skus:
                raise ValidationError({"file": f"Row {line}: SKU '{sku}' already exists."})
            seen.add(sku)
            data = {key: value.strip() if value is not None else "" for key, value in row.items()}
            category_name = data.pop("category", "")
            if category_name:
                matches = categories.get(category_name.casefold(), [])
                if len(matches) > 1:
                    raise ValidationError({"file": f"Row {line}: category '{category_name}' is ambiguous."})
                if not matches and len(category_name) > 150:
                    raise ValidationError({"file": f"Row {line}: category must be at most 150 characters."})
                if not matches:
                    new_categories.setdefault(category_name.casefold(), category_name)
            else:
                category_name = None
            data["category"] = str(matches[0].id) if category_name and matches else None
            if not data.get("reorder_level"):
                data.pop("reorder_level", None)
            serializer = BulkProductRowSerializer(data=data, context={"request": request})
            if not serializer.is_valid():
                raise ValidationError({"file": f"Row {line}: {serializer.errors}"})
            validated.append((serializer.validated_data, category_name.casefold() if category_name else None))

        with transaction.atomic():
            for key, name in new_categories.items():
                category = Category.objects.create(organization=request.organization, name=name)
                categories[key] = [category]
            for data, category_key in validated:
                if category_key:
                    category = categories[category_key][0]
                    if not category.is_active:
                        category.is_active = True
                        category.save(update_fields=["is_active"])
                    data["category"] = category
                stock = data.pop("stock_quantity")
                product = Product.objects.create(organization=request.organization, stock_quantity=stock, **data)
                if stock:
                    StockMovement.objects.create(
                        organization=request.organization, product=product,
                        quantity_before=0, quantity_delta=stock, quantity_after=stock,
                        reason="Opening stock from product import", created_by=request.user,
                    )
                record_audit(
                    organization=request.organization, actor=request.user,
                    action="PRODUCT_CREATED", entity_type="Product", entity_id=product.id,
                    changes={"name": {"old": None, "new": product.name}},
                )
        return Response({"success": True, "created": len(validated)})


class ProductCatalogView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        if "sales.manage" in permissions_for(self.request.membership):
            return "sales.manage"
        return "inventory.view"

    def get(self, request):
        try:
            page_number = int(request.query_params.get("page", "1"))
        except ValueError as exc:
            raise ValidationError({"page": "Enter a valid page number."}) from exc
        if page_number < 1:
            raise ValidationError({"page": "Enter a valid page number."})
        queryset = Product.objects.filter(organization=request.organization)
        query = request.query_params.get("search", "").strip()
        if query:
            queryset = queryset.filter(Q(name__icontains=query) | Q(sku__icontains=query))
        category = request.query_params.get("category")
        if category == "none":
            queryset = queryset.filter(category__isnull=True)
        elif category:
            try:
                category_id = UUID(category)
            except ValueError as exc:
                raise ValidationError({"category": "Enter a valid category ID."}) from exc
            queryset = queryset.filter(category_id=category_id)
        status = request.query_params.get("status", "all")
        if status not in ("all", "active", "inactive"):
            raise ValidationError({"status": "Choose all, active, or inactive."})
        if status != "all":
            queryset = queryset.filter(is_active=status == "active")
        stock = request.query_params.get("stock", "all")
        if stock == "out":
            queryset = queryset.filter(stock_quantity=0)
        elif stock == "low":
            queryset = queryset.filter(stock_quantity__gt=0, stock_quantity__lte=F("reorder_level"))
        elif stock == "in":
            queryset = queryset.filter(stock_quantity__gt=F("reorder_level"))
        elif stock != "all":
            raise ValidationError({"stock": "Choose all, in, low, or out."})
        if request.query_params.get("low_stock") == "true":
            queryset = queryset.filter(is_active=True, stock_quantity__lte=F("reorder_level"))
        if request.query_params.get("active") == "true":
            queryset = queryset.filter(is_active=True)
        paginator = Paginator(queryset.order_by("name", "id"), 10)
        if page_number > paginator.num_pages:
            raise ValidationError({"page": "Page does not exist."})
        page = paginator.page(page_number)
        return Response({
            "count": paginator.count,
            "next": page_number + 1 if page.has_next() else None,
            "results": ProductSerializer(page.object_list, many=True).data,
        })

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
        ).select_related("product").order_by("-created_at", "-id")

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


class PurchaseOrderListCreateView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "inventory.view" if self.request.method == "GET" else "inventory.manage"

    def get(self, request):
        orders = PurchaseOrder.objects.filter(organization=request.organization).prefetch_related(
            "items__product"
        ).order_by("-created_at", "-id")
        return Response(PurchaseOrderSerializer(orders, many=True).data)

    def post(self, request):
        serializer = PurchaseOrderCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        order = create_purchase_order(organization=request.organization, user=request.user, data=serializer.validated_data)
        return Response(PurchaseOrderSerializer(PurchaseOrder.objects.prefetch_related("items__product").get(id=order.id)).data, status=201)


class PurchaseOrderReceiveView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "inventory.manage"

    def post(self, request, order_id):
        serializer = ReceiptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = receive_purchase_order(
            organization=request.organization, order_id=order_id,
            user=request.user, items=serializer.validated_data["items"],
        )
        return Response(PurchaseOrderSerializer(PurchaseOrder.objects.prefetch_related("items__product").get(id=order.id)).data)
