// Sprint 28.9 — roles and departments.
//   ROLE is only 'employee' or 'admin' (admin = manager access). 'front_desk' was retired: Front Desk is a DEPARTMENT, and the department is what gives staff their
//   extra pages (Front Desk → Reservations, Housekeeping, Logbook). An employee with no department is "Uncategorized" and only sees Home (their working hours).
export const STAFF_ROLES = ['employee', 'admin'];
export const ROLE_LABELS = { employee: 'Employee', admin: 'Admin' };
export const roleLabel = (r) => ROLE_LABELS[r] || (r ? String(r).replace('_', ' ') : '');   // an unknown / legacy value is shown as plain words, never hidden
export const UNCATEGORIZED = 'Uncategorized';
/** Admins (and dev) don't need a department — the form only asks employees for one. */
export const needsDepartment = (role) => role !== 'admin' && role !== 'dev';
/** The department to show for a person: their department, "—" for an admin without one (admins don't need a department), otherwise Uncategorized. */
export const departmentLabel = (person) => (person && person.department) || (needsDepartment(person && person.role) ? UNCATEGORIZED : '—');
export const FRONT_DESK_RE = /^front[\s_-]*desk$/i;
export const isFrontDeskDepartment = (name) => typeof name === 'string' && FRONT_DESK_RE.test(name.trim());
