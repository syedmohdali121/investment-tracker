# 📈 Investment Tracker

> Your entire portfolio. One gorgeous dashboard. Live prices, live charts, live conviction.

A modern, animated, multi-currency investment tracker that unifies **US stocks**, **Indian stocks**, **EPF**, and **PPF** into a single beautiful view — with real-time quotes, intraday sparklines, historical growth projections, and a delightfully snappy UX.

Built with **Next.js 16**, **React 19**, **Tailwind CSS v4**, **Framer Motion**, **Recharts**, **TanStack Query**, and **yahoo-finance2**.

---

## ✨ Highlights

- 🌍 **Multi-market, multi-currency** — track NYSE/NASDAQ and NSE/BSE holdings side-by-side, plus Indian retirement accounts (EPF, PPF). Toggle the entire dashboard between **INR ⇄ USD** in one click.
- ⚡ **Live prices** — fetched every 60 seconds via Yahoo Finance, with smart in-memory caching and stale-while-error fallbacks.
- 🕯️ **Per-row intraday sparklines** — each stock row shows a mini SVG chart of today's movement (or the last open session when the market is closed), with the absolute dollar/rupee delta and percent change.
- 🟢 **Market open / closed badge** — NYSE and NSE status pills with a pulsing dot and a live countdown to the next open/close in *your* local time. DST-aware.
- 📊 **Growth over time** — collapsible per-category historical chart (US Stocks and Indian Stocks). Filter by **1D · 5D · 1Y · 3Y · 5Y**. View per-symbol or a combined series of your entire category, projected with your current quantities.
- 🥧 **Allocation pie + KPIs** — animated donut chart, net worth card with count-up animation, total P/L, top categories, and per-category share of portfolio.
- 🖱️ **Drag-to-reorder everything** — reorder holdings within a category *and* reorder entire categories (pin US Stocks to the top, move PPF below EPF, whatever you like). Orders are persisted.
- ✏️ **Full CRUD with smooth UX** — add, edit, and delete any investment. Numeric inputs display with locale-aware thousands separators as you type (e.g. `1,25,000`).
- 💾 **CSV import / export** — download your entire portfolio as a CSV from the dashboard; re-upload or bulk-add from the Add page using the same format.
- 🏦 **EPF / PPF with principal & interest** — track contributions as principal + annual interest rate (both optional). P/L is computed automatically when you provide principal.
- 🎨 **Crafted UI** — dark-by-default with a light theme toggle, radial-gradient cards, smooth Framer Motion layout transitions, animated page nav, and a refresh button that spins with a tiny success toast.
- 💽 **Local-first persistence** — your data lives in a JSON file on disk (`data/investments.json`), written atomically with an in-process mutex. Nothing leaves your machine except anonymous Yahoo price requests.

---

## 🧭 Tour

### Dashboard
- **Net Worth** and **Total P/L** KPIs with animated count-ups.
- **Allocation donut** colored by category, with a side legend showing each bucket's value and share.
- **Holdings table** grouped by category, with drag handles on both rows *and* headers, a per-row sparkline, today's delta, and a running P/L with directional arrows.
- **Growth over time** pane per stock category — expand to see an area chart with a gradient fill, dashed baseline at the prior close, and tab switchers for both symbol and time range.
- One-tap **Refresh** and **Export CSV**.

### Add Investment
- A category chooser that adapts the form — stocks ask for symbol, quantity, and avg cost (with a **Lookup** button for a live price preview); EPF/PPF ask for a label, balance, and optional principal + interest rate.
- **Import CSV** card at the top to bulk-load a portfolio.
- The same form morphs into an **Edit** mode when you click the pencil icon on a holding — category stays locked, fields are pre-filled, and the row is highlighted until you save or cancel.

---

## 🧱 Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4, Framer Motion, lucide-react |
| Charts | Recharts + hand-rolled inline-SVG sparklines |
| State / data | TanStack Query, Zod, next-themes, sonner |
| Market data | yahoo-finance2 (quotes · chart · FX) |
| Persistence | File-system JSON with async mutex and atomic writes |
| Language | TypeScript 5 |

---

## 🚀 Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Your data is stored at `data/investments.json` (git-ignored). Use **Export CSV** for backups.

### Production build

```bash
npm run build
npm start
```

---

## 📂 Data Model (abridged)

```ts
type Investment =
  | { category: "US_STOCK" | "INDIAN_STOCK";
      symbol: string; quantity: number; avgCost: number;
      currency: "USD" | "INR"; }
  | { category: "EPF" | "PPF";
      label: string; balance: number; currency: "INR";
      principal?: number; interestRate?: number; };
```

---

## 🛣️ Roadmap

- Dividend & interest accrual timelines
- Multi-account / tagging
- Mobile-optimized swipe gestures
- Cloud sync (optional)
- Holiday-aware market calendars

---

Made with ☕ and a lot of `useMemo`.
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
