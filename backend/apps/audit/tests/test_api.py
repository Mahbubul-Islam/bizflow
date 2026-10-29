from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.inventory.models import Product
from apps.organizations.models import Membership, Organization


class AuditLogAPITest(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(email="owner@audit.test", password="StrongPassword123!")
        self.manager = User.objects.create_user(email="manager@audit.test", password="StrongPassword123!")
        self.organization = Organization.objects.create(name="Audit", slug="audit-shop")
        self.other = Organization.objects.create(name="Other", slug="audit-other")
        Membership.objects.create(
            user=self.owner, organization=self.organization, role=Membership.Role.OWNER
        )
        Membership.objects.create(
            user=self.manager, organization=self.organization, role=Membership.Role.MANAGER
        )
        self.product = Product.objects.create(
            organization=self.organization, name="Mouse", sku="M-1",
            cost_price="300.00", selling_price="650.00",
        )
        AuditLog.objects.create(
            organization=self.other, actor=self.owner,
            action="PRODUCT_UPDATED", entity_type="Product", entity_id=self.product.id,
            changes={"name": {"old": "Hidden", "new": "Private"}},
        )
        self.client = APIClient(HTTP_HOST="localhost")
        self.headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}

    def test_product_update_creates_owner_visible_scoped_log(self):
        self.client.force_authenticate(user=self.owner)
        updated = self.client.patch(
            f"/api/v1/products/{self.product.id}/",
            {"selling_price": "700.00"}, format="json", **self.headers,
        )
        self.assertEqual(updated.status_code, 200)

        response = self.client.get("/api/v1/audit-logs/", **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["data"]), 1)
        log = response.data["data"][0]
        self.assertEqual(log["action"], "PRODUCT_UPDATED")
        self.assertEqual(log["entity_type"], "Product")
        self.assertEqual(log["changes"]["selling_price"], {
            "old": "650.00", "new": "700.00",
        })

    def test_manager_cannot_view_audit_logs(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.get("/api/v1/audit-logs/", **self.headers)
        self.assertEqual(response.status_code, 403)
