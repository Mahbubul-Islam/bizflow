from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient

from apps.inventory.models import Product, StockMovement
from apps.organizations.models import Membership, Organization, RoleAccess


class StockMovementHistoryTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="stock@example.com", password="StrongPassword123!"
        )
        self.organization = Organization.objects.create(name="Main", slug="main")
        self.other_organization = Organization.objects.create(name="Other", slug="other")
        Membership.objects.create(
            organization=self.organization, user=self.user, role=Membership.Role.STAFF
        )
        self.product = Product.objects.create(
            organization=self.organization, name="Widget", sku="W-1",
            cost_price="10.00", selling_price="15.00",
        )
        self.second_product = Product.objects.create(
            organization=self.organization, name="Gadget", sku="G-1",
            cost_price="20.00", selling_price="25.00",
        )
        other_product = Product.objects.create(
            organization=self.other_organization, name="Other", sku="O-1",
            cost_price="10.00", selling_price="15.00",
        )
        self.first = StockMovement.objects.create(
            organization=self.organization, product=self.product,
            quantity_before=0, quantity_delta=50, quantity_after=50,
            reason="Initial stock purchase", created_by=self.user,
        )
        StockMovement.objects.filter(id=self.first.id).update(
            created_at=timezone.now() - timedelta(days=1)
        )
        self.second = StockMovement.objects.create(
            organization=self.organization, product=self.second_product,
            quantity_before=0, quantity_delta=5, quantity_after=5,
            reason="Adjustment", created_by=self.user,
        )
        StockMovement.objects.create(
            organization=self.other_organization, product=other_product,
            quantity_before=0, quantity_delta=10, quantity_after=10,
            reason="Private movement", created_by=self.user,
        )
        self.client = APIClient(HTTP_HOST="localhost")
        self.client.force_authenticate(user=self.user)
        self.url = "/api/v1/inventory/movements/"
        self.headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}

    def test_lists_only_current_organization_movements(self):
        response = self.client.get(self.url, **self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertEqual(len(response.data["data"]), 2)
        self.assertEqual(response.data["data"][0]["id"], str(self.second.id))
        self.assertEqual(response.data["data"][1]["product_id"], str(self.product.id))
        self.assertEqual(response.data["data"][1]["reason"], "Initial stock purchase")

    def test_filters_by_product_id(self):
        response = self.client.get(
            self.url, {"product_id": str(self.product.id)}, **self.headers
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["data"][0]["id"], str(self.first.id))

    def test_rejects_invalid_product_id(self):
        response = self.client.get(self.url, {"product_id": "bad"}, **self.headers)

        self.assertEqual(response.status_code, 400)
        self.assertIn("product_id", response.data)

    def test_requires_inventory_view_access(self):
        RoleAccess.objects.create(
            organization=self.organization, role=Membership.Role.STAFF, permissions=[]
        )

        response = self.client.get(self.url, **self.headers)

        self.assertEqual(response.status_code, 403)
