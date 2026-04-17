# Investment Tracker — Plan

## Changelog

### 2026-04-17 — Per-row intraday sparklines
- New `GET /api/intraday?symbols=…` route backed by `getIntraday()` in [lib/market.ts](lib/market.ts). Fetches 7-day @ 5m from Yahoo and keeps only the most recent trading session's points (handles market-closed, weekends, holidays). Returns `{points, prevClose, sessionDate, currency}`. 60 s cache.
- `useIntraday(symbols)` hook ([app/providers.tsx](app/providers.tsx)) with 60 s `refetchInterval`.
- New lightweight inline SVG [components/sparkline.tsx](components/sparkline.tsx): ~96×28 area chart with `prevClose` baseline, green/red tint based on last vs baseline, gradient fill, end-point dot, dashed prior-close guideline. No recharts dep so it's cheap per row.
- [components/holdings-table.tsx](components/holdings-table.tsx) gains a new **Today** column between Unit Price and Avg Cost. For each stock row: sparkline + session %. When market was closed (session date ≠ today), the sparkline dims and the % is suffixed with `· prev` and carries a tooltip with the session date. Cash rows show `—`.

### 2026-04-17 — Portfolio growth panes for stocks
- New `GET /api/history?symbols=…&range=1d|1y|3y|5y` endpoint ([app/api/history/route.ts](app/api/history/route.ts)) backed by `getHistory()` in [lib/market.ts](lib/market.ts). Uses `yahoo-finance2.chart()` with interval `5m` for 1D and `1d` for the yearly ranges. In-memory cache: 60 s for 1D, 15 min for daily series.
- `useHistory(symbols, range)` hook added to [app/providers.tsx](app/providers.tsx).
- New [components/stock-growth-pane.tsx](components/stock-growth-pane.tsx) — a **collapsible** card (framer-motion height animation) containing:
  - Range filter tabs: **1D / 1Y / 3Y / 5Y**.
  - Symbol tabs: **Combined** + each individual ticker.
  - Recharts area chart with gradient fill + custom dark tooltip; axes auto-scale, ticks formatted per range (time-of-day for 1D, `MMM DD` for 1Y, `MMM YY` for multi-year).
  - Header KPI: end-of-range value + absolute and % delta vs start of range.
  - Projection logic: multiplies each symbol's historical close by the **current** held quantity; the "Combined" series sums per timestamp.
- Dashboard ([app/dashboard.tsx](app/dashboard.tsx)) now renders one pane per stock category (US Stocks in USD, Indian Stocks in INR) below the holdings grid. The pane is only fetched when expanded (`enabled` on the query) to avoid unnecessary Yahoo calls.

### 2026-04-17 — CSV export / import
- New [lib/csv.ts](lib/csv.ts): `investmentsToCsv()` (RFC-4180-ish escaping) and a dependency-free `parseCsv()` that handles quoted fields, escaped quotes (`""`), CRLF line endings, and BOM. `rowToInvestmentInput()` validates a parsed row and returns the exact POST body the existing `/api/investments` route expects.
- CSV columns: `id, category, symbol, quantity, avgCost, label, balance, principal, interestRate, currency, createdAt, updatedAt`. On import, `id` and timestamps are ignored (the server assigns them), so the format round-trips safely.
- **Export**: new **Export CSV** button on the dashboard header ([app/dashboard.tsx](app/dashboard.tsx)) downloads `investments-YYYY-MM-DD.csv` via a client-side Blob; shows a 1.5 s success toast.
- **Import**: new [components/import-csv-card.tsx](components/import-csv-card.tsx) at the top of the Add Investment page. User clicks Upload CSV → each valid row is POSTed. Successes and per-row errors are summarised in toasts; the investments query is invalidated so the list updates immediately.

