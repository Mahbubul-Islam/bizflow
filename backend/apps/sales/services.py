from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from decimal import Decimal
from apps.customers.models import Customer
from apps.audit.services import record_audit
from apps.inventory.models import Product, StockMovement
from apps.organizations.models import Organization
from .models import OrderSequence, SalesOrder, SalesOrderItem


def _validated_customer(organization, customer_id):
    if customer_id is None:
        return None
    customer = Customer.objects.filter(
        id=customer_id, organization=organization, is_active=True
    ).first()
    if customer is None:
        raise ValidationError({"customer_id": "Customer not found in this organization."})
    return customer


def _priced_items(organization, items):
    products = Product.objects.filter(
        id__in=[item["product_id"] for item in items],
        organization=organization,
        is_active=True,
    )
    product_map = {product.id: product for product in products}
    if len(product_map) != len(items):
        raise ValidationError({"items": "A product was not found in this organization."})
    priced = []
    for item in items:
        product = product_map[item["product_id"]]
        priced.append({
            "product": product,
            "quantity": item["quantity"],
            "unit_price": product.selling_price,
            "unit_cost": product.cost_price,
            "line_total": product.selling_price * item["quantity"],
        })
    return priced


def _set_totals(order, subtotal):
    total = subtotal - order.discount_amount + order.tax_amount
    if total < 0:
        raise ValidationError({"discount_amount": "Discount exceeds subtotal plus tax."})
    order.subtotal = subtotal
    order.total_amount = total


@transaction.atomic
def create_draft_order(*, organization, user, data):
    items = data.get("items")
    if not items:
        raise ValidationError({"items": "At least one item is required."})
    customer = _validated_customer(organization, data.get("customer_id"))
    priced_items = _priced_items(organization, items)

    Organization.objects.select_for_update().get(id=organization.id)
    sequence, created = OrderSequence.objects.get_or_create(organization=organization)
    if created:
        existing_numbers = SalesOrder.objects.filter(
            organization=organization, order_number__startswith="ORD-"
        ).values_list("order_number", flat=True)
        sequence.next_number = max(
            (int(number[4:]) for number in existing_numbers if number[4:].isdigit()),
            default=0,
        ) + 1
    order_number = f"ORD-{sequence.next_number:06d}"
    sequence.next_number += 1
    sequence.save(update_fields=["next_number"])

    order = SalesOrder(
        organization=organization,
        customer=customer,
        order_number=order_number,
        created_by=user,
        discount_amount=data.get("discount_amount", Decimal("0.00")),
        tax_amount=data.get("tax_amount", Decimal("0.00")),
        notes=data.get("notes", ""),
    )
    _set_totals(order, sum(
        (item["line_total"] for item in priced_items), Decimal("0.00")
    ))
    order.save()
    SalesOrderItem.objects.bulk_create([
        SalesOrderItem(order=order, **item) for item in priced_items
    ])
    record_audit(
        organization=organization, actor=user,
        action="ORDER_CREATED", entity_type="SalesOrder", entity_id=order.id,
        changes={"status": {"old": None, "new": order.status}},
    )
    return order


@transaction.atomic
def update_draft_order(*, order_id, organization, user, data):
    order = SalesOrder.objects.select_for_update().filter(
        id=order_id, organization=organization
    ).first()
    if order is None:
        raise ValidationError("Order not found.")
    if order.status != SalesOrder.Status.DRAFT:
        raise ValidationError("Only draft orders can be updated.")
    old_total = order.total_amount

    if "customer_id" in data:
        order.customer = _validated_customer(organization, data["customer_id"])
    if "discount_amount" in data:
        order.discount_amount = data["discount_amount"]
    if "tax_amount" in data:
        order.tax_amount = data["tax_amount"]
    if "notes" in data:
        order.notes = data["notes"]

    if "items" in data:
        priced_items = _priced_items(organization, data["items"])
        subtotal = sum(
            (item["line_total"] for item in priced_items), Decimal("0.00")
        )
    else:
        priced_items = None
        subtotal = sum(
            (item.line_total for item in order.items.all()), Decimal("0.00")
        )
    _set_totals(order, subtotal)
    order.save()
    if priced_items is not None:
        order.items.all().delete()
        SalesOrderItem.objects.bulk_create([
            SalesOrderItem(order=order, **item) for item in priced_items
        ])
    record_audit(
        organization=organization, actor=user,
        action="ORDER_UPDATED", entity_type="SalesOrder", entity_id=order.id,
        changes={"total_amount": {
            "old": str(old_total), "new": str(order.total_amount)
        }},
    )
    return order


