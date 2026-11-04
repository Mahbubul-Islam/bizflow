"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Upload } from "lucide-react";
import { FeedbackDialog } from "@/components/feedback/modal-feedback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiErrorMessage, productsApi, type Category, type Product, type ProductInput } from "@/lib/utils";
import { InventoryManagement } from "@/components/dashboard/inventory-management";

function money(value: string, currency: string) {
	return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
}

const catalogCache = new Map<string, { savedAt: number; data: Awaited<ReturnType<typeof productsApi.page>> }>();
const catalogCacheDuration = 30_000;

export function ProductsView({ products, categories, currency, organizationId, canManage, search, onSaved }: {
	products: Product[];
	categories: Category[];
	currency: string;
	organizationId: string;
	canManage: boolean;
	search: string;
	onSaved: () => void;
}) {
	const [editing, setEditing] = useState<Product | null>(null);
	const [creating, setCreating] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const [success, setSuccess] = useState<string>();
	const [deleting, setDeleting] = useState<Product | null>(null);
	const [importing, setImporting] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [catalog, setCatalog] = useState<Product[]>([]);
	const [catalogPage, setCatalogPage] = useState(1);
	const [catalogNext, setCatalogNext] = useState<number | null>(null);
	const [catalogCount, setCatalogCount] = useState(0);
	const [catalogLoading, setCatalogLoading] = useState(Boolean(organizationId));
	const [catalogError, setCatalogError] = useState<string>();
	const [catalogSearch, setCatalogSearch] = useState("");
	const [categoryFilter, setCategoryFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
	const [stockFilter, setStockFilter] = useState<"all" | "in" | "low" | "out">("all");
	const [catalogRefresh, setCatalogRefresh] = useState(0);
	function resetCatalog() {
		setCatalog([]);
		setCatalogPage(1);
		setCatalogNext(null);
		setCatalogCount(0);
		setCatalogLoading(true);
		setCatalogError(undefined);
	}
	useEffect(() => {
		const nextSearch = search.trim();
		const timer = window.setTimeout(() => { setCatalog([]); setCatalogPage(1); setCatalogNext(null); setCatalogCount(0); setCatalogSearch(nextSearch); setCatalogLoading(true); setCatalogError(undefined); }, nextSearch ? 250 : 0);
		return () => window.clearTimeout(timer);
	}, [search]);
	useEffect(() => {
		if (!organizationId) return;
		let active = true;
		const cacheKey = JSON.stringify([organizationId, catalogPage, catalogSearch, categoryFilter, statusFilter, stockFilter]);
		const cached = catalogCache.get(cacheKey);
		const useCached = catalogPage === 1 && cached && Date.now() - cached.savedAt < catalogCacheDuration && catalogRefresh === 0;
		if (useCached) {
			queueMicrotask(() => {
				if (!active) return;
				setCatalog((current) => catalogPage === 1 ? cached.data.results : [...current, ...cached.data.results]);
				setCatalogNext(cached.data.next);
				setCatalogCount(cached.data.count);
				setCatalogLoading(false);
			});
		}
		if (!useCached) queueMicrotask(() => { if (active) setCatalogLoading(true); });
		void productsApi.page(organizationId, catalogPage, catalogSearch, { category: categoryFilter, status: statusFilter, stock: stockFilter }).then((result) => {
			if (!active) return;
			catalogCache.set(cacheKey, { savedAt: Date.now(), data: result });
			setCatalog((current) => catalogPage === 1 ? result.results : [...current, ...result.results]);
			setCatalogNext(result.next);
			setCatalogCount(result.count);
		}).catch((cause) => { if (active) setCatalogError(apiErrorMessage(cause)); }).finally(() => { if (active) setCatalogLoading(false); });
		return () => { active = false; };
	}, [organizationId, catalogPage, catalogSearch, categoryFilter, statusFilter, stockFilter, catalogRefresh]);
	const displayedProducts = organizationId ? catalog : products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase()));
	function refreshCatalog() { catalogCache.clear(); resetCatalog(); setCatalogRefresh((value) => value + 1); }

	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const value = (name: string) => String(form.get(name) ?? "").trim();
		const input: ProductInput = {
			name: value("name"),
			sku: value("sku"),
			category: value("category") || null,
			cost_price: value("cost_price"),
			selling_price: value("selling_price"),
			reorder_level: Number(value("reorder_level")),
			description: value("description"),
		};
		setBusy(true);
		setError(undefined);
		try {
			if (editing) {
				const updated = await productsApi.update(organizationId, editing.id, input);
				setCatalog((current) => current.map((product) => product.id === updated.id ? updated : product));
				catalogCache.clear();
			} else {
				await productsApi.create(organizationId, input);
				refreshCatalog();
			}
			setSuccess(editing ? "Product updated." : "Product created.");
			setEditing(null);
			setCreating(false);
			onSaved();
		} catch (cause) {
			setError(apiErrorMessage(cause));
		} finally {
			setBusy(false);
		}
	}

	async function importFile(file: File) {
		setImporting(true);
		setError(undefined);
		setSuccess(undefined);
		try {
			const result = await productsApi.importFile(organizationId, file);
			setSuccess(`${result.created} products and their opening stock imported.`);
			onSaved();
			refreshCatalog();
		} catch (cause) {
			setError(apiErrorMessage(cause));
		} finally {
			setImporting(false);
		}
	}

	function productForm() {
		return <form key={editing?.id ?? "new"} onSubmit={(event) => void save(event)} className="grid gap-4 sm:grid-cols-2">
			<div><Label htmlFor="product-name">Product name</Label><Input id="product-name" name="name" defaultValue={editing?.name ?? ""} required maxLength={255} className="mt-2" /></div>
			<div><Label htmlFor="product-sku">SKU</Label><Input id="product-sku" name="sku" defaultValue={editing?.sku ?? ""} required className="mt-2" /></div>
			<div><Label htmlFor="product-category">Category</Label><select id="product-category" name="category" defaultValue={editing?.category ?? ""} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">No category</option>{categories.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
			<div><Label htmlFor="product-reorder">Reorder level</Label><Input id="product-reorder" name="reorder_level" type="number" min="0" step="1" defaultValue={editing?.reorder_level ?? 5} required className="mt-2" /></div>
			<div><Label htmlFor="product-cost">Cost price</Label><Input id="product-cost" name="cost_price" type="number" min="0" step="0.01" defaultValue={editing?.cost_price ?? ""} required className="mt-2" /></div>
			<div><Label htmlFor="product-price">Selling price</Label><Input id="product-price" name="selling_price" type="number" min="0" step="0.01" defaultValue={editing?.selling_price ?? ""} required className="mt-2" /></div>
			<div className="sm:col-span-2"><Label htmlFor="product-description">Description</Label><Textarea id="product-description" name="description" defaultValue={editing?.description ?? ""} className="mt-2" /></div>
			<div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Create product"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(null); setCreating(false); }}>Cancel</Button></div>
		</form>;
	}

	return <div className="space-y-6">
		<FeedbackDialog open={!!error} title="Product could not be saved" message={error} onClose={() => setError(undefined)} />
		<FeedbackDialog open={!!deleting} title="Remove product" message={`Remove ${deleting?.name ?? "this product"} from the active catalog?`} onClose={() => setDeleting(null)} action={{ label: "Remove", onClick: () => { const product = deleting; setDeleting(null); if (!product) return; setBusy(true); void productsApi.remove(organizationId, product.id).then(() => { setSuccess("Product removed."); refreshCatalog(); onSaved(); }).catch((cause) => setError(apiErrorMessage(cause))).finally(() => setBusy(false)); } }} />
		{success && <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{success}</p>}
		{canManage && <div className="flex justify-end"><Button onClick={() => { setEditing(null); setCreating(true); setSuccess(undefined); }} disabled={busy}><Plus className="size-4" /> Add product</Button></div>}
		{canManage && creating && <Card><CardHeader><CardTitle>Add product</CardTitle><CardDescription>Stock quantity is managed separately from product details.</CardDescription></CardHeader><CardContent>{productForm()}</CardContent></Card>}
		{canManage && <Card>
			<CardHeader className="flex flex-row items-center justify-between gap-4">
				<div><CardTitle>Import products with stock</CardTitle><CardDescription>Upload a CSV or Excel file with opening stock.</CardDescription></div>
				<Button type="button" variant="outline" size="sm" aria-expanded={importOpen} onClick={() => setImportOpen((open) => !open)}>{importOpen ? "Hide" : "Show"}</Button>
			</CardHeader>
			{importOpen && <CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Required columns: name, sku, cost_price, selling_price, stock_quantity. Optional: reorder_level, description, category. Each SKU must be unique. The first sheet is used, with up to 500 products per file.</p>{categories.some((item) => item.is_active) && <p className="text-xs text-muted-foreground">Available categories: {categories.filter((item) => item.is_active).map((item) => item.name).join(", ")}</p>}<div className="flex flex-wrap items-center gap-3"><label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Upload className="size-4" />{importing ? "Importing..." : "Choose CSV or Excel file"}<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={importing || busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} /></label><a className="text-sm font-medium text-primary underline-offset-4 hover:underline" download="bizflow-products-template.csv" href="data:text/csv;charset=utf-8,name%2Csku%2Ccost_price%2Cselling_price%2Cstock_quantity%2Creorder_level%2Cdescription%2Ccategory%0AExample%20product%2CEX-001%2C10.00%2C15.00%2C25%2C5%2C%2C">Download CSV template</a></div></CardContent>}
		</Card>}
		<Dialog open={canManage && editing !== null} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}>
			<DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
				<DialogHeader><DialogTitle>Edit {editing?.name}</DialogTitle><DialogDescription>Stock quantity is managed separately from product details.</DialogDescription></DialogHeader>
				{editing && productForm()}
			</DialogContent>
		</Dialog>
		<Card><CardHeader><CardTitle>Product catalog</CardTitle><CardDescription>Prices and current stock in one place.</CardDescription></CardHeader><CardContent>
			<div className="mb-4 grid gap-3 sm:grid-cols-3">
				<div><Label htmlFor="catalog-category">Category</Label><select id="catalog-category" value={categoryFilter} onChange={(event) => { resetCatalog(); setCategoryFilter(event.target.value); }} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">All categories</option><option value="none">No category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
				<div><Label htmlFor="catalog-status">Status</Label><select id="catalog-status" value={statusFilter} onChange={(event) => { resetCatalog(); setStatusFilter(event.target.value as typeof statusFilter); }} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="all">All products</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
				<div><Label htmlFor="catalog-stock">Stock</Label><select id="catalog-stock" value={stockFilter} onChange={(event) => { resetCatalog(); setStockFilter(event.target.value as typeof stockFilter); }} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="all">Any stock level</option><option value="in">Above reorder level</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></div>
			</div>
			{displayedProducts.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Price</TableHead><TableHead className="text-right">Stock</TableHead>{canManage && <TableHead className="text-right">Action</TableHead>}</TableRow></TableHeader><TableBody>{displayedProducts.map((product) => <TableRow key={product.id}><TableCell className="font-semibold">{product.name}</TableCell><TableCell className="text-muted-foreground">{product.sku}</TableCell><TableCell>{money(product.selling_price, currency)}</TableCell><TableCell className="text-right"><Badge variant={product.stock_quantity <= product.reorder_level ? "destructive" : "secondary"}>{product.stock_quantity} in stock</Badge></TableCell>{canManage && <TableCell className="space-x-1 text-right"><Button size="xs" variant="outline" onClick={() => { setEditing(product); setCreating(false); setSuccess(undefined); }}>Edit</Button>{product.is_active && <Button size="xs" variant="ghost" disabled={busy} onClick={() => setDeleting(product)}>Remove</Button>}</TableCell>}</TableRow>)}</TableBody></Table></div> : <p className="py-12 text-center text-sm text-muted-foreground">{catalogLoading ? "Loading products..." : "No products found."}</p>}
			{catalogError && <p role="alert" className="mt-3 text-sm text-destructive">{catalogError}</p>}
			{organizationId && <div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Showing {displayedProducts.length} of {catalogCount} products</p>{catalogNext && <Button type="button" variant="outline" disabled={catalogLoading} onClick={() => { setCatalogLoading(true); setCatalogError(undefined); setCatalogPage(catalogNext); }}>{catalogLoading ? "Loading..." : "Load more"}</Button>}</div>}
		</CardContent></Card>
		{canManage && <InventoryManagement categories={categories} organizationId={organizationId} onSaved={() => { onSaved(); refreshCatalog(); }} />}
	</div>;
}
