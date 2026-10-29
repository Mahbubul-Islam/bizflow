from django.test import SimpleTestCase, TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from unittest.mock import patch
from types import SimpleNamespace
from apps.organizations.models import Membership, Organization


class RegisterCSRFTest(SimpleTestCase):
    def test_registration_reaches_validation_without_csrf_cookie(self):
        client = APIClient(enforce_csrf_checks=True, HTTP_HOST="localhost")

        response = client.post("/api/v1/auth/register/", {}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)


class LoginCSRFTest(SimpleTestCase):
    def test_login_reaches_validation_without_csrf_cookie(self):
        client = APIClient(enforce_csrf_checks=True, HTTP_HOST="localhost")

        with patch("apps.accounts.views.authenticate", return_value=None):
            response = client.post("/api/v1/auth/login/", {}, format="json")

        self.assertEqual(response.status_code, 401)


class RefreshCSRFTest(SimpleTestCase):
    def test_refresh_reaches_token_validation_without_csrf_header(self):
        client = APIClient(enforce_csrf_checks=True, HTTP_HOST="localhost")
        client.cookies["bizflow_refresh"] = "invalid-token"
        refresh_response = client.post(
            "/api/v1/auth/refresh/", {}, format="json"
        )

        self.assertEqual(refresh_response.data["detail"], "Invalid refresh token.")

    def test_login_cookie_is_sent_to_refresh_route(self):
        client = APIClient(enforce_csrf_checks=True, HTTP_HOST="localhost")
        user = SimpleNamespace(
            id="00000000-0000-0000-0000-000000000001",
            email="user@example.com",
            first_name="User",
            last_name="Example",
            phone="",
            username="User",
        )
        issued_token = SimpleNamespace(access_token="access-token")

        with patch("apps.accounts.views.authenticate", return_value=user), patch(
            "apps.accounts.views.RefreshToken.for_user", return_value=issued_token
        ):
            login_response = client.post(
                "/api/v1/auth/login/",
                {"email": user.email, "password": "password"},
                format="json",
            )

        refresh_response = client.post("/api/v1/auth/refresh/", {}, format="json")

        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(client.cookies["bizflow_refresh"].value, str(issued_token))
        self.assertEqual(refresh_response.data["detail"], "Invalid refresh token.")


class LogoutTest(SimpleTestCase):
    def test_logout_without_csrf_clears_auth_cookies(self):
        client = APIClient(enforce_csrf_checks=True, HTTP_HOST="localhost")

        response = client.post("/api/v1/auth/logout/", {}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Logged out successfully")
        self.assertEqual(response.cookies["bizflow_access"].value, "")
        self.assertEqual(response.cookies["bizflow_refresh"].value, "")


class ChangePasswordTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="change@example.com",
            password="OldPassword123!",
            first_name="Change",
        )
        self.client = APIClient(enforce_csrf_checks=True, HTTP_HOST="localhost")
        self.refresh_token = RefreshToken.for_user(self.user)
        self.access_token = str(self.refresh_token.access_token)
        self.client.cookies["bizflow_access"] = self.access_token
        csrf_response = self.client.get("/api/v1/auth/csrf/")
        self.csrf_token = csrf_response.data["csrfToken"]

    def post_change(self, **overrides):
        body = {
            "old_password": "OldPassword123!",
            "new_password": "NewStrongPassword123!",
            "new_password_confirm": "NewStrongPassword123!",
        }
        body.update(overrides)
        return self.client.post(
            "/api/v1/auth/password/change/",
            body,
            format="json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )

    def test_changes_password_and_revokes_old_access_token(self):
        response = self.post_change()

        self.user.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.user.check_password("NewStrongPassword123!"))
        self.assertFalse(self.user.check_password("OldPassword123!"))
        self.assertEqual(response.cookies["bizflow_access"].value, "")
        self.client.cookies["bizflow_access"] = self.access_token
        self.assertNotEqual(self.client.get("/api/v1/auth/me/").status_code, 200)
        self.client.cookies["bizflow_refresh"] = str(self.refresh_token)
        refresh_response = self.client.post(
            "/api/v1/auth/refresh/", {}, format="json"
        )
        self.assertEqual(refresh_response.data["detail"], "Refresh token revoked.")

    def test_rejects_wrong_old_password(self):
        response = self.post_change(old_password="WrongPassword123!")

        self.assertEqual(response.status_code, 400)
        self.assertIn("old_password", response.data)

    def test_rejects_mismatched_confirmation(self):
        response = self.post_change(new_password_confirm="DifferentPassword123!")

        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password_confirm", response.data)


class MeRoleTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="member@example.com", password="StrongPassword123!"
        )
        self.client = APIClient(HTTP_HOST="localhost")
        self.client.force_authenticate(user=self.user)
        self.organization = Organization.objects.create(name="First", slug="first")
        Membership.objects.create(
            user=self.user, organization=self.organization, role=Membership.Role.OWNER
        )

    def test_single_membership_exposes_role(self):
        response = self.client.get("/api/v1/auth/me/")

        self.assertEqual(response.data["data"]["role"], "OWNER")
        self.assertEqual(response.data["data"]["organizations"][0]["role"], "OWNER")

    def test_header_selects_role_when_user_has_multiple_organizations(self):
        second = Organization.objects.create(name="Second", slug="second")
        Membership.objects.create(
            user=self.user, organization=second, role=Membership.Role.STAFF
        )

        response = self.client.get("/api/v1/auth/me/")
        selected = self.client.get(
            "/api/v1/auth/me/", HTTP_X_ORGANIZATION_ID=str(second.id)
        )

        self.assertIsNone(response.data["data"]["role"])
        self.assertEqual(len(response.data["data"]["organizations"]), 2)
        self.assertEqual(selected.data["data"]["role"], "STAFF")
