"use client";
import * as React from "react";
type Theme = "light" | "dark";
const ThemeContext = React.createContext<{
	theme: Theme;
	setTheme: (theme: Theme) => void;
} | null>(null);
export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [theme, setTheme] = React.useState<Theme>("light");
	React.useEffect(() => {
		const savedTheme = document.cookie.split("; ").find((part) => part.startsWith("bizflow-theme="))?.split("=")[1];
		const resolvedTheme = savedTheme === "dark" ? "dark" : "light";
		document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
		queueMicrotask(() => setTheme(resolvedTheme));
	}, []);
	function updateTheme(value: Theme) {
		document.cookie = `bizflow-theme=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
		document.documentElement.classList.toggle("dark", value === "dark");
		setTheme(value);
	}
	return (
		<ThemeContext.Provider value={{ theme, setTheme: updateTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}
export function useTheme() {
	const context = React.useContext(ThemeContext);
	if (!context) throw new Error("useTheme must be used inside ThemeProvider");
	return context;
}