@transaction.atomic
def cancel_order(*, order_id, organization, user):
    order = SalesOrder.objects.select_for_update().filter(
        id=order_id, organization=organization
    ).first()
    if order is None:
        raise ValidationError("Order not found.")
    if order.status == SalesOrder.Status.CANCELLED:
        raise ValidationError("Order is already cancelled.")
    previous_status = order.status

    if order.status == SalesOrder.Status.CONFIRMED:
        quantities = {}
        for item in order.items.all():
            quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity
        products = list(Product.objects.select_for_update().filter(
            id__in=quantities, organization=organization
        ).order_by("id"))
        if len(products) != len(quantities):
            raise ValidationError("Invalid product in order.")
        for product in products:
            before = product.stock_quantity
            product.stock_quantity += quantities[product.id]
            product.save(update_fields=["stock_quantity", "updated_at"])
            StockMovement.objects.create(
                organization=organization,
                product=product,
                quantity_delta=quantities[product.id],
                quantity_before=before,
                quantity_after=product.stock_quantity,
                reason=f"Cancelled sales order {order.order_number}",
                reference_id=order.id,
                created_by=user,
            )

    order.status = SalesOrder.Status.CANCELLED
    order.save(update_fields=["status", "updated_at"])
    record_audit(
        organization=organization, actor=user,
        action="ORDER_CANCELLED", entity_type="SalesOrder", entity_id=order.id,
        changes={"status": {"old": previous_status, "new": "CANCELLED"}},
    )
    return order


@transaction.atomic
def confirm_order(*, order_id, organization, user):
    order = SalesOrder.objects.select_for_update().filter(
        id=order_id,
        organization=organization
    ).first()

    if order is None:
        raise ValidationError("Order not found.")

    if order.status != SalesOrder.Status.DRAFT:
        raise ValidationError("Only draft orders can be confirmed.")

    items = list(order.items.select_related("product"))

    if not items:
        raise ValidationError("Order has no items.")

    quantities = {}
    for item in items:
        quantities[item.product_id] = (
            quantities.get(item.product_id, 0) + item.quantity
        )

    products = list(
        Product.objects.select_for_update()
        .filter(
            id__in=quantities.keys(),
            organization=organization,
            is_active=True
        )
        .order_by("id")
    )

    if len(products) != len(quantities):
        raise ValidationError("Invalid product in order.")

    for product in products:
        if product.stock_quantity < quantities[product.id]:
            raise ValidationError(
                f"Insufficient stock for {product.name}"
            )

    for product in products:
        before = product.stock_quantity
        delta = -quantities[product.id]
        product.stock_quantity = before + delta
        product.save(update_fields=["stock_quantity", "updated_at"])

        StockMovement.objects.create(
            organization=organization,
            product=product,
            quantity_delta=delta,
            quantity_before=before,
            quantity_after=product.stock_quantity,
            reason=f"Sales order {order.order_number}",
            reference_id=order.id,
            created_by=user
        )

    order.status = SalesOrder.Status.CONFIRMED
    order.confirmed_at = timezone.now()
    order.save(update_fields=["status", "confirmed_at", "updated_at"])
    record_audit(
        organization=organization, actor=user,
        action="ORDER_CONFIRMED", entity_type="SalesOrder", entity_id=order.id,
        changes={"status": {"old": "DRAFT", "new": "CONFIRMED"}},
    )

    return order
