"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { apiErrorMessage, inventoryApi, type StockMovement } from "@/lib/utils";

export function StockMovements({
	organizationId,
	refreshKey,
}: {
	organizationId: string;
	refreshKey: number;
}) {
	const [movements, setMovements] = useState<StockMovement[]>([]);
	const [visibleCount, setVisibleCount] = useState(10);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		void inventoryApi
			.movements(organizationId)
			.then((data) => {
				if (active) {
					setMovements(data);
					setError("");
				}
			})
			.catch((cause) => {
				if (active) setError(apiErrorMessage(cause));
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [organizationId, refreshKey]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Stock movements</CardTitle>
				<CardDescription>
					History of receipts, sales, imports, and manual adjustments.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{error && (
					<p role="alert" className="mb-4 text-sm text-destructive">
						{error}
					</p>
				)}
				{loading && movements.length === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">
						Loading stock movements...
					</p>
				) : movements.length === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">
						No stock movements yet.
					</p>
				) : (
					<>
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Date</TableHead>
										<TableHead>Product</TableHead>
										<TableHead>Reason</TableHead>
										<TableHead className="text-right">Change</TableHead>
										<TableHead className="text-right">Stock</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{movements.slice(0, visibleCount).map((movement) => (
										<TableRow key={movement.id}>
											<TableCell className="whitespace-nowrap text-muted-foreground">
												{new Date(movement.created_at).toLocaleString()}
											</TableCell>
											<TableCell>
												<span className="font-medium">
													{movement.product_name}
												</span>
												<span className="block text-xs text-muted-foreground">
													{movement.product_sku}
												</span>
											</TableCell>
											<TableCell>{movement.reason}</TableCell>
											<TableCell
												className={`text-right font-medium ${movement.quantity_delta > 0 ? "text-emerald-600" : "text-destructive"}`}>
												{movement.quantity_delta > 0 ? "+" : ""}
												{movement.quantity_delta}
											</TableCell>
											<TableCell className="text-right whitespace-nowrap">
												{movement.quantity_before} → {movement.quantity_after}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
						{visibleCount < movements.length && (
							<div className="mt-4 text-center">
								<Button
									type="button"
									variant="outline"
									onClick={() => setVisibleCount((count) => count + 10)}>
									Show more
								</Button>
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
