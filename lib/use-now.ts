"use client";

import { useEffect, useState } from "react";

/**
 * Returns a wall-clock timestamp that updates every `intervalMs` (default 60s).
 *
 * Use this instead of calling `Date.now()` directly in render or inside a
 * `useMemo` body — the React 19 `react-hooks/purity` rule (correctly) flags
 * those as impure-during-render. Memos that depend on time should add the
 * value returned here to their dependency array so their result invalidates
 * predictably.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
