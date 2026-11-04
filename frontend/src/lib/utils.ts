import axios, { type AxiosRequestConfig } from "axios";
export { cn } from "cn";

// This client is for browser requests. Django authenticates with HttpOnly cookies.
const baseURL = `${(process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1").replace(/\/+$/, "")}/`;

export const api = axios.create({
	baseURL,
	withCredentials: true,
	xsrfCookieName: "csrftoken",
	xsrfHeaderName: "X-CSRFToken",
	withXSRFToken: true,
});

let csrfToken: string | undefined;
let csrfRequest: Promise<string> | undefined;

export async function getCsrfToken(): Promise<string> {
	if (csrfToken) return csrfToken;
	if (!csrfRequest) {
		csrfRequest = api
			.get<{ success: true; csrfToken: string }>("auth/csrf/")
			.then(({ data }) => (csrfToken = data.csrfToken))
			.finally(() => {
				csrfRequest = undefined;
			});
	}
	return csrfRequest;
}

api.interceptors.request.use(async (config) => {
	if (
		["post", "put", "patch", "delete"].includes(
			config.method?.toLowerCase() ?? "",
		)
	) {
		config.headers.set("X-CSRFToken", await getCsrfToken());
	}
	return config;
});

export function organizationConfig(organizationId: string): AxiosRequestConfig {
	if (!organizationId) throw new Error("An organization ID is required.");
	return { headers: { "X-Organization-ID": organizationId } };
}

type Envelope<T> = { success: boolean; message?: string; data: T };
type SuccessMessage = { success: boolean; message: string };
type Id = string;
type Money = string; // DRF serializes decimal values as strings.
type ISODateTime = string;

export type User = {
	id: Id;
	email: string;
	first_name: string;
	last_name: string;
	phone: string;
	username: string;
	avatar_url: string | null;
};
export type CurrentUser = User & {
	role: Role | null;
	organizations: { id: Id; name: string; role: Role; permissions: string[] }[];
};
export type Role = "OWNER" | "MANAGER" | "STAFF";
export type Organization = {
	id: Id;
	name: string;
	slug: string;
	email: string;
	phone: string;
	address: string;
	currency: string;
	created_at: ISODateTime;
};
export type OrganizationInput = Pick<Organization, "name" | "slug"> &
	Partial<Pick<Organization, "email" | "phone" | "address" | "currency">>;
export type Member = {
	id: Id;
	user: Id;
	email: string;
	first_name: string;
	last_name: string;
	avatar_url: string | null;
	role: Role;
	joined_at: ISODateTime;
};
export type AvailableMember = Pick<Member, "email" | "first_name" | "last_name"> & { username: string };
export type RolePermissions = {
	available_permissions: Record<string, string>;
	roles: Record<Role, string[]>;
};
export type Customer = {
	id: Id;
	name: string;
	email: string;
	phone: string;
	address: string;
	notes: string;
	is_active: boolean;
	created_at: ISODateTime;
};
export type CustomerInput = Pick<Customer, "name"> &
	Partial<
		Pick<Customer, "email" | "phone" | "address" | "notes" | "is_active">
	>;
export type Category = {
	id: Id;
	name: string;
	description: string;
	is_active: boolean;
};
export type CategoryInput = Pick<Category, "name"> &
	Partial<Pick<Category, "description" | "is_active">>;
export type Product = {
	id: Id;
	category: Id | null;
	name: string;
	sku: string;
	description: string;
	cost_price: Money;
	selling_price: Money;
	stock_quantity: number;
	reorder_level: number;
	is_active: boolean;
	created_at: ISODateTime;
};
export type ProductInput = Pick<
	Product,
	"name" | "sku" | "cost_price" | "selling_price"
> &
	Partial<
		Pick<Product, "category" | "description" | "reorder_level" | "is_active">
	>;
export type ProductPage = { count: number; next: number | null; results: Product[] };
export type StockMovement = {
	id: Id;
	product_id: Id;
	quantity_before: number;
	quantity_delta: number;
	quantity_after: number;
	reason: string;
	created_at: ISODateTime;
};
export type StockAdjustment = Pick<
	StockMovement,
	"quantity_before" | "quantity_delta" | "quantity_after"
