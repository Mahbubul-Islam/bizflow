"use client";

import {
	createContext,
	useCallback,
	useContext,
	useState,
	type ReactNode,
} from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

type FeedbackDialogProps = {
	open: boolean;
	title: string;
	message?: string;
	details?: string[];
	kind?: "error" | "success";
	onClose: () => void;
	action?: { label: string; onClick: () => void };
};

export function FeedbackDialog({
	open,
	title,
	message,
	details,
	kind = "error",
	onClose,
	action,
}: FeedbackDialogProps) {
	const Icon = kind === "error" ? CircleAlert : CircleCheck;
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<span
						className={`flex size-11 items-center justify-center rounded-2xl ${kind === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
						<Icon className="size-5" />
					</span>
					<DialogTitle className="mt-2">{title}</DialogTitle>
					{message && <DialogDescription>{message}</DialogDescription>}
				</DialogHeader>
				{details && details.length > 0 && (
					<ul className="max-h-60 space-y-2 overflow-y-auto rounded-xl bg-muted p-4 text-sm">
						{details.map((detail, index) => (
							<li key={`${index}-${detail}`}>{detail}</li>
						))}
					</ul>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Close
					</Button>
					{action && <Button onClick={action.onClick}>{action.label}</Button>}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

type Confirm = (message: string, onConfirm: () => void) => void;
const ConfirmationContext = createContext<Confirm | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
	const [pending, setPending] = useState<{
		message: string;
		onConfirm: () => void;
	} | null>(null);
	const confirm = useCallback<Confirm>(
		(message, onConfirm) => setPending({ message, onConfirm }),
		[],
	);
	return (
		<ConfirmationContext.Provider value={confirm}>
			{children}
			<Dialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open) setPending(null);
				}}>
				<DialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>Confirm action</DialogTitle>
						<DialogDescription>{pending?.message}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setPending(null)}>
							Cancel
						</Button>
						<Button
							onClick={() => {
								const callback = pending?.onConfirm;
								setPending(null);
								callback?.();
							}}>
							Confirm
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</ConfirmationContext.Provider>
	);
}

export function useConfirmation(): Confirm {
	const confirm = useContext(ConfirmationContext);
	if (!confirm)
		throw new Error("useConfirmation must be used inside ConfirmationProvider");
	return confirm;
}
