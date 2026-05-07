import { Investment, isStock } from "./types";

const HEADERS = [
  "id",
  "category",
  "symbol",
  "quantity",
  "avgCost",
  "label",
  "balance",
  "principal",
  "interestRate",
  "maturityDate",
  "currency",
  "createdAt",
  "updatedAt",
] as const;

export type CsvHeader = (typeof HEADERS)[number];

export function investmentsToCsv(investments: Investment[]): string {
  const rows = [HEADERS.join(",")];
  for (const inv of investments) {
    const row: Record<CsvHeader, string | number | undefined> = {
      id: inv.id,
      category: inv.category,
      symbol: isStock(inv) ? inv.symbol : undefined,
      quantity: isStock(inv) ? inv.quantity : undefined,
      avgCost: isStock(inv) ? inv.avgCost : undefined,
      label: isStock(inv) ? undefined : inv.label,
      balance: isStock(inv) ? undefined : inv.balance,
      principal: isStock(inv) ? undefined : inv.principal,
      interestRate: isStock(inv) ? undefined : inv.interestRate,
      maturityDate: isStock(inv) ? undefined : inv.maturityDate,
      currency: inv.currency,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    };
    rows.push(HEADERS.map((h) => escape(row[h])).join(","));
  }
  return rows.join("\n") + "\n";
}

function escape(v: string | number | undefined): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Parse a CSV string. Returns array of row objects keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return [];
  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
}

/** Convert a parsed row into the POST body accepted by /api/investments. */
export function rowToInvestmentInput(
  row: Record<string, string>,
): Record<string, unknown> | { error: string } {
  const category = row.category?.toUpperCase();
  if (!category) return { error: "Missing category" };
  const STOCK_LIKE = new Set(["US_STOCK", "INDIAN_STOCK", "MUTUAL_FUND"]);
  const CASH_LIKE = new Set(["EPF", "PPF", "FD", "BONDS", "GOLD", "REAL_ESTATE"]);
  if (STOCK_LIKE.has(category)) {
    const symbol = row.symbol?.trim().toUpperCase();
    const quantity = numOrNaN(row.quantity);
    const avgCost = numOrNaN(row.avgCost);
    if (!symbol) return { error: "Missing symbol" };
    if (!(quantity > 0)) return { error: "Invalid quantity" };
    if (!(avgCost >= 0)) return { error: "Invalid avgCost" };
    const currency =
      row.currency?.toUpperCase() === "INR"
        ? "INR"
        : row.currency?.toUpperCase() === "USD"
          ? "USD"
          : category === "US_STOCK"
            ? "USD"
            : "INR";
    return { category, symbol, quantity, avgCost, currency };
  }
  if (CASH_LIKE.has(category)) {
    const label = row.label?.trim();
    const balance = numOrNaN(row.balance);
    if (!label) return { error: "Missing label" };
    if (!(balance >= 0)) return { error: "Invalid balance" };
    const principal =
      row.principal && row.principal.trim() !== ""
        ? numOrNaN(row.principal)
        : undefined;
    const interestRate =
      row.interestRate && row.interestRate.trim() !== ""
        ? numOrNaN(row.interestRate)
        : undefined;
    if (principal !== undefined && !(principal >= 0))
      return { error: "Invalid principal" };
    if (interestRate !== undefined && !(interestRate >= 0))
      return { error: "Invalid interestRate" };
    const currency =
      category === "EPF" || category === "PPF"
        ? "INR"
        : row.currency?.toUpperCase() === "USD"
          ? "USD"
          : "INR";
    const maturityDate =
      row.maturityDate && row.maturityDate.trim() !== ""
        ? row.maturityDate.trim()
        : undefined;
    return {
      category,
      label,
      balance,
      currency,
      ...(principal !== undefined ? { principal } : {}),
      ...(interestRate !== undefined ? { interestRate } : {}),
      ...(maturityDate !== undefined ? { maturityDate } : {}),
    };
  }
  return { error: `Unknown category: ${category}` };
}

function numOrNaN(v: string | undefined): number {
  if (v === undefined) return NaN;
  const clean = v.replace(/,/g, "").trim();
  if (clean === "") return NaN;
  return Number(clean);
}