### 2026-04-17 — Refresh feedback, edit investments, formatted inputs
- **Refresh toast**: the dashboard's Refresh button still spins the icon while fetching (`animate-spin` driven by `isFetching`), and now shows a short **"Prices refreshed"** toast for 1.5 s on completion; failures show a 2 s error toast ([app/dashboard.tsx](app/dashboard.tsx)).
- **Edit investment**: added a pencil icon on each row in the Add tab's list. Clicking it puts the form into "Edit" mode — fields are prefilled, the submit button becomes **Save changes**, and a Cancel button appears. Category is locked while editing (disabled with tooltip) because it changes the schema shape. Submitting sends a `PATCH /api/investments/{id}` using the existing route. If the row being edited is deleted, the form resets. ([components/add-investment-form.tsx](components/add-investment-form.tsx))
- **Comma-formatted numeric inputs**: new reusable [components/numeric-input.tsx](components/numeric-input.tsx) — controlled text input that keeps only digits + one decimal point internally and displays the value with locale-aware thousands separators. Used for Quantity, Avg Cost, Balance, Principal, and Interest Rate. Locales: INR fields use `en-IN` (e.g. `12,34,567.89`), USD fields use `en-US`, non-currency fields (quantity, %) use `en-US`.

### 2026-04-17 — Principal & interest rate for EPF/PPF
- Extended `CashInvestmentSchema` in [lib/types.ts](lib/types.ts) with optional `principal` (INR) and `interestRate` (% p.a.). Both remain backward-compatible with existing `data/investments.json` entries.
- Updated `costIn()` in [lib/valuation.ts](lib/valuation.ts) to return the principal as the cost basis for EPF/PPF when present — this makes the dashboard's **P/L column** light up for those rows automatically (profit = current balance − principal).
- Added two optional fields to the Add-Investment form for EPF/PPF in [components/add-investment-form.tsx](components/add-investment-form.tsx): **Principal (INR)** and **Interest Rate %**. Both blank-as-omit; validated non-negative if supplied. Short helper text explains the purpose.
- The "your investments" list shows `principal ₹…` and `x.x% p.a.` in the subtitle when set.
- Holdings table in [components/holdings-table.tsx](components/holdings-table.tsx) now uses the **Unit Price** column to show interest rate (`x% p.a.`) and the **Avg Cost** column to show principal for EPF/PPF rows.

### 2026-04-17 — Category-level reorder on dashboard
- Wrapped the holdings list in an outer `Reorder.Group` over the **categories** in [components/holdings-table.tsx](components/holdings-table.tsx), while keeping the inner per-row `Reorder.Group` intact.
- Each category section is now a `Reorder.Item` with a **grip handle in its header** (uses `useDragControls` so only the handle triggers drag; row interactions are unaffected).
- `onReorderCategories` rebuilds the full ordered list by concatenating each category's existing rows in the new category order, then persists via the existing `PUT /api/investments/reorder` endpoint with optimistic local state + toast-on-error revert.
- Updated the hint text to mention both row-level and section-level drag.

### 2026-04-17 — Reorder holdings on dashboard
- Added `PUT /api/investments/reorder` ([app/api/investments/reorder/route.ts](app/api/investments/reorder/route.ts)) accepting `{ ids: string[] }`; validates exact id-set match then persists the new order.
- Added `reorderInvestments(ids)` in [lib/storage.ts](lib/storage.ts), writing under the same mutex + atomic rename.
- Rewrote [components/holdings-table.tsx](components/holdings-table.tsx) to use Framer Motion `Reorder.Group` / `Reorder.Item`:
  - Grip-handle drag per row (`dragListener={false}` + `useDragControls`) so the rest of the row stays interactive.
  - Reorder is scoped **within a category** (matches the grouped table layout); the full-list order is rebuilt preserving other categories' positions.
  - Optimistic local state + immediate persist; reverts via `queryClient.invalidateQueries` and a toast if the request fails.
  - Drag affordance: subtle lift, glow and tint on `whileDrag`.
- Node upgraded to **v24 LTS** on the dev machine (removes the `yahoo-finance2` "Node ≥ 22 preferred" warning).

## Phase 1 (implemented)

A personal investment-tracking web app covering multi-category, multi-currency holdings with a live dashboard and local persistence.

### Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**.
- **Tailwind CSS v4** with a small custom dark/light theme (no shadcn).
- **`yahoo-finance2`** for live prices (US + NSE/BSE) and USD/INR FX (server-side only, inside API routes).
- **`@tanstack/react-query`** for client data fetching with 60s `refetchInterval` and 30s server-side cache.
- **`framer-motion`** for entrance/stagger animations, active-tab pill, animated number.
- **`recharts`** for the allocation donut.
- **`lucide-react`** for icons.
- **`sonner`** for toasts.
- **`next-themes`** for dark/light mode.
- **`zod`** for validating API input and stored JSON.
- **Persistence**: JSON file at `data/investments.json`, written via Next.js Route Handlers (Node runtime) with a simple in-process write mutex. `data/` is gitignored.

