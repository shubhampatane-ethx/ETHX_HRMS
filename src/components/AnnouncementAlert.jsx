// New announcements interrupt: a pop-up over whatever page is open, a short chime, a flashing tab title and (if the
// person allowed it) a desktop notification when the tab is in the background. Each one shows until it's acknowledged
// with "Got it" - remembered per person in this browser - and its bell notification is marked read at the same time.
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Megaphone, X } from "lucide-react";
import { frappe } from "../lib/api/frappeClient";
import { dmyHm } from "../lib/employeePortal";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/primitives";

const POLL_MS = 2 * 60 * 1000;
const RECENT_DAYS = 14; // older announcements never pop up
const FIRST_RUN_DAYS = 3; // first visit on a browser: only the last few days pop up, not the whole backlog
const seenKey = (email) => `ethx.announcements.seen.${email}`;

function readSeen(email) {
  try {
    const raw = localStorage.getItem(seenKey(email));
    return raw ? new Set(JSON.parse(raw)) : null;
  } catch { return new Set(); }
}
function writeSeen(email, set) {
  try { localStorage.setItem(seenKey(email), JSON.stringify([...set].slice(-200))); } catch { /* not critical */ }
}
const daysAgo = (n) => { const d = new Date(Date.now() - n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} 00:00:00`; };
const plain = (html = "") => String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

/** A short two-note chime. Browsers may block sound until the page has been clicked once - then it stays silent. */
function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    ctx.resume?.().catch(() => {});
    [[880, 0], [1318.5, 0.18], [880, 0.5], [1318.5, 0.68]].forEach(([f, at]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.32);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.35);
    });
    setTimeout(() => ctx.close?.().catch(() => {}), 1500);
  } catch { /* no sound available */ }
}

export function AnnouncementAlert() {
  const { user } = useAuth();
  const email = user?.email;
  const [queue, setQueue] = useState([]);
  const announced = useRef(new Set()); // chimed / notified already in this tab
  const canNotify = typeof window !== "undefined" && "Notification" in window;
  const [permission, setPermission] = useState(canNotify ? Notification.permission : "denied");

  const check = useCallback(async () => {
    if (!email) return;
    let notes = [];
    try {
      notes = await frappe.getList("Note", { filters: [["public", "=", 1], ["creation", ">=", daysAgo(RECENT_DAYS)]], fields: ["name", "title", "content", "creation", "owner"], orderBy: "creation asc", limit: 20 });
    } catch { return; } // announcements not readable for this account
    let seen = readSeen(email);
    if (!seen) { // first time on this browser: don't replay the backlog
      seen = new Set(notes.filter((n) => String(n.creation) < daysAgo(FIRST_RUN_DAYS)).map((n) => n.name));
      writeSeen(email, seen);
    }
    for (const n of notes) if (n.owner === email && !seen.has(n.name)) { seen.add(n.name); writeSeen(email, seen); } // your own
    const fresh = notes.filter((n) => !seen.has(n.name));
    setQueue(fresh);
    const brandNew = fresh.filter((n) => !announced.current.has(n.name));
    if (brandNew.length) {
      brandNew.forEach((n) => announced.current.add(n.name));
      chime();
      if (canNotify && Notification.permission === "granted" && document.hidden) {
        try { new Notification(`📢 ${brandNew[brandNew.length - 1].title}`, { body: plain(brandNew[brandNew.length - 1].content).slice(0, 180), tag: "ethx-announcement" }); } catch { /* ignore */ }
      }
    }
  }, [email, canNotify]);

  useEffect(() => {
    check();
    const timer = setInterval(check, POLL_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [check]);

  // Flash the tab title while something is waiting.
  useEffect(() => {
    if (!queue.length) return undefined;
    const original = document.title;
    let on = false;
    const t = setInterval(() => { on = !on; document.title = on ? `📢 New announcement (${queue.length})` : original; }, 1200);
    return () => { clearInterval(t); document.title = original; };
  }, [queue.length]);

  if (!queue.length) return null;
  const note = queue[0];
  const first = (user?.fullName || "").split(" ")[0] || "there";
  const body = plain(note.content).replace(/\{first_name\}/g, first).replace(/\{employee_name\}/g, user?.fullName || first).replace(/\{company\}/g, "");

  function acknowledge() {
    const seen = readSeen(email) || new Set();
    seen.add(note.name);
    writeSeen(email, seen);
    setQueue((q) => q.slice(1));
    frappe.getList("Notification Log", { filters: [["for_user", "=", email], ["document_type", "=", "Note"], ["document_name", "=", note.name], ["read", "=", 0]], fields: ["name"], limit: 5 })
      .then((logs) => Promise.all(logs.map((l) => frappe.updateDoc("Notification Log", l.name, { read: 1 }))))
      .catch(() => { /* the bell entry stays unread - harmless */ });
  }
  async function enableDesktop() {
    try { setPermission(await Notification.requestPermission()); } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]" role="alertdialog" aria-modal="true" aria-labelledby="ann-title">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--color-red-deep)] bg-[var(--color-surface)] shadow-2xl">
        <div className="relative overflow-hidden bg-[var(--color-red)] px-6 py-5 text-[var(--color-on-accent)]">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="flex items-center gap-3">
            <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
              <span className="absolute inset-0 animate-ping rounded-full bg-white/25" />
              <Megaphone size={20} strokeWidth={2} />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-90">New announcement{queue.length > 1 ? ` · 1 of ${queue.length}` : ""}</p>
              <p className="text-[12px] opacity-80">{dmyHm(note.creation)}</p>
            </div>
          </div>
          <button type="button" onClick={acknowledge} aria-label="Close" className="absolute right-4 top-4 rounded-md p-1 opacity-80 hover:bg-white/15 hover:opacity-100"><X size={16} /></button>
        </div>
        <div className="px-6 py-5">
          <h2 id="ann-title" className="text-[18px] font-semibold leading-snug text-[var(--color-text)]">{note.title}</h2>
          <p className="mt-3 max-h-[45vh] overflow-y-auto whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--color-text)]">{body}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] px-6 py-4">
          {canNotify && permission === "default"
            ? <button type="button" onClick={enableDesktop} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><BellRing size={13} /> Alert me even when this tab isn't open</button>
            : <span />}
          <Button type="button" onClick={acknowledge}>{queue.length > 1 ? "Got it · Next" : "Got it"}</Button>
        </div>
      </div>
    </div>
  );
}
