import axios from "axios";
import { COMPANY_DOCTYPES, filtersMentionCompany, getClientScope } from "../clientScope";

/**
 * Thin client around the Frappe/ERPNext REST API.
 *
 * ERPNext (built on the Frappe framework) exposes:
 *   POST /api/method/login                    -> session-cookie login
 *   GET  /api/method/frappe.auth.get_logged_user
 *   GET  /api/method/frappe.client.get_list    -> generic doctype list
 *   GET/POST/PUT/DELETE /api/resource/<DocType>[/<name>]
 *
 * We use session-cookie auth (not API key/secret) because this is a
 * browser-based frontend with real logged-in users, not a server-to-server
 * integration. Frappe issues an httpOnly `sid` cookie on login and expects
 * the `X-Frappe-CSRF-Token` header on mutating requests thereafter.
 *
 * In dev, vite.config.js proxies /api -> your ERPNext site so the cookie is
 * same-origin. In production, deploy this frontend behind the same domain
 * as your ERPNext site (or a reverse proxy) for the same reason - Frappe's
 * session cookies do not play well with cross-site requests.
 */

const client = axios.create({
  baseURL: "/api",
  withCredentials: true,
  // Never wait forever on a slow/unreachable ERPNext server - fail with a clear error instead.
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
    // Belt-and-braces: tell any cache (browser, proxy) never to reuse a
    // response. GET requests here have no per-user query param, so after
    // switching accounts in the same tab a cached response for the PREVIOUS
    // user could otherwise be served back for the new session - this is
    // what caused "logged in as Administrator but app shows HR data".
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  },
});

let csrfToken = null;
let csrfPromise = null;

const MUTATING = ["post", "put", "patch", "delete"];
const isLoginCall = (url = "") => url.includes("/method/login");

client.interceptors.request.use(async (config) => {
  if (MUTATING.includes(config.method) && !isLoginCall(config.url)) {
    // The token lives only in memory, so after a page refresh it is gone even though the
    // session cookie is still valid. Fetch it lazily before the first write.
    if (!csrfToken) await refreshCsrfToken();
    if (csrfToken) config.headers["X-Frappe-CSRF-Token"] = csrfToken;
  }
  // Cache-bust every request with a unique query param as a second layer of
  // defense on top of the Cache-Control header above (some intermediary
  // proxies/browsers ignore no-store for GETs unless the URL itself changes).
  config.params = { ...(config.params || {}), _: Date.now() };
  return config;
});

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const cfg = err.config;
    // Stale token (session rotated, other tab logged in again): refresh once and retry.
    if (err.response?.data?.exc_type === "CSRFTokenError" && cfg && !cfg._csrfRetried) {
      cfg._csrfRetried = true;
      csrfToken = null;
      await refreshCsrfToken();
      return client(cfg);
    }
    // Don't treat every 403 as "session expired" - a logged-in user can get
    // a 403 from a specific doctype's permission rules (e.g. HR/Employee
    // users lacking access to some field/doctype) without their session
    // being invalid. Only bounce to /login for a true auth failure.
    const isPermissionError = err.response?.data?.exc_type === "PermissionError";
    if (err.response?.status === 403 && !isPermissionError) {
      window.dispatchEvent(new CustomEvent("frappe:unauthorized"));
    }
    return Promise.reject(err);
  }
);

