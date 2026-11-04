"use client";

import Link from "next/link";
import axios from "axios";
import { useEffect, useState } from "react";
import { ArrowLeft, Boxes, Building2, ClipboardList, History, LockKeyhole, Package, ShieldCheck, ShoppingBag, Users } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AppSelect } from "@/components/forms/app-select";
import { FeedbackDialog } from "@/components/feedback/modal-feedback";
import { apiErrorMessage, auditApi, authApi, categoriesApi, customersApi, inventoryApi, ordersApi, organizationsApi, productsApi, type CurrentUser } from "@/lib/utils";
import { AuditSection, CustomersSection, InventorySection, MembersSection, OrdersSection, OrganizationSection, PermissionsSection } from "./sections";
import type { AdminAction, AdminData } from "./admin-types";

type Section = "Organization" | "Members" | "Permissions" | "Inventory" | "Customers" | "Orders" | "Audit";
const sections: { name: Section; icon: typeof Building2 }[] = [
  { name: "Organization", icon: Building2 },
  { name: "Members", icon: Users },
  { name: "Permissions", icon: LockKeyhole },
  { name: "Inventory", icon: Package },
  { name: "Customers", icon: ClipboardList },
  { name: "Orders", icon: ShoppingBag },
  { name: "Audit", icon: History },
];

export function AdminPanel() {
  const [user, setUser] = useState<CurrentUser>();
  const [organizationId, setOrganizationId] = useState("");
  const [section, setSection] = useState<Section>("Organization");
  const [data, setData] = useState<AdminData>();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void authApi.me().then((current) => {
      setUser(current);
      const owned = current.organizations.filter((item) => item.role === "OWNER");
      const requested = new URLSearchParams(window.location.search).get("organization");
      setOrganizationId(owned.find((item) => item.id === requested)?.id ?? owned[0]?.id ?? "");
    }).catch((cause) => {
      if (!axios.isAxiosError(cause) || cause.response?.status !== 401) setError(apiErrorMessage(cause));
    }).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    void Promise.all([
      organizationsApi.get(organizationId),
      organizationsApi.members(organizationId),
      organizationsApi.rolePermissions(organizationId),
      categoriesApi.list(organizationId),
      productsApi.list(organizationId),
      inventoryApi.movements(organizationId),
      customersApi.list(organizationId),
      ordersApi.list(organizationId),
      auditApi.list(organizationId),
    ]).then(([organization, members, permissions, categories, products, movements, customers, orders, audit]) => {
      if (!active) return;
      setData({ organization, members, permissions, categories, products, movements, customers, orders, audit });
      setError(undefined);
    }).catch((cause) => {
      if (active) {
        setNotice(undefined);
        setError(apiErrorMessage(cause));
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [organizationId, reloadKey]);

  const action: AdminAction = async (label, operation) => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await operation();
      setNotice(`${label} completed.`);
      setLoading(true);
      setReloadKey((value) => value + 1);
      return true;
    } catch (cause) {
      setError(apiErrorMessage(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const ownerOrganizations = user?.organizations.filter((item) => item.role === "OWNER") ?? [];
  const selected = ownerOrganizations.find((item) => item.id === organizationId);

  return <div className="min-h-screen bg-[#f7f9f8] text-foreground dark:bg-background">
    <FeedbackDialog open={!!error} title="Action could not be completed" message={error} onClose={() => setError(undefined)} action={organizationId ? { label: "Reload data", onClick: () => { setError(undefined); setLoading(true); setReloadKey((value) => value + 1); } } : undefined} />
    <FeedbackDialog open={!!notice} title="Done" message={notice} kind="success" onClose={() => setNotice(undefined)} />
    <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur"><div className="mx-auto flex h-18 max-w-[1450px] items-center justify-between gap-4 px-5 sm:px-8"><div className="flex items-center gap-3"><Link href="/" aria-label="BizFlow dashboard"><BrandLogo className="h-12 w-24" /></Link><div><p className="text-sm font-semibold">Administrator</p><p className="text-xs text-muted-foreground">{selected?.name ?? "BizFlow"}</p></div></div><div className="flex items-center gap-3">{ownerOrganizations.length > 1 && <AppSelect ariaLabel="Administer organization" value={organizationId} onValueChange={(next) => { setData(undefined); setLoading(true); setOrganizationId(next); }} options={ownerOrganizations.map((item) => ({ value: item.id, label: item.name }))} placeholder="Select organization" className="w-40 sm:w-64" />}<ThemeToggle /><Link href="/" className="hidden items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"><ArrowLeft className="size-4" /> Dashboard</Link></div></div></header>
    <main className="mx-auto max-w-[1450px] px-5 py-8 sm:px-8 lg:py-10"><div className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary"><ShieldCheck className="size-3" /> OWNER ACCESS</Badge><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Administrator</h1><p className="mt-2 text-sm text-muted-foreground">Manage your organization, people, products, customers, and sales.</p></div>{data && <div className="flex flex-wrap gap-2"><Badge variant="secondary"><Users className="size-3" /> {data.members.length} members</Badge><Badge variant="secondary"><Boxes className="size-3" /> {data.products.length} products</Badge></div>}</div>
      {checking || loading ? <div className="grid gap-5 lg:grid-cols-[220px_1fr]"><Skeleton className="h-96 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div> : !user ? <div className="rounded-2xl border border-border bg-card p-8"><h2 className="text-xl font-semibold">Sign in to continue</h2><p className="mt-2 text-sm text-muted-foreground">Administrator tools require an owner account.</p><Button render={<Link href="/login" />} nativeButton={false} className="mt-5">Log in</Button></div> : !organizationId ? <div className="rounded-2xl border border-border bg-card p-8"><h2 className="text-xl font-semibold">Owner access required</h2><p className="mt-2 text-sm text-muted-foreground">This account does not own an organization.</p><Button render={<Link href="/" />} nativeButton={false} variant="outline" className="mt-5">Back to dashboard</Button></div> : data ? <div className="grid items-start gap-7 lg:grid-cols-[220px_minmax(0,1fr)]"><nav aria-label="Administrator sections" className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-2 lg:flex-col">{sections.map(({ name, icon: Icon }) => <button key={name} type="button" onClick={() => { setSection(name); setError(undefined); setNotice(undefined); }} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${section === name ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="size-4" />{name}</button>)}</nav><div className="min-w-0 space-y-6">{section === "Organization" && <OrganizationSection data={data} orgId={organizationId} action={action} busy={busy} />}{section === "Members" && <MembersSection data={data} orgId={organizationId} action={action} busy={busy} />}{section === "Permissions" && <PermissionsSection data={data} orgId={organizationId} action={action} busy={busy} />}{section === "Inventory" && <InventorySection data={data} orgId={organizationId} action={action} busy={busy} />}{section === "Customers" && <CustomersSection data={data} orgId={organizationId} action={action} busy={busy} />}{section === "Orders" && <OrdersSection data={data} orgId={organizationId} action={action} busy={busy} />}{section === "Audit" && <AuditSection data={data} />}</div></div> : null}
    </main>
  </div>;
}
