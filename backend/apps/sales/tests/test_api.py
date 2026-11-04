from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.inventory.models import Product, StockMovement
from apps.organizations.models import Membership, Organization, RoleAccess
from apps.sales.models import SalesOrder, SalesOrderItem


class SalesOrderAPITest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="sales@example.com", password="StrongPassword123!"
        )
        self.organization = Organization.objects.create(name="Shop", slug="shop")
        self.other_organization = Organization.objects.create(name="Other", slug="other-shop")
        Membership.objects.create(
            organization=self.organization, user=self.user, role=Membership.Role.OWNER
        )
        self.customer = Customer.objects.create(
            organization=self.organization, name="Buyer"
        )
        self.product = Product.objects.create(
            organization=self.organization, name="Mouse", sku="M-1",
            cost_price="300.00", selling_price="650.00", stock_quantity=10,
        )
        self.other_product = Product.objects.create(
            organization=self.other_organization, name="Secret", sku="S-1",
            cost_price="10.00", selling_price="20.00", stock_quantity=10,
        )
        self.client = APIClient(HTTP_HOST="localhost")
        self.client.force_authenticate(user=self.user)
        self.headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}
        self.url = "/api/v1/orders/"
        self.body = {
            "customer_id": str(self.customer.id),
            "items": [{"product_id": str(self.product.id), "quantity": 2}],
            "discount_amount": "100.00",
            "tax_amount": "0.00",
            "notes": "Collect from store",
        }

    def create_order(self):
        return self.client.post(self.url, self.body, format="json", **self.headers)

    def test_create_list_and_retrieve_draft(self):
        self.body["total_amount"] = "0.01"
        created = self.create_order()
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["message"], "Draft order created")
        self.assertEqual(created.data["data"]["order_number"], "ORD-000001")
        self.assertEqual(created.data["data"]["status"], "DRAFT")
        self.assertEqual(created.data["data"]["subtotal"], "1300.00")
        self.assertEqual(created.data["data"]["total_amount"], "1200.00")
        self.assertEqual(created.data["data"]["items"][0]["unit_price"], "650.00")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 10)
        order_id = created.data["data"]["id"]
        self.assertEqual(len(self.client.get(self.url, **self.headers).data["data"]), 1)
        detail = self.client.get(f"{self.url}{order_id}/", **self.headers)
        self.assertEqual(detail.data["data"]["id"], order_id)

    def test_order_number_increments_and_draft_cancel_does_not_change_stock(self):
        first_id = self.create_order().data["data"]["id"]
        second = self.create_order()
        self.assertEqual(second.data["data"]["order_number"], "ORD-000002")
        self.assertEqual(
            self.client.get(f"{self.url}{first_id}/invoice/", **self.headers).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(f"{self.url}{first_id}/cancel/", {},
                             format="json", **self.headers).status_code,
            200,
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 10)
        self.assertFalse(StockMovement.objects.exists())

    def test_cannot_retrieve_another_organizations_order(self):
        other_order = SalesOrder.objects.create(
            organization=self.other_organization, order_number="ORD-000001",
            created_by=self.user,
        )
        self.assertEqual(
            self.client.get(f"{self.url}{other_order.id}/", **self.headers).status_code,
            404,
        )

    def test_patch_recalculates_totals_and_rejects_confirmed_update(self):
        order_id = self.create_order().data["data"]["id"]
        response = self.client.patch(
            f"{self.url}{order_id}/",
            {"items": [{"product_id": str(self.product.id), "quantity": 3}],
             "discount_amount": "50.00", "notes": "Updated"},
            format="json", **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["subtotal"], "1950.00")
        self.assertEqual(response.data["data"]["total_amount"], "1900.00")
        self.assertEqual(SalesOrderItem.objects.get(order_id=order_id).quantity, 3)
        self.client.post(f"{self.url}{order_id}/confirm/", {}, format="json", **self.headers)
        self.assertEqual(
            self.client.patch(f"{self.url}{order_id}/", {"notes": "No"},
                              format="json", **self.headers).status_code,
            400,
        )

    def test_confirm_and_cancel_reverse_stock_once(self):
        order_id = self.create_order().data["data"]["id"]
        confirm = self.client.post(
            f"{self.url}{order_id}/confirm/", {}, format="json", **self.headers
        )
        self.assertEqual(confirm.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 8)
        invoice = self.client.get(f"{self.url}{order_id}/invoice/", **self.headers)
        self.assertEqual(invoice.status_code, 200)
        self.assertEqual(invoice["Content-Type"], "application/pdf")
        self.assertTrue(invoice.content.startswith(b"%PDF-1.4"))
        self.assertIn(b"%%EOF", invoice.content)
        self.assertIn(b"ORD-000001", invoice.content)
        cancel = self.client.post(
            f"{self.url}{order_id}/cancel/", {}, format="json", **self.headers
        )
        self.assertEqual(cancel.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 10)
        self.assertEqual(
            list(StockMovement.objects.filter(reference_id=order_id)
                 .order_by("created_at").values_list("quantity_delta", flat=True)),
            [-2, 2],
        )
        self.assertEqual(
            self.client.post(f"{self.url}{order_id}/cancel/", {},
                             format="json", **self.headers).status_code,
            400,
        )
        self.assertEqual(
            self.client.get(f"{self.url}{order_id}/invoice/", **self.headers).status_code,
            400,
        )

    def test_rejects_cross_organization_product_and_excess_discount(self):
        self.body["items"][0]["product_id"] = str(self.other_product.id)
        self.assertEqual(self.create_order().status_code, 400)
        self.body["items"][0]["product_id"] = str(self.product.id)
        self.body["discount_amount"] = "9999.00"
        self.assertEqual(self.create_order().status_code, 400)
        self.assertFalse(SalesOrder.objects.exists())

    def test_role_permissions_control_order_access(self):
        Membership.objects.filter(user=self.user).update(role=Membership.Role.STAFF)
        RoleAccess.objects.create(
            organization=self.organization, role=Membership.Role.STAFF,
            permissions=["sales.view"],
        )
        self.assertEqual(self.client.get(self.url, **self.headers).status_code, 200)
        self.assertEqual(self.create_order().status_code, 403)

    def test_sales_manage_alone_can_read_orders_and_products(self):
        Membership.objects.filter(user=self.user).update(role=Membership.Role.STAFF)
        RoleAccess.objects.create(
            organization=self.organization, role=Membership.Role.STAFF,
            permissions=["sales.manage"],
        )
        self.assertEqual(self.client.get(self.url, **self.headers).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/products/", **self.headers).status_code, 200)
        self.assertEqual(self.create_order().status_code, 201)
