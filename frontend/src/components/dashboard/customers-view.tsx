"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { FeedbackDialog } from "@/components/feedback/modal-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiErrorMessage, customersApi, type Customer } from "@/lib/utils";

export function CustomersView({ customers, organizationId, canManage, onSaved }: {
	customers: Customer[]; organizationId: string; canManage: boolean; onSaved: () => void;
}) {
	const [editing, setEditing] = useState<Customer | null>(null);
	const [creating, setCreating] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const [notice, setNotice] = useState<string>();
	const [deleting, setDeleting] = useState<Customer | null>(null);
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
	return <div className="space-y-6">
		<FeedbackDialog open={!!error} title="Customer could not be saved" message={error} onClose={() => setError(undefined)} />
		<FeedbackDialog open={!!deleting} title="Remove customer" message={`Remove ${deleting?.name ?? "this customer"} from active customers?`} onClose={() => setDeleting(null)} action={{ label: "Remove", onClick: () => { const customer = deleting; setDeleting(null); if (!customer) return; setBusy(true); void customersApi.remove(organizationId, customer.id).then(() => { setNotice("Customer removed."); onSaved(); }).catch((cause) => setError(apiErrorMessage(cause))).finally(() => setBusy(false)); } }} />
		{notice && <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</p>}
		{canManage && <div className="flex justify-end"><Button onClick={() => { setEditing(null); setCreating(true); setNotice(undefined); }}><Plus className="size-4" /> Add customer</Button></div>}
		{canManage && (creating || editing) && <Card><CardHeader><CardTitle>{editing ? `Edit ${editing.name}` : "Add customer"}</CardTitle><CardDescription>Keep contact details current.</CardDescription></CardHeader><CardContent><form key={editing?.id ?? "new"} onSubmit={(event) => void save(event)} className="grid gap-4 sm:grid-cols-2">
			<div><Label htmlFor="customer-name">Name</Label><Input id="customer-name" name="name" defaultValue={editing?.name ?? ""} required className="mt-2" /></div>
			<div><Label htmlFor="customer-email">Email</Label><Input id="customer-email" name="email" type="email" defaultValue={editing?.email ?? ""} className="mt-2" /></div>
			<div><Label htmlFor="customer-phone">Phone</Label><Input id="customer-phone" name="phone" defaultValue={editing?.phone ?? ""} className="mt-2" /></div>
			<div><Label htmlFor="customer-address">Address</Label><Input id="customer-address" name="address" defaultValue={editing?.address ?? ""} className="mt-2" /></div>
			<div className="sm:col-span-2"><Label htmlFor="customer-notes">Notes</Label><Textarea id="customer-notes" name="notes" defaultValue={editing?.notes ?? ""} className="mt-2" /></div>
			<div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Create customer"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(null); setCreating(false); }}>Cancel</Button></div>
		</form></CardContent></Card>}
		<Card><CardHeader><CardTitle>Customers</CardTitle><CardDescription>People and businesses you work with.</CardDescription></CardHeader><CardContent>{customers.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead>{canManage && <TableHead className="text-right">Action</TableHead>}</TableRow></TableHeader><TableBody>{customers.map((customer) => <TableRow key={customer.id}><TableCell className="font-semibold">{customer.name}</TableCell><TableCell>{customer.email || "—"}</TableCell><TableCell>{customer.phone || "—"}</TableCell><TableCell>{customer.is_active ? "Active" : "Inactive"}</TableCell>{canManage && <TableCell className="space-x-1 text-right"><Button size="xs" variant="outline" onClick={() => { setEditing(customer); setCreating(false); setNotice(undefined); }}>Edit</Button>{customer.is_active && <Button size="xs" variant="ghost" disabled={busy} onClick={() => setDeleting(customer)}>Remove</Button>}</TableCell>}</TableRow>)}</TableBody></Table></div> : <p className="py-12 text-center text-sm text-muted-foreground">No customers found.</p>}</CardContent></Card>
	</div>;
}
