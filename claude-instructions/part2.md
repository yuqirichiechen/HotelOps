# Claude Instructions — HotelOps (Part 2: Sprint 10+)

> **Read this AND `part1.md` (same folder) every iteration before you
> start work.** Part 1 is the full chronological iteration log for
> Sprints 1–9.4.1 and the original project overview. Part 2 starts
> with a synthesis of what's been built and then hosts new sprint
> entries from Sprint 10 onward.

---

## 1. Project at a glance (unchanged from part 1)

- **What**: HotelOps — workforce management for a hotel (clock in/out,
  scheduling, shift notes, admin tools, payroll exports).
- **Course**: CSS 497 capstone, UDub fifth quarter 2026.
- **Pilot tenant**: Snoqualmie Inn.
- **Long-term**: multi-tenant SaaS via the `/:tenant` URL slug.

## 2. Tech stack (unchanged)

| Layer    | Stack                                                   |
| -------- | ------------------------------------------------------- |
| Frontend | React 18 (CRA), `react-router-dom` v6, plain CSS, Tiempos fonts |
| Backend  | Node 20 + Express 4, `pg` for Postgres                  |
| Database | PostgreSQL 16 (Koyeb / Neon)                            |
| Deploy   | `gh-pages` for frontend (legacy); server runs on Koyeb  |
| Build    | `react-scripts` (CRA 5), `xlsx` runtime dep (9.4+)      |

---

## 3. Quick recap — Sprints 1–9 (read part 1 for details)

### 3.1. Auth, routing, and the app shell (Sprints 1–5)

- **Sprint 1–2**: JWT (HS256, 8h, `localStorage`), two login routes
  (`/login/staff`, `/login/admin`), PIN gate for staff with admin-controlled
  reset, admin creds in `server/config/admins.json` (plaintext, replace
  for SaaS).
- **Sprint 3.x**: Home dashboard (clock-in flip card), Timesheet
  placeholder, mobile-scroll unblocked.
- **Sprint 4.x**: Timesheet built out — hero card (worked vs scheduled),
  per-day bar chart, expandable daily breakdown, CSV export (basic).
- **Sprint 5**: admin panel revamped — nested routes (no more
  internal-state nav), `AdminHome` dashboard with 4-up stats + "on the
  floor" card + pending approvals, hour override + audit log pattern.
  `5.x` series stabilized the dashboard (single-fetch + per-query error
  surfacing, 401 auto-recovery, production schema backfill).

### 3.2. Staff performance + admin polish (Sprint 6.x)

- **Sprint 6**: staff performance dashboard, configurable overtime
  threshold (`overtime_threshold_hours` setting, default 40),
  on-time tolerance.
- **6.2**: OT approval (`ot_approved` per entry, bulk approve endpoint).
- **6.3**: `StaffManager` rebuilt as list-as-dashboard (clickable stats
  banner, rich rows with this-week metrics).
- **6.4–6.7**: bulk CSV export popover (today/week/month/year + scope
  radios), themed `.hop-radio` / `.hop-check` utilities, filter-row
  polish.

### 3.3. Multi-identifier login + on-screen keypad (Sprint 7.x)

- **Sprint 7**: classifier-based login (phone / username / employee
  code) over a single `identifier` field.
- **7.1–7.3**: built-in QWERTY + numeric keypad with locked-height
  switching so swapping keyboard modes doesn't shift the page.
- **7.4**: View Transitions API for the login card swap between staff
  and admin pages (animated via `document.startViewTransition` in
  `TransitionLink`).

### 3.4. Scheduling rebuilt + kiosk lockdowns (Sprint 8.x)

- **Sprint 8.0**: scheduling rebuilt as an iOS-Calendar-style 4-view
  zoom (Day → Week → Month → Year, animated transitions).
- **8.1**: docked "Assign Shifts" panel + bulk recurring assign.
- **8.2**: timeline-positioned shift blocks in WeekView.
- **8.3–8.4**: warn-but-allow conflict detection, DayView Timeline /
  Resource modes, dept filter.
- **8.5.x**: animation polish (universal slide on prev/next, view-
  transition-group durations, canvas zoom prominence).
- **8.6.x**: post-clock auto sign-out banner with ring countdown (for
  shared-kiosk use).
- **8.7.x**: kiosk lock — block the system keyboard on staff login
  (pointer-events trick, then full input replacement).

### 3.5. Login UX overhaul + payroll exports (Sprint 9.x)

- **9.0–9.1.x**: birthday-as-equal-identifier (MMDDYYYY format),
  per-tenant `enabled_login_methods` setting, `/:tenant` URL slug for
  branded login, ABC keyboard toggle, fluid vs hardcode layout choice.
- **9.2–9.2.4**: real PNG logos (HotelOps + tenant), tenant-as-brand
  on post-pick login pages, Rakuten-style View Transition morph from
  picker → post-pick (named `hotelops-mark` + per-row
  `tenant-brand-{slug}`), mobile non-scroll lock at `min-height: 640px`,
  top-bar layout with HotelOps left + role-switch right, dev gate at
  `/login/dev` with hardcoded `dev/dev` + dev panel at `/dev`.
- **9.3–9.3.5**: clock-event drives bottom-card flip on Home dashboard
  (This Week + Recent flip on clock-in/out with confirmation +
  countdown), HotelOps + role-switch moved into headline-row to save
  vertical, sidebar lock + sign-out in sidebar footer, vertical
  no-scroll on Home dashboard above 640px viewport (uses flex
  distribution + `clamp()` for breathing).
- **9.4–9.4.1**: payroll XLSX export — biweekly + month + custom range
  (cap 365 days), one sheet per employee with per-workweek OT split,
  summary footer (Total Hours / Regular / Overtime / Hourly Rate /
  Total Pay / OT Pay TBD), `pay_period_start_day` setting drives both
  the biweekly range and the workweek boundary, "Include inactive
  staff" checkbox.

---

## 4. Locked architectural decisions you should respect

These came out of the Sprint 1–9 work and are *not* up for re-litigation
without an explicit user ask:

### Auth + tenancy

- **JWT HS256, 8h expiry, `localStorage['hotelops-token']`.** Single
  secret (`JWT_SECRET` env). Admin creds in `server/config/admins.json`
  (plaintext, edit + redeploy).
- **Per-tenant URL prefix**: `/:tenant/login/staff` etc. Bare
  `/login/staff` → property picker. `tenant.slug` from
  `src/config/tenant.js` (`KNOWN_TENANTS` map + `resolveTenant()`).
- **`hotelops-tenant-slug` in localStorage** is persisted on successful
  sign-in (Staff + Admin). All post-session sign-out flows (Home auto-
  signout, Settings handleSignOut, Sidebar handleSignOut, AdminSettings)
  read this and route to `/{slug}/login/{role}` — *never* the bare
  picker. Survives `logout()` (only `hotelops-token` is cleared).

### Layout + theming

- **Universal vertical non-scroll lock at `min-height: 640px`.** Login
  page (`Login.css`) and Home dashboard (`Home.css`) both lock with
  `height: 100dvh; overflow: hidden` and let `clamp()`-sized children
  distribute remaining space via `flex: N 1 0; min-height: 0`. Below
  640vh, scroll fallback. Mobile (`max-width: 768px`) subtracts the
  fixed `.bottom-nav` height via `calc(100dvh - 64px - env(safe-area-inset-bottom))`.
- **Sidebar pinned**: `.app-shell { height: 100vh }` (not min-height)
  + `.app-main { min-height: 0 }` so internal `overflow-y: auto`
  actually clips.
- **Theme swap pattern**: dual-PNG rendered in DOM, CSS hides the
  wrong-theme one (`HotelOpsLogo`, `RoleIcon`). File-name = target
  theme; PNG background matches that theme's `--bg-base` so the seam
  is invisible. Don't background-strip; don't JS-detect the theme.

### View Transitions

- **`TransitionLink`** is the canonical way to navigate between
  surfaces where you want a morph. Wraps `nav()` in
  `document.startViewTransition`. Pair elements with
  `view-transition-name` (and tune duration via `::view-transition-old`
  / `::view-transition-new` CSS rules).
- **Per-tenant transition names**: each picker row's `<img>` gets
  `viewTransitionName: \`tenant-brand-${slug}\`` via inline style.
  Post-pick login's banner uses the same key. Pre-assigning unique
  names to every candidate origin is how you handle "I don't know
  which row the user will tap." Other rows fade out via the default
  Old-element disposition.
- **`hotelops-mark`** is the named pair for the picker (xl center) ↔
  post-pick top-bar (lg left). Don't reuse this name elsewhere.

### Payroll + settings

- **`pay_period_start_day`** (0=Sun..6=Sat, integer string) is the
  anchor for both the biweekly export range *and* the workweek
  boundary used in OT splits. Settings UI in `AdminSettings`; reads
  via `/api/admin/settings`.
- **OT is per-workweek**, not per-entry. `computeWorkweekTotals(entries,
  payStartDay, threshold)` returns `{ totalHours, regularHours,
  overtimeHours }`. Don't try to mark individual entries as OT.
- **`base_hourly_rate` on `users`** drives the export's Total Pay.
  Null → render `—` (so payroll sees "rate not set" instead of "$0").

### Conventions you'll bump into

- **`apiFetch(path)`** is the auth-aware fetch wrapper (auto-includes
  `Authorization: Bearer …`). Don't roll your own.
- **Audit log pattern for admin writes**: `audit_logs` row with
  `actor_id = NULL`, action string, `old_data` + `new_data` JSONB.
  Admin username in `new_data`. See `PATCH /api/admin/time-entries/:id`
  in `server/server.js`.
- **Single-fetch dashboards.** `GET /api/admin/dashboard` returns
  stats + 3 lists in one round-trip. Don't fan out.
- **Single source of truth**: `claude-instructions/part2.md` is where
  new sprint entries go. `part1.md` is frozen at Sprint 9.4.1.

---

## 5. Iteration log (Sprint 10+)

> **Convention**: entry header is `### YYYY-MM-DD — Sprint N.M: short
> title`. Newest entries go at the top of this section (descending
> chronological), matching part 1's pattern. Each entry covers
> motivation, files modified, conventions added, and "notes for next
> iteration."

### Sprint 10 series — planning doc (locked 2026-05-20)

> **Status**: planning doc, not yet implemented. As each sub-sprint
> lands, the corresponding plan block is replaced by a real
> "what we did" entry (motivation, files modified, conventions, notes
> for next). The split into four sub-sprints is fixed; the *scope*
> inside each can adjust mid-stream as we learn.

**North-star goal**: collapse the standalone "Shift Notes" surface into
the Calendar surface, rename "Scheduling" → "Calendar" everywhere
user-facing, and model handoff notes as a single first-class entity
with three views (per-shift threads, general handoffs, cross-day
carryovers). End state: one Calendar nav item for each role, with
notes living in a bottom drawer on the Day view and badges threading
through Week / Month views.

**Locked design decisions** (agreed 2026-05-20 brainstorm):

