import { useRef, useState } from "react";
import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { Button } from "../../components/ui/primitives";
import { Async, Empty, Notice, PageHeader, Panel } from "../../components/employee/EmployeeShell";
import { dmy, ensurePolicyFolder, errMsg, getPolicies, POLICY_FOLDER, useAsync } from "../../lib/employeePortal";
import { frappe } from "../../lib/api/frappeClient";
import { confirmDialog } from "../../components/ui/dialogs";

const title = (fileName) => fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");

export default function Policies() {
  const policies = useAsync(getPolicies, []);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function upload(file) {
    if (!file) return;
    if (!(await confirmDialog({ title: "Publish policy", message: `Publish "${file.name}" to every employee's Policies & Documents?`, confirmLabel: "Publish" }))) { if (fileRef.current) fileRef.current.value = ""; return; }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await ensurePolicyFolder();
      const saved = await frappe.uploadFile(file, { isPrivate: false, folder: POLICY_FOLDER });
      if (!saved?.file_url) throw new Error("The upload did not return a file URL.");
      setMessage(`${file.name} published successfully.`);
      await policies.reload();
    } catch (e) {
      setError(errMsg(e, "Couldn't publish the policy."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(policy) {
    if (!(await confirmDialog(`Remove "${policy.file_name}" from published policies?`))) return;
    setDeleting(policy.name);
    setError("");
    setMessage("");
    try {
      await frappe.deleteDoc("File", policy.name);
      setMessage(`${policy.file_name} removed from published policies.`);
      await policies.reload();
    } catch (e) {
      setError(errMsg(e, "Couldn't remove the policy."));
    } finally {
      setDeleting("");
    }
  }

  return (
    <>
      <PageHeader icon={FileText} title="Policies & Documents" subtitle="Publish, update, and remove company policies visible to employees" actions={
        <>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload size={14} /> {busy ? "Uploading…" : "Upload policy"}
          </Button>
        </>
      } />
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}
      <Panel title="Published company policies" hint={`Employees can view policies in the "${POLICY_FOLDER}" folder.`}>
        <Async state={policies}>
          {(rows) => rows.length === 0 ? <Empty text="No policies published yet. Upload a policy to make it available to employees." /> : (
            <ul className="divide-y divide-[var(--color-border)]">
              {rows.map((policy) => (
                <li key={policy.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText size={16} className="shrink-0 text-[var(--color-text-muted)]" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-[var(--color-text)]">{title(policy.file_name)}</p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">Published {dmy(policy.creation)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a href={policy.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={13} /> View</a>
                    <Button variant="ghost" onClick={() => remove(policy)} disabled={deleting === policy.name}>
                      <Trash2 size={14} /> {deleting === policy.name ? "Removing…" : "Remove"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Panel>
      <p className="text-[12px] text-[var(--color-text-muted)]">To update a policy, upload its revised file and remove the outdated version.</p>
    </>
  );
}