### Data model

Stored as `{ investments: Investment[], updatedAt: string }`.

```ts
type Investment =
  | { id; createdAt; updatedAt?; category: "US_STOCK" | "INDIAN_STOCK";
      symbol; quantity; avgCost; currency: "USD" | "INR" }
  | { id; createdAt; updatedAt?; category: "EPF" | "PPF";
      label; balance; currency: "INR" };
```

Amounts are stored in their native currency; the display layer converts to the selected display currency (INR or USD) via live FX.

### File layout

- [app/layout.tsx](app/layout.tsx) — root layout: fonts, `Providers`, top nav, metadata.
- [app/providers.tsx](app/providers.tsx) — `QueryClientProvider`, `ThemeProvider`, `CurrencyProvider` (persists in `localStorage`), and shared `useInvestments` / `usePrices` / `useFx` hooks.
- [app/page.tsx](app/page.tsx) — routes to the dashboard.
- [app/dashboard.tsx](app/dashboard.tsx) — dashboard UI.
- [app/add/page.tsx](app/add/page.tsx) — Add Investment tab.
- [app/api/investments/route.ts](app/api/investments/route.ts) — `GET` + `POST`.
- [app/api/investments/[id]/route.ts](app/api/investments/[id]/route.ts) — `PATCH` + `DELETE`.
- [app/api/quotes/route.ts](app/api/quotes/route.ts) — `GET /api/quotes?symbols=…`.
- [app/api/fx/route.ts](app/api/fx/route.ts) — `GET /api/fx` → `{ usdInr, asOf }`.
- [lib/types.ts](lib/types.ts) — Zod schemas, `Category` enum, `CATEGORY_META` (label + color).
- [lib/storage.ts](lib/storage.ts) — JSON file CRUD with mutex + atomic rename.
- [lib/market.ts](lib/market.ts) — `yahoo-finance2` wrappers with 30s in-memory cache and last-known fallback.
- [lib/valuation.ts](lib/valuation.ts) — pure `valueIn`, `costIn`, `netWorth`, `aggregateByCategory`, `symbolsOf`.
- [lib/format.ts](lib/format.ts) — currency/number/percent formatters.
- [lib/cn.ts](lib/cn.ts) — `clsx` + `tailwind-merge` helper.
- [components/top-nav.tsx](components/top-nav.tsx), [components/currency-toggle.tsx](components/currency-toggle.tsx), [components/theme-toggle.tsx](components/theme-toggle.tsx), [components/animated-number.tsx](components/animated-number.tsx), [components/card.tsx](components/card.tsx), [components/allocation-pie.tsx](components/allocation-pie.tsx), [components/holdings-table.tsx](components/holdings-table.tsx), [components/add-investment-form.tsx](components/add-investment-form.tsx).
- [app/globals.css](app/globals.css) — Tailwind v4 `@theme`, gradient background, `.input` utility, light-mode override.
- [data/investments.json](data/investments.json) — local state (created on first API call; gitignored).

### Features delivered

