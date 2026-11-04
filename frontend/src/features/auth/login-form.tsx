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

export type LoginValues = { email: string; password: string };
export function LoginForm({
	onSubmit,
	pending = false,
}: {
	onSubmit: (values: LoginValues) => void | Promise<void>;
	pending?: boolean;
}) {
	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		await onSubmit({
			email: String(data.get("email") ?? ""),
			password: String(data.get("password") ?? ""),
		});
	}
	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Log in</CardTitle>
				<CardDescription>Access your BizFlow workspace.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					<FormField
						label="Email"
						name="email"
						type="email"
						autoComplete="email"
						required
					/>
					<FormField
						label="Password"
						name="password"
						type="password"
						autoComplete="current-password"
						required
					/>
					<Button type="submit" disabled={pending} className="w-full">
						{pending ? "Logging in…" : "Log in"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