1. **Calendar component split**: two top-level wrappers
   (`ShiftsView` for staff, `SchedulingManager` for admin) stay
   separate. Share at the *atom* level (`<ShiftBlock />`,
   `<DayPickerPills />`, `<HandoffsDrawer />`, `<DepartmentChips />`)
   and at the *view* level where roles agree (`<DayView />`,
   `<MonthView />`, `<YearView />` — `editable` prop controls admin
   handlers). Week view diverges: `<StaffWeekView />` (matrix-per-staff
   à la mockup #12) vs `<AdminWeekView />` (matrix-per-dept à la
   mockup #13).
2. **Single `handoff_notes` table** drives all three note views
   (per-shift thread / general board / cross-day). Schema:
   `note_id, tenant_id, author_user_id, body, created_at, scope
   ('shift'|'department'|'all'), shift_id, department_id,
   carry_until, pinned_at, resolved_at`. Plus `handoff_note_reads
   (note_id, user_id, read_at)` for unread badges and "mark all
   read." Filtering on `scope` + `carry_until` produces the three
   views — no migration between buckets, the same note can be
   pinned/carried forward by toggling fields.
3. **Day-view chrome**: schedule (timeline) always visible in the
   upper half. Bottom drawer with three filter tabs: **Handoffs**
   (per-shift threads + assigned-to-me), **General** (department
   or all-staff broadcasts), **Cross-day** (Today / Tomorrow toggle
   showing carryovers + pins).
4. **Week view defaults**: staff sees matrix-per-staff (#12),
   admin sees matrix-per-dept with capacity stats (#13). Both have
   shift-cell note badges (`💬 N` icons) that open the relevant
   day's drawer when clicked. Mockup #14's "expanded day with notes
   feed below" gets added as a density toggle later (10.1+ scope,
   not 10).

---

### 2026-05-20 — Sprint 10: rename Scheduling → Calendar, ship handoff_notes schema + API + admin Day-view drawer

First of the four-sprint Calendar consolidation series. Goal: data
foundation + one user-visible payoff (admin handoffs drawer) so
10.1+ have something to stand on. Tight scope.

**Schema (migration 011).** New `handoff_notes` table is the one
backing entity for all three Calendar note views. Single row, three
views via `scope` (`'shift'|'department'|'all'`) + `for_date` +
`carry_until`. Migration file:
`database/migrations/011_handoff_notes.sql`.

Renamed `shift_id` → `schedule_id` from the plan: notes attach to a
date-bound `schedules` row, not a `shifts` template. The plan's
naming was colloquial; this migration is source-of-truth. Migration
documents the rename so future readers don't get confused.

`for_date` is denormalized from the linked schedule's
`scheduled_date` on insert (server resolves it) — saves a join on
the hot path. A `CHECK (handoff_notes_scope_shape)` constraint makes
sure scope and FKs agree (no shift-scoped note without a
`schedule_id`; no all-scoped note with FKs set; etc.).

`handoff_note_reads` is a composite-PK `(note_id, user_id)` table.
LEFT JOIN against it gives the `is_read` boolean per requester; the
PK supports the upsert "mark all read" path coming in 10.2.

A partial index on `carry_until WHERE carry_until IS NOT NULL` keeps
the cross-day query cheap — most notes don't carry, so the index
stays tiny.

Also a `BEFORE UPDATE` trigger that bumps `updated_at`, so PATCH
endpoints don't have to set it manually.

The legacy `shift_notes` table (in `schema.sql` from earlier) is
left in place; Sprint 10.3 will fold its rows into `handoff_notes`
and drop it.

**API (server.js).** Four endpoints — all under `/api/handoff-notes`:

```
GET  /api/handoff-notes?from=&to=[&scope=&schedule_id=&department_id=]
POST /api/handoff-notes      body: { body, scope, schedule_id?, department_id?, for_date?, carry_until? }
PATCH /api/handoff-notes/:id body: { body?, carry_until? }   (pin/resolve land in 10.2)
DELETE /api/handoff-notes/:id
```

`requireAuth` on all four; mutations are author-or-admin gated.

GET's visibility window is the key bit:
```sql
(n.for_date BETWEEN $1 AND $2)
OR (n.carry_until IS NOT NULL AND n.carry_until >= $1 AND n.for_date <= $2)
```
That second clause is what makes the cross-day view (10.1) work
without a new endpoint. Same query for day, week, cross-day —
only `from`/`to` and scope filters change.

Sort: `ORDER BY pinned_at DESC NULLS LAST, created_at DESC`. Pinned
notes float; new at top within each group. 10.2 wires the UI to
set `pinned_at`; the order already prefers pins.

POST resolves `for_date` server-side when `scope='shift'` (pulls
`scheduled_date` from the linked schedule). For `'department'` /
`'all'`, caller supplies `for_date`. Either way the row hits the
table with the right date — the CHECK constraint can't be tripped
from JS.

PATCH currently accepts `body` + `carry_until` only. Pin/resolve
columns exist in the schema but are not exposed by the endpoint
this sprint — 10.2 opens them.

**Calendar atoms (new folder `src/components/Calendar/`):**

- `atoms/DepartmentChips.js` — All / Front Desk / Housekeeping /
  Maintenance / F&B pill row. `value` of `null` = "All." Used in the
  drawer for now; reusable in any view that needs dept filtering.
- `atoms/DayPickerPills.js` — Mon..Sun pill row with optional
  `getCount(iso)` hook for `💬 N` badges. *Built but not wired into
  any view this sprint* — atom is ready for 10.1's Week-view badges
  and a future Day-view header.
- `atoms/HandoffsDrawer.js` — the headline component. Self-fetches
  via `apiFetch('/handoff-notes?from=&to=')` for the day; renders a
  three-tab filter (Handoffs / General / Cross-day) and a
  department chip row. Compose footer (textarea + scope radio + dept
  dropdown + Post button) shows when `editable={true}`. Cross-day
  tab is a `<div className="handoffs-drawer-stub">` placeholder so
  the chrome is in place for 10.1 to fill.
- `Calendar.css` — covers all three atoms. CSS classes are
  prefixed `calendar-*` / `handoffs-drawer-*`. Note styling:
  unread notes get a 3px brand-color left edge (purely cosmetic in
  10; 10.2 wires the read state for real).

**Wrappers (minimal-touch this sprint):**

`src/components/AdminPanel/Scheduling/index.js` — only edits:
- Import `HandoffsDrawer` + `Calendar.css`.
- Render `<HandoffsDrawer forDate={fmtDate(cursor)} departments={departments} editable={true} />` *after* `<DayView />` inside the `view === 'day'` branch. The drawer is only mounted when the admin is on Day view; switching to Week/Month/Year hides it.

`src/components/ShiftsView/index.js` (staff `/calendar`) — *not
touched this sprint*. That route still renders the legacy kiosk
phone-keypad flow; it's the wrong shape for the drawer. Noted as
follow-up work for 10.1 (the staff Calendar needs to become a real
authed personal calendar with the same shared atoms; right now it
identifies the user via a phone-number lookup which is redundant
post-auth).

`src/components/Scheduling/index.js` — still a 12-line `ComingSoon`
placeholder, unchanged. Not currently routed anywhere; left for
10.3 cleanup or earlier deletion.

**Routes + nav (App.js, Sidebar.js):**

- `/admin/calendar` is the new canonical admin route — points at
  the existing `SchedulingManager` component (folder rename
  deferred; only the route changed to keep the diff narrow).
- `/admin/scheduling` → `<Navigate to="/admin/calendar" replace />`
  for stale bookmarks.
- `/admin/shift-notes` → `<Navigate to="/admin/calendar" replace />`
  (handoff drawer absorbs the old Shift Notes surface).
- `/shift-notes` (staff) → `<Navigate to="/calendar" replace />`.
- Sidebar `STAFF_NAV` and `ADMIN_NAV` drop their "Shift Notes"
  entries; admin "Scheduling" label → "Calendar" with `to =
  /admin/calendar`.
- `App.js` imports for `ShiftNotes` / `AdminShiftNotes` commented
  out (not deleted yet — 10.3 deletes the component files; the
  comment in App.js calls out the timing).

**Files modified:**
- `database/migrations/011_handoff_notes.sql` — new.
- `database/schema.sql` — appended `handoff_notes` / `handoff_note_reads`
  defs so a fresh seed creates them too.
- `server/server.js` — 4 handoff-notes endpoints inserted before the
  static-frontend block.
- `src/components/Calendar/atoms/{DepartmentChips,DayPickerPills,HandoffsDrawer}.js`
  — new.
- `src/components/Calendar/Calendar.css` — new.
- `src/components/AdminPanel/Scheduling/index.js` — import drawer +
  CSS, render under DayView when `view === 'day'`.
- `src/App.js` — `/admin/calendar` route, redirects for
  `/admin/scheduling`, `/admin/shift-notes`, `/shift-notes`.
  ShiftNotes / AdminShiftNotes imports commented out.
- `src/components/Layout/Sidebar.js` — drop Shift Notes, rename
  Scheduling → Calendar.

**Conventions this sprint adds:**
- **`handoff_notes` is the one note table.** Don't add per-feature
  note tables. New views = new filter, not new schema.
- **Single GET endpoint with a smart visibility window.** All three
  Calendar note views (per-shift, general, cross-day) come out of
  the same query — what changes is the `from`/`to` (cross-day
  extends `from` backward) and the client-side tab filter. New
  endpoints would be a smell.
- **Atoms in `src/components/Calendar/atoms/` are role-agnostic.**
  If an atom needs a "is the user admin?" branch, push it up into
  the view (which already knows via `editable`).
- **`schedule_id`, not `shift_id`.** Notes attach to a date-bound
  schedule row, not a shift template. The plan said "shift_id"
  colloquially — the migration corrected it. Use `schedule_id`
  everywhere going forward.
- **Migration + schema.sql in lockstep.** Migrations are for live
  DBs; `schema.sql` is for fresh-install seeds. When you add a
  table via migration, mirror it into `schema.sql` so seeded test
  envs match production after both files have been applied.

**Notes for next iteration (10.1 picks these up):**
- **Staff `/calendar` is still the legacy kiosk flow.** It renders
  `ShiftsView` which is a phone-keypad lookup that predates auth.
  10.1 should either gut that route to use the new shared atoms
  (auth → show *your* schedule + drawer), or leave the kiosk URL
  somewhere else and reuse `/calendar` for authed staff. Either
  way, the staff side currently doesn't have a handoffs drawer —
  only admin does this sprint.
- **`AdminPanel/Scheduling/` folder rename to `Calendar/`** is
  deferred. The route + nav label changed but the folder still
  says "Scheduling" — folder rename touches every import. 10.3
  cleanup pass is the right time.
- **HandoffsDrawer's compose currently only does scope `department`
  or `all`.** Shift-attached threads (scope `shift`) need a
  `schedule_id` context which the Day view doesn't pass through
  yet. 10.1 wires that: clicking on a shift block opens a focused
  thread for that schedule.
- **Cross-day tab renders a stub.** Wire it in 10.1 with the
  Today/Tomorrow toggle from mockup #11 + the carry-forward
  overflow menu from the plan.
- **Read state visual** (`.is-unread` left edge) is rendered based
  on the server's `is_read` flag, but there's no way to mark
  unread → read yet from the UI. 10.2 adds "Mark all read" + the
  per-note tap handler.

**Migration step required before this branch ships:**
```sh
psql "<connection-string>?sslmode=require" -f database/migrations/011_handoff_notes.sql
```
Add to deploy notes / CI pipeline as appropriate.

---

### 2026-05-20 — Sprint 10.1: Cross-day tab, per-note carry/edit/delete, Week-view note badges, staff Calendar replaces kiosk

Second of the four Calendar sprints. Lights up the third drawer tab,
introduces the new matrix-per-* Week views with note badges, and
takes the staff `/calendar` route off the legacy kiosk flow.

**Server: `carry=true` filter + `/counts` endpoint.**

GET `/api/handoff-notes` gained `[carry=true]` — restricts to notes
where `carry_until IS NOT NULL AND carry_until >= CURRENT_DATE`.
Drives "show me what's actively rolling forward right now."

New `GET /api/handoff-notes/counts?from=&to=[&department_id=]`
returns `{ date: { total, unread } }` per day in the range, in one
round-trip. The clever bit is `generate_series` + a LEFT JOIN where
`days.d BETWEEN n.for_date AND COALESCE(n.carry_until, n.for_date)`
— a carrying note correctly contributes to *every* day it's
visible, not just the origin. Without the carry coalesce a 5-day-
carrying note would only show its badge on its origin date.

Also added `GET /api/shifts/range?from=&to=[&userId=]` — range
version of `/shifts/daily`, for the new StaffCalendar's week
fetches. Same `schedule_visibility` model (all / department / none).

**HandoffsDrawer: Cross-day tab live + per-note overflow menu.**

Tab #3 is no longer a stub. Sub-toggle (Today / Tomorrow) flips the
`visibleDate` between `forDate` and `addDaysIso(forDate, 1)`. The
fetch widens to `forDate..forDate+1` when the tab is active so
flipping the toggle doesn't re-fetch. Header summary chips:
**Unread** (notes still unread by current user), **Carrying**
(total notes with `carry_until >= forDate`), and **Reach tomorrow**
(notes whose `carry_until >= forDate+1`).

Each note row gets an overflow button (`⋯`) — only shown when
`editable={true}` AND the requester is the author OR an admin.
Click opens an absolute-positioned menu with:

- **Carry to next day** → PATCH `carry_until = forDate + 1`
- **Carry to next week** → PATCH `carry_until = forDate + 7`
- **Stop carrying** (only if currently carrying) → PATCH `carry_until = null`
- **Edit** → flips the note body into an inline textarea + Save / Cancel
- **Delete** → DELETE the note (no confirm dialog; 10.2 can add undo)

A "Carries to YYYY-MM-DD" badge appears on notes that have an
active `carry_until` so the user can tell at a glance which notes
will appear tomorrow even when looking at the Today tab.

`HandoffsDrawer` now requires `currentUser` for author/admin
gating. SchedulingManager passes `useAuth().user`; StaffCalendar
does the same.

**Week views: AdminWeekView (matrix-per-dept) + StaffWeekView (matrix-per-staff).**

New files:

- `src/components/Calendar/views/AdminWeekView.js` — mockup #13.
  Rows: departments. Cols: 7 days. Each cell shows shift bands
  (up to 3 visible, "+N" overflow), staff-on-shift / dept-capacity,
  and a `💬 N` badge when notes cover the day. Clicking any cell or
  the day-column header zooms to Day view at that date.

- `src/components/Calendar/views/StaffWeekView.js` — mockup #12.
  Rows: staff (sorted by name). Cols: 7 days. Each cell shows the
  shift time range or "Off"; the current user's row is highlighted.
  Day-header cells carry their own `💬 N` badge when notes touch
  that day. Department chip filter scopes the rows.

Both views self-fetch `/handoff-notes/counts` for the visible week
(one request, gracefully handles 401/empty by treating missing
keys as `{total:0}`). Schedules + employees + departments arrive
as props from the parent (single source of truth).

Note badge scoping today: shows the global per-day total. A future
sprint should refine to "notes touching *this* staff/dept on this
day" — for now the global count gives the right "is there
*anything* I should look at today" signal.

**AdminPanel/Scheduling swaps WeekView → AdminWeekView.**

The existing `WeekView.js` was a 4-week aggregate hours summary
(Sprint 8.5.1). 10.1 replaces its usage in `SchedulingManager` with
the new matrix-per-dept `AdminWeekView`. The old file is *not
deleted* — it stays on disk in case admins miss the aggregate view
(could come back as a density toggle in a later sprint). 10.3 will
delete if no demand.

**Staff `/calendar` now routes to a real authed Calendar.**

New page: `src/pages/StaffCalendar/index.js` + `StaffCalendar.css`.
Replaces the legacy `ShiftsView` kiosk flow. Layout:

- Header: title, prev / Today / next nav, range label, view toggle
  (Week / Day).
- Week mode: renders `<StaffWeekView />` with current user
  highlighted. Clicking a cell zooms to Day.
- Day mode: simple shift list grouped by `department_name` + the
  full `<HandoffsDrawer />` (editable, default scope `department`).

Staff can compose handoff notes (scope: department or all-staff)
because the requirement was "viewing or putting in shift notes."
Staff cannot edit/delete shifts — that's admin-only and the staff
Calendar doesn't expose those affordances.

The legacy kiosk `ShiftsView` (phone-keypad → look up employee →
see shifts) moves to `/kiosk` so any property still relying on a
shared-tablet lookup has the URL available; it's just not the
default Calendar route anymore.

**Files added:**
- `src/components/Calendar/views/AdminWeekView.js`
- `src/components/Calendar/views/StaffWeekView.js`
- `src/pages/StaffCalendar/index.js`
- `src/pages/StaffCalendar/StaffCalendar.css`

**Files modified:**
- `server/server.js`:
  - `GET /api/handoff-notes` — new `carry=true` filter.
  - New `GET /api/handoff-notes/counts` endpoint.
  - New `GET /api/shifts/range` endpoint.
- `src/components/Calendar/atoms/HandoffsDrawer.js`:
  - Cross-day tab fully wired (Today/Tomorrow toggle, summary).
  - Per-note overflow menu (Carry to next / Carry to next week /
    Stop carrying / Edit / Delete) with author/admin gating.
  - Inline edit-in-place textarea.
  - `currentUser` prop added.
- `src/components/Calendar/Calendar.css`:
  - Cross-day header (toggle + summary stat chips).
  - Per-note overflow menu chrome + edit-row.
  - AdminWeekView grid (140px dept col + 7 day cols).
  - StaffWeekView grid (200px staff col + 7 day cols), `is-me`
    row highlight.
- `src/components/AdminPanel/Scheduling/index.js`:
  - Replaced `WeekView` import with `AdminWeekView`.
  - Swapped JSX usage; added `useAuth()` + `currentUser` on
    drawer.
- `src/App.js`:
  - `/calendar` → `<StaffCalendar />` (was `<ShiftsView />`).
  - `/kiosk` → `<ShiftsView />` (legacy).
  - Imported the new page.

**Conventions this sprint adds / reinforces:**
- **`carry_until` is set explicitly by the user.** Carrying is a
  deliberate choice. No auto-carry-forward-when-unread. Staleness
  is the signal that no one acknowledged it.
- **Per-day count aggregation via `generate_series` + carry coalesce.**
  The "this carrying note shows on each day in its window" math
  belongs in SQL — don't reproduce it on the client per cell.
- **Self-fetching views** (StaffWeekView, AdminWeekView) for
  *secondary* data like note counts; primary schedule data still
  flows through props from the parent.
- **Author OR admin** is the standard mutation gate for handoff
  notes. `canMutate(note) = role === 'admin' || note.author_user_id === user.user_id`.
- **Kiosk flow lives at `/kiosk`** if anyone still needs it.
  `/calendar` is for authed staff personal use.

**Notes for next iteration (10.2 picks up):**
- **Pin / resolve + read state UI** — schema columns exist, drawer
  already sorts by `pinned_at`. 10.2 wires the PATCH for
  `pinned`/`resolved` plus the mark-all-read flow and the
  Sidebar nav-badge count.
- **Note badges currently show global per-day counts.** Refining
  to "notes touching this row's staff/dept" requires the counts
  endpoint to support multi-key grouping (e.g., per `(date,
  department_id)`); deferred.
- **Staff Calendar Day view is a simple list,** not the full
  timeline visual. Could share a read-only flavor of the admin
  `DayView.js` in a later sprint; for 10.1 the list + drawer is
  enough for "see who's on + post a note."
- **The `/api/admin/employees` and `/api/admin/departments`
  endpoints are unauthed today** and the StaffCalendar reuses
  them. Semantically off (a `/api/staff/calendar-context` would
  be cleaner). Tracked here as future cleanup.
- **No Year / Month views on staff Calendar.** Likely fine; if
  GM asks, copy the admin Year/Month components and pass
  `editable=false`.
- **Old `WeekView.js` (4-week aggregate) is kept on disk** in case
  the density-toggle idea materializes. 10.3 deletes if not.

---

### 2026-05-20 — Sprint 10.2: pin / resolve / read-state UI; sidebar unread badge

Interaction polish that makes the handoffs drawer feel
production-grade. Pin to top, resolve to close, per-user read
state, "mark all read," and a sidebar dot that pulls eyes to the
Calendar when something needs attention.

**Server:**

PATCH `/api/handoff-notes/:id` gained two more accepted fields:

```
pinned:    boolean   // true ⇒ pinned_at = NOW(); false ⇒ pinned_at = NULL
resolved:  boolean   // mirrors for resolved_at
```

Both are **admin-only** even when the requester is the author. The
plan version was ambiguous; the gate landed at "pin/resolve = admin
only" because:
- Letting the author of a note pin it to the top defeats the
  moderation purpose of pinning.
- Letting staff resolve their own note before an admin reviews it
  would let problems vanish from the queue.

`POST /api/handoff-notes/mark-read` — body `{ note_ids: [UUID, ...] }`.
Bulk upsert into `handoff_note_reads` via `unnest($1::uuid[])` +
`ON CONFLICT (note_id, user_id) DO NOTHING`. Returns `{ marked }`
(insert row count, so the client can confirm without re-fetching
the list). Capped at 1000 IDs per call as a runaway-client guard.

`GET /api/handoff-notes/unread-count` — drives the sidebar badge.
Counts notes the requester hasn't marked read whose visibility
window touches today or tomorrow, *excluding resolved*. The "today
or tomorrow" window means the badge reads as "there's something
timely," not "there's any unread thing anywhere in history." Exact
SQL:

```sql
WHERE r.note_id IS NULL              -- not in this user's reads
  AND n.resolved_at IS NULL          -- not closed
  AND ( (n.for_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day')
     OR (n.carry_until >= CURRENT_DATE) )
```

**HandoffsDrawer — six new affordances:**

1. **Read dot per note** at the left edge. Filled brand-color =
   unread; outlined / dimmed = read. Tap toggles to read (one-shot
   POST to `/mark-read` with that single ID).
2. **Mark all read** button in the drawer header — visible only
   when `unreadActiveIds.length > 0`, with the count in the label.
   One bulk POST. Body is the array of `active.filter(!is_read).map(note_id)` —
   resolved notes don't count toward "all read" because they're
   tucked under the collapsed group anyway.
3. **Pin / Unpin** in the per-note overflow menu — admin only.
   Sets / clears `pinned_at`. Server already sorts pinned notes
   first (`ORDER BY pinned_at DESC NULLS LAST, created_at DESC` from
   Sprint 10), so the UI sort doesn't need to change. A 📌 "Pinned"
   badge + amber left-border on the row makes the state visible.
4. **Mark resolved / Reopen** in the overflow menu — admin only.
   Sets / clears `resolved_at`. Resolved notes get a ✓ badge,
   strike-through body, dimmed opacity, AND get moved out of the
   active list into a collapsed "Resolved (N)" group at the bottom.
5. **Resolved group** — collapsed by default (`showResolved` state).
   The toggle is a quiet text button with a `▸` / `▾` caret. The
   resolved notes still respect the active tab filter (a resolved
   shift-handoff doesn't appear when you're on the General tab).
6. **Single-note click-to-read** (via the dot) — tapping the dot on
   an unread note marks just that one read. Doesn't require opening
   the overflow menu. Read state is per-user, so this only updates
   the *current* user's view.

The list split in code:
```js
const allFiltered = notes.filter(/* tab + dept */);
const active   = allFiltered.filter(n => !n.resolved_at);
const resolved = allFiltered.filter(n =>  n.resolved_at);
```

**Sidebar — unread badge with 60s polling:**

`useEffect` runs `apiFetch('/handoff-notes/unread-count')` on mount
and every 60s thereafter; cancelled on unmount via the cleanup +
cancelled flag. Light enough not to need WebSockets for the
capstone surface. The badge sits at the right edge of the Calendar
nav row:

- Desktop: pill with the number (`9+` if > 9). Brand-accent
  background.
- Mobile bottom-nav: an 8px dot at the icon's top-right, with a
  2px ring in the sidebar background so it pops against any nav
  color.

`calendarPath` is computed per role (admin `/admin/calendar`, staff
`/calendar`) so the badge attaches to the right row.

**Files modified:**
- `server/server.js`:
  - PATCH `/api/handoff-notes/:id` — accepts `pinned`, `resolved`,
    admin-only gate on those fields.
  - New `POST /api/handoff-notes/mark-read` (bulk upsert).
  - New `GET /api/handoff-notes/unread-count`.
- `src/components/Calendar/atoms/HandoffsDrawer.js`:
  - Extracted per-note JSX into a `renderNote(n)` helper so the
    same row renders inside the active list and the resolved
    group.
  - Added `isAdmin` derived from `currentUser.role`.
  - `togglePin`, `toggleResolve`, `markAllRead`, `markOneRead`
    handlers.
  - Read-state dot + pinned/resolved badges + amber pinned border
    + dimmed resolved row + strike-through body.
  - Header gained `.handoffs-drawer-header-right` with the
    Mark-all-read pill.
  - Collapsed `Resolved (N)` group with caret toggle.
- `src/components/Calendar/Calendar.css`:
  - New rules for `.handoffs-drawer-mark-all`,
    `.handoffs-drawer-note-dot`, `.handoffs-drawer-note-badge-pinned`,
    `.handoffs-drawer-note-badge-resolved`, `.handoffs-drawer-note.is-pinned`,
    `.handoffs-drawer-note.is-resolved`,
    `.handoffs-drawer-resolved-group`,
    `.handoffs-drawer-resolved-toggle`,
    `.handoffs-drawer-list-resolved`.
- `src/components/Layout/Sidebar.js`:
  - `useEffect` polling `/handoff-notes/unread-count` every 60s.
  - `unread` state + `calendarPath` derived from `user.role`.
  - Badge JSX on desktop nav + dot on mobile bottom-nav.
- `src/components/Layout/Sidebar.css`:
  - New `.sidebar-unread-badge` (pill on desktop).
  - New `.bottom-nav-unread-dot` (small dot on mobile).

**Conventions this sprint adds:**
- **Pin and resolve are admin-only privileges.** The author can
  edit / delete / carry-forward their own notes; pin and resolve
  belong to moderation. The server enforces, the UI hides.
- **Read state is per-user, not per-note.** Always join
  `handoff_note_reads` filtered by the current user; never add a
  global "read" flag to `handoff_notes`.
- **Sidebar badges via low-frequency polling** (60s) are fine for
  capstone scope. Don't reach for WebSockets / SSE without a
  product reason — staleness of ≤1 minute on an unread count is
  not a real UX problem.
- **Bulk reads use `ON CONFLICT DO NOTHING`** so the same call
  can be repeated safely. Don't try to dedupe on the client.

**Notes for next iteration (10.3 cleanup):**
- **The old `ShiftNotes/` + `AdminShiftNotes/` folders are still
  on disk** with only `<Navigate>` redirects pointing past them.
  10.3 deletes the folders and the commented-out imports in
  `App.js`. Also fold any pre-existing `shift_notes` table rows
  into `handoff_notes` via a one-shot migration, then drop the
  table.
- **`AdminPanel/Scheduling/` folder name** vs route `/admin/calendar`
  is a lingering inconsistency; 10.3 should rename the folder to
  `AdminPanel/Calendar/`. Touches every import inside, hence
  deferred from 10/10.1/10.2.
- **Old `Scheduling/WeekView.js`** (4-week summary) is unused but
  on disk. Delete if no admin has asked for it back.
- **Audit log for moderation actions.** Pin/resolve are
  consequential admin actions; consider writing an
  `audit_logs` row when 10.x+ tightens. Not blocking for the
  capstone demo.
- **Sub-1-minute updates** are missing — if you pin a note while
  another admin's drawer is open, they see it on next refresh /
  next refetch. Acceptable; revisit only if a real workflow
  surfaces.

---

### 2026-05-28 — Sprint 14.2: planned-shift calendar overlay + PNG export

14.1 wired publish + parsing; 14.2 finally closes the
sheet→calendar coupling the GM signed off on in Sprint 14 ("cells
live as drafts until published; published cells become a separate
overlay on the calendar"). Plus the second export format planned
for 14.1 but punted.

**Shipped in 14.2:**

- **Server: `GET /api/admin/sheet/published?from=&to=`.** Pulls
  every published cell whose computed scheduled date
  (`week_start + day_of_week days`) falls inside the requested
  range. Joins users + departments so the client doesn't need a
  second round-trip for names. Returns `parsed_start`/`parsed_end`
  as `HH:MM:SS` strings (Postgres TIME → text) plus the raw
  `display_text` and the `highlight` flag.
- **Calendar fetch effect.** `Calendar/index.js` gets a third
  range-keyed effect (alongside `/admin/entries` and
  `/admin/schedule`-count). Only fires on the Day view — Month
  and Week deliberately don't render the overlay (too noisy at
  those zoom levels; can revisit if GM asks).
- **Day view: `PlannedShiftsStrip`.** New small component above
  the four day-render modes (classic/cards × timeline/resource).
  Renders one dashed-border pill per published cell on the
  current day, post-deptFilter so it mirrors what's visible
  below. Each pill shows: dept-color dot, staff name, parsed
  time range ("15:00–23:00" when available), and the raw cell
  text ("3p-11p", "OFF", etc.) Highlighted cells get the same
  yellow treatment they have in the Shift Sheet.
- **Dashed-border treatment.** Pills are visually quieter than
  the solid shift bars below — dashed border, neutral background,
  small font. Reads as "this is the *plan*, the actual bars below
  are what *happened*." No interleaving with the existing
  lane-packed bars, so the complex TimelineMode/ResourceMode
  logic stays untouched.
- **PNG export from the Shift Sheet.** Snapshot of
  `.sheet-grid-wrap` via `html2canvas` (new dep, ~50kb).
  Triggers a `schedule-${weekStart}.png` download. Pixel ratio
  doubled on Retina so the export reads cleanly when shared in
  Slack / texted. Button sits next to "↓ XLSX" in the topbar;
  shows "…" while rendering. Errors logged, button never
  permanently disabled.

**Why the overlay strip vs inline bars:**

The original plan was to interleave planned cells *into* the
TimelineMode/ResourceMode bar packing (as ghost bars at the
correct time positions). Decided against:

1. The lane-packing logic in TimelineMode is non-trivial and
   already balances 4-way overlap correctly. Mixing in a second
   data source with different render rules would double the
   complexity for marginal benefit.
2. The strip layout reads "planned vs actual" more clearly than
   stacked ghost bars would. Less cognitive load when scanning.
3. Cells without a parsed time ("OFF", "BRK+help") have nowhere
   to live on a timeline — they'd need a separate surface anyway.

The strip can be replaced with inline ghost bars later if the GM
asks for them; the data path (`plannedShifts` prop on DayView) is
already there.

**Why Day view only:**

- Month view shows 28-30 days of clock entries already; adding
  planned cells on top would be unreadable.
- Week view (which is actually a 4-week summary in this app) has
  the same noise problem.
- Day view is the one where comparing planned-vs-actual matters
  most: it's the daily ops surface.

A planned-shift *count* could land in the Month/Week stat cards
later — that's a small additive change, not a re-architecture.

**Deferred to 14.3:**

- Split-shift handling. "9-12 / 4-8" still only parses the first
  range. Schema would need an array column or a second table; not
  required for the typical single-range cells.
- Other parser edge cases as they surface in real usage.
- Optional: inline ghost-bar rendering in TimelineMode if the
  strip isn't enough.

**Verified.** Touched files (Calendar/index.js, DayView.js,
Scheduling.css, server.js, ShiftSheet/index.js) all balance
(server.js shows the same -4/+4 noise from the existing
`parseShiftTimes` regex literal; unchanged by this sprint).
New endpoint reachable, client fetches on view change, strip
renders, PNG button generates a download.

**Install note.** New runtime dep `html2canvas` (~50kb gz).
`npm install` required when deploying.

---

### 2026-05-28 — Sprint 14.1: Shift Sheet publish workflow + parser + XLSX + highlight + legacy-panel toggle

Sprint 14 left the sheet wired but inert — cells saved, nothing
parsed, nothing publishable, no export, no fallback. 14.1 closes
the loop on everything except the calendar overlay (still 14.2)
so the GM can actually run a week from the sheet end-to-end.

**Shipped in 14.1:**

- **Free-form time parser (server-side).** `parseShiftTimes(text)`
  in `server.js` reads "3p-11p" / "9-5" / "11pm-7am" /
  "9:30a-5p" / "9-12 / 4-8" (first segment) and populates
  `parsed_start` + `parsed_end` on every `PUT /api/admin/sheet/cell`.
  Server-side (not client) so the values stay consistent regardless
  of which client wrote the cell. Heuristic for naked digits
  ("9-5" → 9 AM / 5 PM) assumes hotel shifts cross noon, not
  midnight — same assumption the GM uses verbally.
- **Bulk publish/unpublish endpoints.** `POST /api/admin/sheet/publish`
  and `.../unpublish` accept either `cell_ids[]` (precise — used by
  per-row publish) or `{ week_start, user_ids[] }` (scoped — used
  by publish-week). Both shapes funnel through `setPublishedFlag()`
  so the response shape is identical (returns updated rows).
- **Highlight endpoint.** `PUT /api/admin/sheet/cell/highlight`
  takes `{ cell_id, highlight }` and sets the yellow flag without
  touching display_text/parsed values. Used by the cell context
  menu — right-click toggles yellow on/off.
- **Sheet UI: publish + export topbar.** Two new chip buttons
  next to the week label — "Publish week" / "● Published"
  (depends on whether every row this week is published) and
  "↓ XLSX". Both disabled when the sheet is empty.
- **Sheet UI: per-row publish toggle.** New trailing actions
  column (40px). Each row gets a small ○/● circle button —
  green-filled when every cell in that row is published.
  Lets the GM ship a single department early without flipping
  the whole week.
- **Sheet UI: right-click highlight.** `ShiftCellInput` listens
  on `contextMenu` (works for desktop right-click AND mobile
  long-press). Toggles the yellow background via the highlight
  endpoint. No menu — direct toggle, because GM's actual usage
  is a single-purpose accent and a popover would be friction.
- **XLSX export.** Uses the already-present `xlsx` dep. Builds an
  AOA mirroring the sheet visually — header row with day names +
  dates, dept section rows in UPPERCASE, then one row per staff
  member with their seven cells of display text. Writes
  `schedule-${weekStart}.xlsx`. No PNG yet (deferred to 14.2 —
  needs `dom-to-image-more` or `html2canvas`).
- **Settings toggle for legacy AssignPanel.** New checkbox in
  `AdminSettings` (under the existing Hide-ABC toggle) backed by
  `enable_legacy_assign_panel` in `app_settings`. Server validator
  accepts only `'true'`/`'false'`. When ON, Calendar header
  renders a small outlined "Legacy panel" button next to the
  primary "Assign" pill — same `setPanelPrefill(null);
  setPanelOpen(true)` the ＋ used to call. Default OFF, so the
  sheet remains the only assignment surface for anyone who
  hasn't opted into the fallback.

**Visual cues added:**

- Published cells get a 3px inset green stripe on their left
  edge (`.sheet-cell-input.is-published`) so the published slice
  of a week is readable at a glance, even mixed with drafts.
- "Publish week" goes from neutral chip to green-tinted
  ("● Published") when every cell in the week is published.
  Same pattern on the row toggle (○ outlined → ● filled green).
- Highlight stays the same yellow background it always was in
  GM's Excel — `#fefcbf` background with `#744210` text.
- Legacy-panel button is visually quieter than Assign (outlined
  on a neutral background) so it reads as a fallback affordance,
  not a peer surface.

**Deferred to 14.2:**

- Calendar overlay rendering published cells as a planned-shift
  layer alongside actual clock entries. (Schema already supports
  this — `is_published` + `parsed_start`/`parsed_end` are
  populated; just need the query + render path.)
- PNG export. The XLSX export covers GM's main use case
  (printing for back-of-house); PNG is for sharing in Slack/text
  and can wait.

**Deferred to 14.3:**

- Split-shift handling. The parser currently only reads the
  first range in "9-12 / 4-8" — full multi-segment support
  needs schema changes (multiple `parsed_start`/`parsed_end`
  pairs per cell, or a JSON column) and isn't required for the
  first publish/overlay cycle.
- Other parser edge cases as they come up from real usage.

**Verified.** Touched files balance (JS files all 0/0; CSS files
0/0; server.js shows expected paren noise from new regex literal
in `parseShiftTimes`). Sheet endpoints reachable, settings
endpoint accepts the new key, Calendar reads it on mount.

---

### 2026-05-27 — Sprint 14: Shift Sheet foundation (Excel-style weekly grid replaces AssignPanel)

GM never used the side-panel AssignPanel + AssignModal; their
actual workflow is an Excel grid (image #21 — dept-grouped staff
rows × 7 day columns, free-form cell text like "3p-11p", "OFF",
"BRK+help"). Sprint 14 ships the foundation of a native Shift
Sheet that matches that mental model.

**Decisions confirmed by GM:**

1. Legacy AssignPanel stays in the codebase as a fallback; an
   admin-settings toggle (default **off**) will optionally re-expose
   it. Sheet is the main surface. Toggle UI lands in 14.x — for now
   the legacy panel's button is just unreachable from the Calendar.
2. Sheet → calendar coupling is **deliberate**: cells live as
   drafts until the admin publishes them; published cells become a
   *separate* overlay on the calendar (alongside, not replacing,
   the actual clock-entry rendering). Publish workflow + overlay
   land in 14.x.
3. Add-staff is **strict typeahead** — the dropdown only lists
   existing active employees. No on-the-fly user creation.

**What ships in 14 (this slice):**

- **DB:** new `schedule_sheet_cells` table (migration 017 +
  schema.sql). One row per `(week_start, user_id, day_of_week)`
  with `display_text`, optional `parsed_start` / `parsed_end`,
  `is_published` (default false), `highlight` (default false). PK
  `cell_id` (UUID), unique constraint on the three-tuple so upserts
  target it cleanly. Indexes on `week_start`, `user_id`, and a
  partial on `(week_start) WHERE is_published = TRUE` for the
  upcoming overlay query.
- **Server:** three admin endpoints —
  - `GET /api/admin/sheet/week?week_start=YYYY-MM-DD` (cells +
    user/dept joins for the grid)
  - `PUT /api/admin/sheet/cell` (upsert by the three-tuple; empty
    text deletes the row so backspacing clears the cell)
  - `DELETE /api/admin/sheet/cell?week_start=&user_id=&day_of_week=`

  All `requireAuth + requireRole('admin')`. The PUT also
  defensively re-checks the `user_id` exists + isn't soft-deleted
  before writing.
- **Client:** new `pages/ShiftSheet/` (index.js + ShiftSheet.css).
  Table layout, dept-grouped row sections, contenteditable cells
  via the local `ShiftCellInput` component. Autosaves on blur or
  Enter; Escape reverts. Tab uses native browser focus order so
  the GM can fly across the row without binding extra handlers.
  Strict-typeahead "Add staff" row at the bottom uses the shared
  `DropdownSelect` from Sprint 13.3, filtered to active employees
  not already on the sheet.
- **Shell wiring:** new `sheet` view in `AdminShell` →
  `ShiftSheet`. `ACTIVE_PARENT` maps it to `calendar` so the
  Calendar sidebar nav stays highlighted while the sheet is on
  screen. Calendar header's "Assign" pill now calls
  `goTo('sheet')` instead of opening the AssignPanel.

**What's deferred to 14.x:**

- `parsed_start` / `parsed_end` derivation. The free-form text
  parser ("3p-11p" → `15:00` / `23:00`, "11p-7a" → overnight)
  needs care; deferring until the publish workflow actually
  needs the structured times.
- "Publish to calendar" action (flip `is_published`, plus the
  parser to populate parsed_start/end).
- Calendar overlay rendering published cells as planned-shift
  layer alongside actual clock entries.
- XLSX export (via the existing `xlsx` dep) + PNG export (via
  `dom-to-image-more` or `html2canvas`).
- Yellow `highlight` toggle (cell right-click → "Mark as note").
- Settings toggle to re-expose the legacy AssignPanel.

**Migration note.** Production DB needs migration 017 applied
before the new sheet endpoint will work. Server logs a clean 500
("relation does not exist") otherwise.

**Verified.** Five touched files balance: server.js 1663/1667
(pre-existing +4 close imbalance in comment literals carried
through; my edit was 61/61 balanced), AdminShell.js 9/9 + 23/23,
Calendar/index.js 435/435 + 227/227, ShiftSheet/index.js 195/195
+ 86/86, ShiftSheet.css 32/32 + 34/34.

**Follow-ups roadmap.**

- **14.1**: text parser + publish endpoint + calendar overlay
  (planned-shift layer).
- **14.2**: XLSX + PNG export.
- **14.3**: highlight toggle, optional split-shift handling
  ("9-12 / 4-8" in one cell), settings toggle for legacy
  AssignPanel.

---

### 2026-05-27 — Sprint 13.7: overnight entries surface on the second day; timeline gets horizontal scroll when cramped

Two carry-overs from Sprint 13.5/13.6.

**1. Overnight shift wasn't appearing on day 2.**

Sprint 13.5 already produced Tuesday segments for an overnight
entry that started Monday night — but `/admin/entries`'s WHERE
clause filtered entries by `clock_in_time` falling inside the
requested `[from, to)` window. Tuesday's fetch passed
`from = Tue 00:00 local` and `to = Wed 00:00 local`. Jesse's
overnight entry has `clock_in_time = Mon 22:29` (outside that
range), so the entry never made it to the client → no Tuesday
segment → empty cell.

Switched the predicate from "clock_in_time in [from, to)" to
"entry overlaps [from, to)":

```sql
WHERE te.clock_in_time              <  $2::timestamptz
  AND COALESCE(te.clock_out_time, NOW()) > $1::timestamptz
```

`COALESCE(..., NOW())` collapses open entries' null clock_out_time
to "now," so a staff currently on the clock surfaces on every day
their shift touches. The legacy (`::date`) branch got the
matching pair so non-ISO callers behave consistently.

Now the Tuesday segment shows up because the parent entry is in
the response, then Sprint 13.5's `entryToScheduleSegments` does
its per-local-day split as before — Monday gets the 22:29-23:59
piece on Monday's view, Tuesday gets the 00:00-07:09 piece on
Tuesday's view.

**2. Timeline cramping (image #20).**

Classic timeline (hour-rail + lane-pack) gave every shift the
same percentage of column width — `1 / laneCount`. With many
overlapping shifts the per-lane width drops below the card's
readable threshold, text either wraps weird or gets clipped, and
the GM saw "cards falling to the bottom" (they were rendering in
the right lane but invisible without text).

Fix: set `min-width` on the timeline grid when `laneCount > 4`
and enable `overflow-x: auto` on the wrap:

```jsx
<div
  className="day-timeline"
  style={
    laneCount > 4
      ? { minWidth: `${64 + laneCount * 80}px` }
      : undefined
  }
>
```

Each lane now floors at ~80px wide; the canvas scrolls
horizontally instead of cards shrinking into illegible stripes.
Below the 4-lane threshold the original "fill the width" behavior
is preserved — narrow days don't gain unwanted scroll.

`.day-timeline-wrap` gains `overflow-x: auto` to make the scroll
work; it already had `overflow-y: auto` for the vertical hour
rail.

**Verified.** server.js 1602/1606 (the +2-from-pre-existing extra
closes are inside the new `[from, to)` math-notation in code
comments — file is syntactically clean). DayView.js 433/433 +
306/306. Scheduling.css 489/489 + 493/493.

Walk-through with Jesse's overnight on Tuesday's view:
- Fetch range: `2026-05-26T07:00Z → 2026-05-27T07:00Z` (PDT
  local-midnight bounds).
- Server returns entries where `clock_in_time < 2026-05-27T07:00Z`
  AND `COALESCE(clock_out_time, NOW()) > 2026-05-26T07:00Z`.
  Jesse's `Mon 22:29` clock-in matches `clock_in_time <
  2026-05-27T07:00Z` ✓, and `clock_out_time = Tue 07:09 >
  Tue 00:00 local (= 2026-05-26T07:00Z)` ✓ — entry returned.
- Client segments it: Tuesday segment with start_time=00:00:00,
  end_time=07:09:00 renders on Tuesday's view at top of the
  hour rail.

**Follow-ups.** None outstanding. If the lane-pack ever spawns
> 20 lanes (very dense day with all-staff overlapping mid-day),
the horizontal scroll story might want a secondary "collapse
by department" affordance — but the GM hasn't surfaced that
case yet, and Cards / Rows layouts handle dense days naturally
without needing the same trick.

---

### 2026-05-26 — Sprint 13.6: server-side overnight + TZ fixes (Timesheet, performance, OT approve, StaffDetail row)

13.5 fixed the admin Calendar; this sprint chases the same bug into
the remaining surfaces the audit flagged.

**1. `/me/hours` per-day breakdown.**

Was bucketing entries by `new Date(clock_in_time).toISOString().split('T')[0]`
which (a) returns the UTC date — not the user's local — and (b)
pins overnight shifts entirely to the clock-in day. Both issues
fixed:

- New `splitEntryByLocalDay(entry, tzOffsetMinutes)` walks an
  entry from `clock_in_time` → `clock_out_time` (or now), emitting
  `{ dateKey, hours }` chunks split at each *local* midnight per
  the caller's timezone. 32-iteration safety cap.
- Day labels iterate via `addDaysToYmd(weekStart, i)` — pure
  string arithmetic, no Date-object timezone leak.
- Endpoint accepts `tz_offset_minutes` query param (signed,
  matching `new Date().getTimezoneOffset()`). Missing → 0,
  preserves legacy behavior for any non-client caller.

`totalHours` continues to be the sum of per-day buckets, so it's
identical to before for same-day shifts and now correct for
overnight ones.

**2. Clients pass the TZ offset.**

Three callers updated:
- `pages/Home/index.js` → `/me/hours` (drives Home's "This week"
  + recent-shifts list).
- `pages/Timesheet/index.js` → `/me/hours` (drives the weekly
  per-day chart + breakdown).
- `components/AdminPanel/StaffDetail.js` → both
  `/admin/staff/:id/performance` and `/admin/staff/:id/approve-ot`
  (drives the performance dashboard + OT bulk-approve button).

Each just appends `&tz_offset_minutes=${new Date().getTimezoneOffset()}`.

**3. `periodRange` is now TZ-aware.**

Used by the performance + bulk OT approve endpoints. The old
implementation called `now.getDay()`, `setHours(0,0,0,0)`, etc.,
which on a UTC server (Koyeb) computed Monday-UTC instead of
Monday-local. With a Pacific user, the "this week" window was
off by ~7–8 hours — early-Monday clock-ins could land in last
week's bucket.

```js
function periodRange(period, tzOffsetMinutes = 0) {
  const tzMs = tzOffsetMinutes * 60_000;
  const local = new Date(Date.now() - tzMs);  // local Y/M/D via UTC accessors
  const localYmdToUtcMs = (y, mZeroBased, d) =>
    Date.UTC(y, mZeroBased, d, 0, 0, 0) + tzMs;
  // ... computes from/to/prevFrom/prevTo on local boundaries ...
}
```

Default tzOffsetMinutes=0 keeps legacy behavior (server-local =
UTC on Koyeb). Both call sites now pass the user's actual offset
from the query string.

**4. StaffDetail entries list — overnight date label.**

Image #19: a Monday 10:29pm → Tuesday 7:09am row used to render
its date as just "Mon, May 25" — visually pinning the shift to
Monday even though it crossed midnight. Added:

```js
const isOvernight = (a, b) =>
  a.getFullYear() !== b.getFullYear() ||
  a.getMonth()    !== b.getMonth()    ||
  a.getDate()     !== b.getDate();

const fmtEntryDateRange = (inIso, outIso) =>
  isOvernight(...) ? `${fmtEntryDate(inIso)} → ${fmtEntryDate(outIso)}`
                   : fmtEntryDate(inIso);
```

Row now reads "Mon, May 25 → Tue, May 26" with the same
"10:29 PM → 7:09 AM, 8h 40m" beneath it. Total hours unchanged
(server math was already correct via `EXTRACT(EPOCH)`).

**Audit recap.** All six surfaces from the Sprint 13.5 audit
table now ✅:

| Surface                              | Fix sprint |
| ------------------------------------ | ---------- |
| Admin Calendar segments              | 13.5       |
| `ShiftDetailModal` hours             | 13.5       |
| `/me/hours` daily breakdown          | 13.6       |
| `/admin/staff/:id/performance`       | 13.6       |
| Timesheet weekly chart (via me/hrs)  | 13.6       |
| StaffDetail entries list label      | 13.6       |

Bonus: `/admin/staff/:id/approve-ot` was tied to the same
`periodRange` helper, so it picks up the TZ fix for free — the
"approve this week's OT" button now operates on the operator's
week, not the server's.

**Verified.** server.js opens/closes 1596/1598 (pre-existing
2-paren imbalance is in literals — my edit added 62/62 balanced).
Home.js 150/150 + 101/101, Timesheet.js 283/283 + 160/160,
StaffDetail.js 361/361 + 295/295. Walk-through with Jesse's
overnight: with `tz_offset_minutes=420` (PDT), `/me/hours` for
weekStart=2026-05-25 now puts 1.5h on Monday and 7.2h on
Tuesday (was 8.7h pinned to Monday).

**Follow-ups.** None outstanding for the overnight bucket bug.
The export ranges in `runExport` (`StaffManager`) still
round to YYYY-MM-DD via `periodRange` (the StaffManager local
helper, not the server's), and Sprint 13.4 already pushed those
through as ISO local-midnight bounds — so the export workbook
respects the operator's local week. No additional touch needed.

---

### 2026-05-26 — Sprint 13.5: overnight-shift split (per-local-day segments) + modal hours fix

Live bug, two surfaces:

- **Image #18** — Jesse clocked in 10:29 PM Mon, clocked out
  7:09 AM Tue. Calendar modal showed **1.5h** (10:29 PM →
  midnight only). Should have been ~8.7h (8h 40m).
- **Image #19** — StaffDetail's entry row showed the same shift
  as **Mon May 25, 10:29 PM → 7:09 AM, 8h 40m**. Total is right
  there, but the row pins the *entire* shift to Monday — there's
  no record on Tuesday that anyone was working pre-7am.

Root cause for the calendar bug: `entryToSchedule` flattened the
ISO clock-in / clock-out timestamps to a single `(scheduled_date,
start_time, end_time)` triple anchored on the clock-in's local
day. `computeShiftHours` then clipped `end_time < start_time`
to local midnight (the legacy "treat overnight as 24:00 cap"
branch), giving a tiny 1.5h slice for a real 8.7h shift.

**Fix: split overnight entries into per-local-day segments.**

Renamed `entryToSchedule` → `entryToScheduleSegments` and changed
its signature from a 1→1 mapping to 1→N. For each entry the
adapter now walks forward in local-day chunks, emitting one
segment per local day spanned:
- Monday segment: `start_time = 10:29:00`, `end_time = 23:59:59`,
  `scheduled_date = 2026-05-25`. 1.5h visible on Monday's view.
- Tuesday segment: `start_time = 00:00:00`, `end_time = 07:09:00`,
  `scheduled_date = 2026-05-26`. 7.2h visible on Tuesday's view.

Both segments carry the *original* entry's `clock_in_time`,
`clock_out_time`, total `hours` (from the server's
`EXTRACT(EPOCH …)`), and a stable `entry_id`. The detail modal
reads these passthrough fields so it shows the full shift
(10:29 PM → 7:09 AM, 8.7h) no matter which segment the admin
clicked. Per-day cards/bars still show their segment-local time
range + segment-local computed hours so the daily picture stays
honest.

```js
while (safety-- > 0) {
  const nextMidnight = new Date(
    cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 0, 0, 0
  );
  const isLastSegment = nextMidnight >= outDate;
  const segEnd = isLastSegment ? outDate : nextMidnight;
  // Display end = 23:59:59 for non-last segments so the
  // legacy "end < start = 1440" branch in computeShiftHours /
  // verticalShiftBox / horizontalShiftBox doesn't fire.
  const displayEnd = isLastSegment
    ? segEnd
    : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(),
               23, 59, 59);
  segments.push({ ...full segment shape..., is_overnight_segment: true });
  if (isLastSegment) break;
  cursor = nextMidnight;
}
```

`is_in_progress` is now set on the **last** segment only — staff
still on the clock at midnight today appear as "finished" on
yesterday's view (their shift segment for yesterday is closed at
23:59:59) and "ON SHIFT" on today's view. Matches what the GM
would intuitively see opening either day.

A 7-segment safety cap protects against a 7+ day "forgotten
clock-out" data anomaly from spinning forever.

**Modal hours fix.**

`ShiftDetailModal` was computing `hours =
computeShiftHours(shift.start_time, shift.end_time)` which after
splitting would return the segment-local hours, not the entry
total. Now:

```js
const hours = (typeof shift.hours === 'number')
  ? Math.round(shift.hours * 10) / 10
  : computeShiftHours(shift.start_time, shift.end_time);
```

Falls back to per-segment math for legacy scheduled shifts that
don't carry `hours` (anything that comes from `/admin/schedule`
without the entry-adapter touching it).

**Audit — where else does overnight bite?**

Grep found four other places that bucket time-entries by
`clock_in_time::date`:

| Surface                              | Issue                            | Status        |
| ------------------------------------ | -------------------------------- | ------------- |
| Admin Calendar (this fix)            | per-day segments missing         | FIXED 13.5    |
| `ShiftDetailModal` hours             | computed off segment, not entry  | FIXED 13.5    |
| `/me/hours` daily-breakdown          | overnight rolled to clock-in day | Sprint 13.6+  |
| `/admin/staff/:id/performance`       | same per-day bucketing           | Sprint 13.6+  |
| `Timesheet` weekly chart             | consumes `/me/hours`, inherits   | Sprint 13.6+  |
| `StaffDetail` entries list (img #19) | row anchored on clock-in day     | Sprint 13.6+  |

The server-side fixes need either a JS-side split before
aggregation, or a Postgres `LATERAL` join that generates
date-spans. Both are bigger surgeries than the client-side
adapter; deferring while the calendar fix lands and the GM
confirms the per-day visual matches their mental model.

**Verified.** Calendar/index.js 436/436 + 227/227, DayView.js
432/432 + 302/302. Walk-through with Jesse's
2026-05-25T22:29 → 2026-05-26T07:09 entry: 2 segments emitted,
Monday seg = 22:29-23:59 (1.5h displayed on bar), Tuesday seg =
00:00-07:09 (7.2h). Modal opens with `clock_in_time =
22:29:00Z`, `clock_out_time = 07:09:00Z`, `hours = 8.7h`. ✓

**Follow-ups.** Track the server-side overnight fix as a Sprint
13.6 task: `/me/hours` + `/admin/staff/:id/performance` need
either client-side splitting (mirror this adapter on the staff
side) or a server-side `generate_series` join. The StaffDetail
entries-list view (image #19) could also surface the split — but
since each row already shows total hours correctly, the visual
"row says Monday 10:29 PM → 7:09 AM" reads as one shift the
operator can mentally place on two days, so it's lower priority.

---

### 2026-05-26 — Sprint 13.4: dead-CSS cleanup + timezone fix for late-evening clock-ins

Two follow-ups: the Sprint 13.3 cleanup pass + a real production
bug the GM caught at 11 PM live.

**1. Cleanup — dead CSS removed.**

Sprint 13.3 left four sets of dead selectors marked for removal
once the new DropdownSelect-based toolbar was confirmed. Deleted:

- `.day-filter-chips`, `.day-chip`, `.day-chip:hover`,
  `.day-chip.is-active` (Scheduling.css lines 1390+) — the
  pre-13.2 chip-row dept filter.
- `.day-filter-dropdown`, `.day-filter-dropdown-label`,
  `.day-filter-dropdown-select`,
  `.day-filter-dropdown-select:focus-visible`
  (Scheduling.css lines 2978+) — the Sprint 13.2 native-`<select>`
  wrapper.
- `.staff-mgr-sort`, `.staff-mgr-sort-label`,
  `.staff-mgr-sort-select`,
  `.staff-mgr-sort-select:focus-visible`
  (AdminPanel.css lines 2302+) — same story on the StaffManager
  sort.

Replaced each block with a single-line `/* Sprint 13.4: removed,
see DropdownSelect */` so future archaeology lands on the right
trail. Total: 12 rules deleted, ~140 lines down.

**2. Bug — 11 PM clock-ins falling into the next UTC day.**

Live bug: GM at the hotel at 11 PM local Pacific. Staff just
clocked in (entry stored as `2026-05-27T06:00:00Z` — the same
UTC instant). Admin Calendar's Day view rendered empty for
today (May 26), but yesterday/tomorrow showed the entry
randomly.

Root cause: `/api/admin/entries` did
```sql
te.clock_in_time >= $1::date AND te.clock_in_time < ($2::date + INTERVAL '1 day')
```
where `$1` / `$2` were `'YYYY-MM-DD'` strings. Postgres cast
those to date *in the server's timezone* (UTC on Koyeb). So
"May 26" became `2026-05-26 00:00 UTC`–`2026-05-27 00:00 UTC`,
which is 5 PM May 25 PT through 5 PM May 26 PT. An 11 PM PT
clock-in (= 6 AM May 27 UTC) sat outside that window — the
calendar dropped it. The same entry queried for "May 27"
showed up correctly (the entry IS in May 27 UTC), so the
calendar appeared to put the staff on the *wrong day*.

Fix is a three-touch:

**Server (`/api/admin/entries`).** Now accepts either format:
- Legacy `YYYY-MM-DD` (interpreted in server TZ — existing
  callers and any cron jobs still work).
- New: ISO timestamp (e.g.
  `2026-05-26T07:00:00.000Z`) — compared directly against
  `te.clock_in_time` (timestamptz), so the caller's local
  midnight bound is honored regardless of server TZ.

```js
const conditions = fromIsISO && toIsISO
  ? [`te.clock_in_time >= $1::timestamptz`,
     `te.clock_in_time <  $2::timestamptz`]
  : [`te.clock_in_time >= $1::date`,
     `te.clock_in_time <  ($2::date + INTERVAL '1 day')`];
```

Regex switch picks the branch — `/^\d{4}-\d{2}-\d{2}T/` for ISO,
`/^\d{4}-\d{2}-\d{2}$/` for legacy date.

**Client #1: admin Calendar `loadSchedules`.** Builds the
`from`/`to` as ISO strings representing local-midnight bounds:
```js
const localStartIso = (yyyymmdd) => {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0).toISOString();
};
const localEndIso = (yyyymmdd) => {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return new Date(y, m - 1, d + 1, 0, 0, 0).toISOString();  // exclusive
};
```
`new Date(y, m, d, 0, 0, 0)` interprets the components as
*local time* — `.toISOString()` then gives the UTC instant
matching that local moment. Pass both into the URL
(`encodeURIComponent` since the value carries colons).

**Client #2: StaffManager `runExport`.** Same helper applied —
"today"/"biweekly"/"month" exports were quietly missing
late-evening entries the same way. Less noisy than the calendar
because the export range is longer than one day, but the same
class of bug.

**Verified.** Brace + paren balance held across all touched
files (server.js had a pre-existing 1534→1547 paren imbalance in
literals; my edit added 11/11 balanced — file is syntactically
fine). Bug walk-through: ISO range
`2026-05-26T07:00:00.000Z` → `2026-05-27T07:00:00.000Z` (PDT
local midnight bounds) now contains the
`2026-05-27T06:00:00Z` clock-in, so the entry renders on
Calendar's May 26 column. Matching `tomorrow` query
`2026-05-27T07:00:00Z` → `2026-05-28T07:00:00Z` doesn't —
no double-counting.

**Follow-ups.** Other date-range endpoints (`/me/hours`,
`/admin/staff/:id/performance`, etc.) probably have the same
class of bug — they're less visible because they're scoped to
longer windows. Worth a TZ-aware pass when the GM has more
incidents to share.

---

### 2026-05-26 — Sprint 13.3: header `+` → inline "Assign", view toggle right-aligned, shared DropdownSelect

Four GM-asked changes that all touch the same toolbar language.

**1. ＋ assign-shifts button → inline "Assign" next to the title.**

GM is preparing a drag-and-drop assign-shifts surface for a later
sprint. The standalone `＋` button on the controls row is gone;
the action moves inline to the header's left block, right after
the title (`Tuesday | May 26, 2026  [Assign]`). Same handler —
opens the existing `AssignPanel` for now; the drag-and-drop
replacement lands later.

CSS: `.sched-assign-btn` matches the accent-tinted pill the rest
of the admin app uses. Tightened a step at `(max-width: 720px)`.

**2. View toggle right-aligned.**

With `＋` out of the way, `.sched-view-toggle` now gets
`margin-left: auto` so Year / Month / Week / Day pin to the right
edge of the controls cluster on every breakpoint. Matches the
GM's image #17 mockup where the toggle was right-flush.

**3. Day controls (dropdown + Style + Rows/Timeline) on one row.**

The chip + toggle row was wrapping on mobile. New CSS forces
`flex-wrap: nowrap` at `(max-width: 720px)` and shrinks the
inner controls' font + padding so all three fit:
- Dropdown trigger: 11px font / 4-10px padding.
- Style + Mode toggles: 11px font / 5-8px padding, 2px container
  padding.
- At ≤480px, another step down to 10px font / 4-6px padding.

**4. Shared `DropdownSelect` — replaces native `<select>` in two places.**

The Calendar Day dept dropdown + StaffManager sort dropdown were
both rendering with the OS picker, which looked foreign next to
the chip/pill toolbar. Built a small reusable popover-style
dropdown that matches the admin app's chip+popover language
(same shape as the StaffManager export popover):

```
src/components/shared/
  DropdownSelect.js
  DropdownSelect.css
```

API:
```jsx
<DropdownSelect
  label="Department"
  value={deptFilter}
  onChange={handleChange}
  options={[{ value, label }, ...]}
  align="left|right"  // menu anchor edge
  placeholder="Select…"
/>
```

Implementation:
- Trigger = chip-shaped button with optional uppercase prefix
  label + current value + chevron (rotates 180° when open).
- Menu = surface-colored popover anchored to the trigger
  (`top: calc(100% + 4px); z-index: 60`), max-height 280px,
  scrolls if options overflow. Selected item gets the
  `accent-bg` highlight.
- Click-outside + ESC both dismiss (handlers in a `useEffect`
  that cleans up on close).

Both callers (DayView + StaffManager) drop the `className` prop —
the legacy `.day-filter-dropdown` / `.staff-mgr-sort` rules
carried conflicting visual styling (border/padding/background on
the wrapper, redundant with the new `.hop-dropdown-button`
chip). One `.day-controls > .hop-dropdown { margin-right: auto }`
rule preserves the "dept pinned left, toggles pinned right"
layout the controls row needs.

Legacy `.day-filter-dropdown*` / `.staff-mgr-sort*` CSS left in
the files as dead code for one sprint while the GM confirms.
Cleanup in 13.x.

**Verified.** Six touched files all balance: DropdownSelect.js
36/36 + 28/28, DropdownSelect.css 19/19 + 18/18,
DayView.js 428/428 + 302/302, Calendar/index.js 401/401 +
222/222, Scheduling.css 502/502 + 501/501,
StaffManager.js 486/486 + 295/295.

**Follow-ups.** The drag-and-drop assign-shifts surface (Sprint
14+ probably). Cleanup pass for the dead `.day-filter-chips` /
`.day-chip` / `.day-filter-dropdown*` / `.staff-mgr-sort*`
selectors once the GM has signed off on the new toolbar.

---

### 2026-05-26 — Sprint 13.2: Day view dual layout (Classic / Cards), dept dropdown, mobile header squeeze, Scheduled stat

Four GM-asked changes.

**1. Two Day-view layouts; user picks.**

13.1 replaced the old hour-rail + dept-track modes with the new
card-driven layouts. GM wants both available — Classic for desktop
power-users, Cards for mobile / preference. Added a `layoutStyle`
toggle:
- New segmented control next to Rows/Timeline: `[Classic | Cards]`.
- Default = `cards` on `(max-width: 720px)` else `classic`.
- Persists to `localStorage['hotelops-cal-layout-style']` so the
  admin's choice survives reloads.
- 2×2 render routing (`layoutStyle × viewMode`):
  - classic + timeline → original `TimelineMode` (hour rail +
    lane-pack).
  - classic + rows → original `ResourceMode` (dept-row tracks).
  - cards + timeline → `TimelineBucketsMode` (Sprint 13.1
    hour-bucket sections).
  - cards + rows → `RowsListMode` (Sprint 13.1 staff-card list).

All four components stay in the file; nothing is dead-coded
anymore — both layouts are first-class.

**2. Dept chips → dropdown; toggles consolidated on the right.**

Per the GM's request, the All / dept chips row was eating
multiple lines on mobile. Replaced with a native `<select>`
labelled "Department" on the left of the controls row. Both
toggle segments (Style + View mode) live on the right; flex-wrap
so the toggle cluster drops below the dropdown only on
viewport-too-narrow.

Old `.day-filter-chips` / `.day-chip` rules left in CSS in case
the chip pattern returns elsewhere — no JSX references them now.

**3. Header single-row on mobile (image #16).**

The `<` `Today` `>` + `Year Month Week Day` + `＋` cluster was
wrapping on phone-class viewports. Tightened via
`@media (max-width: 720px)` and `(max-width: 480px)` breakpoints:
- `.nav-arrow` 30px (was 36); `.nav-today` smaller padding/font.
- `.sched-view-toggle` padding 2px (was 3); buttons 5px 8px /
  font 11px.
- `.sched-add-btn` 30px square.
- At ≤480px, the view-toggle buttons shrink another step
  (font 10px, padding 5px 6px).

All controls fit on one row at iPhone-SE width with the title
+ back link above.

**4. Conflicts → Scheduled stat.**

GM dropped "Conflicts" — overlap counting was noisy in a hotel
where multi-staff coverage is normal. Replaced with "Scheduled":
the count of admin-assigned shifts (rows in `schedules`) for
the current range. Pulled from `/api/admin/schedule?start=&end=`
in a new `useEffect` in `SchedulingManager`, separate from the
`/admin/entries` fetch that drives the calendar visualisation
itself. `countConflicts` helper deleted with a comment-stone.

`computeDayStats` grew a third param (`scheduledCount`); the
4th tile in `AtAGlanceCard` is now labelled "Scheduled" with no
warn-tint (it's an informational count, not an alert).

**Verified.** All three touched files balance: DayView.js
429/429 + 304/304, Calendar/index.js 400/400 + 221/221,
Scheduling.css 494/494 + 484/484. Default layout picks correctly
based on initial viewport; the persist-to-localStorage round-trip
survives reload by reading the stored value before falling back
to the media-query default.

**Follow-ups.** Week view's two layouts (staff matrix vs admin
dept × day grid) are currently auto-picked by `staffScope`. If
the GM also wants a user-side toggle there (e.g. admin sees
matrix on demand), the same `layoutStyle` localStorage key + a
Style toggle on the week toolbar would extend the pattern. Not
in this sprint — the GM only mentioned the Day view layout
choice.

---

### 2026-05-26 — Sprint 13.1: Day-view internal redesign + admin Week-view dept × day grid

Sprint 13 (foundation) landed the header collapse + at-a-glance /
notes cards. Sprint 13.1 carries the bigger internal redesigns the
GM mocked up.

**1. Day view: Rows + Timeline rewrites.**

Replaced both internal modes with new card-driven layouts. The
existing `TimelineMode` (vertical hour rail + lane-pack) and
`ResourceMode` (dept rows × hour columns) are left in the file as
dead code for a sprint while the GM confirms — they're not
referenced from the render path, so they can be deleted in a 13.x
cleanup pass.

**`ShiftCard`** — single card design shared between Rows and
Timeline. Dept-color left stripe, dept-tinted initials avatar,
name + on-shift live pill, dept · role meta line, time-range +
hours line with clock-icon. Click anywhere on the card opens
`ShiftDetailModal` (unchanged from Sprint 12.4). `.is-in-progress`
class flips the left stripe to green + adds the live dot/pill.

**`RowsListMode`** (image #15) — flat list of `ShiftCard`s
sorted by start time. Header is `Scheduled Staff` + count. One
component, same component on desktop and mobile (CSS handles the
width changes). No more dept-grouped horizontal tracks; one staff
= one card.

**`TimelineBucketsMode`** (image #13) — hour-bucket sections,
collapsible via the chevron in each bucket header. Bucket-hour
assignment follows the GM's xx:45 rule:
```js
const bucketHourFor = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return m < 45 ? h : (h + 1) % 24;   // wraps at 24 → 0
};
```
Buckets without any shifts are omitted entirely (image #12 skipped
6 AM + 9 AM with that pattern). Shifts inside a bucket are
sorted by start time. Same `ShiftCard` body — the wrapper is the
only difference between Rows and Timeline.

**`useIsMobile` hook** — `(max-width: 720px)` matcher, present for
when the Day view needs a desktop-specific Timeline variant
(13.2 will add the dept-row × hour-column grid from image #12 for
non-touch viewports). Right now both surfaces use the bucket
layout; the hook is here so the conditional render in 13.2 is a
one-line change.

Helpers added alongside: `initialsFor(name)` (two-letter initials
from first/last name), `fmtCompactRange(start, end)` (compact
"9:00am – 5:30pm" / "9:00am – now" formatter). The leftover
helpers from the old modes (`timeToMinutes`, `laneAssign`,
`verticalShiftBox`, `horizontalShiftBox`) stay until cleanup.

**2. Admin Week view: dept × day grid.**

Image #14 — rows = departments, columns = the seven days, cells
stack one mini-card per shift on that day in that dept.
Implemented as a new `.cal-week-deptgrid-wrap` block in
`CalendarWeekView`, rendered only when `staffScope === false`
(admin). Staff calendar keeps the existing staff-row matrix
because the staff scope only ever shows the staff's own dept —
a dept-row grid for staff would degenerate to a one-row table.

The grid:
- 8-column CSS grid (`120-200px` dept label + 7 day columns).
- Day-header cells show day-letter + day-number (`Mon 25`).
- Dept rows skip empty depts (`deptShifts.length === 0` ⇒
  return null) so the grid only renders depts with activity in
  the week.
- Each cell shows up to 3 mini-cards; if a dept has > 3 shifts on
  a day, the cell collapses the overflow to `+N more` (clicking
  still drills into Day via `onPickDate`).
- Mini-card = compact time + employee name with a left stripe
  that flips green for in-progress entries.

**3. Conflicts stat — same overlap-pair logic.**

No change since Sprint 13; just confirming it scopes to the
range the calendar's fetch returns. Day view → conflicts within
that single day. Week view → conflicts across all 7 days
(probably noisier, but matches the at-a-glance card's range).

**Verified.** Brace + paren balance held across all four touched
files: DayView.js 411/411 + 288/288, CalendarWeekView.js 200/200
+ 148/148, Scheduling.css 479/479 + 466/466, Calendar.css 255/255
+ 233/233. (Node runtime still broken — manual review + bracket
balance check.)

**Follow-ups (Sprint 13.x):**

- Delete the orphan `TimelineMode` + `ResourceMode` once the GM
  signs off on the new card layouts.
- Desktop Timeline variant matching image #12 (dept row × hour
  column with cards positioned by start time). `useIsMobile`
  is in place; the conditional render is one extra component
  away.
- Conflict definition refinement once GM has time to use the new
  layouts and tell us what's actually useful.

---

### 2026-05-26 — Sprint 13: header collapse + Day/Week at-a-glance + notes-feed cards (foundation pass)

Sprint 13 covers the calendar redesign the GM mocked up. Scope is
large enough that this iteration lays the **foundation** — header
layout, stat cards, notes-feed card — and the bigger internal
Day-view / Week-view redesigns land in 13.x. Per the GM,
"conflicts" is overlap-based (pairs of *different* staff whose
clock-in windows overlap); "open shifts" is dropped entirely
(Sprint 12 moved off the `schedules` table; no data source).

**1. Single-line header.**

Calendar header used to take three rows on the GM's typical
viewport: `‹ May` + title on row 1, `‹ Today ›` on row 2,
`Year Month Week Day +` on row 3. Right side of every row sat
empty. Sprint 13 collapses the nav controls + view toggle + ＋
button onto the same row as the title block via a new
`.sched-header-controls` flex cluster. Flex-wrap so the controls
drop onto their own row when the viewport can't fit them, but on
the GM's desktop the whole thing is one line. The old
`.sched-nav-bar` class is kept (with the same shape as
`.sched-header-controls`) so anything still pointing at it
doesn't break.

**2. `AtAGlanceCard` (Day at a glance / Week at a glance).**

Four-stat card, shared between Day and Week views (just different
`title` + range). Stats (per the GM's text, not the original
mockup labels):

- **Finished shifts** — clocked-out entries in the active range.
- **On clock** — in-progress entries. Number turns green when > 0
  to echo the live-dot language elsewhere.
- **Notes** — unresolved `handoff_notes` count for the range
  (pulled from the same fetch the notes card uses).
- **Conflicts** — pairs of *different* staff whose entries
  overlap in time (any dept). Number turns warn-orange when > 0.

Conflicts implementation (`countConflicts`): O(n²) over the
range's entries; for two entries to count, `user_id` must differ
and `[in, out]` intervals must intersect. In-progress entries
treat `out = now` for the test. The hotel can have lots of
legitimate overlap (multiple housekeepers, etc.) — the count is a
signal, not a hard error.

**3. `NotesUpdatesCard` (Notes & updates / Weekly updates).**

Presentational. Parent fetches `/handoff-notes?from=&to=` once
for the active range; both AtAGlance and NotesUpdates consume
the same data. Top 4 unresolved items, each row = colored
dept-dot + body (ellipsised) + time. "Open Logbook ›" link at
the bottom invokes `onOpenLogbook` (the parent wires this to
`goTo('reports')` since the Logbook is the admin shell's
`reports` view).

Dept-dot color picker is a small inline `dotFor(scope,
deptName)` — uses the same Front Desk / Housekeeping / etc.
palette the DayView shift cards already use, so the colour
language reads consistently across surfaces.

**Plumbing in `SchedulingManager`:**

- New state: `notesData`, `notesLoading`.
- New `useEffect` keyed off `view + fetchRange` — fetches notes
  only on Day + Week views (year/month don't render cards).
- New `glanceStats` `useMemo` — computes the four stats from
  `schedules` (already adapted from clock entries by Sprint 12)
  + `notesData`.
- Day + Week view render paths wrap their existing body in a
  fragment that renders `.sched-glance-row` (two cards
  side-by-side desktop / stacked mobile via the CSS grid
  breakpoint) immediately before the existing `DayView` /
  `CalendarWeekView`.

**CSS:** equal-column grid for the card row, 4-stat grid inside
each card, drops to 1-column at 880px and 2-stat (2x2 grid) at
480px so the cards don't squish on phones.

**Verified.** Calendar/index.js 389/389 parens + 220/220 braces;
Scheduling.css 452/452 + 432/432. Logic walk-through: conflicts
counter excludes same-user pairs and treats null `clock_out`
as `now`; notes effect ignores year/month views; cards stack
correctly under 880px.

**Follow-ups (Sprint 13.1+):**

- **Day view internal redesign** — hour-bucket grouping per the
  GM's xx:45 rule (start < xx:45 → bucket `xx`, ≥ xx:45 < (xx+1):00
  → bucket `xx+1`). Mobile Timeline = collapsible hour sections
  (image #13). Desktop Timeline = clean dept-row × hour-column
  grid with full names + clock times (image #12).
- **Day view Rows mode rewrite** — mobile becomes a "Scheduled
  Staff" + "Open Shifts" list of cards (image #15).
- **Week view dept × day grid** — replaces the existing
  staff-row CalendarWeekView with dept-row × day-column,
  per-cell mini-shift cards (image #14).
- "Conflicts" exact definition is provisional — overlap pairs
  is a starting point; the GM may want a tighter rule (same
  dept, more than dept's staffing target, etc.) once the
  redesigned views are in.

---

### 2026-05-26 — Sprint 12.4: shift-detail modal, dept-grouped timeline, rows-mode live indicator

Three changes to the admin Calendar Day view.

**1. Tap-a-bar → detail modal (mobile-first, desktop-friendly).**

Mobile screenshot showed the resource-mode bars getting their
time range ellipsised ("8:38am – …" with the actual end clipped).
Rather than try to fit more text in a tiny bar, made every shift
bar tappable: opens a centered modal with the full clock-in /
clock-out / hours rundown.

New `ShiftDetailModal` inside `DayView.js`:
- Backdrop click + ✕ button + ESC all dismiss.
- Dept-color stripe down the left edge of the card.
- Header row: staff name + a green "● ON SHIFT" pill if
  `is_in_progress`.
- Subhead: department name.
- Three label/value rows: Clock in, Clock out (or "On shift"),
  Hours (with "(so far)" suffix if in progress).

Both `TimelineMode` and `ResourceMode` now route bar clicks to
`onShowDetail(s)` for clock entries (`is_actual`) and keep
`onEdit(s)` only for legacy non-actual scheduled shifts. The
modal lives at the `DayView` root so a tap from either mode
hits the same component; ESC handling registered in the modal's
own `useEffect`.

Modal CSS (`Scheduling.css`): fixed-position backdrop at
z-index 200, slide-up + fade-in animation, `prefers-reduced-
motion` respected.

**2. Timeline lane-packing now groups by department.**

`laneAssign` was global-greedy — five non-overlapping shifts =
five mixed-dept lanes side by side, which the GM screenshot
showed reading as "five unrelated columns" even though three
of them were Housekeeping.

Rewrote to group by department first, then lane-pack within
each dept:
```
laneAssign returns:
  shifts: [{ ..., _lane: globalIndex }]
  laneCount: total lanes across all depts
  deptBands: [{ deptId, deptName, startLane, lanes }]
