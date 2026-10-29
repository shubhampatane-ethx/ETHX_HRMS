import { useRef, useState } from "react";
import { Download, ExternalLink, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import { Async, Empty, Notice, PageHeader, Panel } from "../../components/employee/EmployeeShell";
import { Button } from "../../components/ui/primitives";
import { ASSET_FOLDER, dmy, ensureAssetFolder, errMsg, getAssetLists, useAsync } from "../../lib/employeePortal";
import { frappe } from "../../lib/api/frappeClient";

const TEMPLATE = "Asset Name,Category,Assigned To,Location,Issued Date,Status,Serial Number,Notes\r\n";

export default function Assets() {
  const lists = useAsync(getAssetLists, []);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "asset-list-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function upload(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a CSV file. You can download the template to see the required columns.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await ensureAssetFolder();
      const saved = await frappe.uploadFile(file, { isPrivate: true, folder: ASSET_FOLDER });
      if (!saved?.file_url) throw new Error("The uploaded file URL was not returned.");
      setMessage(`${file.name} uploaded successfully.`);
      await lists.reload();
    } catch (e) {
      setError(errMsg(e, "Couldn't upload the asset list."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(list) {
    if (!window.confirm(`Remove "${list.file_name}" from asset lists?`)) return;
    setDeleting(list.name);
    setError("");
    setMessage("");
    try {
      await frappe.deleteDoc("File", list.name);
      setMessage(`${list.file_name} removed.`);
      await lists.reload();
    } catch (e) {
      setError(errMsg(e, "Couldn't remove the asset list."));
    } finally {
      setDeleting("");
    }
  }

  return (
    <>
      <PageHeader icon={FileSpreadsheet} title="Asset Management" subtitle="Upload and manage your company asset lists" actions={
        <>
          <Button type="button" variant="secondary" onClick={downloadTemplate}><Download size={14} /> Download CSV template</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          <Button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload size={14} /> {busy ? "Uploading…" : "Upload asset list"}
          </Button>
        </>
      } />
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}
      <Panel title="Uploaded asset lists" hint="Use the CSV template columns to keep asset details consistent. Upload a revised file to update the list.">
        <Async state={lists}>
          {(rows) => rows.length === 0 ? <Empty text="No asset lists uploaded yet. Upload a CSV file to get started." /> : (
            <ul className="divide-y divide-[var(--color-border)]">
              {rows.map((list) => (
                <li key={list.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileSpreadsheet size={16} className="shrink-0 text-[var(--color-text-muted)]" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-[var(--color-text)]">{list.file_name}</p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">Uploaded {dmy(list.creation)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a href={list.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={13} /> View list</a>
                    <Button type="button" variant="ghost" onClick={() => remove(list)} disabled={deleting === list.name}>
                      <Trash2 size={14} /> {deleting === list.name ? "Removing…" : "Remove"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Panel>
    </>
  );
}
