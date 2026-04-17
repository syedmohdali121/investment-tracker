"use client";

import { motion } from "framer-motion";
import { useCurrency } from "@/app/providers";
import { cn } from "@/lib/cn";

export function CurrencyToggle() {
  const { currency, setCurrency } = useCurrency();
  const opts: Array<"INR" | "USD"> = ["INR", "USD"];
  return (
    <div className="relative flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs font-semibold">
      {opts.map((c) => {
        const active = currency === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => setCurrency(c)}
            className={cn(
              "relative z-10 rounded-md px-3 py-1.5 transition-colors",
              active ? "text-white" : "text-muted hover:text-foreground",
            )}
            aria-pressed={active}
          >
            {c}
            {active && (
              <motion.span
                layoutId="currency-pill"
                className="absolute inset-0 -z-10 rounded-md bg-gradient-to-br from-indigo-500 to-emerald-500 shadow-md"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
