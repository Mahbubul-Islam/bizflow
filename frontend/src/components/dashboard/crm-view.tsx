"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/forms/app-select";
import { AppDateTimePicker } from "@/components/forms/app-date-time-picker";
import { apiErrorMessage, crmApi, type CrmActivity, type Customer, type Deal, type FollowUp, type Lead, type Member, type Order } from "@/lib/utils";

const stages: Deal["stage"][] = ["NEW", "CONTACTED", "PROPOSAL", "WON", "LOST"];
const statuses: Lead["status"][] = ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED"];

export function CrmView({ organizationId, customers, orders, members, canManage, currency, onSaved }: { organizationId: string; customers: Customer[]; orders: Order[]; members: Member[]; canManage: boolean; currency: string; onSaved: () => void }) {
	const [leads, setLeads] = useState<Lead[]>([]);
	const [deals, setDeals] = useState<Deal[]>([]);
	const [tasks, setTasks] = useState<FollowUp[]>([]);
	const [activities, setActivities] = useState<CrmActivity[]>([]);
	const [summary, setSummary] = useState<Awaited<ReturnType<typeof crmApi.summary>>>();
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const [leadAssignee, setLeadAssignee] = useState("");
	const [dealSubject, setDealSubject] = useState("");
	const [taskSubject, setTaskSubject] = useState("");
	const [taskAssignee, setTaskAssignee] = useState("");
	const [dueAt, setDueAt] = useState("");
	const [activitySubject, setActivitySubject] = useState("");
	const [activityKind, setActivityKind] = useState<CrmActivity["kind"]>("CALL");
	const refresh = useCallback(async () => {
		if (!organizationId) return;
		const [nextLeads, nextDeals, nextTasks, nextActivities, nextSummary] = await Promise.all([
			crmApi.leads.list(organizationId), crmApi.deals.list(organizationId),
			crmApi.followUps.list(organizationId), crmApi.activities.list(organizationId),
			crmApi.summary(organizationId),
		]);
		setLeads(nextLeads);
		setDeals(nextDeals);
		setTasks(nextTasks);
		setActivities(nextActivities);
		setSummary(nextSummary);
	}, [organizationId]);
	useEffect(() => {
		const initial = setTimeout(() => { void refresh().catch((cause) => setError(apiErrorMessage(cause))); }, 0);
		return () => clearTimeout(initial);
	}, [refresh]);
	async function run(action: () => Promise<unknown>): Promise<boolean> {
		setBusy(true); setError(""); setNotice("");
		try { await action(); await refresh(); onSaved(); window.dispatchEvent(new Event("bizflow-my-work-updated")); setNotice("CRM changes saved."); return true; }
		catch (cause) { setError(apiErrorMessage(cause)); return false; }
		finally { setBusy(false); }
	}
	async function moveDeal(deal: Deal, stage: Deal["stage"]) {
		if (stage === deal.stage) return;
		setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, stage } : item));
		setBusy(true); setError(""); setNotice("");
		try {
			const saved = await crmApi.deals.update(organizationId, deal.id, { stage });
			setDeals((current) => current.map((item) => item.id === deal.id ? saved : item));
			await refresh();
			onSaved();
			setNotice(`Deal moved to ${stage.toLowerCase()}.`);
		} catch (cause) {
			setDeals((current) => current.map((item) => item.id === deal.id ? deal : item));
			setError(apiErrorMessage(cause));
		} finally { setBusy(false); }
	}
	function data(event: FormEvent<HTMLFormElement>) { event.preventDefault(); return new FormData(event.currentTarget); }
	return <div className="space-y-6">
		{error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>}
		{notice && <p role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">{notice}</p>}
		<div className="grid gap-4 sm:grid-cols-3">
			{[["Open pipeline", new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(summary?.pipeline_value ?? 0))], ["Lead conversion", `${summary?.conversion_rate ?? 0}%`], ["Overdue follow-ups", summary?.overdue_follow_ups ?? 0]].map(([label, value]) => <Card key={label}><CardContent><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>)}
		</div>
		{canManage && <div className="grid items-start gap-4 lg:grid-cols-3">
			<Card><CardHeader><CardTitle>New lead</CardTitle></CardHeader><CardContent><form id="crm-lead-form" className="flex flex-col gap-3" onSubmit={(event) => { const formElement = event.currentTarget; const form = data(event); void run(() => crmApi.leads.create(organizationId, { name: String(form.get("name")), email: String(form.get("email")), phone: String(form.get("phone")), source: String(form.get("source")), assigned_to: leadAssignee || null })).then((saved) => { if (saved) { formElement.reset(); setLeadAssignee(""); } }); }}><Input name="name" placeholder="Prospect name" required /><Input name="email" type="email" placeholder="Email" /><Input name="phone" placeholder="Phone" /><Input name="source" placeholder="Source" /><AppSelect ariaLabel="Assign lead" value={leadAssignee} onValueChange={setLeadAssignee} options={[{ value: "", label: "Unassigned" }, ...members.map((member) => ({ value: member.user, label: `${member.first_name} ${member.last_name}`.trim() || member.email }))]} placeholder="Unassigned" className="w-full" /><Button type="submit" disabled={busy} className="w-full">Add lead</Button></form></CardContent></Card>
			<Card><CardHeader><CardTitle>New deal</CardTitle></CardHeader><CardContent><form id="crm-deal-form" className="flex flex-col gap-3" onSubmit={(event) => { const formElement = event.currentTarget; const form = data(event); const subject = dealSubject; if (!subject) { setError("Select a lead or customer for the deal."); return; } void run(() => crmApi.deals.create(organizationId, { title: String(form.get("title")), value: String(form.get("value")), lead: subject.startsWith("lead:") ? subject.slice(5) : null, customer: subject.startsWith("customer:") ? subject.slice(9) : null })).then((saved) => { if (saved) { formElement.reset(); setDealSubject(""); } }); }}><Input name="title" placeholder="Opportunity title" required /><Input name="value" type="number" min="0" step="0.01" placeholder="Value" required /><AppSelect ariaLabel="Deal lead or customer" value={dealSubject} onValueChange={setDealSubject} options={[...leads.map((lead) => ({ value: `lead:${lead.id}`, label: `Lead: ${lead.name}` })), ...customers.map((customer) => ({ value: `customer:${customer.id}`, label: `Customer: ${customer.name}` }))]} placeholder="Select lead or customer" className="w-full" /><Button type="submit" disabled={busy} className="w-full">Add deal</Button></form></CardContent></Card>
			<Card><CardHeader><CardTitle>New follow-up</CardTitle></CardHeader><CardContent><form id="crm-follow-up-form" className="flex flex-col gap-3" onSubmit={(event) => { const formElement = event.currentTarget; const form = data(event); const subject = taskSubject; if (!subject || !taskAssignee) { setError("Select a lead or customer and an assignee."); return; } if (!dueAt) { setError("Choose a follow-up date and time."); return; } void run(() => crmApi.followUps.create(organizationId, { title: String(form.get("title")), due_at: new Date(dueAt).toISOString(), assigned_to: taskAssignee, lead: subject.startsWith("lead:") ? subject.slice(5) : null, customer: subject.startsWith("customer:") ? subject.slice(9) : null })).then((saved) => { if (saved) { formElement.reset(); setTaskSubject(""); setTaskAssignee(""); setDueAt(""); } }); }}><Input name="title" placeholder="Task title" required /><AppDateTimePicker value={dueAt} onValueChange={setDueAt} ariaLabel="Follow-up due date and time" /><AppSelect ariaLabel="Follow-up lead or customer" value={taskSubject} onValueChange={setTaskSubject} options={[...leads.map((lead) => ({ value: `lead:${lead.id}`, label: `Lead: ${lead.name}` })), ...customers.map((customer) => ({ value: `customer:${customer.id}`, label: `Customer: ${customer.name}` }))]} placeholder="Select lead or customer" className="w-full" /><AppSelect ariaLabel="Assign follow-up" value={taskAssignee} onValueChange={setTaskAssignee} options={members.map((member) => ({ value: member.user, label: `${member.first_name} ${member.last_name}`.trim() || member.email }))} placeholder="Assign member" className="w-full" /><Button type="submit" disabled={busy} className="w-full">Add follow-up</Button></form></CardContent></Card>
		</div>}
		<Card><CardHeader><CardTitle>Leads</CardTitle></CardHeader><CardContent className="space-y-3">{leads.map((lead) => <div key={lead.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><strong>{lead.name}</strong><p className="text-sm text-muted-foreground">{lead.email || lead.phone || "No contact details"} · {lead.source || "Unknown source"}</p></div><div className="flex items-center gap-2"><AppSelect ariaLabel={`Status for ${lead.name}`} disabled={!canManage || busy || lead.status === "CONVERTED"} value={lead.status} onValueChange={(value) => void run(() => crmApi.leads.update(organizationId, lead.id, { status: value as Lead["status"] }))} options={[...statuses, ...(lead.status === "CONVERTED" ? ["CONVERTED" as const] : [])].map((status) => ({ value: status, label: status }))} placeholder="Lead status" className="w-40" />{canManage && lead.status === "QUALIFIED" && <Button size="sm" disabled={busy} onClick={() => void run(() => crmApi.convert(organizationId, lead.id))}>Convert</Button>}</div></div>)}{!leads.length && <p className="text-sm text-muted-foreground">No leads found.</p>}</CardContent></Card>
		<Card><CardHeader><CardTitle>Deal pipeline</CardTitle><CardDescription>Create a deal above, then use its stage dropdown to move it through the pipeline.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-5">{stages.map((stage) => <div key={stage} className="rounded-lg bg-muted/50 p-3"><h3 className="mb-3 font-semibold">{stage}</h3><div className="space-y-2">{deals.filter((deal) => deal.stage === stage).map((deal) => <div key={deal.id} className="rounded-lg border bg-card p-3 text-sm"><strong>{deal.title}</strong><p>{new Intl.NumberFormat("en-BD", { style: "currency", currency }).format(Number(deal.value))}</p>{canManage && <><AppSelect ariaLabel={`Stage for ${deal.title}`} value={deal.stage} disabled={busy} onValueChange={(value) => void moveDeal(deal, value as Deal["stage"])} options={stages.map((stage) => ({ value: stage, label: stage }))} placeholder="Deal stage" className="mt-2 w-full" />{deal.stage === "WON" && deal.customer && <AppSelect ariaLabel={`Order for ${deal.title}`} value={deal.sales_order ?? ""} disabled={busy} onValueChange={(value) => void run(() => crmApi.deals.update(organizationId, deal.id, { sales_order: value || null }))} options={[{ value: "", label: "No sales order" }, ...orders.filter((order) => order.customer_id === deal.customer).map((order) => ({ value: order.id, label: order.order_number }))]} placeholder="Link sales order" className="mt-2 w-full" />}</>}</div>)}</div></div>)}</CardContent></Card>
		<Card><CardHeader><CardTitle>Follow-ups</CardTitle></CardHeader><CardContent className="space-y-2">{tasks.filter((task) => !task.completed_at).sort((a, b) => a.due_at.localeCompare(b.due_at)).map((task) => <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><strong>{task.title}</strong><p className={new Date(task.due_at) < new Date() ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>Due {new Date(task.due_at).toLocaleString()}</p></div>{canManage && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => crmApi.complete(organizationId, task.id))}>Complete</Button>}</div>)}{!tasks.some((task) => !task.completed_at) && <p className="text-sm text-muted-foreground">No open follow-ups.</p>}</CardContent></Card>
		{canManage && <Card><CardHeader><CardTitle>Log activity</CardTitle></CardHeader><CardContent><form className="flex flex-wrap gap-2" onSubmit={(event) => { const formElement = event.currentTarget; const form = data(event); const subject = activitySubject; if (!subject) { setError("Select a lead or customer for the activity."); return; } void run(() => crmApi.activities.create(organizationId, { kind: activityKind, description: String(form.get("description")), occurred_at: new Date().toISOString(), lead: subject.startsWith("lead:") ? subject.slice(5) : null, customer: subject.startsWith("customer:") ? subject.slice(9) : null })).then((saved) => { if (saved) { formElement.reset(); setActivitySubject(""); setActivityKind("CALL"); } }); }}><AppSelect ariaLabel="Activity subject" value={activitySubject} onValueChange={setActivitySubject} options={[...leads.map((lead) => ({ value: `lead:${lead.id}`, label: lead.name })), ...customers.map((customer) => ({ value: `customer:${customer.id}`, label: customer.name }))]} placeholder="Lead or customer" className="w-48" /><AppSelect ariaLabel="Activity kind" value={activityKind} onValueChange={(value) => setActivityKind(value as CrmActivity["kind"])} options={["CALL", "MEETING", "EMAIL", "NOTE"].map((kind) => ({ value: kind, label: kind }))} placeholder="Activity kind" className="w-36" /><Textarea name="description" placeholder="What happened?" required className="min-w-48 flex-1" /><Button type="submit" disabled={busy}>Log activity</Button></form><p className="mt-3 text-xs text-muted-foreground">{activities.length} activities recorded</p></CardContent></Card>}
		<Card>
			<CardHeader><CardTitle>Activity log</CardTitle><CardDescription>Calls, meetings, emails, and notes for leads and customers.</CardDescription></CardHeader>
			<CardContent className="space-y-3">
				{[...activities].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).map((activity) => (
					<div key={activity.id} className="rounded-lg border p-4">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p className="font-medium">{activity.subject_name} <span className="font-normal text-muted-foreground">· {activity.kind.toLowerCase()}</span></p>
							<time className="text-xs text-muted-foreground" dateTime={activity.occurred_at}>{new Date(activity.occurred_at).toLocaleString()}</time>
						</div>
						<p className="mt-2 whitespace-pre-wrap text-sm">{activity.description}</p>
					</div>
				))}
				{activities.length === 0 && <p className="text-sm text-muted-foreground">No activity logged yet.</p>}
			</CardContent>
		</Card>
	</div>;
}
