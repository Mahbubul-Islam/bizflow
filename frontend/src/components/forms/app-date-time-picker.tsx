"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function localDateTime(date: Date, time: string) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}T${time}`;
}

export function AppDateTimePicker({
	value,
	onValueChange,
	ariaLabel,
}: {
	value: string;
	onValueChange: (value: string) => void;
	ariaLabel: string;
}) {
	const [open, setOpen] = useState(false);
	const selected = value
		? new Date(`${value.slice(0, 10)}T12:00:00`)
		: undefined;
	const time = value.slice(11) || "09:00";
	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger
				render={
					<Button
						type="button"
						variant="outline"
						className="w-full justify-start font-normal"
						aria-label={ariaLabel}
					/>
				}>
				<CalendarDays className="size-4" />
				{value
					? new Date(value).toLocaleString(undefined, {
							dateStyle: "medium",
							timeStyle: "short",
						})
					: "Choose date and time"}
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner
					side="bottom"
					align="start"
					sideOffset={6}
					className="z-50">
					<Popover.Popup className="rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl">
						<Calendar
							mode="single"
							selected={selected}
							onSelect={(date) => {
								if (date) onValueChange(localDateTime(date, time));
							}}
						/>
						<div className="flex items-center gap-2 border-t pt-3">
							<label htmlFor="crm-due-time" className="text-sm">
								Time
							</label>
							<Input
								id="crm-due-time"
								type="time"
								value={time}
								onChange={(event) => {
									if (selected)
										onValueChange(localDateTime(selected, event.target.value));
								}}
								className="w-36"
							/>
							<Button type="button" size="sm" onClick={() => setOpen(false)}>
								Done
							</Button>
						</div>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
