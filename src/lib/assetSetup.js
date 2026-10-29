// Asset register on ERPNext's own Asset doctype (installed from Admin › ERPNext Setup):
//  - custom fields for the columns of the company's Excel asset register (asset code, serial number, who
//    assigned / approved it, return and access-revocation dates, condition, notes). All of them can change
//    after the asset is submitted, so a re-uploaded register can update them;
//  - a list rule so an employee only ever sees the assets they hold (HR, accounts and stock staff see all).

const f = (fieldname, label, fieldtype, insert_after, extra = {}) => ({
  dt: "Asset", fieldname, label, fieldtype, insert_after, allow_on_submit: 1, ...extra,
});

export const ASSET_FIELDS = [
  f("custom_register_section", "Asset register", "Section Break", "custodian", { collapsible: 0 }),
  f("custom_asset_code", "Asset Code", "Data", "custom_register_section", { in_list_view: 1, in_standard_filter: 1, bold: 1 }),
  f("custom_serial_number", "Manufacturer Serial Number", "Data", "custom_asset_code", { in_standard_filter: 1 }),
  f("custom_condition", "Condition", "Select", "custom_serial_number", { options: "\nWorking\nDamaged\nOut of Service" }),
  f("custom_assigned_on", "Assigned On", "Date", "custom_condition"),
  f("custom_register_col", "", "Column Break", "custom_assigned_on"),
  f("custom_assigned_by", "Assigned By", "Data", "custom_register_col"),
  f("custom_approved_by", "Approved By", "Data", "custom_assigned_by"),
  f("custom_other_assets", "Other Assets Given", "Small Text", "custom_approved_by"),
  f("custom_return_section", "Return & exit", "Section Break", "custom_other_assets", { collapsible: 1 }),
  f("custom_holder_left_on", "Holder Left / Terminated On", "Date", "custom_return_section"),
  f("custom_returned_on", "Returned On", "Date", "custom_holder_left_on"),
  f("custom_return_col", "", "Column Break", "custom_returned_on"),
  f("custom_access_revoked_on", "Access Revoked On", "Date", "custom_return_col"),
  f("custom_access_revoked_by", "Access Revoked By", "Data", "custom_access_revoked_on"),
  f("custom_register_notes", "Register Notes", "Small Text", "custom_access_revoked_by"),
  // Which register row the asset came from, so a revised upload updates it instead of adding a copy.
  f("custom_register_key", "Register Key", "Data", "custom_register_notes", { hidden: 1, read_only: 1, no_copy: 1, search_index: 1 }),
];

export const ASSET_TRACK = ["Asset"];

// Permission Query: extra condition added to every Asset list for the signed-in user.
const MY_ASSETS_ONLY = `
see_all = {"Administrator", "System Manager", "HR Manager", "HR User", "Accounts Manager", "Accounts User", "Stock Manager", "Stock User", "Quality Manager"}
if user != "Administrator" and not (set(frappe.get_roles(user)) & see_all):
    emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
    conditions = "\`tabAsset\`.\`custodian\` = {0}".format(frappe.db.escape(emp)) if emp else "1=0"
`;

export const ASSET_SCRIPTS = [
  { name: "ETHX - Assets: own only", script_type: "Permission Query", reference_doctype: "Asset", script: MY_ASSETS_ONLY, what: "Employees see only the assets assigned to them" },
];
