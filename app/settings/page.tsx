"use client";

import { motion } from "framer-motion";
import { Settings as SettingsIcon, RotateCcw } from "lucide-react";
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
