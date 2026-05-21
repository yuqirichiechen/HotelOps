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

#### Sprint 10.1 plan — Cross-day view + Week-view note badges + carry-forward UI

**Scope**: light up the third drawer tab on Day view, add the note
badges that thread through Week view, and make `carry_until`
toggleable from the UI.

**UX:**
- Cross-day tab (`HandoffsDrawer`) gains the Today/Tomorrow toggle
  (#11) with a header summary (Unread / General / Carryovers
  counts). Lists carryover notes by department.
- Each handoff note's overflow menu (`⋯`) gets:
  - **Carry to next** — sets `carry_until = tomorrow`.
  - **Carry to next week** — sets `carry_until = today+7`.
  - **Stop carrying** — clears `carry_until`.
  - **Edit** / **Delete** (author/admin).
- Week views (#12 staff + #13 admin): each shift cell shows a `💬 N`
  badge when there are notes scoped to that shift OR to that
  shift's department on that date. Clicking the badge opens the
  Day view at that date with the Handoffs drawer pre-filtered.

**Server:**
- `GET /api/handoff-notes` gains `[carry=true]` filter to return
  notes where `carry_until >= today`.
- Aggregation endpoint `GET /api/handoff-notes/counts?from=&to=`
  returns `{ date: { total, unread } }` for week-view badges (one
  round-trip instead of one query per cell).

**Frontend:**
- `views/WeekView/StaffWeekView.js` — new, matrix-per-staff (#12).
- `views/WeekView/AdminWeekView.js` — new, matrix-per-dept (#13).
- Both consume the new `counts` endpoint and render badges on
  shift cells.
- `HandoffsDrawer` Cross-day tab fully wired; carry-forward menu
  items added to the note overflow.

**Files modified:**
- `src/components/Calendar/views/WeekView/StaffWeekView.js` — new.
- `src/components/Calendar/views/WeekView/AdminWeekView.js` — new.
- `src/components/Calendar/atoms/HandoffsDrawer.js` — Cross-day tab
  + overflow menu.
- `server/server.js` — counts endpoint + carry filter.

**Conventions this sprint adds:**
- **`carry_until` is set explicitly by the user.** No auto-carry-
  forward when a note isn't acknowledged. Carrying is a deliberate
  admin/staff choice; staleness is a feature, not a bug.

**Acceptance**: Wed has 3 notes carried over from Mon → they appear
on Wed's drawer when set to Today *and* on Tue's drawer when set to
Tomorrow (`carry_until` ≥ Tue). Week view shows `💬 3` on Wed's
shift cells in the relevant department; clicking opens Wed Day view
with the drawer pre-filtered.

---

#### Sprint 10.2 plan — Pinned, resolved, read state

**Scope**: the interaction polish that makes the handoffs drawer
production-ready for actual hotel use. Admin can pin a note to the
top until it's resolved; everyone has unread badges and "mark all
read" works as in mockup #9.

**UX:**
- Admin gains **Pin / Unpin** in the note overflow menu. Pinned
  notes (`pinned_at IS NOT NULL`) sort to the top of the drawer
  list within their scope.
- Admin gains **Resolve** in the note overflow menu. Resolved notes
  (`resolved_at IS NOT NULL`) move to a collapsed "Resolved" group
  at the bottom of the drawer (collapsible).
- Read state: each note has a small filled/unfilled dot indicator
  (right edge) per current viewer. "Mark all as read" button
  becomes functional (single PATCH that bulk-inserts read rows).
- Nav badge: Sidebar's Calendar item shows a small `●` when the
  current user has unread handoffs in the current/next 24h
  window. Polled every 60s.

**Server:**
- `PATCH /api/handoff-notes/:id` accepts `pinned: bool` and
  `resolved: bool` (sets/clears `pinned_at` and `resolved_at`).
- `POST /api/handoff-notes/mark-read` — body
  `{ note_ids: [...] }`; bulk upsert into `handoff_note_reads`.
- `GET /api/handoff-notes/unread-count` — returns
  `{ count: N }` for the current user across visible notes.

**Frontend:**
- Drawer adds the pin/resolve UI + the read-state dot rendering.
- Sidebar polls `/handoff-notes/unread-count` every 60s while
  mounted; badge on Calendar nav when `count > 0`.

**Files modified:**
- `src/components/Calendar/atoms/HandoffsDrawer.js` — pin/resolve
  menu items + read dots + mark-all-read wiring.
- `src/components/Layout/Sidebar.js` — unread badge polling.
- `server/server.js` — three new endpoints + bulk read insert.

**Conventions this sprint adds:**
- **Read state is per-user, not per-note.** A note doesn't get a
  "read by everyone" flag; we always join through
  `handoff_note_reads` filtered by the current user.

**Acceptance**: admin pins a note → it sorts to the top for every
viewer until unpinned. Staff opens drawer → 5 unread notes have
filled dots; tapping "Mark all read" empties them and clears the
sidebar badge. Resolving a note moves it to the "Resolved" group.

---

#### Sprint 10.3 plan — Cleanup + legacy delete

**Scope**: now that the Calendar surface has done a full sprint of
real use, delete the old Shift Notes plumbing and clean up
transitional shims.

**Deletes:**
- `src/pages/ShiftNotes/` (staff) — folder + index + CSS.
- `src/pages/AdminShiftNotes/` — folder + index.
- Any `shift_notes` API endpoints in `server/server.js` that the
  Calendar didn't absorb. If the old `shift_notes` table existed
  separately from `handoff_notes`, write a one-shot migration that
  copies extant rows into `handoff_notes` then drops the old table.
- `/shift-notes` and `/admin/shift-notes` route redirects in
  `App.js` can stay (cheap, helps anyone with stale bookmarks).
- Any leftover Shift Notes nav references in admin dashboards or
  the AdminHome "pending" lists.

**Cleanup touches:**
- Audit `src/components/Calendar/` for dead props on atoms that
  were added speculatively during 10.x. Remove what nothing reads.
- Move any orphaned components from `src/components/Scheduling/`
  (the wrapper kept the same name in 10; if Calendar atoms made it
  redundant, fold it).

**Acceptance**: `grep -ri "shift_notes\|ShiftNotes" src/ server/`
returns zero hits outside of the redirect entries and the
migration file. Running the app from a fresh clone with the
production seed shows no orphan UI / dead code paths.

**Conventions this sprint adds:**
- **Don't fold cleanup into a feature sprint.** It gets its own
  number specifically so feature-sprint reviews don't slow down
  on "should we also delete X?" debates.

---

_(Sprint 10+ work entries get appended below this planning block as
they land. The plan above gets *replaced* in place by the real
post-implementation entry when each sub-sprint ships.)_
