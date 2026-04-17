"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Keyboard } from "lucide-react";
import { useCurrency } from "@/app/providers";
import { useCommandPalette } from "./command-palette";

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["⌘", "K"], label: "Open command palette" },
  { keys: ["Ctrl", "K"], label: "Open command palette (Win/Linux)" },
  { keys: ["G", "D"], label: "Go to Dashboard" },
  { keys: ["G", "I"], label: "Go to Insights" },
  { keys: ["G", "A"], label: "Go to Add Investment" },
  { keys: ["G", "S"], label: "Go to Settings" },
  { keys: ["R"], label: "Refresh prices" },
  { keys: ["C"], label: "Toggle currency" },
  { keys: ["T"], label: "Toggle theme" },
  { keys: ["?"], label: "Show this help" },
  { keys: ["Esc"], label: "Close overlays" },
];

/**
 * Global keyboard shortcut handler. Must live inside CommandPaletteProvider.
 * Ignores keystrokes while the user is typing in inputs/textareas/contentEditable.
 */
export function ShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { toggle: toggleCurrency } = useCurrency();
  const { setOpen: setPaletteOpen, open: paletteOpen } = useCommandPalette();
  const { setTheme, resolvedTheme } = useTheme();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let awaitingG = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const clearG = () => {
      awaitingG = false;
      if (gTimer) {
        clearTimeout(gTimer);
        gTimer = null;
      }
    };

    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const refreshAll = async () => {
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
    };

    const onKey = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K — always open palette, even inside inputs.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
        return;
      }

      if (isEditable(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        if (helpOpen) setHelpOpen(false);
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      const key = e.key.toLowerCase();

      if (awaitingG) {
        clearG();
        if (key === "d") {
          router.push("/");
          return;
        }
        if (key === "i") {
          router.push("/insights");
          return;
        }
        if (key === "a") {
          router.push("/add");
          return;
        }
        if (key === "s") {
          router.push("/settings");
          return;
        }
        return;
      }

      if (key === "g") {
        awaitingG = true;
        gTimer = setTimeout(clearG, 1200);
        return;
      }
      if (key === "r") {
        e.preventDefault();
        void refreshAll();
        return;
      }
      if (key === "c") {
        e.preventDefault();
        toggleCurrency();
        return;
      }
      if (key === "t") {
        e.preventDefault();
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearG();
    };
  }, [
    router,
    qc,
    toggleCurrency,
    setPaletteOpen,
    paletteOpen,
    setTheme,
    resolvedTheme,
    helpOpen,
  ]);

  return (
    <>
      {children}
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Keyboard shortcuts"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f17]/95 p-5 shadow-2xl"
          >
            <div className="mb-3 flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-indigo-300" />
              <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
            </div>
            <ul className="divide-y divide-white/5 text-sm">
              {SHORTCUTS.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-muted">{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k, i) => (
                      <kbd
                        key={`${s.label}-${i}`}
                        className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 text-right">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
