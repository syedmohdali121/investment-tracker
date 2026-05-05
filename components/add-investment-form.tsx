"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Briefcase,
  Check,
  CircleDollarSign,
  Flag,
  Landmark,
  Loader2,
  Pencil,
  PiggyBank,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useInvestments } from "@/app/providers";
import {
  CATEGORY_META,
  Category,
  Investment,
  isStock,
} from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { NumericInput } from "@/components/numeric-input";

const CATEGORY_OPTIONS: Array<{
  value: Category;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    value: "US_STOCK",
    label: "US Stock",
    icon: CircleDollarSign,
    description: "e.g. AAPL, MSFT",
  },
  {
    value: "INDIAN_STOCK",
    label: "Indian Stock",
    icon: Flag,
    description: "e.g. RELIANCE.NS, TCS.NS",
  },
  {
    value: "EPF",
    label: "EPF",
    icon: Landmark,
    description: "Employee Provident Fund balance",
  },
  {
    value: "PPF",
    label: "PPF",
    icon: PiggyBank,
    description: "Public Provident Fund balance",
  },
];

type SymbolPreview = {
  symbol: string;
  price: number;
  currency: "USD" | "INR";
  name?: string;
};

export function AddInvestmentForm() {
  const qc = useQueryClient();
  const investmentsQ = useInvestments();
  const [category, setCategory] = useState<Category>("US_STOCK");
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [label, setLabel] = useState("");
  const [balance, setBalance] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [preview, setPreview] = useState<SymbolPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const isStockForm = category === "US_STOCK" || category === "INDIAN_STOCK";
  const defaultCurrency = category === "US_STOCK" ? "USD" : "INR";
  const stockLocale = defaultCurrency === "INR" ? "en-IN" : "en-US";

  const looksLikeStock = useMemo(() => symbol.trim().length >= 1, [symbol]);

  function resetForm() {
    setSymbol("");
    setQuantity("");
    setAvgCost("");
    setLabel("");
    setBalance("");
    setPrincipal("");
    setInterestRate("");
    setPurchaseDate("");
    setPreview(null);
    setEditingId(null);
  }

  function startEdit(inv: Investment) {
    setEditingId(inv.id);
    setCategory(inv.category);
    setPreview(null);
    // Pre-fill the date picker with the existing purchase date so users
    // can correct it. Date input expects YYYY-MM-DD in local time.
    setPurchaseDate(toDateInputValue(inv.createdAt));
    if (isStock(inv)) {
      setSymbol(inv.symbol);
      setQuantity(String(inv.quantity));
      setAvgCost(String(inv.avgCost));
      setLabel("");
      setBalance("");
      setPrincipal("");
      setInterestRate("");
    } else {
      setSymbol("");
      setQuantity("");
      setAvgCost("");
      setLabel(inv.label);
      setBalance(String(inv.balance));
      setPrincipal(
        inv.principal !== undefined ? String(inv.principal) : "",
      );
      setInterestRate(
        inv.interestRate !== undefined ? String(inv.interestRate) : "",
      );
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function fetchPreview() {
    if (!isStockForm || !symbol.trim()) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/quotes?symbols=${encodeURIComponent(symbol.trim().toUpperCase())}`,
      );
      const json = await res.json();
      const q = (json.quotes ?? [])[0];
      setPreview(q ?? null);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      // The date input gives us a YYYY-MM-DD string in the user's local
      // timezone. Convert to an ISO timestamp at local noon so it lands on
      // the same calendar day in any timezone the server might use.
      let createdAtIso: string | undefined;
      if (purchaseDate.trim()) {
        const [y, m, d] = purchaseDate.split("-").map(Number);
        if (y && m && d) {
          createdAtIso = new Date(y, m - 1, d, 12, 0, 0).toISOString();
        }
      }
      let body: Record<string, unknown>;
      if (isStockForm) {
        const q = parseFloat(quantity);
        const a = parseFloat(avgCost);
        if (!symbol.trim() || !(q > 0) || !(a >= 0)) {
          toast.error("Please enter symbol, quantity and average cost.");
          return;
        }
        body = {
          category,
          symbol: symbol.trim().toUpperCase(),
          quantity: q,
          avgCost: a,
          currency: defaultCurrency,
          ...(createdAtIso ? { createdAt: createdAtIso } : {}),
        };
      } else {
        const b = parseFloat(balance);
        if (!label.trim() || !(b >= 0)) {
          toast.error("Please enter a label and a balance.");
          return;
        }
        const p = principal.trim() === "" ? undefined : parseFloat(principal);
        const r =
          interestRate.trim() === "" ? undefined : parseFloat(interestRate);
        if (p !== undefined && !(p >= 0)) {
          toast.error("Principal must be a non-negative number.");
          return;
        }
        if (r !== undefined && !(r >= 0)) {
          toast.error("Interest rate must be a non-negative number.");
          return;
        }
        body = {
          category,
          label: label.trim(),
          balance: b,
          currency: "INR",
          ...(p !== undefined ? { principal: p } : {}),
          ...(r !== undefined ? { interestRate: r } : {}),
          ...(createdAtIso ? { createdAt: createdAtIso } : {}),
        };
      }
      const url = editingId
        ? `/api/investments/${editingId}`
        : "/api/investments";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || (editingId ? "Failed to update" : "Failed to add"));
      }
      toast.success(editingId ? "Investment updated" : "Investment added");
      resetForm();
      await qc.invalidateQueries({ queryKey: ["investments"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this investment?")) return;
    const res = await fetch(`/api/investments/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      if (editingId === id) resetForm();
      await qc.invalidateQueries({ queryKey: ["investments"] });
    } else {
      toast.error("Failed to delete");
    }
  }

  const investments = investmentsQ.data?.investments ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <motion.form
        onSubmit={onSubmit}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 shadow-xl lg:col-span-2"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.12),_transparent_60%)]" />
        <div className="relative">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">
                {editingId ? "Edit investment" : "Add a new investment"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {editingId
                  ? "Update the values below and save."
                  : "Pick a category and enter the details."}
              </p>
            </div>
          </div>

          <label className="mt-5 block text-xs font-medium uppercase tracking-wider text-muted">
            Category
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {CATEGORY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = category === opt.value;
              const disabled = editingId !== null && !active;
              return (
                <button
                  type="button"
                  key={opt.value}
                  disabled={disabled}
                  onClick={() => {
                    setCategory(opt.value);
                    setPreview(null);
                  }}
                  className={cn(
                    "relative flex items-start gap-2 rounded-xl border p-3 text-left transition",
                    active
                      ? "border-indigo-400/40 bg-indigo-500/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20",
                    disabled && "cursor-not-allowed opacity-40 hover:border-white/10",
                  )}
                  title={disabled ? "Category cannot be changed while editing" : undefined}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg",
                      active
                        ? "bg-gradient-to-br from-indigo-500 to-emerald-500 text-white"
                        : "bg-white/5 text-muted",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <div className="text-xs text-muted">{opt.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {isStockForm ? (
            <div className="mt-5 space-y-4">
              <Field label="Symbol">
                <div className="flex items-center gap-2">
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    onBlur={fetchPreview}
                    placeholder={
                      category === "US_STOCK" ? "e.g. AAPL" : "e.g. RELIANCE.NS"
                    }
                    className="input"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={fetchPreview}
                    disabled={!looksLikeStock || previewLoading}
                    className="flex h-10 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-medium text-muted transition hover:text-foreground disabled:opacity-50"
                  >
                    {previewLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                    Lookup
                  </button>
                </div>
                {preview && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs"
                  >
                    <div className="font-semibold">
                      {preview.symbol}{" "}
                      <span className="font-normal text-muted">
                        {preview.name ? `· ${preview.name}` : ""}
                      </span>
                    </div>
                    <div className="mt-1 text-muted">
                      Current:{" "}
                      <span className="font-semibold text-foreground">
                        {formatCurrency(preview.price, preview.currency)}
                      </span>
                    </div>
                  </motion.div>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantity">
                  <NumericInput
                    value={quantity}
                    onChange={setQuantity}
                    locale="en-US"
                    placeholder="0"
                  />
                </Field>
                <Field label={`Avg Cost (${defaultCurrency})`}>
                  <NumericInput
                    value={avgCost}
                    onChange={setAvgCost}
                    locale={stockLocale}
                    placeholder="0.00"
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <Field label="Label">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={
                    category === "EPF"
                      ? "e.g. EPF – Employer A"
                      : "e.g. PPF – SBI"
                  }
                  className="input"
                />
              </Field>
              <Field label="Current Balance (INR)">
                <NumericInput
                  value={balance}
                  onChange={setBalance}
                  locale="en-IN"
                  placeholder="0"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Principal (INR) — optional">
                  <NumericInput
                    value={principal}
                    onChange={setPrincipal}
                    locale="en-IN"
                    placeholder="Total contributed"
                  />
                </Field>
                <Field label="Interest Rate % — optional">
                  <NumericInput
                    value={interestRate}
                    onChange={setInterestRate}
                    locale="en-US"
                    placeholder={category === "EPF" ? "e.g. 8.25" : "e.g. 7.1"}
                  />
                </Field>
              </div>
              <p className="text-xs text-muted">
                Enter the total amount you&apos;ve contributed as{" "}
                <span className="font-medium text-foreground/80">Principal</span>{" "}
                to see profit on the dashboard. Interest rate is for reference
                and is optional.
              </p>
            </div>
          )}

          <div className="mt-4">
            <Field
              label={
                isStockForm
                  ? "Purchase date"
                  : "Opening date"
              }
            >
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                max={todayDateInputValue()}
                className="input"
              />
              <p className="mt-1.5 text-[11px] text-muted">
                {isStockForm
                  ? "Used for short-term vs long-term tax classification. Leave blank to use today."
                  : "When you opened this account. Optional — defaults to today."}
              </p>
            </Field>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingId ? (
                <Check className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {editingId ? "Save changes" : "Add Investment"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                disabled={submitting}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-foreground/80 transition hover:bg-white/10 disabled:opacity-60"
              >
                <X className="h-4 w-4" />
                Discard
              </button>
            )}
          </div>
        </div>
      </motion.form>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 lg:col-span-3"
      >
        <div className="mb-3 flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold">Your investments</h2>
          <span className="text-xs text-muted">({investments.length})</span>
        </div>
        {investments.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Nothing here yet — add one on the left.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {investments.map((inv) => (
              <InvestmentRow
                key={inv.id}
                inv={inv}
                isEditing={editingId === inv.id}
                onEdit={startEdit}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}

function Field({
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

function InvestmentRow({
  inv,
  isEditing,
  onEdit,
  onDelete,
}: {
  inv: Investment;
  isEditing: boolean;
  onEdit: (inv: Investment) => void;
  onDelete: (id: string) => void;
}) {
  const meta = CATEGORY_META[inv.category];
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 py-3 transition",
        isEditing && "rounded-lg bg-indigo-500/5 px-2",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: meta.color }}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {isStock(inv) ? inv.symbol : inv.label}
            {isEditing && (
              <span className="ml-2 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-300">
                editing
              </span>
            )}
          </div>
          <div className="text-xs text-muted">
            {isStock(inv)
              ? `${meta.label} · ${formatNumber(inv.quantity, 4)} @ ${formatCurrency(inv.avgCost, inv.currency)}`
              : `${meta.label} · ${formatCurrency(inv.balance, inv.currency)}${
                  inv.principal !== undefined
                    ? ` · principal ${formatCurrency(inv.principal, inv.currency)}`
                    : ""
                }${
                  inv.interestRate !== undefined
                    ? ` · ${inv.interestRate}% p.a.`
                    : ""
                }`}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted/70">
            {formatPurchaseDate(inv.createdAt)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onEdit(inv)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-indigo-500/10 hover:text-indigo-300"
          aria-label="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(inv.id)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-rose-500/10 hover:text-rose-400"
          aria-label="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

/** Convert an ISO timestamp (or anything Date.parse handles) to the
 * `YYYY-MM-DD` value an `<input type="date">` expects, in the user's local
 * timezone. Returns "" if the input can't be parsed. */
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

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatPurchaseDate(iso: string | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return `Since ${DATE_FMT.format(new Date(t))}`;
}