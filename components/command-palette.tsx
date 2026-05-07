"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import {
  ArrowRight,
  Command as CommandIcon,
  Download,
  LayoutDashboard,
  PlusCircle,
  RefreshCcw,
  Repeat,
  Settings as SettingsIcon,
  Sparkles,
  SunMoon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useCurrency } from "@/app/providers";
import { investmentsToCsv } from "@/lib/csv";
import type { Investment } from "@/lib/types";

type Command = {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  icon: React.ComponentType<{ className?: string }>;
  section: "Navigate" | "Actions" | "Appearance";
  run: () => void | Promise<void>;
};

type PaletteCtx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
};

const Ctx = createContext<PaletteCtx | null>(null);

export function useCommandPalette() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCommandPalette outside provider");
  return v;
}

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  return (
    <Ctx.Provider value={{ open, setOpen, toggle }}>
      {children}
      <CommandPalette />
    </Ctx.Provider>
  );
}

function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const qc = useQueryClient();
  const { currency, toggle: toggleCurrency } = useCurrency();
  const { setTheme, resolvedTheme } = useTheme();

  // Reset query/active when the palette closes. React docs "Adjusting state
  // during render" pattern, used in place of a useEffect+setState that the
  // `react-hooks/set-state-in-effect` rule (correctly) flags as cascading.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }

  const go = useCallback(
    (href: string) => {
      router.push(href);
      setOpen(false);
    },
    [router, setOpen],
  );

  const refresh = useCallback(async () => {
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["investments"] }),
        qc.invalidateQueries({ queryKey: ["quotes"] }),
        qc.invalidateQueries({ queryKey: ["fx"] }),
        qc.invalidateQueries({ queryKey: ["intraday"] }),
      ]);
      toast.success("Refreshed", { duration: 1200 });
    } catch {
      toast.error("Refresh failed");
    }
  }, [qc]);

  const exportCsv = useCallback(() => {
    const data = qc.getQueryData<{ investments: Investment[] }>([
      "investments",
    ]);
    const investments = data?.investments ?? [];
    if (investments.length === 0) {
      toast.error("No investments to export");
      return;
    }
    const csv = investmentsToCsv(investments);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `investments-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV", { duration: 1200 });
  }, [qc]);

  const commands: Command[] = useMemo(
    () => [
      {
        id: "nav.dashboard",
        label: "Go to Dashboard",
        section: "Navigate",
        icon: LayoutDashboard,
        hint: "G then D",
        keywords: "home overview net worth",
        run: () => go("/"),
      },
      {
        id: "nav.insights",
        label: "Go to Insights",
        section: "Navigate",
        icon: Sparkles,
        hint: "G then I",
        keywords: "analytics drawdown correlation cagr",
        run: () => go("/insights"),
      },
      {
        id: "nav.add",
        label: "Add Investment",
        section: "Navigate",
        icon: PlusCircle,
        hint: "G then A",
        keywords: "new stock epf ppf",
        run: () => go("/add"),
      },
      {
        id: "nav.settings",
        label: "Open Settings",
        section: "Navigate",
        icon: SettingsIcon,
        hint: "G then S",
        keywords: "preferences refresh currency locale",
        run: () => go("/settings"),
      },
      {
        id: "act.refresh",
        label: "Refresh prices",
        section: "Actions",
        icon: RefreshCcw,
        hint: "R",
        keywords: "reload update quotes",
        run: async () => {
          await refresh();
          setOpen(false);
        },
      },
      {
        id: "act.export",
        label: "Export CSV",
        section: "Actions",
        icon: Download,
        keywords: "download spreadsheet investments",
        run: () => {
          exportCsv();
          setOpen(false);
        },
      },
      {
        id: "appearance.currency",
        label: `Switch currency to ${currency === "INR" ? "USD" : "INR"}`,
        section: "Appearance",
        icon: Repeat,
        hint: "C",
        keywords: "toggle usd inr display",
        run: () => {
          toggleCurrency();
          setOpen(false);
        },
      },
      {
        id: "appearance.theme",
        label: `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`,
        section: "Appearance",
        icon: SunMoon,
        hint: "T",
        keywords: "dark light mode",
        run: () => {
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
          setOpen(false);
        },
      },
    ],
    [go, refresh, exportCsv, currency, toggleCurrency, resolvedTheme, setTheme, setOpen],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const hay = `${c.label} ${c.keywords ?? ""} ${c.section}`.toLowerCase();
      // Loose fuzzy: every character of query appears in order.
      let idx = 0;
      for (const ch of q) {
        const found = hay.indexOf(ch, idx);
        if (found === -1) return false;
        idx = found + 1;
      }
      return true;
    });
  }, [commands, query]);

  // When the filtered command list shrinks below the current selection,
  // clamp the active index back to 0. Same prev-state pattern as above.
  const [prevFilteredLen, setPrevFilteredLen] = useState(filtered.length);
  if (filtered.length !== prevFilteredLen) {
    setPrevFilteredLen(filtered.length);
    if (active >= filtered.length) setActive(0);
  }

  // Close / navigate with keyboard while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[active];
        if (cmd) void cmd.run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, active, setOpen]);

  const groups = useMemo(() => {
    const map = new Map<Command["section"], Command[]>();
    for (const c of filtered) {
      const arr = map.get(c.section) ?? [];
      arr.push(c);
      map.set(c.section, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 px-4 pt-[15vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f17]/95 shadow-2xl ring-1 ring-indigo-500/10"
          >
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <CommandIcon className="h-4 w-4 text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or search…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-muted">
                Esc
              </kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted">
                  No commands match &ldquo;{query}&rdquo;
                </div>
              ) : (
                groups.map(([section, cmds]) => (
                  <div key={section} className="mb-1">
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      {section}
                    </div>
                    {cmds.map((c) => {
                      const globalIdx = filtered.indexOf(c);
                      const isActive = globalIdx === active;
                      const Icon = c.icon;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onMouseEnter={() => setActive(globalIdx)}
                          onClick={() => void c.run()}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                            isActive
                              ? "bg-indigo-500/15 text-foreground ring-1 ring-indigo-400/30"
                              : "text-muted hover:bg-white/[0.03] hover:text-foreground",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isActive ? "text-indigo-300" : "text-muted",
                            )}
                          />
                          <span className="flex-1 truncate">{c.label}</span>
                          {c.hint && (
                            <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-muted">
                              {c.hint}
                            </kbd>
                          )}
                          <ArrowRight
                            className={cn(
                              "h-3.5 w-3.5 transition-opacity",
                              isActive ? "opacity-100" : "opacity-0",
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between border-t border-white/5 bg-white/[0.02] px-4 py-2 text-[11px] text-muted">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">
                    ↑
                  </kbd>
                  <kbd className="ml-1 rounded border border-white/10 bg-white/5 px-1 py-0.5">
                    ↓
                  </kbd>{" "}
                  navigate
                </span>
                <span>
                  <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">
                    ↵
                  </kbd>{" "}
                  select
                </span>
              </div>
              <span>Press <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">?</kbd> for shortcuts</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
