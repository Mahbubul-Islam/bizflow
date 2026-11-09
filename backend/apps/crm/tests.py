from datetime import timedelta
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from apps.customers.models import Customer
from apps.organizations.models import Membership, Organization, RoleAccess
from apps.sales.models import SalesOrder
from .models import AssignmentNotification, FollowUpTask, Lead


class CrmApiTest(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(email="owner@crm.test", password="secret")
        self.org = Organization.objects.create(name="CRM", slug="crm-test")
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.OWNER)
        self.other = Organization.objects.create(name="Other", slug="other-crm-test")
        self.client = APIClient(HTTP_HOST="localhost")
        self.client.force_authenticate(user=self.user)
        self.headers = {"HTTP_X_ORGANIZATION_ID": str(self.org.id)}

    def test_qualified_lead_converts_once_and_appears_in_summary(self):
        lead = self.client.post("/api/v1/leads/", {"name": "Asha", "email": "asha@example.com", "status": "QUALIFIED"}, **self.headers)
        self.assertEqual(lead.status_code, 201)
        url = f"/api/v1/leads/{lead.data['id']}/convert/"
        converted = self.client.post(url, {}, format="json", **self.headers)
        self.assertEqual(converted.status_code, 200)
        self.assertEqual(converted.data["status"], "CONVERTED")
        self.assertEqual(Customer.objects.filter(organization=self.org).count(), 1)
        self.assertEqual(self.client.post(url, {}, format="json", **self.headers).status_code, 400)
        summary = self.client.get("/api/v1/crm/summary/", **self.headers).data
        self.assertEqual(summary["conversion_rate"], 100)

    def test_cross_organization_links_are_rejected(self):
        customer = Customer.objects.create(organization=self.other, name="Outside")
        response = self.client.post("/api/v1/deals/", {"title": "Wrong", "customer": str(customer.id), "value": "25.00"}, **self.headers)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.post("/api/v1/follow-ups/", {"title": "Call", "customer": str(customer.id), "assigned_to": str(self.user.id), "due_at": timezone.now().isoformat()}, **self.headers).status_code, 400)

    def test_overdue_tasks_and_manage_permission(self):
        lead = Lead.objects.create(organization=self.org, name="Asha")
        response = self.client.post("/api/v1/follow-ups/", {"title": "Call", "lead": str(lead.id), "assigned_to": str(self.user.id), "due_at": (timezone.now() - timedelta(days=1)).isoformat()}, **self.headers)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.get("/api/v1/crm/summary/", **self.headers).data["overdue_follow_ups"], 1)
        self.assertEqual(self.client.post(f"/api/v1/follow-ups/{response.data['id']}/complete/", **self.headers).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/crm/summary/", **self.headers).data["overdue_follow_ups"], 0)
        RoleAccess.objects.create(organization=self.org, role=Membership.Role.STAFF, permissions=["crm.view"])
        Membership.objects.filter(user=self.user, organization=self.org).update(role=Membership.Role.STAFF)
        self.assertEqual(self.client.get("/api/v1/leads/", **self.headers).status_code, 200)
        self.assertEqual(self.client.post("/api/v1/leads/", {"name": "Blocked"}, **self.headers).status_code, 403)

    def test_page_workflow_creates_and_updates_every_resource(self):
        lead_response = self.client.post("/api/v1/leads/", {"name": "Asha", "email": "asha@example.com", "phone": "123", "source": "Referral", "assigned_to": ""}, **self.headers)
        self.assertEqual(lead_response.status_code, 201, lead_response.data)
        lead_id = lead_response.data["id"]
        deal_response = self.client.post("/api/v1/deals/", {"title": "Initial sale", "value": "100.00", "lead": str(lead_id), "customer": None}, format="json", **self.headers)
        self.assertEqual(deal_response.status_code, 201, deal_response.data)
        task_response = self.client.post("/api/v1/follow-ups/", {"title": "Call", "due_at": timezone.now().isoformat(), "assigned_to": str(self.user.id), "lead": str(lead_id), "customer": None}, format="json", **self.headers)
        self.assertEqual(task_response.status_code, 201, task_response.data)
        activity_response = self.client.post("/api/v1/activities/", {"kind": "CALL", "description": "Spoke", "occurred_at": timezone.now().isoformat(), "lead": str(lead_id), "customer": None}, format="json", **self.headers)
        self.assertEqual(activity_response.status_code, 201, activity_response.data)
        self.assertEqual(activity_response.data["subject_name"], "Asha")
        self.assertEqual(self.client.patch(f"/api/v1/leads/{lead_id}/", {"status": "QUALIFIED"}, format="json", **self.headers).status_code, 200)
        converted = self.client.post(f"/api/v1/leads/{lead_id}/convert/", {}, format="json", **self.headers)
        self.assertEqual(converted.status_code, 200, converted.data)
        won = self.client.patch(f"/api/v1/deals/{deal_response.data['id']}/", {"stage": "WON"}, format="json", **self.headers)
        self.assertEqual(won.status_code, 200, won.data)
        self.assertEqual(str(won.data["customer"]), str(converted.data["customer"]))
        for path in ("leads/", "deals/", "follow-ups/", "activities/"):
            response = self.client.get(f"/api/v1/{path}", **self.headers)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(len(response.data), 1)

    def test_deal_moves_through_pipeline_and_updates_value(self):
        lead = Lead.objects.create(organization=self.org, name="Asha")
        response = self.client.post("/api/v1/deals/", {"title": "Office supplies", "lead": str(lead.id), "customer": None, "value": "125.00"}, format="json", **self.headers)
        self.assertEqual(response.status_code, 201, response.data)
        deal_url = f"/api/v1/deals/{response.data['id']}/"
        self.assertEqual(self.client.get("/api/v1/crm/summary/", **self.headers).data["pipeline_value"], "125.00")
        for stage in ("CONTACTED", "PROPOSAL", "WON", "LOST"):
            moved = self.client.patch(deal_url, {"stage": stage}, format="json", **self.headers)
            self.assertEqual(moved.status_code, 200, moved.data)
            self.assertEqual(moved.data["stage"], stage)
            self.assertEqual(self.client.get(deal_url, **self.headers).data["stage"], stage)
        self.assertEqual(self.client.get("/api/v1/crm/summary/", **self.headers).data["pipeline_value"], "0")

    def test_reopening_won_deal_unlinks_sales_order(self):
        customer = Customer.objects.create(organization=self.org, name="Asha")
        order = SalesOrder.objects.create(organization=self.org, customer=customer, order_number="BF-1", created_by=self.user)
        created = self.client.post("/api/v1/deals/", {"title": "Office supplies", "customer": str(customer.id), "stage": "WON", "value": "125.00", "sales_order": str(order.id)}, format="json", **self.headers)
        self.assertEqual(created.status_code, 201, created.data)
        moved = self.client.patch(f"/api/v1/deals/{created.data['id']}/", {"stage": "PROPOSAL"}, format="json", **self.headers)
        self.assertEqual(moved.status_code, 200, moved.data)
        self.assertIsNone(moved.data["sales_order"])

    def test_assignee_receives_notification_and_can_resolve_without_crm_manage(self):
        User = get_user_model()
        assignee = User.objects.create_user(email="assignee@crm.test", password="secret")
        outsider = User.objects.create_user(email="outsider@crm.test", password="secret")
        Membership.objects.create(user=assignee, organization=self.org, role=Membership.Role.STAFF)
        Membership.objects.create(user=outsider, organization=self.org, role=Membership.Role.STAFF)
        RoleAccess.objects.create(organization=self.org, role=Membership.Role.STAFF, permissions=[])
        lead = Lead.objects.create(organization=self.org, name="Asha")
        created = self.client.post("/api/v1/follow-ups/", {"title": "Call Asha", "lead": str(lead.id), "assigned_to": str(assignee.id), "due_at": timezone.now().isoformat()}, format="json", **self.headers)
        self.assertEqual(created.status_code, 201, created.data)
        notification = AssignmentNotification.objects.get(task_id=created.data["id"])
        self.assertEqual(notification.recipient_id, assignee.id)
        self.client.force_authenticate(user=outsider)
        self.assertEqual(self.client.get("/api/v1/crm/my-follow-ups/", **self.headers).data["tasks"], [])
        self.assertEqual(self.client.post(f"/api/v1/crm/my-follow-ups/{created.data['id']}/complete/", **self.headers).status_code, 404)
        self.client.force_authenticate(user=assignee)
        mine = self.client.get("/api/v1/crm/my-follow-ups/", **self.headers)
        self.assertEqual(len(mine.data["notifications"]), 1)
        self.assertEqual(len(mine.data["tasks"]), 1)
        self.assertEqual(mine.data["tasks"][0]["contact"]["name"], "Asha")
        self.assertEqual(self.client.post(f"/api/v1/crm/my-follow-ups/{created.data['id']}/complete/", **self.headers).status_code, 200)
        self.assertFalse(self.client.get("/api/v1/crm/my-follow-ups/", **self.headers).data["tasks"])
        self.assertFalse(self.client.get("/api/v1/crm/my-follow-ups/", **self.headers).data["notifications"])

    def test_assignee_can_see_customer_contact_for_their_task_only(self):
        User = get_user_model()
        assignee = User.objects.create_user(email="customer-assignee@crm.test", password="secret")
        Membership.objects.create(user=assignee, organization=self.org, role=Membership.Role.STAFF)
        RoleAccess.objects.create(organization=self.org, role=Membership.Role.STAFF, permissions=[])
        customer = Customer.objects.create(organization=self.org, name="Nadia", email="nadia@example.com", phone="12345", address="Dhaka")
        FollowUpTask.objects.create(organization=self.org, customer=customer, title="Call Nadia", assigned_to=assignee, due_at=timezone.now())
        self.client.force_authenticate(user=assignee)
        response = self.client.get("/api/v1/crm/my-follow-ups/", **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["tasks"][0]["contact"], {"name": "Nadia", "email": "nadia@example.com", "phone": "12345", "address": "Dhaka"})
        self.assertEqual(self.client.get(f"/api/v1/customers/{customer.id}/", **self.headers).status_code, 403)

    def test_reassignment_notifies_new_assignee(self):
        User = get_user_model()
        new_assignee = User.objects.create_user(email="new-assignee@crm.test", password="secret")
        Membership.objects.create(user=new_assignee, organization=self.org, role=Membership.Role.STAFF)
        lead = Lead.objects.create(organization=self.org, name="Asha")
        task = FollowUpTask.objects.create(organization=self.org, lead=lead, title="Call", assigned_to=self.user, due_at=timezone.now())
        response = self.client.patch(f"/api/v1/follow-ups/{task.id}/", {"assigned_to": str(new_assignee.id)}, format="json", **self.headers)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(AssignmentNotification.objects.filter(task=task, recipient=new_assignee).exists())

    def test_assigned_lead_can_be_updated_without_crm_manage(self):
        User = get_user_model()
        assignee = User.objects.create_user(email="lead-assignee@crm.test", password="secret")
        Membership.objects.create(user=assignee, organization=self.org, role=Membership.Role.STAFF)
        RoleAccess.objects.create(organization=self.org, role=Membership.Role.STAFF, permissions=[])
        created = self.client.post("/api/v1/leads/", {"name": "Asha", "assigned_to": str(assignee.id)}, format="json", **self.headers)
        self.assertEqual(created.status_code, 201, created.data)
        lead_id = created.data["id"]
        self.client.force_authenticate(user=assignee)
        mine = self.client.get("/api/v1/crm/my-follow-ups/", **self.headers).data
        self.assertEqual(len(mine["leads"]), 1)
        self.assertEqual(len(mine["notifications"]), 1)
        response = self.client.patch(f"/api/v1/crm/my-leads/{lead_id}/status/", {"status": "CONTACTED"}, format="json", **self.headers)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "CONTACTED")
        self.assertEqual(self.client.patch(f"/api/v1/leads/{lead_id}/", {"status": "QUALIFIED"}, format="json", **self.headers).status_code, 403)
