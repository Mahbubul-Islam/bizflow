"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Download, ShoppingBag, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SalesTrend, TopProduct } from "@/lib/utils";

type Period = "6" | "12" | "all";
const chartConfig = { sales: { label: "Revenue", color: "#178458" } } satisfies ChartConfig;

function money(value: number | string, currency: string) {
	return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
}

function csvCell(value: string | number) {
	return `"${String(value).replaceAll('"', '""')}"`;
}

export function ReportsView({ trend, topProducts, currency, organizationName }: {
	trend: SalesTrend[];
	topProducts: TopProduct[];
	currency: string;
	organizationName: string;
}) {
	const [period, setPeriod] = useState<Period>("6");
	const sorted = [...trend].sort((a, b) => a.month.localeCompare(b.month));
	const months = period === "all" ? sorted : sorted.slice(-Number(period));
	const revenue = months.reduce((total, item) => total + Number(item.sales), 0);
	const orders = months.reduce((total, item) => total + item.orders, 0);
	const chartData = months.map((item) => ({
		...item,
		label: new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${item.month}-01T00:00:00Z`)),
		value: Number(item.sales),
	}));

	function downloadCsv() {
		const rows = [
			["Month", `Revenue (${currency})`, "Confirmed orders"],
			...months.map((item) => [item.month, item.sales, item.orders]),
		];
		const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
		const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
		const link = document.createElement("a");
		link.href = url;
		link.download = `bizflow-sales-${period === "all" ? "all-time" : `last-${period}-active-months`}.csv`;
		link.click();
		URL.revokeObjectURL(url);
	}

	return <div className="space-y-6">
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div>
				<p className="text-sm font-medium">{organizationName}</p>
				<p className="text-xs text-muted-foreground">Confirmed orders only · Monthly sales</p>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<label htmlFor="report-period" className="text-sm text-muted-foreground">Period</label>
				<select id="report-period" value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
					<option value="6">Latest 6 sales months</option>
					<option value="12">Latest 12 sales months</option>
					<option value="all">All time</option>
				</select>
				<Button variant="outline" size="sm" onClick={downloadCsv} disabled={!months.length}><Download className="size-4" /> Export CSV</Button>
			</div>
		</div>
		<div className="grid gap-4 sm:grid-cols-3">
			{[
				{ label: "Revenue", value: money(revenue, currency), icon: TrendingUp },
				{ label: "Confirmed orders", value: orders.toLocaleString("en-BD"), icon: ShoppingBag },
				{ label: "Average order value", value: money(orders ? revenue / orders : 0, currency), icon: TrendingUp },
			].map(({ label, value, icon: Icon }) => <Card key={label} className="gap-0 py-5"><CardContent className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p></div><span className="rounded-2xl bg-primary/10 p-2.5 text-primary"><Icon className="size-5" /></span></CardContent></Card>)}
		</div>
		<Card>
			<CardHeader><CardTitle>Sales trend</CardTitle><CardDescription>Revenue from confirmed orders by month</CardDescription></CardHeader>
			<CardContent>{chartData.length ? <ChartContainer config={chartConfig} className="h-72 w-full" initialDimension={{ width: 700, height: 288 }}><BarChart data={chartData} accessibilityLayer><CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(value: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(value)} /><ChartTooltip content={<ChartTooltipContent formatter={(value) => money(Number(value), currency)} />} /><Bar dataKey="value" name="Revenue" fill="var(--color-sales)" radius={[5, 5, 0, 0]} isAnimationActive={false} /></BarChart></ChartContainer> : <p className="py-16 text-center text-sm text-muted-foreground">No confirmed sales yet.</p>}</CardContent>
		</Card>
		<div className="grid gap-6 xl:grid-cols-2">
			<Card><CardHeader><CardTitle>Monthly breakdown</CardTitle><CardDescription>Sales and order count for the selected period</CardDescription></CardHeader><CardContent>{months.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader><TableBody>{[...months].reverse().map((item) => <TableRow key={item.month}><TableCell className="font-medium">{item.month}</TableCell><TableCell className="text-right">{item.orders}</TableCell><TableCell className="text-right">{money(item.sales, currency)}</TableCell></TableRow>)}</TableBody></Table></div> : <p className="py-10 text-center text-sm text-muted-foreground">No monthly sales to show.</p>}</CardContent></Card>
			<Card><CardHeader><CardTitle>Top products</CardTitle><CardDescription>Best sellers by units, across all time</CardDescription></CardHeader><CardContent>{topProducts.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader><TableBody>{topProducts.map((item) => <TableRow key={item.product_id}><TableCell className="font-medium">{item.name}</TableCell><TableCell className="text-right">{item.quantity_sold}</TableCell><TableCell className="text-right">{money(item.revenue, currency)}</TableCell></TableRow>)}</TableBody></Table></div> : <p className="py-10 text-center text-sm text-muted-foreground">No product sales to show.</p>}</CardContent></Card>
		</div>
	</div>;
}
