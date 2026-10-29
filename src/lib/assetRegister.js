// Company asset register (the Excel sheet HR keeps) <-> ERPNext Asset records.
//
// HR uploads the register; every row becomes (or updates) one ERPNext Asset. The person holding an asset is its
// ERPNext custodian, so the employee portal shows each employee only their own assets. A revised register can be
// uploaded at any time: rows are matched to existing assets by asset code (then serial number), changed details
// are updated, and a change of holder is recorded as an Asset Movement (returned by one person, issued to another),
// which keeps ERPNext's own history of who had what.
import readExcelFile from "read-excel-file/browser";
import { frappe } from "./api/frappeClient";
import { listTry } from "./employeePortal";

/* ------------------------------ reading the file ------------------------------ */

// Header text -> field. First matching column wins; later duplicates (e.g. the serial / code of "other assets")
// are appended to "other".
const COLUMNS = [
  ["code", /^asset\s*code|^asset\s*(id|tag|no)/i],
  ["serial", /serial/i],
  ["name", /^asset\s*name|^item\s*name|^description/i],
  ["type", /asset\s*type|category|^type$/i],
  ["empCode", /emp(loyee)?\.?\s*(code|id|no)/i],
  ["empName", /employee\s*name|assigned\s*to|^holder|^custodian/i],
  ["assignedOn", /assigned\s*on|date\s*of\s*acquire|issued\s*(on|date)/i],
  ["assignedBy", /assigned\s*by/i],
  ["approvedBy", /approved\s*by/i],
  ["leftOn", /doe\b|terminat|date\s*of\s*exit/i],
  ["returnedOn", /submission\s*on|returned\s*on|date\s*of\s*release|return\s*date/i],
  ["revokedOn", /revoked.*\bon\b/i],
  ["revokedBy", /revoked.*\bby\b/i],
  ["other", /other\s*assets/i],
  ["condition", /current\s*status|condition|^status$/i],
  ["location", /location/i],
  ["notes", /notes|remarks|comment/i],
];
const DATE_FIELDS = ["assignedOn", "leftOn", "returnedOn", "revokedOn"];
const DATE_LABELS = { assignedOn: "Assigned on", leftOn: "Left / terminated on", returnedOn: "Returned on", revokedOn: "Access revoked on" };
const EMPTY = /^(na|n\/a|nil|none|-+|—|ddmmyy|dd-?mmm?-?yy(yy)?)$/i;

