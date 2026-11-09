"use client";

import { useState, type FormEvent } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { ProductPicker } from "@/components/orders/product-picker";
import { AppSelect } from "@/components/forms/app-select";
import { FeedbackDialog } from "@/components/feedback/modal-feedback";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	apiErrorMessage,
	ordersApi,
	productsApi,
	type Customer,
	type DraftOrderInput,
	type Order,
	type Product,
} from "@/lib/utils";

type Actions = {
	manage: boolean;
	confirm: boolean;
	cancel: boolean;
	invoice: boolean;
};
type Line = { product_id: string; quantity: number };

export function OrdersView({
	orders,
	products,
	customers,
	organizationId,
	currency,
	actions,
	onSaved,
}: {
	orders: Order[];
	products: Product[];
	customers: Customer[];
	organizationId: string;
	currency: string;
	actions: Actions;
	onSaved: () => void;
}) {
	const [editing, setEditing] = useState<Order | null>(null);
	const [creating, setCreating] = useState(false);
	const [items, setItems] = useState<Line[]>([{ product_id: "", quantity: 1 }]);
	const [customerId, setCustomerId] = useState("");
	const [discount, setDiscount] = useState("0.00");
	const [tax, setTax] = useState("0.00");
	const [notes, setNotes] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const [notice, setNotice] = useState<string>();
	const [confirming, setConfirming] = useState<{
		order: Order;
		action: "confirm" | "cancel";
	} | null>(null);
	const [details, setDetails] = useState<Order | null>(null);
	const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
	const availableProducts = [
		...products.filter(
			(product) => !selectedProducts.some((item) => item.id === product.id),
		),
		...selectedProducts,
	];
	const money = (value: string) =>
		new Intl.NumberFormat("en-BD", {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		}).format(Number(value));
	function reset() {
		setEditing(null);
		setCreating(false);
		setItems([{ product_id: "", quantity: 1 }]);
		setSelectedProducts([]);
		setCustomerId("");
		setDiscount("0.00");
		setTax("0.00");
		setNotes("");
	}
	function edit(order: Order) {
		setEditing(order);
		setCreating(false);
		setItems(
			order.items.map((item) => ({
				product_id: item.product_id,
				quantity: item.quantity,
			})),
		);
		setCustomerId(order.customer_id ?? "");
		setDiscount(order.discount_amount);
		setTax(order.tax_amount);
		setNotes(order.notes);
		if (organizationId)
			void Promise.all(
				order.items.map((item) =>
					productsApi.get(organizationId, item.product_id),
				),
			)
				.then(setSelectedProducts)
				.catch((cause) => setError(apiErrorMessage(cause)));
	}
	async function run(label: string, operation: () => Promise<unknown>) {
		setBusy(true);
		setError(undefined);
		setNotice(undefined);
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
	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (
			!items.length ||
			items.some(
				(item) =>
					!item.product_id ||
					!Number.isInteger(item.quantity) ||
					item.quantity < 1,
			) ||
			new Set(items.map((item) => item.product_id)).size !== items.length
		) {
			setError(
				"Choose distinct products and a positive quantity for each item.",
			);
			return;
		}
		if (
			items.some((item) => {
				const product = availableProducts.find(
					(candidate) => candidate.id === item.product_id,
				);
				return (
					!product ||
					!product.is_active ||
					product.stock_quantity < item.quantity
				);
			})
		) {
			setError(
				"Choose available products and quantities within current stock.",
			);
			return;
		}
		const input: DraftOrderInput = {
			customer_id: customerId || null,
			items,
			discount_amount: discount,
			tax_amount: tax,
			notes,
		};
		const ok = await run(editing ? "Draft updated." : "Draft created.", () =>
			editing
				? ordersApi.update(organizationId, editing.id, input)
				: ordersApi.create(organizationId, input),
		);
		if (ok) reset();
	}
	async function download(order: Order) {
		await run("Invoice downloaded.", async () => {
			const blob = await ordersApi.invoice(organizationId, order.id);
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `invoice-${order.order_number}.pdf`;
			link.click();
			window.setTimeout(() => URL.revokeObjectURL(url), 1000);
		});
	}
	return (
		<div className="space-y-6">
			<Dialog
				open={!!details}
				onOpenChange={(open) => {
					if (!open) setDetails(null);
				}}>
				<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Order {details?.order_number}</DialogTitle>
						<DialogDescription>Order details</DialogDescription>
					</DialogHeader>
					{details && (
						<div className="space-y-4 text-sm">
							<div className="grid gap-3 sm:grid-cols-2">
								<div>
									<p className="text-xs text-muted-foreground">Customer</p>
									<p className="font-medium">
										{customers.find(
											(customer) => customer.id === details.customer_id,
										)?.name ?? "No customer"}
									</p>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">Status</p>
									<Badge
										variant={
											details.status === "CONFIRMED"
												? "default"
												: details.status === "CANCELLED"
													? "destructive"
													: "secondary"
										}>
										{details.status.toLowerCase()}
									</Badge>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">Created</p>
									<p>
										{new Intl.DateTimeFormat("en-GB", {
											dateStyle: "medium",
											timeStyle: "short",
										}).format(new Date(details.created_at))}
									</p>
								</div>
								{details.confirmed_at && (
									<div>
										<p className="text-xs text-muted-foreground">Confirmed</p>
										<p>
											{new Intl.DateTimeFormat("en-GB", {
												dateStyle: "medium",
												timeStyle: "short",
											}).format(new Date(details.confirmed_at))}
										</p>
									</div>
								)}
							</div>
							<div className="space-y-2 border-t border-border pt-3">
								<h3 className="font-semibold">Items</h3>
								{details.items.map((item, index) => (
									<div
										key={`${item.product_id}-${index}`}
										className="flex justify-between gap-3">
										<span>
											{item.product_name} (qty {item.quantity} at{" "}
											{money(item.unit_price)})
										</span>
										<span className="shrink-0">{money(item.line_total)}</span>
									</div>
								))}
							</div>
							<dl className="space-y-1 border-t border-border pt-3">
								{[
									["Subtotal", details.subtotal],
									["Discount", details.discount_amount],
									["Tax", details.tax_amount],
									["Total", details.total_amount],
								].map(([label, value]) => (
									<div key={label} className="flex justify-between gap-3">
										<dt>{label}</dt>
										<dd className={label === "Total" ? "font-semibold" : ""}>
											{money(value)}
										</dd>
									</div>
								))}
							</dl>
							{details.notes && (
								<div className="border-t border-border pt-3">
									<p className="font-semibold">Notes</p>
									<p className="whitespace-pre-wrap">{details.notes}</p>
								</div>
							)}
						</div>
					)}
				</DialogContent>
			</Dialog>
			<FeedbackDialog
				open={!!error}
				title="Order action failed"
				message={error}
				onClose={() => setError(undefined)}
			/>
			<FeedbackDialog
				open={!!confirming}
				title={
					confirming?.action === "confirm" ? "Confirm order" : "Cancel order"
				}
				message={
					confirming?.action === "confirm"
						? `Confirm ${confirming.order.order_number}? Stock will be reduced.`
						: `Cancel ${confirming?.order.order_number}?`
				}
				onClose={() => setConfirming(null)}
				action={{
					label:
						confirming?.action === "confirm" ? "Confirm order" : "Cancel order",
					onClick: () => {
						const pending = confirming;
						setConfirming(null);
						if (pending)
							void run(
								pending.action === "confirm"
									? "Order confirmed."
									: "Order cancelled.",
								() =>
									pending.action === "confirm"
										? ordersApi.confirm(organizationId, pending.order.id)
										: ordersApi.cancel(organizationId, pending.order.id),
							);
					},
				}}
			/>
			{notice && (
				<p
					role="status"
					className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
					{notice}
				</p>
			)}
			{actions.manage && (
				<div className="flex justify-end">
					<Button
						onClick={() => {
							reset();
							setCreating(true);
						}}>
						<Plus className="size-4" /> New draft order
					</Button>
				</div>
			)}
			{actions.manage && (creating || editing) && (
				<Card>
					<CardHeader>
						<CardTitle>
							{editing ? `Edit ${editing.order_number}` : "New draft order"}
						</CardTitle>
						<CardDescription>
							Add products, then save the draft.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={(event) => void save(event)} className="space-y-4">
							<div className="grid gap-4 sm:grid-cols-3">
								<div>
									<Label htmlFor="order-customer">Customer</Label>
									<AppSelect
										id="order-customer"
										value={customerId}
										onValueChange={setCustomerId}
										options={[
											{ value: "", label: "No customer" },
											...customers
												.filter((item) => item.is_active)
												.map((item) => ({ value: item.id, label: item.name })),
										]}
										placeholder="No customer"
										className="mt-2 w-full"
									/>
								</div>
								<div>
									<Label htmlFor="order-discount">Discount</Label>
									<Input
										id="order-discount"
										type="number"
										min="0"
										step="0.01"
										value={discount}
										onChange={(event) => setDiscount(event.target.value)}
										className="mt-2"
										required
									/>
								</div>
								<div>
									<Label htmlFor="order-tax">Tax</Label>
									<Input
										id="order-tax"
										type="number"
										min="0"
										step="0.01"
										value={tax}
										onChange={(event) => setTax(event.target.value)}
										className="mt-2"
										required
									/>
								</div>
							</div>
							<div>
								<Label>Items</Label>
								<div className="mt-2 space-y-2">
									{items.map((item, index) => (
										<div key={index} className="flex flex-wrap gap-2">
											<ProductPicker
												products={availableProducts}
												organizationId={organizationId || undefined}
												onSelect={(product) =>
													setSelectedProducts((current) => [
														...current.filter((item) => item.id !== product.id),
														product,
													])
												}
												label={`Product for item ${index + 1}`}
												value={item.product_id}
												onChange={(next) =>
													setItems((current) =>
														current.map((line, position) =>
															position === index
																? { ...line, product_id: next }
																: line,
														),
													)
												}
											/>
											<Input
												aria-label={`Quantity for item ${index + 1}`}
												type="number"
												min="1"
												max={
													availableProducts.find(
														(product) => product.id === item.product_id,
													)?.stock_quantity
												}
												step="1"
												value={item.quantity}
												onChange={(event) =>
													setItems((current) =>
														current.map((line, position) =>
															position !== index
																? line
																: {
																		...line,
																		quantity: Number(event.target.value),
																	},
														),
													)
												}
												className="w-24"
												required
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												aria-label={`Remove item ${index + 1}`}
												onClick={() =>
													setItems((current) =>
														current.filter((_, position) => position !== index),
													)
												}>
												<Trash2 className="size-4" />
											</Button>
										</div>
									))}
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="mt-2"
									onClick={() =>
										setItems((current) => [
											...current,
											{ product_id: "", quantity: 1 },
										])
									}>
									<Plus className="size-4" /> Add item
								</Button>
							</div>
							<div>
								<Label htmlFor="order-notes">Notes</Label>
								<Textarea
									id="order-notes"
									value={notes}
									onChange={(event) => setNotes(event.target.value)}
									className="mt-2"
								/>
							</div>
							<div className="flex gap-2">
								<Button type="submit" disabled={busy}>
									{busy ? "Saving..." : editing ? "Save draft" : "Create draft"}
								</Button>
								<Button
									type="button"
									variant="outline"
									disabled={busy}
									onClick={reset}>
									Cancel
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			)}
			<Card>
				<CardHeader>
					<CardTitle>All orders</CardTitle>
					<CardDescription>
						Drafts, confirmed sales, and cancellations.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{orders.length ? (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Order</TableHead>
										<TableHead>Date</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="text-right">Amount</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{orders.map((order) => (
										<TableRow key={order.id}>
											<TableCell className="font-semibold">
												{order.order_number}
											</TableCell>
											<TableCell>
												{new Intl.DateTimeFormat("en-GB", {
													dateStyle: "medium",
													timeZone: "UTC",
												}).format(new Date(order.created_at))}
											</TableCell>
											<TableCell>
												<Badge
													variant={
														order.status === "CONFIRMED"
															? "default"
															: order.status === "CANCELLED"
																? "destructive"
																: "secondary"
													}>
													{order.status.toLowerCase()}
												</Badge>
											</TableCell>
											<TableCell className="text-right">
												{money(order.total_amount)}
											</TableCell>
											<TableCell className="space-x-1 text-right">
												<Button
													size="xs"
													variant="outline"
													onClick={() => setDetails(order)}>
													Details
												</Button>
												{order.status === "DRAFT" && actions.manage && (
													<Button
														size="xs"
														variant="outline"
														onClick={() => edit(order)}>
														Edit
													</Button>
												)}
												{order.status === "DRAFT" && actions.confirm && (
													<Button
														size="xs"
														disabled={busy}
														onClick={() =>
															setConfirming({ order, action: "confirm" })
														}>
														Confirm
													</Button>
												)}
												{order.status !== "CANCELLED" && actions.cancel && (
													<Button
														size="xs"
														variant="outline"
														disabled={busy}
														onClick={() =>
															setConfirming({ order, action: "cancel" })
														}>
														Cancel
													</Button>
												)}
												{order.status === "CONFIRMED" && actions.invoice && (
													<Button
														size="xs"
														variant="outline"
														disabled={busy}
														onClick={() => void download(order)}>
														<Download className="size-3" /> Invoice
													</Button>
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						<p className="py-10 text-center text-sm text-muted-foreground">
							No orders to show yet.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