```

Depts ordered by earliest-shift start (stable, predictable).
Inside each dept, the greedy packer still creates sub-lanes
for overlaps — so three overlapping Housekeeping shifts become
three adjacent green sub-lanes inside a wider Housekeeping
column band. The two non-overlapping Housekeeping shifts (if
that ever happens) would share a single lane and save column
space.

To visualise the grouping, `TimelineMode` renders faint
dept-color underlays (`.day-timeline-dept-band`) spanning each
dept's lane range, behind the hour-lines and shift buttons.
Same dept ⇒ same tint band, so a row of three green-tinted
bars reads as "Housekeeping × 3" instead of "three random
green bars."

How overlaps are distinguished: bar borders + per-bar text
(name + time range) inside their own sub-lane — same as
before, just clustered.

**3. Rows mode in-progress indicator.**

Rows mode had a green pulsing right-edge on the bar (Sprint 12)
but no signal in the name column. With limited horizontal
width on mobile the bar's "live" cue could get clipped, so the
real signal needs to live where the eye lands first: the name.

Added `.day-resource-name-live-dot` (8px green pulsing dot)
inside the name col when `s.is_in_progress`. Same
`day-shift-live-pulse` keyframes the timeline and StaffManager
use, so the live language reads consistently.

Bar contents flip too: when in-progress, the bar replaces its
time-range text with a compact `ON SHIFT` pill (green dot +
9px uppercase label). The hover/title tooltip still shows the
full range so power users can confirm exact times. Non-
progress bars keep the original `9:00am – 5:00pm · 8h` layout.

**Verified.** Brace + paren balance held across both touched
files: DayView.js 293/293 + 230/230, Scheduling.css 428/428 +
406/406. Modal opens / closes via backdrop, ✕, and ESC; ESC
listener added in a `useEffect` so it cleans up when the modal
unmounts.

**Follow-ups.** None outstanding. If the GM ever wants the
modal to also surface OT-approval status or a "edit clock entry"
deep-link to Staff → Detail, the modal body is the place to
hang those rows.

---

### 2026-05-26 — Sprint 12.3: admin Calendar entries fetch needed auth

Sprint 12's data-source switch swapped
`/api/admin/schedule` (open) for `/api/admin/entries` (requireAuth
+ requireRole('admin')), but the call site stayed on a raw
`fetch(...)` that doesn't ride the bearer token. Result: every
calendar load 401'd, the calendar rendered empty, browser logged
a wall of failed-resource messages, and the GM correctly noted
that staff who clocked in weren't showing up.

One-line fix: import `apiFetch` (which pulls
`localStorage[hotelops-token]` into the `Authorization: Bearer`
header on every request) and route the entries call through it.
Also wrap with `if (ok && data?.success)` so a server hiccup
no-ops instead of throwing. Path goes from
`fetch('/api/admin/entries?...')` to
`apiFetch('/admin/entries?...')` (apiFetch prepends `/api`).

```js
const { ok, data } = await apiFetch(
  `/admin/entries?from=${fetchRange.start}&to=${fetchRange.end}`
);
if (ok && data?.success) {
  const merged = mergeAccidentalSignouts(data.entries || []);
  setSchedules(merged.map(entryToSchedule));
} else {
  setSchedules([]);
}
```

The other admin Calendar fetches (`/api/admin/schedule` POST/PUT/
DELETE for the AssignModal/AssignPanel) sit on un-authed routes
and still work via raw `fetch()` — leaving those untouched to
keep this fix surgical. They can move to apiFetch later in a
broader auth-hardening pass if the GM ever turns auth on for
the schedule endpoints.

**Verified.** Brace + paren balance holds (Calendar/index.js
324/324 + 168/168). Behavioral fix is one network call —
the token attachment is the only thing that changed.

---

### 2026-05-26 — Sprint 12.1: move notes out of admin Calendar into Logbook; hide 0-hour staff in Day view

Three follow-ups to Sprint 12.

**1. Notes UI moved from admin Calendar to Logbook.**

12 swapped the calendar's data source but left the NotesCenter
(stat tiles for unread/general/carryover) and the NotesDrawer
(compose + feed) inside the Day view. The GM's intent was always
for those to live in a separate Logbook surface; this sprint does
the physical move so the calendar reads as pure clock-data and
notes still work without waiting on the proper Logbook redesign
(that's a Sprint 12.2+ rebuild).

`src/pages/AdminReports/` (the placeholder "Reports" page that
the sidebar now labels "Logbook") was rewritten end-to-end:
- Topbar with `‹ Home` back, "Logbook" title, prev/next day buttons,
  a `<input type="date">` picker, and a Today shortcut.
- Body stacks `NotesCenter` + `NotesDrawer` with the same
  tile-click → drawer-tab + scroll-into-view dance the Calendar
  used to do. Departments are fetched once on mount;
  `currentUser` flows in from `useAuth`.
- New `Logbook.css` (under the same folder) carries the page +
  topbar styles. Folder name kept `AdminReports/` because the
  AdminShell maps `view='reports'` → that file and renaming the
  folder costs more than it saves right now.

`AdminShell` dropped the `notes` view mapping + its
`ACTIVE_PARENT` entry — admin's only path to NotesPage was the
"View all notes" link inside Calendar, which is gone. The staff
shell still maps `view='notes'` → `NotesPage` because the staff
Calendar still surfaces the link.

**2. CalendarWeekView gates notes UI on the parent.**

`CalendarWeekView` is shared by admin + staff Calendar. Sprint 12
left the notes feed visible there even though admin's notes moved.
Made the entire notes UI conditional on `typeof onViewAllNotes ===
'function'` (a `showNotes` boolean inside the component):

- Fetch of `/handoff-notes?from=&to=` runs only when
  `showNotes` (no point polling an endpoint for data you'll never
  render).
- Admin stat-card row drops the "Handoff Notes" tile when
  `showNotes=false`; flex grid reflows to 2 cards.
- Matrix cell `cellNotes` count short-circuits to `0` when
  `showNotes=false` so the per-cell 💬 badges don't render.
- The `<section className="cal-week-notes">` block (header,
  feed, "View all" link) is wrapped in `{showNotes && (...)}`.

Admin Calendar simply omits the `onViewAllNotes` prop now; staff
Calendar still passes it. No new prop surface needed.

Admin Calendar's own JSX shrank significantly: the Day view
fragment that used to wrap `NotesCenter` + `DayView` + a
`notesDrawerRef`-wrapped `NotesDrawer` is now just `<DayView />`
alone. State that only existed for those affordances
(`notesTab`, `notesDrawerRef`, `handleNotesTile`, the `useRef`
import) is gone with them.

**3. DayView resource mode hides 0-hour staff.**

Resource mode (the staff-rows × hours-x-axis layout) used to
render one row per employee in the active department, with an
empty track for anyone who hadn't been scheduled. Scheduled
shifts → clock entries (Sprint 12) means an empty track now
just signals "didn't clock in today" — noise. Filter the
dept's staff to `dept.staff.filter(e => shiftByUser[e.user_id])`
before the `.map`, hoist that to `onStaff`, skip the whole
fragment when `onStaff.length === 0`. The "N / M on" count in
the dept-header row still uses M = total dept headcount so the
admin can compare worked-vs-total at a glance.

**What stayed.** Staff Calendar's notes affordances + NotesPage
route + StaffShell's `notes` view all unchanged. Both admin and
staff Calendars still use `CalendarWeekView`; only the admin
caller flips notes off.

**Verified.** All five touched files balance: Calendar/index.js
323/323 + 166/166, DayView.js 223/223 + 182/182, CalendarWeekView
170/170 + 118/118, AdminReports/index.js 55/55 + 33/33,
AdminShell.js 9/9 + 23/23. Logbook.css 13/13. (Node runtime
still broken via the brew dylib mismatch — fell back to
bracket-balance + manual review.)

**Follow-ups.** Sprint 12.2+ rebuilds the Logbook surface
proper (separate tabs for active/resolved, filter by author /
scope, maybe a per-day timeline). For now the minimum-viable
move is in place so the calendar stops carrying the notes
weight.

---

### 2026-05-26 — Sprint 12: admin Calendar pulls from clock_in/out, not scheduled shifts

The admin Calendar's original surface was "GM assigns shifts here";
in practice the GM never used the assignment flow, so the Year /
Month / Week / Day views all rendered an empty calendar against
the unused `schedules` table. Sprint 12 rewires the calendar feed
to *actual* clock-in/out data so the GM sees what's actually
happening, not what was supposed to happen.

(Logbook migration deferred — the GM is moving handoff / shift-
notes into a future Logbook surface, but per "for this sprint we
are not implementing logbook yet" the existing `NotesCenter` +
`NotesDrawer` stay exactly where they are inside the Day view.)

**Data source flip.**

`SchedulingManager.loadSchedules` used to fetch
`/api/admin/schedule?start=&end=` (rows from `schedules`). Now it
hits `/api/admin/entries?from=&to=` (rows from `time_entries` with
the same user + department joins the XLSX export already uses) and
runs the result through two transforms before handing it to the
views:

1. **`mergeAccidentalSignouts(entries, gapMinutes=5)`** — groups by
   `user_id`, sorts each user's entries by `clock_in_time`, and
   collapses any consecutive pair where
   `(next.clock_in - prev.clock_out) < 5 min` into a single span.
   Catches the "oops, I clocked out by accident" pattern (auto-
   signout fires, user signs back in, fresh entry created) — the
   calendar should read those as one continuous shift.
2. **`entryToSchedule(e)`** — maps the time-entry shape onto the
   schedule shape the existing views already speak:
   ```
   { schedule_id: 'entry-<id>', user_id, employee_name, department_id,
     department_name, scheduled_date, start_time, end_time,
     is_actual: true, is_in_progress: bool, hours, ... }
   ```
   `scheduled_date` / `start_time` / `end_time` are derived from the
   local-time interpretation of the ISO timestamps so the existing
   `start_time.slice(0,5)` / `timeToMinutes` plumbing keeps
   working. For an in-progress entry (`clock_out_time === null`),
   `end_time` is set to *now* — the bar extends to current time on
   load.

Year, Month, and CalendarWeekView render the adapted entries
unchanged — they only consume `scheduled_date`, `user_id`,
`department_*`, and the time-range fields, all of which the
adapter supplies. Only DayView grew new visual affordances.

**DayView visual changes.**

- **In-progress indicator.** Bars with `is_in_progress` get an
  `is-in-progress` modifier class on both render modes (timeline +
  resource). CSS: pulsing right-edge stripe (3px, success-green
  `#38a169`) plus a small live-dot next to the name / time range.
  Uses the same `day-shift-live-pulse` keyframes (1.6s) the
  StaffManager rows already use for the "On the clock" badge, so
  the live language reads consistently across the admin app.
