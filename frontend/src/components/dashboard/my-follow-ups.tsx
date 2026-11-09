"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Mail, MessageSquare, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppSelect } from "@/components/forms/app-select";
import {
	apiErrorMessage,
	crmApi,
	type ContactDetails,
	type Lead,
	type MyFollowUps,
} from "@/lib/utils";

const emptyWork: MyFollowUps = { tasks: [], leads: [], notifications: [] };
const updatedEvent = "bizflow-my-work-updated";

function useMyWork(organizationId: string) {
	const [data, setData] = useState<MyFollowUps>(emptyWork);
	const [error, setError] = useState("");
	const refresh = useCallback(async () => {
		if (!organizationId) return;
		try {
			setData(await crmApi.myFollowUps(organizationId));
			setError("");
		} catch (cause) {
			setError(apiErrorMessage(cause));
		}
	}, [organizationId]);
	useEffect(() => {
		const initial = setTimeout(() => {
			void refresh();
		}, 0);
		const interval = setInterval(() => {
			void refresh();
		}, 30_000);
		window.addEventListener(updatedEvent, refresh);
		return () => {
			clearTimeout(initial);
			clearInterval(interval);
			window.removeEventListener(updatedEvent, refresh);
		};
	}, [refresh]);
	return { data, error, setError, refresh };
}

export function MyFollowUpsBell({
	organizationId,
	onOpen,
}: {
	organizationId: string;
	onOpen: (targetId?: string) => void;
}) {
	const { data } = useMyWork(organizationId);
	const [open, setOpen] = useState(false);
	return (
		<div className="relative">
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={`Notifications, ${data.notifications.length} unread`}
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
				className="relative">
				<Bell className="size-5" />
				{data.notifications.length > 0 && (
					<span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 text-white">
						{data.notifications.length}
					</span>
				)}
			</Button>
			{open && (
				<section
					aria-label="Notifications"
					className="absolute right-0 z-50 mt-2 max-h-[65vh] w-[min(90vw,360px)] overflow-y-auto rounded-xl border bg-card p-3 shadow-xl">
					<div className="mb-3 flex items-center justify-between">
						<h2 className="font-semibold">Notifications</h2>
						<Button
							type="button"
							size="xs"
							variant="ghost"
							onClick={() => setOpen(false)}>
							Close
						</Button>
					</div>
					{data.notifications.length ? (
						data.notifications.map((notification) => (
							<button
								key={notification.id}
								type="button"
								className="mb-2 block w-full rounded-lg border border-primary/30 bg-primary/5 p-3 text-left hover:bg-primary/10"
								onClick={() => {
									setOpen(false);
									onOpen(
										notification.lead_id ?? notification.task_id ?? undefined,
									);
								}}>
								<span className="block text-sm font-medium">
									{notification.title}
								</span>
								<span className="block text-xs text-muted-foreground">
									{notification.lead_id
										? "Assigned lead"
										: "Assigned follow-up"}{" "}
									· View details
								</span>
							</button>
						))
					) : (
						<p className="text-sm text-muted-foreground">
							No unread notifications.
						</p>
					)}
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="mt-2 w-full"
						onClick={() => {
							setOpen(false);
							onOpen();
						}}>
						Open My Work
					</Button>
				</section>
			)}
		</div>
	);
}

function ContactActions({ contact }: { contact: ContactDetails }) {
	const phone = contact.phone.replace(/[^+\d]/g, "");
	return (
		<div className="flex flex-wrap gap-2">
			{phone && (
				<a
					href={`tel:${phone}`}
					className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
					<Phone className="size-3.5" /> Call
				</a>
			)}
			{phone && (
				<a
					href={`sms:${phone}`}
					className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
					<MessageSquare className="size-3.5" /> Message
				</a>
			)}
			{contact.email && (
				<a
					href={`mailto:${contact.email}`}
					className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
					<Mail className="size-3.5" /> Email
				</a>
			)}
		</div>
	);
}

