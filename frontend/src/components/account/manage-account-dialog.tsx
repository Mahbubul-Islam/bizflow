"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, Eye, EyeOff, Trash2 } from "lucide-react";
import { AccountAvatar } from "@/components/account/account-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage, authApi, type User } from "@/lib/utils";

function PasswordField({ id, name, label, autoComplete }: {
	id: string;
	name: string;
	label: string;
	autoComplete: string;
}) {
	const [visible, setVisible] = useState(false);
	return <div>
		<Label htmlFor={id}>{label}</Label>
		<div className="relative mt-2">
			<Input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required className="pr-10" />
			<button type="button" aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible((value) => !value)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground">
				{visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
			</button>
		</div>
	</div>;
}

export function ManageAccountDialog({ user, open, onOpenChange, onUpdated }: {
	user: User;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onUpdated: (user: User) => void;
}) {
	const router = useRouter();
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [removeAvatar, setRemoveAvatar] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const [notice, setNotice] = useState<string>();
	const [passwordBusy, setPasswordBusy] = useState(false);
	const [passwordError, setPasswordError] = useState<string>();
	const [activeTab, setActiveTab] = useState<"profile" | "password">("profile");
	useEffect(() => {
		return () => { if (preview) URL.revokeObjectURL(preview); };
	}, [preview]);
	function close(next: boolean) {
		if (busy) return;
		onOpenChange(next);
		if (!next) { setFile(null); setPreview(null); setRemoveAvatar(false); setError(undefined); setNotice(undefined); setPasswordError(undefined); setActiveTab("profile"); }
	}
	function selectFile(next: File | undefined) {
		if (!next) return;
		if (!(["image/png", "image/jpeg", "image/webp"].includes(next.type)) || next.size > 1024 * 1024) { setError("Choose a PNG, JPG, or WebP image smaller than 1 MB."); return; }
		setError(undefined); setFile(next); setPreview(URL.createObjectURL(next)); setRemoveAvatar(false);
	}
	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		if (file) data.set("avatar", file);
		if (removeAvatar) data.set("remove_avatar", "true");
		setBusy(true); setError(undefined); setNotice(undefined);
		try {
			const updated = await authApi.updateProfile(data);
			onUpdated(updated);
			setFile(null); setPreview(null); setRemoveAvatar(false); setNotice("Profile saved.");
		} catch (cause) { setError(apiErrorMessage(cause)); }
		finally { setBusy(false); }
	}
	async function changePassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		const data = new FormData(form);
		const old_password = String(data.get("old_password") ?? "");
		const new_password = String(data.get("new_password") ?? "");
		const new_password_confirm = String(data.get("new_password_confirm") ?? "");
		if (new_password !== new_password_confirm) {
			setPasswordError("New passwords do not match.");
			return;
		}
		setPasswordBusy(true);
		setPasswordError(undefined);
		try {
			await authApi.changePassword({ old_password, new_password, new_password_confirm });
			form.reset();
			router.replace("/login");
		} catch (cause) {
			setPasswordError(apiErrorMessage(cause));
		} finally {
			setPasswordBusy(false);
		}
	}
	const displayed = { ...user, avatar_url: removeAvatar ? null : preview ?? user.avatar_url };
	return <Dialog open={open} onOpenChange={close}><DialogContent className="gap-4 sm:max-w-xl"><DialogHeader><DialogTitle>Manage account</DialogTitle><DialogDescription>Update your profile or password.</DialogDescription></DialogHeader>
		<div role="tablist" aria-label="Account settings" className="grid grid-cols-2 rounded-xl bg-muted p-1">
			<button type="button" role="tab" id="account-profile-tab" aria-selected={activeTab === "profile"} aria-controls="account-profile-panel" onClick={() => setActiveTab("profile")} className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === "profile" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Profile</button>
			<button type="button" role="tab" id="account-password-tab" aria-selected={activeTab === "password"} aria-controls="account-password-panel" onClick={() => setActiveTab("password")} className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === "password" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Password</button>
		</div>
		{activeTab === "profile" ? <form id="account-profile-panel" role="tabpanel" aria-labelledby="account-profile-tab" key={`${user.id}-${user.email}-${user.first_name}-${user.last_name}-${user.phone}`} onSubmit={(event) => void save(event)} className="space-y-4">
			<div className="flex items-center gap-4 rounded-2xl border border-border bg-muted/30 p-3"><AccountAvatar user={displayed} size={64} /><div className="space-y-1"><p className="text-sm font-semibold">Profile photo</p><p className="text-xs text-muted-foreground">PNG, JPG, or WebP. Up to 1 MB.</p><div className="flex flex-wrap gap-2"><label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted"><Camera className="size-3.5" /> Choose photo<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => selectFile(event.target.files?.[0])} /></label>{(user.avatar_url || file) && <Button type="button" variant="ghost" size="sm" onClick={() => { setFile(null); setPreview(null); setRemoveAvatar(true); }}><Trash2 className="size-3.5" /> Remove</Button>}</div></div></div>
			<div className="grid grid-cols-2 gap-3"><div><Label htmlFor="account-first-name">First name</Label><Input id="account-first-name" name="first_name" defaultValue={user.first_name} className="mt-1" /></div><div><Label htmlFor="account-last-name">Last name</Label><Input id="account-last-name" name="last_name" defaultValue={user.last_name} className="mt-1" /></div><div><Label htmlFor="account-email">Email</Label><Input id="account-email" name="email" type="email" defaultValue={user.email} required className="mt-1" /></div><div><Label htmlFor="account-phone">Phone</Label><Input id="account-phone" name="phone" type="tel" defaultValue={user.phone} className="mt-1" /></div></div>
			{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-primary">{notice}</p>}
			<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>Close</Button><Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save changes"}</Button></div>
		</form> : <form id="account-password-panel" role="tabpanel" aria-labelledby="account-password-tab" onSubmit={(event) => void changePassword(event)} className="space-y-4">
			<div><h3 className="font-semibold">Update password</h3><p className="text-sm text-muted-foreground">You will need to log in again after changing your password.</p></div>
			<PasswordField id="account-old-password" name="old_password" label="Current password" autoComplete="current-password" />
			<PasswordField id="account-new-password" name="new_password" label="New password" autoComplete="new-password" />
			<PasswordField id="account-confirm-password" name="new_password_confirm" label="Confirm new password" autoComplete="new-password" />
			{passwordError && <p role="alert" className="text-sm text-destructive">{passwordError}</p>}
			<div className="flex justify-end"><Button type="submit" disabled={passwordBusy || busy}>{passwordBusy ? "Changing..." : "Change password"}</Button></div>
		</form>}
	</DialogContent></Dialog>;
}
