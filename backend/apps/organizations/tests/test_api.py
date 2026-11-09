from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.organizations.models import Membership, Organization, RoleAccess


class OrganizationEndpointTest(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(email="owner@example.com", password="Pass12345!")
        self.manager = User.objects.create_user(email="manager@example.com", password="Pass12345!")
        self.staff = User.objects.create_user(email="staff@example.com", password="Pass12345!")
        self.other = User.objects.create_user(email="other@example.com", password="Pass12345!")
        self.organization = Organization.objects.create(name="Acme", slug="acme")
        self.owner_member = Membership.objects.create(
            organization=self.organization, user=self.owner, role=Membership.Role.OWNER
        )
        Membership.objects.create(
            organization=self.organization, user=self.manager, role=Membership.Role.MANAGER
        )
        self.staff_member = Membership.objects.create(
            organization=self.organization, user=self.staff, role=Membership.Role.STAFF
        )
        self.client = APIClient(HTTP_HOST="localhost")
        self.detail_url = f"/api/v1/organizations/{self.organization.id}/"
        self.members_url = f"{self.detail_url}members/"

    def as_user(self, user):
        self.client.force_authenticate(user=user)

    def test_member_can_read_details_and_members(self):
        self.as_user(self.staff)
        self.assertEqual(self.client.get(self.detail_url).data["name"], "Acme")
        self.assertEqual(len(self.client.get(self.members_url).data), 3)

    def test_member_list_includes_profile_photo(self):
        self.manager.avatar_data = b"photo-bytes"
        self.manager.avatar_content_type = "image/png"
        self.manager.save(update_fields=["avatar_data", "avatar_content_type"])
        self.as_user(self.staff)
        members = self.client.get(self.members_url).data
        manager = next(member for member in members if member["user"] == self.manager.id)
        self.assertEqual(manager["avatar_url"], "data:image/png;base64,cGhvdG8tYnl0ZXM=")
        owner = next(member for member in members if member["user"] == self.owner.id)
        self.assertIsNone(owner["avatar_url"])

    def test_update_permission_also_allows_reading_organization(self):
        RoleAccess.objects.create(organization=self.organization, role=Membership.Role.STAFF,
                                  permissions=["organizations.update"])
        self.as_user(self.staff)
        self.assertEqual(self.client.get(self.detail_url).status_code, 200)
        self.assertEqual(self.client.patch(self.detail_url, {"name": "Updated"}).status_code, 200)

    def test_customer_manage_permission_allows_reading_customers(self):
        RoleAccess.objects.create(organization=self.organization, role=Membership.Role.STAFF,
                                  permissions=["customers.manage"])
        self.as_user(self.staff)
        headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}
        self.assertEqual(self.client.get("/api/v1/customers/", **headers).status_code, 200)
        self.assertEqual(self.client.post("/api/v1/customers/", {"name": "Customer"}, **headers).status_code, 201)

    def test_nonmember_cannot_read_organization(self):
        self.as_user(self.other)
        self.assertEqual(self.client.get(self.detail_url).status_code, 403)
        self.assertEqual(self.client.get(self.members_url).status_code, 403)

    def test_manager_can_update_organization_but_staff_cannot(self):
        self.as_user(self.staff)
        self.assertEqual(
            self.client.patch(self.detail_url, {"name": "Changed"}).status_code, 403
        )
        self.as_user(self.manager)
        response = self.client.patch(self.detail_url, {"name": "Changed"})
        self.organization.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.organization.name, "Changed")

    def test_owner_can_add_change_and_remove_member(self):
        self.as_user(self.owner)
        response = self.client.post(
            self.members_url, {"email": self.other.email, "role": "STAFF"}
        )
        self.assertEqual(response.status_code, 201)
        member_id = response.data["id"]
        member_url = f"{self.members_url}{member_id}/"
        self.assertEqual(
            self.client.patch(member_url, {"role": "MANAGER"}).data["role"],
            "MANAGER",
        )
        self.assertEqual(self.client.delete(member_url).status_code, 204)
        self.assertFalse(Membership.objects.get(id=member_id).is_active)

    def test_owner_can_search_available_users_by_email_or_username(self):
        self.other.first_name = "Amina"
        self.other.save()
        self.as_user(self.owner)
        search_url = f"{self.members_url}search/"
        self.assertEqual(self.client.get(search_url, {"q": "oth"}).data[0]["email"], self.other.email)
        self.assertEqual(self.client.get(search_url, {"q": "ami"}).data[0]["username"], "Amina")
        self.assertEqual(self.client.get(search_url, {"q": "example"}).data, [
            {"email": self.other.email, "username": "Amina", "first_name": "Amina", "last_name": ""}
        ])
        self.assertEqual(self.client.get(search_url, {"q": "a"}).data, [])

    def test_search_excludes_inactive_users_and_requires_owner(self):
        search_url = f"{self.members_url}search/"
        self.other.is_active = False
        self.other.save(update_fields=["is_active"])
        self.as_user(self.owner)
        self.assertEqual(self.client.get(search_url, {"q": "other"}).data, [])
        self.as_user(self.manager)
        self.assertEqual(self.client.get(search_url, {"q": "other"}).status_code, 403)
        self.as_user(self.other)
        self.assertEqual(self.client.get(search_url, {"q": "other"}).status_code, 403)

    def test_manager_cannot_change_members(self):
        self.as_user(self.manager)
        self.assertEqual(
            self.client.post(self.members_url, {"email": self.other.email}).status_code,
            403,
        )
        self.assertEqual(
            self.client.patch(
                f"{self.members_url}{self.staff_member.id}/", {"role": "OWNER"}
            ).status_code,
            403,
        )

    def test_last_owner_cannot_be_removed_or_demoted(self):
        self.as_user(self.owner)
        owner_url = f"{self.members_url}{self.owner_member.id}/"
        self.assertEqual(self.client.delete(owner_url).status_code, 400)
        self.assertEqual(
            self.client.patch(owner_url, {"role": "STAFF"}).status_code, 400
        )

    def test_duplicate_member_and_reactivation(self):
        self.as_user(self.owner)
        self.assertEqual(
            self.client.post(self.members_url, {"email": self.staff.email}).status_code,
            400,
        )
        self.client.delete(f"{self.members_url}{self.staff_member.id}/")
        response = self.client.post(self.members_url, {"email": self.staff.email})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["id"], str(self.staff_member.id))

    def test_owner_can_configure_staff_access_and_it_is_enforced(self):
        roles_url = f"{self.detail_url}roles/permissions/"
        staff_url = f"{self.detail_url}roles/STAFF/permissions/"
        self.as_user(self.owner)
        catalog = self.client.get(roles_url)
        self.assertIn("inventory.view", catalog.data["available_permissions"])
        response = self.client.patch(
            staff_url,
            {"permissions": ["organizations.view", "customers.view"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.as_user(self.staff)
        headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}
        self.assertEqual(self.client.get(self.detail_url).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/customers/", **headers).status_code, 200)
        self.assertEqual(self.client.get(self.members_url).status_code, 403)
        self.assertEqual(self.client.get("/api/v1/products/", **headers).status_code, 403)
        self.assertEqual(self.client.post("/api/v1/customers/", {}, **headers).status_code, 403)

    def test_owner_can_override_one_members_access_and_restore_role_defaults(self):
        access_url = f"{self.members_url}{self.staff_member.id}/permissions/"
        headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}
        self.as_user(self.owner)
        response = self.client.patch(
            access_url, {"permissions": ["customers.view"]}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["effective_permissions"], ["customers.view"])
        self.assertEqual(response.data["permissions_override"], ["customers.view"])

        self.as_user(self.staff)
        self.assertEqual(self.client.get("/api/v1/customers/", **headers).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/products/", **headers).status_code, 403)
        self.as_user(self.manager)
        self.assertEqual(self.client.get("/api/v1/products/", **headers).status_code, 200)

        self.as_user(self.owner)
        response = self.client.patch(access_url, {"permissions": None}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["permissions_override"])
        self.assertIn("inventory.view", response.data["effective_permissions"])

    def test_member_override_requires_owner_and_cannot_change_owner_access(self):
        access_url = f"{self.members_url}{self.staff_member.id}/permissions/"
        self.as_user(self.manager)
        self.assertEqual(self.client.patch(access_url, {"permissions": []}, format="json").status_code, 403)
        self.as_user(self.owner)
        owner_url = f"{self.members_url}{self.owner_member.id}/permissions/"
        self.assertEqual(self.client.patch(owner_url, {"permissions": []}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(access_url, {"permissions": ["invalid"]}, format="json").status_code, 400)

    def test_nonowner_cannot_configure_access_or_change_owner_access(self):
        staff_url = f"{self.detail_url}roles/STAFF/permissions/"
        self.as_user(self.manager)
        self.assertEqual(
            self.client.patch(staff_url, {"permissions": []}, format="json").status_code,
            403,
        )
        self.as_user(self.owner)
        owner_url = f"{self.detail_url}roles/OWNER/permissions/"
        self.assertEqual(
            self.client.patch(owner_url, {"permissions": []}, format="json").status_code,
            400,
        )
        self.assertFalse(RoleAccess.objects.filter(organization=self.organization).exists())

    def test_access_configuration_is_scoped_to_organization(self):
        second = Organization.objects.create(name="Other", slug="other")
        Membership.objects.create(
            organization=second, user=self.owner, role=Membership.Role.OWNER
        )
        Membership.objects.create(
            organization=second, user=self.staff, role=Membership.Role.STAFF
        )
        self.as_user(self.owner)
        self.client.patch(
            f"{self.detail_url}roles/STAFF/permissions/",
            {"permissions": []},
            format="json",
        )
        self.as_user(self.staff)
        self.assertEqual(
            self.client.get(
                "/api/v1/products/", HTTP_X_ORGANIZATION_ID=str(second.id)
            ).status_code,
            200,
        )
