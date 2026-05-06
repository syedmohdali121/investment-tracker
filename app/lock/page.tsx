"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Lock, ShieldCheck, Loader2 } from "lucide-react";

export default function LockPage() {
  const [next, setNext] = useState("/");
  const [mode, setMode] = useState<"loading" | "setup" | "login">("loading");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let nextTarget = "/";
    try {
      const params = new URLSearchParams(window.location.search);
      const n = params.get("next");
      if (n) {
        nextTarget = n;
        setNext(n);
      }
    } catch {
      /* noop */
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        const s = (await res.json()) as { hasPin: boolean; authed: boolean };
        if (cancelled) return;
        if (s.authed) {
          window.location.href = nextTarget;
          return;
        }
        setMode(s.hasPin ? "login" : "setup");
        setTimeout(() => inputRef.current?.focus(), 50);
      } catch {
        if (!cancelled) setMode("login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) {
      setError("PIN must be 4–8 digits.");
      return;
    }
    if (mode === "setup" && pin !== confirmPin) {
      setError("PINs don't match.");
      return;
    }
    setBusy(true);
    try {
      const url = mode === "setup" ? "/api/auth/setup" : "/api/auth/login";
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to authenticate.");
        setBusy(false);
        return;
      }
      // Full reload so the proxy sees the fresh cookie cleanly.
      window.location.href = next;
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-7 shadow-2xl"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18),_transparent_60%)]" />
        <div className="relative">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 shadow-lg shadow-indigo-500/30">
            {mode === "setup" ? (
              <ShieldCheck className="h-6 w-6 text-white" />
            ) : (
              <Lock className="h-6 w-6 text-white" />
            )}
          </div>
          <h1 className="text-center text-lg font-semibold tracking-tight">
            {mode === "loading"
              ? "Checking…"
              : mode === "setup"
                ? "Set a PIN"
                : "Enter your PIN"}
          </h1>
          <p className="mt-1 text-center text-xs text-muted">
            {mode === "setup"
              ? "Choose a 4–8 digit PIN. You'll need it the next time the browser session ends."
              : "Local-only lock for this dashboard."}
          </p>

          {mode !== "loading" && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                pattern="\d*"
                autoComplete="one-time-code"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                className="input text-center tracking-[0.5em]"
                disabled={busy}
              />
              {mode === "setup" && (
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="\d*"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={confirmPin}
                  onChange={(e) =>
                    setConfirmPin(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Confirm PIN"
                  className="input text-center tracking-[0.5em]"
                  disabled={busy}
                />
              )}
              {error && (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={busy || pin.length < 4}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "setup" ? "Save PIN" : "Unlock"}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
