"use client";

/**
 * Optimistic React Query mutation hooks for investments and transactions.
 *
 * The pattern, per React Query's recommendation:
 *   1. `onMutate` cancels any in-flight queries that would clobber our
 *      optimistic write, snapshots the current cache, then patches the
 *      cache with the expected outcome.
 *   2. `onError` restores the snapshot.
 *   3. `onSettled` invalidates so the server's authoritative state replaces
 *      the optimistic one.
 *
 * `useDeleteInvestment` / `useDeleteTransaction` follow a *deferred* delete
 * pattern: we hide the row from the cache immediately, show an undo toast,
 * and only actually call DELETE when the toast auto-closes (or is dismissed).
 * If the user clicks "Undo" the cache is restored and no API call is made.
 * That way the server never sees a transient delete the user wanted to revert.
 */

import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { Investment, Transaction } from "@/lib/types";

// ---------- shared helpers ----------

const INVESTMENTS_KEY: QueryKey = ["investments"];
const TX_KEY_PREFIX = "transactions" as const;

/** Best-effort temporary id used until the server returns a real one. */
function tempId(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rnd}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------- investments: add ----------

export type AddInvestmentBody = Record<string, unknown> & {
  category: Investment["category"];
};

export function useAddInvestment() {
  const qc = useQueryClient();
  return useMutation<
    { investment: Investment },
    Error,
    AddInvestmentBody,
    { previous?: { investments: Investment[] }; tempId: string }
  >({
    mutationFn: async (body) => {
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add");
      }
      return res.json();
    },
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: INVESTMENTS_KEY });
      const previous = qc.getQueryData<{ investments: Investment[] }>(
        INVESTMENTS_KEY,
      );
      const id = tempId("new");
      // Build a stand-in row that matches the discriminated union closely
      // enough for tables / valuation to render it without crashing.
      const optimistic = {
        id,
        createdAt: (body.createdAt as string | undefined) ?? nowIso(),
        ...body,
      } as unknown as Investment;
      qc.setQueryData<{ investments: Investment[] }>(INVESTMENTS_KEY, {
        investments: [...(previous?.investments ?? []), optimistic],
      });
      return { previous, tempId: id };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.previous) qc.setQueryData(INVESTMENTS_KEY, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: INVESTMENTS_KEY });
    },
  });
}

// ---------- investments: update ----------

export type UpdateInvestmentArgs = {
  id: string;
  patch: Record<string, unknown>;
};

export function useUpdateInvestment() {
  const qc = useQueryClient();
  return useMutation<
    { investment: Investment },
    Error,
    UpdateInvestmentArgs,
    { previous?: { investments: Investment[] } }
  >({
    mutationFn: async ({ id, patch }) => {
      const res = await fetch(`/api/investments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: INVESTMENTS_KEY });
      const previous = qc.getQueryData<{ investments: Investment[] }>(
        INVESTMENTS_KEY,
      );
      if (previous) {
        qc.setQueryData<{ investments: Investment[] }>(INVESTMENTS_KEY, {
          investments: previous.investments.map((inv) =>
            inv.id === id
              ? ({ ...inv, ...patch, updatedAt: nowIso() } as Investment)
              : inv,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(INVESTMENTS_KEY, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: INVESTMENTS_KEY });
    },
  });
}

// ---------- investments: delete (deferred, with undo) ----------

const UNDO_WINDOW_MS = 5_000;

export function useDeleteInvestment() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; label: string }>({
    mutationFn: async ({ id, label }) => {
      // Snapshot + optimistic removal happens here (not in onMutate) so we
      // can return immediately and run the actual delete on a timer. The
      // returned promise resolves as soon as the optimistic update is in
      // place; the real DELETE fires when the undo window closes.
      await qc.cancelQueries({ queryKey: INVESTMENTS_KEY });
      const previous = qc.getQueryData<{ investments: Investment[] }>(
        INVESTMENTS_KEY,
      );
      if (!previous) return;
      const target = previous.investments.find((i) => i.id === id);
      if (!target) return;
      qc.setQueryData<{ investments: Investment[] }>(INVESTMENTS_KEY, {
        investments: previous.investments.filter((i) => i.id !== id),
      });

      let committed = false;
      const commit = async () => {
        if (committed) return;
        committed = true;
        try {
          const res = await fetch(`/api/investments/${id}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("Failed to delete");
        } catch (err) {
          // Restore on server failure and surface the error.
          qc.setQueryData(INVESTMENTS_KEY, previous);
          toast.error(
            err instanceof Error ? err.message : "Failed to delete",
          );
        } finally {
          void qc.invalidateQueries({ queryKey: INVESTMENTS_KEY });
        }
      };

      const timer = setTimeout(commit, UNDO_WINDOW_MS);

      toast.success(`Deleted ${label}`, {
        duration: UNDO_WINDOW_MS,
        action: {
          label: "Undo",
          onClick: () => {
            clearTimeout(timer);
            committed = true;
            qc.setQueryData(INVESTMENTS_KEY, previous);
          },
        },
      });
    },
  });
}

