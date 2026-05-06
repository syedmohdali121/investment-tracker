"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

type CurrentUser = { id: string; name: string; color: string };

async function fetchMe(): Promise<CurrentUser | null> {
  const res = await fetch("/api/users/me", { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user: CurrentUser | null };
  return data.user;
}

export function UserPill() {
  const { data: user } = useQuery({
    queryKey: ["users", "me"],
    queryFn: fetchMe,
    staleTime: 30_000,
  });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!user) return null;

  async function logoutAndGoToLock() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    window.location.href = "/lock";
  }

  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] py-1 pl-1 pr-2 text-xs font-medium text-muted transition hover:text-foreground"
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-white"
          style={{
            background: user.color,
            fontSize: 11,
            boxShadow: `0 4px 12px -6px ${user.color}`,
          }}
        >
          {initials || "?"}
        </span>
        <span className="hidden max-w-[8rem] truncate sm:inline">
          {user.name}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-background/95 shadow-2xl backdrop-blur"
          >
            <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-muted">
              Signed in as
            </div>
            <div className="flex items-center gap-2 px-3 py-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                style={{ background: user.color, fontSize: 12 }}
              >
                {initials || "?"}
              </span>
              <span className="text-sm font-medium">{user.name}</span>
            </div>
            <div className="border-t border-white/10">
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-foreground"
              >
                <SettingsIcon className="h-3.5 w-3.5" />
                Settings
              </Link>
              <button
                type="button"
                onClick={logoutAndGoToLock}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Switch user
              </button>
              <button
                type="button"
                onClick={logoutAndGoToLock}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
                Lock now
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
