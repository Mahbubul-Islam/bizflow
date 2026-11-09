"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AppSelect } from "@/components/forms/app-select";
import { AccountAvatar } from "@/components/account/account-avatar";
import { useConfirmation } from "@/components/feedback/modal-feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiErrorMessage, auditApi, organizationsApi, type AvailableMember, type Member, type Role } from "@/lib/utils";
import type { AdminAction, AdminData } from "./admin-types";

type SectionProps = {
	data: AdminData;
	orgId: string;
	action: AdminAction;
	busy: boolean;
};
const text = (form: FormData, name: string) =>
	String(form.get(name) ?? "").trim();
const submit = (
	event: FormEvent<HTMLFormElement>,
	callback: (form: FormData, element: HTMLFormElement) => unknown,
) => {
	event.preventDefault();
	const element = event.currentTarget;
	void callback(new FormData(element), element);
};

export function MembersSection({ data, orgId, action, busy }: SectionProps) {
	const confirmAction = useConfirmation();
	const [accessMember, setAccessMember] = useState<Member | null>(null);
	const [search, setSearch] = useState("");
	const [email, setEmail] = useState("");
	const [matches, setMatches] = useState<AvailableMember[]>([]);
	const [searching, setSearching] = useState(false);
	const [searchError, setSearchError] = useState(false);
	useEffect(() => {
		if (search.trim().length < 2) return;
		let cancelled = false;
		const timer = window.setTimeout(() => {
			organizationsApi
				.searchMembers(orgId, search.trim())
				.then((users) => {
					if (!cancelled) {
						setMatches(users);
						setSearching(false);
					}
				})
				.catch(() => {
					if (!cancelled) {
						setSearchError(true);
						setSearching(false);
					}
				});
		}, 250);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [orgId, search]);
	const updateSearch = (value: string) => {
		setSearch(value);
		setMatches([]);
		setSearchError(false);
		setSearching(value.trim().length >= 2);
	};
	return (
		<>
			<Dialog open={!!accessMember} onOpenChange={(open) => { if (!open) setAccessMember(null); }}>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
					<DialogTitle>Manage access for {accessMember?.first_name || accessMember?.email}</DialogTitle>
					{accessMember && (
						<form key={accessMember.id} onSubmit={(event) => submit(event, async (form) => {
							const ok = await action("Member access updated", () => organizationsApi.updateMemberPermissions(
								orgId, accessMember.id, form.getAll("permission").map(String),
							));
							if (ok) setAccessMember(null);
						})} className="space-y-4">
							<p className="text-sm text-muted-foreground">
								{accessMember.role === "OWNER" ? "Owners always have full access." : accessMember.permissions_override === null ? `Using ${accessMember.role.toLowerCase()} role permissions.` : "Custom permissions for this member."}
							</p>
							<div className="max-h-80 space-y-2 overflow-y-auto">
								{Object.entries(data.permissions.available_permissions).map(([code, label]) => (
									<label key={code} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
										<input type="checkbox" name="permission" value={code} defaultChecked={accessMember.effective_permissions.includes(code)} disabled={accessMember.role === "OWNER"} className="size-4 accent-primary" />
										<span>{label}</span>
									</label>
								))}
							</div>
							{accessMember.role !== "OWNER" && (
								<div className="flex flex-wrap gap-2">
									<Button type="submit" disabled={busy}>Save access</Button>
									{accessMember.permissions_override !== null && <Button type="button" variant="outline" disabled={busy} onClick={() => {
										void action("Role defaults restored", () => organizationsApi.updateMemberPermissions(orgId, accessMember.id, null)).then((ok) => { if (ok) setAccessMember(null); });
									}}>Use role defaults</Button>}
								</div>
							)}
						</form>
					)}
				</DialogContent>
			</Dialog>
			<Card>
				<CardHeader>
					<CardTitle>Add a member</CardTitle>
					<CardDescription>
						Search registered users by email or username, then choose a role.
						Owner access can manage roles and members.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<Label htmlFor="member-search">
							Search users by email or username
						</Label>
						<Input
							id="member-search"
							type="search"
							value={search}
							onChange={(event) => updateSearch(event.target.value)}
							placeholder="Enter at least 2 characters"
							autoComplete="off"
							className="mt-2"
						/>
						<div
							aria-live="polite"
							className="mt-2 text-sm text-muted-foreground">
							{searching
								? "Searching users..."
								: searchError
									? "Could not search users. Try again."
									: search.trim().length >= 2 && matches.length === 0
										? "No available users found."
										: null}
						</div>
						{matches.length > 0 && (
							<div
								className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border"
								aria-label="Available users">
								{matches.map((user) => (
									<button
										key={user.email}
										type="button"
										onClick={() => {
											setEmail(user.email);
											updateSearch("");
										}}
										className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
										<span className="font-medium">
											{`${user.first_name} ${user.last_name}`.trim() ||
												user.username ||
												user.email}
										</span>
										<span className="text-muted-foreground">{user.email}</span>
									</button>
								))}
							</div>
						)}
					</div>
					<form
						onSubmit={(event) =>
							submit(event, async (form, element) => {
								const ok = await action("Member added", () =>
									organizationsApi.addMember(orgId, {
										email: text(form, "email"),
										role: text(form, "role") as Role,
									}),
								);
								if (ok) {
									element.reset();
									setEmail("");
									updateSearch("");
								}
							})
						}
						className="flex flex-wrap items-end gap-3">
						<div className="min-w-48 flex-1">
							<Field
								label="Account email"
								name="email"
								type="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								required
							/>
						</div>
						<div className="w-36">
							<Label htmlFor="member-role">Role</Label>
							<AppSelect
								id="member-role"
								name="role"
								defaultValue="STAFF"
								options={[
									{ value: "STAFF", label: "Staff" },
									{ value: "MANAGER", label: "Manager" },
									{ value: "OWNER", label: "Owner" },
								]}
								placeholder="Select role"
								className="mt-2 w-full"
							/>
						</div>
						<Button type="submit" disabled={busy}>
							<Plus className="size-4" /> Add member
						</Button>
					</form>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Members</CardTitle>
					<CardDescription>
						{data.members.length} active members in this organization.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{data.members.length ? (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Person</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>Role</TableHead>
									<TableHead className="text-right">Action</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.members.map((member) => (
									<TableRow key={member.id}>
										<TableCell className="font-medium">
											<div className="flex items-center gap-3">
												<AccountAvatar user={member} size={36} />
												<span>
													{`${member.first_name} ${member.last_name}`.trim() ||
														"Member"}
												</span>
											</div>
										</TableCell>
										<TableCell>{member.email}</TableCell>
										<TableCell>
											<AppSelect
												ariaLabel={`Role for ${member.email}`}
												value={member.role}
												disabled={busy}
												onValueChange={(next) => {
													void action("Member role updated", () =>
														organizationsApi.changeMemberRole(
															orgId,
															member.id,
															next as Role,
														),
													);
												}}
												options={[
													{ value: "OWNER", label: "Owner" },
													{ value: "MANAGER", label: "Manager" },
													{ value: "STAFF", label: "Staff" },
												]}
												placeholder="Select role"
												className="w-32"
											/>
										</TableCell>
										<TableCell className="text-right">
											<Button type="button" variant="outline" size="sm" className="mr-2" onClick={() => setAccessMember(member)}>Manage access</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label={`Remove ${member.email}`}
												disabled={busy}
												onClick={() =>
													confirmAction(
														`Remove ${member.email} from this organization?`,
														() => {
															void action("Member removed", () =>
																organizationsApi.removeMember(orgId, member.id),
															);
														},
													)
												}>
												<Trash2 className="size-4" />
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					) : (
						<Empty text="No members yet." />
					)}
				</CardContent>
			</Card>
		</>
	);
}

export function PermissionsSection({
	data,
	orgId,
	action,
	busy,
}: SectionProps) {
	const permissions = Object.entries(data.permissions.available_permissions);
	return (
		<div className="grid gap-6 xl:grid-cols-2">
			{(["MANAGER", "STAFF"] as const).map((role) => (
				<Card key={role}>
					<CardHeader>
						<CardTitle>
							{role === "MANAGER" ? "Manager" : "Staff"} permissions
						</CardTitle>
						<CardDescription>
							Choose which actions this role may perform. Owners always have
							full access.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							key={`${role}-${data.permissions.roles[role].join(",")}`}
							onSubmit={(event) =>
								submit(event, (form) =>
									action(`${role.toLowerCase()} permissions updated`, () =>
										organizationsApi.updateRolePermissions(
											orgId,
											role,
											form.getAll("permission").map(String),
										),
									),
								)
							}
							className="space-y-4">
							<div className="max-h-[440px] space-y-3 overflow-y-auto pr-2">
								{permissions.map(([code, label]) => (
									<label
										key={code}
										className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-sm">
										<input
											type="checkbox"
											name="permission"
											value={code}
											defaultChecked={data.permissions.roles[role].includes(
												code,
											)}
											className="size-4 accent-primary"
										/>
										<span className="font-medium">{label}</span>
									</label>
								))}
							</div>
							<Button type="submit" disabled={busy}>
								Save {role.toLowerCase()} access
							</Button>
						</form>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function Field({
	label,
	name,
	...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
	return (
		<div>
			<Label htmlFor={name}>{label}</Label>
			<Input id={name} name={name} className="mt-2" {...props} />
		</div>
	);
}
function Empty({ text: message }: { text: string }) {
	return (
		<p className="py-8 text-center text-sm text-muted-foreground">{message}</p>
	);
}

export function AuditSection({ data, organizationId }: { data: AdminData; organizationId: string }) {
	const [logs, setLogs] = useState(data.audit);
	const [next, setNext] = useState(data.auditNext);
	const [loadingMore, setLoadingMore] = useState(false);
	const [loadError, setLoadError] = useState<string>();
	async function loadMore() {
		if (!next || loadingMore) return;
		setLoadingMore(true);
		setLoadError(undefined);
		try {
			const result = await auditApi.page(organizationId, next);
			setLogs((current) => [...current, ...result.data]);
			setNext(result.next);
		} catch (cause) {
			setLoadError(apiErrorMessage(cause));
		} finally {
			setLoadingMore(false);
		}
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle>Audit log</CardTitle>
				<CardDescription>
					Recorded changes and business actions for this organization.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{logs.length ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Time</TableHead>
								<TableHead>Action</TableHead>
								<TableHead>Entity</TableHead>
								<TableHead>Changes</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{logs.map((log) => (
								<TableRow key={log.id}>
									<TableCell className="whitespace-nowrap text-muted-foreground">
										{new Intl.DateTimeFormat("en-GB", {
											dateStyle: "medium",
											timeStyle: "short",
										}).format(new Date(log.created_at))}
									</TableCell>
									<TableCell className="font-medium">
										{humanize(log.action)}
									</TableCell>
									<TableCell>
										{log.entity_type.replace(/([a-z])([A-Z])/g, "$1 $2")}
									</TableCell>
									<TableCell>
										<AuditChanges changes={log.changes} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<Empty text="No audit events yet." />
				)}
				{loadError && <p role="alert" className="mt-3 text-sm text-destructive">{loadError}</p>}
				<div className="mt-4 flex items-center justify-between gap-3">
					<p className="text-xs text-muted-foreground">Showing {logs.length} of {data.auditCount} events</p>
					{next && <Button type="button" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading..." : "Load more"}</Button>}
				</div>
			</CardContent>
		</Card>
	);
}

function humanize(value: string) {
	return value
		.replaceAll("_", " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase())
		.toLowerCase()
		.replace(/^./, (letter) => letter.toUpperCase());
}

function formatAuditValue(value: unknown): string {
	if (value === null || value === undefined || value === "") return "Not set";
	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	if (Array.isArray(value)) return value.map(formatAuditValue).join(", ");
	if (typeof value === "object" && "item_name" in value && typeof value.item_name === "string")
		return `${value.item_name}${"quantity" in value ? `, Quantity: ${formatAuditValue(value.quantity)}` : ""}`;
	if (typeof value === "object")
		return Object.entries(value)
			.map(([key, item]) => `${humanize(key)}: ${formatAuditValue(item)}`)
			.join(", ");
	return String(value);
}

function AuditChanges({ changes }: { changes: Record<string, unknown> }) {
	const entries = Object.entries(changes);
	if (!entries.length)
		return (
			<span className="text-sm text-muted-foreground">No field details</span>
		);
	return (
		<div className="min-w-48 space-y-2 text-sm">
			{entries.map(([field, change]) => {
				const pair =
					change &&
					typeof change === "object" &&
					!Array.isArray(change) &&
					("old" in change || "new" in change)
						? (change as { old?: unknown; new?: unknown })
						: null;
				return (
					<div key={field} className="leading-5">
						<span className="font-medium">{humanize(field)}: </span>
						{pair ? (
							pair.old == null ? (
								<span>Added {formatAuditValue(pair.new)}</span>
							) : pair.new == null ? (
								<span>Removed {formatAuditValue(pair.old)}</span>
							) : (
								<span>
									<span className="text-muted-foreground">
										{formatAuditValue(pair.old)}
									</span>{" "}
									→ {formatAuditValue(pair.new)}
								</span>
							)
						) : (
							<span>{formatAuditValue(change)}</span>
						)}
					</div>
				);
			})}
		</div>
	);
}
