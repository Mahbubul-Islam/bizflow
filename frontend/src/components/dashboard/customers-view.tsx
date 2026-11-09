"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { FeedbackDialog } from "@/components/feedback/modal-feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiErrorMessage, crmApi, customersApi, ordersApi, type CrmActivity, type Customer, type Deal, type Order } from "@/lib/utils";

export function CustomersView({ customers, orders, organizationId, canManage, canViewCrm, canInvoice, onSaved }: {
	customers: Customer[]; orders: Order[]; organizationId: string; canManage: boolean; canViewCrm: boolean; canInvoice: boolean; onSaved: () => void;
}) {
	const [selected, setSelected] = useState<Customer | null>(null);
	const [orderStatus, setOrderStatus] = useState("ALL");
	const [selectedOrderId, setSelectedOrderId] = useState("");
	const [deals, setDeals] = useState<Deal[]>([]);
	const [activities, setActivities] = useState<CrmActivity[]>([]);
	const [editing, setEditing] = useState<Customer | null>(null);
	const [creating, setCreating] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const [notice, setNotice] = useState<string>();
	const [deleting, setDeleting] = useState<Customer | null>(null);
	async function downloadInvoice(order: Order) {
		try {
			const blob = await ordersApi.invoice(organizationId, order.id);
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url; link.download = `invoice-${order.order_number}.pdf`; link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (cause) { setError(apiErrorMessage(cause)); }
	}
	useEffect(() => {
		if (!selected || !canViewCrm || !organizationId) return;
		let active = true;
		Promise.all([crmApi.deals.list(organizationId), crmApi.activities.list(organizationId)]).then(([nextDeals, nextActivities]) => { if (active) { setDeals(nextDeals); setActivities(nextActivities); } }).catch((cause) => { if (active) setError(apiErrorMessage(cause)); });
		return () => { active = false; };
	}, [selected, canViewCrm, organizationId]);
	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const text = (name: string) => String(data.get(name) ?? "").trim();
		const input = { name: text("name"), email: text("email"), phone: text("phone"), address: text("address"), notes: text("notes") };
		setBusy(true); setError(undefined);
		try {
			if (editing) await customersApi.update(organizationId, editing.id, input);
			else await customersApi.create(organizationId, input);
			setNotice(editing ? "Customer updated." : "Customer created.");
			setEditing(null); setCreating(false); onSaved();
		} catch (cause) { setError(apiErrorMessage(cause)); }
		finally { setBusy(false); }
	}
	const matchingOrders = orders.filter((order) =>
		order.customer_id === selected?.id && (orderStatus === "ALL" || order.status === orderStatus),
	);
	const selectedOrder = matchingOrders.find((order) => order.id === selectedOrderId) ?? matchingOrders[0];
	return <div className="space-y-6">
		<FeedbackDialog open={!!error} title="Customer could not be saved" message={error} onClose={() => setError(undefined)} />
		<FeedbackDialog open={!!deleting} title="Remove customer" message={`Remove ${deleting?.name ?? "this customer"} from active customers?`} onClose={() => setDeleting(null)} action={{ label: "Remove", onClick: () => { const customer = deleting; setDeleting(null); if (!customer) return; setBusy(true); void customersApi.remove(organizationId, customer.id).then(() => { setNotice("Customer removed."); onSaved(); }).catch((cause) => setError(apiErrorMessage(cause))).finally(() => setBusy(false)); } }} />
		{notice && <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</p>}
		<Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{selected?.name}</DialogTitle>
					<DialogDescription>Customer details and order history</DialogDescription>
				</DialogHeader>
				{selected && <div className="space-y-4">
					<dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
						{[["Email", selected.email], ["Phone", selected.phone], ["Address", selected.address], ["Status", selected.is_active ? "Active" : "Inactive"], ["Created", new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(selected.created_at))], ["Notes", selected.notes]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value || "None"}</dd></div>)}
					</dl>
					<section className="space-y-3 border-t border-border pt-3">
						<div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Orders</h3><select aria-label="Filter customer orders by status" value={orderStatus} onChange={(event) => { setOrderStatus(event.target.value); setSelectedOrderId(""); }} className="h-9 w-40 rounded-xl border border-input bg-background px-3 text-sm"><option value="ALL">All statuses</option><option value="DRAFT">Draft</option><option value="CONFIRMED">Confirmed</option><option value="CANCELLED">Cancelled</option></select></div>
						{matchingOrders.length > 1 && <select aria-label="Choose an order" value={selectedOrder?.id ?? ""} onChange={(event) => setSelectedOrderId(event.target.value)} className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm">{matchingOrders.map((order) => <option key={order.id} value={order.id}>{order.order_number} - {order.status}</option>)}</select>}
						{selectedOrder ? <div className="rounded-xl border border-border p-3 text-sm">
							<div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{selectedOrder.order_number}</span><span className="text-muted-foreground">{selectedOrder.status} - {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(selectedOrder.created_at))}</span></div>
							<div className="mt-2 space-y-1 border-t border-border pt-2">{selectedOrder.items.map((item, index) => <div key={`${item.product_id}-${index}`} className="flex justify-between gap-2"><span>{item.product_name} (qty {item.quantity} at {item.unit_price})</span><span>{item.line_total}</span></div>)}</div>
							<div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-2 text-muted-foreground"><span>Subtotal: {selectedOrder.subtotal}</span><span>Discount: {selectedOrder.discount_amount}</span><span>Tax: {selectedOrder.tax_amount}</span><span className="font-semibold text-foreground">Total: {selectedOrder.total_amount}</span></div>
							{selectedOrder.notes && <p className="mt-2">Notes: {selectedOrder.notes}</p>}
							{selectedOrder.status === "CONFIRMED" && canInvoice && <Button size="xs" variant="outline" className="mt-2" onClick={() => void downloadInvoice(selectedOrder)}>Invoice</Button>}
						</div> : <p className="text-sm text-muted-foreground">No matching orders.</p>}
					</section>
					{canViewCrm && (deals.some((deal) => deal.customer === selected.id) || activities.some((activity) => activity.customer === selected.id)) && <div className="grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-2"><div><h3 className="font-semibold">Deals</h3>{deals.filter((deal) => deal.customer === selected.id).map((deal) => <p key={deal.id}>{deal.title} - {deal.stage} - {deal.value}</p>)}</div><div><h3 className="font-semibold">Activity</h3>{activities.filter((activity) => activity.customer === selected.id).map((activity) => <p key={activity.id}>{activity.kind}: {activity.description}</p>)}</div></div>}
				</div>}
			</DialogContent>
		</Dialog>
		{canManage && <div className="flex justify-end"><Button onClick={() => { setEditing(null); setCreating(true); setNotice(undefined); }}><Plus className="size-4" /> Add customer</Button></div>}
		{canManage && (creating || editing) && <Card><CardHeader><CardTitle>{editing ? `Edit ${editing.name}` : "Add customer"}</CardTitle><CardDescription>Keep contact details current.</CardDescription></CardHeader><CardContent><form key={editing?.id ?? "new"} onSubmit={(event) => void save(event)} className="grid gap-4 sm:grid-cols-2">
			<div><Label htmlFor="customer-name">Name</Label><Input id="customer-name" name="name" defaultValue={editing?.name ?? ""} required className="mt-2" /></div>
			<div><Label htmlFor="customer-email">Email</Label><Input id="customer-email" name="email" type="email" defaultValue={editing?.email ?? ""} className="mt-2" /></div>
			<div><Label htmlFor="customer-phone">Phone</Label><Input id="customer-phone" name="phone" defaultValue={editing?.phone ?? ""} className="mt-2" /></div>
			<div><Label htmlFor="customer-address">Address</Label><Input id="customer-address" name="address" defaultValue={editing?.address ?? ""} className="mt-2" /></div>
			<div className="sm:col-span-2"><Label htmlFor="customer-notes">Notes</Label><Textarea id="customer-notes" name="notes" defaultValue={editing?.notes ?? ""} className="mt-2" /></div>
			<div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Create customer"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(null); setCreating(false); }}>Cancel</Button></div>
		</form></CardContent></Card>}
		<Card><CardHeader><CardTitle>Customers</CardTitle><CardDescription>People and businesses you work with.</CardDescription></CardHeader><CardContent>{customers.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{customers.map((customer) => <TableRow key={customer.id}><TableCell className="font-semibold">{customer.name}</TableCell><TableCell>{customer.email || "â€”"}</TableCell><TableCell>{customer.phone || "â€”"}</TableCell><TableCell>{customer.is_active ? "Active" : "Inactive"}</TableCell><TableCell className="space-x-1 text-right"><Button size="xs" variant="outline" onClick={() => { setSelected(customer); setOrderStatus("ALL"); setSelectedOrderId(""); }}>Details</Button>{canManage && <><Button size="xs" variant="outline" onClick={() => { setEditing(customer); setCreating(false); setNotice(undefined); }}>Edit</Button>{customer.is_active && <Button size="xs" variant="ghost" disabled={busy} onClick={() => setDeleting(customer)}>Remove</Button>}</>}</TableCell></TableRow>)}</TableBody></Table></div> : <p className="py-12 text-center text-sm text-muted-foreground">No customers found.</p>}</CardContent></Card>
	</div>;
}

