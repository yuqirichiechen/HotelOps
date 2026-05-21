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