>;
export type OrderItem = {
	product_id: Id;
	product_name: string;
	quantity: number;
	unit_price: Money;
	line_total: Money;
};
export type Order = {
	id: Id;
	order_number: string;
	status: "DRAFT" | "CONFIRMED" | "CANCELLED";
	customer_id: Id | null;
	items: OrderItem[];
	subtotal: Money;
	discount_amount: Money;
	tax_amount: Money;
	total_amount: Money;
	notes: string;
	created_at: ISODateTime;
	confirmed_at: ISODateTime | null;
};
export type DraftOrderInput = {
	customer_id?: Id | null;
	items?: { product_id: Id; quantity: number }[];
	discount_amount?: Money;
	tax_amount?: Money;
	notes?: string;
};
export type DashboardSummary = {
	currency: string;
	total_sales: Money;
	total_orders: number;
	total_customers: number;
	total_products: number;
	low_stock_products: number;
	average_order_value: Money;
};
export type SalesTrend = { month: string; sales: Money; orders: number };
export type TopProduct = {
	product_id: Id;
	name: string;
	quantity_sold: number;
	revenue: Money;
};
export type AuditLog = {
	id: Id;
	action: string;
	entity_type: string;
	entity_id: Id;
	changes: Record<string, unknown>;
	created_at: ISODateTime;
};

export const authApi = {
	csrf: getCsrfToken,
	register: async (input: {
		email: string;
		password: string;
		password_confirm: string;
		first_name?: string;
		last_name?: string;
		phone?: string;
	}) => (await api.post<Envelope<User>>("auth/register/", input)).data.data,
	login: async (email: string, password: string) =>
		(await api.post<Envelope<User>>("auth/login/", { email, password })).data
			.data,
	googleLogin: async (credential: string) =>
		(await api.post<Envelope<User>>("auth/google/", { credential })).data.data,
	refresh: async () => (await api.post<SuccessMessage>("auth/refresh/")).data,
	logout: async () => (await api.post<SuccessMessage>("auth/logout/")).data,
	me: async (organizationId?: string) => {
		const config = organizationId ? organizationConfig(organizationId) : undefined;
		try {
			return (await api.get<Envelope<CurrentUser>>("auth/me/", config)).data.data;
		} catch (error) {
			if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error;
			try {
				await api.post<SuccessMessage>("auth/refresh/");
			} catch (refreshError) {
				// Older API instances return 403 for these session failures.
				const detail = axios.isAxiosError(refreshError) ? refreshError.response?.data?.detail : undefined;
				if (axios.isAxiosError(refreshError) && (
					refreshError.response?.status === 401 ||
					(refreshError.response?.status === 403 && ["Refresh token missing.", "Invalid refresh token.", "Refresh token revoked.", "Invalid user."].includes(detail))
				)) throw error;
				throw refreshError;
			}
			return (await api.get<Envelope<CurrentUser>>("auth/me/", config)).data.data;
		}
	},
	updateProfile: async (input: FormData) =>
		(await api.patch<Envelope<User>>("auth/profile/", input)).data.data,
	changePassword: async (input: {
		old_password: string;
		new_password: string;
		new_password_confirm: string;
	}) => (await api.post<SuccessMessage>("auth/password/change/", input)).data,
};

export const organizationsApi = {
	list: async () => (await api.get<Organization[]>("organizations/")).data,
	create: async (input: OrganizationInput) =>
		(await api.post<Organization>("organizations/", input)).data,
	get: async (id: Id) =>
		(await api.get<Organization>(`organizations/${id}/`)).data,
	update: async (id: Id, input: Partial<OrganizationInput>) =>
		(await api.patch<Organization>(`organizations/${id}/`, input)).data,
	members: async (id: Id) =>
		(await api.get<Member[]>(`organizations/${id}/members/`)).data,
	searchMembers: async (id: Id, query: string) =>
		(await api.get<AvailableMember[]>(`organizations/${id}/members/search/`, { params: { q: query } })).data,
	addMember: async (id: Id, input: { email: string; role?: Role }) =>
		(await api.post<Member>(`organizations/${id}/members/`, input)).data,
	changeMemberRole: async (id: Id, memberId: Id, role: Role) =>
		(
			await api.patch<Member>(`organizations/${id}/members/${memberId}/`, {
				role,
			})
		).data,
	removeMember: async (id: Id, memberId: Id) => {
		await api.delete(`organizations/${id}/members/${memberId}/`);
	},
	rolePermissions: async (id: Id) =>
		(await api.get<RolePermissions>(`organizations/${id}/roles/permissions/`))
			.data,
	updateRolePermissions: async (
		id: Id,
		role: "MANAGER" | "STAFF",
		permissions: string[],
	) =>
		(
			await api.patch<{ role: Role; permissions: string[] }>(
				`organizations/${id}/roles/${role}/permissions/`,
				{ permissions },
			)
		).data,
};

