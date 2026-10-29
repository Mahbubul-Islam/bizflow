from django.db import transaction
from rest_framework.exceptions import ValidationError
from .models import Product, StockMovement


@transaction.atomic
def adjust_stock(*, organization, product_id, delta, reason, user):
    if delta == 0:
        raise ValidationError("Quantity change cannot be zero.")

    product = Product.objects.select_for_update().filter(
        id=product_id,
        organization=organization,
        is_active=True
    ).first()

    if product is None:
        raise ValidationError("Product not found.")

    before = product.stock_quantity
    after = before + delta

    if after < 0:
        raise ValidationError("Insufficient stock.")

    product.stock_quantity = after
    product.save(update_fields=["stock_quantity", "updated_at"])

    movement = StockMovement.objects.create(
        organization=organization,
        product=product,
        quantity_delta=delta,
        quantity_before=before,
        quantity_after=after,
        reason=reason,
        created_by=user
    )

    return movement