const text = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).replace(/\s+/g, " ").trim();
  return EMPTY.test(s) ? "" : s;
};
export const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y > 1980 && y < 2100 ? `${y}-${pad(m)}-${pad(d)}` : null;
};
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Excel date cell, serial number or common text formats -> "YYYY-MM-DD"; null when it can't be read. */
export function parseDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number" || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
    const n = Number(v);
    if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
    return null;
  }
  const s = String(v).trim().toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ");
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s); // Indian order: day first
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[ -]([a-z]{3,})[ -](\d{2,4})$/.exec(s);
  if (m && MONTHS.indexOf(m[2].slice(0, 3)) >= 0) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], MONTHS.indexOf(m[2].slice(0, 3)) + 1, +m[1]);
  m = /^([a-z]{3,}) (\d{1,2}) (\d{4})$/.exec(s);
  if (m && MONTHS.indexOf(m[1].slice(0, 3)) >= 0) return iso(+m[3], MONTHS.indexOf(m[1].slice(0, 3)) + 1, +m[2]);
  return null;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && content[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function headerMap(cells) {
  const map = {};
  const extra = [];
  cells.forEach((c, i) => {
    const h = text(c);
    if (!h) return;
    const hit = COLUMNS.find(([, re]) => re.test(h));
    if (!hit) return;
    if (map[hit[0]] == null) map[hit[0]] = i;
    else if (map.other != null && i > map.other) extra.push(i); // e.g. serial / code of the "other assets"
  });
  return { map, extra };
}

/** Rows of every sheet that looks like an asset list. Each row: register fields + sheet / line + warnings. */
export async function readRegister(file) {
  const sheets = /\.csv$/i.test(file.name)
    ? [{ sheet: file.name.replace(/\.csv$/i, ""), data: parseCsv(await file.text()) }]
    : await readExcelFile(file);
  const rows = [];
  const used = [];
  const skipped = [];
  for (const { sheet, data } of sheets) {
    let header = -1;
    let cols = null;
    for (let i = 0; i < Math.min(data.length, 15); i += 1) {
      const h = headerMap(data[i] || []);
      const keys = Object.keys(h.map);
      if (keys.length >= 3 && (keys.includes("code") || keys.includes("name") || keys.includes("serial"))) { header = i; cols = h; break; }
    }
    if (header < 0) { skipped.push(sheet.trim()); continue; }
    used.push(sheet.trim());
    for (let i = header + 1; i < data.length; i += 1) {
      const cells = data[i] || [];
      const get = (k) => (cols.map[k] == null ? null : cells[cols.map[k]]);
      const r = { sheet: sheet.trim(), line: i + 1, warnings: [] };
      for (const [k] of COLUMNS) if (!DATE_FIELDS.includes(k)) r[k] = text(get(k));
      for (const k of DATE_FIELDS) {
        const raw = get(k);
        r[k] = parseDate(raw);
        if (!r[k] && text(raw)) {
          // Text typed into a date column ("Make revoke sheet separate") is kept as a note instead of lost.
          r.warnings.push(`Couldn't read the date "${text(raw)}" - kept in the notes`);
          r.dateNotes = [...(r.dateNotes || []), `${DATE_LABELS[k]}: ${text(raw)}`];
        }
      }
      const others = cols.extra.map((x) => text(cells[x])).filter(Boolean);
      if (others.length) r.other = [r.other, ...others].filter(Boolean).join(" · ");
      if (!r.code && !r.serial && !r.name && !r.empName) continue; // blank / total rows
      if (/^(in office|office|not added.*)$/i.test(r.empCode)) r.empCode = "";
      rows.push(r);
    }
  }
  return { rows, sheets: used, skipped };
}

/* ------------------------------ matching ------------------------------ */

const words = (s) => String(s || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);

/** Employee for a register row: by employee code (ERPNext "Employee Number" or ID), then by name. */
export function matchEmployee(row, employees) {
  const code = (/[A-Za-z]{1,4}-?\d{2,}/.exec(row.empCode || "") || [])[0];
  if (code) {
    const byCode = employees.filter((e) => norm(e.employee_number) === norm(code) || norm(e.name) === norm(code));
    if (byCode.length === 1) return { employee: byCode[0].name, how: "code" };
  }
  const w = words(row.empName);
  if (!w.length) return { employee: "", how: "none" };
  const exact = employees.filter((e) => words(e.employee_name).join(" ") === w.join(" "));
  if (exact.length === 1) return { employee: exact[0].name, how: "name" };
  // Every word of the sheet's name is in the employee's name; a single letter counts as an initial ("Ram C").
  const loose = employees.filter((e) => { const ew = words(e.employee_name); return w.every((x) => (x.length === 1 ? ew.some((y) => y.startsWith(x)) : ew.includes(x))); });
  if (loose.length === 1) return { employee: loose[0].name, how: "name" };
  return { employee: "", how: loose.length > 1 ? "ambiguous" : "unmatched", candidates: loose.map((e) => e.name) };
}

// When the sheet leaves the type blank, guess it from the asset's name.
const TYPE_HINTS = [
  [/laptop|notebook/i, "Laptop"],
  [/chair|table|desk|cupboard|sofa|furniture|cabinet/i, "Furniture"],
  [/cctv|camera|dvr|router|wi-?fi|printer|projector|biometric|\bac\b|fridge|induction|\btv\b|monitor|\bups\b|screen/i, "Electronic"],
  [/fan/i, "Mechanical"],
];
const defaultType = (r) => r.type || TYPE_HINTS.find(([re]) => re.test(`${r.name} ${r.code}`))?.[1] || "Office Equipment";
const CONDITIONS = { working: "Working", damaged: "Damaged", "out of service": "Out of Service" };

/** One register entry per asset: the current holder's row, with earlier (returned) rows as history. */
function groupRows(rows) {
  const groups = new Map();
  const add = (key, r) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r); };
  for (const r of rows) {
    // Asset code is the register's ID. Without one, the serial number (plus the holder, since model names are
    // sometimes typed into the serial column) or finally the asset name identifies the asset.
    const key = r.code ? `code:${norm(r.code)}`
      : r.serial ? `serial:${norm(r.serial)}${r.empName ? `:${norm(r.empName)}` : ""}`
        : r.name ? `name:${norm(r.name)}` : `holder:${norm(r.empName)}:${norm(defaultType(r))}`;
    add(key, r);
  }
  // Same code but several people still holding different serials: really separate assets sharing a code.
  const out = [];
  for (const [key, list] of groups) {
    const active = list.filter((r) => !r.returnedOn);
    const serials = new Set(active.map((r) => norm(r.serial)).filter(Boolean));
    if (key.startsWith("code:") && active.length > 1 && serials.size === active.length) {
      for (const r of active) out.push({ key: `${key}:${norm(r.serial)}`, rows: [r], sharedCode: true });
      const returned = list.filter((r) => r.returnedOn);
      if (returned.length) out.push({ key, rows: returned });
    } else out.push({ key, rows: list });
  }
  return out;
}