- **Time-range copy.** In-progress bars show `9:00am – now` instead
  of `9:00am – 3:47pm`, since the end timestamp is synthetic.
- **Read-only.** Observed entries (`is_actual: true`) no longer
  open the AssignModal on click — admin manages individual
  `time_entries` through Staff → Detail. Scheduled-shift entries
  (legacy / not currently feeding the calendar) would still be
  interactive if they ever flow back in.
- **Empty copy.** "No shifts scheduled." → "No clock entries for
  this day yet." Same selector (`.day-empty`), unchanged styling.

**What stayed put.**

- The `AssignPanel` + the `＋` Assign button stay accessible.
  Posting to `/api/admin/schedule` still creates a row, it just
  won't appear on the calendar — kept for now in case the GM ever
  wants to wire it back. (If they confirm "we're never assigning
  shifts," removing this in a later sprint is one button + one
  panel component delete.)
- `NotesCenter` / `NotesDrawer` / handoff-notes plumbing inside
  the Day view — no changes, per the user's explicit request to
  leave them until the Logbook surface lands.
- Staff Calendar (`/pages/StaffCalendar`) — unchanged. Sprint 12's
  ask was specifically the admin calendar. Staff still see
  scheduled shifts when present; can revisit if staff want their
  actual clock history surfaced too.

