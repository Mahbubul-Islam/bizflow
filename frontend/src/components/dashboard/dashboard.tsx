"use client";

import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Cell, Pie, PieChart } from "recharts";
import {
	Activity,
	ArrowRight,
	ArrowUpRight,
	Boxes,
	ChartNoAxesCombined,
	Building2,
	ChevronDown,
	LayoutDashboard,
	LogOut,
	Menu as MenuIcon,
	Package,
	Search,
	ShieldCheck,
	ShoppingBag,
	ClipboardList,
	Sparkles,
	Users,
	X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { FeedbackDialog } from "@/components/feedback/modal-feedback";
import { AppSelect } from "@/components/forms/app-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AccountAvatar } from "@/components/account/account-avatar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ManageAccountDialog } from "@/components/account/manage-account-dialog";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "@/components/ui/chart";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	analyticsApi,
	api,
	apiErrorMessage,
	authApi,
	customersApi,
	ordersApi,
	organizationsApi,
	productsApi,
	categoriesApi,
	type CurrentUser,
	type Category,
	type Member,
	type Organization,
	type Customer,
	type DashboardSummary,
	type Order,
	type Product,
	type SalesTrend,
	type TopProduct,
} from "@/lib/utils";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";

import { ReportsView } from "@/components/dashboard/reports-view";
import { ProductsView } from "@/components/dashboard/products-view";
import { CustomersView } from "@/components/dashboard/customers-view";
import { OrdersView } from "@/components/dashboard/orders-view";
import {
	OrganizationView,
	MembersView,
} from "@/components/dashboard/workspace-view";

type Section =
	| "Overview"
	| "Products"
	| "Customers"
	| "Orders"
	| "Reports"
	| "Organization"
	| "Members";
const dashboardSections: Section[] = [
	"Overview",
	"Products",
	"Customers",
	"Orders",
	"Reports",
	"Organization",
	"Members",
];

function sectionFromUrl(): Section {
	const value = new URLSearchParams(window.location.search).get("section");
	return (
		dashboardSections.find(
			(item) => item.toLowerCase() === value?.toLowerCase(),
		) ?? "Overview"
	);
}
type OrderRow = Order;
type ProductRow = Product;
type CustomerRow = Customer;

type DashboardSnapshot = {
	summary?: DashboardSummary;
	trend: SalesTrend[];
	orders: OrderRow[];
	products: ProductRow[];
	customers: CustomerRow[];
	topProducts: TopProduct[];
	categories: Category[];
	organizationDetails?: Organization;
	members: Member[];
};

const dashboardCache = new Map<
	string,
	{ expiresAt: number; data: DashboardSnapshot }
>();
const dashboardCacheDuration = 30_000;

function clearDashboardCache() {
	dashboardCache.clear();
}

const previewSummary: DashboardSummary = {
	currency: "BDT",
	total_sales: "1284500.00",
	total_orders: 248,
	total_customers: 86,
	total_products: 142,
	low_stock_products: 8,
	average_order_value: "5179.44",
};
const previewTrend: SalesTrend[] = [
	{ month: "2026-05", sales: "78000", orders: 18 },
	{ month: "2026-06", sales: "103000", orders: 24 },
	{ month: "2026-07", sales: "86000", orders: 20 },
	{ month: "2026-08", sales: "141000", orders: 31 },
	{ month: "2026-09", sales: "126000", orders: 28 },
	{ month: "2026-10", sales: "183000", orders: 39 },
];
const previewTopProducts: TopProduct[] = [
	{
		product_id: "1",
		name: "Premium Notebook",
		quantity_sold: 124,
		revenue: "105400.00",
	},
	{
		product_id: "2",
		name: "Wireless Keyboard",
		quantity_sold: 58,
		revenue: "185600.00",
	},
	{
		product_id: "3",
		name: "Desk Organizer",
		quantity_sold: 47,
		revenue: "68150.00",
	},
];
const salesColors = [
	"#166f5c",
	"#39a37e",
	"#87c9ac",
	"#b7dec9",
	"#6e91b7",
	"#a18bc1",
];
const salesChartConfig = { sales: { label: "Sales" } } satisfies ChartConfig;
const previewOrders: OrderRow[] = [
	{
		id: "1",
		order_number: "BF-10248",
		status: "CONFIRMED",
		total_amount: "24500.00",
		created_at: "2026-10-29",
		customer_id: null,
		items: [],
		subtotal: "24500.00",
		discount_amount: "0.00",
		tax_amount: "0.00",
		notes: "",
		confirmed_at: "2026-10-29",
	},
	{
		id: "2",
		order_number: "BF-10247",
		status: "DRAFT",
		total_amount: "10800.00",
		created_at: "2026-10-28",
		customer_id: null,
		items: [],
		subtotal: "10800.00",
		discount_amount: "0.00",
		tax_amount: "0.00",
		notes: "",
		confirmed_at: null,
	},
	{
		id: "3",
		order_number: "BF-10246",
		status: "CONFIRMED",
		total_amount: "36750.00",
		created_at: "2026-10-27",
		customer_id: null,
		items: [],
		subtotal: "36750.00",
		discount_amount: "0.00",
		tax_amount: "0.00",
		notes: "",
		confirmed_at: "2026-10-27",
	},
	{
		id: "4",
		order_number: "BF-10245",
		status: "CANCELLED",
		total_amount: "8200.00",
		created_at: "2026-10-26",
		customer_id: null,
		items: [],
		subtotal: "8200.00",
		discount_amount: "0.00",
		tax_amount: "0.00",
		notes: "",
		confirmed_at: null,
	},
];
const previewProducts: ProductRow[] = [
	{
		id: "1",
		name: "Premium Notebook",
		sku: "PN-001",
		selling_price: "850.00",
		stock_quantity: 42,
		reorder_level: 10,
		category: null,
		description: "",
		cost_price: "500.00",
		is_active: true,
		created_at: "2026-10-01",
	},
	{
		id: "2",
		name: "Desk Organizer",
		sku: "DO-204",
		selling_price: "1450.00",
		stock_quantity: 7,
		reorder_level: 12,
		category: null,
		description: "",
		cost_price: "900.00",
		is_active: true,
		created_at: "2026-10-01",
	},
	{
		id: "3",
		name: "Wireless Keyboard",
		sku: "WK-083",
		selling_price: "3200.00",
		stock_quantity: 18,
		reorder_level: 8,
		category: null,
		description: "",
		cost_price: "2200.00",
		is_active: true,
		created_at: "2026-10-01",
	},
	{
		id: "4",
		name: "Ceramic Mug",
		sku: "CM-109",
		selling_price: "680.00",
		stock_quantity: 5,
		reorder_level: 10,
		category: null,
		description: "",
		cost_price: "400.00",
		is_active: true,
		created_at: "2026-10-01",
	},
];
const previewCustomers: CustomerRow[] = [
	{
		id: "1",
		name: "Ayesha Rahman",
		email: "ayesha@example.com",
		phone: "+880 1711 223344",
		created_at: "2026-10-20",
		address: "",
		notes: "",
		is_active: true,
	},
	{
		id: "2",
		name: "Tanvir Hasan",
		email: "tanvir@example.com",
		phone: "+880 1812 345678",
		created_at: "2026-10-17",
		address: "",
		notes: "",
		is_active: true,
	},
	{
		id: "3",
		name: "Nusrat Jahan",
		email: "nusrat@example.com",
		phone: "+880 1913 456789",
		created_at: "2026-10-14",
		address: "",
		notes: "",
		is_active: true,
	},
];

