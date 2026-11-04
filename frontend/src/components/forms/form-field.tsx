import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
type FormFieldProps = React.ComponentProps<typeof Input> & {
	label: string;
	error?: string;
	hint?: string;
};
export function FormField({
	id,
	name,
	label,
	error,
	hint,
	...props
}: FormFieldProps) {
	const fieldId = id ?? name;
	if (!fieldId) throw new Error("FormField requires id or name");
	return (
		<div className="space-y-2">
			<Label htmlFor={fieldId}>{label}</Label>
			<Input
				id={fieldId}
				name={name}
				aria-invalid={!!error}
				aria-describedby={
					error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
				}
				{...props}
			/>
			{error && (
				<p id={`${fieldId}-error`} className="text-sm text-destructive">
					{error}
				</p>
			)}
			{!error && hint && (
				<p id={`${fieldId}-hint`} className="text-sm text-muted-foreground">
					{hint}
				</p>
			)}
		</div>
	);
}
