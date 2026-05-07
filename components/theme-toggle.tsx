"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

// `useSyncExternalStore` with a noop subscribe and `getServerSnapshot=false`
// gives us a stable "are we on the client?" boolean without a setState-in-effect
// pattern. Server snapshot is `false`, client snapshot is `true`, transition
// happens during hydration without warnings.
const noopSubscribe = () => () => {};
const getMountedClient = () => true;
const getMountedServer = () => false;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    getMountedClient,
    getMountedServer,
  );
  const isDark = mounted ? resolvedTheme === "dark" : true;
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-muted transition hover:text-foreground"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