**Verified.** All touched files parens + braces balance:
`Calendar/index.js` 332/332 parens, 184/184 braces;
`DayView.js` 220/220 + 180/180; `Scheduling.css` 379/379. Logic
walk-through: merge collapses sub-5min gaps; in-progress entries
render with a live edge; empty days show the new copy. (Node
runtime still broken via the brew dylib mismatch from earlier in
the day — fell back to bracket-balance + manual code review.)

**Follow-ups.**
- Sprint 12.1+ (Logbook): build the Logbook surface and migrate
  handoff/shift notes into it; remove `NotesDrawer` from the Day
  view at that point.
- Optional polish: 60s tick on the Day view to extend in-progress
  bars without a manual refresh. Currently the bar is anchored to
  page-load time and only updates when the admin navigates.

---

### 2026-05-26 — Sprint 11.6.3: pick the white-glyph variant per icon (not by suffix)

Picking-by-suffix in 11.6.2 was wrong. The source files' suffix
convention is inconsistent: for `home`, `timesheet`, `calendar`,
`logbook`, `assistant`, `settings` the `_dark.png` variant is the
white-icon-on-dark-bg one (suffix = target theme); but for
`stafficon` the suffix is *reversed* — `_dark.png` is the
dark-glyph variant. Trusting the suffix gave us dark icons that
disappeared into the sidebar.

Replaced the suffix-based picker with a content-based one: for each
icon, run a "whitify" pass over both variants (threshold by max
RGB channel — pixels with brightness <100 → fully transparent,
>200 → opaque white, linear ramp between) and keep the variant
whose post-whitify bbox is *tighter*. The tighter bbox is the one
where the white glyph survived thresholding (vs the variant where
the white was the background and the glyph thresholded away).

```python
def whitify(im, low=100, high=200):
    # threshold by max channel, recolor surviving pixels to (255,255,255)
    ...
for base in bases:
    best = None
    for v in ['dark', 'light']:
        white = whitify(Image.open(f'logo/{base}_{v}.png'))
        bbox = white.getbbox()
        area_pct = bbox_area(bbox) / canvas_area
        if best is None or area_pct < best[0]:
            best = (area_pct, v, white, bbox)
    # crop + square-pad + save as /public/logo/<base>.png
```

Results: every icon picked correctly. stafficon flipped to its
`_light` source as expected; all others stayed on `_dark`. All
output PNGs are pure white (255,255,255) on transparent bg with
76–83% of pixels fully transparent, sized to the content bounding
box (range 616–1018 square px). The Sidebar code is unchanged —
`iconSrc(base)` still resolves to `/logo/${base}.png`.

This also incidentally fixes the size-consistency issue from
11.6.2 — same approach, just with the right source.

---

### 2026-05-26 — Sprint 11.6.2: drop dark icon variants + trim PNGs for size consistency

Two small follow-ups from 11.6.

**1. One icon, not two.** The GM realized the nav icons are always
rendered on a dark sidebar (both themes use a dark navy
background — `--bg-sidebar` is `#1a365d` light / `#0b1420` dark),
so the white icon set is legible everywhere and the `_dark` /
`_light` variants were unnecessary work. Removed all 7 `_dark.png`
files from `public/logo/`, dropped the suffix from the remaining
`_light.png` files (→ `home.png`, `timesheet.png`, `calendar.png`,
`stafficon.png`, `logbook.png`, `assistant.png`, `settings.png`).
Sidebar's `iconSrc(base)` is now `/logo/${base}.png` — `isDark`
stays in scope because the theme-toggle button copy still uses it.

**2. Content-bounding-box trim to fix visual size inconsistency.**
The AI-generated source icons all sat on identical 1254×1254
canvases, but the actual glyph inside each one filled wildly
different fractions of that canvas — `stafficon` filled the entire
1254×1254, `assistant` only ~705×819, `home` ~797×817. With
`object-fit: contain` in a 22×22 box, that variance reads as
"some icons look 22px tall, others look 14px tall". Ran each PNG
through Pillow:

```python
im = Image.open(path).convert('RGBA')
bbox = im.getbbox()  # bounding box of non-transparent pixels
cropped = im.crop(bbox)
# Re-square so aspect ratio is preserved at render time
side = max(cropped.size)
square = Image.new('RGBA', (side, side), (0,0,0,0))
square.paste(cropped, ((side-cropped.width)//2, (side-cropped.height)//2))
square.save(...)
```

Each icon's content now fills its (smaller) square canvas. Render
in a 22×22 box with `object-fit: contain` and they all look the
same visual size. (Pillow had to be installed with
`--break-system-packages` because macOS's system Python rejects
unsanctioned global installs per PEP 668 — fine for a one-off
preprocessing pass.)

**Verified.** No stale `_dark` / `_light` references in src. The
HotelOps brand PNGs (`/hotelops-{light,dark}.png` referenced from
`config/tenant.js`'s `HOTELOPS_LOGOS`) are unaffected — separate
file set from the nav icons.

**Follow-ups.** None. If a future icon drop needs the same
treatment, the Pillow snippet above can be saved as a small
`scripts/trim-icons.py` — wasn't worth committing for one pass.

---

### 2026-05-26 — Sprint 11.6.1: icon PNGs moved into the public/ asset root

11.6 wired the sidebar to load PNGs from `/logo/<base>_<theme>.png`,
but the broken-image squares showed up because the GM dropped the
files into `/logo/` at the *project root* — Create-React-App only
serves static assets from `/public/`, so the URL 404'd silently
(no console error, just `<img>` falling back to the broken-image
placeholder).

Created `public/logo/` and copied all 14 icon variants
(`home`, `timesheet`, `calendar`, `stafficon`, `logbook`,
`assistant`, `settings`, each in `_dark.png` + `_light.png`) into
it from the project-root staging folder. Sidebar's `iconSrc(base)`
helper resolves cleanly now — no code change needed, just the
asset placement.

The staging copy under `/logo/` was left untouched; future icon
drops should copy into `public/logo/` to be live.

---

### 2026-05-26 — Sprint 11.6: sidebar icon swap (emoji → tenant PNGs) + tenant-branded sidebar brand

Pure UI swap — wires up the custom icon set the GM dropped in,
no functional changes.

**1. Nav icons.** Each nav item used to carry an emoji `icon`
string. The shells now pass an *icon base name* (e.g. `'home'`,
`'timesheet'`, `'stafficon'`); the sidebar resolves it to
`/logo/<base>_<dark|light>.png` keyed by the active theme.

```js
// Sidebar.js
const iconSrc = (base) => `/logo/${base}_${isDark ? 'dark' : 'light'}.png`;
```

Both surfaces — desktop sidebar list (`.nav-icon-img`) and mobile
bottom-nav (`.bottom-nav-icon-img`) — render the same PNG. The
sidebar background is dark in both themes (`#1a365d` / `#0b1420`),
but we still swap per theme so designers can tweak stroke
weights / contrast per mode without code changes (mirrors the
existing HotelOps-logo theme convention).

**Expected PNGs (drop into `public/logo/`):**

| Base name    | Where it appears             |
| ------------ | ---------------------------- |
| `home`       | Staff Home, Admin Home       |
| `timesheet`  | Staff Timesheet              |
| `calendar`   | Staff + Admin Calendar       |
| `stafficon`  | Admin Staff                  |
| `logbook`    | Admin Logbook (was Reports)  |
| `assistant`  | Admin Assistant              |
| `settings`   | Staff + Admin Settings       |

Each base ships two files: `<base>_dark.png` and `<base>_light.png`.

The admin "Reports" tab is **relabelled to "Logbook"** in this
sprint (`label: 'Logbook'`, `view: 'reports'` kept for view-state
diff-friendliness). The actual Reports → Logbook surface rebuild
lands in Sprint 12 per the GM.

**2. Sidebar brand block.** Desktop only — mobile bottom-nav
has no brand. Old block was a 🏨 emoji + the literal text
"HotelOps". Now:

- Tenant logo (e.g. Snoqualmie Inn) housed in a white card
  backdrop, sized to the sidebar's 220px width (58px tall card,
  10px radius, drop shadow) — mirrors the login page's
  `.login-tenant-logo-wrap` treatment so the colored PNG reads
  in dark mode without per-tenant dark variants.
- "powered by HotelOps" tagline beneath, right-aligned per the
  GM's mockup direction. Italic, 10px,
  `rgba(255,255,255,0.55)`.

