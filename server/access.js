// Sprint 28.10 — staff-portal PAGES and Views.
// The pages a staff member can open beyond Home are HARDCODED here (adding a page = code); a VIEW is just a named set of these keys that dev composes in the app,
// attached to a DEPARTMENT (departments.view_id) — everyone in the department inherits it. No view = Home only. Role (employee / admin) is separate: it is the access LEVEL.
const PAGES = {
  reservations: { label: 'Forecast', note: 'The Forecast page: today’s top cards and rooms to sell (guest identifiers removed; dev chooses the cards). Page key stays `reservations`.' },
  housekeeping: { label: 'Housekeeping', note: 'The room board, planning and printing the housekeepers’ sheets' },
  logbook:      { label: 'Logbook',      note: 'Read and write the Log Book, and be sent notes' },
};
const PAGE_KEYS = Object.keys(PAGES);
const catalog = () => PAGE_KEYS.map(k => ({ key: k, label: PAGES[k].label, note: PAGES[k].note }));
/** Keeps only known page keys, once each, in catalog order. Anything else is dropped. */
const cleanPages = (list) => { const set = new Set(Array.isArray(list) ? list.map(String) : []); return PAGE_KEYS.filter(k => set.has(k)); };
/** Validates a view name: 1–60 chars after trimming. */
const cleanViewName = (name) => { const n = String(name === undefined || name === null ? '' : name).replace(/\s+/g, ' ').trim(); return n && n.length <= 60 ? n : null; };
/** app_settings key: may admins change which view a department uses? Dev-only switch, off by default. */
const ADMIN_SETS_VIEW_KEY = 'access_admin_sets_view';
module.exports = { PAGES, PAGE_KEYS, catalog, cleanPages, cleanViewName, ADMIN_SETS_VIEW_KEY };