async function login(usr, pwd) {
  // This ERPNext site's login endpoint accepts form data (resource endpoints
  // continue to use JSON). Sending JSON results in Frappe's "Invalid request
  // body" response, even with valid credentials.
  const res = await client.post("/method/login", new URLSearchParams({ usr, pwd }), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  await refreshCsrfToken();
  return res.data;
}

async function logout() {
  try {
    await client.post("/method/logout");
  } finally {
    csrfToken = null;
  }
}

const CSRF_PATTERNS = [/"csrf_token":\s*"([a-f0-9]+)"/i, /csrf_token\s*=\s*"([a-f0-9]+)"/i, /name="csrf_token"\s+value="([a-f0-9]+)"/i];

/**
 * Frappe doesn't reliably expose a dedicated whitelisted "give me a CSRF
 * token" API endpoint across versions - the token normally only travels
 * embedded in a full page's boot script. So once logged in, we fetch a
 * server-rendered page (same session cookie applies) and pull the token out of
 * it. /app is the desk (System Users); /me is the website page every logged-in
 * user can open, so portal-only Employee logins still get a token.
 * Concurrent callers share one in-flight fetch.
 */
function refreshCsrfToken() {
  if (csrfPromise) return csrfPromise;
  csrfPromise = (async () => {
    let token = null;
    for (const path of ["/app", "/me"]) {
      try {
        const res = await fetch(`${path}?_=${Date.now()}`, { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(8000) });
        const html = await res.text();
        for (const re of CSRF_PATTERNS) {
          const m = html.match(re);
          if (m) { token = m[1]; break; }
        }
        if (token) break;
      } catch {
        /* try the next page */
      }
    }
    csrfToken = token;
    return token;
  })().finally(() => { csrfPromise = null; });
  return csrfPromise;
}

async function getLoggedUser() {
  const res = await client.get("/method/frappe.auth.get_logged_user");
  return res.data.message; // e.g. "priya@company.com" or "Guest"
}

/**
 * Roles for the given user, read off their own User document's "roles"
 * child table rather than querying the Has Role doctype directly - regular
 * (non-admin) users don't have list permission on Has Role, but every user
 * can read their own User doc.
 */
async function getUserRoles(user) {
  const doc = await getDoc("User", user);
  return (doc.roles || []).map((r) => r.role);
}

/** Generic doctype list, e.g. getList("Employee", { filters, fields, limit }) */
// Newer ERPNext refuses the whole list when one column isn't readable for this login ("Field not permitted in query:
// interview_round"). The column is dropped and the list asked for again, so the page still loads without it.
const refusedField = (e) => {
  const d = e?.response?.data || {};
  const m = String(d._server_messages || d.exception || d.message || "").match(/Field not permitted in query:\s*([\w`.]+)/);
  return m ? m[1].replace(/`/g, "").split(".").pop() : "";
};

// Doctypes that turned out not to have a company field on this site, so the client scope is left off them.
const unscoped = new Set();

// The super admin's chosen client narrows lists of company records to that company (lib/clientScope.js). Pass
// allCompanies: true for the few views that compare clients. If a site's doctype has no company field, the list is
// asked for again without it and the doctype is remembered.
async function getList(doctype, opts = {}) {
  const client = opts.allCompanies ? null : getClientScope();
  if (!client || !COMPANY_DOCTYPES.has(doctype) || unscoped.has(doctype) || filtersMentionCompany(opts.filters)) return getListFields(doctype, opts);
  const filters = Array.isArray(opts.filters) || !opts.filters ? [...(opts.filters || []), ["company", "=", client]] : { ...opts.filters, company: client };
  try {
    return await getListFields(doctype, { ...opts, filters });
  } catch (e) {
    const rows = await getListFields(doctype, opts);
    unscoped.add(doctype);
    if (import.meta.env.DEV) console.warn(`[client scope] ${doctype} can't be narrowed to a company`, e);
    return rows;
  }
}

async function getListFields(doctype, opts = {}) {
  let fields = opts.fields || ["name"];
  for (;;) {
    try {
      return await getListOnce(doctype, { ...opts, fields });
    } catch (e) {
      const field = refusedField(e);
      if (!field || !fields.includes(field) || fields.length < 2) throw e;
      fields = fields.filter((f) => f !== field);
    }
  }
}

async function getListOnce(doctype, { filters = [], fields = ["name"], limit = 20, orderBy, parent, groupBy }) {
  const res = await client.get("/method/frappe.client.get_list", {
    params: {
      doctype,
      filters: JSON.stringify(filters),
      fields: JSON.stringify(fields),
      limit_page_length: limit,
      order_by: orderBy,
      // totals per value, e.g. fields ["status as k", "count(name) as n"] with groupBy "status" (analytics)
      ...(groupBy ? { group_by: groupBy } : {}),
      // child tables (e.g. Training Event Employee) need their parent doctype for non-admin users
      ...(parent ? { parent } : {}),
    },
  });
  return res.data.message;
}

async function getDoc(doctype, name) {
  const res = await client.get(`/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  return res.data.data;
}

async function createDoc(doctype, doc) {
  const res = await client.post(`/resource/${encodeURIComponent(doctype)}`, doc);
  return res.data.data;
}

async function updateDoc(doctype, name, doc) {
  const res = await client.put(`/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, doc);
  return res.data.data;
}

async function deleteDoc(doctype, name) {
  await client.delete(`/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
}

/** Call a whitelisted server method, e.g. custom app APIs under my_hrms.api.* */
async function callMethod(method, params = {}) {
  const res = await client.post(`/method/${method}`, params);
  return res.data.message;
}

/** Submit a (draft) document: pass the full doc as returned by getDoc. */
async function submitDoc(doc) {
  const res = await client.post("/method/frappe.client.submit", { doc });
  return res.data.message;
}

/** Cancel a submitted document (docstatus 1 -> 2). */
async function cancelDoc(doctype, name) {
  const res = await client.post("/method/frappe.client.cancel", { doctype, name });
  return res.data.message;
}

/** Upload a browser File and (optionally) attach it to a document. */
async function uploadFile(file, { doctype, docname, isPrivate = true, folder } = {}) {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("is_private", isPrivate ? "1" : "0");
  if (folder) form.append("folder", folder);
  if (doctype && docname) {
    form.append("doctype", doctype);
    form.append("docname", docname);
  }
  const res = await client.post("/method/upload_file", form, { headers: { "Content-Type": "multipart/form-data" } });
  return res.data.message;
}

/**
 * Ask ERPNext to email a password reset link (works signed out). Returns ERPNext's answer: "not found" or "disabled"
 * for an unknown / disabled account, otherwise the link was sent.
 */
async function resetPassword(user) {
  const res = await client.post("/method/frappe.core.doctype.user.user.reset_password", { user });
  return res.data.message;
}

/** Change the signed-in user's own password (needs the current password). */
async function changePassword(oldPassword, newPassword) {
  const res = await client.post("/method/frappe.core.doctype.user.user.update_password", {
    old_password: oldPassword,
    new_password: newPassword,
    logout_all_sessions: 0,
  });
  return res.data.message;
}

export const frappe = {
  client,
  refreshCsrfToken,
  login,
  logout,
  getLoggedUser,
  getUserRoles,
  getList,
  getDoc,
  createDoc,
  updateDoc,
  deleteDoc,
  callMethod,
  submitDoc,
  cancelDoc,
  uploadFile,
  resetPassword,
  changePassword,
};