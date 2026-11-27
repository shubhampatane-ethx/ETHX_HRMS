// Asset tracking: who holds what, where everything is, what needs HR's attention, and the movement history.
import { frappe } from "./api/frappeClient";

export const assetLabel = (a) => a.custom_asset_code || a.asset_name || a.name;

/** Everything about an asset HR should look at, as short reasons ("" when it's fine). */
export function assetIssues(asset, { empById, codeCount }) {
  const out = [];
  const holder = asset.custodian ? empById[asset.custodian] : null;
  if (holder && holder.status === "Left") out.push(`Still with ${holder.employee_name}, who has left - recover it`);
  if (asset.custom_holder_left_on && asset.custodian && !asset.custom_returned_on) out.push("Holder's exit is recorded but the asset isn't returned");
  if (["Damaged", "Out of Service"].includes(asset.custom_condition)) out.push(asset.custom_condition);
  if (Number(asset.docstatus) === 0) out.push("Draft - submit it in ERPNext so moves are tracked");
  const code = (asset.custom_asset_code || "").trim().toLowerCase();
  if (!code) out.push("No asset code");
  else if (codeCount[code] > 1) out.push(`Code ${asset.custom_asset_code} is on ${codeCount[code]} assets`);
  return out;
}

/** Summary used by the tracker and the register: holders, places, issues. */
export function trackAssets(assets, employees) {
  const empById = Object.fromEntries(employees.map((e) => [e.name, e]));
  const codeCount = {};
  for (const a of assets) {
    const c = (a.custom_asset_code || "").trim().toLowerCase();
    if (c) codeCount[c] = (codeCount[c] || 0) + 1;
  }
  const issues = Object.fromEntries(assets.map((a) => [a.name, assetIssues(a, { empById, codeCount })]));
  const holders = new Map();
  for (const a of assets.filter((x) => x.custodian)) {
    if (!holders.has(a.custodian)) holders.set(a.custodian, { id: a.custodian, employee: empById[a.custodian] || { name: a.custodian, employee_name: a.custodian }, assets: [] });
    holders.get(a.custodian).assets.push(a);
  }
  const unheld = assets.filter((a) => !a.custodian);
  const places = new Map();
  for (const a of unheld) {
    const where = a.location || "No location";
    if (!places.has(where)) places.set(where, []);
    places.get(where).push(a);
  }
  const count = (key) => Object.entries(assets.reduce((m, a) => { const k = a[key] || "Not set"; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([k, v]) => ({ key: k, value: v })).sort((a, b) => b.value - a.value);
  return {
    empById,
    issues,
    attention: assets.filter((a) => issues[a.name].length),
    holders: [...holders.values()].sort((a, b) => b.assets.length - a.assets.length || a.employee.employee_name.localeCompare(b.employee.employee_name)),
    places: [...places.entries()].map(([where, list]) => ({ where, assets: list })).sort((a, b) => b.assets.length - a.assets.length),
    byLocation: count("location"),
    byType: count("asset_category"),
    assigned: assets.filter((a) => a.custodian).length,
    inOffice: unheld.filter((a) => !a.custom_returned_on).length,
    returned: unheld.filter((a) => a.custom_returned_on).length,
  };
}

/** The latest asset movements (issued / returned / moved), newest first. Empty when not readable. */
export async function recentMovements(limit = 12) {
  try {
    const moves = await frappe.getList("Asset Movement", { filters: [["docstatus", "=", 1]], fields: ["name", "purpose", "transaction_date"], orderBy: "transaction_date desc", limit });
    if (!moves.length) return [];
    const items = await frappe.getList("Asset Movement Item", { parent: "Asset Movement", filters: [["parent", "in", moves.map((m) => m.name)]], fields: ["parent", "asset", "asset_name", "from_employee", "to_employee", "source_location", "target_location"], limit: 0 });
    const byMove = Object.fromEntries(moves.map((m) => [m.name, m]));
    return items.map((i) => ({ ...i, ...byMove[i.parent] })).sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
  } catch {
    return [];
  }
}

/** Assets held by one employee (for profiles and exits). */
export const assetsHeldBy = (employee) =>
  frappe.getList("Asset", { filters: [["custodian", "=", employee], ["docstatus", "<", 2]], fields: ["name", "asset_name", "asset_category", "location", "custom_asset_code", "custom_serial_number", "custom_assigned_on", "custom_condition", "docstatus"], limit: 0 })
    .catch(() => frappe.getList("Asset", { filters: [["custodian", "=", employee], ["docstatus", "<", 2]], fields: ["name", "asset_name", "asset_category", "location", "docstatus"], limit: 0 }));