// ---------- transactions: add ----------

export type AddTransactionBody = Record<string, unknown> & {
  investmentId: string;
};

export function useAddTransaction() {
  const qc = useQueryClient();
  return useMutation<
    { transaction: Transaction },
    Error,
    AddTransactionBody,
    { snapshots: Array<[QueryKey, { transactions: Transaction[] } | undefined]> }
  >({
    mutationFn: async (body) => {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onMutate: async (body) => {
      // We don't know which transactions queries are mounted; patch every
      // matching cache (the "all" view + the per-investment view).
      await qc.cancelQueries({ queryKey: [TX_KEY_PREFIX] });
      const snapshots = qc.getQueriesData<{ transactions: Transaction[] }>({
        queryKey: [TX_KEY_PREFIX],
      });
      const id = tempId("tx");
      const optimistic = {
        id,
        ...body,
      } as unknown as Transaction;
      for (const [key, data] of snapshots) {
        if (!data) continue;
        // Filter views: only insert into "all" and the matching investmentId.
        const [, scope] = key as [string, string];
        if (scope !== "all" && scope !== body.investmentId) continue;
        qc.setQueryData<{ transactions: Transaction[] }>(key, {
          transactions: [optimistic, ...data.transactions],
        });
      }
      return { snapshots };
    },
    onError: (_err, _body, ctx) => {
      for (const [key, snap] of ctx?.snapshots ?? []) {
        qc.setQueryData(key, snap);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [TX_KEY_PREFIX] });
      void qc.invalidateQueries({ queryKey: INVESTMENTS_KEY });
    },
  });
}

// ---------- transactions: update ----------

export type UpdateTransactionArgs = {
  id: string;
  patch: Record<string, unknown>;
};

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation<
    { transaction: Transaction },
    Error,
    UpdateTransactionArgs,
    { snapshots: Array<[QueryKey, { transactions: Transaction[] } | undefined]> }
  >({
    mutationFn: async ({ id, patch }) => {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: [TX_KEY_PREFIX] });
      const snapshots = qc.getQueriesData<{ transactions: Transaction[] }>({
        queryKey: [TX_KEY_PREFIX],
      });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData<{ transactions: Transaction[] }>(key, {
          transactions: data.transactions.map((t) =>
            t.id === id ? ({ ...t, ...patch } as Transaction) : t,
          ),
        });
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, snap] of ctx?.snapshots ?? []) {
        qc.setQueryData(key, snap);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [TX_KEY_PREFIX] });
      void qc.invalidateQueries({ queryKey: INVESTMENTS_KEY });
    },
  });
}

// ---------- transactions: delete (deferred, with undo) ----------

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; label?: string }>({
    mutationFn: async ({ id, label }) => {
      await qc.cancelQueries({ queryKey: [TX_KEY_PREFIX] });
      const snapshots = qc.getQueriesData<{ transactions: Transaction[] }>({
        queryKey: [TX_KEY_PREFIX],
      });
      let touched = false;
      for (const [key, data] of snapshots) {
        if (!data) continue;
        const next = data.transactions.filter((t) => t.id !== id);
        if (next.length !== data.transactions.length) {
          touched = true;
          qc.setQueryData<{ transactions: Transaction[] }>(key, {
            transactions: next,
          });
        }
      }
      if (!touched) return;

      let committed = false;
      const commit = async () => {
        if (committed) return;
        committed = true;
        try {
          const res = await fetch(`/api/transactions/${id}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("Failed to delete");
        } catch (err) {
          for (const [key, snap] of snapshots) qc.setQueryData(key, snap);
          toast.error(
            err instanceof Error ? err.message : "Failed to delete",
          );
        } finally {
          void qc.invalidateQueries({ queryKey: [TX_KEY_PREFIX] });
          void qc.invalidateQueries({ queryKey: INVESTMENTS_KEY });
        }
      };

      const timer = setTimeout(commit, UNDO_WINDOW_MS);
      toast.success(label ? `Deleted ${label}` : "Transaction deleted", {
        duration: UNDO_WINDOW_MS,
        action: {
          label: "Undo",
          onClick: () => {
            clearTimeout(timer);
            committed = true;
            for (const [key, snap] of snapshots) qc.setQueryData(key, snap);
          },
        },
      });
    },
  });
}