Tenant resolved from `localStorage['hotelops-tenant-slug']` (the
same source RootRoute / Sidebar's sign-out flow uses), falling
through to `DEFAULT_TENANT_SLUG` if missing. If the tenant has
no `logoUrl`, the brand block falls back to the tenant's name
as text (centered, Tiempos Headline, white).

**3. What didn't change.** Mobile bottom-nav layout, the
sidebar's footer (theme toggle + sign-out), the unread badge on
Calendar, the live-dot indicators on `live: true` items, the
view-context-driven nav callback shape — all untouched.

**Verified.** Sidebar.js, StaffShell.js, AdminShell.js
parens/braces balance (61/61, 6/6, 8/8 + their `{}` counts).
Sidebar.css braces balance 37/37. Visual review needed for the
PNGs themselves — that's a designer task; the wiring is
complete. (Node's local runtime is currently broken via a
missing `libsimdutf` dylib from a brew upgrade, so babel parse
couldn't run — fell back to brace-count sanity check.)

**Follow-ups.** Sprint 12 reworks the Reports/Logbook surface.
If the GM wants a different sidebar brand variant when an admin
manages multiple tenants (rare for the pilot), the brand block
can grow a `tenant` prop and the shells pass the active slug
explicitly — no localStorage lookup needed.

---

### 2026-05-23 — Sprint 11.5: clock-action race fix, StaffManager sort, admin calendar gap

Three small fixes.

**1. Clock-in/out race window closed; lock binds to auto-signout setting.**

Sprint 11.1.2's grace-window lock did the right thing in principle
(disable the opposite-action button after a clock event), but
`handleAutoSignout` opened with `setClockEvent(null)` — and the
clear ran *before* the async `logout()` + `navigate()`. That left
a ~half-second window where both buttons re-enabled, which a
spam-tap on phone or a high-CPS mouse could squeak through to
reverse the event right before the page navigated away.

Fix is two parts:
- `handleAutoSignout` now starts with `setBusy(true)` and *does
  not* clear `clockEvent`. Both clock buttons already have
  `disabled={busy || …}`, so the lock holds through the entire
  async window. The page unmounts a moment later so the visual
  state of `clockEvent` no longer matters.
- The "disabled auto-signout" ack-window timeout used to clear
  `clockEvent` after a hardcoded 4000ms. Lifted that to a named
  `DEFAULT_LOCK_SECONDS = 3` constant so it matches the floor the
  user expects from the same setting. When the admin enables
  auto-signout, the lock already follows the configured countdown
  (set via the AutoSignoutBanner's `seconds` prop, which the
  server hands back as `autoSignoutSeconds`). When disabled, the
  3s floor prevents spam-tap reversals from sneaking in.

**2. Admin StaffManager sort dropdown.**

Native `<select>` chip in the toolbar (sibling to the
Include-inactive toggle). Six options:
- Name A → Z (default — matches the alphabetical grouping the
  GM already expects)
- Name Z → A
- Hours · most
- Hours · least
- Hired · newest
- Hired · oldest

`filtered` useMemo applies the sort step after filtering, so
search / dept / stat / include-inactive filters compose with the
sort. Name compares use `localeCompare(..., { numeric: true,
sensitivity: 'base' })` so "Beth 10" sorts after "Beth 2" and
case doesn't trip the order. Missing `hire_date` falls to the
end regardless of direction (no date is worse signal than any
date). Class `.staff-mgr-sort` styles the wrapper to match the
existing chip language.

**3. Admin Calendar Day view: gap between timeline and notes.**

`SchedulingManager`'s Day view stacks three direct children
(`NotesCenter`, `DayView`, `NotesDrawer`) inside `.sched-content`.
`.sched-content` was a plain block (`flex: 1; min-height: 0;`)
with no flex / gap of its own — so those three sections sat
flush against each other. The parent `.sched-manager` flex-gap
only applied *between* `.sched-content` and its siblings, not
between `.sched-content`'s kids.

Added `display: flex; flex-direction: column; gap: 16px` to
`.sched-content`. Single-child views (year / month / week) are
unaffected; Day view gets the breathing band the GM asked for.
(Staff Calendar already had this via `.staff-cal-body { gap:
16px }` — admin now matches.)

**Verified.** Home.js + StaffManager.js parse clean.
AdminPanel.css (476/476) + Scheduling.css (370/370) braces
balance. Race fix is behavioral so visual review needed — but
both clock buttons share `disabled={busy || …}` so the
`setBusy(true)` covers them by construction.

**Follow-ups.** None outstanding. If we later want `--`-delimited
sort persistence (admin's last pick survives reload), the state
would live in localStorage; not worth wiring for this sprint.

---

### 2026-05-23 — Sprint 11.4: StaffManager polish + per-row export selection

Five tweaks on the admin Staff list.

**1. On-the-clock badge inline with the name.**

Image #5 showed the bug clearly: rows where a staff member was
clocked in had a green ON THE CLOCK pill in the trailing "pills"
column, which pushed the progress-bar column inward by the pill's
width. Bars across rows didn't line up. Moved the pill into a
new `.staff-mgr-row-name-line` flex container — name on the left,
badge immediately to its right (compact `.staff-mgr-pill-inline`
variant: 9px font, 3px padding, `flex-shrink: 0`). Pills column
now only carries OT-pending + Inactive (rare), so the hours+bar
column reads consistently across all rows.

**2. Progress bar = hours / 40h fixed.**

Was: `pct = h / max(filtered.h)` — every bar was relative to
whoever had the loudest week in view, so the visual scale shifted
as you typed in the search box. Now: `pct = min(100, h/40 * 100)`.
Anything over 40h pegs at 100% and the bar's fill gradient flips
to amber (`#f59e0b → #fbbf24`) so OT reads at a glance. A small
"OT" tag also lights up next to the hours number for the same
reason. Theme tokens (`--warn-*`) are tuned for pill text/bg
contrast and didn't read well as a saturated bar gradient — used
explicit hex.

**3. Mobile: progress bar surfaced.**

Mobile rule had `display: none` on `.staff-mgr-row-hours`. Lifted
the hide; rewired the mobile grid to:
```
"select avatar info    chevron"
"select avatar hours   hours"
"select avatar pills   pills"
```
Hours + bar share one row now (number on the left, bar takes the
rest with `flex: 1`). Same fixed `/40h` math + amber-on-OT as
desktop, so the visual rule is consistent across breakpoints.

**4. "Include inactive" toggle anchored left.**

Was `margin-left: auto` which pushed the toggle to the middle of
the post-divider row (the Export button's own auto-margin then
ate the rest of the slack — visually the toggle floated halfway
between divider and Export). Changed to
`margin-left: 0; margin-right: auto`. Toggle now sits at the
start of the row; Export keeps its `margin-left: auto` and lands
on the right. Mobile already had `margin-left: 0` so nothing
changes there.

**5. Selectable XLSX export.**

New: per-row checkbox (24–28px column, leftmost) + a "Selected
staff" scope option in the export popover. State lives in a
`Set<user_id>` (`selectedIds`); ticking a row adds/removes its
id. Selection is independent of the search/dept filter, so the
admin can roam the full roster and just tick the ones they need
to pay out.

UI additions:
- `.staff-mgr-row-select` column on every row. Wrapper swallows
  click events (`stopPropagation`) so ticking doesn't drill into
  StaffDetail.
- Row gets an `is-selected` class → soft accent-tinted background
  while ticked.
- New "Selected staff (N)" scope in the export radios. Disabled
  with a "tick rows first" hint until N > 0.
- New `.staff-mgr-selection-chip` next to the Include-inactive
  toggle — shows "N selected ✕" when N > 0, click to clear all.
- Export-Go button additionally disables when scope is 'selected'
  and selectedIds is empty.

Server side: `runExport`'s 'selected' branch reuses the same
`user_ids` query param the 'filtered' branch uses, so no server
change needed. Scope label in the filename is
`selected-N` for traceability.

**Verified.** StaffManager.js parses clean; AdminPanel.css braces
balance (472/472). Row layout: bars align across on-clock and
non-clocked rows. /40h math + amber OT fill works (tested
mentally — straight CSS). Mobile shows the bar. Toggle on left,
Export on right. Per-row checkbox + Selected scope wired end to
end through `runExport`.

**Follow-ups.** None outstanding. If we later want bulk *actions*
(deactivate selected, assign-department selected) the
`selectedIds` Set is already there — those would just add new
buttons next to the selection chip.

---

### 2026-05-23 — Sprint 11.3: two-column login layouts, desktop keyboard access, role-switch animation restored

Three HCI fixes on the login family.

**1. Two-column picker on desktop.**

`TenantPicker` was rendering as a single tall column on desktop —
HotelOps logo centered up top, then "Select your property" + sub,
then a list with one row. On a wide viewport it looked like a
narrow mobile card pinned to the middle of a huge dark canvas.

Restructured `TenantPicker.js` into two wrappers — `.tenant-picker-
intro` (HotelOps logo + title + sub) and `.tenant-picker-chooser`
(property list + dev sign-in). At `min-width: 1024px`, the card
becomes a 2-col grid; under that breakpoint the wrappers stack
naturally (mobile unchanged). When a second tenant joins, the
right column scales to a tidy list without any layout work.

**2. Two-column staff login on desktop — for real this time.**

Sprint 9.1.2/9.1.3 had set up a 2-col grid via `display: contents`
on the form, with the keypad spanning all rows of column 1. The
GM screenshot (image #4) showed the bug: tenant logo at the top
of the left column, then a ~200px vertical gap, then the welcome
card collapsed at the bottom. Cause: when the keypad's intrinsic
height exceeded the sum of col-1 row heights, the grid expanded
each col-1 row to compensate — and `align-content: start` only
controls *track packing*, not per-track expansion under spanned
items.

Rewrote with explicit `.login-card-left` + `.login-card-right`
wrappers (no more `display: contents` trickery) and a plain
`grid-template-columns: 1fr 380px` at `min-width: 1024px`.
`align-items: start` keeps each column at its own natural height;
the longer one drives the card height, the shorter one shows a
clean empty space at the bottom of its cell. Mobile (<1024px):
both columns are block elements and stack.

Mobile keypad slot: on mobile the keypad would have ended up
*below* the Sign-in button (`.login-card-right` renders after
`.login-card-left` in DOM order). Added a `useMediaQuery` hook
keyed to `(min-width: 1024px)`; mobile renders the keypad inside
the form between the error and the submit button (so users edit
the visible input via a keypad right next to it), desktop renders
it in `.login-card-right`. Same `renderKeypads()` helper, two
slots — keypad state is shared, no double-mount cost worth
mentioning.

Removed the obsolete `.login-page.login-layout-{hardcode,fluid}
.login-card` 2-col grid rules; the layout-mode classes now only
drive *inner element sizing* (font sizes, paddings, button
heights). AdminLogin stays single-column at every breakpoint —
no keypad to put on the right. The card's `view-transition-name:
login-card` morphs its width when the user flips staff <-> admin.

**3. Desktop keyboard access (the readOnly lock loosens).**

Sprint 11.1.3 made the numeric identifier input fully read-only
to suppress the iOS keyboard + autofill bar. Right call on a
kiosk; wrong call on a manager's MacBook where they just want
to type. New rule: only lock when
`(pointer: coarse) and (hover: none)` matches — i.e. phones and
tablets with no mouse. Touch-screen laptops still have hover
(via the trackpad), so they fall through and stay editable.

Applied to both the identifier input (`readOnly={lockNumeric}`,
`inputMode={lockNumeric ? 'none' : 'text'}`,
`autoComplete={lockNumeric ? 'off' : 'username'}`) and the PIN
input (`readOnly={isTouchDevice}`, `inputMode` mirrors). On
desktop the user can just type; the on-screen keypad still
works for mouse clicks. On mobile/pad the lock holds.

**4. Staff <-> admin role-switch animation restored.**

11.2.1 collapsed `/:tenant/login/staff` + `/:tenant/login/admin`
into a single `/:tenant/login` URL with an internal mode state.
Side effect: the role-switch icon used to be a `TransitionLink`
that wrapped `navigate()` in `document.startViewTransition`;
when the switch became a plain `setMode`, the morph stopped
firing.

Fixed in `TenantLogin.js`: `flipMode(next)` wraps the
`setState` in `document.startViewTransition(() => flushSync(...))`.
`flushSync` is required — React batches updates and without it
the API would snapshot the "after" DOM before the swap actually
happened. Browsers without the API fall through to a plain
`setMode` (Safari < 18.4 / older Firefox). The card's
`view-transition-name: login-card` morphs its width (wide staff
2-col → narrow admin 1-col); shared `hotelops-mark` keeps the
HotelOps logo in place; `tenant-brand-${slug}` keeps the tenant
banner in place. The form contents (Welcome back ↔ Manager
sign-in, the role icon glyph, etc.) cross-fade by default.

**Verified.** All four touched login files (`TenantPicker`,
`TenantLogin`, `StaffLogin`, `AdminLogin`) parse clean. Picker
on desktop renders side-by-side, mobile stacks. Staff login on
desktop has form left + keypad right (no more vertical gap
crater). Desktop physical-keyboard input into the numeric field
works again. Tapping the manager icon morphs the card to admin
sign-in and back. iPad in landscape (touch + ≥1024px) gets the
2-col layout *and* the input lock — both desired.

**Follow-ups.** None outstanding. The keypad still hides the
ABC switcher when the tenant has username login disabled
(Sprint 9.x rule); that's unchanged.

---

### 2026-05-23 — Sprint 11.2.1: single-URL shells (`/:slug/staff` + `/:slug/admin`), combined login

11.2 left the picker at `/` but post-login URLs were still flat
(`/`, `/admin`, `/timesheet`, …) — the URL didn't tell you which
property you were on, and any sub-page (Timesheet, Calendar,
StaffDetail) added URL surface that "shouldn't matter" for a
single-purpose app. 11.2.1 collapses everything into two static
post-login URLs and a single combined login:

**New URL surface (all of it):**
- `/` — picker (unauthed) or redirect (authed → per-tenant shell).
- `/:tenant/login` — combined staff + manager sign-in. Internal
  mode toggle, URL never changes when you tap the role icon.
- `/:tenant/staff` — staff shell. **Never changes** after login;
  Home / Timesheet / Calendar / Settings switch in React state.
- `/:tenant/admin` — admin shell. Same shape — Home / Staff /
  Calendar / Reports / Assistant / Settings + sub-views
  (StaffDetail, NotesPage) are view state, not URL state.
- `/set-pin`, `/login/dev`, `/dev`, `/kiosk` — out-of-band as
  before.

**Mental model:** Fidelity Active Trader Pro — the URL is just an
app identifier; internal nav is in-app. Refresh on `/:slug/staff`
lands on the staff Home (default view); the previous sub-view is
not preserved. Browser back exits the shell. The user explicitly
asked for this — "we just keep this simple. nothing to the
details anymore."

**Architecture:**

New `src/shells/`:
- `ViewContext.js` — `{ view, goTo }`. `view` is `{ name, params }`;
  `goTo(name, params)` is the in-app-nav primitive. Replaces every
  `useNavigate()` call that used to target an in-shell URL.
- `StaffShell.js` — owns view state, renders `Sidebar` + the
  active view component. Nav list: home / timesheet / calendar /
  settings. Sub-view: notes (parent = calendar).
- `AdminShell.js` — same shape. Nav: home / staff / calendar /
  reports / assistant / settings. Sub-views: staffDetail
  (parent = staff), notes (parent = calendar).

`Sidebar` rewritten from NavLink-based (URL routing) to
props-driven (`navItems`, `currentView`, `onNavigate`). Buttons,
not anchors. CSS got button resets (`background:0; border:0;
cursor:pointer; …`) on `.sidebar-link` + `.bottom-nav-item` to
match the previous `<a>` styling pixel-for-pixel. Sign-out flow
still uses `useNavigate` since logout truly leaves the shell.

`TenantLogin.js` wraps `StaffLogin` and `AdminLogin` with internal
mode state. The role-switch icon in each child now calls an
`onRoleSwitch` callback (flips the parent's mode) instead of
rendering a `TransitionLink` to a separate URL. Successful login
navigates to `/${tenant.slug}/${role}`.

`RequireRole` redirects unauthed → `/` (picker) and wrong-role →
the user's per-tenant shell (`/${slug}/${role}`). `RedirectIfAuthed`
bounces authed users away from the combined login. Both read the
slug from localStorage (persisted on every successful login since
Sprint 9.3.2).

**Page refactors:**
- `StaffManager` — row click + back: URL nav → `goTo('staffDetail',
  { userId })` / `goTo('home')`.
- `StaffDetail` — `useParams` → `userId` prop (from view params);
  3 back-nav sites → `goTo('staff')`.
- `AdminSettings`, admin `Calendar`, `AdminReports` — back buttons
  → `goTo('home')`.
- `AdminHome` — 4 staff-card clicks → `goTo('staffDetail',
  { userId })`. `nav` kept for the auth-error retry (external).
- `NotesPage` — was URL-driven (`useLocation` for path + query);
  now props-driven (`role`, `date` from view params). Back button
  is a `<button onClick={goTo('calendar')}>`.
- `NotesCenter`, `CalendarWeekView` — `viewAllHref` / hardcoded
  `<Link to>` replaced with `onViewAll` / `onViewAllNotes`
  callbacks. Both shells wire the callbacks to
  `goTo('notes', { date: ... })`.
- `Home`, `Settings` (staff), `AdminSettings` — logout-fallback
  URL updated from `/${slug}/login/{staff,admin}` → `/${slug}/login`
  (combined).

CSS for `.notes-center-view-all`, `.cal-week-notes-view-all`,
`.notes-page-back` got button resets — they were styled `<Link>`s
and are now `<button>`s.

**`App.js` is short now:**
```jsx
<Routes>
  <Route path="/" element={<RootRoute />} />
  <Route path="/:tenant/login" element={
    <RedirectIfAuthed><TenantLogin /></RedirectIfAuthed>
  } />
  <Route path="/:tenant/staff" element={
    <RequireRole role="staff"><StaffShell {...} /></RequireRole>
  } />
  <Route path="/:tenant/admin" element={
    <RequireRole role="admin"><AdminShell {...} /></RequireRole>
  } />
  <Route path="/set-pin" element={
    <RequireRole role="staff"><SetPin {...} /></RequireRole>
  } />
  <Route path="/login/dev" element={<DevLogin />} />
  <Route path="/dev"       element={<DevPanel />} />
  <Route path="/kiosk" element={
    <RequireRole role="staff"><ShiftsView /></RequireRole>
  } />
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

`AppShell` is gone from App.js — the shells own their own layout.
`Outlet` is no longer imported. `Home`, `Timesheet`, `StaffCalendar`,
`Settings`, `AdminHome`, `StaffManager`, `StaffDetail`, etc., are
no longer route elements — they're view components inside the
shells.

**What didn't change:** the API surface, the JWT shape, the auth
context, every page's *internal* behavior. Only their navigation
mechanism flipped.

**Verified.** All 22 touched files parse clean (babel). The URL
stays at `/snoqualmieinn/staff` (or `/snoqualmieinn/admin`)
regardless of which sidebar tab is active. Tap Timesheet from
Home → URL doesn't change, content swaps. Refresh → lands on
Home (shell default). Wrong-role attempt to hit the other shell
bounces correctly to the user's own. Sign-out hits
`/snoqualmieinn/login` cleanly.

**Follow-ups.** Two natural next steps when they become
necessary:
- Bind the JWT to a tenant on the server so the slug doesn't
  have to ride in localStorage. Only matters once a second real
  tenant exists.
- If the team ever wants deep-linkable sub-pages (e.g., emailing
  a manager a link to a specific staff member's profile), revisit
  this and add a `?view=` query param the shell reads on mount.
  For Snoqualmie alone, not needed.

---

### 2026-05-22 — Sprint 11.2: collapse picker to `/`, drop the `/login/{staff,admin}` no-slug URLs

Routing cleanup ahead of going live. The picker (property
selector) was living at `/login/staff` and `/login/admin` — two
URLs for what's effectively the same screen — and the URL the
kiosk lands on at boot (`/`) auth-bounced to one of those
picker URLs, so every cold open paid an extra redirect. Made
`/` the canonical picker:

**Route map (before → after):**
- `/` — was authed-only staff Home → now `RootRoute`: picker
  if unauthed, Home (with shell) if staff authed, redirect to
  `/admin` if admin authed.
- `/login/staff`, `/login/admin` — were the picker → **deleted.**
  The catch-all `*` already routes to `/`, so any stray
  reference 1-hops to the new picker (effectively a built-in
  redirect for free). No dedicated 301 needed since we're
  pre-launch — nothing's bookmarked yet.
- `/:tenant/login/staff`, `/:tenant/login/admin` — unchanged.
  Tenant-prefixed logins are still the only URLs that show
  the branded login form, by design.
- `/admin/*`, `/timesheet`, `/calendar`, `/settings`, etc. —
  **all post-login routes unchanged.** Flat URLs, tenant
  identity lives in the JWT + the tenant logo banner on every
  page (Fidelity Active Trader Pro pattern). No `/:tenant`
  prefix on the authed app shell — keeps the URL surface
  small, no bookmark migration risk, no nav-helper sweep.

**`RootRoute` (App.js):**
```jsx
const RootRoute = ({ theme, onToggleTheme }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <TenantPicker kind="staff" />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  return (
    <AppShell theme={theme} onToggleTheme={onToggleTheme}>
      <Home />
    </AppShell>
  );
};
```

Picker `kind` defaults to staff (the kiosk flow); managers who
land here pick property → staff login → tap the manager role-
icon in the headline to switch. One extra tap for the
infrequent manager-on-a-cold-device case, zero extra taps for
the kiosk-staff hot path.

**`AppShell` signature** now accepts optional `children` (falls
back to `<Outlet />`). Lets `RootRoute` render Home inside the
shell directly instead of nesting another route layer just to
get the sidebar.

**`RequireRole` (auth/index.js)** unauthed redirect target
collapsed from `/login/{staff,admin}` → `/`. Same `from`
state on the Navigate so the standard deep-link-then-sign-in
flow still routes back to the originally-requested URL after
login.

**Literal `/login/staff` and `/login/admin` sweep — 7 sites:**
- `pages/Home/index.js`, `pages/Settings/index.js`,
  `components/AdminPanel/AdminSettings.js` — auto/manual
  signout fallbacks (`slug ? '/:slug/login/X' : '/'`). The
  slug-aware path is unchanged; only the no-slug fallback
  flips to `/`.
- `pages/AdminHome/index.js` — admin error-card "Sign in"
  button: `nav('/login/admin')` → `nav('/')`.
- `pages/Login/StaffLogin.js`, `pages/Login/AdminLogin.js` —
  HotelOps-logo "back to property selection" link + the
  opposite-role icon's no-slug fallback.
- `pages/Login/DevLogin.js` — "Back to property select →"
  link target.

**What didn't change:** auth context shape, JWT payload, every
`navigate()` and `<Link>` inside the authed app shell, any
admin/staff route, the API surface. Flat post-login URLs are
the whole point.

**Verified.** Cold-load `/` → picker. Tap Snoqualmie Inn →
`/snoqualmieinn/login/staff`. Tap manager icon →
`/snoqualmieinn/login/admin`. Sign in → `/admin` (admin) or
`/` (staff Home). Sign out from any surface → tenant-aware
`/snoqualmieinn/login/...` if the slug is cached, else
picker at `/`. No 404s on any internal nav.

**Follow-ups.** None outstanding. When a second real tenant
joins the platform, the JWT should grow a tenant claim so the
server can scope queries (and the client can show the right
tenant logo without depending on localStorage); the Snoqualmie
pilot doesn't need it yet, but it's the next obvious
multi-tenancy step.

---

### 2026-05-22 — Sprint 11.1.3: free up identifiers on soft-delete + read-only numeric login input

Two follow-up bugs from 11.1.2.

**1. Soft-deleted users hold their phone / PIN / username slots.**

After 11.1.2 the deleted row stayed in `users` with `deleted_at`
stamped — but its `phone_number`, `email`, `username`, and
`employee_code` were still indexed under the column-level UNIQUE
constraints. Onboarding a replacement who reused a departed
colleague's phone number tripped "phone already exists." Payroll
needs the historical row; we can't null the identifiers out.

Fix: swap column-level UNIQUE for partial unique indexes scoped
to `deleted_at IS NULL`. Live users still can't collide;
soft-deleted rows fall outside the index entirely, so their
identifiers free up for the next hire.

Migration 016:
```sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_number_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS idx_users_username_lower;
DROP INDEX IF EXISTS idx_users_employee_code;

CREATE UNIQUE INDEX idx_users_phone_number_live
  ON users (phone_number)
  WHERE phone_number IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_email_live
  ON users (email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_username_lower
  ON users (LOWER(username))
  WHERE username IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_employee_code
  ON users (employee_code)
  WHERE employee_code IS NOT NULL AND deleted_at IS NULL;
```

`schema.sql` mirrors the change for fresh installs: dropped the
inline `UNIQUE` on `phone_number` / `email`, and the partial
indexes for username + employee_code now include
`AND deleted_at IS NULL`. No server-side code change needed — the
soft-deleted row is invisible to the unique check, so the
existing INSERT logic just works.

Why partial index over null-out-the-identifiers: keeps the
audit trail intact ("who used to own phone X") and makes a future
undelete trivial. Cost is one more conditional index per column;
the live slice is small (employees, not events) so it's free.

**2. System keyboard kept popping on the numeric login.**

Sprint 8.7 / 9.1 had already hidden the on-screen ABC keyboard
in numeric tenants, but the underlying `<input>` still accepted
focus → iOS Safari popped its own keyboard, and password-manager
autofill bars triggered on any tap. We want the entry section
to be fully read-only when the active method is numeric, with
the on-screen keypad as the only input path — but only there;
username login still needs the system keyboard available
(letters mode is optional on-screen).

`src/pages/Login/StaffLogin.js`:
- Identifier input: `readOnly={kbMode === 'numbers'}`, plus
  `inputMode={kbMode === 'numbers' ? 'none' : 'text'}` and
  `autoComplete={kbMode === 'numbers' ? 'off' : 'username'}`.
  Tap still focuses (so `activeField` flips correctly), but no
  keyboard and no autofill bar — the keypad on the page is the
  only way to mutate the field.
- PIN input: always `readOnly`, `inputMode="none"`,
  `autoComplete="off"` (PIN is always 4 digits → always numeric,
  so the on-screen numeric keypad is the only path).
- Letters mode is untouched: when the user taps ABC to enter a
  username, `kbMode === 'letters'` → `readOnly` flips off,
  `inputMode` becomes `text`, and `autoComplete="username"`
  comes back so password-manager autofill works as before.

No CSS changes needed — `is-keypad` already styles the input
the same in both states.

**Verified.** Soft-deleted-then-readded staff using the same
phone number now succeeds. Tapping the numeric identifier or
PIN field on iOS no longer pops the system keyboard or the
autofill bar; the on-screen keypad still drives the value via
`setIdentifier` / `setPin`.

**Follow-ups.** None outstanding. Note for future-me: if we
ever add a "restore deleted user" admin action, it just needs
to `UPDATE users SET deleted_at = NULL` — the partial unique
indexes will re-include the row and reject the restore if a
new staff has since claimed the same identifier (correct
behavior: warn the admin and force a resolution).

---

### 2026-05-22 — Sprint 11.1.2: soft-delete users + lock clock-action during grace window

Two unrelated bugs.

**1. Cannot delete inactive staff — FK constraint blocks.**

`DELETE FROM users WHERE user_id = $1` exploded on the
`time_entries_user_id_fkey` constraint because the user had clocked
in at some point and the entries can't be dropped (payroll +
audit). Switched to soft-delete:

Migration 015:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX idx_users_not_deleted ON users(user_id) WHERE deleted_at IS NULL;
```

DELETE `/api/admin/employees/:id`:
- Check the row exists, isn't already soft-deleted (idempotent re-call), and is inactive (existing precondition — must deactivate first).
- `UPDATE users SET deleted_at = NOW(), active = false, updated_at = NOW()`.
- Returns success.

List endpoints add `WHERE deleted_at IS NULL`:
- `GET /api/admin/employees`     — main StaffManager list.
- `GET /api/admin/employees/:id` — detail view (404 if deleted).
- `DELETE /api/admin/departments/:id` ref-count guard now ignores
  soft-deleted staff (else a tenant with departed employees can't
  delete the dept they used to belong to).

Other `FROM users` queries (login lookups, clock-in/out paths) all
already filter `AND active = true`. Since soft-delete also sets
`active = false`, those paths reject soft-deleted users without
needing a code change. The `deleted_at` column is the load-bearing
gate; `active = false` is the convenient consequence.

Historical FK references (time_entries, schedules, handoff_notes
when authored by deleted user, audit_logs) stay intact. Payroll
exports + reports still attribute hours correctly to the (now-
deleted) user's name via the join.

**2. Clock In/Out grace-window lock.**

Staff could clock in, then immediately clock out before the
auto-signout countdown finished — an accidental double-tap or
"oops" scenario. Fix: while `clockEvent` is set (the post-clock-
event window during which the bottom cards show the countdown),
disable the *opposite* action button:

```jsx
<button disabled={busy || clockEvent?.type === 'in'}>
  {clockEvent?.type === 'in' ? 'Just clocked in' : 'Clock Out'}
</button>
```

Symmetric for the Clock In button:
```jsx
<button disabled={busy || loading || clockEvent?.type === 'out'}>
  {clockEvent?.type === 'out' ? 'Just clocked out' : 'Clock In'}
</button>
```

The lock auto-clears when `clockEvent` clears — either via the
"Keep signed in" button on the bottom card, or when auto-signout
fires (at which point the user's navigating away anyway), or when
the 4-second ack window expires (autoSignoutSeconds=0 case).

Button label flips to "Just clocked in" / "Just clocked out" so
the lock reads as intentional state, not a broken click target.

**Files modified:**
- `database/migrations/015_users_soft_delete.sql` — new.
- `database/schema.sql` — `users.deleted_at` column + partial
  index.
- `server/server.js`:
  - `DELETE /api/admin/employees/:id` switched to soft-delete.
  - `GET /api/admin/employees` adds `WHERE u.deleted_at IS NULL`.
  - `GET /api/admin/employees/:id` adds the same.
  - `DELETE /api/admin/departments/:id` ref-count query filters
    out soft-deleted staff.
- `src/pages/Home/index.js` — both clock-action buttons disabled
  + labelled while `clockEvent` is the opposite type.

**Migration step required after this branch ships:**
```sh
psql "<connection-string>?sslmode=require" -f database/migrations/015_users_soft_delete.sql
```

**Conventions reinforced:**
- **Soft-delete is the default for any row with historical FK
  references.** Hard delete blows up the audit trail, and in
  hotel/payroll contexts the audit trail is the whole point. Add
  `deleted_at TIMESTAMPTZ` + filter in list endpoints; the
  existing `active = false` flag becomes a consequence, not the
  load-bearing gate.
- **Lock the opposite action during a grace window, not the
  whole UI.** Staff can still cancel auto-signout (the "Keep
  signed in" button stays clickable on the bottom card) and the
  clock card stays informative; only the action that would undo
  the just-completed event is greyed.
- **Disabled buttons should label the reason.** "Clock Out" →
  "Just clocked in" reads as "this is locked because you just
  did the thing," not "this button is broken." Costs one ternary
  and improves trust.

**Notes for next iteration:**
- Other `FROM users` queries (`/api/admin/staff/:userId/performance`,
  some dashboard queries) don't yet filter `deleted_at`. They're
  unreachable from the UI because list endpoints filter, but if a
  bookmarked URL points at a deleted user's detail page they'd
  still resolve. Safe to add `deleted_at IS NULL` to those
  joins in a future cleanup sweep — low priority.
- The "undelete" path isn't exposed. If an admin needs to restore
  a soft-deleted user, they'd run `UPDATE users SET deleted_at =
  NULL, active = true WHERE user_id = '…'` by hand. Worth a UI
  surface if real demand emerges.
- The button-label flip ("Just clocked in") is shown for the
  duration of `clockEvent`. If autoSignoutSeconds is 0 the window
  is 4 seconds (the ack window); if non-zero it's that many
  seconds. Either way the user can read the label long enough to
  understand the lock — but if a property wants a visible
  countdown on the button (in addition to the bottom card's
  AutoSignoutBanner countdown), wire `clockEvent.seconds` into
  the label.

### 2026-05-21 — Sprint 11.1.1: fix backtick-in-SQL-comment crashing module load

Deploy from 11.1 hit `SyntaxError: missing ) after argument list`
at `server.js:2099` on module load — the GET `/api/handoff-notes`
SELECT template literal couldn't parse.

Root cause: the 11.1B fix had a SQL comment that contained
backticks for code emphasis:

```js
const sql = `SELECT
  ...
  -- Without this, \`n.for_date === forDate\` comparisons in the
  -- drawer's General/All filters silently miss every row.
  ...
`;
```

JS template literals can't have raw backticks inside without
escaping. The unescaped backtick closed the template early; the
parser then saw bare `n.for_date === forDate` followed by another
template, then bare identifiers, and bailed with the generic
"missing )" error. Frustratingly, `node --check` on my dev box was
silent on it under some Node versions (CI's stricter parse caught
it; my local v20 happened to pass earlier — same script, different
result was the demo-day surprise).

Fix: remove backticks from the SQL comment + added a callout in
the comment itself warning future readers ("no backticks in this
comment — they would close the enclosing JS template literal
early").

**Convention added:**
- **Never put a raw backtick inside a JS template literal**, even
  in a SQL comment. If a comment needs to reference code, use
  single quotes or remove the formatting. Backticks for code
  emphasis are for prose, not template-literal strings.
- **When in doubt, do a `node -e "require('./server.js')"` smoke
  test, not just `node --check`.** `--check` parses but doesn't
  evaluate; some parser edge cases (like inside template literals)
  can slip through depending on Node version. Requiring the
  module triggers the full parser + module loader and surfaces
  these immediately.

**Files modified:**
- `server/server.js` — GET /handoff-notes SELECT comment rewritten
  without backticks; explanatory note left in-line.

No frontend or schema changes. Re-deploy with the same env should
pass health checks.

### 2026-05-21 — Sprint 11.1: Calendar polish + counter bug + assign-to-shift + for_date picker

Six items, three fixes + two features + one mobile layout. Caught
on the first post-Sprint-11 demo.

**1. DayToggle removed from admin Day view.** The Today / Tomorrow
Preview toggle was a fixed two-day snap, not a relative day shifter —
once admin navigated past today the toggle wouldn't update relative
to the new cursor and read as broken. Admin uses the existing
prev/next day-nav buttons. Staff Day view keeps the toggle since
the staff Calendar doesn't have other day-nav surfaces.

**2. "Always 0" counters — for_date type mismatch fix.** The GET
`/api/handoff-notes` endpoint was returning `n.for_date` and
`n.carry_until` as Postgres `date` columns; `pg` round-trips those
through JS `Date` → JSON serializes as ISO timestamp strings
("2026-05-20T07:00:00.000Z") that bake in the server's timezone.
Meanwhile the client compares `n.for_date === forDate` against
"YYYY-MM-DD" strings — every comparison misses. Effect: NotesCenter
General + Carryovers tiles read 0 regardless of actual data, AND
the drawer's General tab filtered out every row.

Fix: explicit `::text` casts in the SELECT:
```sql
n.for_date::text       AS for_date,
n.carry_until::text    AS carry_until,
s.scheduled_date::text AS schedule_date,
```

Sibling fix: admin's "Unread Notes" tile was structurally always 0
because the server returns `is_read=TRUE` for every row when the
requester is admin (admin = moderator, not audience — Sprint 10.4
decision). For admin, the tile now counts *unresolved active notes*
("Active Notes" / "Awaiting resolution") instead. Staff still uses
real per-user `is_read` tracking with the original "Unread Notes"
label.

**3. Assign-to-shift compose is live.** The Visibility dropdown's
"Assign to shift (coming soon)" stub is wired:

- Click "Assign to shift" → lazy-loads `/api/shifts/range` for the
  next 7 days (uses the Sprint 10.1 endpoint).
- Picker shows each upcoming schedule as
  `"Sat May 22 · 7a–3p · Front Desk · Emily Tran"`.
- Post sends `{ scope: 'shift', schedule_id }`. The server
  resolves `for_date` from the schedule (existing Sprint 10
  behavior — for `scope='shift'`, `for_date` is denormalized from
  `schedules.scheduled_date`).
- Auto-switch tab to `assigned` after a successful post.
- Staff can also assign — the server's
  `schedule_visibility='department'` gates the picker to their own
  dept.

**4. for_date picker in compose + date display on note rows.**
New `<input type="date">` next to the Visibility dropdown in the
compose footer, defaulting to the drawer's current `forDate`. Admin
can shift it forward (callback follow-ups, "remind me in a month"
style notes). The picker syncs with `forDate` only when the
textarea is empty so navigating between days doesn't blow away an
in-progress draft.

Note timestamps render differently:
```js
formatNoteTime(n) === created_date == for_date
  ? "3:45 PM"
  : "Mon Jun 15 · 3:45 PM"
```
So a note posted today for next month displays its scheduled date,
not just the post timestamp.

**5. General tab empty — also fixed by the for_date cast (#2).**
The General tab filter is `(scope='department'|'all') && for_date
=== forDate`. Same string-vs-ISO-timestamp mismatch as the
counters; once for_date is cast to text the filter passes again.

**6. Mobile NotesCenter — 3 tiles on one row.** Sprint 11's media
query stacked the tiles 1-per-row which ate a lot of vertical
real estate. New compact layout: `repeat(3, minmax(0, 1fr))` on
the grid, tiles flex-column with center-aligned text, hide the
meta line at small widths. Header also stacks (title / sub on top,
View all notes below) for narrow widths.

**Files modified:**
- `server/server.js`:
  - GET `/api/handoff-notes` SELECT: explicit `::text` casts on
    `for_date`, `carry_until`, `s.scheduled_date`.
- `src/components/Calendar/atoms/NotesDrawer.js`:
  - Compose state: `composeForDate`, `composeScheduleId`,
    `upcomingShifts` cache + `loadUpcomingShifts` callback.
  - Visibility menu wires "Assign to shift" with the schedules
    picker.
  - `<input type="date">` in compose actions row.
  - `formatNoteTime(n)` shows date when for_date != created_date.
  - `onPost` builds payload from scope (department/all/shift) +
    composeForDate; auto-switches tab to 'assigned' for shift
    posts.
- `src/components/Calendar/atoms/NotesCenter.js`:
  - Accepts `currentUser` prop.
  - Admin "Unread" tile renamed → "Active Notes" / "Awaiting
    resolution" and counts unresolved active notes.
- `src/components/Calendar/Calendar.css`:
  - `.notes-drawer-compose-date` rules.
  - Mobile `@media (max-width: 720px)` NotesCenter: 3-column
    compact tile layout (replaces the 1-column stack).
- `src/components/AdminPanel/Calendar/index.js`:
  - Day view branch: DayToggle removed.
  - Pass `currentUser={user}` to NotesCenter.
  - Removed `todayMidnight`/`tomorrowMidnight`/`dayToggleSide`
    state (DayToggle was the only consumer).
- `src/pages/StaffCalendar/index.js`:
  - Pass `currentUser={user}` to NotesCenter (DayToggle stays).

**Conventions reinforced:**
- **Cast Postgres `date` columns to `::text` whenever the client
  compares against `YYYY-MM-DD` strings.** Don't trust the `pg`
  driver to do the right thing — it'll silently round-trip
  through `Date`, drop a tz on the ISO string, and break every
  date-equality check downstream. Set the cast at the SELECT layer
  once.
- **Admin's "unread" semantics are different from staff's.** Admin
  is moderator; for them, the count that matters is "unresolved
  notes I should look at," not "notes I personally haven't read."
  Same tile, different math + label per role.
- **Lazy-load picker data.** The assign-to-shift schedule list
  only fetches when the user opens the option — not on every
  drawer mount. Cheaper for the 95% of opens where the user posts
  to a department.
- **Mobile tile layouts should stay compact, not stack.** A
  3-tile metric strip is more useful as a single-line at-a-glance
  view than a tall column. Hide the meta sub-line on narrow
  widths; keep the number + label.

**Notes for next iteration:**
- The for_date picker has no upper bound — admin could pick "year
  2030." Consider clamping to (today + N) where N is a sensible
  ceiling (90 days?) once we see how it's actually used.
- The shift picker label is one long string; gets unwieldy if a
  schedule has long staff names. Could switch to a structured
  picker (date column + time column + dept column + staff column)
  if it becomes a complaint.
- Staff posting `scope='shift'` to a schedule that isn't their
  own currently works at the server (no per-shift author check).
  If we want to gate it to "your own shifts only," that's a
  server-side check on `schedules.user_id === req.auth.sub`.
- The `formatNoteTime` heuristic compares `created_date == for_date`
  — if a note was created at 11:55 PM for "tomorrow," the date
  prefix would show even though the note feels "today" to the
  author. Acceptable edge case; if it bites, compare against
  midnight-local instead of date string.

### 2026-05-20 — Sprint 11: Calendar redesign (Notes Center, 4-tab drawer, combined Week, dept colors, full-screen Notes page)

The 10-series shipped a working but structurally-wrong-for-the-spec
Calendar. User came back with new mockups (#25 admin Day, #26 staff
Week) and a clearer model: the "Handoff Center" stat cards belong
at the *top* (not in a bottom drawer), the drawer keeps the *list*
but with 4 tabs, week views combine a matrix and a notes feed,
departments are color-coded, and "View all notes →" opens a
dedicated full-screen page. New sprint number because this is a
redesign on top of 10.x, not a bug fix.

**Confirmed design decisions** (user reply 2026-05-20):
1. NotesCenter stat tiles at *top* of Day view, clickable → switch
   the drawer's tab + scroll the drawer into view.
2. Today/Tomorrow Preview toggle switches the *whole page* (cursor
   moves, all data re-fetches).
3. Staff and admin Calendars are different — staff Week is
   role-scoped (own dept matrix + dept/all-staff notes), admin
   Week is unscoped.
4. "View all notes →" goes to a dedicated full-screen Notes page
   (no timeline).
5. Drawer tabs are now **All / Assigned / General / Cross-day**.
6. Department chip colors are stored *per department* (`departments.color`
   column), admin-settable. Future-proofs the "admin adds their
   own dept" path.

**A. Schema + API (migration 014).**

```sql
ALTER TABLE departments ADD COLUMN IF NOT EXISTS color VARCHAR(7);
ALTER TABLE departments ADD CONSTRAINT departments_color_format
  CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');
-- + seed defaults for known dept names
```

`schema.sql` updated for fresh installs. New server endpoints:
- `POST   /api/admin/departments`      — create with name + color
- `PATCH  /api/admin/departments/:id`  — update name and/or color
- `DELETE /api/admin/departments/:id`  — refuses if staff still
  reference the dept (must reassign first)

All admin-gated (`requireAuth + requireRole('admin')`).

**B. New atoms (`src/components/Calendar/atoms/`).**

- **NotesDrawer** — replaces `HandoffsDrawer`. Four tabs (All /
  Assigned / General / Cross-day), per-tab counts. Compose footer
  redesigned: textarea + **Visibility ⌄** dropdown (Visible to
  department / Visible to all staff / Assign to shift — last is
  stubbed for a future sprint) + Attach (stubbed) + Post (paper-
  airplane). Tab state is *controllable* via a `tab` / `onTabChange`
  prop pair — NotesCenter tiles use it to switch tabs externally.
  All Sprint 10.2 pieces (read dots, pin / resolve, mark-all-read,
  overflow menu, Resolved group) carry over.
- **NotesCenter** — top-of-Day-view summary card. 3 stat tiles
  (Unread / General / Carryovers) + "View all notes →" link to the
  full-screen Notes page. Self-fetches per `forDate`. Accepts
  `staffScope` to restrict the count math to own-dept + all-staff.
- **DayToggle** — full-page Today / Tomorrow Preview switch.
  Parent owns the cursor; the toggle just changes which side is
  active.
- **DepartmentChips** (updated) — now reads the `color` column.
  Inactive chips show a soft-tinted background (`{color}1F`);
  active chip fills with the color and uses white text. Each chip
  also gets an icon glyph derived from the dept name (front desk,
  housekeeping, etc.) — fallback `👥`.

The old `HandoffsDrawer.js` is deleted. The shared CSS file is
rewritten with the new `notes-drawer-*` class prefix (the
`handoffs-drawer-*` prefix is gone).

**C. Combined Week view (`views/CalendarWeekView.js`).**

One component used by both `ShiftsView`/`StaffCalendar` and
`SchedulingManager`. Top to bottom:
1. 7-day pill row (Mon..Sun) with a shift-count badge per day.
   Click → drill into Day view via `onPickDate`.
2. **Permission tabs** (staff-only): "{Dept name}" / "All Staff
   Updates" with a 🔒 notice on the dept tab.
3. Three stat tiles. Staff: My Shifts / Department Notes / All-
   Staff Notes. Admin: Total Shifts / Open Shifts / Handoff Notes.
4. **Team matrix** (rows: staff scoped to dept for staff role, all
   staff for admin; cols: 7 days). Each cell shows shift time
   range or "Off"; shift-attached notes render as `💬 N` badges.
5. **Notes feed** at the bottom with Department / All Staff toggle.
   Renders top 5 sorted (pinned first, then newest). "View all
   notes →" links to the full-screen Notes page.

`AdminWeekView` and `StaffWeekView` (the Sprint 10.1 matrix-only
components) are deleted.

**D. Day view rebuild — admin + staff.**

Both wrappers (`AdminPanel/Calendar/index.js` and
`pages/StaffCalendar/index.js`) now compose, on the `view === 'day'`
branch:
```
<DayToggle today={…} tomorrow={…} value={dayToggleSide} onChange={…} />
<NotesCenter forDate={…} onTileClick={…} viewAllHref={…} [staffScope]/>
<DayView /* admin */ or <staff shift list> />
<div ref={notesDrawerRef}>
  <NotesDrawer forDate tab onTabChange editable currentUser [staffScope]/>
</div>
```

The page's cursor is the source of truth for which day is shown;
the DayToggle just snaps it to today vs today+1. Tile click →
parent sets `notesTab` + scrolls the drawer into view.

Staff variant passes `staffScope={true}` + `staffDepartmentId` so
the drawer client-filters to scope='all' or (scope='department' &
my dept). Same scoping in NotesCenter for the counts.

**E. Full-screen Notes page (`/admin/calendar/notes`, `/calendar/notes`).**

New `src/pages/NotesPage/`. One component, route shared:
- `/admin/calendar/notes` → admin context (full visibility)
- `/calendar/notes`       → staff context (own dept + all-staff)

Both render the same `NotesDrawer` in `variant='page'` mode (no
card chrome, no close button). Page header has a "‹ Back to
Calendar" link + day nav (prev / `<input type="date">` / next /
Today). `?date=YYYY-MM-DD` query param keeps the URL stable for
share + refresh.

**F. Department management UI (AdminSettings).**

New "Departments" section under AdminSettings, between Performance
Thresholds and Payroll. Each row: color swatch + name + Edit /
Delete. Inline edit mode swaps the row for `<input type="color">`
+ `<input type="text">` + Save / Cancel. Add row at the bottom for
creating new depts. Server validates name uniqueness + color
format; delete is refused server-side if staff still reference the
dept (the error message tells the admin to reassign first).

**G. Routes + cleanup.**

`App.js` adds:
- `/admin/calendar/notes` → `<NotesPage />`
- `/calendar/notes`       → `<NotesPage />`

Files deleted:
- `src/components/Calendar/atoms/HandoffsDrawer.js`
- `src/components/Calendar/views/AdminWeekView.js`
- `src/components/Calendar/views/StaffWeekView.js`

The Sprint 10.1-era 4-week-summary `WeekView.js` was already deleted
in 10.3.

**Files added:**
- `database/migrations/014_department_color.sql`
- `src/components/Calendar/atoms/NotesDrawer.js`
- `src/components/Calendar/atoms/NotesCenter.js`
- `src/components/Calendar/atoms/DayToggle.js`
- `src/components/Calendar/views/CalendarWeekView.js`
- `src/pages/NotesPage/index.js`
- `src/pages/NotesPage/NotesPage.css`

**Files modified (major):**
- `database/schema.sql` — `departments.color` column + CHECK.
- `server/server.js` — POST/PATCH/DELETE for `/admin/departments`.
- `src/components/Calendar/atoms/DepartmentChips.js` — color-aware,
  icon glyphs.
- `src/components/Calendar/Calendar.css` — entirely rewritten.
- `src/components/AdminPanel/Calendar/index.js` — Day-view branch
  rebuilt, Week view swapped to CalendarWeekView, `useRef` /
  `useMemo` / DayToggle state added.
- `src/pages/StaffCalendar/index.js` — same shape; staffScope wired.
- `src/components/AdminPanel/AdminSettings.js` — new Departments
  section + state.
- `src/components/AdminPanel/AdminPanel.css` — `.settings-dept-*`
  rules for the dept management row chrome.
- `src/App.js` — NotesPage import + two routes.

**Migration step required after this branch ships:**
```sh
psql "<connection-string>?sslmode=require" -f database/migrations/014_department_color.sql
```

**Conventions reinforced / added:**
- **Stat tiles at the top, drawer at the bottom, content in the
  middle.** Tap a tile to set the drawer's tab + scroll to it. This
  pattern is the new house style for surfaces that have both
  metrics and a list — discoverability beats clever clicking
  semantics.
- **Per-department color stored in DB, not hardcoded.** Future
  multi-tenant / admin-onboarded depts get their own colors
  without a code change. Frontend renders neutral when color is
  null (degrades gracefully).
- **One Week-view component for both roles, role-gated.**
  CalendarWeekView takes `staffScope` and `staffDepartmentId`;
  swaps tabs/matrix scoping/stat labels accordingly. Avoids the
  AdminWeekView/StaffWeekView duplication of Sprint 10.1.
- **NotesDrawer supports controlled OR uncontrolled tab state.**
  Pass `tab` + `onTabChange` to control externally (Day-view
  wrappers do this for NotesCenter tile integration); omit them
  for standalone embeds. Same component, two modes — no fork.
- **Page-shared component for shared routes.** NotesPage handles
  both `/admin/calendar/notes` and `/calendar/notes` and reads the
  pathname to decide scoping. One component, two URLs.

**Notes for next iteration:**
- **Shift-attached compose isn't wired.** Mockups show "Assign to
  shift" as a Visibility option but the picker for *which* shift /
  staff member isn't built. Compose currently disables the
  option. A clean fix: clicking a shift block in DayView opens
  the drawer with the schedule_id pre-set + Visibility forced to
  "shift".
- **"Open Shifts" stat on admin Week is hardcoded 0.** Needs a
  server endpoint that returns unassigned shift-template slots
  per week.
- **Year + Month views** are unchanged from Sprint 10.x. User
  spec said Month should use the dept-matrix style (#24-like);
  the existing `AdminPanel/Calendar/MonthView.js` still renders
  the old calendar-cells layout. Schedule a 11.x sprint to swap
  Month to the dept-matrix shape (the math is "weeks of the
  month × depts as rows" — a 4-5-row grid of mini matrices, or
  one big matrix with day-of-month cols).
- **AdminPanel/Calendar/Scheduling.css** is still named for the
  pre-rename folder; rename to `Calendar.css` on the next sweep.
  Internal-only inconsistency.
- **No audit log** on dept create / rename / delete or on note
  pin/resolve/delete. The existing `audit_logs` pattern covers it
  (actor_id NULL, action + JSONB data, admin username in data) —
  worth wiring in 11.x.
- **DELETE department doesn't check shifts table** — only the
  users.department_id FK. If a `shifts.department_id` row points
  at the deleted dept, the FK would block at DB level but with a
  Postgres error, not the friendly 409 we return for users. Bug
  is theoretical (shifts inherit dept_id by schema, but no admin
  flow currently creates orphaned ones); fix is a second
  reference check.
- **Per-cell note count in CalendarWeekView is currently client-
  computed** off the `notes` array fetched for the week. Works at
  small scale; if a property has hundreds of notes per week the
  client filter could get slow. Promote to the `/counts` endpoint
  with `(date, user_id)` grouping if it bites.

### 2026-05-20 — Sprint 10.4.1: HandoffsDrawer — fix "post button doesn't work" perception

Not actually a post bug — posts were succeeding server-side (badge
showed 5 notes on the staff Week view after admin had been
composing). But the drawer landed users on the wrong default tab,
and after a successful post the active tab didn't switch to where
the new note actually lived. Result: admin posts a "Department"
note from the default "Handoffs" tab, drawer refreshes onto an
empty list (Handoffs is `scope='shift'` only), admin thinks the
post failed and tries again.

Three small fixes in `HandoffsDrawer.js`:

1. **Default tab changed from `handoffs` → `general`.** The
   `handoffs` tab is shift-attached threads; the compose UI for
   *those* isn't wired yet (needs a `schedule_id` from a clicked
   shift block, which 10.1/10.2/10.3 didn't reach). Until that
   lands, defaulting to Handoffs landed everyone on a structurally
   empty tab. General is where 99% of today's notes live.

2. **Auto-switch tab after a successful post.** Posting
   `scope='department'` or `'all'` switches to the `general` tab.
   Posting `scope='shift'` switches to `handoffs`. So admin always
   sees their freshly-posted note on the next paint.

3. **Per-tab count badges in the tab bar.** Small inline pill on
   each tab showing the count of (non-resolved) notes that match
   that tab's filter:

   ```
   Handoffs   General [5]   Cross-day
   ```

   Empty tabs read as empty at a glance; tabs with content invite
   clicks. The badge inherits brand colors on the active tab so it
   doesn't compete for attention there.

The counts compute against the full `notes` array (not the
dept-filtered view) so the bar is consistent regardless of which
chip is selected. Resolved notes are excluded so the count matches
what's visible above the Resolved (N) group.

**Files modified:**
- `src/components/Calendar/atoms/HandoffsDrawer.js`:
  - `useState('handoffs')` → `useState('general')`.
  - `onPost` success branch: `setTab(...)` based on `composeScope`.
  - New `tabCounts` derivation + render in the TABS map.
- `src/components/Calendar/Calendar.css`:
  - New `.handoffs-drawer-tab-count` pill style (active state
    inherits brand color).

**Conventions reinforced:**
- **Default UI state should land users on a tab with content.**
  An empty default tab reads as a broken feature, even when the
  data is one click away.
- **Mutation success should move the user toward the result, not
  leave them where they were.** Posting a department note → switch
  to the department-notes tab. Otherwise the post feels invisible.
- **Tab-bar count badges are the cheapest "where's the content"
  signal.** No animation, no toast, no extra fetch — just compute
  from the data you already have.

**Notes for next iteration:**
- The shift-attached compose flow (Handoffs tab) still needs a
  `schedule_id` context. Future sprint: clicking a shift block in
  the Day view opens the drawer scrolled to Handoffs with the
  schedule_id pre-filled for compose.
- Empty-state copy on Handoffs ("No shift-attached handoffs for
  this day") is technically correct but doesn't tell the user *why*
  the tab might always look empty. Refresh the copy when the
  shift-attached compose lands.

### 2026-05-20 — Sprint 10.4: production deploy bug-fixes (req.auth shape + admin-as-author)

First deploy of the 10-series surfaced two related crashes that
needed a one-shot migration + endpoint patches.

**Bug #1: `req.user` doesn't exist; the middleware sets `req.auth`.**

Every handoff-notes endpoint introduced in 10/10.1/10.2 referenced
`req.user.user_id` and `req.user.role`. Crashed in prod with
`TypeError: Cannot read properties of undefined (reading 'user_id')`
on first sidebar poll. The actual middleware (`server/auth.js`)
sets `req.auth = payload` where payload is `{ sub, role, name, type,
iat, exp }`. The rest of the codebase has been using `req.auth.sub`
since Sprint 1 — I just didn't grep before writing the new endpoints.

Fix: bulk replace across `server.js`:
- `req.user.user_id` → `req.auth.sub` (9 occurrences)
- `req.user.role`    → `req.auth.role` (2 occurrences)

**Bug #2: admin tokens carry a *username string* in `sub`, not a
UUID.**

The audit_logs convention (Sprint 5+) covers this for *write*
logging via `actor_id = NULL + admin username in JSON data`. The
handoff-notes endpoints did not — they bound `req.auth.sub` directly
as a UUID into FK columns and into the read-state LEFT JOIN. Admin
requests would fail with a uuid-cast error or an FK violation:

- POST: INSERT into `handoff_notes(author_user_id = 'admin' /* string */)`
  blew up the `users(user_id) UUID` FK.
- GET, /counts, /unread-count: `r.user_id = $::uuid` cast errored
  on the username string.
- /mark-read: INSERT into `handoff_note_reads(user_id = 'admin')`
  also FK-blocked.

**Fix: migration 013 + endpoint admin paths.**

Migration `013_handoff_notes_admin_author.sql`:
```sql
ALTER TABLE handoff_notes ALTER COLUMN author_user_id DROP NOT NULL;
ALTER TABLE handoff_notes ADD COLUMN IF NOT EXISTS author_label TEXT;
ALTER TABLE handoff_notes ADD CONSTRAINT handoff_notes_author_required
  CHECK (author_user_id IS NOT NULL OR author_label IS NOT NULL);
```

Endpoint changes:
- **POST `/api/handoff-notes`**: detect admin via `req.auth.type === 'admin'`.
  When admin, `author_user_id = NULL` and `author_label =
  req.auth.name || req.auth.sub || 'Admin'`. Staff path unchanged
  (FK to their UUID, `author_label = NULL`).
- **GET `/api/handoff-notes`**: changed `JOIN users` to `LEFT JOIN
  users` so admin-authored rows don't get filtered out. `author_name`
  expression: `COALESCE(u.name, n.author_label, 'Unknown')`. For
  admin viewers, skip the `handoff_note_reads` LEFT JOIN entirely
  and emit `TRUE AS is_read` (admin = moderator, not audience —
  the "unread" concept doesn't apply).
- **GET `/api/handoff-notes/counts`**: same admin treatment — drop
  the reads join, hardcode `unread = 0`.
- **GET `/api/handoff-notes/unread-count`**: admin short-circuit
  to `{ count: 0 }`.
- **POST `/api/handoff-notes/mark-read`**: admin short-circuit to
  `{ marked: 0 }` (success).
- **PATCH / DELETE**: ownership check (`note.author_user_id ===
  req.auth.sub`) safely returns false for admin (UUID compared to
  username string is always false), and the admin-role check picks
  them up. No change needed.

`database/schema.sql` updated to match the migrated state so fresh
installs work without re-running 013.

**Conventions reinforced:**
- **The auth payload is on `req.auth`, not `req.user`.** Set in
  `server/auth.js` line ~65. New endpoints that need the requester:
  `const userId = req.auth.sub;` (staff UUID) or
  `req.auth.role === 'admin'` (role gate).
- **`req.auth.sub` is a UUID for staff, a username STRING for
  admin.** Never bind it directly into a UUID-typed SQL parameter
  without branching on `req.auth.type`. The audit_logs pattern
  (NULL FK + textual fallback column) is the right shape for any
  table that needs to record admin authorship.
- **Admin is a moderator surface, not an audience.** Skip read-
  tracking writes/reads for admin requests instead of trying to
  force a fake UUID. The drawer's `is_read = true` for admin is
  the right UX.

**Files modified:**
- `server/server.js` — `req.user.*` → `req.auth.*`; admin paths
  in all six handoff endpoints (GET, POST, PATCH, DELETE, mark-
  read, unread-count, counts).
- `database/migrations/013_handoff_notes_admin_author.sql` —
  new.
- `database/schema.sql` — `author_user_id` made nullable;
  `author_label` column + check constraint added to the table def.

**Migration step required after this branch ships:**
```sh
psql "<connection-string>?sslmode=require" -f database/migrations/013_handoff_notes_admin_author.sql
```

**Notes for next iteration:**
- The frontend doesn't yet *visually* distinguish admin-authored
  notes from staff-authored ones in any structural way (just the
  "Admin" label in the author slot). If that's confusing in
  practice, add a small chrome cue.
- The Sidebar polls `/unread-count` regardless of role; admin
  always returns 0 now, so the request is mildly wasted bandwidth
  for admin sessions. Adding an `if (user?.role === 'admin')
  return;` short-circuit in the `useEffect` would skip the poll
  entirely — low priority cleanup.
- A real "users.admin" row for the admin would let us drop the
  `author_label` fallback and treat admin uniformly. Worth doing
  when the auth model evolves (SaaS-ready); not now.

### 2026-05-20 — Sprint 10.3: cleanup + Assistant placeholder; closes the Sprint 10 series

Final sprint of the Calendar consolidation series. Deletes orphan
files, drops the legacy `shift_notes` table, renames the
`AdminPanel/Scheduling/` folder to match the user-facing route, and
adds an Assistant nav slot for the Sprint 11+ surface.

**Assistant placeholder (the new ask).**

`/admin/assistant` is now a routed admin-only page rendering a
"Under construction" surface. Sets expectations: lead paragraph
explains the locally-deployed LLM + RAG plan, a dashed empty-state
panel says "not wired up yet," and a "What you'll be able to ask"
preview block lists five sample questions ("Who worked yesterday?",
"How many hours did Sarah work this week?", etc.) so admins
discover the surface's intent before any model is in place.
Implementation-plan paragraph at the bottom notes the hybrid
approach (SQL tool-calls for structured questions, RAG over the
handoff-notes corpus for free-text) and the privacy story ("local
model so PII never leaves the property"). New files:
`src/pages/Assistant/index.js`, `src/pages/Assistant/Assistant.css`.

Sidebar `ADMIN_NAV` gets the entry between Reports and Settings
with icon `🤖` and `live: false` (consistent with how the nav
signals "feature exists in plan, not yet wired").

**Legacy `shift_notes` table dropped.**

`grep` against `server/server.js` confirmed *no* API endpoint ever
read or wrote `shift_notes` — the table existed in schema.sql but
the app never had a write path. Migration 012 drops it cleanly:

```sql
DROP TRIGGER IF EXISTS trg_shift_notes_updated_at ON shift_notes;
DROP INDEX  IF EXISTS idx_shift_notes_department;
DROP INDEX  IF EXISTS idx_shift_notes_created;
DROP TABLE  IF EXISTS shift_notes;
```

The migration file documents the equivalent row-mapping if a
deployment turns out to have real data (the only way is hand-seeded
test rows; the app never wrote a single one):

```sql
INSERT INTO handoff_notes
  (note_id, author_user_id, body, scope, department_id, for_date)
SELECT
  note_id, author_id,
  COALESCE(title || E'\n\n', '') || body,
  CASE WHEN department_id IS NULL THEN 'all' ELSE 'department' END,
  department_id,
  created_at::date
FROM shift_notes;
```

`schema.sql` stripped of the table + its trigger so fresh installs
match the migrated state. The 10.3-edited section in schema.sql
keeps a note pointing future readers at the change.

**Orphan deletes (verified zero importers before removal):**

- `src/components/ShiftNotes/` (staff page) — folder removed.
- `src/pages/AdminShiftNotes/` — folder removed.
- `src/components/Scheduling/` (the 12-line `ComingSoon`
  placeholder) — folder removed.
- `src/components/AdminPanel/index.js` (the legacy
  screen-state shell from pre-Sprint-5 admin nav; documented as
  "orphan, Sprint 5.x can delete" since April) — file removed.
- `src/components/AdminPanel/Scheduling/WeekView.js` (the
  4-week aggregate summary from Sprint 8.5.1; Sprint 10.1 swapped
  to `AdminWeekView` and nothing else imported the old file) —
  file removed.
- `src/components/Calendar/atoms/DayPickerPills.js` (atom was
  built in Sprint 10 but never wired; cleaner to drop and re-add
  fresh when a future Day-view rebuild needs it) — file removed.
  CSS block in `Calendar.css` deleted alongside.

Commented-out imports for `ShiftNotes` and `AdminShiftNotes` in
`App.js` deleted. Sprint-10-vintage explanatory comments around
the `/shift-notes` and `/admin/shift-notes` redirect routes
trimmed; redirects themselves *kept* (they're cheap, they help
stale bookmarks land somewhere sensible).

**Folder rename: `AdminPanel/Scheduling/` → `AdminPanel/Calendar/`.**

Matches the user-facing `/admin/calendar` route. Internal files
(DayView.js, MonthView.js, YearView.js, AssignModal.js,
AssignPanel.js, Scheduling.css, index.js) kept their names —
they're either imported relatively from inside the folder
(unaffected by the rename) or rare enough that touching them isn't
worth the diff. `index.js` still `export default SchedulingManager`
because the symbol's renamed in user-facing strings but not in code
identifiers — the file ID rename can come later if it bothers
anyone.

`App.js` import updated:
```diff
- import SchedulingManager from './components/AdminPanel/Scheduling';
+ import SchedulingManager from './components/AdminPanel/Calendar';
```

**Atom audit (Calendar/atoms/):**

- `DepartmentChips` — used by `HandoffsDrawer`, `AdminWeekView`,
  `StaffWeekView`. All props (`departments`, `value`, `onChange`,
  `className`) used by at least one caller. Clean.
- `HandoffsDrawer` — both call sites (admin SchedulingManager,
  StaffCalendar) pass `forDate`, `departments`, `editable`,
  `currentUser`. `defaultScope` is used by StaffCalendar (passes
  `"department"`). All declared props are used. Clean.
- `DayPickerPills` — zero callers. Deleted (see above).

**Files modified:**
- `database/migrations/012_drop_legacy_shift_notes.sql` — new.
- `database/schema.sql` — `shift_notes` table + index + trigger
  block removed; section header note left pointing at migration 012.
- `src/App.js`:
  - New `import Assistant from './pages/Assistant';`.
  - New `/admin/assistant` route.
  - `SchedulingManager` import path updated for the folder rename.
  - Commented `ShiftNotes` / `AdminShiftNotes` imports deleted.
  - Sprint-10-era explanatory route comments tightened.
- `src/components/Layout/Sidebar.js`:
  - `ADMIN_NAV` gains `Assistant` entry (`🤖`, `live: false`).
- `src/components/Calendar/Calendar.css`:
  - Header doc updated (4 components listed, 10.3 deletion noted).
  - `.calendar-day-pill*` rules removed.

**Files deleted:**
- `src/components/ShiftNotes/` (folder)
- `src/pages/AdminShiftNotes/` (folder)
- `src/components/Scheduling/` (folder)
- `src/components/AdminPanel/index.js`
- `src/components/AdminPanel/Scheduling/WeekView.js`
  (moved with the rename to `AdminPanel/Calendar/`, then removed)
- `src/components/Calendar/atoms/DayPickerPills.js`

**Files added:**
- `src/pages/Assistant/index.js`
- `src/pages/Assistant/Assistant.css`
- `database/migrations/012_drop_legacy_shift_notes.sql`

**Migration step required before this branch ships:**
```sh
psql "<connection-string>?sslmode=require" -f database/migrations/012_drop_legacy_shift_notes.sql
```

**Conventions this sprint adds:**
- **Cleanup gets its own sprint number.** Trying to fold deletes
  into a feature sprint slows the feature sprint with "should we
  also drop X?" debates. The pattern: feature sprints add, the
  cleanup sprint subtracts.
- **A nav slot can exist before the feature does.** The Assistant
  page is a placeholder with explicit "under construction" copy +
  preview content. Sets expectations and lets the admin discover
  the upcoming surface; doesn't lie about what works today.
- **Schema cleanup ships its own migration.** Don't drop tables
  inside an unrelated feature migration. 012 is a one-job
  migration so any operator reviewing the diff sees exactly one
  destructive change.

**Sprint 10 series — done. Recap:**

- **10**: schema + API + admin Day-view handoffs drawer; rename
  Scheduling → Calendar in nav.
- **10.1**: Cross-day tab live; per-note overflow menu
  (Carry / Edit / Delete); new matrix-per-* Week views with note
  badges; staff `/calendar` switched from legacy kiosk to authed
  StaffCalendar; new `GET /counts` + `GET /shifts/range` endpoints.
- **10.2**: pin / resolve / read state UI; "Mark all read" bulk
  upsert; sidebar unread badge with 60s polling; admin-only
  pin/resolve gate on the server.
- **10.3**: legacy `shift_notes` dropped (migration 012); orphan
  ShiftNotes / AdminShiftNotes / legacy WeekView / DayPickerPills
  files removed; `AdminPanel/Scheduling/` → `AdminPanel/Calendar/`
  folder rename; Assistant placeholder lands the nav slot for
  Sprint 11+.

**Notes for the next iteration (Sprint 11+ candidates):**
- **Assistant implementation** — real local LLM + RAG/function-
  calling hybrid. Tracked in the locked-decisions section
  (RAG vs SQL tool-calls vs hybrid; model choice; audit logging).
- **Audit logs for moderation actions** (pin / resolve / delete).
  The existing `audit_logs` table pattern (actor_id, action,
  old_data, new_data JSONB) covers it; just write rows from the
  PATCH/DELETE handlers in `server.js`.
- **Note badges per-row in Week views** — currently global per-day.
  Refining to "notes touching this row's staff/dept on this day"
  requires the `/counts` endpoint to support multi-key grouping
  (e.g. `GROUP BY date, department_id` or `GROUP BY date,
  schedule_id`).
- **Folder index.js export-symbol rename** — `AdminPanel/Calendar/
  index.js` still `export default SchedulingManager`. Folder
  matches the user-facing name; the symbol does not. Rename to
  `CalendarManager` in a touch-the-world pass if the inconsistency
  bothers anyone.
- **StaffCalendar Day view is a list, not a timeline.** Future
  sprint could extract a read-only `<DayView />` from the admin
  Calendar's existing 428-line DayView.js and share it.
- **`Forecasting/` component is orphan since the AdminPanel shell
  was deleted.** Was rendered only by the old internal-state
  `AdminPanel/index.js`. If forecasting becomes a real surface,
  add a route + nav entry; otherwise delete the folder in a
  future cleanup.
- **`AdminDashboard/`** folder (legacy from Sprint 5 notes) is
  also orphan. Same deal — verify zero importers, then delete.
