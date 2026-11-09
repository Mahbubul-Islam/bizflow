"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PasswordFieldProps = {
	id: string;
	name: string;
	label: string;
	autoComplete: string;
	newPassword?: boolean;
};

export function PasswordField({ id, name, label, autoComplete, newPassword = false }: PasswordFieldProps) {
	const [visible, setVisible] = useState(false);
	const [value, setValue] = useState("");
	const variety = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^a-zA-Z0-9]/.test(value)].filter(Boolean).length;
	const strength = !newPassword || !value ? null : value.length < 6 ? "weak" : value.length >= 8 && variety >= 3 ? "strong" : "fair";
	const border = strength === "weak" ? "!border-red-500 focus-visible:!ring-red-500/30" : strength === "fair" ? "!border-yellow-500 focus-visible:!ring-yellow-500/30" : strength === "strong" ? "!border-green-500 focus-visible:!ring-green-500/30" : "";
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<div className="relative">
				<Input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required minLength={newPassword ? 6 : undefined} value={value} onChange={(event) => setValue(event.target.value)} className={`pr-10 ${border}`} aria-describedby={newPassword ? `${id}-strength` : undefined} />
				<button type="button" aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible((current) => !current)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground">
					{visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
				</button>
			</div>
			{newPassword && <p id={`${id}-strength`} className="text-xs text-muted-foreground" aria-live="polite">{strength ? `${strength === "fair" ? "Moderate" : strength === "strong" ? "Strong" : "Weak"} password${value.length < 6 ? " — use at least 6 characters." : "."}` : "Use at least 6 characters."}</p>}
		</div>
	);
}