const FIELD_LABELS = {
  custodian: "Assigned to", location: "Location", custom_asset_code: "Asset code", custom_serial_number: "Serial number",
  custom_condition: "Condition", custom_assigned_on: "Assigned on", custom_assigned_by: "Assigned by", custom_approved_by: "Approved by",
  custom_other_assets: "Other assets", custom_holder_left_on: "Holder left on", custom_returned_on: "Returned on",
  custom_access_revoked_on: "Access revoked on", custom_access_revoked_by: "Access revoked by", custom_register_notes: "Notes",
};
export const REGISTER_FIELDS = Object.keys(FIELD_LABELS).filter((f) => f.startsWith("custom_"));

/**
 * Compare the register with ERPNext. Each item: { key, row, history, type, assetName, holder (employee or ""),
 * match, existing, status: "new" | "update" | "same", changes, issues, warnings }.
 * `issues` must be resolved (or the item left out) before applying; `warnings` are informational.
 */
export function planRegister(rows, { employees, assets }) {
  const byKey = new Map(assets.filter((a) => a.custom_register_key).map((a) => [a.custom_register_key, a]));
  const byCode = new Map();
  for (const a of assets) if (a.custom_asset_code) byCode.set(norm(a.custom_asset_code), [...(byCode.get(norm(a.custom_asset_code)) || []), a]);
  const empName = Object.fromEntries(employees.map((e) => [e.name, e.employee_name]));

  return groupRows(rows).map(({ key, rows: list, sharedCode }) => {
    const active = list.filter((r) => !r.returnedOn);
    const holderRow = active[active.length - 1] || null;
    const row = holderRow || list[list.length - 1];
    const type = defaultType(row);
    const issues = [];
    const warnings = [...new Set(list.flatMap((r) => r.warnings))];
    if (sharedCode) warnings.push(`Asset code ${row.code} is used for more than one asset - give each its own code in the sheet`);
    if (!row.code) warnings.push("No asset code in the sheet");
    if (active.length > 1) {
      const holders = [...new Set(active.map((r) => r.empName))];
      if (holders.length > 1) issues.push(`Held by ${holders.join(" and ")} at the same time - choose who has it`);
    }
    if (list.length > 1 && new Set(list.map((r) => norm(r.serial)).filter(Boolean)).size > 1 && !sharedCode) warnings.push("Serial number differs between rows for this code");

    let match = { employee: "", how: "none" };
    if (holderRow?.empName || holderRow?.empCode) {
      match = matchEmployee(holderRow, employees);
      if (!match.employee) issues.push(match.how === "ambiguous" ? `"${holderRow.empName}" matches more than one employee - choose one` : `No employee found for "${holderRow.empName || holderRow.empCode}" - choose one or leave unassigned`);
    }

    const existing = byKey.get(key) || (row.code && (byCode.get(norm(row.code)) || []).length === 1 ? byCode.get(norm(row.code))[0] : null);
    const want = {
      custodian: match.employee,
      location: row.location && !/^[^a-z0-9]*$/i.test(row.location) ? row.location : "",
      custom_asset_code: row.code,
      custom_serial_number: row.serial,
      custom_condition: CONDITIONS[(row.condition || "").toLowerCase()] || "",
      custom_assigned_on: holderRow?.assignedOn || "",
      custom_assigned_by: holderRow?.assignedBy || "",
      custom_approved_by: holderRow?.approvedBy || "",
      custom_other_assets: holderRow?.other || "",
      custom_holder_left_on: holderRow ? "" : row.leftOn || "",
      custom_returned_on: holderRow ? "" : row.returnedOn || "",
      custom_access_revoked_on: holderRow ? "" : row.revokedOn || "",
      custom_access_revoked_by: holderRow ? "" : row.revokedBy || "",
      custom_register_notes: [row.notes, ...(row.dateNotes || []), ...list.filter((r) => r !== holderRow && r.empName).map((r) => `Earlier: ${r.empName}${r.returnedOn ? ` (returned ${r.returnedOn})` : ""}`)].filter(Boolean).join("\n"),
    };
    const changes = [];
    if (existing) {
      for (const [f, v] of Object.entries(want)) {
        if (f === "location" && !v) continue; // keep ERPNext's location when the sheet has none
        const now = existing[f] == null ? "" : String(existing[f]);
        if (now !== String(v || "")) {
          const show = (x) => (f === "custodian" ? (x ? empName[x] || x : "Nobody") : x || "—");
          changes.push({ field: f, label: FIELD_LABELS[f], from: show(now), to: show(v) });
        }
      }
    }
    const assetName = row.name || `${type} ${row.code || row.serial || (row.empName ? `(${row.empName})` : "")}`.trim();
    return {
      key, row, history: list.filter((r) => r !== holderRow), type, assetName, holder: match.employee, match, existing, want,
      status: !existing ? "new" : changes.length || existing.custom_register_key !== key || existing.docstatus === 0 ? "update" : "same",
      changes, issues, warnings,
    };
  });
}

