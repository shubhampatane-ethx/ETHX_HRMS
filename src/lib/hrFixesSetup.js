// Training, leave types and attendance safeguards (installed from Admin › ERPNext Setup).
//   - Training events can be rescheduled, postponed or edited after they're scheduled, in place: the event keeps
//     its name, invitees, attendance and feedback (HRMS fixes these fields once an event is scheduled).
//   - The leave types Indian companies use are added if missing. Existing types (Casual Leave, Sick Leave,
//     Privilege Leave, Compensatory Off, Leave Without Pay come with HRMS) are left exactly as they are.

const editable = (field) => ({ doc_type: "Training Event", field_name: field, property: "allow_on_submit", property_type: "Check", value: 1, what: `Training Event › ${field} can change after scheduling` });

export const TRAINING_PROPERTIES = ["event_name", "training_program", "type", "level", "start_time", "end_time", "location", "trainer_name", "trainer_email", "introduction"].map(editable)
  .concat(["employee", "is_mandatory"].map((field) => ({ doc_type: "Training Event Employee", field_name: field, property: "allow_on_submit", property_type: "Check", value: 1, what: `Invitees can be added or removed after scheduling (${field})` })));

export const TRAINING_TRACK = ["Training Event", "Training Program"];

// One Leave Type each. Numbers of days are NOT set here - HR allocates them (HR › Leave › Allocate), so company policy
// decides. Flags only say how each type behaves.
const type = (name, what, flags = {}) => ({
  doctype: "Leave Type",
  name,
  what: `Leave type: ${name} - ${what}`,
  doc: { leave_type_name: name, include_holiday: 0, allow_negative: 0, ...flags },
});

export const LEAVE_TYPE_RECORDS = [
  type("Casual Leave", "CL"),
  type("Sick Leave", "SL; half day is chosen when applying"),
  type("Privilege Leave", "Earned / Privilege Leave (EL/PL), carried forward", { is_carry_forward: 1 }),
  type("Compensatory Off", "earned by working on a holiday (Comp Off)", { is_compensatory: 1 }),
  type("Leave Without Pay", "LWP, no balance needed", { is_lwp: 1 }),
  type("Maternity Leave", "up to 26 weeks in a row, holidays counted", { max_continuous_days_allowed: 182, include_holiday: 1 }),
  type("Paternity Leave", "for the birth or adoption of a child"),
  type("Bereavement Leave", "on the death of a family member"),
  type("Marriage Leave", "for the employee's own wedding"),
  type("Restricted Holiday (RH)", "optional holiday, taken from the optional holiday list", { is_optional_leave: 1 }),
];
