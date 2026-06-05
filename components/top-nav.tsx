"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Eye,
  EyeOff,
  LayoutDashboard,
  ListOrdered,
  PlusCircle,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { CurrencyToggle } from "./currency-toggle";
import { ThemeToggle } from "./theme-toggle";
import { useCommandPalette } from "./command-palette";
import { UserPill } from "./user-pill";
import { useSettings } from "@/app/settings-context";

const tabs = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/transactions", label: "Transactions", icon: ListOrdered },
  { href: "/add", label: "Add Investment", icon: PlusCircle },
];

export function TopNav() {
  const pathname = usePathname();
  const palette = useCommandPalette();
  const { settings, update } = useSettings();
  if (pathname === "/lock") return null;
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 text-white shadow-lg shadow-indigo-500/20">
            <TrendingUp className="h-4 w-4" />
          </span>
          <span className="hidden text-base tracking-tight sm:inline">
            Portfolio Pulse
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {tabs.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 -z-10 rounded-lg bg-white/5 ring-1 ring-white/10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
        <nav className="flex items-center gap-1 md:hidden">
          {tabs.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-label={tab.label}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                  active
                    ? "bg-white/5 text-foreground ring-1 ring-white/10"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => palette.setOpen(true)}
            aria-label="Open command palette"
            className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-muted transition hover:text-foreground sm:inline-flex"
          >
            <Search className="h-3.5 w-3.5" />
            <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px]">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => palette.setOpen(true)}
            aria-label="Open command palette"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-muted transition hover:text-foreground sm:hidden"
          >
            <Search className="h-4 w-4" />
          </button>
          <CurrencyToggle />
          <button
            type="button"
            onClick={() => update("hideAmounts", !settings.hideAmounts)}
            aria-label={settings.hideAmounts ? "Show amounts" : "Hide amounts"}
            aria-pressed={settings.hideAmounts}
            title={
              settings.hideAmounts
                ? "Show amounts (privacy mode is on)"
                : "Hide amounts (privacy mode)"
            }
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border transition",
              settings.hideAmounts
                ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-200"
                : "border-white/10 bg-white/[0.03] text-muted hover:text-foreground",
            )}
          >
            {settings.hideAmounts ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
          <ThemeToggle />
          <UserPill />
        </div>
      </div>
    </header>
  );
}