/* ------------------------------ data from ERPNext ------------------------------ */

export const ASSET_LIST_FIELDS = ["name", "asset_name", "item_code", "asset_category", "company", "location", "custodian", "status", "docstatus", "creation", ...REGISTER_FIELDS, "custom_register_key"];

export const loadAssets = () => listTry("Asset", { filters: [["docstatus", "<", 2]], fields: ASSET_LIST_FIELDS, orderBy: "creation desc" }, ["name", "asset_name", "item_code", "asset_category", "company", "location", "custodian", "status", "docstatus", "creation"]);

export const loadEmployees = () => listTry("Employee", { fields: ["name", "employee_name", "employee_number", "company", "status", "user_id", "department"], orderBy: "employee_name asc" }, ["name", "employee_name", "company", "status", "user_id"]);

/* ------------------------------ writing to ERPNext ------------------------------ */

const why = (e) => {
  const d = e?.response?.data;
  let msg = "";
  try { msg = JSON.parse(JSON.parse(d?._server_messages || "[]")[0] || "{}").message || ""; } catch { /* not JSON */ }
  return String(msg || d?.exception || e?.message || "Refused").replace(/<[^>]+>/g, "").replace(/^[\w.]+Error: /, "").slice(0, 240);
};
const nowStamp = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const today = () => nowStamp().slice(0, 10);

const exists = async (doctype, name) => (await frappe.getList(doctype, { filters: [["name", "=", name]], fields: ["name"], limit: 1 })).length > 0;

