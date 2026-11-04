"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LoginForm, type LoginValues } from "@/features/auth/login-form";
import { GoogleSignIn } from "@/features/auth/google-sign-in";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { FeedbackDialog } from "@/components/feedback/modal-feedback";
import { apiErrorMessage, authApi } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function login(values: LoginValues) {
    setPending(true);
    setError(undefined);
    try {
      await authApi.login(values.email, values.password);
      await authApi.me();
      router.push("/");
      router.refresh();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function googleLogin(credential: string) {
    setPending(true);
    setError(undefined);
    try {
      await authApi.googleLogin(credential);
      router.push("/");
      router.refresh();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return <><FeedbackDialog open={!!error} title="Login failed" message={error} onClose={() => setError(undefined)} /><main className="grid min-h-screen lg:grid-cols-2">
    <div className="relative hidden overflow-hidden bg-[#103e37] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <Link href="/" aria-label="BizFlow dashboard"><BrandLogo className="h-16 w-32 rounded-lg bg-white" /></Link>
      <div className="relative z-10 max-w-xl"><p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-[#8ee1bd]">A clearer way to run your business</p><h1 className="text-5xl font-semibold leading-tight tracking-tight">Everything moving.<br />Everything in view.</h1><p className="mt-6 max-w-md text-lg leading-8 text-white/70">Sales, stock, customers, and decisions in one calm workspace.</p></div>
      <p className="relative z-10 text-sm text-white/50">Your work, beautifully organized.</p>
      <div className="absolute -right-36 top-1/4 size-[34rem] rounded-full border border-white/10" /><div className="absolute -right-16 top-1/3 size-[24rem] rounded-full border border-white/10" /><div className="absolute right-20 top-1/2 size-[15rem] rounded-full bg-white/5" />
    </div>
    <div className="flex min-h-screen flex-col bg-background px-6 py-7 sm:px-12"><div className="flex items-center justify-between gap-4"><Link href="/" className="lg:hidden" aria-label="BizFlow dashboard"><BrandLogo className="h-14 w-28" /></Link><Link href="/" className="hidden items-center gap-2 text-sm text-muted-foreground hover:text-foreground lg:inline-flex"><ArrowLeft className="size-4" /> Back to overview</Link><ThemeToggle /></div><div className="flex flex-1 flex-col items-center justify-center py-16"><div className="w-full max-w-md"><LoginForm onSubmit={login} pending={pending} /><GoogleSignIn onCredential={googleLogin} disabled={pending} /></div><p className="mt-6 text-sm text-muted-foreground">New to BizFlow? <Link href="/signup" className="font-semibold text-primary hover:underline">Create an account</Link></p></div></div>
  </main></>;
}