const nav: { label: Section; icon: typeof LayoutDashboard }[] = [
	{ label: "Overview", icon: LayoutDashboard },
	{ label: "Products", icon: Package },
	{ label: "Customers", icon: Users },
	{ label: "Orders", icon: ShoppingBag },
	{ label: "Organization", icon: Building2 },
	{ label: "Members", icon: ClipboardList },
];
const sectionPermission: Record<Section, string> = {
	Overview: "analytics.view",
	Products: "inventory.view",
	Customers: "customers.view",
	Orders: "sales.view",
	Reports: "analytics.view",
	Organization: "organizations.view",
	Members: "members.view",
};

function money(value: string, currency: string) {
	return new Intl.NumberFormat("en-BD", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(Number(value));
}
function date(value: string) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(new Date(value));
}
function statusVariant(
	status: string,
): "default" | "secondary" | "destructive" {
	return status === "CONFIRMED"
		? "default"
		: status === "CANCELLED"
			? "destructive"
			: "secondary";
}

export function Dashboard() {
	const router = useRouter();
	const [section, setSection] = useState<Section>("Overview");
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [accountOpen, setAccountOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [user, setUser] = useState<CurrentUser | null>(null);
	const [organizationId, setOrganizationId] = useState("");
	const [checking, setChecking] = useState(true);
	const [loading, setLoading] = useState(false);
	const [summary, setSummary] = useState<DashboardSummary>();
	const [trend, setTrend] = useState<SalesTrend[]>([]);
	const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
	const [orders, setOrders] = useState<OrderRow[]>([]);
	const [products, setProducts] = useState<ProductRow[]>([]);
	const [categories, setCategories] = useState<Category[]>([]);
	const [customers, setCustomers] = useState<CustomerRow[]>([]);
	const [organizationDetails, setOrganizationDetails] =
		useState<Organization>();
	const [members, setMembers] = useState<Member[]>([]);
	const [dataErrors, setDataErrors] = useState<string[]>([]);
	const [sessionError, setSessionError] = useState<string>();
	const [retryKey, setRetryKey] = useState(0);
	const [dataRefreshKey, setDataRefreshKey] = useState(0);
	const [organizationName, setOrganizationName] = useState("");
	const [organizationError, setOrganizationError] = useState<string>();
	const [creatingOrganization, setCreatingOrganization] = useState(false);

	useEffect(() => {
		const syncSection = () => {
			setSection(sectionFromUrl());
			setSearch("");
		};
		syncSection();
		window.addEventListener("popstate", syncSection);
		return () => window.removeEventListener("popstate", syncSection);
	}, []);

	useEffect(() => {
		void authApi
			.me()
			.then((me) => {
				setSessionError(undefined);
				setUser(me);
				setLoading(me.organizations.length > 0);
				setOrganizationId((current) =>
					me.organizations.some((item) => item.id === current)
						? current
						: (me.organizations[0]?.id ?? ""),
				);
			})
			.catch((error: unknown) => {
				clearDashboardCache();
				setUser(null);
				setLoading(false);
				setOrganizationId("");
				setDataErrors([]);
				if (!axios.isAxiosError(error) || error.response?.status !== 401) {
					setSessionError(apiErrorMessage(error));
				}
			})
			.finally(() => setChecking(false));
	}, [retryKey]);

	useEffect(() => {
		if (!organizationId || !user) return;
		const allowed = new Set(
			user.organizations.find((item) => item.id === organizationId)
				?.permissions ?? [],
		);
		const can = (permission: string) =>
			hasWorkspacePermission(allowed, permission);
		const cacheKey = JSON.stringify([
			user.id,
			organizationId,
			[...allowed].sort(),
		]);
		let active = true;
		const load = async () => {
			const cached = dashboardCache.get(cacheKey);
			if (cached && cached.expiresAt > Date.now()) {
				await Promise.resolve();
				if (!active) return;
				setSummary(cached.data.summary);
				setTrend(cached.data.trend);
				setOrders(cached.data.orders);
				setProducts(cached.data.products);
				setCustomers(cached.data.customers);
				setTopProducts(cached.data.topProducts);
				setCategories(cached.data.categories);
				setOrganizationDetails(cached.data.organizationDetails);
				setMembers(cached.data.members);
				setDataErrors([]);
				setLoading(false);
				return;
			}
			dashboardCache.delete(cacheKey);
			const results = await Promise.allSettled([
				can("analytics.view")
					? analyticsApi.summary(organizationId)
					: Promise.resolve(undefined),
				can("analytics.view")
					? analyticsApi.salesTrend(organizationId)
					: Promise.resolve([]),
				can("sales.view")
					? ordersApi.list(organizationId)
					: Promise.resolve([]),
				can("inventory.view")
					? productsApi
							.page(organizationId, 1, "", { lowStock: true })
							.then((page) => page.results)
					: Promise.resolve([]),
				can("customers.view")
					? customersApi.list(organizationId)
					: Promise.resolve([]),
				can("analytics.view")
					? analyticsApi.topProducts(organizationId, 10)
					: Promise.resolve([]),
				can("inventory.view")
					? categoriesApi.list(organizationId)
					: Promise.resolve([]),
				can("organizations.view")
					? organizationsApi.get(organizationId)
					: Promise.resolve(undefined),
				can("members.view")
					? organizationsApi.members(organizationId)
					: Promise.resolve([]),
			] as const);
			if (!active) return;
			const data: DashboardSnapshot = {
				summary:
					results[0].status === "fulfilled" ? results[0].value : undefined,
				trend: results[1].status === "fulfilled" ? results[1].value : [],
				orders: results[2].status === "fulfilled" ? results[2].value : [],
				products: results[3].status === "fulfilled" ? results[3].value : [],
				customers: results[4].status === "fulfilled" ? results[4].value : [],
				topProducts: results[5].status === "fulfilled" ? results[5].value : [],
				categories: results[6].status === "fulfilled" ? results[6].value : [],
				organizationDetails:
					results[7].status === "fulfilled" ? results[7].value : undefined,
				members: results[8].status === "fulfilled" ? results[8].value : [],
			};
			setSummary(data.summary);
			setTrend(data.trend);
			setOrders(data.orders);
			setProducts(data.products);
			setCustomers(data.customers);
			setTopProducts(data.topProducts);
			setCategories(data.categories);
			setOrganizationDetails(data.organizationDetails);
			setMembers(data.members);
			if (results.every((result) => result.status === "fulfilled")) {
				dashboardCache.set(cacheKey, {
					expiresAt: Date.now() + dashboardCacheDuration,
					data,
				});
			}
			const labels = [
				"Summary",
				"Sales trend",
				"Orders",
				"Products",
				"Customers",
				"Top products",
				"Categories",
				"Organization",
				"Members",
			];
			setDataErrors(
				results.flatMap((result, index) =>
					result.status === "rejected"
						? [`${labels[index]}: ${apiErrorMessage(result.reason)}`]
						: [],
				),
			);
			setLoading(false);
		};
		void load();
		return () => {
			active = false;
		};
	}, [organizationId, retryKey, dataRefreshKey, user]);

	const preview = !user;
	const currentSummary = preview ? previewSummary : summary;
	const currentTrend = preview ? previewTrend : trend;
	const currentOrders = preview ? previewOrders : orders;
	const currentProducts = preview ? previewProducts : products;
	const currentCustomers = preview ? previewCustomers : customers;
	const currentTopProducts = preview ? previewTopProducts : topProducts;
	const currency = currentSummary?.currency ?? "BDT";
	const organization = user?.organizations.find(
		(item) => item.id === organizationId,
	);
	const permissions = new Set(organization?.permissions ?? []);
	const canView = (next: Section) =>
		!user
			? next !== "Organization" && next !== "Members"
			: hasWorkspacePermission(permissions, sectionPermission[next]);
	const visibleNav = nav.filter(({ label }) => canView(label));
	const activeSection = canView(section)
		? section
		: (visibleNav[0]?.label ?? (canView("Reports") ? "Reports" : null));
	const filteredProducts = currentProducts.filter((item) =>
		`${item.name} ${item.sku}`.toLowerCase().includes(search.toLowerCase()),
	);
	const filteredCustomers = currentCustomers.filter((item) =>
		`${item.name} ${item.email}`.toLowerCase().includes(search.toLowerCase()),
	);
	const filteredOrders = currentOrders.filter((item) =>
		`${item.order_number} ${item.status}`
			.toLowerCase()
			.includes(search.toLowerCase()),
	);

	async function logout() {
		try {
			await authApi.logout();
		} finally {
			clearDashboardCache();
			router.push("/login");
			router.refresh();
		}
	}
	async function createOrganization(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setCreatingOrganization(true);
		setOrganizationError(undefined);
		try {
			const slug = organizationName
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "");
			if (!slug) throw new Error("Enter an organization name.");
			const created = await organizationsApi.create({
				name: organizationName.trim(),
				slug,
			});
			clearDashboardCache();
			const me = await authApi.me(created.id);
			setUser(me);
			setLoading(true);
			setOrganizationId(created.id);
		} catch (cause) {
			setOrganizationError(apiErrorMessage(cause));
		} finally {
			setCreatingOrganization(false);
		}
	}
	function selectSection(next: Section) {
		if (!canView(next)) return;
		setSection(next);
		setSearch("");
		const url = new URL(window.location.href);
		if (next === "Overview") url.searchParams.delete("section");
		else url.searchParams.set("section", next.toLowerCase());
		window.history.pushState(null, "", url);
	}

	if (checking || loading) {
		return (
			<main
				className="flex min-h-screen items-center justify-center bg-[#f7f9f8] p-6 dark:bg-background"
				role="status"
				aria-label="Loading workspace">
				<div className="flex flex-col items-center gap-4">
					<div
						className="flex h-32 w-40 items-center justify-center"
						aria-hidden="true">
						<div className="bizflow-loader-boxes">
							{Array.from({ length: 4 }, (_, index) => (
								<div className="box" key={index}>
									<div />
									<div />
									<div />
									<div />
								</div>
							))}
						</div>
					</div>
					{/* <p className="text-sm text-muted-foreground">Loading workspace...</p> */}
				</div>
			</main>
		);
	}

	return (
		<div className="min-h-screen bg-[#f7f9f8] text-foreground dark:bg-background">
			{user && (
				<ManageAccountDialog
					user={user}
					open={accountOpen}
					onOpenChange={setAccountOpen}
					onUpdated={(updated) => {
						clearDashboardCache();
						setMembers((current) =>
							current.map((member) =>
								member.user === updated.id ? { ...member, ...updated } : member,
							),
						);
						setUser((current) =>
							current ? { ...current, ...updated } : current,
						);
					}}
				/>
			)}
			<FeedbackDialog
				open={!!organizationError}
				title="Organization could not be created"
				message={organizationError}
				onClose={() => setOrganizationError(undefined)}
			/>
			<FeedbackDialog
				open={!!sessionError}
				title="Backend request failed"
				message={`The request to ${api.defaults.baseURL} failed: ${sessionError ?? ""}`}
				onClose={() => setSessionError(undefined)}
				action={{
					label: "Retry",
					onClick: () => {
						clearDashboardCache();
						setSessionError(undefined);
						setChecking(true);
						setRetryKey((value) => value + 1);
					},
				}}
			/>
			<FeedbackDialog
				open={dataErrors.length > 0}
				title="Live data could not be loaded"
				details={dataErrors}
				onClose={() => setDataErrors([])}
				action={{
					label: "Retry",
					onClick: () => {
						clearDashboardCache();
						setDataErrors([]);
						setLoading(true);
						setRetryKey((value) => value + 1);
					},
				}}
			/>
			<aside className="fixed inset-y-0 left-0 z-20 hidden h-screen w-64 flex-col overflow-hidden border-r border-border bg-card px-4 py-6 lg:flex [@supports(height:100dvh)]:h-dvh">
				<div className="px-3">
					<BrandLogo className="h-16 w-32" />
				</div>
				<div className="sidebar-scroll mt-8 min-h-0 flex-1 overflow-y-auto pr-1">
					<div className="mt-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
						Workspace
					</div>
					<nav aria-label="Main navigation" className="mt-3 space-y-1">
						{visibleNav.map(({ label, icon: Icon }) => (
							<button
								key={label}
								type="button"
								onClick={() => selectSection(label)}
								className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${activeSection === label ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
								<Icon className="size-[18px]" />
								{label}
								{activeSection === label && (
									<span className="ml-auto size-1.5 rounded-full bg-primary" />
								)}
							</button>
						))}
					</nav>
					{canView("Reports") && (
						<div className="mt-9 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
							Insights
						</div>
					)}
					{canView("Reports") && (
						<button
							type="button"
							onClick={() => selectSection("Reports")}
							className={`mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${activeSection === "Reports" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
							<ChartNoAxesCombined className="size-[18px]" />
							Reports
							{activeSection === "Reports" && (
								<span className="ml-auto size-1.5 rounded-full bg-primary" />
							)}
						</button>
					)}
					{organization?.role === "OWNER" && (
						<Link
							href={`/admin?organization=${organizationId}`}
							className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
							<ShieldCheck className="size-[18px]" />
							Administrator
						</Link>
					)}
					<div className="mt-8 mb-4">
						<div className="rounded-2xl bg-[#e7f5ed] p-4 text-[#184a39] dark:bg-primary/10 dark:text-foreground">
							<Sparkles className="size-5" />
							<p className="mt-3 text-sm font-semibold">
								Your business, in focus.
							</p>
							<p className="mt-1 text-xs leading-5 opacity-75">
								Track what matters from one workspace.
							</p>
						</div>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-3 border-t border-border px-2 pt-4">
					{user ? (
						<AccountAvatar user={user} />
					) : (
						<span className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
							BF
						</span>
					)}
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-semibold">
							{user
								? `${user.first_name} ${user.last_name}`.trim() || user.email
								: "Preview workspace"}
						</p>
						<p className="truncate text-xs text-muted-foreground">
							{organization?.name ?? "Explore BizFlow"}
						</p>
					</div>
					{user && (
						<button
							type="button"
							onClick={() => void logout()}
							aria-label="Log out"
							className="text-muted-foreground hover:text-foreground">
							<LogOut className="size-4" />
						</button>
					)}
				</div>
			</aside>
			<Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
				<DialogContent
					showCloseButton={false}
					className="flex flex-col gap-0 overflow-y-auto rounded-none border-r border-border p-4 py-6 lg:hidden"
					style={{
						top: 0,
						left: 0,
						transform: "none",
						width: "18rem",
						maxWidth: "85vw",
						height: "100dvh",
						maxHeight: "100dvh",
					}}>
					<div className="flex items-center justify-between px-2">
						<DialogTitle>
							<BrandLogo className="h-16 w-32" />
						</DialogTitle>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Close menu"
							onClick={() => setDrawerOpen(false)}>
							<X className="size-5" />
						</Button>
					</div>
					<p className="mt-9 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
						Workspace
					</p>
					<nav aria-label="Drawer navigation" className="mt-3 space-y-1">
						{visibleNav.map(({ label, icon: Icon }) => (
							<button
								key={label}
								type="button"
								onClick={() => {
									selectSection(label);
									setDrawerOpen(false);
								}}
								className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${activeSection === label ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
								<Icon className="size-[18px]" />
								{label}
								{activeSection === label && (
									<span className="ml-auto size-1.5 rounded-full bg-primary" />
								)}
							</button>
						))}
					</nav>
					{canView("Reports") && (
						<>
							<p className="mt-9 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
								Insights
							</p>
							<button
								type="button"
								onClick={() => {
									selectSection("Reports");
									setDrawerOpen(false);
								}}
								className={`mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${activeSection === "Reports" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
								<ChartNoAxesCombined className="size-[18px]" />
								Reports
							</button>
						</>
					)}
					{organization?.role === "OWNER" && (
						<Link
							href={`/admin?organization=${organizationId}`}
							onClick={() => setDrawerOpen(false)}
							className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
							<ShieldCheck className="size-[18px]" />
							Administrator
						</Link>
					)}
					<div className="mt-auto border-t border-border px-2 pt-4">
						{user && <AccountAvatar user={user} size={40} />}
						<p className="mt-3 truncate text-sm font-semibold">
							{user
								? `${user.first_name} ${user.last_name}`.trim() || user.email
								: "Preview workspace"}
						</p>
						<p className="truncate text-xs text-muted-foreground">
							{organization?.name ?? "Explore BizFlow"}
						</p>
						{user && (
							<div className="mt-3 flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => {
										setDrawerOpen(false);
										setAccountOpen(true);
									}}>
									Manage account
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => {
										setDrawerOpen(false);
										void logout();
									}}>
									<LogOut className="size-4" />
									Log out
								</Button>
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>

			<div className="lg:pl-64">
				<header className="sticky top-0 z-10 flex h-18 items-center justify-between gap-4 border-b border-border bg-card/95 px-5 backdrop-blur sm:px-8">
					<div className="flex min-w-0 items-center gap-3">
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="lg:hidden"
							aria-label="Open menu"
							aria-expanded={drawerOpen}
							onClick={() => setDrawerOpen(true)}>
							<MenuIcon className="size-5" />
						</Button>
						<div>
							<p className="text-xs text-muted-foreground">
								Workspace <span className="mx-1">/</span>{" "}
								{activeSection ?? "Workspace"}
							</p>
							<p className="truncate text-sm font-semibold">
								{organization?.name ?? "BizFlow Studio"}
							</p>
						</div>
						<ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
					</div>
					<div className="flex items-center gap-3">
						{user && user.organizations.length > 1 && (
							<label className="sr-only" htmlFor="organization-switcher">
								Organization
							</label>
						)}
						{user && user.organizations.length > 1 && (
							<AppSelect
								id="organization-switcher"
								ariaLabel="Organization"
								value={organizationId}
								onValueChange={(next) => {
									setLoading(true);
									setOrganizationId(next);
								}}
								options={user.organizations.map((item) => ({
									value: item.id,
									label: item.name,
								}))}
								placeholder="Select organization"
								className="w-36 sm:w-48"
							/>
						)}
						<ThemeToggle />
						{user ? (
							<Menu.Root>
								<Menu.Trigger
									aria-label="Account menu"
									className="rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
									<AccountAvatar user={user} size={36} />
								</Menu.Trigger>
								<Menu.Portal>
									<Menu.Positioner align="end" sideOffset={8} className="z-50">
										<Menu.Popup className="z-50 min-w-52 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none">
											<div className="border-b border-border px-3 py-2">
												<p className="truncate text-sm font-semibold">
													{`${user.first_name} ${user.last_name}`.trim() ||
														user.email}
												</p>
												<p className="truncate text-xs text-muted-foreground">
													{user.email}
												</p>
											</div>
											<Menu.Item
												onClick={() => setAccountOpen(true)}
												className="mt-1 cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-muted">
												Manage account
											</Menu.Item>
											<Menu.Item
												onClick={() => void logout()}
												className="cursor-pointer rounded-lg px-3 py-2 text-sm text-destructive outline-none data-highlighted:bg-muted">
												Log out
											</Menu.Item>
										</Menu.Popup>
									</Menu.Positioner>
								</Menu.Portal>
							</Menu.Root>
						) : (
							<Button
								render={<Link href="/login" />}
								nativeButton={false}
								size="sm">
								Log in <ArrowRight className="size-4" />
							</Button>
						)}
					</div>
				</header>
				<main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
					{preview && !checking && (
						<div className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3 text-sm">
							<div className="flex items-center gap-2">
								<Sparkles className="size-4 text-primary" />
								<span>
									<strong>Preview mode.</strong> The numbers below are sample
									data.
								</span>
							</div>
							<Link
								href="/login"
								className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
								Connect your workspace <ArrowRight className="size-4" />
							</Link>
						</div>
					)}
					{user && !organizationId && (
						<Card className="mb-7 max-w-xl">
							<CardHeader>
								<CardTitle>No organization is linked to this account</CardTitle>
								<CardDescription>
									Business data belongs to an organization. Ask its owner to add
									your email as a member to see existing records, or create a
									new workspace below.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<form
									onSubmit={(event) => void createOrganization(event)}
									className="flex flex-wrap gap-3">
									<Input
										aria-label="Organization name"
										value={organizationName}
										onChange={(event) =>
											setOrganizationName(event.target.value)
										}
										placeholder="New organization name"
										required
										className="min-w-48 flex-1"
									/>
									<Button type="submit" disabled={creatingOrganization}>
										{creatingOrganization
											? "Creating..."
											: "Create new organization"}
									</Button>
								</form>
							</CardContent>
						</Card>
					)}
					<div className="mb-8 flex flex-wrap items-end justify-between gap-4">
						<div>
							<div className="mb-2 flex items-center gap-2">
								<Badge
									variant="outline"
									className="border-primary/20 bg-primary/5 text-primary">
									{preview ? "DESIGN PREVIEW" : "LIVE WORKSPACE"}
								</Badge>
								<span className="text-xs text-muted-foreground">
									Workspace snapshot
								</span>
							</div>
							<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
								{activeSection === "Overview"
									? "Good to see you"
									: (activeSection ?? "Workspace")}
								<span className="text-primary">
									{activeSection === "Overview" ? "." : ""}
								</span>
							</h1>
							<p className="mt-2 text-sm text-muted-foreground">
								{activeSection === "Overview"
									? "Here is what is happening across your business today."
									: activeSection === "Reports"
										? "Sales performance and product insights for your workspace."
										: activeSection
											? `A clear view of your ${activeSection.toLowerCase()}.`
											: "No sections are available for your role."}
							</p>
						</div>
						{activeSection &&
							activeSection !== "Overview" &&
							activeSection !== "Reports" && (
								<div className="relative w-full sm:w-64">
									<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										aria-label={`Search ${activeSection}`}
										value={search}
										onChange={(event) => setSearch(event.target.value)}
										placeholder={`Search ${activeSection.toLowerCase()}...`}
										className="pl-9"
									/>
								</div>
							)}
					</div>

					{user && !organizationId ? null : !activeSection ? (
						<p className="text-sm text-muted-foreground">
							Ask your organization owner for access to a workspace section.
						</p>
					) : activeSection === "Overview" ? (
						<Overview
							summary={currentSummary}
							trend={currentTrend}
							orders={currentOrders}
							products={currentProducts}
							currency={currency}
							onNavigate={selectSection}
							canView={canView}
						/>
					) : activeSection === "Products" ? (
						<ProductsView
							products={filteredProducts}
							categories={categories}
							currency={currency}
							organizationId={organizationId}
							canManage={!preview && permissions.has("inventory.manage")}
							search={search}
							onSaved={() => {
								clearDashboardCache();
								setDataRefreshKey((value) => value + 1);
							}}
						/>
					) : activeSection === "Customers" ? (
						<CustomersView
							customers={filteredCustomers}
							organizationId={organizationId}
							canManage={!preview && permissions.has("customers.manage")}
							onSaved={() => {
								clearDashboardCache();
								setLoading(true);
								setRetryKey((value) => value + 1);
							}}
						/>
					) : activeSection === "Reports" ? (
						<ReportsView
							trend={currentTrend}
							topProducts={currentTopProducts}
							currency={currency}
							organizationName={organization?.name ?? "BizFlow preview"}
						/>
					) : activeSection === "Organization" ? (
						<OrganizationView
							organization={organizationDetails}
							canUpdate={permissions.has("organizations.update")}
							onSaved={() => {
								clearDashboardCache();
								setLoading(true);
								setRetryKey((value) => value + 1);
							}}
						/>
					) : activeSection === "Members" ? (
						<MembersView members={members} />
					) : (
						<OrdersView
							orders={filteredOrders}
							products={currentProducts}
							customers={currentCustomers}
							organizationId={organizationId}
							currency={currency}
							actions={{
								manage: permissions.has("sales.manage"),
								confirm: permissions.has("sales.confirm"),
								cancel: permissions.has("sales.cancel"),
								invoice: permissions.has("sales.invoice"),
							}}
							onSaved={() => {
								clearDashboardCache();
								setLoading(true);
								setRetryKey((value) => value + 1);
							}}
						/>
					)}
				</main>
			</div>
		</div>
	);
}

function Overview({
	summary,
	trend,
	orders,
	products,
	currency,
	onNavigate,
	canView,
}: {
	summary?: DashboardSummary;
	trend: SalesTrend[];
	orders: OrderRow[];
	products: ProductRow[];
	currency: string;
	onNavigate: (section: Section) => void;
	canView: (section: Section) => boolean;
}) {
	const stats = [
		{
			label: "Total revenue",
			value: money(summary?.total_sales ?? "0", currency),
			icon: ChartNoAxesCombined,
			note: "Confirmed sales",
			accent: "text-[#178458] bg-[#e4f4e9] dark:bg-primary/10",
		},
		{
			label: "Orders",
			value: summary?.total_orders ?? 0,
			icon: ShoppingBag,
			note: "Confirmed orders",
			accent: "text-[#8063b6] bg-[#f0eafb] dark:bg-violet-500/10",
		},
		{
			label: "Customers",
			value: summary?.total_customers ?? 0,
			icon: Users,
			note: "Active relationships",
			accent: "text-[#d08a3e] bg-[#fff2dd] dark:bg-orange-500/10",
		},
		{
			label: "Products",
			value: summary?.total_products ?? 0,
			icon: Boxes,
			note: `${summary?.low_stock_products ?? 0} need attention`,
			accent: "text-[#5085bd] bg-[#e7f2fd] dark:bg-blue-500/10",
		},
	];
	const shownTrend = trend
		.slice(-6)
		.map((item, index) => ({
			...item,
			label: new Intl.DateTimeFormat("en-US", {
				month: "short",
				year: "2-digit",
			}).format(new Date(`${item.month}-01`)),
			value: Number(item.sales),
			fill: salesColors[index % salesColors.length],
		}))
		.filter((item) => item.value > 0);
	const periodTotal = shownTrend.reduce((total, item) => total + item.value, 0);
	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{stats.map(({ label, value, icon: Icon, note, accent }) => (
					<Card key={label} className="gap-0 bg-card py-5">
						<CardContent className="flex items-start justify-between">
							<div>
								<p className="text-sm text-muted-foreground">{label}</p>
								<p className="mt-3 text-2xl font-semibold tracking-tight">
									{value}
								</p>
								<p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
									<ArrowUpRight className="size-3 text-primary" />
									{note}
								</p>
							</div>
							<span
								className={`flex size-10 items-center justify-center rounded-2xl ${accent}`}>
								<Icon className="size-5" />
							</span>
						</CardContent>
					</Card>
				))}
			</div>
			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
				<Card>
					<CardHeader className="flex flex-row items-start justify-between">
						<div>
							<CardTitle>Sales performance</CardTitle>
							<CardDescription className="mt-1">
								Revenue mix by month
							</CardDescription>
						</div>
						<span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
							Latest 6 months
						</span>
					</CardHeader>
					<CardContent>
						{shownTrend.length ? (
							<div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
								<div className="relative mx-auto size-[260px] max-w-full">
									<ChartContainer
										config={salesChartConfig}
										className="size-full"
										initialDimension={{ width: 260, height: 260 }}>
										<PieChart>
											<ChartTooltip
												content={<ChartTooltipContent hideLabel />}
											/>
											<Pie
												data={shownTrend}
												dataKey="value"
												nameKey="label"
												innerRadius={76}
												outerRadius={108}
												paddingAngle={2}
												strokeWidth={0}
												isAnimationActive={false}>
												{shownTrend.map((item) => (
													<Cell key={item.month} fill={item.fill} />
												))}
											</Pie>
										</PieChart>
									</ChartContainer>
									<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
										<span className="text-xs text-muted-foreground">
											Period sales
										</span>
										<strong className="mt-1 max-w-[140px] break-words text-base font-semibold tracking-tight">
											{money(String(periodTotal), currency)}
										</strong>
									</div>
								</div>
								<ul className="space-y-3" aria-label="Monthly sales breakdown">
									{shownTrend.map((item) => (
										<li
											key={item.month}
											className="flex items-center justify-between gap-3 text-sm">
											<span className="flex min-w-0 items-center gap-2 text-muted-foreground">
												<span
													className="size-2.5 shrink-0 rounded-full"
													style={{ backgroundColor: item.fill }}
												/>
												{item.label}
											</span>
											<span className="text-right">
												<strong className="block font-medium">
													{money(item.sales, currency)}
												</strong>
												<span className="text-xs text-muted-foreground">
													{Math.round((item.value / periodTotal) * 100)}%
												</span>
											</span>
										</li>
									))}
								</ul>
							</div>
						) : (
							<p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
								No confirmed sales yet
							</p>
						)}
					</CardContent>
				</Card>
				<Card className="bg-[#e8f5ed] text-[#154b38] ring-[#d8ecdf] dark:bg-card dark:text-foreground dark:ring-foreground/10">
					<CardHeader>
						<div className="flex size-11 items-center justify-center rounded-2xl bg-white/80 text-[#217a55] dark:bg-primary/10 dark:text-primary">
							<Activity className="size-5" />
						</div>
						<CardTitle className="mt-5 text-2xl leading-tight">
							A clearer picture of your business.
						</CardTitle>
						<CardDescription className="max-w-xs leading-6 text-[#4a7362] dark:text-muted-foreground">
							Follow your sales, stock, and customers from one place.
						</CardDescription>
					</CardHeader>
					<CardContent className="mt-auto">
						<div className="rounded-2xl bg-white/70 p-4 dark:bg-background/40">
							<p className="text-xs font-medium uppercase tracking-wider text-[#5d826f] dark:text-muted-foreground">
								Average order value
							</p>
							<p className="mt-1 text-2xl font-semibold">
								{money(summary?.average_order_value ?? "0", currency)}
							</p>
						</div>
						{canView("Orders") && (
							<button
								type="button"
								onClick={() => onNavigate("Orders")}
								className="mt-5 inline-flex items-center gap-2 text-sm font-semibold hover:underline">
								Explore orders <ArrowRight className="size-4" />
							</button>
						)}
					</CardContent>
				</Card>
			</div>
			{(canView("Orders") || canView("Products")) && (
				<div className="grid gap-6 xl:grid-cols-2">
					{canView("Orders") && (
						<Card>
							<CardHeader className="flex flex-row items-center justify-between">
								<div>
									<CardTitle>Recent orders</CardTitle>
									<CardDescription className="mt-1">
										Your latest sales activity
									</CardDescription>
								</div>
								{canView("Orders") && (
									<button
										type="button"
										onClick={() => onNavigate("Orders")}
										className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
										View all <ArrowRight className="size-3" />
									</button>
								)}
							</CardHeader>
							<CardContent>
								<OrderTable orders={orders.slice(0, 5)} currency={currency} />
							</CardContent>
						</Card>
					)}
					{canView("Products") && (
						<Card>
							<CardHeader className="flex flex-row items-center justify-between">
								<div>
									<CardTitle>Stock watch</CardTitle>
									<CardDescription className="mt-1">
										Products that need attention
									</CardDescription>
								</div>
								<span className="flex size-8 items-center justify-center rounded-full bg-[#fff1df] text-[#b6782c] dark:bg-orange-500/10">
									<Package className="size-4" />
								</span>
							</CardHeader>
							<CardContent className="space-y-3">
								{products
									.filter((item) => item.stock_quantity <= item.reorder_level)
									.slice(0, 4)
									.map((item) => (
										<div
											key={item.id}
											className="flex items-center gap-3 rounded-xl border border-border p-3">
											<span className="flex size-9 items-center justify-center rounded-xl bg-muted">
												<Boxes className="size-4 text-muted-foreground" />
											</span>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium">
													{item.name}
												</p>
												<p className="text-xs text-muted-foreground">
													{item.sku}
												</p>
											</div>
											<span className="text-xs font-semibold text-[#c17a25]">
												{item.stock_quantity} left
											</span>
										</div>
									))}
								{!products.some(
									(item) => item.stock_quantity <= item.reorder_level,
								) && (
									<p className="py-8 text-center text-sm text-muted-foreground">
										Stock levels look healthy.
									</p>
								)}
								{canView("Products") && (
									<button
										type="button"
										onClick={() => onNavigate("Products")}
										className="inline-flex items-center gap-1 pt-2 text-xs font-semibold text-primary hover:underline">
										View inventory <ArrowRight className="size-3" />
									</button>
								)}
							</CardContent>
						</Card>
					)}
				</div>
			)}
		</div>
	);
}

function OrderTable({
	orders,
	currency,
}: {
	orders: OrderRow[];
	currency: string;
}) {
	if (!orders.length)
		return (
			<p className="py-10 text-center text-sm text-muted-foreground">
				No orders to show yet.
			</p>
		);
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Order</TableHead>
					<TableHead>Date</TableHead>
					<TableHead>Status</TableHead>
					<TableHead className="text-right">Amount</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{orders.map((order) => (
					<TableRow key={order.id}>
						<TableCell className="font-semibold">
							{order.order_number}
						</TableCell>
						<TableCell className="text-muted-foreground">
							{date(order.created_at)}
						</TableCell>
						<TableCell>
							<Badge variant={statusVariant(order.status)}>
								{order.status.toLowerCase()}
							</Badge>
						</TableCell>
						<TableCell className="text-right font-medium">
							{money(order.total_amount, currency)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
