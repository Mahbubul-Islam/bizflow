"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FeedbackDialog } from "@/components/feedback/modal-feedback";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	apiErrorMessage,
	categoriesApi,
	inventoryApi,
	productsApi,
	type Category,
	type Product,
} from "@/lib/utils";
import { AppSelect } from "@/components/forms/app-select";

export function InventoryManagement({
	categories,
	organizationId,
	onSaved,
}: {
	categories: Category[];
	organizationId: string;
	onSaved: () => void;
}) {
	const [editing, setEditing] = useState<Category | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const [notice, setNotice] = useState<string>();
	const [deleting, setDeleting] = useState<Category | null>(null);
	const [productSearch, setProductSearch] = useState("");
	const [productMatches, setProductMatches] = useState<Product[]>([]);
	const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
	useEffect(() => {
		let active = true;
		const timer = window.setTimeout(() => {
			void productsApi
				.page(organizationId, 1, productSearch, { active: true })
				.then((page) => {
					if (active) setProductMatches(page.results);
				})
				.catch((cause) => {
					if (active) setError(apiErrorMessage(cause));
				});
		}, 250);
		return () => {
			active = false;
			window.clearTimeout(timer);
		};
	}, [organizationId, productSearch]);
	async function run(label: string, operation: () => Promise<unknown>) {
		setBusy(true);
		setError(undefined);
		try {
			await operation();
			setNotice(label);
			onSaved();
			return true;
		} catch (cause) {
			setError(apiErrorMessage(cause));
			return false;
		} finally {
			setBusy(false);
		}
	}
	async function saveCategory(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		const data = new FormData(form);
		const input = {
			name: String(data.get("name") ?? "").trim(),
			description: String(data.get("description") ?? "").trim(),
		};
		const ok = await run(
			editing ? "Category updated." : "Category created.",
			() =>
				editing
					? categoriesApi.update(organizationId, editing.id, input)
					: categoriesApi.create(organizationId, input),
		);
		if (ok) {
			setEditing(null);
			form.reset();
		}
	}
	async function adjust(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		const data = new FormData(form);
		const input = {
			product_id: String(data.get("product_id") ?? ""),
			quantity_delta: Number(data.get("quantity_delta")),
			reason: String(data.get("reason") ?? "").trim(),
		};
		const ok = await run("Stock updated.", () =>
			inventoryApi.adjustStock(organizationId, input),
		);
		if (ok) {
			form.reset();
			setSelectedProduct(null);
			setProductSearch("");
		}
	}
	return (
		<div className="grid items-start gap-6 xl:grid-cols-2">
			<FeedbackDialog
				open={!!error}
				title="Inventory action failed"
				message={error}
				onClose={() => setError(undefined)}
			/>
			<FeedbackDialog
				open={!!deleting}
				title="Remove category"
				message={`Remove ${deleting?.name ?? "this category"}?`}
				onClose={() => setDeleting(null)}
				action={{
					label: "Remove",
					onClick: () => {
						const category = deleting;
						setDeleting(null);
						if (category)
							void run("Category removed.", () =>
								categoriesApi.remove(organizationId, category.id),
							);
					},
				}}
			/>
			{notice && (
				<p
					role="status"
					className="xl:col-span-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
					{notice}
				</p>
			)}
			<Card>
				<CardHeader>
					<CardTitle>{editing ? "Edit category" : "Add category"}</CardTitle>
					<CardDescription>Organize products in the catalog.</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						key={editing?.id ?? "new-category"}
						onSubmit={(event) => void saveCategory(event)}
						className="space-y-4">
						<div>
							<Label htmlFor="category-name">Name</Label>
							<Input
								id="category-name"
								name="name"
								defaultValue={editing?.name ?? ""}
								required
								className="mt-2"
							/>
						</div>
						<div>
							<Label htmlFor="category-description">Description</Label>
							<Textarea
								id="category-description"
								name="description"
								defaultValue={editing?.description ?? ""}
								className="mt-2"
							/>
						</div>
						<div className="flex gap-2">
							<Button type="submit" disabled={busy}>
								{editing ? "Save category" : "Create category"}
							</Button>
							{editing && (
								<Button
									type="button"
									variant="outline"
									onClick={() => setEditing(null)}>
									Cancel
								</Button>
							)}
						</div>
					</form>
					<div className="mt-6 space-y-2 border-t border-border pt-4">
						{categories.map((item) => (
							<div
								key={item.id}
								className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
								<span>
									{item.name}
									{!item.is_active && " (inactive)"}
								</span>
								<div className="flex gap-1">
									<Button
										size="xs"
										variant="outline"
										onClick={() => setEditing(item)}>
										Edit
									</Button>
									{item.is_active && (
										<Button
											size="xs"
											variant="ghost"
											disabled={busy}
											onClick={() => setDeleting(item)}>
											Remove
										</Button>
									)}
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Adjust stock</CardTitle>
					<CardDescription>
						Use a positive quantity to add stock or a negative quantity to
						remove it.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={(event) => void adjust(event)} className="space-y-4">
						<div>
							<Label htmlFor="stock-product-search">Find product</Label>
							<Input
								id="stock-product-search"
								value={productSearch}
								onChange={(event) => setProductSearch(event.target.value)}
								placeholder="Search by name or SKU"
								className="mt-2"
							/>
						</div>
						<div>
							<Label htmlFor="stock-product">Product</Label>
							<AppSelect
								id="stock-product"
								name="product_id"
								value={selectedProduct?.id ?? ""}
								onValueChange={(value) =>
									setSelectedProduct(
										productMatches.find((item) => item.id === value) ??
											(selectedProduct?.id === value ? selectedProduct : null),
									)
								}
								options={[
									...(selectedProduct &&
									!productMatches.some((item) => item.id === selectedProduct.id)
										? [
												{
													value: selectedProduct.id,
													label: `${selectedProduct.name} (${selectedProduct.stock_quantity} in stock)`,
												},
											]
										: []),
									...productMatches.map((item) => ({
										value: item.id,
										label: `${item.name} (${item.stock_quantity} in stock)`,
									})),
								]}
								placeholder="Select product"
								required
								className="mt-2 w-full"
							/>
						</div>
						<div>
							<Label htmlFor="stock-change">Quantity change</Label>
							<Input
								id="stock-change"
								name="quantity_delta"
								type="number"
								step="1"
								required
								className="mt-2"
							/>
						</div>
						<div>
							<Label htmlFor="stock-reason">Reason</Label>
							<Input
								id="stock-reason"
								name="reason"
								required
								maxLength={255}
								className="mt-2"
							/>
						</div>
						<Button type="submit" disabled={busy || !selectedProduct}>
							Update stock
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
