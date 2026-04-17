import { AddInvestmentForm } from "@/components/add-investment-form";
import { ImportCsvCard } from "@/components/import-csv-card";

export default function AddPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Add Investment</h1>
        <p className="text-sm text-muted">
          Track stocks, EPF and PPF. Data is saved locally to{" "}
          <code className="rounded bg-white/5 px-1.5 py-0.5 text-[11px]">
            data/investments.json
          </code>
          .
        </p>
      </div>
      <ImportCsvCard />
      <AddInvestmentForm />
    </div>
  );
}
