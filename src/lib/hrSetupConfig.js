import {
  Building2,
  Users,
  CalendarDays,
  SlidersHorizontal,
  CalendarCheck,
  Receipt,
  FileBarChart2,
  Newspaper,
} from "lucide-react";

/**
 * Registry for every HR master, setting and report that isn't already a
 * top-level page (Employees, Leave, Attendance already exist as full pages
 * - they're intentionally left out of here). Each entry becomes its own
 * sidebar link (grouped for readability) and its own working screen wired
 * to the matching ERPNext/HRMS doctype - list+create+delete for masters,
 * load+save for Single doctypes, live execution for reports.
 *
 * NOTE ON FIELD NAMES: the field keys below match stock ERPNext/HRMS
 * doctypes. If your site has customized a doctype (renamed/added
 * mandatory fields), adjust the relevant `formFields` array to match -
 * everything here reads real records from the field key, so a wrong key
 * just means the field renders blank / doesn't save, not a crash.
 *
 * Field types supported by the generic form renderer in DoctypeView.jsx:
 *   text | number | date | datetime | select (needs `options`) |
 *   link (needs `linkDoctype`, renders with autocomplete)
 */
export const HR_SETUP_SECTIONS = [
  {
    title: "Organization Setup",
    icon: Building2,
    items: [
      {
        label: "Company",
        doctype: "Company",
        kind: "list",
        adminOnly: true, // companies are set up by the Administrator (Platform Admin > Organization), not by HR
        formFields: [
          { name: "company_name", label: "Company Name", type: "text", required: true },
          { name: "abbr", label: "Abbreviation", type: "text", required: true },
          { name: "default_currency", label: "Default Currency", type: "text" },
        ],
      },
      {
        // Offices (ERPNext Branch) have their own page: location, weekly offs and yearly holiday lists.
        label: "Office Locations",
        doctype: "Branch",
        to: "/hr/offices",
        kind: "list",
        formFields: [{ name: "branch", label: "Branch Name", type: "text", required: true }],
      },
      {
        label: "Department",
        doctype: "Department",
        kind: "list",
        formFields: [
          { name: "department_name", label: "Department Name", type: "text", required: true },
          { name: "company", label: "Company", type: "link", linkDoctype: "Company", required: true },
        ],
      },
      {
        label: "Designation",
        doctype: "Designation",
        kind: "list",
        formFields: [{ name: "designation_name", label: "Designation Name", type: "text", required: true }],
      },
    ],
  },
  {
    title: "Employee Masters",
    icon: Users,
    items: [
      {
        label: "Employee Group",
        doctype: "Employee Group",
        kind: "list",
        formFields: [{ name: "employee_group_name", label: "Group Name", type: "text", required: true }],
      },
      {
        label: "Employee Grade",
        doctype: "Employee Grade",
        kind: "list",
        formFields: [{ name: "title", label: "Grade Title", type: "text", required: true }],
      },
    ],
  },
  {
    title: "Leaves",
    icon: CalendarDays,
    items: [
      {
        label: "Compensatory Leave Request",
        doctype: "Compensatory Leave Request",
        kind: "list",
        formFields: [
          { name: "employee", label: "Employee", type: "link", linkDoctype: "Employee", required: true },
          { name: "leave_type", label: "Leave Type", type: "link", linkDoctype: "Leave Type" },
          { name: "work_from_date", label: "Work From Date", type: "date", required: true },
          { name: "work_end_date", label: "Work End Date", type: "date", required: true },
        ],
      },
    ],
  },
  {
    title: "Settings",
    icon: SlidersHorizontal,
    items: [
      { label: "HR Settings", doctype: "HR Settings", kind: "single" },
      { label: "Payroll Settings", doctype: "Payroll Settings", kind: "single" },
      {
        label: "Daily Work Summary Group",
        doctype: "Daily Work Summary Group",
        kind: "list",
        formFields: [{ name: "name", label: "Group Name", type: "text", required: true }],
      },
    ],
  },
  {
    title: "Attendance",
    icon: CalendarCheck,
    items: [
      {
        label: "Attendance Request",
        doctype: "Attendance Request",
        kind: "list",
        formFields: [
          { name: "employee", label: "Employee", type: "link", linkDoctype: "Employee", required: true },
          { name: "from_date", label: "From Date", type: "date", required: true },
          { name: "to_date", label: "To Date", type: "date", required: true },
          {
            name: "reason",
            label: "Reason",
            type: "select",
            options: ["Sick Leave", "Work From Home", "Business Exigencies", "Others"],
          },
        ],
      },
      {
        label: "Employee Checkin",
        doctype: "Employee Checkin",
        kind: "list",
        formFields: [
          { name: "employee", label: "Employee", type: "link", linkDoctype: "Employee", required: true },
          { name: "log_type", label: "Log Type", type: "select", options: ["IN", "OUT"], required: true },
          { name: "time", label: "Time", type: "datetime", required: true },
        ],
      },
    ],
  },
  {
    title: "Expense Claim",
    icon: Receipt,
    items: [
      {
        label: "Expense Claim",
        doctype: "Expense Claim",
        kind: "list",
        formFields: [
          { name: "employee", label: "Employee", type: "link", linkDoctype: "Employee", required: true },
          { name: "company", label: "Company", type: "link", linkDoctype: "Company", required: true },
        ],
      },
      {
        label: "Employee Advance",
        doctype: "Employee Advance",
        kind: "list",
        formFields: [
          { name: "employee", label: "Employee", type: "link", linkDoctype: "Employee", required: true },
          { name: "purpose", label: "Purpose", type: "text" },
          { name: "advance_amount", label: "Advance Amount", type: "number" },
        ],
      },
      {
        label: "Travel Request",
        doctype: "Travel Request",
        kind: "list",
        formFields: [
          { name: "employee", label: "Employee", type: "link", linkDoctype: "Employee", required: true },
          { name: "purpose_of_travel", label: "Purpose of Travel", type: "text" },
        ],
      },
    ],
  },
  {
    title: "Key Reports",
    icon: FileBarChart2,
    items: [
      { label: "Monthly Attendance Sheet", doctype: "Monthly Attendance Sheet", kind: "report" },
      { label: "Recruitment Analytics", doctype: "Recruitment Analytics", kind: "report" },
      { label: "Employee Analytics", doctype: "Employee Analytics", kind: "report" },
      { label: "Employee Leave Balance", doctype: "Employee Leave Balance", kind: "report" },
      { label: "Employee Leave Balance Summary", doctype: "Employee Leave Balance Summary", kind: "report" },
      { label: "Employee Advance Summary", doctype: "Employee Advance Summary", kind: "report", disabled: true },
      { label: "Employee Exits", doctype: "Employee Exits", kind: "report" },
    ],
  },
  {
    title: "Other Reports",
    icon: Newspaper,
    items: [
      { label: "Employee Information", doctype: "Employee Information", kind: "report", disabled: true }, // Report Builder view - no server-side run
      { label: "Employee Birthday", doctype: "Employee Birthday", kind: "report" },
      { label: "Employees Working on a Holiday", doctype: "Employees Working on a Holiday", kind: "report" },
      { label: "Daily Work Summary Replies", doctype: "Daily Work Summary Replies", kind: "report", disabled: true },
    ],
  },
];

/** Flat lookup so the detail page can find an item's config by its doctype slug. */
export function findSetupItem(doctypeSlug) {
  for (const section of HR_SETUP_SECTIONS) {
    const match = section.items.find((item) => slugify(item.doctype) === doctypeSlug);
    if (match) return { ...match, section: section.title };
  }
  return null;
}

export function slugify(doctype) {
  return doctype.toLowerCase().replace(/\s+/g, "-");
}