import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@fontsource-variable/inter";

export const metadata: Metadata = {
  title: "BizFlow",
  description: "Business operations dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full font-sans antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          const theme = document.cookie.split("; ").find((part) => part.startsWith("bizflow-theme="))?.split("=")[1];
          document.documentElement.classList.toggle("dark", theme === "dark");
        ` }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider><TooltipProvider>{children}</TooltipProvider></ThemeProvider>
      </body>
    </html>
  );
}
