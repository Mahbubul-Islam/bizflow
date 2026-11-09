"use client";

import { useState, type FormEvent } from "react";
import { FeedbackDialog } from "@/components/feedback/modal-feedback";
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
	organizationsApi,
	type Member,
	type Organization,
} from "@/lib/utils";
import { AccountAvatar } from "@/components/account/account-avatar";

export function OrganizationView({
	organization,
	canUpdate,
	onSaved,
}: {
	organization?: Organization;
	canUpdate: boolean;
	onSaved: () => void;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const [notice, setNotice] = useState<string>();
	if (!organization)
		return (
			<p className="text-sm text-muted-foreground">
				Organization details are unavailable.
			</p>
		);
	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!organization) return;
		const data = new FormData(event.currentTarget);
		const text = (name: string) => String(data.get(name) ?? "").trim();
		setBusy(true);
		setError(undefined);
		try {
			await organizationsApi.update(organization.id, {
				name: text("name"),
				slug: text("slug"),
				email: text("email"),
				phone: text("phone"),
				address: text("address"),
				currency: text("currency").toUpperCase(),
			});
			setNotice("Organization updated.");
			onSaved();
		} catch (cause) {
			setError(apiErrorMessage(cause));
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="space-y-6">
			<FeedbackDialog
				open={!!error}
				title="Organization could not be updated"
				message={error}
				onClose={() => setError(undefined)}
			/>
			{notice && (
				<p
					role="status"
					className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
					{notice}
				</p>
			)}
			<Card>
				<CardHeader>
					<CardTitle>Organization details</CardTitle>
					<CardDescription>
						{canUpdate
							? "Update your workspace information."
							: "Workspace information."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{canUpdate ? (
						<form
							key={organization.id}
							onSubmit={(event) => void save(event)}
							className="grid gap-4 sm:grid-cols-2">
							<div>
								<Label htmlFor="org-name">Name</Label>
								<Input
									id="org-name"
									name="name"
									defaultValue={organization.name}
									required
									className="mt-2"
								/>
							</div>
							<div>
								<Label htmlFor="org-slug">Slug</Label>
								<Input
									id="org-slug"
									name="slug"
									defaultValue={organization.slug}
									required
									className="mt-2"
								/>
							</div>
							<div>
								<Label htmlFor="org-email">Email</Label>
								<Input
									id="org-email"
									name="email"
									type="email"
									defaultValue={organization.email}
									className="mt-2"
								/>
							</div>
							<div>
								<Label htmlFor="org-phone">Phone</Label>
								<Input
									id="org-phone"
									name="phone"
									defaultValue={organization.phone}
									className="mt-2"
								/>
							</div>
							<div>
								<Label htmlFor="org-currency">Currency</Label>
								<Input
									id="org-currency"
									name="currency"
									maxLength={3}
									defaultValue={organization.currency}
									required
									className="mt-2"
								/>
							</div>
							<div className="sm:col-span-2">
								<Label htmlFor="org-address">Address</Label>
								<Textarea
									id="org-address"
									name="address"
									defaultValue={organization.address}
									className="mt-2"
								/>
							</div>
							<div className="sm:col-span-2">
								<Button type="submit" disabled={busy}>
									{busy ? "Saving..." : "Save organization"}
								</Button>
							</div>
						</form>
					) : (
						<dl className="grid gap-4 sm:grid-cols-2">
							{[
								["Name", organization.name],
								["Email", organization.email || "—"],
								["Phone", organization.phone || "—"],
								["Address", organization.address || "—"],
								["Currency", organization.currency],
							].map(([label, value]) => (
								<div key={label}>
									<dt className="text-xs text-muted-foreground">{label}</dt>
									<dd className="mt-1 text-sm font-medium">{value}</dd>
								</div>
							))}
						</dl>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

export function MembersView({ members }: { members: Member[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Members</CardTitle>
				<CardDescription>People with access to this workspace.</CardDescription>
			</CardHeader>
			<CardContent>
				{members.length ? (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>Role</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{members.map((member) => (
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
										<TableCell>{member.role.toLowerCase()}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				) : (
					<p className="py-10 text-center text-sm text-muted-foreground">
						No members to show.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