async function ensureLocation(name, cache) {
  if (cache.has(name)) return;
  if (!(await exists("Location", name))) await frappe.createDoc("Location", { location_name: name });
  cache.add(name);
}

/** The Fixed Asset ledger to book an asset type under for a company (best name match, else the first one). */
async function fixedAssetAccount(company, type, cache) {
  const k = `${company}`;
  if (!cache.has(k)) cache.set(k, await frappe.getList("Account", { filters: [["company", "=", company], ["account_type", "=", "Fixed Asset"], ["is_group", "=", 0]], fields: ["name", "account_name"], limit: 0 }));
  const list = cache.get(k);
  if (!list.length) throw new Error(`Company ${company} has no Fixed Asset account. Add one in its Chart of Accounts (account type "Fixed Asset") and import again.`);
  const prefer = /laptop|computer|desktop|monitor|cctv|camera|router|printer|projector|electronic|biometric/i.test(type) ? /electronic|computer/i
    : /chair|table|desk|furniture|cupboard/i.test(type) ? /furniture/i : /office|equipment/i;
  return (list.find((a) => prefer.test(a.account_name)) || list[0]).name;
}

async function ensureCategory(type, company, caches) {
  const k = `${type}|${company}`;
  if (caches.categories.has(k)) return;
  const account = await fixedAssetAccount(company, type, caches.accounts);
  if (!(await exists("Asset Category", type))) {
    await frappe.createDoc("Asset Category", { asset_category_name: type, accounts: [{ company_name: company, fixed_asset_account: account }] });
  } else {
    const cat = await frappe.getDoc("Asset Category", type);
    if (!(cat.accounts || []).some((a) => a.company_name === company)) {
      await frappe.updateDoc("Asset Category", type, { accounts: [...(cat.accounts || []), { company_name: company, fixed_asset_account: account }] });
    }
  }
  caches.categories.add(k);
}

/** A fixed-asset Item for the type (ERPNext needs one per asset). Returns its item code. */
async function ensureItem(type, caches) {
  if (caches.items.has(type)) return caches.items.get(type);
  let code = type;
  const found = await frappe.getList("Item", { filters: [["name", "=", type]], fields: ["name", "is_fixed_asset"], limit: 1 });
  if (found.length && !Number(found[0].is_fixed_asset)) code = `${type} (Asset)`; // a stock item already uses the name
  if (!found.length || code !== type) {
    if (!(await exists("Item", code))) {
      if (!caches.itemGroup) {
        const groups = await frappe.getList("Item Group", { filters: [["is_group", "=", 1]], fields: ["name", "parent_item_group"], limit: 0 });
        caches.itemGroup = (groups.find((g) => !g.parent_item_group) || groups[0])?.name || "All Item Groups";
      }
      await frappe.createDoc("Item", { item_code: code, item_name: type, item_group: caches.itemGroup, stock_uom: "Nos", is_stock_item: 0, is_fixed_asset: 1, asset_category: type });
    }
  }
  caches.items.set(type, code);
  return code;
}

async function amountField(caches) {
  if (caches.amountField !== undefined) return caches.amountField;
  try {
    const r = await frappe.client.get("/method/frappe.desk.form.load.getdoctype", { params: { doctype: "Asset" } });
    const fields = (r.data?.docs?.[0]?.fields || []).map((f) => f.fieldname);
    caches.amountField = ["gross_purchase_amount", "net_purchase_amount", "purchase_amount"].find((f) => fields.includes(f)) || "gross_purchase_amount";
  } catch {
    caches.amountField = "gross_purchase_amount";
  }
  return caches.amountField;
}

async function move(asset, company, purpose, { from, to, source, target }) {
  const doc = await frappe.createDoc("Asset Movement", {
    company, purpose, transaction_date: nowStamp(),
    assets: [{ asset: asset.name, asset_name: asset.asset_name, source_location: source || undefined, target_location: target || undefined, from_employee: from || undefined, to_employee: to || undefined }],
  });
  await frappe.submitDoc(doc);
}

