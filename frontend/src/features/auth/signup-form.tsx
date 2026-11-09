"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { PasswordField } from "@/components/forms/password-field";

export type SignupValues = {
	email: string;
	password: string;
	password_confirm: string;
	first_name: string;
	last_name: string;
};
export function SignupForm({
	onSubmit,
	pending = false,
}: {
	onSubmit: (values: SignupValues) => void | Promise<void>;
	pending?: boolean;
}) {
	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		await onSubmit({
			email: String(data.get("email") ?? ""),
			password: String(data.get("password") ?? ""),
			password_confirm: String(data.get("password_confirm") ?? ""),
			first_name: String(data.get("first_name") ?? ""),
			last_name: String(data.get("last_name") ?? ""),
		});
	}
	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Create account</CardTitle>
				<CardDescription>Get started with BizFlow.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<FormField
							label="First name"
							name="first_name"
							autoComplete="given-name"
							required
						/>
						<FormField
							label="Last name"
							name="last_name"
							autoComplete="family-name"
							required
						/>
					</div>
					<FormField
						label="Email"
						name="email"
						type="email"
						autoComplete="email"
						required
					/>
					<PasswordField
						label="Password"
						id="signup-password"
						name="password"
						autoComplete="new-password"
						newPassword
					/>
					<PasswordField
						label="Confirm password"
						id="signup-confirm-password"
						name="password_confirm"
						autoComplete="new-password"
						newPassword
					/>
					<Button type="submit" disabled={pending} className="w-full">
						{pending ? "Creating account…" : "Create account"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
