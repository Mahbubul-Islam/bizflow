This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Backend API

The browser API client is in `src/lib/utils.ts`. It defaults to
`http://localhost:8000/api/v1/`. To use another backend, set
`NEXT_PUBLIC_API_BASE_URL` to its `/api/v1` URL before starting Next.js.
Keep the frontend and backend on the same hostname (for example, both on
`localhost`) so the cookie based login and CSRF flow work.

To enable Google sign-in, create a Google OAuth **Web application** client and
add the frontend origin (for local development, `http://localhost:3000`) to
Authorized JavaScript origins. Set its client ID as
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` in the frontend environment and
`GOOGLE_CLIENT_ID` in the backend environment, then restart both servers and
run Django migrations. Django uses django-allauth's Google provider to verify
the credential and store the social account. Google accounts use the verified email and Google
profile name; existing password accounts with the same email are not linked
automatically.

```tsx
import { authApi, productsApi } from "@/lib/utils";

const user = await authApi.me();
const organizationId = user.organizations[0].id;
const products = await productsApi.list(organizationId);
```

Use these helpers from client components. Authentication uses HttpOnly cookies;
the client sends credentials and gets a CSRF token before writes. Tenant data
requests require an organization ID. `authApi.login()` sets the cookies, but
registration does not log the user in. Money values are strings, and invoices
are returned as PDF blobs.

Organization owners can open `/admin` from the dashboard. The administrator
page uses the API to manage organization details, members, role permissions,
inventory, customers, and orders, and to review audit logs. Members must
register before an owner can add them. The backend enforces owner permissions
on member, role, and audit actions.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
