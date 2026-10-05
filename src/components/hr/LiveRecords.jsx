import { useEffect, useState } from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button, Card, Table } from "../ui/primitives";

/** A consistent live-data screen for stock ERPNext/HRMS doctypes. */
export function LiveRecords({ title, description, doctype, emptyLabel }) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");

  async function load() {
    setState("loading");
    try {
      const records = await frappe.getList(doctype, {
        fields: ["name", "modified"],
        limit: 100,
        orderBy: "modified desc",
      });
      setRows(records);
      setState("ready");
    } catch {
      setRows([]);
      setState("error");
    }
  }

  useEffect(() => { load(); }, [doctype]);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]">
              {state === "error" ? <WifiOff size={14} /> : <Wifi size={14} />} ERPNext HRMS
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">{description}</p>
          </div>
          <Button variant="secondary" onClick={load} disabled={state === "loading"}>
            <RefreshCw size={14} className={state === "loading" ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </section>

      <Card className="overflow-hidden">
        {state === "loading" ? (
          <div className="flex h-40 items-center justify-center text-[13px] text-[var(--color-text-muted)]">Loading live records…</div>
        ) : state === "error" ? (
          <div className="p-6">
            <p className="font-medium text-[var(--color-text)]">This HRMS resource is unavailable.</p>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">Check that the {doctype} doctype is installed and that this user has permission to read it.</p>
          </div>
        ) : (
          <Table
            columns={[
              { key: "name", label: "Record" },
              { key: "modified", label: "Last updated", render: (record) => record.modified ? new Date(record.modified).toLocaleString() : "—" },
            ]}
            rows={rows}
            emptyLabel={emptyLabel}
          />
        )}
      </Card>
    </div>
  );
}
