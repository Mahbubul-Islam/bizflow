"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { productsApi, type Product } from "@/lib/utils";

export function ProductPicker({
	products,
	organizationId,
	value,
	onChange,
	onSelect,
	label,
}: {
	products: Product[];
	organizationId?: string;
	value: string;
	onChange: (value: string) => void;
	onSelect?: (product: Product) => void;
	label: string;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [remoteMatches, setRemoteMatches] = useState<Product[]>([]);
	useEffect(() => {
		if (!organizationId || !open) return;
		let active = true;
		const timer = window.setTimeout(() => {
			void productsApi
				.page(organizationId, 1, query, { active: true })
				.then((page) => {
					if (active) setRemoteMatches(page.results);
				})
				.catch(() => {
					if (active) setRemoteMatches([]);
				});
		}, 250);
		return () => {
			active = false;
			window.clearTimeout(timer);
		};
	}, [organizationId, open, query]);
	const selected = products.find((product) => product.id === value);
	const matches = (organizationId ? remoteMatches : products).filter(
		(product) =>
			product.is_active &&
			`${product.name} ${product.sku}`
				.toLowerCase()
				.includes(query.trim().toLowerCase()),
	);
	return (
		<div
			className="relative min-w-48 flex-1"
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
			}}>
			<div className="relative">
				<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					aria-label={label}
					aria-expanded={open}
					aria-controls={`${label.replace(/\s+/g, "-").toLowerCase()}-options`}
					value={open ? query : (selected?.name ?? "")}
					placeholder={
						selected ? selected.name : "Search products by name or SKU"
					}
					onFocus={() => {
						setQuery("");
						setOpen(true);
					}}
					onChange={(event) => {
						setQuery(event.target.value);
						setOpen(true);
					}}
					onKeyDown={(event) => {
						if (event.key === "Escape") setOpen(false);
						if (event.key === "Enter") {
							event.preventDefault();
							const firstAvailable = matches.find(
								(product) => product.stock_quantity > 0,
							);
							if (open && firstAvailable) {
								onSelect?.(firstAvailable);
								onChange(firstAvailable.id);
								setOpen(false);
								setQuery("");
							}
						}
					}}
					className="pl-9"
				/>
			</div>
			{open && (
				<div
					id={`${label.replace(/\s+/g, "-").toLowerCase()}-options`}
					className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
					{matches.length ? (
						matches.map((product) => {
							const outOfStock = product.stock_quantity <= 0;
							const lowStock =
								!outOfStock && product.stock_quantity <= product.reorder_level;
							return (
								<button
									key={product.id}
									type="button"
									disabled={outOfStock}
									onClick={() => {
										onSelect?.(product);
										onChange(product.id);
										setOpen(false);
										setQuery("");
									}}
									className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground disabled:opacity-60 ${lowStock ? "text-destructive" : ""}`}>
									<span className="min-w-0">
										<span className="block truncate font-medium">
											{product.name}
										</span>
										<span className="block truncate text-xs opacity-70">
											{product.sku} · {product.selling_price}
										</span>
									</span>
									<span
										className={`shrink-0 text-xs font-semibold ${lowStock ? "text-destructive" : ""}`}>
										{outOfStock
											? "Out of stock"
											: `${product.stock_quantity} available`}
									</span>
								</button>
							);
						})
					) : (
						<p className="px-3 py-2 text-sm text-muted-foreground">
							No matching products.
						</p>
					)}
				</div>
			)}
			{selected && (
				<p
					className={`mt-1 text-xs font-medium ${selected.stock_quantity <= selected.reorder_level ? "text-destructive" : "text-muted-foreground"}`}>
					{selected.stock_quantity <= 0
						? "Out of stock"
						: `${selected.stock_quantity} available${selected.stock_quantity <= selected.reorder_level ? " · Low stock" : ""}`}
				</p>
			)}
		</div>
	);
}
