import axios from "axios";

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

client.interceptors.request.use((config) => {
  if (csrfToken && ["post", "put", "delete"].includes(config.method)) {
    config.headers["X-Frappe-CSRF-Token"] = csrfToken;
  }
  // Cache-bust every request with a unique query param as a second layer of
  // defense on top of the Cache-Control header above (some intermediary
  // proxies/browsers ignore no-store for GETs unless the URL itself changes).
  config.params = { ...(config.params || {}), _: Date.now() };
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
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
  await client.post("/method/logout");
  csrfToken = null;
}

/**
 * Frappe doesn't reliably expose a dedicated whitelisted "give me a CSRF
 * token" API endpoint across versions - the token normally only travels
 * embedded in a full page's boot script. So once logged in, we fetch the
 * desk shell HTML (same session cookie applies) and pull the token out of
 * it, e.g. `"csrf_token":"abc123..."` inside the embedded boot JSON.
 */
async function refreshCsrfToken() {
  try {
    const res = await fetch(`/app?_=${Date.now()}`, {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    const match =
      html.match(/"csrf_token":\s*"([a-f0-9]+)"/i) || html.match(/csrf_token\s*=\s*"([a-f0-9]+)"/i);
    csrfToken = match?.[1] ?? null;
  } catch {
    csrfToken = null;
  }
  return csrfToken;
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
async function getList(doctype, { filters = [], fields = ["name"], limit = 20, orderBy, parent } = {}) {
  const res = await client.get("/method/frappe.client.get_list", {
    params: {
      doctype,
      filters: JSON.stringify(filters),
      fields: JSON.stringify(fields),
      limit_page_length: limit,
      order_by: orderBy,
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

/** Upload a browser File and (optionally) attach it to a document. */
async function uploadFile(file, { doctype, docname, isPrivate = true } = {}) {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("is_private", isPrivate ? "1" : "0");
  if (doctype && docname) {
    form.append("doctype", doctype);
    form.append("docname", docname);
  }
  const res = await client.post("/method/upload_file", form, { headers: { "Content-Type": "multipart/form-data" } });
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
  uploadFile,
  changePassword,
};