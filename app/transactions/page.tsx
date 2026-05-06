"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Coins,
  ListOrdered,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useInvestments,
  useTransactions,
} from "@/app/providers";
import {
  isStock,
  type Currency,
  type StockInvestment,
  type Transaction,
  type TransactionType,
  TRANSACTION_TYPES,
} from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { NumericInput } from "@/components/numeric-input";
import { cn } from "@/lib/cn";

const TYPE_META: Record<
  TransactionType,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  BUY: {
    label: "Buy",
    color: "#10b981",
    icon: ArrowUp,
    tone: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  },
  SELL: {
    label: "Sell",
    color: "#f43f5e",
    icon: ArrowDown,
    tone: "text-rose-300 border-rose-400/30 bg-rose-400/10",
  },
  DIVIDEND: {
    label: "Dividend",
    color: "#a855f7",
    icon: Coins,
    tone: "text-purple-300 border-purple-400/30 bg-purple-400/10",
  },
  FEE: {
    label: "Fee",
    color: "#f59e0b",
    icon: Receipt,
    tone: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  },
};

export default function TransactionsPage() {
  const investmentsQ = useInvestments();
  const investments = investmentsQ.data?.investments ?? [];
  const stocks = investments.filter(isStock) as StockInvestment[];
  const [filterId, setFilterId] = useState<string>("__all__");
  const txQ = useTransactions(filterId === "__all__" ? undefined : filterId);
  const transactions = txQ.data?.transactions ?? [];
  const [dialog, setDialog] = useState<
    | { mode: "add" }
    | { mode: "edit"; tx: Transaction }
    | null
  >(null);

  const investmentById = useMemo(() => {
    const m = new Map<string, StockInvestment>();
    for (const s of stocks) m.set(s.id, s);
    return m;
  }, [stocks]);

  const noStocks = stocks.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6 flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-indigo-300">
            <ListOrdered className="h-3.5 w-3.5" />
            Ledger
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Transactions
          </h1>
          <p className="mt-1 text-sm text-muted">
            Buys, sells, dividends and fees. Holdings (quantity, average cost,
            purchase date) are derived from this ledger using FIFO.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stocks.length > 0 && (
            <select
              value={filterId}
              onChange={(e) => setFilterId(e.target.value)}
              className="input min-w-[180px]"
              aria-label="Filter by holding"
            >
              <option value="__all__">All holdings</option>
              {stocks.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.symbol}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setDialog({ mode: "add" })}
            disabled={noStocks}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:shadow-indigo-500/40 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            New transaction
          </button>
        </div>
      </motion.header>

      {noStocks ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-muted">
            Add a stock holding first.{" "}
            <Link href="/add" className="font-semibold text-indigo-300 hover:underline">
              Go to Add Investment
            </Link>
            .
          </p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-muted">
          {txQ.isLoading ? "Loading…" : "No transactions yet."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-white/[0.01]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Symbol</th>
                <th className="px-3 py-3 text-right font-medium">Qty</th>
                <th className="px-3 py-3 text-right font-medium">Price / Amount</th>
                <th className="px-3 py-3 text-right font-medium">Fees</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const inv = investmentById.get(t.investmentId);
                const meta = TYPE_META[t.type];
                const Icon = meta.icon;
                const total =
                  t.type === "BUY" || t.type === "SELL"
                    ? t.quantity * t.price + (t.type === "BUY" ? (t.fees ?? 0) : -(t.fees ?? 0))
                    : t.price - (t.fees ?? 0);
                const sign =
                  t.type === "BUY" || t.type === "FEE" ? -1 : 1;
                return (
                  <tr
                    key={t.id}
                    className="border-b border-white/[0.04] last:border-0 transition hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 text-muted tabular-nums">
                      {formatDateShort(t.date)}
                    </td>
                    <td className="py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                          meta.tone,
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium">
                      {inv?.symbol ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {t.type === "BUY" || t.type === "SELL"
                        ? formatNumber(t.quantity, 4)
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrency(t.price, t.currency)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted">
                      {(t.fees ?? 0) > 0
                        ? formatCurrency(t.fees ?? 0, t.currency)
                        : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 text-right font-semibold tabular-nums",
                        sign * total >= 0 ? "text-emerald-300" : "text-rose-300",
                      )}
                    >
                      {sign * total >= 0 ? "+" : "−"}
                      {formatCurrency(Math.abs(total), t.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setDialog({ mode: "edit", tx: t })}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-indigo-500/10 hover:text-indigo-300"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <DeleteButton id={t.id} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {dialog && (
          <TransactionDialog
            stocks={stocks}
            initialInvestmentId={
              filterId !== "__all__" ? filterId : undefined
            }
            existing={dialog.mode === "edit" ? dialog.tx : null}
            onClose={() => setDialog(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function onClick() {
    if (!confirm("Delete this transaction?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Transaction deleted");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["transactions"] }),
        qc.invalidateQueries({ queryKey: ["investments"] }),
      ]);
    } catch {
      toast.error("Failed to delete");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
      aria-label="Delete"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}

function TransactionDialog({
  stocks,
  initialInvestmentId,
  existing,
  onClose,
}: {
  stocks: StockInvestment[];
  initialInvestmentId?: string;
  existing: Transaction | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [investmentId, setInvestmentId] = useState<string>(
    existing?.investmentId ?? initialInvestmentId ?? stocks[0]?.id ?? "",
  );
  const [type, setType] = useState<TransactionType>(existing?.type ?? "BUY");
  const [date, setDate] = useState<string>(
    toDateInputValue(existing?.date) || todayDateInputValue(),
  );
  const [quantity, setQuantity] = useState<string>(
    existing?.quantity != null && existing.type !== "DIVIDEND" && existing.type !== "FEE"
      ? String(existing.quantity)
      : "",
  );
  const [price, setPrice] = useState<string>(
    existing?.price != null ? String(existing.price) : "",
  );
  const [fees, setFees] = useState<string>(
    existing?.fees ? String(existing.fees) : "",
  );
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const inv = stocks.find((s) => s.id === investmentId);
  const currency: Currency = (inv?.currency as Currency) ?? "INR";
  const isQtyType = type === "BUY" || type === "SELL";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!investmentId) {
        toast.error("Pick a holding.");
        return;
      }
      const [y, m, d] = date.split("-").map(Number);
      if (!y || !m || !d) {
        toast.error("Pick a valid date.");
        return;
      }
      const dateIso = new Date(y, m - 1, d, 12, 0, 0).toISOString();
      const qty = isQtyType ? parseFloat(quantity) : 0;
      const px = parseFloat(price);
      const fe = fees.trim() ? parseFloat(fees) : 0;
      if (isQtyType && !(qty > 0)) {
        toast.error("Quantity must be greater than 0.");
        return;
      }
      if (!(px >= 0) || Number.isNaN(px)) {
        toast.error(
          isQtyType ? "Price must be a number." : "Amount must be a number.",
        );
        return;
      }
      if (!(fe >= 0) || Number.isNaN(fe)) {
        toast.error("Fees must be a non-negative number.");
        return;
      }
      const body = {
        investmentId,
        type,
        date: dateIso,
        quantity: qty,
        price: px,
        fees: fe,
        currency,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const url = existing
        ? `/api/transactions/${existing.id}`
        : "/api/transactions";
      const method = existing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed");
      }
      toast.success(existing ? "Transaction updated" : "Transaction added");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["transactions"] }),
        qc.invalidateQueries({ queryKey: ["investments"] }),
      ]);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.form
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">
              {existing ? "Edit transaction" : "New transaction"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              Holdings update automatically when you save.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-white/5 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <DialogField label="Holding">
              <select
                value={investmentId}
                onChange={(e) => setInvestmentId(e.target.value)}
                className="input"
              >
                {stocks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.symbol}
                  </option>
                ))}
              </select>
            </DialogField>
            <DialogField label="Type">
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
                {TRANSACTION_TYPES.map((tt) => {
                  const m = TYPE_META[tt];
                  const Icon = m.icon;
                  const active = type === tt;
                  return (
                    <button
                      type="button"
                      key={tt}
                      onClick={() => setType(tt)}
                      className={cn(
                        "flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider transition",
                        active
                          ? "bg-white/10 text-foreground"
                          : "text-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </DialogField>
          </div>

          <DialogField label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayDateInputValue()}
              className="input"
            />
          </DialogField>

          <div className="grid grid-cols-2 gap-3">
            {isQtyType ? (
              <>
                <DialogField label="Quantity">
                  <NumericInput
                    value={quantity}
                    onChange={setQuantity}
                    locale="en-US"
                    placeholder="0"
                  />
                </DialogField>
                <DialogField label={`Price per share (${currency})`}>
                  <NumericInput
                    value={price}
                    onChange={setPrice}
                    locale={currency === "INR" ? "en-IN" : "en-US"}
                    placeholder="0.00"
                  />
                </DialogField>
              </>
            ) : (
              <DialogField
                label={`${type === "DIVIDEND" ? "Dividend amount" : "Fee amount"} (${currency})`}
              >
                <NumericInput
                  value={price}
                  onChange={setPrice}
                  locale={currency === "INR" ? "en-IN" : "en-US"}
                  placeholder="0.00"
                />
              </DialogField>
            )}
          </div>

          {isQtyType && (
            <DialogField label={`Fees / commissions (${currency}) — optional`}>
              <NumericInput
                value={fees}
                onChange={setFees}
                locale={currency === "INR" ? "en-IN" : "en-US"}
                placeholder="0"
              />
            </DialogField>
          )}

          <DialogField label="Notes (optional)">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. broker, lot, reason"
              className="input"
            />
          </DialogField>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {existing ? "Save changes" : "Add transaction"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-foreground/80 transition hover:bg-white/10 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function DialogField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDateShort(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return DATE_FMT.format(new Date(t));
}

function toDateInputValue(iso: string | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayDateInputValue(): string {
  return toDateInputValue(new Date().toISOString());
}
