// Office locations (installed from Admin › ERPNext Setup). An office is an ERPNext Branch with a country,
// weekly offs and its current Holiday List; each year's list is linked back to its office.
//  - an employee's holiday list follows their office (Branch) when it is set or changed;
//  - when an office gets a new current list, everyone in that office moves to it;
//  - a daily job switches every office to the next year's list once the old one has ended.
// Leave, attendance, timesheets and the employee calendar already read the employee's holiday list.

export const OFFICE_FIELDS = [
  { dt: "Branch", fieldname: "custom_city", label: "City", fieldtype: "Data", insert_after: "branch" },
  { dt: "Branch", fieldname: "custom_country", label: "Country", fieldtype: "Link", options: "Country", insert_after: "custom_city" },
  { dt: "Branch", fieldname: "custom_region_code", label: "State / Region Code", fieldtype: "Data", insert_after: "custom_country", description: "For regional public holidays, e.g. MH (Maharashtra), CA (California), 13 (Tokyo)" },
  { dt: "Branch", fieldname: "custom_weekly_offs", label: "Weekly Offs", fieldtype: "Data", insert_after: "custom_region_code", description: "Comma separated, e.g. Saturday,Sunday" },
  { dt: "Branch", fieldname: "custom_holiday_list", label: "Current Holiday List", fieldtype: "Link", options: "Holiday List", insert_after: "custom_weekly_offs" },
  { dt: "Branch", fieldname: "custom_address", label: "Address", fieldtype: "Small Text", insert_after: "custom_holiday_list" },
  { dt: "Holiday List", fieldname: "custom_branch", label: "Office (Branch)", fieldtype: "Link", options: "Branch", insert_after: "holiday_list_name", in_standard_filter: 1 },
];

export const OFFICE_TRACK = ["Branch", "Holiday List"];

const EMPLOYEE_FOLLOWS_OFFICE = `
if doc.branch:
    office_list = frappe.db.get_value("Branch", doc.branch, "custom_holiday_list")
    if office_list and (doc.is_new() or doc.has_value_changed("branch") or not doc.holiday_list):
        doc.holiday_list = office_list
`;

const OFFICE_LIST_CHANGED = `
if doc.custom_holiday_list and doc.has_value_changed("custom_holiday_list"):
    for e in frappe.get_all("Employee", filters={"branch": doc.name, "status": ["!=", "Left"]}, pluck="name"):
        frappe.db.set_value("Employee", e, "holiday_list", doc.custom_holiday_list, update_modified=False)
`;

const NEXT_YEAR_DAILY = `
today = frappe.utils.today()
for b in frappe.get_all("Branch", fields=["name", "custom_holiday_list"]):
    cur = b.custom_holiday_list
    if cur and str(frappe.db.get_value("Holiday List", cur, "to_date") or "") >= today:
        continue
    found = frappe.get_all("Holiday List", filters={"custom_branch": b.name, "from_date": ["<=", today], "to_date": [">=", today]}, pluck="name", limit=1)
    if found and found[0] != cur:
        frappe.db.set_value("Branch", b.name, "custom_holiday_list", found[0])
        for e in frappe.get_all("Employee", filters={"branch": b.name, "status": ["!=", "Left"]}, pluck="name"):
            frappe.db.set_value("Employee", e, "holiday_list", found[0], update_modified=False)
`;

export const OFFICE_SCRIPTS = [
  { name: "ETHX - Employee holiday list from office", script_type: "DocType Event", reference_doctype: "Employee", doctype_event: "Before Save", script: EMPLOYEE_FOLLOWS_OFFICE, what: "An employee's holiday list follows their office" },
  { name: "ETHX - Office holiday list changed", script_type: "DocType Event", reference_doctype: "Branch", doctype_event: "After Save", script: OFFICE_LIST_CHANGED, what: "Everyone in an office moves to its new holiday list" },
  { name: "ETHX - Office holiday lists new year", script_type: "Scheduler Event", event_frequency: "Daily", script: NEXT_YEAR_DAILY, what: "Each office switches to next year's holiday list when the year ends" },
];
