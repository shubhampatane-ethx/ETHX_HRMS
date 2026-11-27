// Attendance statuses: short codes, the app's status tones (same green / amber / red as StatusPill everywhere)
// and the figures the Attendance page shows.

const GOOD = "var(--color-green)";
const WARN = "var(--color-amber)";
const BAD = "var(--color-red-hover)";
const NONE = "var(--color-text-faint)";

export const STATUS_META = {
  Present: { short: "P", tone: GOOD, label: "Present" },
  "Work From Home": { short: "WFH", tone: WARN, label: "Work From Home" },
  "Half Day": { short: "HD", tone: WARN, label: "Half Day" },
  "On Leave": { short: "L", tone: WARN, label: "On Leave" },
  Absent: { short: "A", tone: BAD, label: "Absent" },
  "Short Hours": { short: "SH", tone: WARN, label: "Short Hours" },
  "Missed Punch Out": { short: "MP", tone: BAD, label: "Missed Punch Out" },
  Working: { short: "IN", tone: GOOD, label: "Checked In" },
  "Not marked": { short: "–", tone: NONE, label: "Not marked" },
};
export const MAIN_STATUSES = ["Present", "Work From Home", "Half Day", "On Leave", "Absent"];
export const EXTRA_STATUSES = ["Short Hours", "Missed Punch Out", "Working"];
export const statusMeta = (s) => STATUS_META[s] || { short: "", tone: "var(--color-text-muted)", label: s };

/** Present, WFH and half days (counted ½) out of the days that have a decided status. */
export function attendanceRate(counts) {
  const decided = MAIN_STATUSES.reduce((n, s) => n + (counts[s] || 0), 0) + (counts["Short Hours"] || 0) + (counts["Missed Punch Out"] || 0);
  if (!decided) return null;
  const attended = (counts.Present || 0) + (counts["Work From Home"] || 0) + 0.5 * (counts["Half Day"] || 0);
  return Math.round((attended / decided) * 100);
}

/** Hours worked on a day: the saved figure, else from the in / out punches. null when unknown (no punch out). */
export function hoursOf(r) {
  if (Number(r.working_hours) > 0) return Number(r.working_hours);
  if (!r.in_time || !r.out_time || r.stillIn) return null;
  const a = new Date(String(r.in_time).replace(" ", "T")).getTime();
  const b = new Date(String(r.out_time).replace(" ", "T")).getTime();
  return b > a ? Math.round(((b - a) / 3600000) * 10) / 10 : null;
}
