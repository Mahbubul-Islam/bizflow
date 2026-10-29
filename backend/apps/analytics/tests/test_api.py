from datetime import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import Product
from apps.organizations.models import Membership, Organization
from apps.sales.models import SalesOrder, SalesOrderItem


class DashboardAnalyticsTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="analytics@example.com", password="StrongPassword123!"
        )
        self.organization = Organization.objects.create(name="Shop", slug="analytics-shop")
        self.other = Organization.objects.create(name="Other", slug="analytics-other")
        Membership.objects.create(
            user=self.user, organization=self.organization, role=Membership.Role.OWNER
        )
        self.mouse = Product.objects.create(
            organization=self.organization, name="Mouse", sku="M-1",
            cost_price="300.00", selling_price="650.00",
        )
        self.keyboard = Product.objects.create(
            organization=self.organization, name="Keyboard", sku="K-1",
            cost_price="400.00", selling_price="800.00",
        )
        self._order(self.organization, "ORD-000001", 8, self.mouse, 2, "1300.00")
        self._order(self.organization, "ORD-000002", 9, self.mouse, 3, "1950.00")
        self._order(self.organization, "ORD-000003", 9, self.keyboard, 1, "800.00")
        self._order(self.other, "ORD-000001", 9, None, 0, "9999.00")
        self._order(self.organization, "ORD-000004", 9, self.mouse, 5,
                    "3250.00", status=SalesOrder.Status.CANCELLED)
        self.client = APIClient(HTTP_HOST="localhost")
        self.client.force_authenticate(user=self.user)
        self.headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}

    def _order(self, organization, number, month, product, quantity, total, status="CONFIRMED"):
        order = SalesOrder.objects.create(
            organization=organization, order_number=number, created_by=self.user,
            status=status, subtotal=Decimal(total), total_amount=Decimal(total),
            confirmed_at=timezone.make_aware(datetime(2026, month, 15)),
        )
        if product:
            SalesOrderItem.objects.create(
                order=order, product=product, quantity=quantity,
                unit_price=product.selling_price, unit_cost=product.cost_price,
                line_total=Decimal(total),
            )

    def test_monthly_sales_trend_uses_confirmed_orders_only(self):
        response = self.client.get(
            "/api/v1/dashboard/sales-trend/?period=monthly", **self.headers
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"], [
            {"month": "2026-08", "sales": "1300.00", "orders": 1},
            {"month": "2026-09", "sales": "2750.00", "orders": 2},
        ])
        self.assertEqual(self.client.get(
            "/api/v1/dashboard/sales-trend/?period=yearly", **self.headers
        ).status_code, 400)

    def test_top_products_ranks_quantity_and_respects_limit(self):
        response = self.client.get(
            "/api/v1/dashboard/top-products/?limit=1", **self.headers
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"], [{
            "product_id": str(self.mouse.id), "name": "Mouse",
            "quantity_sold": 5, "revenue": "3250.00",
        }])
        self.assertEqual(self.client.get(
            "/api/v1/dashboard/top-products/?limit=0", **self.headers
        ).status_code, 400)