/** Hand an asset to someone else (or back to the office): a Receipt from the current holder, then an Issue. */
export async function reassignAsset(asset, toEmployee, location) {
  const here = location || asset.location;
  if (here !== asset.location) await ensureLocation(here, new Set());
  if (asset.custodian && asset.custodian !== toEmployee) await move(asset, asset.company, "Receipt", { from: asset.custodian, target: here });
  if (toEmployee && asset.custodian !== toEmployee) await move(asset, asset.company, "Issue", { source: here, to: toEmployee });
}

/**
 * Apply the chosen items. `opts`: { company, location, purchaseDate, value }: defaults for new assets.
 * Reports progress per item through onStep({ key, ok, text }).
 */
export async function applyRegister(items, opts, employees, onStep = () => {}) {
  const caches = { categories: new Set(), accounts: new Map(), items: new Map(), locations: new Set() };
  const empCompany = Object.fromEntries(employees.map((e) => [e.name, e.company]));
  const value = await amountField(caches);
  const results = [];
  const step = (item, ok, text) => { const r = { key: item.key, name: item.assetName, ok, text }; results.push(r); onStep(r); };

  for (const item of items) {
    const w = { ...item.want, custodian: item.holder };
    try {
      if (!item.existing) {
        const company = (w.custodian && empCompany[w.custodian]) || opts.company;
        const location = w.location || opts.location;
        await ensureLocation(location, caches.locations);
        await ensureCategory(item.type, company, caches);
        const itemCode = await ensureItem(item.type, caches);
        const date = w.custom_assigned_on || opts.purchaseDate || today();
        const fields = Object.fromEntries(REGISTER_FIELDS.map((f) => [f, w[f] || undefined]));
        const doc = await frappe.createDoc("Asset", {
          company, item_code: itemCode, asset_name: item.assetName, asset_category: item.type, location,
          custodian: w.custodian || undefined, is_existing_asset: 1, calculate_depreciation: 0,
          // ERPNext rejects an asset without a purchase value; the register has none, so ₹1 stands in until HR knows it.
          purchase_date: date, available_for_use_date: date, [value]: Number(opts.value) > 0 ? Number(opts.value) : 1,
          ...fields, custom_register_key: item.key,
        });
        await frappe.submitDoc(doc);
        step(item, true, `Added ${doc.name}${w.custodian ? `, assigned to ${employees.find((e) => e.name === w.custodian)?.employee_name || w.custodian}` : ""}`);
        continue;
      }

      const a = item.existing;
      const update = { custom_register_key: item.key };
      for (const f of REGISTER_FIELDS) if (String(a[f] ?? "") !== String(w[f] || "")) update[f] = w[f] || null;
      if (Number(a.docstatus) === 0) {
        // Never submitted: set everything directly, then submit.
        if (w.location) { await ensureLocation(w.location, caches.locations); update.location = w.location; }
        update.custodian = w.custodian || null;
        await frappe.updateDoc("Asset", a.name, update);
        await frappe.submitDoc(await frappe.getDoc("Asset", a.name));
        step(item, true, `Updated and submitted ${a.name}`);
        continue;
      }
      await frappe.updateDoc("Asset", a.name, update);
      const notes = [];
      if ((a.custodian || "") !== (w.custodian || "")) {
        const target = w.location || a.location;
        if (target !== a.location) await ensureLocation(target, caches.locations);
        await reassignAsset(a, w.custodian, target);
        notes.push(w.custodian ? `now with ${employees.find((e) => e.name === w.custodian)?.employee_name || w.custodian}` : "returned to the office");
      } else if (!w.custodian && w.location && w.location !== a.location) {
        await ensureLocation(w.location, caches.locations);
        await move(a, a.company, "Transfer", { source: a.location, target: w.location });
        notes.push(`moved to ${w.location}`);
      }
      step(item, true, `Updated ${a.name}${notes.length ? ` - ${notes.join(", ")}` : ""}`);
    } catch (e) {
      step(item, false, why(e));
    }
  }
  return results;
}
