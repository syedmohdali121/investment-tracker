"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Settings as SettingsIcon,
  RotateCcw,
  Loader2,
  User as UserIcon,
  KeyRound,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSettings, REFRESH_OPTIONS } from "../settings-context";
import { cn } from "@/lib/cn";
import { toast } from "sonner";

export default function SettingsPage() {
  const { settings, update, reset } = useSettings();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6 flex items-start justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-indigo-300">
            <SettingsIcon className="h-3.5 w-3.5" />
            Preferences
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Tune defaults and refresh behaviour. Saved locally in this browser.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            toast.success("Reset to defaults");
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </motion.header>

      <div className="space-y-6">
        <AccountSection />

        <Section
          title="Default currency"
          hint="Used when you open the app. You can still toggle in the top bar."
        >
          <SegmentedGroup
            value={settings.defaultCurrency}
            onChange={(v) => update("defaultCurrency", v)}
            options={[
              { value: "INR", label: "INR ₹" },
              { value: "USD", label: "USD $" },
            ]}
          />
        </Section>

        <Section
          title="Auto-refresh"
          hint="How often live quotes and FX update. Lower intervals hit Yahoo more often."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {REFRESH_OPTIONS.map((opt) => {
              const active = settings.refreshInterval === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update("refreshInterval", opt.value)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left transition",
                    active
                      ? "border-indigo-400/60 bg-indigo-500/10 text-foreground ring-1 ring-indigo-400/40"
                      : "border-white/10 bg-white/[0.02] text-muted hover:border-white/20 hover:text-foreground",
                  )}
                >
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {opt.description}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section
          title="Locale"
          hint="Controls number and date formatting."
        >
          <SegmentedGroup
            value={settings.locale}
            onChange={(v) => update("locale", v)}
            options={[
              { value: "en-IN", label: "English (India)" },
              { value: "en-US", label: "English (US)" },
              { value: "en-GB", label: "English (UK)" },
            ]}
          />
        </Section>

        <Section
          title="Compact numbers"
          hint="Show big values like ₹1.2L / $1.2k instead of full digits."
        >
          <ToggleRow
            value={settings.compactNumbers}
            onChange={(v) => update("compactNumbers", v)}
            label={settings.compactNumbers ? "On" : "Off"}
          />
        </Section>
      </div>

      <p className="mt-8 text-[11px] text-muted">
        Settings sync only within this browser. Clearing site data resets them.
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 shadow-xl">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function SegmentedGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition",
              active
                ? "bg-white/10 text-foreground ring-1 ring-white/15"
                : "text-muted hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className={cn(
        "inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm transition hover:border-white/20",
      )}
    >
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          value ? "bg-indigo-500" : "bg-white/10",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            value ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

type CurrentUser = { id: string; name: string; color: string };

function AccountSection() {
  const qc = useQueryClient();
  const { data: user, isLoading } = useQuery({
    queryKey: ["users", "me"],
    queryFn: async (): Promise<CurrentUser | null> => {
      const res = await fetch("/api/users/me", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as { user: CurrentUser | null };
      return data.user;
    },
    staleTime: 30_000,
  });

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 shadow-xl">
      <div className="mb-4 flex items-center gap-2">
        <UserIcon className="h-4 w-4 text-indigo-300" />
        <h2 className="text-sm font-semibold">Account</h2>
      </div>
      {isLoading || !user ? (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-5">
          <RenameForm
            user={user}
            onSaved={() => qc.invalidateQueries({ queryKey: ["users"] })}
          />
          <div className="border-t border-white/5" />
          <ChangePinForm />
        </div>
      )}
    </section>
  );
}

function RenameForm({
  user,
  onSaved,
}: {
  user: CurrentUser;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(user.name);
  }, [user.name]);

  const dirty = name.trim() !== user.name && name.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to rename");
      } else {
        toast.success("Name updated");
        onSaved();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="text-xs font-medium text-muted">Display name</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          className="input flex-1 min-w-[12rem]"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={!dirty || busy}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 px-3 text-xs font-semibold text-white shadow-md shadow-indigo-500/25 transition disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save
        </button>
      </div>
    </form>
  );
}

function ChangePinForm() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,8}$/.test(newPin)) {
      setError("New PIN must be 4–8 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setError("New PINs don't match.");
      return;
    }
    if (newPin === currentPin) {
      setError("New PIN must differ from current PIN.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to change PIN");
      } else {
        toast.success("PIN updated");
        setCurrentPin("");
        setNewPin("");
        setConfirmPin("");
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    currentPin.length >= 4 && newPin.length >= 4 && confirmPin.length >= 4;

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <KeyRound className="h-3.5 w-3.5" />
        Change PIN
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          type="password"
          inputMode="numeric"
          pattern="\d*"
          maxLength={8}
          value={currentPin}
          onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
          placeholder="Current PIN"
          className="input text-center tracking-[0.4em]"
          disabled={busy}
          autoComplete="current-password"
        />
        <input
          type="password"
          inputMode="numeric"
          pattern="\d*"
          maxLength={8}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
          placeholder="New PIN"
          className="input text-center tracking-[0.4em]"
          disabled={busy}
          autoComplete="new-password"
        />
        <input
          type="password"
          inputMode="numeric"
          pattern="\d*"
          maxLength={8}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
          placeholder="Confirm new PIN"
          className="input text-center tracking-[0.4em]"
          disabled={busy}
          autoComplete="new-password"
        />
      </div>
      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-muted">
          Other signed-in devices will be locked out.
        </p>
        <button
          type="submit"
          disabled={!canSubmit || busy}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 px-3 text-xs font-semibold text-white shadow-md shadow-indigo-500/25 transition disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Update PIN
        </button>
      </div>
    </form>
  );
}
