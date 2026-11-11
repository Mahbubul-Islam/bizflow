"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { AppSelect } from "@/components/forms/app-select";
import {
	apiErrorMessage,
	inventoryApi,
	productsApi,
	type Product,
	type PurchaseOrder,
} from "@/lib/utils";

export function PurchaseOrders({
	organizationId,
	canManage,
	onSaved,
}: {
	organizationId: string;
	canManage: boolean;
	onSaved: () => void;
}) {
	const [lowStock, setLowStock] = useState<Product[]>([]);
	const [orders, setOrders] = useState<PurchaseOrder[]>([]);
	const [selectedProduct, setSelectedProduct] = useState("");
	const [supplier, setSupplier] = useState("");
	const [quantity, setQuantity] = useState("1");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [loading, setLoading] = useState(true);
	const [receipt, setReceipt] = useState<{
		order: PurchaseOrder;
		itemId: string;
		remaining: number;
		productName: string;
	} | null>(null);
	const [receiptQuantity, setReceiptQuantity] = useState("1");

	const reload = useCallback(async () => {
		const [purchaseOrders, firstPage] = await Promise.all([
			inventoryApi.purchaseOrders(organizationId),
			productsApi.page(organizationId, 1, "", { lowStock: true }),
		]);
		const products = [...firstPage.results];
		let next = firstPage.next;
		while (next !== null) {
			const page = await productsApi.page(organizationId, next, "", {
				lowStock: true,
			});
			products.push(...page.results);
			next = page.next;
		}
		setOrders(purchaseOrders);
		setLowStock(products);
		setSelectedProduct((current) =>
			products.some((item) => item.id === current)
				? current
				: (products[0]?.id ?? ""),
		);
	}, [organizationId]);

	useEffect(() => {
		let active = true;
		void Promise.resolve()
			.then(() => reload())
			.catch((cause) => {
				if (active) setError(apiErrorMessage(cause));
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [reload]);

	async function create(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const product = lowStock.find((item) => item.id === selectedProduct);
		if (!product) return;
		setBusy(true);
		setError("");
		setNotice("");
		try {
			await inventoryApi.createPurchaseOrder(organizationId, {
				supplier_name: supplier.trim(),
				items: [
					{
						product_id: product.id,
						quantity_ordered: Number(quantity),
						unit_cost: product.cost_price,
					},
				],
			});
			setSupplier("");
			setQuantity("1");
			setNotice("Purchase order created.");
			await reload();
		} catch (cause) {
			setError(apiErrorMessage(cause));
		} finally {
			setBusy(false);
		}
	}

	async function receive(
		order: PurchaseOrder,
		itemId: string,
		quantityReceived: number,
	) {
		setBusy(true);
		setError("");
		setNotice("");
		try {
			await inventoryApi.receivePurchaseOrder(organizationId, order.id, [
				{ item_id: itemId, quantity: quantityReceived },
			]);
			setReceipt(null);
			setNotice("Stock received and recorded in inventory movements.");
			await reload();
			onSaved();
		} catch (cause) {
			setError(apiErrorMessage(cause));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-4">
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			{notice && (
				<p role="status" className="text-sm text-primary">
					{notice}
				</p>
			)}
			<Card>
				<CardHeader>
					<CardTitle>Low stock and purchasing</CardTitle>
					<CardDescription>
						Products at or below their reorder level need attention.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{loading ? (
						<p className="text-sm text-muted-foreground">
							Loading purchasing data...
						</p>
					) : lowStock.length ? (
						<div className="space-y-2">
							{lowStock.map((product) => (
								<div
									key={product.id}
									className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-sm">
									<span className="font-medium">
										{product.name}{" "}
										<span className="text-muted-foreground">
											({product.sku})
										</span>
									</span>
									<span>
										{product.stock_quantity} in stock · reorder at{" "}
										{product.reorder_level}
									</span>
								</div>
							))}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							No products are below their reorder level.
						</p>
					)}
					{canManage && lowStock.length > 0 && (
						<form
							onSubmit={(event) => void create(event)}
							className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
							<div className="min-w-0 sm:col-span-2">
								<Label htmlFor="po-product">Product</Label>
								<AppSelect
									id="po-product"
									value={selectedProduct}
									onValueChange={setSelectedProduct}
									options={lowStock.map((product) => ({
										value: product.id,
										label: `${product.name} (${product.sku})`,
									}))}
									placeholder="Select product"
									className="mt-1 w-full"
									contentClassName="w-max max-w-[calc(100vw-2rem)] min-w-(--anchor-width)"
									required
								/>
							</div>
							<div>
								<Label htmlFor="po-supplier">Supplier</Label>
								<Input
									id="po-supplier"
									value={supplier}
									onChange={(event) => setSupplier(event.target.value)}
									required
									maxLength={200}
									className="mt-1"
								/>
							</div>
							<div>
								<Label htmlFor="po-quantity">Order quantity</Label>
								<Input
									id="po-quantity"
									type="number"
									min="1"
									step="1"
									value={quantity}
									onChange={(event) => setQuantity(event.target.value)}
									required
									className="mt-1"
								/>
							</div>
							<div className="flex items-end">
								<Button
									type="submit"
									disabled={busy || !selectedProduct || !Number.isInteger(Number(quantity)) || Number(quantity) < 1}>
									{busy ? "Saving..." : "Create purchase order"}
								</Button>
							</div>
						</form>
					)}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Purchase orders</CardTitle>
					<CardDescription>
						Receive all or part of an order when stock arrives.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{orders.length ? (
						orders.map((order) => (
							<div key={order.id} className="rounded-md border p-4 text-sm">
								<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
									<span className="font-semibold">{order.supplier_name}</span>
									<span className="capitalize text-muted-foreground">
										{order.status.replaceAll("_", " ")} ·{" "}
										{new Date(order.created_at).toLocaleDateString()}
									</span>
								</div>
								{order.items.map((item) => (
									<div
										key={item.id}
										className="flex flex-wrap items-center justify-between gap-3 py-1">
										<span>
											{item.product_name} ({item.sku}) ·{" "}
											{item.quantity_received} / {item.quantity_ordered}{" "}
											received
										</span>
										{canManage &&
											item.quantity_received < item.quantity_ordered && (
												<Button
													size="sm"
													variant="outline"
													disabled={busy}
													onClick={() => {
														const remaining =
															item.quantity_ordered - item.quantity_received;
														setReceipt({
															order,
															itemId: item.id,
															remaining,
															productName: item.product_name,
														});
												setReceiptQuantity(String(remaining));
														setError("");
													}}>
													Receive stock
												</Button>
											)}
									</div>
								))}
							</div>
						))
					) : (
						<p className="text-sm text-muted-foreground">
							No purchase orders yet.
						</p>
					)}
				</CardContent>
			</Card>
			<Dialog
				open={receipt !== null}
				onOpenChange={(open) => {
					if (!open && !busy) setReceipt(null);
				}}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Receive stock</DialogTitle>
						<DialogDescription>
							{receipt?.productName} from {receipt?.order.supplier_name}. Enter
							the quantity delivered.
						</DialogDescription>
					</DialogHeader>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							if (
								!receipt ||
								!Number.isInteger(Number(receiptQuantity)) ||
								Number(receiptQuantity) < 1 ||
								Number(receiptQuantity) > receipt.remaining
							)
								return;
							void receive(receipt.order, receipt.itemId, Number(receiptQuantity));
						}}
						className="space-y-5">
						<div className="space-y-2">
							<Label htmlFor="receipt-quantity">
								Quantity received (1–{receipt?.remaining})
							</Label>
							<Input
								id="receipt-quantity"
								type="number"
								min="1"
								max={receipt?.remaining}
								step="1"
								required
								value={receiptQuantity}
								onChange={(event) =>
									setReceiptQuantity(event.target.value)
								}
							/>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								disabled={busy}
								onClick={() => setReceipt(null)}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									busy ||
									!receipt ||
									!Number.isInteger(Number(receiptQuantity)) ||
									Number(receiptQuantity) < 1 ||
									Number(receiptQuantity) > receipt.remaining
								}>
								{busy ? "Receiving..." : "Confirm receipt"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