- **Dashboard as landing page** with:
  - Header: title, live **USD/INR** badge, manual Refresh (spins while fetching).
  - KPI cards: **Net Worth** (with animated count-up), **Total P/L** (color-coded), and the top-two categories by value.
  - **Allocation donut** with legend listing each category's value and share.
  - **Holdings table** grouped by category, showing qty, unit price (in the holding's native currency), avg cost, current value (in display currency), and P/L % with up/down arrows.
  - Empty state with animated illustration and CTA to the Add tab.
- **Add Investment tab**:
  - Category chooser (US Stock / Indian Stock / EPF / PPF) with icons.
  - Stocks: symbol + Lookup button (preview card with current price), quantity, avg cost.
  - EPF/PPF: label + INR balance.
  - Right-hand live list with delete confirmation.
- **Global INR/USD toggle** (persists in `localStorage`); all values reformat on toggle and FX badge is always visible.
- **Live data**: prices + FX auto-refresh every 60s via React Query; server-side 30s cache to avoid hammering Yahoo.
- **Persistence**: every add/delete writes `data/investments.json` atomically (temp file + rename) under a mutex.
- **Polish**: dark/light themes, animated nav pill, card entrance animations, toasts on success/failure, skeleton loading states.

### Verification (completed)

1. `npm run build` succeeds (Next 16 + TS strict). ✓
2. `npm run dev` serves:
   - `GET /` → 200 (dashboard, empty state).
   - `GET /add` → 200.
   - `GET /api/fx` → `{"usdInr":92.81,...}` (live).
   - `GET /api/quotes?symbols=AAPL,RELIANCE.NS` → live USD and INR prices with names.
   - `POST /api/investments` → persisted and echoed with id/timestamps.
   - `DELETE /api/investments/:id` → removes from JSON file.

### Known notes / caveats

- `yahoo-finance2` v3 logs a soft warning on **Node 20** (it prefers ≥ 22). Works fine; revisit if you upgrade Node.
- The FX fallback is **83** INR/USD if Yahoo is unreachable on first call.
- PowerShell **execution policy** blocks `npm.ps1`; use `npm.cmd` from terminal scripts.
- Node must be on PATH. The workspace was set up with `nvm-windows` at `C:\nvm4w\nodejs`.

### Run it

```powershell
cd "C:\Users\syedm\Documents\Personal project\investment-tracker"
npm run dev
# open http://localhost:3000
```

---

## Decisions (for phase 1)

- **Backend is Next.js API routes**, not a standalone Express server — same "local JSON via Node backend" outcome with one process.
- **Symbol input**: free-text with on-blur / button lookup preview (simpler than typeahead, still polished).
- **Average-cost currency**: auto-set from category (US → USD, Indian → INR). Editing is a future-phase item.
- **EPF/PPF tracking**: manual current-balance entry (no auto-accrue).
- **Refresh cadence**: 60 s client refetch + 30 s server cache + manual Refresh button.

---

## Roadmap — future phases

### Phase 2 — richer editing & more categories
- **Edit** existing investments in-place (dialog): currently only add/delete.
- **Override avg-cost currency** (e.g., US stock bought via INR-quoted broker).
- **Notes** field per holding, shown on hover.
- Additional categories: **Mutual Funds** (NAV lookup), **ETFs**, **Gold** (spot price), **Crypto** (CoinGecko), **Real Estate** (manual).
- Per-holding **target allocation** and drift indicator.

### Phase 3 — history & analytics
- Daily snapshots of net worth to `data/history.jsonl`; **time-series line chart** (1W / 1M / 1Y / All).
- **Transaction log**: buys/sells with realized vs unrealized P/L; CAGR / XIRR per holding.
- **Tax lots** (FIFO) and capital-gains reports for India + US.
- **CSV import/export** for Zerodha / Groww / Fidelity statements.
- Watchlist (tickers without holdings).

### Phase 4 — auto-accrual & smarter EPF/PPF
- **Auto-accrue EPF/PPF** from principal + interest rate + last-updated date.
- Configurable **monthly contributions** and projected balance chart.
- Reminder to update balances quarterly.

### Phase 5 — multi-user / cloud
- Optional **Supabase/Firebase** backend swap behind the same API shape.
- **Authentication** (email / Google).
- **Multi-device sync** + per-user preferences.

### Phase 6 — platform & UX polish
- **PWA** install + offline read-only mode using IndexedDB cache.
- **Mobile-first** layout refinements, bottom nav.
- **Customizable dashboard** (drag-reorder KPI/chart cards).
- **Alerts** (price thresholds, rebalancing drift) via browser notifications.
- Replace unofficial Yahoo with an **official data provider** (Alpha Vantage / Twelve Data / Finnhub) behind the same `lib/market.ts` interface.

### Technical debt to address as scope grows
- Move stored data to **SQLite (better-sqlite3)** when concurrency / history are added.
- Extract API clients into a typed SDK (`lib/api.ts`) consumed by hooks.
- Add **unit tests** for `lib/valuation.ts` and an **integration test** for the API routes.
- Introduce **ESLint + Prettier** rules beyond the Next defaults; add `tsc --noEmit` to a CI workflow.