export const customersApi = {
	list: async (orgId: Id) =>
		(await api.get<Customer[]>("customers/", organizationConfig(orgId))).data,
	get: async (orgId: Id, id: Id) =>
		(await api.get<Customer>(`customers/${id}/`, organizationConfig(orgId)))
			.data,
	create: async (orgId: Id, input: CustomerInput) =>
		(await api.post<Customer>("customers/", input, organizationConfig(orgId)))
			.data,
	update: async (orgId: Id, id: Id, input: Partial<CustomerInput>) =>
		(
			await api.patch<Customer>(
				`customers/${id}/`,
				input,
				organizationConfig(orgId),
			)
		).data,
	remove: async (orgId: Id, id: Id) => {
		await api.delete(`customers/${id}/`, organizationConfig(orgId));
	},
};

export const categoriesApi = {
	list: async (orgId: Id) =>
		(await api.get<Category[]>("categories/", organizationConfig(orgId))).data,
	get: async (orgId: Id, id: Id) =>
		(await api.get<Category>(`categories/${id}/`, organizationConfig(orgId)))
			.data,
	create: async (orgId: Id, input: CategoryInput) =>
		(await api.post<Category>("categories/", input, organizationConfig(orgId)))
			.data,
	update: async (orgId: Id, id: Id, input: Partial<CategoryInput>) =>
		(
			await api.patch<Category>(
				`categories/${id}/`,
				input,
				organizationConfig(orgId),
			)
		).data,
	remove: async (orgId: Id, id: Id) => {
		await api.delete(`categories/${id}/`, organizationConfig(orgId));
	},
};

export const productsApi = {
	page: async (orgId: Id, page = 1, search = "", options?: { active?: boolean; lowStock?: boolean; category?: string; status?: "all" | "active" | "inactive"; stock?: "all" | "in" | "low" | "out" }): Promise<ProductPage> => {
		try {
			return (await api.get<ProductPage>("products/catalog/", {
				...organizationConfig(orgId),
				params: { page, search, active: options?.active ? "true" : undefined, low_stock: options?.lowStock ? "true" : undefined, category: options?.category || undefined, status: options?.status === "all" ? undefined : options?.status, stock: options?.stock === "all" ? undefined : options?.stock },
			})).data;
		} catch (error) {
			// A running backend may predate the catalog route until it is restarted.
			if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error;
			const all = (await api.get<Product[]>("products/", organizationConfig(orgId))).data;
			const query = search.trim().toLowerCase();
			const filtered = all.filter((product) =>
				(!options?.active || product.is_active) &&
				(!options?.lowStock || (product.is_active && product.stock_quantity <= product.reorder_level)) &&
				(!options?.category || (options.category === "none" ? product.category === null : product.category === options.category)) &&
				(!options?.status || options.status === "all" || product.is_active === (options.status === "active")) &&
				(!options?.stock || options.stock === "all" || (options.stock === "out" ? product.stock_quantity === 0 : options.stock === "low" ? product.stock_quantity > 0 && product.stock_quantity <= product.reorder_level : product.stock_quantity > product.reorder_level)) &&
				(!query || `${product.name} ${product.sku}`.toLowerCase().includes(query)),
			).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
			const start = (page - 1) * 10;
			return { count: filtered.length, next: start + 10 < filtered.length ? page + 1 : null, results: filtered.slice(start, start + 10) };
		}
	},
	importFile: async (orgId: Id, file: File) => {
		const body = new FormData();
		body.set("file", file);
		return (await api.post<{ success: boolean; created: number }>("products/import/", body, organizationConfig(orgId))).data;
	},
	list: async (orgId: Id) =>
		(await api.get<Product[]>("products/", organizationConfig(orgId))).data,
	get: async (orgId: Id, id: Id) =>
		(await api.get<Product>(`products/${id}/`, organizationConfig(orgId))).data,
	create: async (orgId: Id, input: ProductInput) =>
		(await api.post<Product>("products/", input, organizationConfig(orgId)))
			.data,
	update: async (orgId: Id, id: Id, input: Partial<ProductInput>) =>
		(
			await api.patch<Product>(
				`products/${id}/`,
				input,
				organizationConfig(orgId),
			)
		).data,
	remove: async (orgId: Id, id: Id) => {
		await api.delete(`products/${id}/`, organizationConfig(orgId));
	},
};

