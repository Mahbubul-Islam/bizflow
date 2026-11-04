"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (element: HTMLElement, options: { type: "standard"; theme: "outline"; size: "large"; text: "continue_with"; width: number; locale: "en" }) => void;
    };
  };
};

const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export function GoogleSignIn({ onCredential, disabled = false }: {
  onCredential: (credential: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  const [ready, setReady] = useState(false);

  useEffect(() => { callbackRef.current = onCredential; }, [onCredential]);

  useEffect(() => {
    const google = (window as Window & { google?: GoogleIdentity }).google;
    if (!ready || !clientId || !google || !buttonRef.current) return;
    google.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) => { void callbackRef.current(credential); },
    });
    buttonRef.current.replaceChildren();
    google.accounts.id.renderButton(buttonRef.current, {
      type: "standard", theme: "outline", size: "large", text: "continue_with", width: 320, locale: "en",
    });
  }, [ready]);

  if (!clientId) return null;

  return <div className="mt-5 border-t border-border pt-5">
    <p className="mb-4 text-center text-xs text-muted-foreground">Or continue with</p>
    <div className={disabled ? "pointer-events-none flex justify-center opacity-50" : "flex justify-center"} ref={buttonRef} />
    <Script src="https://accounts.google.com/gsi/client?hl=en" strategy="afterInteractive" onReady={() => setReady(true)} />
  </div>;
}
