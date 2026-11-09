<div align="center">
  <img src="frontend/public/Bizflow_logo.png" alt="BizFlow logo" width="120" />
  <h1>BizFlow</h1>
  <p><strong>A workspace for inventory, sales, and customer operations.</strong></p>
  <p><a href="#what-it-includes">Features</a> · <a href="#run-locally">Get started</a> · <a href="#checks">Checks</a> · <a href="docs/database-erd.md">Database design</a></p>
</div>

BizFlow brings product catalogs, stock control, purchasing, orders, CRM, and reporting into one application. Each organization has its own data, members, roles, and permissions. The interface is built with Next.js; a Django REST API handles business rules and PostgreSQL storage.

## What it includes

| Area | Capabilities |
| --- | --- |
| Dashboard | Sales summary, trends, and top products |
| Inventory | Categories, products, bulk import, stock adjustments, movements, reorder levels, and purchase orders |
| Sales | Customer records, orders, order confirmation and cancellation, and PDF invoices |
| CRM | Leads, deals, activities, follow ups, and notifications |
| Administration | Organizations, members, role permissions, and audit logs |
| Access | Email/password and Google sign in, cookie based JWT sessions, and organization scoped permissions |

### Purchasing workflow

Products at or below their reorder level appear in the purchasing panel for members with `inventory.manage`. Creating a purchase order records the product cost at that time but does not change stock. Receiving all or part of an order increases stock and records a linked stock movement. Members with `inventory.view` can inspect purchase orders without receiving goods.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | Python 3.12, Django 6, Django REST Framework |
| Database | PostgreSQL |
| API documentation | OpenAPI via drf-spectacular |

## Run locally

**Prerequisites:** Python 3.12, Node.js 22, npm, and PostgreSQL. Create a PostgreSQL database and user matching the values in `backend/.env`.

1. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. Set the database credentials and a unique `DJANGO_SECRET_KEY`. Google client IDs are needed only for Google sign in.
2. Install dependencies and start the API:

   ```bash
   cd backend
   python -m venv .venv
   # Activate .venv using your shell, then:
   python -m pip install -r requirements.txt
   python manage.py migrate
   python manage.py runserver
   ```

3. In a second terminal, start the frontend:

   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

Open **http://localhost:3000** for the app. The API is at **http://localhost:8000/api/v1/**, with interactive documentation at **http://localhost:8000/api/v1/docs/**.

Keep the frontend and API on the same hostname during local development so cookie based authentication works. Organization data requests use the `X-Organization-ID` header.

## Project layout

```text
backend/                 Django API, domain apps, migrations, and tests
frontend/                Next.js application and API client
.github/workflows/ci.yml CI checks
docs/                    Architecture, API, and database notes
```

## Checks

The GitHub Actions CI workflow runs on pushes and pull requests. It checks Django against a PostgreSQL service, runs the Python test suite, then lints and builds the frontend.

```bash
# From backend/ with the database environment configured
python manage.py check
python -m pytest -q

# From frontend/
npm run lint
npm run build
```

## Roadmap

Planned additions include:

- A unified inbox to read and reply to Messenger, WhatsApp, and Instagram messages from one portal.
- Bulk messaging, Bulk email and bulk calling tools.
- Delivery details and tracking within the order workflow.

These features are planned and are not available in the current release.

## Contributing

Contributions are welcome. Feel free to open an issue to discuss an idea or submit a pull request with a clear description of the change. Please run the relevant backend tests and frontend lint and build checks before submitting.
