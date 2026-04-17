"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { motion } from "framer-motion";
import { parseCsv, rowToInvestmentInput } from "@/lib/csv";

export function ImportCsvCard() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast.error("CSV is empty");
        return;
      }
      let ok = 0;
      const errors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const body = rowToInvestmentInput(row);
        if ("error" in body) {
          errors.push(`Row ${i + 2}: ${body.error}`);
          continue;
        }
        try {
          const res = await fetch("/api/investments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            errors.push(`Row ${i + 2}: ${err.error ?? res.statusText}`);
          } else {
            ok++;
          }
        } catch (err) {
          errors.push(
            `Row ${i + 2}: ${err instanceof Error ? err.message : "network error"}`,
          );
        }
      }
      await qc.invalidateQueries({ queryKey: ["investments"] });
      if (ok > 0) {
        toast.success(`Imported ${ok} investment${ok === 1 ? "" : "s"}`);
      }
      if (errors.length > 0) {
        toast.error(
          `${errors.length} row${errors.length === 1 ? "" : "s"} skipped`,
          { description: errors.slice(0, 4).join(" · "), duration: 6000 },
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4"
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold">Import from CSV</div>
        <p className="text-xs text-muted">
          Upload a CSV exported from the dashboard. Each row will be added as a
          new investment.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-white/10 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {busy ? "Importing…" : "Upload CSV"}
      </button>
    </motion.div>
  );
}
