export * from "./types";
export { ALL_RULES } from "./rules";

import type { Insight, InsightContext, InsightRule } from "./types";
import { ALL_RULES } from "./rules";

export function runInsights(
  ctx: InsightContext,
  rules: InsightRule[] = ALL_RULES,
): Insight[] {
  const out: Insight[] = [];
  for (const rule of rules) {
    try {
      const r = rule(ctx);
      if (!r) continue;
      if (Array.isArray(r)) out.push(...r);
      else out.push(r);
    } catch (err) {
      console.error("[insights] rule threw:", err);
    }
  }
  const sectionOrder: Record<Insight["section"], number> = {
    composition: 0,
    performance: 1,
    growth: 2,
    projection: 3,
    fact: 4,
  };
  return out.sort((a, b) => {
    const s = sectionOrder[a.section] - sectionOrder[b.section];
    if (s !== 0) return s;
    return (b.meta?.score ?? 0) - (a.meta?.score ?? 0);
  });
}
