from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from django.core.files.uploadedfile import SimpleUploadedFile
import io
import zipfile

from apps.inventory.models import Category, Product, StockMovement
from apps.audit.models import AuditLog
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

    def test_manage_only_staff_can_read_and_edit_products(self):
        RoleAccess.objects.create(
            organization=self.organization, role=Membership.Role.STAFF,
            permissions=["inventory.manage"],
        )

        listed = self.client.get("/api/v1/products/", **self.headers)
        categories = self.client.get("/api/v1/categories/", **self.headers)
        updated = self.client.patch(
            f"/api/v1/products/{self.product.id}/",
            {"name": "Updated widget"}, format="json", **self.headers,
        )

        self.assertEqual(listed.status_code, 200)
        self.assertEqual(categories.status_code, 200)
        self.assertEqual(updated.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.name, "Updated widget")

    def test_updating_product_category_records_json_safe_audit(self):
        RoleAccess.objects.create(
            organization=self.organization, role=Membership.Role.STAFF,
            permissions=["inventory.manage"],
        )
        category = Category.objects.create(organization=self.organization, name="Stationery")
        response = self.client.patch(
            f"/api/v1/products/{self.product.id}/",
            {"category": str(category.id), "selling_price": "18.50"},
            format="json", **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.category, category)
        audit = AuditLog.objects.get(action="PRODUCT_UPDATED", entity_id=self.product.id)
        self.assertEqual(audit.changes["category"], {"old": None, "new": str(category.id)})
        self.assertEqual(audit.changes["selling_price"]["new"], "18.50")


class BulkProductImportTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email="import@example.com", password="StrongPassword123!")
        self.organization = Organization.objects.create(name="Import", slug="import")
        Membership.objects.create(organization=self.organization, user=self.user, role=Membership.Role.STAFF)
        RoleAccess.objects.create(organization=self.organization, role=Membership.Role.STAFF, permissions=["inventory.manage"])
        self.client = APIClient(HTTP_HOST="localhost")
        self.client.force_authenticate(user=self.user)
        self.headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}

    def upload(self, content):
        file = SimpleUploadedFile("products.csv", content.encode("utf-8"), content_type="text/csv")
        return self.client.post("/api/v1/products/import/", {"file": file}, format="multipart", **self.headers)

    def upload_xlsx(self, invalid=False, shared_strings=False):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>')
            archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>')
            quantity = "-1" if invalid else "12"
            if shared_strings:
                strings = ["name", "sku", "cost_price", "selling_price", "stock_quantity", "Excel widget", "X-1"]
                archive.writestr("xl/sharedStrings.xml", '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + "".join(f"<si><t>{value}</t></si>" for value in strings) + "</sst>")
                cell = lambda ref, index: f'<c r="{ref}" t="s"><v>{index}</v></c>'
                headers = "".join(cell(f"{column}1", index) for index, column in enumerate("ABCDE"))
                product_name, sku = cell("A2", 5), cell("B2", 6)
            else:
                headers = "".join(f'<c r="{column}1" t="inlineStr"><is><t>{value}</t></is></c>' for column, value in zip("ABCDE", ["name", "sku", "cost_price", "selling_price", "stock_quantity"]))
                product_name = '<c r="A2" t="inlineStr"><is><t>Excel widget</t></is></c>'
                sku = '<c r="B2" t="inlineStr"><is><t>X-1</t></is></c>'
            archive.writestr("xl/worksheets/sheet1.xml", f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">{headers}</row><row r="2">{product_name}{sku}<c r="C2"><v>10.00</v></c><c r="D2"><v>15.00</v></c><c r="E2"><v>{quantity}</v></c></row></sheetData></worksheet>')
        file = SimpleUploadedFile("products.xlsx", output.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        return self.client.post("/api/v1/products/import/", {"file": file}, format="multipart", **self.headers)

    def test_imports_products_and_opening_stock_movements(self):
        response = self.upload("name,sku,cost_price,selling_price,stock_quantity\nWidget,W-1,10.00,15.00,12\nGadget,G-1,20.00,25.00,0\n")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["created"], 2)
        product = Product.objects.get(organization=self.organization, sku="W-1")
        self.assertEqual(product.stock_quantity, 12)
        movement = StockMovement.objects.get(product=product)
        self.assertEqual((movement.quantity_before, movement.quantity_delta, movement.quantity_after), (0, 12, 12))
        self.assertFalse(StockMovement.objects.filter(product__sku="G-1").exists())

    def test_invalid_row_imports_nothing(self):
        response = self.upload("name,sku,cost_price,selling_price,stock_quantity\nWidget,W-1,10.00,15.00,12\nBad,B-1,10.00,15.00,-1\n")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Product.objects.filter(organization=self.organization).count(), 0)

    def test_rejects_existing_sku(self):
        Product.objects.create(organization=self.organization, name="Existing", sku="W-1", cost_price="1.00", selling_price="2.00")
        response = self.upload("name,sku,cost_price,selling_price,stock_quantity\nWidget,W-1,10.00,15.00,12\n")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Product.objects.filter(organization=self.organization).count(), 1)

    def test_requires_inventory_manage(self):
        RoleAccess.objects.filter(organization=self.organization, role=Membership.Role.STAFF).update(permissions=["inventory.view"])
        response = self.upload("name,sku,cost_price,selling_price,stock_quantity\nWidget,W-1,10.00,15.00,12\n")
        self.assertEqual(response.status_code, 403)

    def test_import_matches_existing_category_by_name(self):
        category = Category.objects.create(organization=self.organization, name="Stationery")
        response = self.upload("name,sku,cost_price,selling_price,stock_quantity,category\nNotebook,N-1,10.00,15.00,12,stationery\n")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Product.objects.get(sku="N-1").category, category)

    def test_unknown_category_imports_nothing(self):
        response = self.upload("name,sku,cost_price,selling_price,stock_quantity,category\nNotebook,N-1,10.00,15.00,12,Missing\n")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Product.objects.filter(organization=self.organization).exists())

    def test_imports_excel_workbook(self):
        response = self.upload_xlsx()
        self.assertEqual(response.status_code, 200)
        product = Product.objects.get(organization=self.organization, sku="X-1")
        self.assertEqual(product.stock_quantity, 12)
        self.assertTrue(StockMovement.objects.filter(product=product, quantity_delta=12).exists())

    def test_invalid_excel_row_imports_nothing(self):
        response = self.upload_xlsx(invalid=True)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Product.objects.filter(organization=self.organization).exists())

    def test_imports_excel_shared_strings(self):
        response = self.upload_xlsx(shared_strings=True)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Product.objects.get(sku="X-1").stock_quantity, 12)


class ProductCatalogPaginationTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email="catalog@example.com", password="StrongPassword123!")
        self.organization = Organization.objects.create(name="Catalog", slug="catalog")
        Membership.objects.create(organization=self.organization, user=self.user, role=Membership.Role.STAFF)
        RoleAccess.objects.create(organization=self.organization, role=Membership.Role.STAFF, permissions=["inventory.view"])
        self.client = APIClient(HTTP_HOST="localhost")
        self.client.force_authenticate(user=self.user)
        self.headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}
        for index in range(23):
            Product.objects.create(organization=self.organization, name=f"Widget {index:02}", sku=f"W-{index:02}", cost_price="1.00", selling_price="2.00")

    def test_pages_and_searches_within_organization(self):
        first = self.client.get("/api/v1/products/catalog/", **self.headers)
        second = self.client.get("/api/v1/products/catalog/?page=2", **self.headers)
        third = self.client.get("/api/v1/products/catalog/?page=3", **self.headers)
        searched = self.client.get("/api/v1/products/catalog/?search=W-22", **self.headers)
        self.assertEqual([len(first.data["results"]), len(second.data["results"]), len(third.data["results"])], [10, 10, 3])
        self.assertEqual(first.data["count"], 23)
        self.assertEqual(first.data["next"], 2)
        self.assertIsNone(third.data["next"])
        self.assertEqual([item["sku"] for item in searched.data["results"]], ["W-22"])

    def test_rejects_invalid_page(self):
        response = self.client.get("/api/v1/products/catalog/?page=4", **self.headers)
        self.assertEqual(response.status_code, 400)

    def test_filters_category_status_and_stock_before_pagination(self):
        category = Category.objects.create(organization=self.organization, name="Supplies")
        Product.objects.filter(organization=self.organization, sku="W-00").update(category=category, stock_quantity=0)
        Product.objects.filter(organization=self.organization, sku="W-01").update(category=category, stock_quantity=3)
        Product.objects.filter(organization=self.organization, sku="W-02").update(category=category, stock_quantity=9, is_active=False)

        low = self.client.get(f"/api/v1/products/catalog/?category={category.id}&status=active&stock=low", **self.headers)
        out = self.client.get(f"/api/v1/products/catalog/?category={category.id}&stock=out", **self.headers)
        inactive = self.client.get(f"/api/v1/products/catalog/?category={category.id}&status=inactive", **self.headers)
        uncategorized = self.client.get("/api/v1/products/catalog/?category=none", **self.headers)

        self.assertEqual([item["sku"] for item in low.data["results"]], ["W-01"])
        self.assertEqual([item["sku"] for item in out.data["results"]], ["W-00"])
        self.assertEqual([item["sku"] for item in inactive.data["results"]], ["W-02"])
        self.assertEqual(uncategorized.data["count"], 20)

    def test_sales_manager_can_search_products(self):
        RoleAccess.objects.filter(organization=self.organization, role=Membership.Role.STAFF).update(permissions=["sales.manage"])
        response = self.client.get("/api/v1/products/catalog/?search=W-22&active=true", **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["sku"] for item in response.data["results"]], ["W-22"])

    def test_does_not_include_other_organizations_products(self):
        other = Organization.objects.create(name="Other", slug="catalog-other")
        Product.objects.create(organization=other, name="Private", sku="SECRET", cost_price="1.00", selling_price="2.00")
        response = self.client.get("/api/v1/products/catalog/?search=SECRET", **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