export function MyWorkView({
	organizationId,
	focusId,
}: {
	organizationId: string;
	focusId?: string;
}) {
	const { data, error, setError, refresh } = useMyWork(organizationId);
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		if (!focusId) return;
		const timer = setTimeout(
			() =>
				document
					.getElementById(`work-${focusId}`)
					?.scrollIntoView({ behavior: "smooth", block: "center" }),
			100,
		);
		return () => clearTimeout(timer);
	}, [focusId, data]);
	async function act(operation: () => Promise<unknown>) {
		setBusy(true);
		try {
			await operation();
			await refresh();
			window.dispatchEvent(new Event(updatedEvent));
		} catch (cause) {
			setError(apiErrorMessage(cause));
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="space-y-6">
			{error && (
				<p
					role="alert"
					className="rounded-lg border border-destructive p-3 text-sm text-destructive">
					{error}
				</p>
			)}
			<Card>
				<CardHeader>
					<CardTitle>New assignments</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{data.notifications.map((notification) => (
						<div
							key={notification.id}
							className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
							<div>
								<p className="font-medium">{notification.title}</p>
								<p className="text-xs text-muted-foreground">
									{notification.lead_id
										? "Lead assigned to you"
										: "Follow-up assigned to you"}
								</p>
							</div>
							<div className="flex gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() =>
										document
											.getElementById(
												`work-${notification.lead_id ?? notification.task_id}`,
											)
											?.scrollIntoView({ behavior: "smooth", block: "center" })
									}>
									View details
								</Button>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									disabled={busy}
									onClick={() =>
										void act(() =>
											crmApi.readNotification(organizationId, notification.id),
										)
									}>
									Mark read
								</Button>
							</div>
						</div>
					))}
					{data.notifications.length === 0 && (
						<p className="text-sm text-muted-foreground">
							No unread notifications.
						</p>
					)}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Assigned leads</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{data.leads.map((lead) => (
						<div
							id={`work-${lead.id}`}
							key={lead.id}
							className="space-y-3 rounded-lg border p-4">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<h3 className="font-semibold">{lead.name}</h3>
									<p className="text-sm text-muted-foreground">
										{lead.source ? `Source: ${lead.source}` : "Lead"}
									</p>
								</div>
								<AppSelect
									ariaLabel={`Status for ${lead.name}`}
									value={lead.status}
									disabled={busy}
									onValueChange={(value) =>
										void act(() =>
											crmApi.updateMyLead(
												organizationId,
												lead.id,
												value as Lead["status"],
											),
										)
									}
									options={["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED"].map(
										(status) => ({ value: status, label: status }),
									)}
									placeholder="Lead status"
									className="w-40"
								/>
							</div>
							<p className="text-sm">
								{lead.phone || "No phone number"} ·{" "}
								{lead.email || "No email address"}
							</p>
							{lead.notes && (
								<p className="text-sm text-muted-foreground">{lead.notes}</p>
							)}
							<ContactActions
								contact={{
									name: lead.name,
									phone: lead.phone,
									email: lead.email,
									address: "",
								}}
							/>
						</div>
					))}
					{data.leads.length === 0 && (
						<p className="text-sm text-muted-foreground">
							No open leads assigned to you.
						</p>
					)}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>My follow-ups</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{data.tasks.map((task) => (
						<div
							id={`work-${task.id}`}
							key={task.id}
							className="space-y-3 rounded-lg border p-4">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<h3 className="font-semibold">{task.title}</h3>
									<p
										className={
											new Date(task.due_at) < new Date()
												? "text-sm text-destructive"
												: "text-sm text-muted-foreground"
										}>
										Due {new Date(task.due_at).toLocaleString()}
									</p>
								</div>
								<Button
									type="button"
									size="sm"
									disabled={busy}
									onClick={() =>
										void act(() => crmApi.completeMine(organizationId, task.id))
									}>
									Resolve task
								</Button>
							</div>
							<div>
								<p className="font-medium">{task.contact.name}</p>
								<p className="text-sm">
									{task.contact.phone || "No phone number"} ·{" "}
									{task.contact.email || "No email address"}
								</p>
								{task.contact.address && (
									<p className="text-sm text-muted-foreground">
										{task.contact.address}
									</p>
								)}
							</div>
							<ContactActions contact={task.contact} />
						</div>
					))}
					{data.tasks.length === 0 && (
						<p className="text-sm text-muted-foreground">
							No open follow-ups assigned to you.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
