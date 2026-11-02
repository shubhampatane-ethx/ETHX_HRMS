// Reminds people who haven't punched in or out on time: a card on every page, with a sound if the browser allows it.
// Browsers only play sound after someone has clicked or typed on the page. The server also leaves a notification
// (see attendanceSetup.js), so a reminder isn't missed when the app is closed.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing, X } from "lucide-react";
import { Button } from "../ui/primitives";
import { useAuth } from "../../context/AuthContext";
import { frappe } from "../../lib/api/frappeClient";
import { getHolidays, getMyEmployee, getTodayAttendance, isoDate } from "../../lib/employeePortal";
import { getLeaveDays } from "../../lib/timesheets";
import { hasPermission } from "../../permissions/roles";
import { isPageBlocked } from "../../permissions/pageAccess";

const CHECK_EVERY_MS = 60000;
const GRACE_MINUTES = 15;
const SOUND_EVERY_MINUTES = 30;
// Used when someone has no shift. Must match the server's reminder job.
const DEFAULT_SHIFT = { start: "09:30:00", end: "18:30:00" };

const toMinutes = (time) => { const [h, m] = String(time).split(":").map(Number); return h * 60 + (m || 0); };
const clock = (time) => { const [h, m] = String(time).split(":"); return `${h.padStart(2, "0")}:${m}`; };
const dismissKey = (email, day, type) => `punch-reminder:${email}:${day}:${type}`;
const isDismissed = (key) => { try { return localStorage.getItem(key) === "1"; } catch { return false; } };
const remember = (key) => { try { localStorage.setItem(key, "1"); } catch { /* ignore */ } };

/** Today's shift, and whether today is a working day for this person. */
async function loadDay(email) {
  const employee = await getMyEmployee(email);
  if (!employee) return null;
  const day = isoDate();
  const [shift, holidays, leave] = await Promise.all([
    frappe.callMethod("ethx_my_shift").catch(() => null),
    getHolidays(employee).catch(() => null),
    getLeaveDays(employee.name, day, day).catch(() => ({})),
  ]);
  const list = holidays?.holidays || [];
  const weekday = new Date().getDay();
  const off = list.some((h) => h.date === day) || (!list.some((h) => h.weeklyOff) && (weekday === 0 || weekday === 6)) || Boolean(leave?.[day]);
  return { day, employee: employee.name, off, start: shift?.start || DEFAULT_SHIFT.start, end: shift?.end || DEFAULT_SHIFT.end };
}

function playChime(ctx) {
  if (!ctx || ctx.state !== "running") return;
  [0, 0.28].forEach((at) => {
    const tone = ctx.createOscillator();
    const volume = ctx.createGain();
    tone.frequency.value = at ? 1046 : 784;
    volume.gain.setValueAtTime(0.0001, ctx.currentTime + at);
    volume.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.03);
    volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.25);
    tone.connect(volume).connect(ctx.destination);
    tone.start(ctx.currentTime + at);
    tone.stop(ctx.currentTime + at + 0.26);
  });
}

export function PunchReminder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notice, setNotice] = useState(null); // null | { type: "IN" | "OUT", time, key }
  const audio = useRef(null);
  const lastSound = useRef({ type: "", at: -Infinity });
  const eligible = Boolean(user) && !user.mustChangePassword && hasPermission(user, "dashboard.employee") && !hasPermission(user, "dashboard.admin") && !isPageBlocked(user, "/employee/attendance");
  const email = user?.email;

  useEffect(() => {
    if (!eligible) return undefined;
    const unlock = () => {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!audio.current && Ctx) audio.current = new Ctx();
        audio.current?.resume();
      } catch { /* no sound on this browser */ }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [eligible]);

  useEffect(() => {
    if (!eligible) return undefined;
    let stopped = false;
    let plan = null;
    async function check() {
      try {
        if (plan?.day !== isoDate()) plan = await loadDay(email);
        if (stopped) return;
        if (!plan || plan.off) return setNotice(null);
        const now = new Date();
        const minutes = now.getHours() * 60 + now.getMinutes();
        const inDue = minutes >= toMinutes(plan.start) + GRACE_MINUTES && minutes < toMinutes(plan.end);
        const outDue = minutes >= toMinutes(plan.end) + GRACE_MINUTES;
        if (!inDue && !outDue) return setNotice(null);
        const { logs, logsError } = await getTodayAttendance(plan.employee);
        if (stopped) return;
        if (logsError) return setNotice(null);
        const last = logs[logs.length - 1];
        const type = inDue && !logs.length ? "IN" : outDue && last?.log_type === "IN" ? "OUT" : null;
        const key = type && dismissKey(email, plan.day, type);
        if (!type || isDismissed(key)) return setNotice(null);
        setNotice({ type, key, time: clock(type === "IN" ? plan.start : plan.end) });
        if (lastSound.current.type !== type || minutes - lastSound.current.at >= SOUND_EVERY_MINUTES) {
          lastSound.current = { type, at: minutes };
          playChime(audio.current);
        }
      } catch { /* try again at the next check */ }
    }
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [eligible, email]);

  if (!notice) return null;
  const action = notice.type === "IN" ? "Punch In" : "Punch Out";
  const dismiss = () => { remember(notice.key); setNotice(null); };
  return (
    <div role="alert" className="fixed bottom-5 right-5 z-40 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><BellRing size={15} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--color-text)]">{action} Reminder</p>
          <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">{notice.type === "IN" ? `Your shift started at ${notice.time} and you haven't punched in yet.` : `Your shift ended at ${notice.time} and you haven't punched out yet.`}</p>
        </div>
        <button type="button" aria-label="Dismiss reminder" onClick={dismiss} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={14} /></button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={dismiss}>Dismiss</Button>
        <Button type="button" onClick={() => navigate("/employee/attendance")}>{action}</Button>
      </div>
    </div>
  );
}
