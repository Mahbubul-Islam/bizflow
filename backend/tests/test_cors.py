from django.test import SimpleTestCase


class OrganizationHeaderCORSTest(SimpleTestCase):
    def test_browser_preflight_allows_organization_header(self):
        response = self.client.options(
            "/api/v1/products/",
            HTTP_ORIGIN="http://localhost:3000",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="x-organization-id",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response["Access-Control-Allow-Origin"], "http://localhost:3000"
        )
        self.assertIn(
            "x-organization-id", response["Access-Control-Allow-Headers"].lower()
        )
