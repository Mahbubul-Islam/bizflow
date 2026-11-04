"use client";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	return (
		<Button
			variant="outline"
			size="icon"
			aria-label={`Theme: ${theme}. Change theme`}
			onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
			{theme === "dark" ? (
				<Sun aria-hidden="true" />
			) : (
				<Moon aria-hidden="true" />
			)}
		</Button>
	);
}