export const inventoryApi = {
	adjustStock: async (
		orgId: Id,
		input: { product_id: Id; quantity_delta: number; reason: string },
	) =>
		(
			await api.post<Envelope<StockAdjustment>>(
				"inventory/adjustments/",
				input,
				organizationConfig(orgId),
			)
		).data.data,
	movements: async (orgId: Id, productId?: Id) =>
		(
			await api.get<Envelope<StockMovement[]>>("inventory/movements/", {
				...organizationConfig(orgId),
				params: productId ? { product_id: productId } : undefined,
			})
		).data.data,
};

export const ordersApi = {
	list: async (orgId: Id) =>
		(await api.get<Envelope<Order[]>>("orders/", organizationConfig(orgId)))
			.data.data,
	get: async (orgId: Id, id: Id) =>
		(await api.get<Envelope<Order>>(`orders/${id}/`, organizationConfig(orgId)))
			.data.data,
	create: async (orgId: Id, input: DraftOrderInput) =>
		(
			await api.post<Envelope<Order>>(
				"orders/",
				input,
				organizationConfig(orgId),
			)
		).data.data,
	update: async (orgId: Id, id: Id, input: DraftOrderInput) =>
		(
			await api.patch<Envelope<Order>>(
				`orders/${id}/`,
				input,
				organizationConfig(orgId),
			)
		).data.data,
	confirm: async (orgId: Id, id: Id) =>
		(
			await api.post<
				Envelope<Pick<Order, "id" | "order_number" | "status" | "total_amount">>
			>(`orders/${id}/confirm/`, {}, organizationConfig(orgId))
		).data.data,
	cancel: async (orgId: Id, id: Id) =>
		(
			await api.post<Envelope<Order>>(
				`orders/${id}/cancel/`,
				{},
				organizationConfig(orgId),
			)
		).data.data,
	invoice: async (orgId: Id, id: Id) =>
		(
			await api.get<Blob>(`orders/${id}/invoice/`, {
				...organizationConfig(orgId),
				responseType: "blob",
			})
		).data,
};

export const analyticsApi = {
	summary: async (orgId: Id, dates?: { from?: string; to?: string }) =>
		(
			await api.get<Envelope<DashboardSummary>>("dashboard/summary/", {
				...organizationConfig(orgId),
				params: dates,
			})
		).data.data,
	salesTrend: async (orgId: Id) =>
		(
			await api.get<Envelope<SalesTrend[]>>("dashboard/sales-trend/", {
				...organizationConfig(orgId),
				params: { period: "monthly" },
			})
		).data.data,
	topProducts: async (orgId: Id, limit = 5) =>
		(
			await api.get<Envelope<TopProduct[]>>("dashboard/top-products/", {
				...organizationConfig(orgId),
				params: { limit },
			})
		).data.data,
};

export const auditApi = {
	list: async (orgId: Id) =>
		(
			await api.get<Envelope<AuditLog[]>>(
				"audit-logs/",
				organizationConfig(orgId),
			)
		).data.data,
};

export function apiErrorMessage(error: unknown): string {
	if (axios.isAxiosError(error)) {
		const data = error.response?.data;
		if (typeof data?.message === "string") return data.message;
		if (typeof data?.detail === "string") return data.detail;
		if (data && typeof data === "object") {
			const first = Object.values(data).find(
				(value) => typeof value === "string" || Array.isArray(value),
			);
			if (typeof first === "string") return first;
			if (Array.isArray(first) && typeof first[0] === "string") return first[0];
		}
		return error.message;
	}
	return error instanceof Error
		? error.message
		: "An unexpected error occurred.";
}
