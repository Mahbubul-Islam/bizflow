from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Product, PurchaseOrder, StockMovement
from apps.organizations.models import Membership, Organization, RoleAccess


class PurchasingWorkflowTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email="buyer@example.com", password="StrongPassword123!")
        self.organization = Organization.objects.create(name="Buyer", slug="buyer")
        self.other = Organization.objects.create(name="Other", slug="other-buyer")
        Membership.objects.create(organization=self.organization, user=self.user, role=Membership.Role.STAFF)
        RoleAccess.objects.create(organization=self.organization, role=Membership.Role.STAFF,
                                  permissions=["inventory.view", "inventory.manage"])
        self.product = Product.objects.create(organization=self.organization, name="Widget", sku="W-1",
                                              cost_price="10.00", selling_price="15.00", stock_quantity=2)
        self.private_product = Product.objects.create(organization=self.other, name="Private", sku="P-1",
                                                      cost_price="1.00", selling_price="2.00")
        self.client = APIClient(HTTP_HOST="localhost")
        self.client.force_authenticate(user=self.user)
        self.headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}
        self.url = "/api/v1/inventory/purchase-orders/"

    def create_order(self, product=None):
        return self.client.post(self.url, {"supplier_name": "Acme", "items": [
            {"product_id": str((product or self.product).id), "quantity_ordered": 10, "unit_cost": "9.50"}
        ]}, format="json", **self.headers)

    def test_partial_then_full_receipt_updates_stock_once_per_receipt(self):
        created = self.create_order()
        self.assertEqual(created.status_code, 201)
        order_id = created.data["id"]
        item_id = created.data["items"][0]["id"]
        url = f"{self.url}{order_id}/receive/"
        first = self.client.post(url, {"items": [{"item_id": item_id, "quantity": 4}]}, format="json", **self.headers)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["status"], "partially_received")
        second = self.client.post(url, {"items": [{"item_id": item_id, "quantity": 6}]}, format="json", **self.headers)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data["status"], "received")
        rejected = self.client.post(url, {"items": [{"item_id": item_id, "quantity": 1}]}, format="json", **self.headers)
        self.assertEqual(rejected.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 12)
        movements = list(StockMovement.objects.filter(reference_id=order_id).order_by("created_at"))
        self.assertEqual([(m.quantity_before, m.quantity_delta, m.quantity_after) for m in movements], [(2, 4, 6), (6, 6, 12)])

    def test_rejects_cross_tenant_product_and_duplicate_line(self):
        self.assertEqual(self.create_order(self.private_product).status_code, 400)
        duplicate = self.client.post(self.url, {"supplier_name": "Acme", "items": [
            {"product_id": str(self.product.id), "quantity_ordered": 1, "unit_cost": "1.00"},
            {"product_id": str(self.product.id), "quantity_ordered": 1, "unit_cost": "1.00"},
        ]}, format="json", **self.headers)
        self.assertEqual(duplicate.status_code, 400)
        self.assertFalse(PurchaseOrder.objects.exists())

    def test_view_only_member_cannot_create_or_receive(self):
        order = self.create_order()
        RoleAccess.objects.filter(organization=self.organization).update(permissions=["inventory.view"])
        self.assertEqual(self.client.get(self.url, **self.headers).status_code, 200)
        self.assertEqual(self.create_order().status_code, 403)
        receive_url = f"{self.url}{order.data['id']}/receive/"
        self.assertEqual(self.client.post(receive_url, {"items": [{"item_id": order.data["items"][0]["id"], "quantity": 1}]}, format="json", **self.headers).status_code, 403)

    def test_rejects_other_organizations_order(self):
        order = self.create_order()
        other_order = PurchaseOrder.objects.create(organization=self.other, supplier_name="Private")
        response = self.client.post(f"{self.url}{other_order.id}/receive/", {"items": [
            {"item_id": order.data["items"][0]["id"], "quantity": 1}
        ]}, format="json", **self.headers)
        self.assertEqual(response.status_code, 400)
