from django.db.models import Sum, Count, F
from django.db.models.functions import TruncMonth
from django.utils.dateparse import parse_date
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError

from common.permissions import HasOrganizationAccess
from apps.sales.models import SalesOrder, SalesOrderItem
from apps.inventory.models import Product
from apps.customers.models import Customer


class DashboardSummaryView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "analytics.view"

    def get(self, request):
        organization = request.organization

        orders = SalesOrder.objects.filter(
            organization=organization,
            status=SalesOrder.Status.CONFIRMED
        )

        start = request.query_params.get("from")
        end = request.query_params.get("to")

        if start:
            parsed = parse_date(start)
            if parsed is None:
                raise ValidationError({"from": "Invalid date."})
            orders = orders.filter(confirmed_at__date__gte=parsed)

        if end:
            parsed = parse_date(end)
            if parsed is None:
                raise ValidationError({"to": "Invalid date."})
            orders = orders.filter(confirmed_at__date__lte=parsed)

        sales = orders.aggregate(
            total_sales=Sum("total_amount"),
            total_orders=Count("id")
        )

        total_sales = sales["total_sales"] or 0
        total_orders = sales["total_orders"]

        products = Product.objects.filter(
            organization=organization,
            is_active=True
        )

        return Response({
            "success": True,
            "data": {
                "currency": organization.currency,
                "total_sales": str(total_sales),
                "total_orders": total_orders,
                "total_customers": Customer.objects.filter(
                    organization=organization,
                    is_active=True
                ).count(),
                "total_products": products.count(),
                "low_stock_products": products.filter(
                    stock_quantity__lte=F("reorder_level")
                ).count(),
                "average_order_value": str(
                    round(total_sales / total_orders, 2)
                    if total_orders else 0
                )
            }
        })


class SalesTrendView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "analytics.view"

    def get(self, request):
        period = request.query_params.get("period", "monthly")
        if period != "monthly":
            raise ValidationError({"period": "Only 'monthly' is supported."})

        rows = (SalesOrder.objects.filter(
            organization=request.organization,
            status=SalesOrder.Status.CONFIRMED,
            confirmed_at__isnull=False,
        ).annotate(month=TruncMonth("confirmed_at"))
            .values("month")
            .annotate(sales=Sum("total_amount"), orders=Count("id"))
            .order_by("month"))
        return Response({
            "success": True,
            "data": [
                {
                    "month": row["month"].strftime("%Y-%m"),
                    "sales": f'{row["sales"]:.2f}',
                    "orders": row["orders"],
                }
                for row in rows
            ],
        })


class TopProductsView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "analytics.view"

    def get(self, request):
        raw_limit = request.query_params.get("limit", "5")
        try:
            limit = int(raw_limit)
        except (TypeError, ValueError) as exc:
            raise ValidationError({"limit": "Enter an integer from 1 to 100."}) from exc
        if not 1 <= limit <= 100:
            raise ValidationError({"limit": "Enter an integer from 1 to 100."})

        rows = (SalesOrderItem.objects.filter(
            order__organization=request.organization,
            order__status=SalesOrder.Status.CONFIRMED,
        ).values("product_id", "product__name")
            .annotate(quantity_sold=Sum("quantity"), revenue=Sum("line_total"))
            .order_by("-quantity_sold", "product_id")[:limit])
        return Response({
            "success": True,
            "data": [
                {
                    "product_id": str(row["product_id"]),
                    "name": row["product__name"],
                    "quantity_sold": row["quantity_sold"],
                    "revenue": f'{row["revenue"]:.2f}',
                }
                for row in rows
            ],
        })
