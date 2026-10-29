// Office locations (ERPNext Branch) and each office's yearly Holiday List. See officeSetup.js for the server rules.
import { frappe } from "./api/frappeClient";
import { listTry } from "./employeePortal";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const JS_DAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const pad = (n) => String(n).padStart(2, "0");

export const weeklyOffsOf = (office) => String(office?.custom_weekly_offs || "Saturday,Sunday").split(",").map((d) => d.trim()).filter((d) => WEEKDAYS.includes(d));

export async function loadOffices() {
  const [branches, lists, employees, countries] = await Promise.all([
    listTry("Branch", { fields: ["name", "branch", "custom_city", "custom_country", "custom_region_code", "custom_weekly_offs", "custom_holiday_list", "custom_address"], orderBy: "name asc" }, ["name", "branch"]),
    listTry("Holiday List", { fields: ["name", "holiday_list_name", "from_date", "to_date", "total_holidays", "custom_branch"], orderBy: "from_date desc" }, ["name", "holiday_list_name", "from_date", "to_date", "total_holidays"]),
    listTry("Employee", { filters: [["status", "!=", "Left"]], fields: ["name", "employee_name", "branch", "holiday_list"] }, ["name", "employee_name", "branch"]),
    frappe.getList("Country", { fields: ["name", "code"], limit: 0, orderBy: "name asc" }).catch(() => []),
  ]);
  return { branches, lists, employees, countries };
}

/** Weekly-off rows for every matching weekday of the year. */
function weeklyOffRows(year, days) {
  const rows = [];
  const want = new Set(days.map((d) => JS_DAY[d]));
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d = new Date(d.getTime() + 86400000)) {
    if (want.has(d.getUTCDay())) rows.push({ holiday_date: `${year}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, description: WEEKDAYS[(d.getUTCDay() + 6) % 7], weekly_off: 1 });
  }
  return rows;
}

const why = (e) => {
  const d = e?.response?.data;
  let msg = "";
  try { msg = JSON.parse(JSON.parse(d?._server_messages || "[]")[0] || "{}").message || ""; } catch { /* not JSON */ }
  return String(msg || d?.exception || e?.message || "refused").replace(/<[^>]+>/g, "").replace(/^[\w.]+Error: /, "").slice(0, 200);
};

/**
 * Create "<Office> <year>" with the office's weekly offs and, optionally, the country's public holidays
 * (ERPNext's own "Add country holidays", which knows national and regional holidays).
 * Returns { name, publicHolidays, note } - note explains why public holidays weren't added, if they weren't.
 */
export async function createHolidayList(office, { year, weeklyOffs, countryCode, regionCode, publicHolidays }) {
  const doc = {
    doctype: "Holiday List",
    holiday_list_name: `${office} ${year}`,
    from_date: `${year}-01-01`,
    to_date: `${year}-12-31`,
    custom_branch: office,
    weekly_off: weeklyOffs[0] || undefined,
    holidays: weeklyOffRows(year, weeklyOffs),
  };
  let note = "";
  let added = 0;
  if (publicHolidays) {
    if (!countryCode) note = "Public holidays weren't added: the office has no country.";
    else {
      try {
        const res = await frappe.client.post("/method/run_doc_method", {
          docs: JSON.stringify({ ...doc, country: countryCode.toUpperCase(), subdivision: regionCode ? regionCode.toUpperCase() : undefined }),
          method: "get_local_holidays",
        });
        const filled = res.data?.docs?.[0]?.holidays;
        if (Array.isArray(filled)) {
          added = filled.filter((h) => !Number(h.weekly_off)).length;
          doc.holidays = filled.map(({ holiday_date, description, weekly_off }) => ({ holiday_date, description: String(description || "").replace(/<[^>]+>/g, ""), weekly_off: Number(weekly_off) ? 1 : 0 }));
          doc.country = countryCode.toUpperCase();
          if (regionCode) doc.subdivision = regionCode.toUpperCase();
        }
      } catch (e) {
        note = `Public holidays couldn't be added automatically (${why(e)}). Add them under Holidays.`;
      }
    }
  }
  doc.holidays.sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
  const { doctype, ...body } = doc;
  let saved;
  try {
    saved = await frappe.createDoc(doctype, body);
  } catch (e) {
    // Sites whose Holiday List has no country fields: save without them.
    if (!body.country) throw e;
    delete body.country;
    delete body.subdivision;
    saved = await frappe.createDoc(doctype, body);
  }
  return { name: saved.name, publicHolidays: added, note };
}

/** Make a list the office's current one; the server rule then moves everyone in the office onto it. */
export const setCurrentList = (office, list) => frappe.updateDoc("Branch", office, { custom_holiday_list: list });

/** Point employees of the office at its current list (for people added before the rule was installed). */
export async function applyToEmployees(office, list, employees) {
  const todo = employees.filter((e) => e.branch === office && e.holiday_list !== list);
  for (const e of todo) await frappe.callMethod("frappe.client.set_value", { doctype: "Employee", name: e.name, fieldname: "holiday_list", value: list });
  return todo.length;
}

export const getHolidayList = (name) => frappe.getDoc("Holiday List", name);

export const saveHolidays = (name, holidays) => frappe.updateDoc("Holiday List", name, {
  holidays: [...holidays].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)).map(({ holiday_date, description, weekly_off }) => ({ holiday_date, description, weekly_off: weekly_off ? 1 : 0 })),
});
