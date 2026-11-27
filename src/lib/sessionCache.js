// Short-lived cache for sign-in data (the session, own employee record, branding), kept in sessionStorage so a page
// reload or a typed URL doesn't repeat the whole start-up (BUG-008). It's per browser tab, is cleared on sign-in and
// sign-out, and never holds sensitive fields (PAN, Aadhaar, salary): those are fetched only where they're shown.
// Screens only use it for what to show; ERPNext still checks every request.
const PREFIX = "hrms360:cache:";
const TTL_MS = 10 * 60 * 1000;

export function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { at, value } = JSON.parse(raw);
    if (Date.now() - at > TTL_MS) {
      sessionStorage.removeItem(PREFIX + key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function cacheSet(key, value) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch { /* storage full or blocked - just don't cache */ }
}

export function cacheDrop(key) {
  try { sessionStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

/** Forget everything (sign-in, sign-out, switching client). */
export function cacheClear() {
  try {
    Object.keys(sessionStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}
