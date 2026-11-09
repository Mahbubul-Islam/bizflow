import * as React from "react";
export function EmptyState({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
			<h3 className="font-semibold">{title}</h3>
			{description && (
				<p className="max-w-md text-sm text-muted-foreground">{description}</p>
			)}
			{action}
		</div>
	);
}
