# Claude Instructions — HotelOps

> **Read me first, every iteration.** This file is the single source of truth
> for project structure, conventions, and recent changes. It exists so Claude
> doesn't have to re-explore the codebase from scratch each session — that
> burns tokens and time.
>
> **Future Claude: your job each iteration is to (1) read this file, (2) do
> the work, (3) update the relevant sections + append an entry to the
> Iteration Log at the bottom.** Keep it terse but complete.

---

## 1. Project at a glance

- **What**: HotelOps — workforce management for a hotel (clock in/out,
  scheduling, shift notes, admin tools).
- **Course**: CSS 497 capstone, UDub fifth quarter 2026.
- **Pilot tenant**: Snoqualmie Inn.
- **Long-term**: Generalize to a multi-tenant SaaS. Plan supports `/snoqualmie`,
  `/demo`, etc. via a `:tenant` URL prefix. Keep tenant strings in variables,
  never hard-coded.

## 2. Tech stack

| Layer    | Stack                                                       |
| -------- | ----------------------------------------------------------- |
| Frontend | React 18 (CRA), `react-router-dom` v6, plain CSS + custom Tiempos fonts |
| Backend  | Node 20 + Express 4, `pg` for Postgres                      |
| Database | PostgreSQL 16 (Koyeb / Neon)                                |
| Deploy   | `gh-pages` for frontend (legacy); server runs on Koyeb      |

Single repo. Frontend in `src/`, backend in `server/`, schema/migrations in `database/`.

## 3. Architecture decisions (locked)

### Auth model

- **Two login routes, one shared visual treatment**:
  - `/login/staff` — phone (10 digits) + optional 4-digit PIN
  - `/login/admin` — username + password
- **Staff PIN is per-user, admin-controlled**:
  - Admin toggles PIN-required on/off per employee.
  - Admin can reset (server clears `pin_hash`, sets `pin_must_set = true`).
  - Admin **never sees** any PIN. On reset, employee is forced through a
    "set your PIN" interstitial on next login.
  - Default for new employees: PIN **off** (low-friction clock-in).
- **Admin credentials live in `server/config/admins.json`**:
  - Plaintext `{ username, password, name }` entries.
  - Edit file + redeploy to add/remove admins. No self-registration.
  - File should sit in a private repo. (Capstone-acceptable; revisit when
    going SaaS.)
  - Default seed: `admin` / `admin`.
- **Tokens**: HS256 JWT, 8-hour expiry, secret from `JWT_SECRET` env var.
  Stored in `localStorage` on the client; sent as `Authorization: Bearer <jwt>`.
- **Routes guarded by `RequireRole`** wrapper using `useAuth()` context.

### Routing (Sprint 5 — current)

**Staff** (sidebar shows STAFF_NAV when `user.role !== 'admin'`):
- `/` (Home) — at-a-glance: greeting → **Clock In/Out flip card** (analog `ClockWidget` + Clock In on front; live timer + Clock Out on back) → This-week hours stat → 3 recent shifts.
- `/timesheet` — full timesheet: week selector, hero stat, status pill, 7-day chart, expandable daily breakdown, CSV export (week/month/year).
- `/calendar` — `ShiftsView`. (`/shifts` redirects.)
- `/shift-notes` — placeholder.
- `/settings` — theme toggle, profile, Change PIN, Sign Out.
- `/set-pin` — forced when `pin_must_set === true`.
- `/timeclock` — redirects to `/`.

**Admin** (sidebar shows ADMIN_NAV when `user.role === 'admin'`):
- `/admin` — `AdminHome` dashboard: greeting, stats banner — operational lens (on the clock / coming up today / hours this week / pending OT in hours) — clickable cards swap a single detail card below.
- `/admin/staff` — `StaffManager` (list, grouped by dept; click row → detail). `/admin/employees` 301-redirects here.
- `/admin/staff/:userId` — `StaffDetail` — **performance dashboard** (period selector, 4 stat cards with delta, 8-week trend chart) on top, then existing edit form / PIN management / Time Entries override / deactivate-delete sections.
- `/admin/scheduling` — `SchedulingManager` (week/month views).
- `/admin/shift-notes` — `AdminShiftNotes` placeholder.
- `/admin/reports` — `AdminReports` placeholder.
- `/admin/settings` — `AdminSettings` (visibility config + Sign Out card).

`/login/staff`, `/login/admin` — public entry points.

**Router**: `BrowserRouter`. **Multi-tenant strategy**: path prefix (`/<tenant>/...`). Param can be added later in a single config change.

### Sidebars (role-driven)

- **Staff**: Home → Timesheet → Calendar → Shift Notes → Settings.
- **Admin**: Home → Staff → Scheduling → Shift Notes → Reports → Settings.

The Sidebar component picks the right NAV based on `user.role`. There is no
shared sidebar between staff and admin — admins are not in the `users` table
and don't clock in/out, so staff items don't apply to them. Sign-out lives
in `/settings` (staff) and `/admin/settings` (admin), never in the sidebar.

### Hours / Home dashboard

- Week = Monday → Sunday, navigable to past weeks.
- Dashboard shows: greeting card → hero hours stat → daily bar chart →
  recent shifts list → status pill ("on track" / "approaching overtime" /
  "below schedule").

## 4. File structure (annotated)

```
hotelops/
├── claude-instructions.md          ← THIS FILE. Maintain on every iteration.
├── timeline.md                     ← capstone milestones (separate doc).
├── package.json                    ← frontend (CRA + react-router-dom).
├── server/
│   ├── package.json                ← express, pg, cors, dotenv, jsonwebtoken, bcryptjs.
│   ├── server.js                   ← all API routes (single file).
│   ├── auth.js                     ← JWT + middleware (signToken, requireAuth, requireRole).
│   ├── config/
│   │   └── admins.json             ← admin credentials (plaintext, private repo).
│   └── .env.example
├── database/
│   ├── schema.sql                  ← canonical PostgreSQL 16 schema.
│   ├── teardown.sql                ← drops everything.
│   └── migrations/
│       ├── 002_schedule_custom_times.sql
│       ├── 003_app_settings.sql
│       └── 004_auth_columns.sql    ← PIN columns on users.
├── src/
│   ├── index.js                    ← React entry. Renders <App />.
│   ├── App.js                      ← BrowserRouter, AuthProvider, route guards, theme management.
│   ├── App.css                     ← .app-shell / .app-main layout.
│   ├── index.css                   ← global resets + body font.
│   ├── theme.css                   ← CSS custom properties (light + dark themes).
│   ├── fonts.css                   ← @font-face for Tiempos family.
│   ├── auth/
│   │   └── index.js                ← AuthProvider, useAuth, RequireRole, RedirectIfAuthed, apiFetch.
│   ├── config/
│   │   └── tenant.js               ← single tenant config { slug, name }; multi-tenant-ready.
│   ├── pages/
│   │   ├── Login/
│   │   │   ├── StaffLogin.js       ← /login/staff (phone + optional PIN).
│   │   │   ├── AdminLogin.js       ← /login/admin (username + password).
│   │   │   └── Login.css           ← shared login styling.
│   │   ├── Home/                   ← / dashboard (greeting + hours + chart + recent shifts).
│   │   │   ├── index.js
│   │   │   └── Home.css
│   │   ├── Settings/               ← /settings (theme, profile, change PIN, sign out).
│   │   │   ├── index.js
│   │   │   └── Settings.css
│   │   └── SetPin/                 ← /set-pin interstitial (post admin reset).
│   │       └── index.js            ← reuses Login.css.
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.js          ← desktop sidebar + mobile bottom nav (theme toggle only).
│   │   │   └── Sidebar.css
│   │   ├── TimeClock/              ← /timeclock — uses authed user, no keypad.
│   │   │   ├── index.js            ← thin container around DashboardFace.
│   │   │   ├── DashboardFace.js    ← clock card + week strip + day sheet.
│   │   │   ├── ClockWidget.js, EmployeePanel.js, Keypad.js  ← legacy, no longer rendered (kept for now).
│   │   │   └── TimeClock.css
│   │   ├── ShiftsView/             ← /calendar (sidebar label; component name unchanged).
│   │   │   ├── index.js, ShiftsCalendar.js, ShiftsView.css
│   │   ├── ShiftNotes/index.js     ← placeholder.
│   │   ├── Forecasting/index.js    ← now reachable from /admin → Forecasting (ComingSoon placeholder).
│   │   ├── AdminPanel/
│   │   │   ├── index.js            ← top-level admin shell, route-gated by RequireRole.
│   │   │   ├── AdminHome.js        ← admin module grid. Forecasting now `live: true`.
│   │   │   ├── AdminSettings.js    ← admin app settings (visibility, etc.).
│   │   │   ├── EmployeeManager.js  ← employee list (groups by department).
│   │   │   ├── EmployeeDetail.js   ← per-employee detail; PIN toggle + Reset PIN here.
│   │   │   ├── AdminPanel.css      ← appended .emp-pin-* and .btn-pin-reset rules.
│   │   │   └── Scheduling/         ← admin scheduling (calendar views).
│   │   │       ├── index.js, AssignModal.js, MonthView.js, WeekView.js, Scheduling.css
│   │   ├── AdminDashboard/index.js ← appears unused; verify before touching.
│   │   ├── Scheduling/index.js     ← appears unused (different from AdminPanel/Scheduling).
│   │   └── shared/
│   │       ├── ComingSoon.js, ComingSoon.css
│   ├── services/
│   │   └── timeClock.js            ← LEGACY fetch wrappers (phone-based); not used post-Sprint 2.
│   └── lib/
│       └── supabase.js             ← appears unused (server uses pg); verify.
├── public/index.html
├── build/                          ← gitignored; CRA output.
├── tiempos-font-family/            ← font assets.
├── Procfile                        ← Heroku-style start command.
├── Dockerfile, .dockerignore
└── .github/                        ← CI workflows.
```

## 5. Database schema summary

`schema.sql` is canonical. Migrations are additive (`00X_name.sql`).

Tables: `departments`, `users`, `time_entries`, `approval_requests`, `shifts`,
`schedules` (+ custom times via migration 002), `shift_notes`, `room_types`,
`forecasts`, `audit_logs`, `app_settings` (migration 003).

`users` columns: `user_id` (UUID), `name`, `email`, `role` (ENUM
`employee | front_desk | admin`), `department_id`, `hire_date`,
`base_hourly_rate`, `active`, `created_at`, `updated_at`.

Login identifiers (Sprint 7): `phone_number` (VARCHAR(10), nullable, unique),
`username` (TEXT, nullable, case-insensitive unique via `LOWER()` partial
index), `employee_code` (TEXT, nullable, unique). At least one must be set
per row (`users_at_least_one_identifier` CHECK). Format CHECKs:
`employee_code ~ '^[0-9]{4,6}$'`, username ∈ `[A-Za-z0-9._-]{3,16}` and
must contain a letter.

After Sprint 1: `users` also has `pin_hash`, `pin_required`, `pin_must_set`.

## 6. API surface

### Auth (JWT, HS256, 8h expiry)

- `POST /api/auth/staff/login`           body: `{ identifier, pin? }` → `{ token, user }` — Sprint 7: `identifier` auto-detected (10-digit phone / 4–6 digit employee_code / username with a letter); legacy `{ phone }` still accepted
- `POST /api/auth/admin/login`           body: `{ username, password }` → `{ token, user }`
- `POST /api/auth/staff/set-pin`         body: `{ pin }` (auth) → `{ ok }`
- `POST /api/auth/staff/change-pin`      body: `{ currentPin, newPin }` (auth)
- `POST /api/auth/logout`                auth → `{ ok }` (stateless; client discards token)
- `GET  /api/me`                         auth → current user (with department, has_pin, etc.)

### Me (authed staff dashboard / clock)

- `POST /api/clock-in-self`              auth (staff) → start a time entry for the authed user
- `POST /api/clock-out-self`             auth (staff) → close the open entry for the authed user
- `GET  /api/me/hours?weekStart=YYYY-MM-DD`  auth (staff) → days, totalHours, scheduledHours, recentShifts, currentlyClockedIn, openClockInTime, **entries** (raw time_entries this week)
- `GET  /api/me/entries?from=YYYY-MM-DD&to=YYYY-MM-DD`  auth (staff) → entries in arbitrary date range. Used by Timesheet's month/year CSV export.
- `GET  /api/me/history`                 auth (staff) → time_entries from the last 4 weeks

### Admin (mix of protected and legacy unprotected)

- `GET  /api/health`
- `GET  /api/admin/dashboard`                  auth (admin) — Sprint 5 — aggregated home data (Sprint 6.5.1 added `weekOTTotal` (hours) + `staffWithPendingOT` (per-staff list) computed against `app_settings.overtime_threshold_hours`; also includes `staffHoursThisWeek`)
- `GET  /api/admin/staff/:userId/performance?period=week|month|year`  auth (admin) — Sprint 6 — per-staff metrics (hours, OT split into approved/pending, on-time, shifts, 8-week trend, prev-period comparison)
- `POST /api/admin/staff/:userId/approve-ot?period=week|month|year`  auth (admin) — Sprint 6.2 — flips ot_approved=true on every unapproved entry in range; single audit_logs row per bulk action
- `GET  /api/admin/entries?from=&to=&user_ids=&dept_id=`  auth (admin) — Sprint 6.4 — bulk time-entries query for CSV export; filters by date range plus optional user_ids (comma-sep) or dept_id; returns entries joined with name + department
- `PATCH /api/admin/time-entries/:id`          auth (admin) — Sprint 5 — hour override (writes audit_logs)
- `GET  /api/admin/departments`
- `GET  /api/admin/employees`                  (returns pin_required, pin_must_set, has_pin, plus Sprint 6.3: hours_this_week, is_on_clock, pending_ot_hours; Sprint 7: also `username` + `employee_code`)
- `GET  /api/admin/employees/:id`              Sprint 5 — single employee fetch (powers EmployeeDetail)
- `POST /api/admin/employees`
- `PUT  /api/admin/employees/:id`
- `PATCH /api/admin/employees/:id/status`
- `DELETE /api/admin/employees/:id`
- `PATCH /api/admin/employees/:id/pin`         auth (admin) — body: `{ pin_required }`
- `POST  /api/admin/employees/:id/pin/reset`   auth (admin) — clears hash, sets `pin_must_set = true`
- `GET  /api/admin/employees/:id/time-entries`
- `GET  /api/admin/shift-templates`
- `GET  /api/admin/schedule`, `POST /api/admin/schedule`, `PUT /api/admin/schedule/:id`, `DELETE /api/admin/schedule/:id`
- `GET  /api/shifts/daily`
- `GET  /api/admin/settings`, `PUT /api/admin/settings`

### Legacy (kept for backward compat; phone-based clock-in flow)

- `POST /api/authenticate`               phone-only employee lookup
- `POST /api/clock-in`, `POST /api/clock-out`     (phone-based)
- `GET  /api/user/:phone/history`        phone-based history

## 7. Conventions & gotchas

- **CSS class naming**: components prefix their classes with the component
  name (e.g. `sv-` for ShiftsView, `tc-` for TimeClock, `admin-` for
  AdminPanel). **Don't reuse generic class names across components** — see
  the `.nav-label` collision below.
- **`.nav-label` was a foot-gun**: previously used in both Sidebar AND
  Scheduling.css. Scheduling's `color: var(--brand-text)` made sidebar text
  invisible in light mode. Sidebar's span is now `.sidebar-nav-label`.
  Lesson: prefix nav/icon/label spans by component.
- **Theme variables**: defined in `theme.css` under `:root`,
  `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`,
  `[data-theme="dark"]`, `[data-theme="light"]`. Toggle is in `Sidebar`
  footer for now; will move to `/settings` in Sprint 2.
- **Sidebar background**: `var(--bg-sidebar)` — dark navy in both modes.
  Hardcoded white sidebar text relies on this. Don't recolor `--bg-sidebar`
  light unless you also rework sidebar text colors.
- **Migrations are additive**. Don't edit `schema.sql` for new columns
  without also adding a numbered migration in `database/migrations/`.
- **Clock-in API is currently phone-based**. After Sprint 1, the clock-in
  buttons will pass user_id from the authed session, not phone. Keep the
  legacy `/api/authenticate` route alive until Sprint 2 cutover.
- **localStorage keys**:
  - `hotelops-token` — JWT, set by AuthProvider, cleared on logout.
  - `hotelops-theme` — `'light' | 'dark' | null` (null = follow OS).
  - The old `adminAuth` flag is gone.
- **`apiFetch`** in `src/auth/index.js` is the canonical fetch wrapper —
  always use it for new client API calls. It auto-attaches the
  `Authorization: Bearer` header and returns `{ ok, status, data }`.
- **Existing AdminPanel sub-components still use raw `fetch()`** (no token
  attached). Their endpoints (`/api/admin/employees` CRUD, scheduling,
  settings) are currently unprotected. **The new admin PIN endpoints are
  protected** with `requireRole('admin')` and use `apiFetch`. Sprint 3
  cleanup migrates the rest.
- **Auth-required endpoints** (Sprint 1+2): all `/api/auth/*` (except the
  two login routes), `/api/me*`, `/api/clock-in-self`, `/api/clock-out-self`,
  and `/api/admin/employees/:id/pin*`.

## 8. Files Claude should leave alone

Unless explicitly asked:

- `tiempos-font-family/` — licensed font assets.
- `node_modules/`, `build/`, `package-lock.json`.
- `.github/`, `Dockerfile`, `Procfile` — deploy config.
- `database/teardown.sql` — destructive; only edit on user request.

## 9. How to maintain this file

After each iteration, before handing back to the user:

1. Update **§4 File structure** — add/remove entries to match reality.
2. Update **§6 API surface** — move endpoints from "Planned" to "Existing".
3. Add a one-paragraph entry under **§10 Iteration Log** with date, the
   sprint/task name, files added/removed/modified, and any new gotchas
   that future-you must remember.
4. Update **§3 Architecture decisions** if anything was redesigned.
5. Keep this file under ~500 lines. If it bloats, fold older iteration
   log entries into a "previous iterations" archive at the bottom.

## 10. Iteration log

### 2026-04-28 — Sidebar nav-label color collision fix

- **Issue**: Sidebar link text invisible in light mode. Hover showed faint
  text. Dark mode worked.
- **Cause**: `Scheduling.css` defines `.nav-label { color: var(--brand-text) }`,
  which in light mode is `#1a365d` — same as `--bg-sidebar`. Sidebar's `<span class="nav-label">` inherited that color.
- **Fix**: renamed sidebar span to `.sidebar-nav-label` in `Sidebar.js` +
  `Sidebar.css`. Scheduling left untouched.
- **Files modified**: `src/components/Layout/Sidebar.js`,
  `src/components/Layout/Sidebar.css`.

### 2026-04-28 — Sprint 1 complete: auth foundation

Built the full auth wiring (DB → server → client → routes). Login at
`/login/staff` and `/login/admin` works end-to-end. RequireRole gates the
existing route tree.

**Files added:**
- `database/migrations/004_auth_columns.sql` — adds `pin_hash`,
  `pin_required`, `pin_must_set` to `users`.
- `server/config/admins.json` — admin credentials (default `admin`/`admin`).
- `server/auth.js` — JWT sign/verify, bcrypt PIN helpers, `requireAuth` and
  `requireRole(...)` middleware, admin loader.
- `src/auth/index.js` — `AuthProvider`, `useAuth`, `RequireRole`,
  `RedirectIfAuthed`, `apiFetch` wrapper that auto-attaches `Authorization`.
- `src/config/tenant.js` — single tenant config; ready for multi-tenant.
- `src/pages/Login/StaffLogin.js`, `AdminLogin.js`, `Login.css`.

**Files modified:**
- `database/schema.sql` — `users` table mirrors migration 004.
- `server/package.json` — added `bcryptjs`, `jsonwebtoken`.
- `server/.env.example` — added `JWT_SECRET`.
- `server/server.js` —
  - Added `Authorization` to CORS `allowedHeaders`.
  - Added new auth routes: `POST /api/auth/staff/login`, `POST /api/auth/admin/login`,
    `POST /api/auth/staff/set-pin`, `GET /api/me`, `POST /api/auth/logout`.
  - Legacy `POST /api/admin/login` kept alongside (will remove in Sprint 2).
- `src/App.js` — wraps in `<AuthProvider>`, adds `/login/staff` + `/login/admin`,
  wraps existing routes with `<RequireRole>` via a shared `<AppShell>` outlet.
- `src/components/AdminPanel/index.js` — removed internal `AdminLogin` gate
  (now route-guarded externally); logout uses `useAuth().logout`.
- `src/components/Layout/Sidebar.js` — Admin tab role-gated; added a
  temporary "Sign out" button in the footer (Sprint 2 moves this into Settings).

**Files left in place but now dead-ish (cleanup in Sprint 2):**
- `src/components/AdminPanel/AdminLogin.js` — no longer rendered.
- Legacy `POST /api/admin/login` route in `server.js`.
- Old `localStorage.adminAuth` flag (harmless if present).

**Notes for next iteration:**
- The post-PIN-reset window deliberately allows phone-only login while
  `pin_must_set = true`. Once employee sets a PIN, normal flow resumes.
  See `/api/auth/staff/login` PIN check.
- Token type is in `req.auth.type` (`staff` | `admin`). For staff, `req.auth.sub`
  is `user_id` (UUID). For admin, it's the admin username string.
- TimeClock still has its phone-keypad UI even though the user is already
  authed via login. Sprint 2 strips the keypad for authed users.

**User must run before testing:**
1. `psql "$DATABASE_URL" -f database/migrations/004_auth_columns.sql`
2. Set `JWT_SECRET` in `server/.env` (any long random string for dev).
3. Have at least one row in `users` with a real `phone_number` to test staff login.

### 2026-04-28 — Sprint 2 complete: routes, dashboard, settings, PIN management

Built the staff-side experience end-to-end: new Home dashboard, simplified
TimeClock, Settings with self-service PIN change, admin PIN management, and
moved Forecasting under /admin. Migrated to BrowserRouter. All compile-clean.

**Files added:**
- `src/pages/Home/{index.js, Home.css}` — greeting, hero stat, day bar chart,
  recent shifts, status pill.
- `src/pages/Settings/{index.js, Settings.css}` — theme toggle, profile,
  Change PIN, Sign out.
- `src/pages/SetPin/index.js` — forced "set your PIN" interstitial (uses
  Login.css).

**Files modified:**
- `database/schema.sql`: no further changes (migration 004 still authoritative).
- `server/server.js`:
  - Added `POST /api/clock-in-self`, `POST /api/clock-out-self`,
    `GET /api/me/hours`, `GET /api/me/history`,
    `POST /api/auth/staff/change-pin`,
    `PATCH /api/admin/employees/:id/pin`,
    `POST /api/admin/employees/:id/pin/reset`.
  - `GET /api/admin/employees` and `GET /api/me` now return `pin_required`,
    `pin_must_set`, `has_pin` (and `department` name on `/api/me`).
  - **Removed** legacy `POST /api/admin/login`.
- `src/auth/index.js` — added `changePin` to AuthContext.
- `src/App.js` — `HashRouter` → `BrowserRouter`. New routes: `/timeclock`,
  `/calendar`, `/settings`, `/set-pin`. `/shifts` → 301 redirect to `/calendar`.
  Forecasting dropped from staff route tree.
- `src/components/Layout/Sidebar.js` — final order: Home → Time Clock →
  Calendar → Shift Notes → Settings (+ Admin tab if admin). Sign-out button
  removed (Settings owns it).
- `src/components/TimeClock/index.js` — rewrite: no keypad, uses authed user
  + `apiFetch('/me/history')` + `/clock-in-self` / `/clock-out-self`. The
  `Keypad.js`, `EmployeePanel.js`, `ClockWidget.js` still on disk but unused.
- `src/components/AdminPanel/index.js` — renders `<Forecasting />` when
  `screen === 'forecasting'`.
- `src/components/AdminPanel/AdminHome.js` — Forecasting module now `live: true`.
- `src/components/AdminPanel/EmployeeDetail.js` — added PIN section
  (toggle "PIN required", "Reset PIN" button) using `apiFetch`.
- `src/components/AdminPanel/AdminPanel.css` — appended `.emp-pin-*` and
  `.btn-pin-reset` styles.

**Files deleted:**
- `src/components/AdminPanel/AdminLogin.js` — dead since Sprint 1.

**Conventions reinforced:**
- New client API calls go through `apiFetch` (auto-Authorization header).
  Existing AdminPanel CRUD still uses raw `fetch()` and is unprotected;
  Sprint 3 cleanup will migrate the rest.
- Status pill thresholds: `< 0.7 worked/scheduled` → "Below schedule";
  `< 1.0` → "On track"; `< 1.2` → "Right on schedule"; `>= 1.2` → "Approaching overtime".
- TimeClock now adapts the auth user into the legacy DashboardFace shape
  (`employee = { name, role, clocked_in, clock_in_time }`).

**Notes for next iteration:**
- TimeClock's legacy components (`Keypad.js`, `EmployeePanel.js`,
  `ClockWidget.js`) and `services/timeClock.js` are dead. Safe to remove
  in Sprint 3.
- `/api/authenticate`, `/api/clock-in`, `/api/clock-out`, and
  `/api/user/:phone/history` are also dead client-side. Safe to remove
  server-side too once any external clients are confirmed gone.
- Existing admin CRUD endpoints are still unprotected. Pre-deploy step:
  add `requireAuth, requireRole('admin')` to all `/api/admin/*` routes
  and migrate AdminPanel sub-components to `apiFetch`.

**Sprint 3 — completed (see iteration log).**

### 2026-04-28 — Sprint 3 complete: UX refinements

User feedback drove four targeted changes. No DB or API changes.

**Files modified:**
- `src/pages/Login/StaffLogin.js` — added a compact 3×4 numeric keypad
  (digits + Clear + ⌫) below the form. Auto-jumps focus from phone → PIN
  when phone fills and a PIN is required. System keyboard input still works
  in parallel. The active field gets a focus ring. `KeypadButtons` is a
  small inline component in the same file.
- `src/pages/Login/Login.css` — appended `.login-keypad` / `.lk-btn` styles
  and `.login-field.is-active` highlight state.
- `src/components/Layout/Sidebar.js` — re-added the Sign-out button next to
  the theme toggle. Settings still has its own Sign-out; sidebar gives
  always-visible quick exit.
- `src/components/TimeClock/index.js` — rewritten as a two-faced flip card:
  - Front: greeting + wall clock + big "Clock In" button.
  - Back: "On the clock" indicator + live elapsed timer + "Clock Out".
  - Card flips on each transition (`tc-flip-card.flipped`).
  - Removed week strip, day sheet, history view (those move to Hours page).
  - Uses `/me/history` only to derive the open clock-in entry.
- `src/components/TimeClock/TimeClock.css` — appended `.tc-simple`,
  `.tc-eyebrow`, `.tc-title`, `.tc-clock-display`, `.tc-elapsed`,
  `.tc-action`, `.tc-back-link`, plus pulse + face-fade keyframes.
- `src/pages/Home/index.js` — compact at-a-glance home: compact greeting,
  hero card (this-week hours + clocked-in indicator), 3 recent shifts,
  and a Clock In/Out CTA. Removed bar chart, week navigation, status pill,
  progress bar — those go to the Hours page in Sprint 4.
- `src/pages/Home/Home.css` — full rewrite. New shorter layout, mobile
  breakpoints tightened so phone screens fit without scrolling.

**Conventions reinforced:**
- For digit-only forms (phone, PIN), prefer the inline keypad pattern over
  the system keyboard. Cleaner UX on touch and at the front desk station.
- `.tc-flip-container` / `.tc-flip-card.flipped` is the canonical flip
  primitive — reuse for any "before/after" toggle.
- The Hours page (Sprint 4) inherits the rich dashboard concept from the
  earlier Home version. Don't rebuild — port that layout when it lands.

**Sprint 3 — completed (see iteration log).**

### 2026-04-28 — Sprint 3.1: clock card on Home, Timesheet placeholder

User feedback after Sprint 3: clock-in/out should live on Home (not its own
page), and the flip should be card-level not page-level. Renamed "Time Clock"
sidebar slot to "Timesheet" (placeholder) — Sprint 4 will fill it.

**Files added:**
- `src/pages/Timesheet/{index.js, Timesheet.css}` — blank "Coming soon"
  placeholder.
https://distinguished-sheba-testing-only-438302ff.koyeb.app/login/staff
**Files modified:**
- `src/components/Layout/Sidebar.js` — `STAFF_NAV` reshuffled. Old
  `/timeclock` → "Time Clock" replaced by `/timesheet` → "Timesheet"
  (live: false). Sign-out button (added back in Sprint 3) stays.
- `src/App.js` — added `/timesheet` route (Timesheet placeholder).
  `/timeclock` now `<Navigate to="/" replace />` (preserves any old links).
- `src/pages/Home/index.js` — full rewrite. Adds integrated clock-in/out
  flip card section between the greeting and "This week" hero. Reuses
  `<ClockWidget />` from `components/TimeClock/`. State:
  `currentlyClockedIn` from `/api/me/hours` drives the card flip;
  `openClockInTime` drives the live elapsed timer on the back face.
  Calls `/clock-in-self` and `/clock-out-self`. Notification toast on
  success/error.
- `src/pages/Home/Home.css` — added `.home-clock-flip-container`,
  `.home-clock-flip-card.flipped`, `.home-clock-face`,
  `.home-clock-face-back`, `.home-active-elapsed`, `.home-clock-action`,
  `.home-notif`. Overrides nested `.clock-widget` chrome (transparent
  background, no shadow) so it doesn't double-card.

**Files left in place but now orphan-ish:**
- `src/components/TimeClock/index.js` — the standalone `/timeclock` page
  is no longer reachable (route redirects). Component file stays as
  scaffolding; Sprint 4 may delete or repurpose.
- `src/components/TimeClock/{Keypad,EmployeePanel,DashboardFace}.js` —
  unused. ClockWidget is the only one we still render (now from Home).

**Conventions added:**
- Reuse `<ClockWidget />` for any place that needs the analog+digital
  clock display. When nesting it inside another card, override its outer
  `.clock-widget` styles to `background: transparent; box-shadow: none;
  padding: 0; border: none`.
- Card-level flip pattern: container with `perspective`, child with
  `transform-style: preserve-3d`, two absolute-positioned faces, the back
  pre-rotated `rotateY(180deg)`, and a `.flipped` class on the child that
  applies `rotateY(180deg)`. Same primitive as `.tc-flip-card`.

### 2026-04-28 — Sprint 3.2: unblock mobile scrolling

**Bug:** On mobile (≤768px), pages with content taller than the viewport
(notably Settings — its Sign-out button sits near the bottom) couldn't be
reached. The button only appeared when the user zoomed in.

**Cause:** `src/App.css` had a global mobile `@media` rule on `.app-main`
that locked `height: 100vh; overflow: hidden;`. It was added back when
`/timeclock` was the home and we wanted no scroll. Now with longer pages
(Settings, Timesheet, Calendar) it clips everything.

**Fix:** Trimmed that rule to just `padding-bottom: 64px` for bottom-nav
clearance. Pages now scroll naturally on mobile. Any page that genuinely
wants viewport-locked behavior should opt in on its own root, not via a
global App.css rule.

**Files modified:** `src/App.css`.

### 2026-04-28 — Sprint 4: Timesheet build-out

The Timesheet page is now live. `/timesheet` is no longer a placeholder.

**Files added/promoted:**
- `src/pages/Timesheet/index.js` — rewrote from placeholder to the full
  page. Pulls `/api/me/hours?weekStart=...` and groups the returned
  `entries` by day for the breakdown view. Layout (top to bottom):
  - Header: "Timesheet" eyebrow + week label + nav buttons (‹ This week ›)
    + "↓ Export CSV".
  - Hero card: total worked / scheduled meta on the left, status pill +
    progress bar + percentage on the right.
  - Daily totals chart: 7 bars (Mon–Sun), today gets the accent ring,
    clicking a bar selects+expands its day in the breakdown below.
  - Daily breakdown: each day is a row with chevron, label, "n entries"
    meta, today badge, and bold hours. Clicking expands to show every
    `clock-in → clock-out` pair with per-entry hours.
- `src/pages/Timesheet/Timesheet.css` — full stylesheet (new, replaces
  the placeholder). Mobile breakpoints tighten the header layout, drop
  the entry-count meta, and shrink hero numbers.

**Files modified:**
- `server/server.js` — `GET /api/me/hours` now also returns `entries`
  (raw `time_entries` for the week). Already fetched in the same query;
  it's now in the JSON payload too. Home doesn't read it; Timesheet does.
- `src/components/Layout/Sidebar.js` — `Timesheet` flipped to `live: true`.

**Conventions added:**
- CSV export pattern: build rows in JS, `Blob` → object URL → click a
  hidden `<a>`, then `URL.revokeObjectURL`. No deps. See `exportCSV` in
  `Timesheet/index.js` for the canonical implementation.
- Click-driven cross-component state: the bar chart and the daily
  breakdown share `openDay` state in the parent so clicking either
  surface highlights both.

### 2026-04-28 — Sprint 4.1: Timesheet bug-bash

Five fixes from user feedback. No DB changes.

**Files modified:**
- `server/server.js` — added `GET /api/me/entries?from=&to=` for arbitrary
  date-range entry fetch. Powers month/year CSV exports.
- `src/pages/Timesheet/Timesheet.css` — header rewritten to a calendar-style
  control row: chevrons (`‹` / `›` at 24px, 38×38 buttons) flank the week
  title, "This week" sits next to them, then a flex spacer pushes Export to
  the right. Added `.ts-csv-wrap` / `.ts-csv-menu` for the dropdown. Mobile
  rule no longer over-pads `.ts-card-title` on the chart card (was causing
  "Daily totals" to drift right of "Total worked" / "Daily breakdown").
- `src/pages/Timesheet/index.js` — three behavioral changes:
  - Chevrons + title in a tight `.ts-week-nav` cluster.
  - "↓ Export CSV ▾" opens a menu with **This week** / **This month** /
    **This year**. Click-outside closes it. Each option pulls the right
    range (week from already-loaded data; month/year via `/api/me/entries`).
  - **Overnight shifts split client-side** at midnight. `splitEntryByDay`
    walks an entry day-by-day and emits one segment per calendar day with
    its own start/end and per-day hours. Per-day totals + the chart bars
    + the daily breakdown all use these segment hours, so a 10pm→6am shift
    correctly shows 2h on Mon and 6h on Tue. CSV export uses the same
    splitter so exports reflect actual per-day hours. In-progress overnight
    shifts: live segment shown only on its current day.

**Conventions added:**
- Click-outside dismiss for menu/popover: `useEffect` adds a `mousedown`
  listener while the menu is open, ignores clicks inside the wrapper ref.
- Day boundary helper: `localDayKey(d)` returns `YYYY-MM-DD` in local time
  (avoid `toISOString().split('T')[0]` for day grouping — it can shift days
  near midnight in non-UTC zones).
- Per-day client recomputation pattern: server's `days[].hours` is fine for
  Home (totals only) but Timesheet recomputes from raw entries to handle
  splits. Don't trust server aggregations when entries can cross days.

### 2026-04-28 — Sprint 4.2: Timesheet bug-bash round 2

**Files modified:**
- `server/server.js` — `/api/me/hours` query now uses **overlap-intersect**:
  `clock_in_time < weekEnd AND COALESCE(clock_out_time, NOW()) >= weekStart`.
  Fixes shifts that started before the displayed week vanishing when you
  navigate forward.
- `src/pages/Timesheet/index.js`:
  - **Live segment hours fix.** `splitEntryByDay` now always returns
    `segHours` for every segment, even the live one (elapsed hours up to
    `now`). `isLive` stays a flag for the UI to label "in progress".
    Previously the live segment had `segHours = null`, which the day-total
    reducer dropped — that's why a still-running shift showed `0h 0m` on
    its current day. Symptom matched the user's screenshot perfectly.
  - **In-week segment filter.** After splitting, segments outside the
    displayed week's day keys are dropped before populating
    `entriesByDay` / `dayTotals`. Cross-week shifts now contribute only
    their in-week portion to "Total worked"; the rest is visible when
    you navigate to the corresponding week.
  - Header restructured: eyebrow + date title on a top row, then
    `‹ + This week + › + Export CSV` clustered tight on the next row.
    No flex spacer — Export sits right after the next-chevron and just
    wraps to the next line on phones if needed.
- `src/pages/Timesheet/Timesheet.css` — header rules updated, all four
  controls share `height: 38px` (34px on mobile) so the row is visually
  level. Chevrons stayed at 24px.

**Conventions added:**
- **Server query for week views: overlap-intersect, not start-in-week.**
  An entry counts for a week if any portion overlaps it.
- **Client-side aggregation for cross-day data should be in-window
  filtered.** When showing a week, drop segments that fall outside; only
  sum segments that actually belong to the displayed days.
- **Live segments still contribute hours.** A null `segHours` will get
  silently dropped by reducers — always compute the elapsed time and
  use a separate flag (`isLive`) to label it.

### 2026-04-29 — Sprint 5: admin panel revamp

Big sprint. Replaced AdminPanel's internal screen-state navigation with
proper nested routes; rebuilt AdminHome as a manager dashboard; added
hour override + audit logging; moved sign-out to Settings on both sides.

**Files added:**
- `src/pages/AdminHome/{index.js, AdminHome.css}` — manager dashboard:
  greeting, 4-up stats banner, "On the floor" card (dept-grouped, live
  pulse, 60s auto-refresh), "Today's schedule" card with status pills
  (clocked-in / late / yet-to-start / finished), pending-approvals card.
- `src/pages/AdminReports/{index.js, AdminPlaceholder.css}` — placeholder.
- `src/pages/AdminShiftNotes/index.js` — placeholder (reuses
  AdminPlaceholder.css).

**Files modified:**
- `server/server.js`:
  - `GET /api/admin/dashboard` — single endpoint for the dashboard
    (Promise.all of 6 queries, status derivation in JS).
  - `PATCH /api/admin/time-entries/:id` — admin override; writes to
    `audit_logs` (actor_id NULL since admins aren't users; admin
    username goes in `new_data`); flips `manual_entry = true`.
  - `GET /api/admin/employees/:id` — single-employee fetch for
    EmployeeDetail when reached via deep-link.
- `src/components/Layout/Sidebar.js` — split into STAFF_NAV / ADMIN_NAV.
  Sidebar picks based on `user.role`. Sign-out button removed from footer.
- `src/components/AdminPanel/EmployeeManager.js` — `useNavigate` instead
  of `onBack`/`onSelect`/`onLogout` props. Click row → `nav('/admin/employees/:id')`.
- `src/components/AdminPanel/EmployeeDetail.js` — fetches by `useParams` userId.
  **Adds Time Entries section** with edit modal (datetime-local pickers).
  Save calls `PATCH /admin/time-entries/:id` via `apiFetch`.
- `src/components/AdminPanel/Scheduling/index.js` — `useNavigate` instead
  of `onBack`/`onLogout`.
- `src/components/AdminPanel/AdminSettings.js` — same refactor + adds
  Account/Sign Out card.
- `src/components/AdminPanel/AdminPanel.css` — new rules: `.emp-entries-list`,
  `.emp-entry-row`, `.entry-edit-overlay`, `.entry-edit-modal`,
  `.settings-signout-btn`.
- `src/App.js` — new admin route table:
  `/admin` → AdminHome
  `/admin/employees` → EmployeeManager
  `/admin/employees/:userId` → EmployeeDetail
  `/admin/scheduling` → SchedulingManager
  `/admin/shift-notes` → AdminShiftNotes
  `/admin/reports` → AdminReports
  `/admin/settings` → AdminSettings
  Imports `AdminPanel.css` once at the top so `.emp-*`, `.sched-*`, etc.
  are loaded for every admin route.

**Files orphaned (kept on disk):**
- `src/components/AdminPanel/index.js` — was the screen-state shell.
  No longer rendered. Sprint 5.x can delete.
- `src/components/AdminDashboard/`, `src/components/Scheduling/` (the
  non-admin one), `src/components/TimeClock/{index.js, Keypad.js,
  EmployeePanel.js, DashboardFace.js}`, `src/services/timeClock.js` —
  still orphan.

**Conventions reinforced/added:**
- **Admin sub-components use `useNavigate` + `useParams` directly.** No
  more `onBack`/`onLogout` prop drilling. Settings owns sign-out.
- **Audit log pattern for admin writes:** insert into `audit_logs` with
  `actor_id = NULL`, action string descriptive of the change, `old_data`
  and `new_data` as JSONB snapshots. Admin username goes in `new_data`.
  See `PATCH /api/admin/time-entries/:id` for the canonical pattern.
- **Single-fetch dashboards.** Manager Home does one round-trip
  (`/api/admin/dashboard`) that covers stats + 3 lists. Refresh on a
  60s interval for "currently working" liveness.

**Notes for next iteration:**
- Hour override doesn't yet send a notification or create an
  approval_request copy — it's a direct edit. If the Snoqualmie workflow
  needs dual-admin review, switch to creating an `approval_request` row
  with status='approved' and `approved_by` set, instead of writing to
  `time_entries` directly.
- Today's schedule status logic uses local server time. If admins are in
  multiple timezones, might need a tenant-level timezone config.
- AdminHome auto-refreshes every 60s; could be smarter (only when tab is
  visible, refresh on focus, etc.) — Sprint 5.x polish.

### 2026-05-19 — Sprint 9.2.3: top-bar (HotelOps left, role-switch icon right), bigger sign-in, real non-scroll on mobile

Three threads, one reshuffle.

**Top-bar replaces the 9.2.2 corner badge.** 9.2.2's HotelOps "settle
into the top-right corner" felt cute in the View Transition demo but
in practice the resulting badge was *tiny* (30–40px) and competed
weirdly with the centered tenant banner just below it. GM also wanted
the role-switch (Manager ↔ Staff) more visible — it was a small text
link at the foot of the card and easy to miss. 9.2.3 collapses both
into one horizontal row at the top of the post-pick card:

```
[HotelOps logo md]                    [🔑 role-switch icon]
       ┌──────────────────────────────────┐
       │       [Tenant Banner Logo]       │
       │           Welcome back           │
       │   Sign in with your employee...  │
       │   [______input______]             │
       │   [ Big Sign in button ]          │
       │   [keypad]                        │
       └──────────────────────────────────┘
```

`.login-topbar` is `display: flex; justify-content: space-between;
align-items: center; margin-bottom: 18px`. HotelOps gets `size="md"`
(56px effective on desktop, 42px on mobile) — bigger than the badge
ever was, *and* it's now actually balanced against another element on
the right rather than floating alone in the corner. The role-switch
on the right is a 48px square icon button (42px on phones) styled
like a quieter `.lk-btn`: subtle outline, hover-raised, active-press
scale. Glyph choice mirrors the page's destination role:

- StaffLogin → Admin: `🔑` (manager / key concept).
- AdminLogin → Staff: `👤` (staff / person concept).

`aria-label` + `title` carry the text "Manager sign-in" / "Staff
sign-in" so screen readers and tooltips still surface the
destination. Emoji is consistent with how Sidebar.js renders nav
icons elsewhere in the app — keeps the visual language coherent
without dragging in an icon-library dependency.

**View Transitions still works after the reshuffle.** Just retarget
the named selector from `.login-hotelops-badge .hotelops-logo` to
`.login-topbar-brand .hotelops-logo`. Picker's xl logo → top-bar md
logo still morphs over the 500ms timing tuned in 9.2.2. Tenant-brand
morph (per-row `tenant-brand-${slug}` inline style) is unchanged.

**Bigger sign-in button.** GM said the prior 13px-padded / 15px-font
button read as a hint, not a CTA. Bumped to:

```css
.login-submit {
  font-size: 19px;
  font-weight: 700;
  padding: 16px;
  border-radius: 12px;
  letter-spacing: -0.01em;
}
```

That's a ~52px tall target on desktop, well above tap-target
guidelines. On phones (≤768px) we knock it back slightly (`17px/14px
padding`) so the iPhone-SE math still works out post-9.2.3 — the
button got bigger; the foot row got removed; net change is roughly
neutral on vertical real estate.

**Mobile non-scroll, for real this time.** 9.2.2's lock relied on
mobile content fitting in 100dvh, but the bottom `.login-switch` row
("Manager sign-in →") was 20px (link) + ~14px (margin) of vertical
debt that we'd shaved card padding to barely accommodate. With the
switch row deleted (icon moved into the top-bar) that debt is freed,
and the bigger sign-in button only ate back ~12px of it — so we end
up with ~22px of breathing room on iPhone SE. The `100dvh` lock from
9.2.2 stays; `overflow: hidden` at page level stays. No more rubber-
band scroll, no clipped keypad, no scroll bar reaching for the
bottom-link that used to live outside the viewport.

**Files modified:**
- `src/pages/Login/StaffLogin.js`:
  - Replaced `.login-hotelops-badge` block with `.login-topbar`
    containing `.login-topbar-brand` (HotelOps md) + `.login-role-switch`
    (key emoji TransitionLink to AdminLogin).
  - Deleted the foot `.login-switch` block entirely.
- `src/pages/Login/AdminLogin.js`:
  - Same swap with the inverse role-switch glyph (👤 → StaffLogin).
  - Foot `.login-switch` deleted.
- `src/pages/Login/Login.css`:
  - `.login-hotelops-badge` → `display: none` (kept as legacy guard).
  - New `.login-topbar` flex row, `.login-topbar-brand` flex anchor,
    `.login-role-switch` icon button + hover/active states,
    `.login-role-switch-icon` emoji sizing.
  - View-transition selector retargeted from `.login-hotelops-badge
    .hotelops-logo` to `.login-topbar-brand .hotelops-logo`.
  - `.login-submit` bumped per GM ask (19px/700/16px pad/12px radius).
  - Mobile @media block: topbar-specific shrink (`logo height 42px`,
    `role-switch 42×42`, `icon 20px font`), tenant-logo-wrap
    `max-width: 260` (was 230, no more corner badge competing),
    `.login-submit` `17px/14px pad` to keep iPhone-SE viable.
  - `.login-tenant-logo-wrap` default `max-width` back to 320 (was
    280 for 9.2.2 corner clearance).

**Conventions reinforced/added:**
- **Brand mark belongs in a balanced layout slot, not floating in a
  corner.** A solo top-corner badge reads as "afterthought." Pairing
  it with another element on the opposite side (role-switch, here)
  gives the page a real visual anchor at the top and lets the brand
  mark be a useful size.
- **Role-switch as an icon button at the top, not a text link at the
  foot.** Bottom-of-card text links are easy to miss on a kiosk and
  steal vertical space we need for the non-scroll lock. Top-bar
  icon buttons are persistent, predictable, and don't fight the
  primary CTA.
- **Primary CTA pop > visual subtlety on a kiosk surface.** Staff
  need to see "Sign in" without scanning. Bigger, bolder, slightly
  taller than the rest of the form. Don't apologize for it.
- **Mobile non-scroll lock requires accounting for every row.**
  Bottom links cost ~30–40px each — they're the silent killer of
  "fits in 100dvh." When adding rows, justify them against the
  shrinking-margin tradeoff or accept the breakpoint will move.

**Notes for next iteration:**
- Emoji glyphs render slightly differently across platforms (iOS vs
  Android vs Linux Chrome). Acceptable for now; if a property
  complains, swap to inline SVG with the existing `.login-role-switch`
  styling holding the layout.
- `.login-hotelops-badge` + `.login-attribution` are both
  `display: none` legacy guards. Safe to delete the rules and any
  stale JSX after a cycle of confidence.
- Top-bar HotelOps morph still works for `picker → post-pick` only.
  Navigating from picker direct to dev (or dev → picker) won't morph
  the HotelOps mark because the dev pages don't yet use the
  `.login-topbar` pattern. Worth applying if dev evolves beyond a
  one-knob panel.
- The role-switch is a single icon button per page right now. If a
  future tenant has a third role (housekeeping vs front-desk
  separate from manager), the top-bar might need to grow into a
  segmented control — design now favors that direction (already a
  flex row).

### 2026-05-07 — Sprint 9.2.2: Rakuten-style HotelOps badge morph + mobile non-scroll lock

Two pieces — a brand-identity upgrade and a mobile fit-and-finish bug.

**The Rakuten-inspired morph.** 9.2.1 left a small HotelOps wordmark
at the *foot* of the post-pick login card as an "attribution." It
felt apologetic — and it was eating ~54px of vertical space we needed
for the mobile non-scroll lock. The cleaner pattern is the one Rakuten
uses when activating a deal: their badge swoops onto the page, briefly
"collides" with the site brand, then settles into a small corner
indicator. We're stealing exactly that shape:

- **Picker page** — HotelOps logo big, centered at the top
  (`<HotelOpsLogo size="xl" />` inside `.tenant-picker-header`).
- **Post-pick login page** — same logo as a small badge in the top-right
  corner of the card (`.login-hotelops-badge` → `<HotelOpsLogo size="sm" />`),
  *plus* the tenant's banner logo centered on top.

The morph is pure View Transitions. Both the picker-page logo and
the corner badge get the *same* `view-transition-name`:

```css
.tenant-picker-header .hotelops-logo,
.login-hotelops-badge .hotelops-logo {
  view-transition-name: hotelops-mark;
}
::view-transition-old(hotelops-mark),
::view-transition-new(hotelops-mark) {
  animation-duration: 500ms;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
```

Because `TransitionLink` wraps the navigation in
`document.startViewTransition`, when the user taps a property the
browser snapshots both pages and morphs the named element's bounding
box from "big center" to "small corner" over 500ms. No JS choreography
required — the "collide and settle" is just the geometry interpolation.

We do the same trick for the **tenant logo**: each picker row's
thumbnail gets `viewTransitionName: \`tenant-brand-${slug}\`` via
inline style, and the post-pick page's banner logo gets the same name
keyed off `tenant.slug`. The browser pairs the names, so only the
*picked* tenant's thumbnail morphs into the post-pick banner; the
other rows' thumbs just fade out (default behaviour for elements
present only in the old snapshot). The picked thumbnail visually
"flies up and grows" into the banner while HotelOps "settles" into
the corner — both in the same 500ms window.

Inline style is used (rather than a static class) because the
view-transition-name has to be unique per visible element, but we
don't know which tenant the user will tap. Pre-assigning a
slug-derived unique name to every row means the matching name on the
destination is *always* there for whichever row gets picked.

`.login-hotelops-badge` is `position: absolute; top: 14; right: 14;
pointer-events: none` (decorative, doesn't intercept taps). The card
got `position: relative` to anchor it. The badge is inside `.login-card`
rather than at page level so it participates in the card's view
transition — important because the card itself morphs (already has
`view-transition-name: login-card` from 9.1.x).

Banner clearance: with the corner badge eating ~14+40px of the card's
right edge, the centered banner needs at least that much margin or it
visually overlaps the badge. Default `.login-tenant-logo-wrap`
`max-width` dropped from 320 → 280, mobile capped at 230. Snoqualmie's
2:1 lockup still fits the wrap with breathing room.

The `.login-attribution` class is kept but `display: none`d — there
are likely still callsites in DevLogin / DevPanel that reference it
(plus any future page reusing the login chrome), and dropping the
class with no warning would leave dangling `<div>`s with empty
semantics. Foot attribution still gets dropped at the JSX layer in
StaffLogin / AdminLogin / DevPanel (the CSS rule belt-and-braces it).

**Mobile non-scroll lock.** User reported the staff login was
scrollable on phones. For a kiosk-style clock-in surface, that's a
real bug — staff are tapping numbers and submit, not navigating.
Mobile-browser URL-bar show/hide compounds this by triggering rubber-
band scroll whenever the viewport "jumps."

Fix uses `100dvh` (dynamic viewport height) so URL-bar transitions
don't change the lock target, plus `overflow: hidden` at the page
level so even if content does slightly exceed the lock the page
refuses to scroll. The "if content overflows" case is then a
tightening problem on the card, not a UX bug:

```css
@media (max-width: 768px) {
  .login-page { height: 100dvh; max-height: 100dvh; overflow: hidden; padding: 12px; }
  .login-card { padding: 18px 16px 16px; max-height: 100%; overflow: hidden; }
  .login-tenant-logo-wrap { max-width: 230px; height: 80px; padding: 8px 14px; }
  .login-title { font-size: 22px; margin-bottom: 2px; }
  .login-sub   { font-size: 13px; margin-bottom: 14px; }
  .login-form  { gap: 10px; }
}
@media (max-width: 480px) {
  .login-kb-area.is-numbers-only .login-keypad { gap: 6px; }
  .login-kb-area.is-numbers-only .lk-btn { padding: 14px 0; font-size: 22px; border-radius: 12px; }
}
```

Keypad button touch target stays ≥48px tall after the squeeze
(`padding: 14px × 2 + 22px line ≈ 54px`), well above Material's 44px
guideline. Banner shrinks from 120 → 80px on phones; card padding
goes 36/32/28 → 18/16/16; sub margin tightens. Cumulative savings
~150px — fits the iPhone-SE viewport (667px) with room to spare,
even with the on-screen keypad always rendered. If a future deploy
needs longer fields (e.g. an extra signed-attestation), raise the
768px breakpoint deliberately rather than re-enable scroll silently.

The 9.2.2 attribution removal (~54px savings) is what pushed the
math from "barely fits" to "fits with room." Without that, the
mobile rules would have to be tighter still and the keypad buttons
would dip below the 48px touch-target floor.

**Files modified:**
- `src/pages/Login/Login.css`:
  - `.login-card` → `position: relative` (anchor for badge).
  - `.login-attribution` → `display: none`. New `.login-hotelops-badge`
    (absolute, top-right, pointer-events none).
  - `.tenant-picker-header .hotelops-logo, .login-hotelops-badge
    .hotelops-logo` → `view-transition-name: hotelops-mark`;
    `::view-transition-old/new(hotelops-mark)` tuned to 500ms.
  - `.login-tenant-logo-wrap` → `max-width: 280` (was 320) for badge
    clearance.
  - New `@media (max-width: 768px)` block: 100dvh lock + tightened
    sizes. Existing `@media (max-width: 480px)` keypad block
    tightened further (padding 14 / font 22 / gap 6).
- `src/pages/Login/StaffLogin.js`, `AdminLogin.js`:
  - Added `.login-hotelops-badge` div with `<HotelOpsLogo size="sm" />`
    at the top of the card.
  - Removed `.login-attribution` foot block.
  - Tenant logo `<img>` got `style={{ viewTransitionName:
    \`tenant-brand-${tenant.slug}\` }}` for the morph pair.
- `src/pages/Login/TenantPicker.js`:
  - Each picker-row tenant logo `<img>` got matching
    `viewTransitionName` per row.
- `src/pages/Dev/DevPanel.js`:
  - Removed `.login-attribution` foot block (HotelOps is already the
    main lockup on dev pages — no tenant means nothing to attribute).

**Conventions reinforced/added:**
- **Use View Transitions for cross-page brand choreography.** Pair
  `view-transition-name` on the matching element in the old and new
  pages and let the browser handle the morph. Cheaper and smoother
  than JS animation timelines.
- **Per-instance view-transition names go via inline style.** A
  static class won't work when the name depends on a runtime value
  (the picked tenant's slug); inline style is the clean escape hatch.
- **Pre-assign unique names to *every* candidate origin element.**
  We don't know which picker row the user will tap, so all rows get
  `tenant-brand-{slug}` names. Only the one that matches the
  destination morphs; the others fade.
- **Kiosk-style mobile login locks the viewport.** Use `100dvh` +
  `overflow: hidden` at the page level. If the card content needs
  to grow past the lock, tighten the card sizes — don't re-enable
  scroll silently. Document the breakpoint where the squeeze stops
  fitting so the next person knows the constraint.

**Notes for next iteration:**
- Badge uses the full PNG (icon + wordmark stacked square) sized 40px
  on desktop / 30px on mobile. The wordmark at 30px is barely
  legible; if it bothers anyone, ship an icon-only HotelOps PNG and
  swap it in for the badge use specifically — keep the wordmark
  variant for the picker page hero.
- The hardcoded 768px breakpoint for the non-scroll lock matches the
  tablet-portrait boundary roughly; on a landscape phone or small
  tablet it might leave more room than necessary. Acceptable for
  now; revisit if a tablet-portrait kiosk deploy complains.
- `tenant-brand-{slug}` per-row names work but they're only one
  morph per navigation. If we ever ship a "compare two properties"
  flow it'll need a different pairing model. Out of scope for now.
- `.login-attribution { display: none }` is a defensive shim. After
  one cycle of confidence in the 9.2.2 layout, remove the class
  entirely and any remaining references.

### 2026-05-07 — Sprint 9.2.1: PNG logos + banner tenant lockup + role-toggle relocation + wide-screen gap fix

Four follow-ups to 9.2 that surfaced from a real screen-test:

**1. SVGs → PNGs, with theme-matching backgrounds.** The 9.2 SVGs had
their background plates stripped so they could overlay any card. Two
problems: the icon was rendering tiny in practice (`height: 18px-56px`
across size variants — fine in isolation but barely legible against
the card chrome), and the theme variant swap CSS was inverted relative
to the file naming convention. Pivot: the user supplied
`logo/logo_light.png` + `logo/logo_dark.png` (square 1254x1254) whose
backgrounds *exactly match the app's themed `--bg-base` colors*. So
the PNG sits on the page and its edges disappear into the page —
no need for background stripping, no card-shape artifact.

```sh
cp logo/logo_light.png public/hotelops-light.png
cp logo/logo_dark.png  public/hotelops-dark.png
```

PNG naming convention is **target theme**, not content color:
`hotelops-light.png` is the version designed for *light* theme
(dark mark + wordmark on white background). The 9.2 CSS swap had this
backwards (it was naming by content color), so default light theme
was showing the dark-theme PNG. Fix in `HotelOpsLogo.css`:
```css
.hotelops-logo-img-light { display: block; }  /* default = light theme */
.hotelops-logo-img-dark  { display: none; }
@media (prefers-color-scheme: dark) { /* swap */ }
html[data-theme="light"] /* explicit override beats media query */
```

Also: the PNG has the "HotelOps" wordmark *baked in* (square layout:
H/D mark over the wordmark). So `<HotelOpsLogo />` no longer renders
a separate text span. The `wordmark` prop is kept for source-compat
but ignored. Size variants got much bigger to match the new
self-contained logo: `xl: 140px`, `lg: 96px`, `md: 56px`, `sm: 40px`
(sm gets `opacity: 0.75` for the attribution use).

**2. Banner-style tenant logo on post-pick login.** The 9.2 layout put
the tenant logo in a 64x64 white-card square next to the tenant name.
That worked for square logos but Snoqualmie's lockup is a wide
horizontal banner (1774×887, ~2:1) and got letterboxed into a thin
strip inside the square. 9.2.1 makes `.login-tenant-logo-wrap` a wide
rectangle (max-width 320px, height 120px, padded 14×20) centered at
the top of the card, and `.login-tenant-brand` becomes a flex column
so the logo banner stacks above any fallback content. The separate
`<span className="login-tenant-name">` only renders when no `logoUrl`
is configured — the PNG carries the property name already, so showing
"Snoqualmie Inn" *next to* a logo that already says "Snoqualmie Inn"
is redundant. Pattern in `StaffLogin.js`, `AdminLogin.js`:

```jsx
<div className="login-tenant-brand">
  {tenant.logoUrl ? (
    <span className="login-tenant-logo-wrap">
      <img src={tenant.logoUrl} alt={tenant.name} className="login-tenant-logo" />
    </span>
  ) : (
    <span className="login-tenant-name">{tenant.name}</span>
  )}
</div>
```

Same `.tenant-picker-logo-wrap` widened to 110×56 so the row
thumbnails accommodate horizontal lockups too.

**3. Role toggle (Manager↔Staff) leaves the picker, lives only on the
post-pick login.** 9.2's TenantPicker had a `.login-switch` "Manager
sign-in →" / "Staff sign-in →" link at the bottom. Wrong place to
expose role choice: which roles a property supports is a *per-tenant*
decision (some hotels might not even let managers sign in here), so
the role toggle has to come *after* the user has chosen a tenant.
The picker now shows only the Dev sign-in link (the one secondary
action that genuinely belongs platform-wide). The post-pick StaffLogin
/ AdminLogin pages already had the role toggle — no changes needed
there. Side benefit: the picker page is now visually quieter (one
secondary link instead of two), and the dev link uses the same
`.login-switch` styling as the post-pick toggles for visual
consistency. The bespoke `.tenant-picker-dev` / `.tenant-picker-dev-link`
classes from 9.2 are removed.

**4. Wide-screen two-column gap bug.** The screenshot
(user-supplied) showed the brand at top-left, a ~250px empty gap, then
the Welcome-back / form / sign-in clustered toward the bottom of col
1 — while the right column held the keypad starting from the top.
Root cause: CSS Grid's `align-content` defaults to `stretch` (via
`normal`) for grid containers. With the keypad spanning all rows on
the right (`grid-row: 1 / -1`), the col-1 rows got stretched evenly
to fill the keypad's intrinsic height — distributing the ~100px of
excess across 7 col-1 rows as ~14px extra per row, *plus* the
14px row-gap, doubling the perceived gap between every item.

Fix is one CSS property: `align-content: start` on both two-col
grids (hardcode + fluid). Col-1 stack stays compact at the top; any
extra height in the keypad cell shows as whitespace below the form
— visually fine because the form is what staff actually interact
with, and the keypad already sits aligned to the top of the card.

**Files added:**
- `public/hotelops-light.png`, `public/hotelops-dark.png` — copied
  from `logo/`. The 9.2 SVGs are left on disk as legacy fallbacks
  in case anything still references them; nothing in the React app
  does after 9.2.1.

**Files modified:**
- `src/config/tenant.js` — `HOTELOPS_LOGOS` paths now `.png`; comment
  block updated to reflect the target-theme naming convention.
- `src/components/shared/HotelOpsLogo.js` — dropped the
  `<span className="hotelops-logo-word">` wordmark. `wordmark` prop
  kept as a no-op for source compat. Both `<img>`s still render;
  CSS hides whichever doesn't match the active theme.
- `src/components/shared/HotelOpsLogo.css` — variant-swap fixed to
  match target-theme naming (light PNG shows in light theme).
  Size variants enlarged: xl=140px, lg=96px, md=56px, sm=40px;
  sm also has opacity 0.75 for the attribution use.
- `src/pages/Login/TenantPicker.js` — dropped the role toggle.
  Removed `Link` import (using `TransitionLink` for the dev link).
  HotelOps logo is `xl` now (was already xl, but visually much bigger
  thanks to the resized CSS variant).
- `src/pages/Login/StaffLogin.js`, `AdminLogin.js` — tenant brand now
  renders logo OR fallback name (not both). `<HotelOpsLogo>` calls
  drop the `wordmark` prop.
- `src/pages/Login/DevLogin.js`, `src/pages/Dev/DevPanel.js` — drop
  `wordmark` prop on both `<HotelOpsLogo>` instances.
- `src/pages/Login/Login.css`:
  - `.login-tenant-brand` → flex-column (was flex-row), centered.
  - `.login-tenant-logo-wrap` → wide rectangle (max-width 320, h 120,
    padded). `.login-tenant-logo` uses object-fit contain so square
    *or* rectangular logos fit.
  - `.tenant-picker-logo-wrap` → wider rectangle (110×56) for
    horizontal lockups.
  - `.tenant-picker-dev` / `-link` rules removed; explanatory note
    kept where they used to live.
  - Both `@media (min-width: 1024px)` two-col blocks (hardcode and
    fluid) get `align-content: start` on the grid container.

**Conventions reinforced/added:**
- **Match the logo's PNG background to the page's `--bg-base` per
  theme.** Simpler than background-stripping SVGs and avoids the
  card-shape artifact entirely. Naming convention: file name = target
  theme (`logo_light.png` is for light theme). Keep this consistent
  if more tenant or platform logos get added.
- **Wordmark baked into the brand asset; don't recreate it in HTML.**
  Designing the wordmark in the PNG means font + spacing + color
  match the rest of the brand asset automatically. Sizing the asset
  via `height: …px` and `width: auto` covers all aspect ratios.
- **Role choice belongs after tenant choice.** Don't expose Staff /
  Manager toggle before the user has picked a property — different
  properties can have different role configurations, and the toggle
  options aren't even meaningful until a tenant is selected. Picker
  surface stays focused on its one job.
- **CSS Grid + spanning cell ⇒ explicit `align-content: start`.**
  Default `align-content: stretch` distributes extra spanning-cell
  height across non-spanning rows, ballooning gaps. Pin to `start`
  whenever a single cell spans the entire row track and other rows
  should stay content-sized. Pattern in `Login.css` two-col blocks.

**Notes for next iteration:**
- `.login-tenant-logo-wrap` keeps the white backdrop unconditionally
  (the strategy CSS at `html[data-tenant-logo-strategy="invert"]` can
  still remove it). If a property ever supplies a logo with its own
  matching dark variant, add a `darkLogoUrl` to `KNOWN_TENANTS` and
  extend the brand block to render `<picture>` or theme-swap CSS
  like `HotelOpsLogo` does.
- The 9.2 SVGs in `public/` are unreferenced now. Safe to delete next
  sweep; left in for one cycle in case a backup branch still uses
  them.
- The `wordmark` prop on `<HotelOpsLogo>` is a no-op for source-compat
  but adds noise. After one cycle of confidence in the PNG layout,
  delete the prop entirely from the component signature + callsites.

### 2026-05-07 — Sprint 9.2: real logos, tenant-as-brand login, minimal dev gate

The pre-9.2 login surface used `🏨 HotelOps` as the brand and `{tenant.name}`
as a small subtitle. That had the visual hierarchy backwards: staff at
Snoqualmie Inn aren't signing into HotelOps, they're signing into
Snoqualmie Inn (HotelOps is the platform underneath). 9.2 inverts that
hierarchy — the tenant logo + name is the primary identity; HotelOps
shrinks to a small footer attribution. It also introduces a minimal dev
gate so a single platform-wide knob (tenant logo dark-mode strategy)
isn't sitting in the per-tenant admin settings where every property
manager could flip it.

**Assets.** Designer dropped three files in `/logo/`:
`logo_light.svg` (light theme, has a `#fefefe` background plate as
layer-0), `logo_dark.svg` (dark theme, has a `#01112a` background
plate as layer-2), and `snoqualmieinn.png` (tenant logo, no dark
variant). Strip the SVG background plates so the logos sit cleanly on
any card. The SVGs are line-structured with each layer as a contiguous
`<g>` block — strip via awk line filter, not regex:

```sh
# light: keep header (1–2), skip layer-0 (3–73), keep rest (74+)
awk 'NR==1 || NR==2 || NR>=74' logo/logo_light.svg > public/hotelops-light.svg
# dark: keep header (1–2), skip layer-2 background, keep </svg> (158)
awk 'NR==1 || NR==2 || (NR>=3 && NR<=87) || NR==158' logo/logo_dark.svg > public/hotelops-dark.svg
cp logo/snoqualmieinn.png public/snoqualmieinn.png
```

(One trap: first attempt kept line 157, which is the closing `</g>` of
the dropped layer, not the file's `</svg>`. Result was a broken SVG.
Verify with `tail -3 public/hotelops-dark.svg` after — last line must
be `</svg>`.)

**HotelOpsLogo component.** Theme swap via stacked `<img>` tags toggled
by CSS, not via JS-conditional `src`. Both images render to the DOM;
CSS `display: none` hides the wrong-theme one. This avoids FOUC and
re-fetch when the user toggles theme. Files:
- `src/components/shared/HotelOpsLogo.{js,css}` — new. Size variants
  `xl`/`lg`/`md`/`sm`; optional wordmark span.
- The theme selector chain: `@media (prefers-color-scheme: dark)` as
  the OS default, then `html[data-theme="light|dark"]` overrides for
  the user's explicit toggle (set by App.js's existing theme switcher).

**TenantPicker rewrite.** Full-page layout (matches the staff-login
card dimensions). HotelOps `xl` logo at the top. Each property is a
row showing the tenant's logo + name. New Dev sign-in link at the
bottom (muted, small — not a workflow staff or managers should see).

```jsx
<TransitionLink to={`/${t.slug}/login/${kind}`} className="tenant-picker-row">
  <span className="tenant-picker-logo-wrap">
    <img src={t.logoUrl} alt="" className="tenant-picker-logo" />
  </span>
  <span className="tenant-picker-name">{t.name}</span>
  <span className="tenant-picker-arrow" aria-hidden>›</span>
</TransitionLink>
```

Empty-logo fallback uses the tenant's first character (`.tenant-picker-logo-empty`)
so the layout doesn't collapse if `logoUrl` is null.

**Post-pick login pages (Staff + Admin).** Replace
`<div className="login-brand">🏨 HotelOps</div>` +
`<div className="login-tenant">{tenant.name}</div>` with a single
`.login-tenant-brand` block: tenant logo (64px, white-card backdrop)
+ tenant name in 22px Tiempos Headline. HotelOps shrinks to a small
attribution at the foot of the card via `<HotelOpsLogo size="sm" wordmark />`
inside `.login-attribution`.

**The dark-mode logo problem (HCI call).** Snoqualmie's logo only ships
in colored PNG — no dark variant. Three options surfaced; admin picks
per-deployment via `tenant_logo_dark_strategy`:
- `card` (default) — wrap logo in a white-backdrop pill. Works for any
  colored logo. Some visual mismatch with a fully dark page, but the
  logo always renders correctly.
- `invert` — drop the backdrop, apply `filter: invert(1) hue-rotate(180deg)`.
  Looks best for monochrome / two-tone logos. **Wrong for colored
  logos** (Snoqualmie's would look like a photo negative).
- `force-light` — pin the login pages to light theme regardless of the
  user's preference. Heavy-handed but bulletproof if the tenant
  absolutely won't tolerate any dark-mode rendering of their brand.
  Implemented by setting `document.documentElement.dataset.theme =
  'light'` in the login pages' public-config effect.

Default to `card` because it works for *any* logo without per-tenant
dark assets. `invert` and `force-light` are escape hatches the dev
flips if a particular tenant pushes back.

**Strategy plumbing.** CSS rules already key on `html[data-tenant-logo-strategy="invert"]`,
so the JS only needs to set that dataset. Done in two places:
- `TenantPicker.js` — picks up strategy on mount so the picker
  thumbnails honor it before the user picks a tenant.
- `StaffLogin.js` — re-applies on the per-tenant page (handles
  deep-links that skip the picker via DNS shortcuts; admin deep-links
  also work via picker → admin path).

Both pages call `fetch('/api/public-config')` and apply:
```js
if (strat === 'invert' || strat === 'force-light' || strat === 'card') {
  document.documentElement.dataset.tenantLogoStrategy = strat;
  if (strat === 'force-light') document.documentElement.dataset.theme = 'light';
}
```

Strategy CSS covers both `.tenant-picker-logo` (small picker
thumbnails) and `.login-tenant-logo` (the big 64px post-pick logo).

**Minimal dev gate.** `dev` / `dev` hardcoded client-side login at
`/login/dev`. Auth is just a `'hotelops-dev-auth' = 'true'` localStorage
flag — not server-backed. Intentionally minimal: dev work the property
admins shouldn't touch is currently just one knob; a real dev role can
ship in a later sprint if the surface grows. `DevPanel` at `/dev`
gates on `isDevAuthed()` (Navigate to `/login/dev` if not) and exposes
the strategy as three radio cards.

**Files added:**
- `public/hotelops-light.svg`, `public/hotelops-dark.svg`,
  `public/snoqualmieinn.png` — processed assets.
- `src/components/shared/HotelOpsLogo.{js,css}` — theme-aware logo
  with size variants.
- `src/pages/Login/DevLogin.js` — hardcoded dev/dev gate. Exports
  `isDevAuthed()` and `clearDevAuth()` for use by DevPanel and any
  future dev-gated route.
- `src/pages/Dev/DevPanel.js` — single section (strategy radios), save
  + saved-toast + sign-out.

**Files modified:**
- `src/config/tenant.js` — `KNOWN_TENANTS` now carries `logoUrl` and
  `darkLogoUrl` per tenant. New `HOTELOPS_LOGOS = { light, dark }` map
  consumed by `HotelOpsLogo`. `resolveTenant(slug)` unchanged — still
  returns null for unknown slugs so the routes can 404 cleanly.
- `src/pages/Login/TenantPicker.js` — full rewrite per above.
- `src/pages/Login/StaffLogin.js` — `.login-brand` + `.login-tenant`
  replaced by `.login-tenant-brand`. Added `<HotelOpsLogo size="sm">`
  attribution at card foot. Public-config effect picks up
  `tenant_logo_dark_strategy`.
- `src/pages/Login/AdminLogin.js` — same brand + attribution treatment.
- `src/pages/Login/Login.css` — added `.login-tenant-brand`,
  `.login-tenant-logo`, `.login-tenant-logo-wrap`, `.login-attribution`,
  `.tenant-picker-*` (header / list / row / logo / dev link),
  `.dev-section` / `.dev-strategy-*` / `.dev-signout`. Dark-mode
  strategy block targets both picker thumbnails and post-pick logo.
- `src/App.js` — added routes `/login/dev` → `DevLogin` and `/dev` →
  `DevPanel`. Both unauthenticated (dev auth is client-side).
- `server/server.js` — added `tenant_logo_dark_strategy` to settings
  ALLOWED validator (`['card', 'invert', 'force-light']`) and to
  `/api/public-config` defaults + SELECT + parse path.

**Conventions added:**
- **Tenant brand > platform brand on login pages.** The property's
  logo + name is the primary identity; HotelOps is small attribution
  at the foot. Reverse this only if there's a deliberate reason
  (e.g. a generic SaaS landing surface).
- **White-card backdrop is the default dark-mode strategy for tenant
  logos.** Works for any colored logo, no per-tenant dark asset
  required. `invert` and `force-light` exist for the rare tenant who
  needs them; dev panel flips between them.
- **Theme swap via stacked imgs, not src toggling.** Both variants
  ship to the DOM, CSS hides the wrong one. Avoids FOUC and re-fetch
  on theme toggle. Pattern in `HotelOpsLogo.css`.
- **SVG background-plate stripping is line-filter awk, not regex
  surgery.** Identify the layer ranges (each layer is a contiguous
  `<g>...</g>`), keep header (`<?xml`, `<svg>`), drop the bg layer's
  lines, keep `</svg>` close. Verify with `tail -3`.
- **Dev gate is client-side localStorage, not a server role.** Until
  the dev surface grows beyond a single knob, the simpler gate is
  enough. Don't bake `dev` as a role into the JWT / RequireRole
  scheme yet.

**Notes for next iteration:**
- AdminLogin doesn't fetch public-config on its own — strategy
  application relies on TenantPicker having run first. Works for the
  picker → login flow; would break for a direct deep-link to
  `/:tenant/login/admin`. If that becomes a real path, add the same
  fetch effect there.
- Dev auth uses a single shared `dev`/`dev` credential — fine for
  one-developer capstone scope. SaaS roll-out should replace with a
  server-issued JWT and a real dev role.
- The HotelOps logo's wordmark uses the existing TiemposHeadline
  stack; if branding diverges from Tiempos in the future, swap the
  font in `.hotelops-logo-word`.
- `force-light` pins theme via `dataset.theme = 'light'` on the login
  pages only; once the user lands in the app the user's stored
  preference takes over again. Acceptable for the login surface;
  revisit if the strategy should also pin in-app pages.



Two interconnected things — fix the visible regression from 9.1.2 *and*
expose a layout-mode choice in admin settings so future kiosk variants
can opt into truly fluid sizing without touching code.

**The bug.** 9.1.2's two-column layout used `grid-row: 1 / 100` on
the keypad to "span all current and future rows" of the form's grid.
That sounded clever and was wrong: CSS grid distributes a multi-row
item's intrinsic height across all spanned rows. With only ~4 col-1
items occupying rows 1–4 and 95 *phantom* rows 5–99, the keypad's
~400px content height got distributed across all 99 rows. Net result:
the form's height stretched well beyond what the keypad actually
needed; the .login-card became absurdly tall on laptops, and the
Manager-sign-in link landed hundreds of pixels below the keypad with
empty space in between. User screenshot showed exactly this.

**The fix.** Replace the spanning trick with `display: contents` on
`.login-form`. With `display: contents`, the form element loses its
own layout box and its children become *direct children* of
`.login-card`. The card is the grid container now, with all the
"left column" items (brand, tenant, title, sub, fields, error,
submit, switch) auto-placing in col 1 and the keypad pinned to col 2
with `grid-row: 1 / -1` — which spans *exactly* the rows that exist,
no phantom rows. The form keeps its submit semantics; the layout
collapses to the keypad's actual height.

```css
.login-page.login-layout-hardcode .login-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 380px);
  /* ... */
}
.login-page.login-layout-hardcode .login-card > * { grid-column: 1; }
.login-page.login-layout-hardcode .login-form { display: contents; }
.login-page.login-layout-hardcode .login-form > .login-kb-area {
  grid-column: 2;
  grid-row: 1 / -1;
}
```

**The layout-mode toggle.** New admin setting
`staff_login_layout` ('hardcode' | 'fluid', default 'hardcode').
StaffLogin reads it from `/api/public-config` and applies
`.login-layout-hardcode` or `.login-layout-fluid` to `.login-page`.

- **Hardcode** (default): everything sizes at fixed breakpoints
  (the current behavior). Predictable, easier to test at known
  widths.
- **Fluid**: button padding/font-size, card max-width, gaps, and
  field font-size all use `clamp(min, vh+vw expression, max)` so
  the page scales continuously with both viewport dimensions at
  once. `max-height: 100vh - 24px` + `overflow-y: auto` on the
  card means truly tiny viewports scroll *internally* rather than
  pushing the page tall. The 1024px breakpoint for the two-column
  *shape* change is preserved — layout-shape switches are still
  discrete — but sizing inside each shape is continuous.

Admin section: a two-button card-style selector under the existing
keyboard section, since layout sizing is tied to keypad behavior.
Help text walks through when each mode is better.

**Files modified:**
- `server/server.js` — `staff_login_layout` in settings ALLOWED
  + `/api/public-config` response (default 'hardcode').
- `src/components/AdminPanel/AdminSettings.js` — `loginLayout`
  state, fetch / save wiring, new two-button mode toggle in the
  hide-abc section.
- `src/components/AdminPanel/AdminPanel.css` — `.settings-mode-*`
  classes for the layout-mode toggle (card-style buttons with
  label + description; responsive grid).
- `src/pages/Login/StaffLogin.js` — `layoutMode` state from
  public-config; `.login-page` className interpolates the mode.
- `src/pages/Login/Login.css` — replaced 9.1.2's at-1024 rules
  with mode-scoped versions; hardcode mode uses `display:
  contents` + `grid-row: 1 / -1`; fluid mode uses clamp()-based
  sizing throughout + same two-column layout at ≥1024.

**Conventions added:**
- **Never use `grid-row: 1 / 100` to span a variable-row column.**
  CSS grid distributes a multi-row item's height across all
  spanned rows, including phantom ones. If the spanned rows are
  mostly empty (because the *other* column has fewer items), the
  layout stretches absurdly. Use `display: contents` on the inner
  container so children become direct grid children of the outer
  container, then `grid-row: 1 / -1` spans the *actual* rows that
  exist.
- **clamp(min, vh+vw, max) for two-axis continuous scaling.**
  When a UI needs to feel responsive in both directions
  simultaneously (login pages, kiosk UIs, anything where the
  viewport's aspect ratio varies), `clamp(min, X * vh + Y * vw,
  max)` gives smooth scaling without JS measurement. Min/max
  bounds prevent extreme values; the vh/vw expression interpolates
  the rest. Pair with `max-height: 100vh` + `overflow: auto` on
  the container so tiny viewports scroll instead of overflowing
  the page.
- **Mode toggles for layout strategies, not just feature flags.**
  When two different layout approaches each serve a real
  audience (hardcode = predictable, fluid = adaptive), expose
  *both* through a setting rather than picking one as the only
  blessed implementation. The cost is a class on the root and
  some duplicate CSS blocks; the benefit is admins can pick the
  fit for their hardware without code changes.

### 2026-05-16 — Sprint 9.1.2: responsive login layout + save-button repositioning

Two follow-ups from running 9.1.1 on a laptop.

**1. Login card overflowed on wider screens.** The Sprint 9 "numbers-
only" mode bumped the keypad button sizing aggressively at ≥720px
(padding 26px, font-size 32px). At the existing card max-width of
420px and 5 keypad rows, the card was running ~700-800px tall — fine
on a phone but tall enough to force vertical scroll on a 13" laptop
screen. The user wanted a desktop-style two-column layout instead of
keeping the form skinny and growing the keypad downward.

**Fix: two-column layout at ≥1024px.** Form fields stay in the left
column; the keypad relocates to a right column. Card max-width
grows to 880px, keypad column locks at ~380px (so buttons stay
sensible size regardless of viewport width). The huge-button rule
from 9.0G now only fires in the 720–1023 band (iPad portrait + large
phone landscape, where the single-column tall keypad makes sense).
Above 1024 the keypad gets its own column and doesn't need the
oversized buttons to fill space.

CSS sketch:
```css
@media (min-width: 1024px) {
  .login-card  { max-width: 880px; }
  .login-form  {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 380px);
    column-gap: 32px;
    row-gap: 14px;
    align-items: start;
  }
  .login-form > .login-field,
  .login-form > .login-error,
  .login-form > .login-submit { grid-column: 1; }
  .login-form > .login-kb-area {
    grid-column: 2;
    grid-row: 1 / 100;
    margin-top: 0;
  }
}
```

The keypad spans all 100 rows of the grid so it stays vertically
aligned with the form regardless of how many input rows are showing
(the PIN field appears conditionally after the server signals
pin_required). JSX is untouched — same hierarchy, CSS just reflows it.

**2. Save button moved to the AdminSettings topbar.** The button sat
inside the Shifts Board Visibility section, which read as "save just
this section." Admins were toggling other settings, walking away, and
on return everything was reverted — they'd missed the save button
because they didn't look back at the first section. Moved it to the
right side of the topbar where it's visible regardless of which
section the admin is editing. State transitions ("Save settings" →
"Saving…" → "✓ Saved") preserved; the in-section variant of the
button is gone.

**Files modified:**
- `src/pages/Login/Login.css` — capped the huge-button override at
  `(max-width: 1023px)`; new `@media (min-width: 1024px)` block
  with two-column form grid + card max-width bump.
- `src/components/AdminPanel/AdminSettings.js` — removed the
  in-section save button; added `.settings-topbar-actions` block
  with the new top-anchored save button and an inline error
  surface.
- `src/components/AdminPanel/AdminPanel.css` — styling for
  `.settings-topbar-actions`, `.settings-topbar-error`,
  `.settings-save-top` (+`is-saved` variant).

**Conventions added:**
- **Two-column responsive split with CSS-only restructuring.** When
  you want the same JSX to render as a single-column form on
  mobile and a two-column layout on desktop, use CSS grid with
  `grid-template-columns` at the wide breakpoint and assign
  children to columns via class-based `grid-column`. The keypad's
  `grid-row: 1 / 100` trick (span absurdly many rows) handles the
  case where the column-1 content has a variable number of rows
  (conditional PIN field). No JSX change required.
- **Primary actions live at the page level, not the section
  level.** When a single endpoint commits multiple sections worth
  of state, the save button belongs in the page chrome (topbar,
  fixed footer, etc.) — not nested inside one section's body.
  Section-local saves are appropriate only when each section
  hits its own endpoint independently. If they all hit
  `/api/admin/settings`, there's one save action and it belongs at
  the page level so the admin doesn't have to remember which
  section "owns" it.

### 2026-05-16 — Sprint 9.1.1: migration deploy-blocker + settings save resilience + tenant picker

Three real-world fixes from running 9.1 in production.

**1. DB constraint still rejects birthday-only inserts.** The user
deployed 9.1 server + client but didn't run migration 010 on the live
Postgres. The 8.x-era `users_at_least_one_identifier` constraint is
still in place, rejecting any row where phone_number / username /
employee_code are all NULL — including birthday-only rows. The
constraint failed at row insert time with code 23514. **No code
change resolves this — `psql "$DATABASE_URL?sslmode=require" -f
database/migrations/010_birthday_in_constraint.sql` MUST run on every
deployed environment before birthday-only signups will work.** The
migration is idempotent (DROP IF EXISTS + ADD CONSTRAINT) so re-runs
are safe.

If a future maintainer hits this same shape, the symptom is:
```
error: new row for relation "users" violates check constraint
  "users_at_least_one_identifier"
code: '23514'
```
…and the "Failing row contains (..., null, null, null, 2004-02-26)"
detail shows phone/username/code all NULL with birthday set. The fix
is always to run the relevant migration on the live DB. Application-
layer validation (`validateIdentifiers`) is *complementary* to DB
constraints — it gives nice error messages but doesn't replace the
constraint that Postgres enforces.

**2. Settings PUT silently fails on unknown keys.** Symptom: admin
toggles login-method checkboxes / Hide ABC, clicks save, the page
shows "Saved" briefly, then on reload everything reverts. Root
cause: `/api/admin/settings` PUT iterated all keys in the request and
returned 400 if *any* key wasn't in the ALLOWED map. A client-server
version mismatch (stale browser cache shipping the old
`block_system_keyboard` key after we renamed to `hide_abc_keyboard`)
would make every single save fail with "Unknown setting:
block_system_keyboard" — even though all the *new* keys were valid.
Worse, the 400 came back as an error not visible to the user; the
client interpreted the failure ambiguously.

Fix: skip unknown keys with a `console.warn` and continue. Still
strict on known keys with invalid values — those abort the batch
because they signal a real bug. Net effect: stale clients sending
deprecated keys + valid-new-keys actually save the new keys.

**3. Bare `/login/staff` defaulted to the first tenant.** The GM saw
`example.com/login/staff` (no slug) render with "Snoqualmie Inn"
branding — surprising because no slug should mean no specific tenant.
Replaced the bare-URL default-tenant fallback with a **TenantPicker**
page: lists all `KNOWN_TENANTS`, click → `/{slug}/login/{kind}`.

The auto-default was useful for single-tenant deployments (the GM
expects his URL to just work without typing the slug), but it leaks
tenant identity at the platform root. Single-tenant deploys can
still get the no-friction experience by configuring DNS/Nginx to
redirect bare `/login/*` to `/{their-slug}/login/*` — the redirect
happens before the picker renders. The picker is the right default
when more than one property is in the registry.

**Files modified:**
- `server/server.js` — PUT /api/admin/settings: skip unknown keys
  with warning instead of bailing the whole batch. Still strict on
  invalid values of known keys. Returns 400 only if *no* recognized
  keys were in the request.
- `src/App.js` — `/login/staff` and `/login/admin` now route to
  `TenantPicker`; the `/:tenant/login/*` aliases still route to the
  branded login pages.

**Files added:**
- `src/pages/Login/TenantPicker.js` — card-based property list, each
  row a `TransitionLink` to `/{slug}/login/{kind}`.

**Files modified (CSS):**
- `src/pages/Login/Login.css` — `.tenant-picker-*` list styling.

**Conventions added:**
- **Ignore-unknown-fields beats strict-validate on bulk PUTs.**
  When a single endpoint accepts many fields and you control both
  client and server, you can be strict. When you don't (stale
  caches, third-party clients, version drift), be lenient about
  *unknown* keys — they're not security-relevant — and strict only
  about *invalid values of known keys*. A bulk save that drops a
  forwards-incompatible field is better than one that fails the
  whole batch.
- **Auto-default at the platform root leaks tenant identity.**
  When the URL has no tenant prefix and the system has multiple
  tenants, prefer a picker page to silently selecting one. Even if
  the *intended* deployment is single-tenant, a missing redirect
  config will expose the default tenant to anyone hitting bare
  URLs — that's a privacy/branding leak you can avoid with one
  picker page. Single-tenant deploys configure DNS/Nginx to skip
  the picker.
- **Database constraints are not optional.** Application-layer
  validation gives friendly errors; database constraints
  *guarantee* the schema rule. When validateX() lets a value
  through, you're trusting your code; when the DB CHECK accepts
  it, you're trusting the schema. Both layers are necessary. When
  a constraint needs to change to match new validation rules,
  there's a migration — and the migration must actually be run on
  the deployed DB. Document that explicitly in the iteration log
  ("MUST run X before Y works").

### 2026-05-16 — Sprint 9.1: birthday-as-equal-identifier + keyboard toggle pivot + login UI polish

Four bug fixes from immediate GM/use feedback on 9.0.

**1. Birthday-only signup now works.** 9.0 treated birthday as
*supplemental* — the at-least-one constraint still required one of the
unique identifiers (phone/username/employee_code). The GM expected
birthday to count, and the form rejected "birthday alone" inputs with
"Provide at least one of phone, username, or employee ID." Fixed at
three layers:
- DB: migration 010 drops/recreates `users_at_least_one_identifier`
  to include birthday.
- Server `validateIdentifiers`: birthday now satisfies the
  `requireAtLeastOne` check; error message updated to list all four.
- Client (StaffManager + StaffDetail): client-side early-bail check
  includes birthday.

Birthday-only staff still face the multi-match login fallback if two
of them share the date — that's documented behavior, admin's job to
provide a backup identifier per staff if collisions are a risk.

**2. Gap between admin error strip and the save button.** `.admin-error`
sat flush against `.add-form-actions`. Added `margin-bottom: 12px` so
the strip has breathing room before the button.

**3. Login page label dedup.** Sub-sentence said "Sign in with your
phone number, employee ID, birthday, or username" and the field's
`<label>` underneath said the same thing again ("Phone number /
employee ID / birthday / username"). Removed the visible `<label>`;
moved the same text to `aria-label` on the input so screen readers
still announce it but sighted users only see the sub-sentence. Both
copy lines were dynamic (rebuilt from `enabledMethods`) so disabling
methods cascades correctly to the single remaining caption.

**4. `block_system_keyboard` → `hide_abc_keyboard`.** Sprint 8.7's
attempt to block the iOS system keyboard never worked reliably
(password autofill bypass). Replaced it with a simpler, fully
within-our-control toggle: when on, the on-screen ABC switcher +
letters keyboard are hidden, leaving a bigger numeric keypad. The
system keyboard is no longer blocked at all — if username login is
enabled and the user wants letters, they use whatever keyboard the OS
gives them.

`lettersAvailable` in StaffLogin now combines both:
```js
const lettersAvailable = enabledMethods.has('username') && !hideAbc;
```
Disabling username already implies "no letters." The explicit
`hide_abc_keyboard` toggle covers the case where username stays
enabled but the admin still wants a numeric-only on-screen UI.

Dropped along with the old feature: the `lockKbd` state, the
display-div fallback (`.login-display`), the programmatic-focus
useEffect, `idInputRef`, `useRef` import. Cleaner StaffLogin.js.

**Files added:**
- `database/migrations/010_birthday_in_constraint.sql`.

**Files modified:**
- `database/schema.sql` — at-least-one CHECK now includes birthday.
- `server/server.js` — `validateIdentifiers` includes birthday in
  the at-least-one check; ALLOWED settings swap
  `block_system_keyboard` → `hide_abc_keyboard`; `/api/public-config`
  returns `hide_abc_keyboard` instead.
- `src/components/AdminPanel/AdminSettings.js` — state
  `blockKbd → hideAbc`; section title/copy rewritten;
  saved key renamed accordingly.
- `src/components/AdminPanel/AdminPanel.css` — `.admin-error` gets
  `margin-bottom: 12px`.
- `src/components/AdminPanel/StaffManager.js` /
  `StaffDetail.js` — ≥1 check now includes birthday in condition
  and error copy.
- `src/pages/Login/StaffLogin.js` — dropped `lockKbd` / display-div /
  programmatic focus; reads `hide_abc_keyboard` from public-config;
  `lettersAvailable` combines username-enabled + !hideAbc; removed
  the visible field `<label>` (kept `aria-label`); removed `useRef`
  import.

**Conventions added:**
- **Equal-citizen identifiers if you'd be embarrassed to reject
  one of them.** When a user expects four options to be peers
  ("any of these works"), they should all satisfy whatever
  "must provide at least one" check exists. Tiering an identifier
  as "supplemental" creates a UX trap where someone provides the
  one they prefer and the form rejects it.
- **Replace failed features instead of leaving them.** When a
  feature doesn't work reliably (block_system_keyboard's
  password-autofill bypass), don't leave a broken toggle in the
  admin UI hoping it might work for some user. Repurpose the
  surface area for a related feature that *does* work
  (hide_abc_keyboard), and document the pivot in the
  iteration log. Half-broken settings are worse than absent ones.
- **Don't duplicate copy between the sub-instructions and the
  field label.** If a sentence above the field already tells the
  user what to type, the field label is redundant. Move the label
  to `aria-label` to keep accessibility without doubling up the
  visible copy — sighted users get one clean instruction,
  screen-reader users still get a proper field announcement.

### 2026-05-16 — Sprint 9.0: birthday login + per-tenant login methods + URL slug

GM feedback session at the hotel. Three real-world things to land before
the system is usable in production — and the project's first nod toward
"this could run for other properties someday."

**1. Birthday as a fourth login identifier.** 8-digit MMDDYYYY joins
the auto-detect classifier:
- 8 digits → birthday (validated as a real calendar date)
- 10 digits → phone
- 4–6 digits → employee_code
- has-letter → username

Length boundaries are tight (4–6 / 8 / 10) so the digit ranges don't
overlap. Username's "must contain a letter" rule (Sprint 7) keeps
usernames out of the digit-only space. **Birthdays aren't unique** —
collisions are rare but possible. Server detects multi-match
(`rows.length > 1 && id.kind === 'birthday'`) and returns 409 + "use
phone or employee ID instead". Admin gets a warning in the add form
when typing a birthday already present on an active staff.

**Birthday is supplemental.** At create time, admin still must provide
at least one of phone/username/employee_code. Birthday is a convenience
layer; the unique identifiers are the guaranteed-disambiguable ones.

**2. Per-tenant enabled login methods.** Admin can now toggle each of
the four methods on/off in Settings (at least one must stay on). The
`enabled_login_methods` setting (CSV) drives:
- **Server**: `/api/auth/staff/login` rejects disabled identifier kinds
  before hitting the DB. 400 + "that method is disabled for this
  property".
- **Login UI**: fetches the list via `/api/public-config`. Dynamic
  label, placeholder, sub-sentence all rebuild from the enabled list.
  Disabled methods never appear in user-facing copy.
- **On-screen keypad**: if username is off, the ABC switcher button
  disappears AND the letters keyboard doesn't render. The locked-
  height grid auto-sizes to just the numeric keypad.

**3. Bigger numeric keypad when ABC is off.** Per GM feedback ("buttons
are too small"), `.login-kb-area.is-numbers-only .lk-btn` lifts padding
to `22px 0` and font-size to `28px` (phone) / `32px` (≥720). Bigger
gap too. Only kicks in when the letters keyboard is absent, so other
tenants keeping ABC see the existing compact size.

**4. Multi-tenant URL slug (cosmetic).** Login routes accept an
optional `/:tenant` prefix: `/snoqualmieinn/login/staff` works the same
as `/login/staff`. Slug is looked up against `KNOWN_TENANTS` in
`src/config/tenant.js` for branding (the `.login-tenant` line).
Unknown slugs fall through to the default tenant rather than 404'ing —
better UX on a kiosk than a wall.

This is NOT real multi-tenancy. Each deployment is still single-DB; the
slug is purely URL identity / branding. When a second property
onboards: own deployment pointing at own Postgres DB on the same
server. Adding a new tenant slug is a single line in `KNOWN_TENANTS`.
Internal navigation (`/admin/...`, `/`) stays unprefixed; the slug-
aware routes are only the public login pages.

**DB migration 009 required before deploy:**
`psql "$DATABASE_URL?sslmode=require" -f database/migrations/009_birthday_login.sql`
— adds `birthday DATE` (nullable, not unique) and an index.

**Files added:**
- `database/migrations/009_birthday_login.sql`

**Files modified:**
- `database/schema.sql` — birthday column + idx mirror.
- `server/server.js` — birthday classifier (`BDAY_RE`,
  `birthdayToIso()`), `validateBirthday()`, `validateIdentifiers`
  accepts birthday, staff login gate against `enabled_login_methods`
  + birthday multi-match handler, admin POST/PUT/GET employee
  endpoints carry birthday, `enabled_login_methods` in ALLOWED
  validator and `/api/public-config` response.
- `src/components/AdminPanel/AdminSettings.js` — `loginMethods` Set
  state + toggle handler that refuses to disable the last method;
  new "Staff login methods" section using `.settings-method-grid`.
- `src/components/AdminPanel/AdminPanel.css` —
  `.settings-method-grid/row/text/label/hint` styling;
  `.admin-field-hint` + `.admin-field-warn`.
- `src/components/AdminPanel/StaffManager.js` — birthday input in
  add form + dup-warning banner.
- `src/components/AdminPanel/StaffDetail.js` — birthday in edit form
  + read-only info grid.
- `src/pages/Login/StaffLogin.js` — `enabledMethods` state, dynamic
  copy generation, `lettersAvailable` gates letters keyboard + ABC
  switcher, tenant slug via `useParams`.
- `src/pages/Login/AdminLogin.js` — tenant slug treatment.
- `src/pages/Login/Login.css` — `.login-kb-area.is-numbers-only`
  bigger-button overrides at phone / desktop / tablet breakpoints.
- `src/App.js` — `/:tenant/login/staff` and `/:tenant/login/admin`
  route aliases alongside the originals.
- `src/config/tenant.js` — `KNOWN_TENANTS` registry, `resolveTenant()`
  helper, `DEFAULT_TENANT_SLUG`.

**Conventions added:**
- **Tight length boundaries partition digit-only identifier space.**
  When you have multiple digit-only identifier types, design their
  length constraints so no two ranges overlap. Phone is 10, code is
  4–6, birthday is 8 exactly — the classifier needs no context-
  passing because the digit length alone disambiguates.
- **Soft fallback for unknown tenant slugs.** A URL slug that
  doesn't resolve falls through to the default tenant rather than
  404'ing. On a kiosk the user can't navigate away — a 404 is a
  dead end. The slug is branding affordance, not a security
  boundary.
- **Supplemental vs. primary identifiers.** Some identifiers
  (birthday) are convenience layers — not unique, not the primary
  way an account is found. Keep "≥1 required" scoped to the
  *unique* identifiers so every record stays unambiguously
  addressable regardless of convenience layers on top.

### 2026-05-09 — Sprint 8.7.2: stop rendering an input at all when locked

After 8.7 (`readOnly` + `inputMode="none"`) and 8.7.1 (`pointer-events:
none` + tap-on-wrapper) both failed in production, the user's
diagnosis nailed it: **the password autofill / credential manager
flow** in iOS Safari can summon the keyboard even when the input
itself is uninteractive. The browser detects "this looks like a
password field" and offers an autofill UI that brings the keyboard
along with it.

**The fix is to not have an input element at all** when locked. When
`lockKbd` is true, render a `<div role="textbox" aria-readonly="true">`
that displays the current state. No `<input>` ⇒ no field for the
browser to autofill ⇒ no credential manager ⇒ no keyboard. Period.

The on-screen keypad still drives state via `setIdentifier` /
`setPin` (it never depended on the input's `onChange` anyway). The
wrapper continues to capture taps and update `activeField`. The div
is styled identically to the input so visually nothing changes —
the user can't tell whether they're looking at an input or a div.

**For the PIN field** (which used `type="password"` to mask digits),
the display div manually masks: `'•'.repeat(pin.length)` when there's
content, falls back to the placeholder `• • • •` when empty. This
loses the native password-toggle affordance, which is fine on a
kiosk where staff aren't going to copy-paste the PIN.

**Files modified:**
- `src/pages/Login/StaffLogin.js` — both fields now branch on
  `lockKbd`. When true: render `<div className="is-keypad
  login-display ...">` with the current value or placeholder span.
  When false: the original `<input>` (unchanged from 8.7.1).
- `src/pages/Login/Login.css` — `.login-display` styled to match
  `.login-field input` (same padding, border, radius, font, height).
  `.login-field.is-active .login-display` mirrors the input's
  `:focus` glow since the div itself never receives focus. Existing
  `.is-keypad` / `.is-keypad.is-numeric` rules extended to apply to
  both `input` and `.login-display`. `.login-display-placeholder`
  styled with `var(--text-faint)` to match the input placeholder.

**Conventions added:**
- **If the platform won't suppress its keyboard, remove the input.**
  Browsers are heuristic about `<input>` elements — they autofill,
  autocomplete, suggest, surface keyboards, manage credentials.
  Spec attributes like `inputMode="none"` / `readOnly` /
  `autoComplete="off"` are advisory and OS keyboards routinely
  override them. The only 100% reliable suppression is to not
  render an `<input>` at all. Use a `<div role="textbox"
  aria-readonly="true">` and drive its content with JS state.
- **Visual identity > element identity.** A div styled like an
  input reads as "an input" to the user. They tap it, type via the
  keypad, see characters appear — all the same affordances. The
  underlying element doesn't matter for the user; it matters
  hugely for the browser's heuristics. Pick the element that gives
  you the behavior you want and use CSS to make it look right.

### 2026-05-09 — Sprint 8.7.1: actually block the keyboard (pointer-events trick)

8.7's `readOnly` + `inputMode="none"` combo is what the spec says
should suppress the virtual keyboard, but in practice iOS Safari and
several Android browsers ignore `inputMode="none"` once the input
receives focus and pop their default keyboard anyway. Worse, with
`readOnly` the input doesn't accept typing — so the user gets a
useless keyboard they don't know how to dismiss. Net regression.

**Root cause:** the spec relies on browsers honoring
`inputMode="none"`, but the actual implementations don't on the older
OS versions hotels typically have on shared kiosks. The spec is
"compliant + broken in practice" — a classic platform fragmentation
trap.

**The reliable fix: don't let the input receive focus on tap.**
- `pointer-events: none` on the `<input>` so taps fall through.
- `tabIndex={-1}` so keyboard nav can't reach it either.
- Wrap in `.login-field` with `cursor: pointer` and an `onClick`
  that sets `activeField` directly.
- Replace `autoFocus` with a `useEffect`-driven programmatic focus
  that only fires when `lockKbd === false` *and* config has loaded.

Result: no browser ever focuses the input → no browser ever has the
chance to summon a keyboard. The on-screen keypad still drives state
via `setIdentifier` / `setPin`, exactly as before. Visual styling
unchanged so the user can't tell the field is "locked" — they just
see the on-screen keypad as the only way to type.

**Why programmatic focus + configLoaded matters.** With `autoFocus`
on the JSX, the input focuses on first render — *before* the
`/api/public-config` fetch resolves. On a kiosk where lockKbd should
be true, the keyboard would have a moment to appear before the state
flipped. The `useEffect` defers focus until the config is known and
only focuses if locking is off.

**Files modified:**
- `src/pages/Login/StaffLogin.js` — added `configLoaded` state and
  `idInputRef`. Removed `autoFocus`; added a `useEffect` that calls
  `idInputRef.current.focus()` when config is loaded and not locked.
  Both `.login-field` wrappers gained `is-kbd-locked` class +
  `onClick` handler when locked. Inputs gained `tabIndex={lockKbd
  ? -1 : 0}` and `aria-readonly` for accessibility.
- `src/pages/Login/Login.css` — new `.login-field.is-kbd-locked`
  rules: `cursor: pointer` on wrapper, `pointer-events: none;
  user-select: none; caret-color: transparent` on the input.

**Conventions added:**
- **`pointer-events: none` on the element + click on the wrapper is
  the only reliable way to fully suppress mobile keyboards.** The
  spec-blessed `inputMode="none"` and `readOnly` are advisory; older
  OS implementations bypass them. If you absolutely need the
  keyboard to *not* appear, remove the input from the interaction
  graph entirely. The wrapper picks up the tap and updates app
  state; the input is just a visual element at that point.
- **Defer programmatic actions until async config has resolved.**
  When a feature toggle controls how an interactive element should
  behave on first render, don't ship a default behavior that fires
  before the config arrives. Either gate render on `configLoaded`
  or use a `useEffect` that only acts after config is known. The
  alternative is a brief moment where the wrong behavior is
  visible — usually worse than waiting half a second.

### 2026-05-09 — Sprint 8.7: kiosk lock — block system keyboard on staff login

For shared tablet/kiosk deployments the staff are often not tech-savvy
enough to dismiss the device's built-in keyboard if it pops up. The
in-app keypad we built (Sprint 7.1 / 7.2 / 7.3) is sufficient for all
input types, so admins should be able to *suppress* the system
keyboard entirely on the staff login screen.

**Pattern: `readOnly` + `inputMode="none"`.** Both attributes together:
- `readOnly` prevents the input from receiving keyboard input (so even
  if a system keyboard appears, typing won't change the field).
- `inputMode="none"` is the modern signal to mobile browsers that no
  virtual keyboard should appear when the input is focused.

The on-screen keypad is unaffected — it sets state via `setIdentifier`
/ `setPin` directly, not through the input's `onChange`. Focus still
fires (`readOnly` doesn't prevent focus), so `activeField` tracking
keeps working.

**Per-tenant configurable.** New admin setting `block_system_keyboard`
('true'|'false', default 'false'). New unauthenticated GET
`/api/public-config` endpoint returns just the flags the login page
needs (currently only this one). Hand-listed allowlist in the endpoint
so the public response can never accidentally leak settings — explicit
beats "dump everything."

**Admin toggle.** New section in AdminSettings under Auto sign-out: a
chip-style hop-check toggle with help text explaining the kiosk use
case. The toggle's label live-updates ("On — only the in-app keypad
accepts input" / "Off — both system keyboard and in-app keypad work")
so the admin sees what state they're saving.

**StaffLogin** fetches `/api/public-config` on mount (best-effort —
fetch failure falls back to "system keyboard allowed"). Both the
identifier input and the PIN input bind their `readOnly` and
`inputMode` to the fetched flag.

**Files modified:**
- `server/server.js` — `block_system_keyboard` added to settings
  ALLOWED validator (`v === 'true' || v === 'false'`); new GET
  `/api/public-config` endpoint with explicit allowlist of keys.
- `src/components/AdminPanel/AdminSettings.js` — new state, fetch,
  save for `blockKbd`; new toggle section under Auto sign-out
  using `.hop-check` + `.settings-toggle-row`.
- `src/components/AdminPanel/AdminPanel.css` — `.settings-toggle-row`
  styling (boxed row with checkbox on left + label/help on right).
- `src/pages/Login/StaffLogin.js` — `lockKbd` state + `useEffect`
  fetch from `/api/public-config`. Both inputs apply
  `readOnly={lockKbd}` and `inputMode={lockKbd ? 'none' : ...}`.

**Conventions added:**
- **`readOnly` + `inputMode="none"` is the standard kiosk-keyboard
  block.** Don't try to intercept keyboard events or stuff the input
  with a custom widget. Keep the native `<input>` for accessibility
  and let the two attributes do the work. The on-screen keypad
  drives state directly, so the input's `onChange` doesn't need to
  fire for input to work.
- **Public-config endpoint with an explicit allowlist.** When an
  unauthenticated page needs a setting, expose it via a dedicated
  endpoint that hand-lists the keys it returns — never SELECT *
  from app_settings. Adding a new public flag is one line of code
  and one decision; "everything is public unless I remember to hide
  it" is the wrong default.
- **Live-update toggle labels.** A toggle's accompanying caption
  should reflect what the toggle currently *means*, not just its
  generic name. "On — only the in-app keypad accepts input" gives
  the admin certainty about what saving will do; "Block system
  keyboard" alone forces them to mentally translate.

### 2026-05-08 — Sprint 8.6.2: banner moves inline; sign-out gets a transition

Two issues with the 8.6 banner once the user lived with it:

**1. Overlap.** The fixed/bottom-banner positioning overlapped the
recent-shifts list on mobile. User pointed at the existing gap *between
the clock display and the action button* in the clock card and asked
to integrate the banner there instead. Done — the banner now renders
inline inside the clock face, taking the action button's position
when active. When `autoSignout` is true, the Clock In / Clock Out
button is replaced by the banner; canceling restores the button.

This makes the auto-signout feel like a contextual continuation of the
clock action that just happened, not a floating overlay anchored to
the screen. The fixed-position CSS variants (top-right toast / bottom
banner) are gone — the inline placement works on all viewports and
doesn't fight with anything below the clock card.

**2. No animation on the actual sign-out.** When the timer hit 0 the
nav was an instant `nav('/login/staff', { replace: true })` — felt
abrupt. Wrapped the navigation in `document.startViewTransition` +
`flushSync`, mirroring the Sprint 7.4 pattern:
```js
document.documentElement.dataset.signingOut = 'true';
const t = document.startViewTransition(() => {
  flushSync(() => nav('/login/staff', { replace: true }));
});
t.finished.finally(() => {
  delete document.documentElement.dataset.signingOut;
});
```
CSS hooks the `[data-signing-out]` attribute to apply a fade-out +
scale-down on the old page (`signout-old`: opacity → 0, scale → 0.96)
and a fade-in + scale-down-from on the new page (`signout-new`:
opacity 0→1, scale 1.04→1). The login card's existing slide-up
animation rides on top via its `view-transition-name: login-card`.
Reduced-motion respected.

**Files modified:**
- `src/pages/Home/index.js` — banner moved inside both clock faces
  (replacing the action button when `autoSignout`); removed the
  page-bottom render. `handleAutoSignout` now sets
  `data-signing-out` on `<html>`, runs the nav inside a view
  transition, clears the dataset on completion.
- `src/components/shared/AutoSignoutBanner.css` — removed the
  desktop / mobile fixed-position blocks. Replaced with a single
  inline layout (`position: relative`, full-width inside its
  parent). Added `[data-signing-out]::view-transition-old/new(root)`
  rules for the page-level sign-out animation.

**Conventions added:**
- **Inline contextual UI beats overlay UI when the action is still
  on-screen.** A floating banner that comments on what just happened
  is fine for non-spatial actions (toast for "settings saved").
  When the action *has* a UI position (a Clock In button just
  pressed), put the follow-up affordance *there*, replacing or
  augmenting the original control. The user's eye is already there;
  no extra scan needed.
- **Page-level navigation deserves a transition just like view-
  level changes do.** Even when there's no shared element to FLIP,
  a fade + subtle scale on the document root reads as deliberate
  vs. an instant cut. Use the same
  `document.startViewTransition + flushSync` pattern, set a
  data-attribute on `<html>` for the duration, hook CSS off of
  `::view-transition-old/new(root)` and the data-attribute. Cheap
  to add to any logout / nav-on-action flow.

### 2026-05-08 — Sprint 8.6.1: fix stuck countdown on AutoSignoutBanner

Bug from 8.6: the countdown displayed `Signing out in 3s` and stayed at
3 — the auto-signout *eventually* fired, but the ring never animated
and the seconds counter never ticked.

**Root cause: stale-closure dependency on a re-rendering parent.** The
banner's `useEffect` had `onSignOut` in its dep list:
```jsx
useEffect(() => { ...interval... }, [seconds, onSignOut]);
```
`onSignOut` was `handleAutoSignout`, defined inline in `Home`. Home
re-renders every 1 second while clocked in because of the live elapsed
timer (`setElapsed` interval that drives the on-the-clock display).
Each re-render → new `handleAutoSignout` reference → useEffect's deps
change → effect re-runs → previous interval cleared, *new* interval
started with a fresh `start = Date.now()`. The displayed `remaining`
got reset just before it visibly changed, so it appeared stuck at 3.
The auto-signout finally fired when something stopped the elapsed
timer (e.g. data refresh after clock-out toggling `currentlyClockedIn`
to false), letting the countdown run an uninterrupted 3 seconds.

**Fix.** Hold `onSignOut` in a ref so its identity changes don't
re-trigger the effect:
```jsx
const onSignOutRef = useRef(onSignOut);
useEffect(() => { onSignOutRef.current = onSignOut; }, [onSignOut]);

useEffect(() => {
  ... onSignOutRef.current(); ...
}, [seconds]);
```
The countdown effect now only re-runs when `seconds` changes (rare —
the admin would need to update the setting mid-banner). Every tick
calls `onSignOutRef.current()` which always reads the latest
`onSignOut` without needing it in deps.

**Files modified:**
- `src/components/shared/AutoSignoutBanner.js` — added `onSignOutRef`
  + ref-update effect; removed `onSignOut` from the countdown
  effect's dep array.

**Conventions added:**
- **Use a ref for callbacks consumed inside long-running effects.**
  When a `useEffect` sets up a timer, subscription, or anything that
  outlives a single render, and the callback prop's identity isn't
  stable, hold it in a ref and read `ref.current` from inside.
  Otherwise every parent re-render that produces a new callback
  reference will tear down and restart the effect — which silently
  resets timers, drops in-flight subscriptions, etc. The ref pattern
  is the standard React idiom for "I want the latest value but I
  don't want to re-run the effect."

### 2026-05-08 — Sprint 8.6: post-clock auto sign-out banner (configurable)

QoL feature unrelated to the Sprint 8 scheduling rebuild — for shared
kiosk/tablet setups the same staff session was staying open after the
person clocked in/out and walked away. Added a non-blocking countdown
banner that auto-signs the user out unless they tap "Stay signed in".
Per-tenant configurable (admin-controlled timer length).

**Flow.** After a successful clock-in or clock-out:
1. The existing 2.2s success notif (`home-notif`) plays as before.
2. After it ends, the **AutoSignoutBanner** slides in.
3. The banner counts down from `auto_signout_seconds` (default 3,
   admin-configurable 0–60). At 0, the user is logged out and routed
   to `/login/staff`.
4. Tapping "Stay signed in" or the banner background cancels the timer.

The post-success-then-banner sequence is intentional — the user needs
to *see* the success state before being asked about staying signed in.
Stacking the two would dilute both messages.

**Banner design (HCI):**
- Big, visually obvious "Stay signed in" button — the user's primary
  action, sized so a glancing tap can hit it.
- Circular SVG progress ring (radius 18, stroke 4) that depletes from
  full to empty as the timer ticks. Numeric seconds-remaining inside
  the ring as a fallback for users who don't read animation.
- Tapping anywhere on the info-area also cancels (large-target
  forgiveness).
- Position: **bottom banner above the bottom-nav** on mobile (<720px,
  uses `env(safe-area-inset-bottom)` for notch-safe phones), **top-
  right toast** on desktop. Both slide in.

**Server side.**
- New `auto_signout_seconds` key in the `app_settings` table, validator
  in the existing `PUT /api/admin/settings` ALLOWED map (range 0–60,
  digits only).
- `GET /api/me/hours` already runs on Home page load; piggybacked the
  setting into its response (`autoSignoutSeconds`) so staff don't need
  a dedicated endpoint and the value is fresh on every refresh.
- `0` disables the feature entirely — `triggerAutoSignout()` early-
  returns when seconds ≤ 0.

**Admin control.** New section in AdminSettings between Performance
Thresholds and Account, matching the existing grid styling. Just one
control: a number input (0–60, default 3) with help text explaining
the kiosk/tablet use case.

**Files added:**
- `src/components/shared/AutoSignoutBanner.js` — countdown component
  with SVG ring + Stay-signed-in CTA. Tick interval is 100ms so the
  ring animates smoothly even at 3-second total.
- `src/components/shared/AutoSignoutBanner.css` — responsive
  positioning (bottom-banner < 720px / top-right toast ≥ 720px),
  slide-in keyframes, ring-progress styling, reduced-motion fallback.

**Files modified:**
- `server/server.js` — `auto_signout_seconds` added to settings
  ALLOWED map; `/api/me/hours` returns `autoSignoutSeconds`.
- `src/components/AdminPanel/AdminSettings.js` — new state +
  fetch/save for `autoSign`; new section with the seconds input.
- `src/pages/Home/index.js` — imported `AutoSignoutBanner` and
  `useNavigate`; added `autoSignout` state and
  `triggerAutoSignout()` helper that fires post-notif (2.2s
  setTimeout); `handleClockIn` and `handleClockOut` call it on
  success; `handleAutoSignout()` performs the logout + nav back to
  `/login/staff`. Banner rendered at the end of the JSX.

**Conventions added:**
- **Sequence post-success affordances; don't stack them.** When a
  success state and a follow-up affordance both want screen time
  (here: "Clocked in!" toast and the auto-sign-out banner), pick a
  primary moment for each and chain them rather than overlap. The
  user reads one message at a time. The chain duration becomes the
  effective minimum interaction cost — design accordingly.
- **Read tenant config piggyback on existing endpoints.** When a new
  staff-facing setting is needed, look for an endpoint the staff
  already calls on every page load (here: `/api/me/hours` on Home).
  Add the setting to its response instead of building a dedicated
  read endpoint. Keeps the latency budget flat and the value fresh
  on every refresh.
- **Big-target forgiveness on time-critical buttons.** When a button
  needs to be hit within a short window (the 3-second cancel here),
  the *whole* visible region around it should accept the tap, not
  just the button's pixel-perfect rectangle. Easier to hit when
  glancing, especially on touch.

### 2026-05-08 — Sprint 8.5.4: drop inner view-transition-names, canvas-only animation

After three iterations of layered View Transitions tweaks (8.5, 8.5.1,
8.5.2, 8.5.3) the user kept reporting that Year/Month prev/next and
Year↔Month / Day↔Month zooms either failed or fired only randomly. The
animations that *did* work consistently were Day prev/next and Week
prev/next — the two views without a forest of inner
`view-transition-name`s.

Pattern was clear: **every broken case involved a view with multiple
internal named layers**. YearView had 12 (`sched-month-0..11`),
MonthView had ~32 (1 container + 31 day cells). DayView had 1 named
container; WeekView had none. Browser FLIP behavior with many shared/
unshared name pairs was inconsistent, the universal `*` selector
support was uneven, and the named layers' default cross-fade often
masked the canvas slide behind them.

**Decision: give up the iOS-Calendar tile-to-page FLIP** and rely
purely on the canvas (`.sched-content` named `sched-canvas`) for all
schedule animation. This loses the "tile expands into a full page"
visual we'd been chasing across 8.0 → 8.5.3, but gains 100% reliable,
predictable animation across every view transition. Reliability beats
aesthetic ambition at this point.

**What's left named:**
- `.sched-content` → `sched-canvas` (animates: canvas slide on prev/
  next, canvas zoom on view-changes).
- `.bottom-nav` → `app-bottom-nav` (pinned, `animation: none` during
  scheduling transitions so it stays stable through the canvas
  motion).
- `.sidebar` → `app-sidebar` (same).

**What's *not* named (was, before 8.5.4):**
- MonthView's `.month-view` container (was `sched-month-N`).
- MonthView's day cells (were `sched-day-YYYY-MM-DD`).
- YearView's tiles (were `sched-month-0..11`).
- DayView's `.day-view` container (was `sched-day-YYYY-MM-DD`).

With those gone, the universal slide rule from 8.5.3 effectively only
slides `sched-canvas`; the static app-* layers are explicitly excluded
via `animation: none`. Zoom-in/out animates only the canvas.

**Canvas zoom restored to the dramatic range.** With no inner FLIP to
compete, the canvas is the animation, so the 8.5.2-era loud range is
the right choice. Reverted: `0.95↔1.05 → 0.85↔1.18`. Page visibly
grows/shrinks on every view-change.

**Files modified:**
- `src/components/AdminPanel/Scheduling/MonthView.js` — dropped
  `viewTransitionName` from `.month-view` and from each in-month
  day cell.
- `src/components/AdminPanel/Scheduling/YearView.js` — dropped
  `viewTransitionName` from each year tile.
- `src/components/AdminPanel/Scheduling/DayView.js` — dropped
  `viewTransitionName` from `.day-view`.
- `src/components/AdminPanel/Scheduling/Scheduling.css` —
  `sched-zoom-*` keyframes' scale range bumped back to 0.85↔1.18.

**Conventions added:**
- **When inconsistent FLIPs become a debugging time-sink, drop the
  FLIPs.** View Transitions API behavior with many shared / unshared
  name pairs depends on browser version, layer count, render
  timing, etc. If you're three sprints deep and still chasing why
  certain transitions fire and others don't, the architecture
  itself is fragile. Step back to a single named "canvas" layer
  and accept the simpler animation. You can re-introduce per-
  element FLIPs later when you have a specific use case that
  justifies the complexity.
- **Page-level animation always wins reliability over per-
  element animation.** A whole-canvas scale/slide is one named
  layer with one animation; per-element FLIP is N layers with N
  animations and pairwise matching. The single layer is what
  every browser handles consistently.

### 2026-05-08 — Sprint 8.5.3: universal slide on prev/next + tone down canvas zoom + Week gap

Three follow-up fixes after 8.5.2 still left some animations missing.

**8.5.3A — universal slide on prev/next, nav excluded.** The slide CSS
from 8.5 only targeted `sched-canvas`. That worked for views whose
content has no inner `view-transition-name` (Week's summary table,
Day's contents inside the named container), but Year and Month each
have *additional* named layers that defaulted to cross-fade in place:
- YearView has 12 month tiles each named `sched-month-0..11`.
- MonthView's container is named `sched-month-N` and ~30 day cells
  are named `sched-day-YYYY-MM-DD`.

Those named layers stayed put while the canvas slid behind, so the
user perceived "no animation" on Year and Month prev/next. Fix:
universal `::view-transition-old/new(*)` slide rule for prev/next
directions — every named layer slides together. Static chrome
(`app-bottom-nav`, `app-sidebar`) is *explicitly* excluded with
`animation: none` on both group and old/new pseudos so the nav stays
pinned (the Sprint 8.5.2 z-index pin alone wasn't enough — the
universal slide would have caught the nav too without the override).

**8.5.3B — tone down canvas zoom so inner FLIP isn't masked.** Year↔
Month and Day↔Month read as un-animated even though the inner FLIPs
were firing. Theory: the strong canvas zoom from 8.5.2 (scale 0.85↔
1.18) was visually competing with the FLIP — the user perceived the
big page-grow/shrink as the only animation, missing the smaller FLIP
between tile/cell and container. Toned the canvas back to 0.95↔1.05
so the FLIP is the prominent animation; the canvas remains a
perceptual fallback for view-changes that don't share names (Day↔
Week, Week↔Year).

**8.5.3C — gap between Week's controls and the summary table.** Week
view used `.week-view` as a layout class but no CSS rules attached, so
day-controls' border-bottom rendered flush against the summary table's
top border. Added `display: flex; flex-direction: column; gap: 14px;`
to `.week-view` to match the rhythm Day uses.

**Files modified:**
- `src/components/AdminPanel/Scheduling/Scheduling.css` —
  prev/next slide rules expanded from `sched-canvas` to universal `*`,
  with `animation: none` overrides for `app-bottom-nav` and
  `app-sidebar`. `sched-zoom-*` keyframes' scale endpoints narrowed
  back to 0.95/1.05. `.week-view` gets the same flex-column gap
  rhythm as `.day-view`.

**Conventions added:**
- **Universal slide with explicit static-chrome exclusions.** When
  multiple sibling layers should all participate in a slide
  transition (canvas, named content layers), use the universal
  `::view-transition-old/new(*)` rule rather than enumerating
  every name. Then explicitly cancel the animation for layers that
  must stay static (sticky chrome, bottom nav) via `animation: none`
  on both the group and the old/new pseudos. Cleaner than trying to
  list every animatable name and forgetting to add new ones later.
- **Don't make the canvas-level animation too dramatic when an inner
  FLIP is present.** Subtle wins. A bold canvas zoom can mask the
  more meaningful inner element FLIP (tile to container, cell to
  page). Reserve loud canvas animation for cases where there's no
  inner FLIP to anchor the eye. Around 5% scale change is enough to
  signal "something happened" without competing.

### 2026-05-08 — Sprint 8.5.2: view-transition-group duration + canvas zoom prominence + nav z-index

Three follow-ups from real use of 8.5.1's animations.

**8.5.2A — `::view-transition-group(*)` duration override.** The
universal `::view-transition-old/new(*)` rule from earlier sprints
controlled only the *fade* part of the FLIP, not the *position/size*
morph. The morph stayed at the browser default (~250ms with default
ease), which made Day↔Month / Month↔Year shrinks/grows feel like
"no animation" — especially when the source/target had little content
to visually move. Adding `::view-transition-group(*) { animation-
duration: 320ms; animation-timing-function: cubic-bezier(0.4, 0, 0.2,
1) }` aligns the morph timing with the rest of the schedule
animations. Both the fade pseudos and the group pseudo need to be set
together because they animate different aspects of the same
transition.

**8.5.2B — bumped canvas zoom scale.** When the user zooms Month → Year
on a month with zero shifts, the inner FLIP between MonthView's
container and YearView's mini-month tile happens but isn't visually
prominent because both states are nearly empty. The canvas-level zoom
exists to provide a perceived animation regardless of inner content,
but at scale 0.92↔1.08 the change was too subtle to read. Bumped to
0.85↔1.18 — the page now visibly grows/shrinks during view-level
zooms.

**8.5.2C — z-index on the nav groups.** Even after naming `.bottom-nav`
in 8.5.1, the user reported the nav blinking briefly during prev/next
slide transitions. The cause: view-transition layers stack in DOM
order by default. `.sched-content` (canvas) comes earlier in the DOM
than `.bottom-nav`, but the canvas snapshot's bounding box could
extend past the canvas's normal area while sliding (`translateX(-30%)`
+ opacity fade), painting over where the bottom nav sits. The fix:
```css
::view-transition-group(app-bottom-nav),
::view-transition-group(app-sidebar) {
  z-index: 9999;
}
```
This pins the nav groups above all other transition layers, so even
if the canvas snapshot reaches over their area, the nav layers paint
on top. Static chrome stays solid throughout every transition.

**Files modified:**
- `src/components/AdminPanel/Scheduling/Scheduling.css` —
  `::view-transition-group(*)` duration/easing rule;
  `::view-transition-group(app-bottom-nav | app-sidebar)` z-index;
  `sched-zoom-*` keyframes' scale endpoints widened to 0.85/1.18.

**Conventions added:**
- **Style both the group and the old/new pseudos.** When customizing
  a View Transitions animation duration, set the rule on both
  `::view-transition-group(<name>)` and
  `::view-transition-old/new(<name>)`. The first controls
  position/size morphing, the others control the cross-fade. They're
  separate properties; setting one without the other means part of
  your transition runs at your duration and part runs at the
  browser default.
- **Canvas-level animation as a perceptual fallback.** When
  zooming between views that share named elements, the inner FLIP
  may not be visually prominent if the named elements have similar
  empty content. Layer a canvas-level scale + fade so there's
  always *something* moving — the user doesn't perceive whether the
  animation is FLIP-driven or canvas-driven, just that there is one.
- **z-index on view-transition-group for stacking control.** If a
  transition snapshot can paint over content you want to keep on
  top (sticky chrome, modals, toolbars), give those elements a
  view-transition-name AND an elevated z-index on the group. Layers
  default to DOM order, which doesn't always match visual intent
  during animation.

### 2026-05-08 — Sprint 8.5.1: animation polish + Week repurposed as hours summary

Four problems from real use of 8.5: bottom nav blinking on mobile during
view transitions, Week was redundant with the docked + button, day↔week
view-changes had no perceived animation, and the header would wrap on
long Day labels.

**8.5.1A — pin the bottom nav (and sidebar).** During a View
Transitions API navigation, anything without a `view-transition-name`
gets folded into the *root* layer, which cross-fades by default.
`.bottom-nav` (mobile) and `.sidebar` (desktop) being unnamed meant
they were captured into the cross-fading root snapshot — visible as
"the bottom bar disappears for a frame" on mobile during the slide.
Fix: name them via CSS:
```css
.bottom-nav { view-transition-name: app-bottom-nav; }
.sidebar    { view-transition-name: app-sidebar; }
```
With names, each gets its own transition layer that cross-fades from
itself to itself — invisible because nothing changes. Stays solid
through the canvas transition.

**8.5.1B — zoom-direction flag for view-to-view changes.** Slide-left/
right was wired in 8.5 for prev/next within a single view. View
*changes* (Day → Week via the toggle, etc.) used `runWithTransition`
without a direction, falling back to default cross-fade — barely
perceptible. `zoomTo()` now classifies the change as `zoom-in`
(deeper: year → month → week → day) or `zoom-out` (shallower) by
comparing view-level integers, and CSS animates the canvas with a
subtle scale + fade on each direction:
```css
@keyframes sched-zoom-old-shrink { to   { transform: scale(0.92); opacity: 0; } }
@keyframes sched-zoom-new-grow   { from { transform: scale(1.08); opacity: 0; } }
@keyframes sched-zoom-old-grow   { to   { transform: scale(1.08); opacity: 0; } }
@keyframes sched-zoom-new-shrink { from { transform: scale(0.92); opacity: 0; } }
```
The inner FLIPs (sched-month-N, sched-day-X via shared names) ride on
top — when present, the targeted tile still expands/contracts as
before; when not (Day↔Week, no shared name), the canvas-level zoom
gives the user a perceived animation.

**8.5.1C — header restructured to free a row on mobile.** The Day
label `cursor.toLocaleDateString('long', ...)` rendered as
`Wednesday, May 8, 2026` and pushed the segmented Year/Month/Week/Day
toggle to wrap to a second line. Two changes:
- Day label now uses `Weekday │ Mon D, YYYY` (thin pipe vertical
  bar instead of full comma + long month name) — saves enough px
  that the toggle fits.
- The view toggle and `+` button moved out of `.sched-header-right`
  into the `.sched-nav-bar` row alongside `‹ Today ›`. Single
  controls row, more horizontal real estate per item. The
  `.sched-view-toggle` carries `margin-left: auto` so it anchors
  to the right of the nav bar, with `+` after it.

**8.5.1D — Week view repurposed as a 4-week hours summary.** The
docked Assign Shifts panel from 8.1 made the staff×days assign-grid
on Week mostly redundant. Instead of removing Week, repurpose it as
the *aggregate* view between Month (calendar) and Day (timeline):
- 4 columns = 4 consecutive weeks anchored on the cursor's Monday.
- Rows = staff, dept-grouped (subtle dept header rows).
- Cells = total scheduled hours for that staff in that week,
  computed client-side from the loaded `schedules` slice.
- Cells over the OT threshold (40h, project default) get an amber
  tint matching the Sprint 8.3 conflict-warning palette.
- Trailing **Total** column with the 4-week sum per staff.
- Sticky left name column + sticky header row so the table stays
  navigable when scrolled.

The fetch range for Week now pulls 28 days (`+27` from cursor's
Monday) instead of 7. Existing cursor stepping (`goPrev`/`goNext`
moves by 7 days in Week) gives a sliding-window feel — admin can
shift the 4-week window one week at a time.

**Files modified:**
- `src/components/Layout/Sidebar.css` — added
  `view-transition-name` declarations for `.bottom-nav` and
  `.sidebar`.
- `src/components/AdminPanel/Scheduling/index.js` — `zoomTo`
  classifies view-level deltas; header restructured (toggle + add
  moved to the nav-bar row); Day label format pipe; Week fetch
  range bumped to 28 days.
- `src/components/AdminPanel/Scheduling/Scheduling.css` —
  `@keyframes sched-zoom-*` + `[data-sched-dir="zoom-in/out"]`
  selectors; `.sched-nav-bar` flex-wrap + `margin-left: auto` on
  the toggle; full `.week-summary-*` table styles with sticky
  name column + amber `is-over-ot` cells.
- `src/components/AdminPanel/Scheduling/WeekView.js` — completely
  rewritten as a `<table>`-based hours-by-week summary. All the
  prior assign-grid + drag-and-drop + timeline-mode complexity
  removed (lives in MonthView/DayView/AssignPanel now).

**Conventions added:**
- **Pin static layout chrome with view-transition-name.** When any
  ancestor element triggers a View Transitions API transition, any
  static layout chrome (sidebars, top bars, bottom nav) needs its
  own `view-transition-name`. Without one it gets swept into the
  root layer and cross-fades, which on mobile reads as a flicker.
  The name doesn't even need an associated animation — just having
  it puts the element into its own stable layer. Cheap fix.
- **Repurpose redundant views, don't delete them.** When a feature
  (the docked Assign panel) makes a sibling view redundant in its
  current shape (the Week assign-grid), look for an aggregate
  level the view *can* fill. Year shows 12 months; Month shows 1
  month of days; Day shows 1 day of hours; Week is the natural
  level for "weekly aggregates over a month." Reuses the existing
  navigation structure instead of leaving a dead view.
- **Zoom-direction inferred from a level integer.** When views
  form a hierarchy (year/month/week/day), encode them as integers
  in a single map and infer zoom direction via subtraction:
  `newLevel > oldLevel ? 'in' : newLevel < oldLevel ? 'out' : null`.
  Beats spelling out every transition pair, and adds a new view
  level by inserting one entry instead of editing every transition
  rule.

### 2026-05-08 — Sprint 8.5: directional slide animations + Week chassis adoption + Day extra detail

Two big rolls into one sprint: the missing animations on prev/next and
zoom-back, plus a structural alignment between WeekView and DayView so
they share a chassis but show different levels of detail.

**Animations — directional slide on prev/next.** Zoom transitions
(Year↔Month, Month↔Day) already worked both ways via shared
`view-transition-name` on tile and container, but `goPrev`/`goNext`
within a single view were unanimated — the cursor change was instant.
Added a `dir` parameter to `runWithTransition(cb, dir)` that sets
`document.documentElement.dataset.schedDir = 'prev' | 'next'` for the
duration of the transition. The `.sched-content` element now carries
`view-transition-name: sched-canvas`; CSS hooks
`[data-sched-dir]::view-transition-old/new(sched-canvas)` to slide-out-
left/in-right (next) or slide-out-right/in-left (prev) at 320ms with
cubic-bezier(0.4, 0, 0.2, 1). The transition's `finished` promise
clears the dataset attribute. Zooms (no `dir`) leave the canvas with
its default cross-fade so the inner FLIP names own the visual.

`goToday` deliberately skips the directional flag — could go either
way depending on where the cursor sits, so a default cross-fade reads
better than picking arbitrarily.

**Week chassis adoption.** WeekView now wraps its rendering in the
same dept-filter chips + mode-toggle pattern DayView introduced in
8.4. Same smart-default rule: pick a single dept → switch to Timeline;
pick All → switch to Resource. Mode toggle is hidden on mobile because
the existing day-tab list there *is* the single-day focus the toggle
would otherwise pick. Mobile gets the chips alone.

**Week — two desktop modes:**
- **Resource** — the existing staff-rows × 7 day columns Gantt grid.
  Filtered by selected dept. Best at-a-glance overview of who works
  which days across the week.
- **Timeline** — *new*: 7 day columns × 24h vertical axis (Outlook-
  week style). Shifts are positioned blocks within their day column;
  per-day greedy lane-packing handles overlaps. Hour rail on the
  left, 25 hour markers (12 AM → 12 AM) with the same translateY(-50%)
  + 8px breathing pattern Sprint 8.4.1 introduced for DayView.

**Day extra detail — what makes Day "Day" instead of Week-zoomed-in.**
Day's resource track grew from 28px → 36px so each shift bar can hold
two lines: time + computed hours on line 1 (`9am – 5pm · 8.5h`),
notes preview on line 2 (italic, 10px). Day's timeline blocks gain a
third line for notes (`Note: …`) when present, and the meta line now
includes computed hours alongside dept and time. Week stays
single-line per cell — denser, less detail. The pattern: Week is "what
is the schedule?", Day is "what about this shift specifically?".

**Files modified:**
- `src/components/AdminPanel/Scheduling/index.js` — `runWithTransition`
  takes `(cb, dir)`; `goPrev`/`goNext`/`goToday` wrap their state
  updates with the right direction; `.sched-content` carries
  `view-transition-name: sched-canvas`.
- `src/components/AdminPanel/Scheduling/WeekView.js` — added
  `useMemo` import, `fmtHour`/`laneAssign` helpers; `deptFilter` /
  `viewMode` state with smart-default handler; chassis JSX (chips +
  toggle, toggle hidden on mobile) wrapped around all three render
  paths (mobile / desktop-resource / desktop-timeline); new
  `WeekTimelineMode` component renders the 7-col × 24h grid with
  per-day lane-packing.
- `src/components/AdminPanel/Scheduling/DayView.js` — added
  `computeShiftHours()` helper; resource shift bar grows to two
  lines (time + hours, italic notes preview); timeline block
  appends computed hours to its meta line and adds a notes
  preview line.
- `src/components/AdminPanel/Scheduling/Scheduling.css` —
  `@keyframes` for sched-slide-{out,in}-{left,right};
  `[data-sched-dir]::view-transition-old/new(sched-canvas)` rules;
  full `.week-tl-*` layout (wrap, grid, corner, day header, rail,
  hour label, day col, hour line, shift, name, time);
  `.day-resource-track` height bumped to 36px;
  `.day-resource-shift` becomes flex-column;
  `.day-resource-shift-hours` (bold) and
  `.day-resource-shift-notes` (italic) styles;
  `.day-shift-notes` italic third line on timeline blocks.

**Conventions added:**
- **Direction-aware view transitions via dataset.** When the
  same UI shape can be reached from multiple directions
  (prev/next/today/zoom), set a directional hint on the document
  root for the duration of the transition and let CSS
  `[data-...]::view-transition-old/new(name)` rules pick the
  matching animation. Cleaner than naming separate transitions for
  each direction, and the dataset auto-clears when the transition's
  `finished` promise resolves.
- **Detail level differentiates sibling views.** Week and Day share
  the same chassis (chips + toggle + Resource/Timeline modes), so
  the user has one mental model. The difference is *content
  density*: Week is one line of essentials per shift, Day is up to
  three lines (time/hours, notes, dept). Same shape, different
  depth — admin's pick of which to look at depends on whether
  they're scanning or studying.
- **Per-cell lane-packing for grid timelines.** When laying out
  overlapping events in a grid where columns represent independent
  time slots (per-day, per-resource, etc.), run the greedy
  lane-packer separately for each cell. Don't try to pack across
  cells — different cells have different overlap rules. Each
  cell's `_lane` index is local to itself and sized against that
  cell's lane count.

### 2026-05-07 — Sprint 8.4.1: DayView axis polish (edge labels + adaptive density + close-of-day)

Three small but visible fixes after 8.4 landed.

**Resource view — edge "12 AM" labels were clipping.** Hour labels were
positioned at `left: (h/24)*100%` with `transform: translateX(-50%)` —
the standard "center on the position" pattern. At the edges (h=0 →
left:0%, h=24 → left:100%) the centered label half-overflowed the bar,
so the start "12 AM" was cut off on the left and the end "12 AM" was
cut off on the right. Fixed by anchoring the edge labels to their
respective edges via `data-edge`:
```css
.day-resource-hour-label[data-edge="start"] { transform: translate(0,    -50%); }
.day-resource-hour-label[data-edge="end"]   { transform: translate(-100%, -50%); }
```
Mid-axis labels keep `translate(-50%, -50%)`. Visually, every label sits
on its hour line with its appropriate edge anchored.

**Resource view — adaptive label density via ResizeObserver.** At any
single density, you either crowd on small screens or look sparse on
large ones. ResizeObserver on the hour-bar element tracks its measured
width and switches between three discrete steps:
- `< 360px` → step 6h (5 labels: 12 AM · 6 AM · 12 PM · 6 PM · 12 AM)
- `360–720px` → step 3h (9 labels)
- `≥ 720px` → step 1h (25 labels — every hour from 12 AM to 12 AM)

Hour-bar width is the right thing to measure — not viewport width —
because the panel/calendar layout can compress the bar independently
of the viewport. Three discrete steps were chosen so the layout stops
"breathing" between transitions; continuous density would feel jittery
when you resize the window.

**Timeline view — render 25 hour markers + fix the inconsistent top
gap.** The previous layout used 24 row-divs, each 56px tall, with
labels position:absolute at `top: -7px` inside their row — except the
*first* row, special-cased to `top: 4px` to avoid clipping by the
wrapper's top edge. That special case made the visible gap between
12 AM and 1 AM read smaller than the gap between every other pair
(11px shift). Also: the rail stopped at 11 PM, so the close-of-day
midnight wasn't shown — making "I'm scheduling for a 24h day"
ambiguous to the user.

Fix: drop the row-based layout entirely. Hour labels and hour lines
are now absolute-positioned at `top: (h / 24) * 100%` against the
rail/surface. Render 25 markers (h = 0..24, label = `fmtHour(h % 24)`,
so h=0 and h=24 both render "12 AM"). The timeline gets `padding: 8px
0` and `height: 1360px` (1344 + 16) so the first and last labels —
vertically centered on their lines via `translateY(-50%)` — have room
to render without clipping. Every gap is now identical because there's
no special case for any row.

**Day controls — visual divider before the content.** Added
`padding-bottom: 12px; border-bottom: 1px solid var(--border)` to
`.day-controls`. The chip filter + mode toggle pick *what* is shown;
the rows or timeline below are *the showing*. Different concerns,
visually decoupled.

**Files modified:**
- `src/components/AdminPanel/Scheduling/DayView.js` — TimelineMode
  renders 25 absolute-positioned hour labels (`fmtHour(h % 24)`) and
  25 hour lines instead of 24-row layout. ResourceMode adds a
  `useEffect` + ResizeObserver on the hour-bar ref, derives
  `labelStep`, computes `hourLabels` array, marks first/last with
  `data-edge`. Imported `useEffect` and `useRef`.
- `src/components/AdminPanel/Scheduling/Scheduling.css` —
  `.day-controls` gets the divider; `.day-timeline` gets
  `height: 1360px` + `padding: 8px 0`; `.day-hour-rail` becomes
  `position: relative`; `.day-hour-row` rules removed; `.day-hour-label`
  rewritten to absolute with `transform: translateY(-50%)`;
  `.day-resource-hour-label[data-edge="start"|"end"]` anchor overrides.

**Conventions added:**
- **Anchor edge elements to their edges, not their centers.** The
  `transform: translateX(-50%)` "center on the position" pattern works
  for everything *except* the edges of the axis. For first/last
  labels, anchor the relevant edge to the position via
  `translate(0, ...)` or `translate(-100%, ...)`. Mark them via a
  `data-edge` attribute so the conditional doesn't pollute the JSX.
- **Element-width-driven adaptive density beats viewport queries.**
  When a sub-component's container can compress independently of the
  viewport (because of a sibling panel, sidebar, etc.), measure the
  *element* with ResizeObserver and switch density by what the user
  actually sees. Discrete steps (3 here) avoid jitter on resize; pick
  thresholds where the density change is genuinely warranted, not
  every few pixels.
- **Inclusive close-of-day in 24h timelines.** When showing a "full
  day" view, render the close-of-day midnight as well as the start.
  A range from 12 AM to 11 PM reads as "ends at 11 PM"; a range from
  12 AM to 12 AM (next day) reads as "covers the whole day." The
  cost is one extra label/line and a tiny bit of breathing room.

### 2026-05-07 — Sprint 8.4: dual-mode DayView (Timeline + Resource) + dept filter

The iOS-Calendar-Day pattern from 8.0D — hours-on-Y with lane-packed
overlapping shifts — broke down at 4+ overlaps: lanes shrink to ~85px
each and text inside becomes unreadable. The user reported it as
unusable on mobile with even 3 staff visible. Sprint 8.4 keeps the
iOS-style timeline as one mode and adds a **Resource mode**
(staff-on-Y / hours-on-X, one row per person) that scales to any
number of staff, plus a department filter to focus on one team.

**Two modes, user toggles:**
- **Timeline** — hours-on-Y, lane-packed shift blocks. Beautiful for a
  single department (lane count is bounded by that dept's headcount).
- **Resource (Rows)** — staff-on-Y, 24h track per person, single
  positioned shift bar per row. Doesn't lane-pack because nothing
  overlaps within a row; scales arbitrarily — 30 staff → 30 rows.

**Department filter chips** above the controls: `All · Front Desk ·
Housekeeping · …`. Filter and mode are independent state, but the
filter has a **smart default** that auto-flips the mode on change:
- Pick a single dept → switch to **Timeline** (lane count is bounded
  to that dept's people, so blocks read).
- Pick **All** → switch to **Resource** (no lane-packing needed).
The admin can still override via the toggle — both modes work in
either filter state, the smart default is just a starting point so
the obvious-good combo lands without an extra click.

**Resource view layout:**
- Hour-axis header at top (sticky) with labels at 12am/6am/12pm/6pm.
- One row per staff: `grid-template-columns: 130px 1fr` — sticky
  staff-name column on the left, 24h track on the right with a single
  positioned `.day-resource-shift` bar per row.
- Department-grouped subtle headers above each dept's rows, with a
  count summary (`3 / 5 on` — three of five front-desk staff are
  scheduled).
- Empty rows render the track without a bar, so the dept's coverage
  gaps stay visible at a glance.

**Why this layout exists alongside the iOS one rather than replacing
it.** The user explicitly liked the iOS-Calendar feel for one-team
views (small lane count + tall hours feels like reading an actual
schedule). They didn't want to lose it. Resource is the
escape-hatch for "I need to see everyone today" — same data, different
projection. Toggle keeps the per-team aesthetic available when the
admin wants it.

**Files modified:**
- `src/components/AdminPanel/Scheduling/DayView.js` — split into a
  parent component (state + chips + toggle + week strip) and two
  inner components: `TimelineMode` (the original 8.0D layout,
  lane-packed) and `ResourceMode` (new staff-rows layout). New
  helpers `verticalShiftBox()` and `horizontalShiftBox()` for the
  two axis orientations.
- `src/components/AdminPanel/Scheduling/Scheduling.css` — appended
  styles: `.day-controls` row (chips + toggle), `.day-chip` /
  `.day-mode-btn` (chip + segmented-control style), full
  `.day-resource-*` layout (wrap, row, name-col, track, shift bar,
  dept-row sub-headers, hour-bar header). Mobile breakpoint
  shrinks the name column to 96px on phones.

**Conventions added:**
- **When one visualization breaks at scale, add a sibling, don't
  replace.** The iOS-Calendar-Day timeline reads beautifully at small
  scale and breaks at large scale; resource view reads at any scale
  but loses the iOS aesthetic. Toggle between them. Same data,
  different projections — admin picks the one matching the question
  they're asking ("who is here today?" vs "what's the morning
  coverage look like?"). Don't force a one-size-fits-all visual when
  two genuinely different shapes serve different intents.
- **Smart default + manual override beats either alone.** Auto-
  switching mode when the filter changes saves the admin a click for
  the common case (filter Front Desk → wants Timeline 90% of the
  time), but allowing manual override means we don't have to be
  right 100% of the time. The pattern: `setX(suggested(input))` on
  every input change, but never block subsequent manual `setX(other)`
  calls. The "smart" part is just precomputing a reasonable starting
  point, not enforcing a coupling.

### 2026-05-07 — Sprint 8.3: warn-but-allow conflict detection + Sprint 8 close

The last bit of the Sprint 8 umbrella — conflict detection on shift
saves, mobile/tablet polish on the new views. Closes the front-end
scheduling rebuild.

**Conflict detection — warn-but-allow.** Hotels run 24/7 and admins
*sometimes* intentionally double-book a person (sick-call cover,
training overlap, shift handover). Blocking on overlap would force
admins to delete the existing shift first just to add a covering one;
warning lets them confirm-and-go. The `findConflicts()` helper
(exported from `AssignPanel.js`) takes the proposed
`{ userId, dates, startTime, endTime, excludeId }` plus the loaded
`schedules` array and returns the overlapping rows.

The check is purely client-side against currently-loaded schedules
(the slice covering the active view's date range). For recurring
assignments that span past the loaded range, conflicts in unloaded
dates won't be flagged — acceptable tradeoff vs. round-tripping to
the server, since the existing `/api/admin/schedule` POST happily
accepts overlaps too. If the user navigates the view before
assigning, the freshly-loaded data covers the new range.

**Three places get the same warn-but-allow flow:**
- `AssignPanel` — pre-flight check on the bulk submit. If any
  conflicts found, shows an amber strip listing them ("Mon May 7 ·
  9am–5pm") with `[Cancel] [Save N shifts anyway]` actions. The
  regular submit button is hidden during this state.
- `AssignModal` — same pattern for the click-cell-to-assign and
  edit-existing flows. Edit mode passes `excludeId: schedule.schedule_id`
  so the shift being edited doesn't conflict with itself.
- WeekView drag-to-move — *intentionally skipped* for this sprint.
  Drag is fast-paced and a confirmation dialog mid-drag would be
  jarring; if a manager wants conflict-aware moves they'll get it
  via the existing edit modal. Revisit in 8.x.

**Visual: amber, not red.** Errors that block (validation failures
in `.ap-error`) stay red; warnings that allow (`.ap-conflict`) are
amber. Distinct visual codes so the admin learns "red = fix me, amber
= confirm." The "Save anyway" button uses the same amber tone
(`.ap-submit-warn`) so the action and the warning read as paired.

**Mobile/tablet polish:**
- DayView timeline is 1344px tall; gave its wrapper
  `overflow-y: auto` + `-webkit-overflow-scrolling: touch` so it
  scrolls correctly on iOS without rubber-banding the whole page.
  Also added `max-height: calc(100vh - 280px)` so the timeline
  fits within the visible viewport instead of pushing the page
  scrollbar.
- AssignPanel bottom-sheet breakpoint bumped from `<720px` to
  `<900px`. iPads in portrait (820/834px wide) were getting the
  380px right-drawer, which left only ~440px for the calendar
  behind it — too cramped. Bumping the breakpoint puts iPads on
  the bottom-sheet pattern. iPad landscape (≥1024) still gets the
  desktop drawer.

**Files modified:**
- `src/components/AdminPanel/Scheduling/AssignPanel.js` — added
  `findConflicts()` (exported), conflict state, conflict warning UI,
  `proceedSubmit()` / `handleSaveAnyway()` / `handleCancelConflict()`
  flow.
- `src/components/AdminPanel/Scheduling/AssignModal.js` — imports
  `findConflicts` from AssignPanel, adds the same conflict state +
  warning block in the modal body, and split-button footer
  ("Cancel" + "Save anyway" replaces the regular save button when
  conflicts are present).
- `src/components/AdminPanel/Scheduling/index.js` — passes the
  loaded `schedules` array as a prop to both AssignPanel and
  AssignModal.
- `src/components/AdminPanel/Scheduling/Scheduling.css` — amber
  conflict block (`.ap-conflict` + `.ap-conflict-head/list/help/actions`),
  `.ap-submit-warn` amber-tinted button, `.ap-btn-secondary`
  outlined cancel button. DayView wrapper switched to
  `overflow-y: auto`. AssignPanel mobile breakpoint 720→900.

**Conventions added:**
- **Warn-but-allow for soft constraints; block for hard ones.** A
  validation that *can* legitimately be bypassed (overlapping shifts
  in 24/7 ops) should warn the user with an explicit "do it anyway"
  action — never silently allow, never hard-block. The amber +
  paired-amber-button pattern works: amber says "look at this," the
  matching-color action says "yes, that one." Reserve red for "this
  literally cannot proceed" (missing required fields, end-before-start).
- **Pre-flight client checks against loaded data, not round-trip.**
  When the admin's already looking at the data the check needs, do
  the validation client-side against the loaded slice. Cheaper than
  a server round-trip per save, and the server stays the
  authoritative gatekeeper for hard constraints. The tradeoff —
  conflicts outside the loaded range won't surface — is documented
  inline so future maintainers don't have to rediscover it.
- **Skip the warning UI on fast-paced gestures.** Drag-to-move
  shouldn't surface a confirm dialog mid-drag; conflict checks belong
  on the edit/save flows, not in the middle of a continuous gesture.
  If conflict-aware drag is wanted later, the right pattern is a
  visual hint during the drag (red drop target) rather than a modal
  after the drop.

**Sprint 8 — closing notes.** The four-view iOS-Calendar architecture
(8.0), docked Assign panel + bulk recurring (8.1), timeline-positioned
shift blocks (8.2), and warn-but-allow conflict detection (8.3) are
all front-end changes — schema and API surface unchanged. Drag-to-
create and conflict-aware drag-move are explicit non-goals for 8.x;
revisit in a separate sprint. Major debugging session lives at 8.4
when the user finds rough edges.

### 2026-05-07 — Sprint 8.2: timeline-positioned shift blocks in WeekView

WeekView cells used to be full-width "9–5pm" text. Sprint 8.2 turns each
cell into a **24h track** with the shift rendered as a colored bar
positioned by start/end time. At-a-glance you can now *see* who is
working when across an entire dept-grouped week, and gaps in coverage
are visible without reading any times. DayView already had positioned
blocks from 8.0D — this aligns the pattern across both views.

**Track + tick guides + positioned bar.** Every cell (occupied or empty)
renders a `.week-shift-track` — a flat gray rail spanning the cell's full
width. Three faint dashed ticks at 25/50/75% mark 06:00 / 12:00 / 18:00
so the eye has anchors. When the cell has a shift, a `.week-shift-block`
absolutely-positioned bar sits on the rail with `left: startMin/1440`,
`width: (endMin-startMin)/1440`. Department-tinted background, time text
inside the bar (clipped via `overflow: hidden` for very short shifts).

**Two helpers — `timeToMinutes()` and `shiftBarPos()`** — handle the math
and the overnight-shift clip. If a row sneaks through with `end ≤ start`
(overnight, which the assign modal validates against but defense in
depth), the bar is clipped to "until midnight" so the visual still
represents today's portion.

**Empty cells stay clickable.** When no shift: track is still visible
(the 24h rail is informative even without a bar — rows align across
the grid), and a hidden "+" overlay fades in on hover. Cell-level
`onClick` still fires `onAssign` because the track is non-interactive
(`pointer-events: none` on ticks; the empty overlay has the same).
Cells *with* a shift use `onClick` on the bar with `e.stopPropagation()`
to open the edit modal — clicking the bare track in an occupied cell
does nothing (the data model is one shift per user × day).

**Hover lift removed for absolute-positioned bars.** The pre-8.2 block
had `transform: translateY(-1px)` on hover. With absolute positioning
inside a fixed-height track, the lift would push the bar out of the
rail. Replaced with a `box-shadow` + `z-index: 2` on hover so the bar
"comes forward" without leaving its slot.

**Mobile gets the same visualization.** The mobile WeekView (single-day
list) used to render shifts as flat text pills (`9–5pm`). Now each row
is a `.mobile-shift-track-btn` containing the same `.week-shift-track`
+ `.week-shift-block` markup at slightly smaller size. Visual parity
with desktop; the day-list reads as a vertical stack of mini timelines.

**Files modified:**
- `src/components/AdminPanel/Scheduling/WeekView.js` — added
  `timeToMinutes()` + `shiftBarPos()` helpers; restructured both
  desktop and mobile shift renders to use `.week-shift-track` +
  positioned `.week-shift-block`; tick guides + title attribute for
  hover tooltip with full time.
- `src/components/AdminPanel/Scheduling/Scheduling.css` — rewrote
  `.week-shift-cell` / `.week-cell-empty` / `.week-shift-block` for
  the new layout; added `.week-shift-track`, `.week-shift-tick`,
  `.mobile-shift-track-btn`. Hover lift swapped for
  `box-shadow + z-index`.

**Conventions added:**
- **Time-positioned bars over text labels for calendar cells.** When
  a calendar cell holds an event with start/end times, render a
  positioned bar on a uniform time-axis rail rather than text inside
  the cell. Coverage gaps and overlap patterns become visually
  obvious; a manager scanning a week of rows sees who's-working-when
  in one read instead of decoding "9–5pm" repeated 50 times.
- **Track-always-rendered for visual rhythm.** Even cells without an
  event should render the empty track. The mental model "every row
  has a 24h rail" is stronger than "rows with events look one way,
  empty rows another" — the eye picks up on rhythm and finds gaps
  faster. Cost is a few pixels of gray bar for empty cells.
- **No `transform` lift on absolute-positioned hover targets.** The
  classic "lift on hover via translateY" pattern doesn't compose
  with `position: absolute` inside a fixed-height container — the
  element exits its slot. Use `box-shadow` + `z-index` instead so
  the element appears to come forward without leaving its track.

### 2026-05-07 — Sprint 8.1: docked Assign Shifts panel + bulk recurring assign

The header `+` button placeholder from 8.0 is now wired to a real
side-panel that lets the admin rapidly assign shifts — single-shot or
**bulk recurring across many dates** — without leaving the calendar.
Right-docked drawer on desktop, bottom-sheet on mobile.

**Why a panel and not a modal.** Modals own the screen and demand a
single completed task before closing. The hotel scheduling use case is
the opposite — admin opens it once and fills in 5–20 shifts in one
session ("schedule next week"). The panel stays open after each
submit; only the staff selection + notes reset, while time/mode/range
are retained so the next admin keystroke is "Jane → Add" → "Mike →
Add" → done. AssignModal is kept around for the click-existing-shift
edit/delete flow (different intent).

**Two modes:**
- **Single date** — one staff × one date × one start/end → one POST.
  Lightest path; default landing.
- **Recurring** — one staff × multi-date computed from
  `{from, to, daysOfWeek}` × one start/end → N POSTs in a loop. Day-
  of-week is a 7-button pill row (Mon–Sun, default Mon–Fri active);
  the panel previews `"8 shifts will be created"` so admin sees the
  count before submitting. `computeRecurringDates(from, to,
  selectedDays)` is the helper — exported so 8.x sprints can reuse it
  for "copy this schedule to next week" type features.

**Dept-grouped staff dropdown.** The `<select>` uses `<optgroup>` so
staff are clustered by department — much faster to scan than a flat
alphabetical list. Templates (optional shift presets) auto-filter by
the selected staff's department: a Housekeeping template doesn't
appear when a Front Desk staff is selected.

**Bulk POST loop, server unchanged.** `/api/admin/schedule` still
accepts one shift per request; the panel iterates locally. The
loop tracks `{ ok, fail, message }` and surfaces a per-batch summary
inside the panel ("✓ Added 8 shifts" or "5 added, 3 failed — Phone
already exists" if the server pushed back). One `loadSchedules()`
refresh runs at the end if anything succeeded — not per-shift,
because we don't want 8 GET round-trips during a Mon-Fri assign.

**Mobile = bottom sheet.** Under 720px, the panel switches from
right-docked (translateX) to bottom-anchored (translateY) with a
rounded top edge. Standard touch pattern — Apple/Google Maps, Linear,
Notion mobile all do this. Animations honor `prefers-reduced-motion`.

**Files added:**
- `src/components/AdminPanel/Scheduling/AssignPanel.js` — panel
  component with the form, mode toggle, recurring-date computer,
  and dept-grouped staff select. Exports `computeRecurringDates()`
  for reuse.

**Files modified:**
- `src/components/AdminPanel/Scheduling/index.js` — `panelOpen` +
  `panelPrefill` state; `handlePanelSubmit` runs the bulk POST loop
  and refreshes once at the end; `+` button toggles the panel.
- `src/components/AdminPanel/Scheduling/Scheduling.css` — full
  panel layout (scrim, drawer, head, body, fields, day-of-week pill
  row, mode toggle, error/result strips, submit button) plus a
  bottom-sheet override under 720px and reduced-motion fallback.

**Conventions added:**
- **Panel for repeat-task creation, modal for single edit.** When a
  task is bulk-by-nature (assigning many shifts, importing many
  rows), use a docked panel that survives submit. When a task is
  one-shot-by-nature (edit *this* row), use a modal. The decision
  rule: "after the user submits, what's the next thing they want
  to do?" — same task again ⇒ panel; back to the page ⇒ modal.
- **Reset only the discriminating fields after submit.** When a
  panel keeps state across submissions, reset just the fields that
  *differ* between consecutive entries (staff, notes), keep the
  ones that probably stay the same (time, mode, date range). The
  admin perceives speed because each subsequent shift takes one
  field worth of typing instead of a full form.
- **Sequential POSTs with one final refresh, not per-iteration.**
  When a UI action causes N writes, run them sequentially and
  refresh the read-side once at the end. Refreshing per-write
  multiplies network round-trips and can make the screen flicker
  through intermediate states. Track per-write outcomes in a local
  counter so the user still gets a per-batch summary.

### 2026-05-07 — Sprint 8.0: scheduling rebuilt as iOS-Calendar-style 4-view zoom

The old scheduling page was a Week+Month toggle with per-day "Assign"
modal lookup. Functional but doesn't scale once a hotel has 30+ staff
across multiple departments — managers can't see coverage at a glance,
and the assign flow is one shift at a time. Sprint 8.0 lays the
foundation for a new scheduling experience patterned on the iOS Calendar
app: **Year → Month → Week → Day**, with smooth zoom animations between
them via the View Transitions API (Sprint 7.4 pattern).

**View hierarchy + cursor model.** A single `cursor` Date drives every
view; switching views preserves the cursor so the admin keeps their
place. Default landing is **Month** (matches iOS). The user's
explicitly-stated rules:
- **Year**: 12 mini-month tiles (4×3 desktop / 2×6 tablet / 1×12 mobile).
  Click anywhere on a month → zoom into that month. Cannot jump to a
  specific day from Year — must enter Month first, then click a day
  (mirrors iOS Calendar behavior exactly).
- **Month**: 7-col grid; each day cell shows department-abbreviated
  headcount (`FD: 2 · HK: 2 · MT: 1`) instead of just total count +
  dots. Click a day → zoom into Day.
- **Week**: existing staff-by-day grid kept as-is for power users.
  Reachable via the segmented control; not in the zoom hierarchy.
- **Day**: iOS-Calendar Day-view layout — horizontal week strip on top
  (M T W T F S S, cursor highlighted, click to switch days), then a
  full 24-hour timeline (00:00 → 24:00) with shifts as positioned
  colored blocks (department-tinted). Overlapping shifts are
  **lane-packed** side-by-side via a greedy first-fit algorithm.

**View Transitions API zoom.** Each Year-view month tile and each
MonthView day cell carries a unique `view-transition-name`
(`sched-month-${m}` / `sched-day-${YYYY-MM-DD}`). The corresponding
container in MonthView / DayView carries the *same* name. Wrapping the
nav in `runWithTransition()` (`document.startViewTransition` +
`flushSync`) makes the browser FLIP from the small targeted tile to the
full container. Default duration tuned to 320ms with the same
ease-out-cubic curve we use everywhere else.

**Header restructure.** Left side of the header now shows a contextual
back arrow when the current view is zoomed in (Day → Month, Month →
Year), or the original "← Home" otherwise. Right side has the 4-way
segmented control (Year/Month/Week/Day) and a "+" placeholder button
that 8.1 will wire to the docked Assign Shifts side panel.

**Schema unchanged.** Sprint 8 is front-end-first; the existing
`schedules` table is sufficient. No backend changes in 8.0.

**Files added:**
- `src/components/AdminPanel/Scheduling/YearView.js` — 12 mini-month
  tiles + a `MiniMonth` helper component (today circled, days with
  shifts dotted).
- `src/components/AdminPanel/Scheduling/DayView.js` — week strip + 24h
  timeline with `laneAssign()` greedy lane-packer for overlapping
  shifts. Renders blocks via `position: absolute` with top/height as %
  of 24h and left/width based on lane index ÷ lane count.

**Files modified:**
- `src/components/AdminPanel/Scheduling/index.js` — replaced
  `view`/`weekStart`/`month` triple-state with `view` + `cursor`
  (single Date) + `runWithTransition()` zoom helper. Header rebuilt
  with back arrow + 4-way toggle + "+" placeholder. Conditional
  rendering for all four view components.
- `src/components/AdminPanel/Scheduling/MonthView.js` — day cells
  rebuilt as `<button>` elements that show department-abbrev + count
  rows (`FD: 2`). Each day cell carries the `sched-day-${dateStr}`
  view-transition-name so the zoom into DayView works.
- `src/components/AdminPanel/Scheduling/Scheduling.css` — appended
  styles for: button-element overrides on `.month-day-cell`,
  `.month-dept-line/tag/count`, full Year-view + mini-month layout,
  full Day-view (week strip + timeline + shift blocks), `.sched-add-btn`,
  and a universal `::view-transition-old/new(*)` rule that times every
  named transition at 320ms with reduced-motion override.

**Conventions added:**
- **iOS-Calendar-style hierarchical zoom.** When you have nested
  granularities (year → month → day), each *target* tile in the
  outer view and the matching *container* in the inner view both get
  the same `view-transition-name`. The browser's FLIP animation
  scales the tile up to the container — feels exactly like iOS
  Calendar's pinch-zoom. Universal selector
  `::view-transition-old/new(*)` lets you set duration/easing once
  for all named transitions in the page; no need to enumerate the 12
  + 365 unique names.
- **Single cursor + view enum beats parallel state.** When multiple
  views all describe a moment in time at different granularities,
  collapse them to one `cursor: Date` and derive view-specific ranges
  from it (`startOfWeek(cursor)`, `cursor.getMonth()`, etc.). The
  alternative — separate `weekStart`, `monthYear`, `dayDate` — drifts
  out of sync the moment any view-switch logic forgets to update one.
  Single source of truth; switch view, keep place.
- **Greedy lane-packing for overlapping calendar blocks.** Sort by
  start time; for each block, drop into the leftmost lane whose last
  block ends ≤ this block's start; if none, append a new lane. Track
  `_lane` per block plus total lane count, then position with
  `left: lane/count`, `width: 1/count`. Doesn't produce optimal
  packing but produces *stable* packing (admin sees the same lanes
  on a refresh) and is O(n × lanes) — fast enough for any single-day
  shift count a hotel will throw at it.

### 2026-05-07 — Sprint 7.4: animated swap between staff + admin login

The staff login card is tall (auto-detect identifier + on-screen keyboard),
the admin login card is short (just username + password). Switching
between them via the `Manager sign-in →` / `Staff sign-in →` link was a
hard cut — the card snapped to the new size, content swapped instantly.

**Fix: View Transitions API.** Tagged `.login-card` with a unique
`view-transition-name`. When a navigation is wrapped in
`document.startViewTransition()`, the browser captures snapshot of the
old DOM, runs the React update, captures the new DOM, and animates
between them — size, position, and content cross-fade are handled
automatically. No FLIP math, no measuring, no JS animation library.

**`flushSync` is mandatory.** React batches state updates, so by default
a `nav('/login/admin')` call inside the transition callback wouldn't
have actually mutated the DOM by the time `startViewTransition` snapshots
the "new" state — the browser would diff the old DOM against the still-old
DOM and animate nothing. Wrapping the nav in `flushSync()` forces the
update synchronously inside the callback so the snapshot lands correctly.

**Implemented as a reusable `<TransitionLink>` component**
(`src/pages/Login/TransitionLink.js`) that wraps react-router's `<Link>`:
intercepts the click only when the API is available, skips on
modifier-key clicks (cmd/ctrl-click should still open in a new tab via
the underlying `<a>`), and falls through to vanilla Link nav on browsers
without the API. Means the only changes in StaffLogin/AdminLogin are
swapping `Link` for `TransitionLink`.

**`prefers-reduced-motion` honored** by collapsing the animation duration
to 1ms — keeps the API working for behavior (the navigation still goes
through `startViewTransition`) without showing motion to users who've
opted out.

**Files added:** `src/pages/Login/TransitionLink.js`.

**Files modified:**
- `src/pages/Login/StaffLogin.js`, `AdminLogin.js` — `Link` → `TransitionLink`.
- `src/pages/Login/Login.css` — `view-transition-name: login-card` on
  `.login-card`; custom `::view-transition-old/new` duration + easing;
  reduced-motion override.

**Conventions added:**
- **`document.startViewTransition` + `flushSync` for React route
  transitions.** When animating between two react-router routes that
  share a visual element (a card, a panel, a modal), wrap the
  navigation in `document.startViewTransition(() => flushSync(() =>
  navigate(to)))`. Tag the shared element with `view-transition-name`.
  The browser handles the FLIP-style animation. Skip the API gracefully
  when unsupported — *don't* polyfill it with framer-motion or similar
  unless the visual is critical to the UX.
- **Modifier-key passthrough on intercepted Links.** Anything that
  intercepts a `<Link>`'s click and prevents default needs to early-out
  on `metaKey || ctrlKey || shiftKey || altKey` so cmd-click / ctrl-click
  / shift-click still hand off to the browser's "open in new
  tab/window" behavior. Otherwise the link feels broken to power users.

### 2026-05-07 — Sprint 7.3: locked-height keyboard + content-aware letter-spacing

Two visual fixes on the staff login.

**7.3A — page jumps when switching keyboards.** The numeric keypad
(5-row grid) and the letters keyboard (4-row flex) had different
heights, so toggling between them shifted the submit button + the
"Manager sign-in" link up and down. Fix: render *both* keyboards
always, stacked in the same grid cell:
```css
.login-kb-area { display: grid; }
.login-kb-area > * { grid-column: 1; grid-row: 1; }
.login-kb-area > .is-hidden { visibility: hidden; pointer-events: none; }
```
Grid sizes the cell to fit *both* children (since `visibility: hidden`
items still contribute to layout — only `display: none` removes them).
Whichever keyboard is the taller drives the cell height, the other
fills the same space and is invisible. The numeric keypad is taller, so
the letters keyboard leaves a small bottom gap when active — accepted
as a better tradeoff than the page jumping.

Hidden buttons also get `tabIndex={-1}` so keyboard nav doesn't tab
through invisible buttons, and the wrapper carries `aria-hidden` so
screen readers skip the inactive set.

**7.3B — long placeholder cut off by `letter-spacing`.** The
`.is-keypad` input had a uniform `letter-spacing: 0.18em` that made
phone numbers look nicely spaced but blew up the placeholder
("10-digit phone · 4–6 digit ID · username") past the input's right
edge. Split the rule by content type:
```css
.login-field input.is-keypad           { /* normal spacing */ }
.login-field input.is-keypad.is-numeric { letter-spacing: 0.18em; ... }
```
The `is-numeric` class is applied via JS only when the input value is
purely digits (`/^[0-9]+$/`) — empty input doesn't match, so the
placeholder never gets the wide spacing. Usernames also keep normal
spacing, which reads more naturally for letters. PIN input always has
`is-numeric` because PIN is digits-only.

**Files modified:**
- `src/pages/Login/StaffLogin.js` — both keyboard components accept a
  `hidden` prop that adds `is-hidden` class and sets `tabIndex={-1}`
  on inner buttons; render both inside `<div className="login-kb-area">`
  always; identifier input gets `is-numeric` based on content; PIN
  input gets `is-numeric` always.
- `src/pages/Login/Login.css` — `.login-kb-area` grid stack;
  `.is-hidden` visibility/pointer-events rule; split letter-spacing
  rule into base + `.is-numeric` modifier.

**Conventions added:**
- **Lock interactive UI height by stacking both states.** When two
  views (toggleable keyboards, before/after states, etc.) live in the
  same flow position and have different intrinsic heights, render both
  always and stack them in a 1×1 grid cell. `visibility: hidden` keeps
  inactive content in the layout for sizing purposes without showing
  it. The wrapper auto-sizes to the taller child, so toggling never
  shifts surrounding content. Cheaper than measuring with JS and
  applying a fixed `min-height`.
- **Decouple display style from content.** Don't hardcode visual
  treatments (wide letter-spacing, monospace, tabular-nums) on a
  control that accepts multiple content types. Apply them via a
  modifier class (`.is-numeric`) toggled by JS based on what's
  actually in the input. Same field looks like a phone-number entry
  when the user types digits and like a normal text input when they
  type a name.

### 2026-05-07 — Sprint 7.2: letters keyboard bottom row

Sprint 7.1 left the letters-keyboard bottom row with just the `123`
switcher in the corner — visually unbalanced *and* missing the three
legal username punctuation chars (`_`, `-`, `.` per the
`[A-Za-z0-9._-]` regex). Without those keys, a username with a period
or dash couldn't be typed on the on-screen keyboard at all.

Bottom row is now five equal-width keys: `Clear · 123 · _ · - · .`.
Dropped the previous `flex: 0 0 28%` rule so the five buttons inherit
the row's default `flex: 1 1 0`. Added `.lk-sym` for the three
punctuation buttons with a slightly larger glyph (22px vs the row's
17px) since underscore/dash/period look anemic at letter size.

The `grid-column: 1 / -1` on `.lk-kb-switch` keeps working for the
numeric keypad's `ABC` button (it spans all 3 grid cols there) and is
silently ignored in the letters-keyboard row 4 (a flex container,
where `grid-column` does nothing). Same class, two layout contexts —
worth being aware of when touching either keyboard's CSS.

**File modified:** `src/pages/Login/StaffLogin.js` (5-button row 4),
`src/pages/Login/Login.css` (drop 28%-width rule, add `.lk-sym`).

### 2026-05-07 — Sprint 7.1: built-in QWERTY keyboard on the staff login

Sprint 7 added username login but left the on-screen widget as the
existing 3-column numeric keypad — fine for phone/employee-ID, useless
for usernames. Sprint 7.1 adds a full QWERTY keyboard so a tablet/kiosk
deployment doesn't need to depend on the OS soft keyboard being
available or appropriate. The two keyboards swap via a corner switcher,
the same pattern iOS uses (`123` on the letter keyboard, `ABC` on the
number keyboard).

**Layout (mirrors iPhone portrait):**
- Row 1: `Q W E R T Y U I O P` (10 keys)
- Row 2: `A S D F G H J K L` (9 keys, indented ~5% so they sit centered
  under row 1)
- Row 3: `⇧ Z X C V B N M ⌫` — Caps and Backspace flank the 7 letters,
  styled `flex: 1.5` so they read as wider modifiers
- Row 4: `123` switcher, narrow button at the left (28% width) like iOS

**Caps is intentionally cosmetic.** The server compares usernames
case-insensitively (`LOWER(username) = LOWER($1)`), so toggling caps
doesn't change the login outcome — it just changes what the user sees
they're typing. Documented inline in the StaffLogin comment so a future
maintainer doesn't "fix" the no-op.

**PIN field is hardwired to numbers.** `activeField === 'pin'` ignores
`kbMode` and always renders the numeric keypad, so the user can't get
themselves into a state where they're trying to enter a 4-digit PIN on a
letters keyboard. The letters keyboard's `onKey` also rejects non-digit
input when the PIN field is active as a defense-in-depth check.

**Files modified:**
- `src/pages/Login/StaffLogin.js` — split the keypad into two
  components (`KeypadNumbers`, `KeyboardLetters`), added `kbMode` and
  `caps` state, added `onSwitch` props that flip mode, conditionally
  rendered based on `activeField === 'id' && kbMode === 'letters'`.
- `src/pages/Login/Login.css` — `.login-kb-letters` flex-column
  container, four `.login-kb-row-N` rows with their own widths,
  `.lk-kb-switch` spans the full row in the numbers keypad
  (`grid-column: 1 / -1`) so `ABC` sits alone at the bottom.

**Conventions added:**
- **Two-mode soft keyboard pattern.** When a single input accepts both
  digit-shaped and letter-shaped values, render two keyboards and let
  the user toggle via a corner switcher button (`123` / `ABC`).
  Trying to render one keyboard with both letters and digits crammed
  together makes every key tiny and stops looking like a keyboard.
  Mode lives in component state, not auto-detected from input —
  the user can always force the mode they want.
- **Cosmetic-vs-functional toggles deserve a comment.** When a
  control's *visual* state intentionally has no effect on backend
  behavior (Caps in our case), say so in a comment near the toggle.
  Future maintainers will assume "broken" otherwise.

### 2026-05-07 — Sprint 7: multi-identifier login (phone / username / employee ID)

Until now staff logged in with a phone number. Sprint 7 adds two more
identifier types — **username** and **employee ID** — and lets the admin
attach any combination of the three to a staff record. A staff member can
log in via whichever identifier they remember; behind the scenes the
server auto-detects the type from the input shape.

**Format rules (enforced both in the app and via DB CHECK constraints):**
- `phone_number` — 10 digits, stored as `VARCHAR(10)`. Now nullable.
- `employee_code` — 4–6 digits, stored as `TEXT` so leading zeros work
  (`"0042"` ≠ `"42"`).
- `username` — 3–16 chars from `[A-Za-z0-9._-]`, **must contain at least
  one letter**, case-insensitive uniqueness, case-preserving storage.

The "must contain a letter" rule on usernames is the keystone of the
auto-detect: it guarantees an all-digit value can be classified
unambiguously as either phone (10 digits) or employee ID (4–6 digits).
Without it, the username `"12345"` would be unreachable at login because
the auto-detect would always read it as an employee_code. Document this
constraint anywhere usernames are accepted.

**Auto-detect classifier (`server.js: classifyIdentifier`):**
```
all digits, length 10  → phone_number
all digits, length 4-6 → employee_code
[A-Za-z0-9._-]{3,16} with ≥1 letter → username (case-insensitive)
anything else          → reject
```
Identical regex constants live on the client (`StaffLogin.js`) for
submit-button gating; the server is the source of truth.

**At least one identifier required.** A `users_at_least_one_identifier`
CHECK constraint guarantees no row exists that nobody can log in as. The
admin add-staff form and the StaffDetail edit form both bail with a
friendly message before the request is sent, so the constraint is a
defense-in-depth backstop, not the primary user-facing validator.

**Backward compatibility on the login endpoint.** `POST
/api/auth/staff/login` reads `req.body.identifier ?? req.body.phone`, so
any pre-Sprint-7 client that still sends `{ phone }` keeps working. New
clients send `{ identifier }`.

**DB migration 008 is required before deploy.**
`psql "$DATABASE_URL?sslmode=require" -f database/migrations/008_login_methods.sql`
adds the new columns, drops `NOT NULL` from `phone_number`, creates the
two partial unique indexes (`LOWER(username)` + `employee_code`), and
adds the three CHECK constraints. Idempotent — safe to re-run.

**Files added:**
- `database/migrations/008_login_methods.sql`.

**Files modified:**
- `database/schema.sql` — `users` table mirrors migration 008 (new
  columns, dropped NOT NULL on `phone_number`, partial unique indexes,
  CHECK constraints for at-least-one + format on each).
- `server/server.js` —
  - Added classifier + per-field validators + `validateIdentifiers()`
    helper + `uniqueViolationMessage()` mapper.
  - Rewrote `POST /api/auth/staff/login` to use the classifier.
  - `GET /api/admin/employees`, `GET /api/admin/employees/:id`,
    `GET /api/me` now return `username` + `employee_code`.
  - `POST /api/admin/employees` and `PUT /api/admin/employees/:id`
    accept all three identifier fields, require ≥1, surface
    field-specific unique-violation messages.
- `src/auth/index.js` — `loginStaff(identifier, pin)` (param renamed,
  body now sends `{ identifier }`).
- `src/pages/Login/StaffLogin.js` — renamed phone state to
  `identifier`; input accepts `[A-Za-z0-9._-]` up to 16 chars;
  `inputMode="text"`; on-screen keypad **hidden** when input contains a
  non-digit (signals username intent); label and placeholder updated.
- `src/components/AdminPanel/StaffManager.js` — add-form now has three
  identifier inputs in a sectioned group; phone no longer marked
  required; client-side ≥1 check before submit.
- `src/components/AdminPanel/StaffDetail.js` — edit form parallels the
  add-form; read-only info grid shows all three identifiers; pin-meta
  copy updated to "log in with their identifier alone".
- `src/components/AdminPanel/AdminPanel.css` — `.add-form-section`
  styles (full-row separator block inside the auto-fill grid).

**Conventions added:**
- **Letter-required usernames as auto-detect tiebreaker.** When a single
  input field accepts multiple identifier types, define the regex of
  each type so they don't overlap. For HotelOps that meant requiring
  at least one letter in usernames so all-digit inputs are
  unambiguously phone or employee ID. Same principle applies any time
  you build "smart" inputs — the rule must be stated and enforced at
  every layer (client validator, server classifier, DB CHECK).
- **Partial unique indexes for nullable identifiers.** Don't reach for
  `UNIQUE` on a nullable column when you want "unique when present" —
  the SQL standard treats NULLs as distinct, but PostgreSQL's
  `UNIQUE NULLS DISTINCT` semantics are version-sensitive. Use a
  partial index instead: `CREATE UNIQUE INDEX ... WHERE col IS NOT
  NULL`. Same pattern works for case-insensitive uniqueness via
  `LOWER(col)`.
- **Backward-compat on auth endpoints.** When renaming a field on a
  login route, accept both old and new for a window
  (`req.body.identifier ?? req.body.phone`). Even with a single
  client, refresh-load lag means an in-flight tab on the old code can
  hit a redeployed server. Cheap insurance.
- **Defense-in-depth validation.** Format rules live in three places:
  client (friendly error before submit), server (final word for the
  API), DB CHECK (last-line guarantee that bad data can never reach a
  row). The DB layer doesn't replace the others — it backs them up
  when an app-level bug lets something through.

### 2026-05-07 — Sprint 6.7: themed radio + checkbox utilities

The Export popover's Scope section had three native `<input
type="radio">` controls. Same problem as the Include-inactive
checkbox before Sprint 6.6 — native form widgets stuck out as
un-themed elements next to chip-styled controls and brand-colored
buttons. The Include-inactive fix was easy: it's a binary toggle,
so a `<button aria-pressed>` works. But radios in a group need
keyboard arrow navigation, focus management, and `name=`-based
mutual exclusion — re-implementing those by hand is the kind of
thing that's easy to subtly break (forgetting `aria-checked`,
losing focus on selection change, missing arrow-key handling).

**Decision: restyle native inputs rather than rebuild them.** Keep
the platform `<input type="radio">` / `<input type="checkbox">`
exactly as is — the browser handles every behavior — and just hide
the platform widget visually with `appearance: none` and draw our
own indicator using `::after`. This is what Stripe / Vercel /
Notion / every production design system does for the same reason:
the behavior cost of rebuilding is not worth the visual control.

**Two utility classes in `src/index.css`:**
- `.hop-radio` — circle (`border-radius: 50%`), checked state shows
  an 8px brand-color dot via `::after`.
- `.hop-check` — square (`border-radius: 4px`), checked state fills
  with brand color and shows a white `✓` via `::after`.

Both share a base ruleset for sizing (16×16, 1.5px border), hover
(border darkens via `var(--text-muted)`), `:focus-visible` (2px
accent outline with offset), and `:disabled` (40% opacity,
not-allowed cursor). Apply by adding the class to the input itself
— no wrapper restructuring needed:

```jsx
<label>
  <input type="radio"    className="hop-radio" name="..." />
  <input type="checkbox" className="hop-check" />
</label>
```

**First consumer:** the three Scope radios in `StaffManager.js`
export popover. The previous `staff-mgr-export-radio` *label*
styling stays — it owns the row layout, gap, hover, disabled state
of the row. The new utility class only repaints the *input*.

**Files modified:**
- `src/index.css` — appended `.hop-radio` + `.hop-check` rules
  after the base typography reset.
- `src/components/AdminPanel/StaffManager.js` — added
  `className="hop-radio"` to all three `csv-scope` radios.

**Conventions added:**
- **Restyle native form inputs; don't rebuild them.** When a
  themed UI needs custom-looking checkboxes / radios, the answer
  is `<input type=... > + appearance: none + ::after` — not
  `<button aria-checked>`. The native input keeps doing all the
  accessibility work (radio grouping via `name=`, keyboard arrow
  nav, focus, screen-reader semantics) and we just paint over the
  platform widget. The exception is binary on/off toggles where
  there's no group: `<button aria-pressed>` is fine because you
  don't lose anything by skipping the input (see Include-inactive
  in Sprint 6.6C).
- **Project-wide form utilities live in `src/index.css`.** Classes
  named `hop-*` (HotelOps namespace) are global utilities that
  any component can use. Component-scoped CSS files
  (e.g. `AdminPanel.css`) are for component layout and one-off
  styling; cross-cutting controls go in `index.css` so we don't
  have N copies of the same restyled radio scattered across
  feature folders.

### 2026-05-07 — Sprint 6.6: filter-row polish (export popover + toggle)

Three small but visible bugs in the StaffManager filter row.

**6.6A — Period control wraps "Year" to a second line.** The four
period buttons used `flex: 1 1 64px` with `flex-wrap: wrap`; on the
popover's natural 320px-ish width, three buttons fit and "Year"
landed on its own row. Switched the container to
`display: grid; grid-template-columns: repeat(4, 1fr)` so a
fixed-count segmented control always renders one row of equal-width
cells. Buttons drop their `flex` / `min-width` and let grid drive
sizing; padding tightened to `6px 8px`.

**6.6B — Mobile popover cut off on the left.** On narrow viewports
the filter row wraps and the export wrapper landed *mid-row*, not
on the right edge of the screen. With `right: 0` of the wrapper,
the popover's right edge tracked the trigger's right edge, and
the popover's natural `max-content` width (~430px in practice
because of the longest scope row) pushed its left edge past the
left side of the viewport.

First attempt at fixing this used a viewport-fixed bottom-sheet
under 720px (`position: fixed; left/right: 16px; bottom: 16px`),
which kept the popover inside the screen but visually disconnected
it from the Export trigger — it floated at the bottom of the
viewport with the staff list, search, and chips between it and the
button. User feedback: it should still feel anchored to the
button.

Final fix has two parts that together keep the popover both
in-viewport and visually attached:
1. `.staff-mgr-export { margin-left: auto }` at all viewports —
   forces the export wrapper to the right of its filter-row line
   regardless of how the row wraps. With that guarantee, `right: 0`
   anchoring lands the popover at a known position near the right
   edge of the viewport.
2. Cap popover width at a fixed `320px` (with
   `max-width: calc(100vw - 32px)` as a guard for very narrow
   phones). Content fits comfortably at 320px and the popover can
   never grow wide enough to overshoot the left edge.

**6.6C — Include-inactive used the default browser checkbox.** The
control sat next to chip-styled department filters and a primary
button, and the platform checkbox stood out as the one un-themed
element on the row. Converted to a chip-styled `<button
aria-pressed>` toggle: same padding, same pill shape, same
brand-fill is-active state as the dept chips. State is plain JS
(`onClick={() => setIncludeInactive(v => !v)}`); accessibility lives
on `aria-pressed`. Native checkbox / `<label>` removed.

**Files modified:**
- `src/components/AdminPanel/AdminPanel.css` — `.staff-mgr-export-period`
  rewritten as 4-col grid; `.staff-mgr-export-period-btn` drops
  `flex`/`min-width`; `.staff-mgr-export-menu` width changed from
  `max-content` to `320px`; <720px breakpoint switches popover to
  fixed bottom-sheet (deleted the old <420px breakpoint — the
  bottom-sheet handles all narrow viewports uniformly);
  `.staff-mgr-toggle` rewritten as chip-style pill button (matches
  `.staff-mgr-chip` rules but distinct class).
- `src/components/AdminPanel/StaffManager.js` — include-inactive
  control: `<label><input type=checkbox></label>` → `<button
  aria-pressed onClick=toggle>`.

**Conventions added:**
- **Fixed-count segmented controls use grid, not flex.** When the
  number of options is known and fixed (Today/Week/Month/Year,
  All/Mine/Team, etc.) and you want them in one row of equal cells,
  reach for `display: grid; grid-template-columns: repeat(N, 1fr)`.
  Flex with `min-width` will wrap on narrow content widths and
  produce the lone-button-on-second-row look. Grid removes that
  failure mode entirely.
- **Pin the trigger, not the popover.** When a wrap-able filter
  row holds a popover trigger, the temptation is to make the
  *popover* smarter (left/right anchor, fixed bottom-sheet, JS
  position calc). Often it's easier to pin the **trigger**: give
  the wrapper `margin-left: auto` so it always sits at the right
  edge of its line. Then a simple `right: 0` absolute popover
  always lands in a predictable, in-viewport position — and stays
  visually connected to its button. Bottom-sheets are great for
  things like menus and dialogs that are *intentionally* detached
  from a trigger, but for inline popovers the connection matters.
- **Cap popover width over `max-content`.** A `width: max-content`
  popover sizes to the longest single line inside it (often a
  scope label or radio option) and can balloon past viewport
  bounds. Pick a sensible fixed width (e.g. `320px`) that fits
  the content comfortably and clamp with
  `max-width: calc(100vw - 32px)` for very narrow phones. The
  fixed width also gives the segmented controls inside it a
  stable basis to grid against.
- **Native form controls inherit OS chrome — restyle them when they
  ride alongside themed controls.** A native checkbox in a row of
  chip-styled buttons reads as alien. The cheapest fix is to drop
  the native control entirely and use `<button aria-pressed>` with
  the same visual language as the surrounding chips/pills. Reserve
  native `<input type=checkbox>` for forms where the user expects
  the platform UI (e.g., long form submission with default browser
  validation).

**6.6 addendum — filter row visual hierarchy + stat arrow removal.**
Two small post-fix polish items.

1. The filter row had four flex children — search, dept chips,
   include-inactive, export — but the first two are *filtering*
   the list while the last two are *display + action* on the
   list. Reading them as one continuous band of controls was
   misleading. Inserted a `<div class="staff-mgr-filter-divider"
   aria-hidden />` between chips and toggle. CSS:
   `flex-basis: 100%; height: 0; border-top: 1px solid
   var(--border)`. The `flex-basis: 100%` is the trick — it
   forces a wrap break in the flex container *and* draws a
   horizontal rule via `border-top` on a zero-height element.
   Cleaner than a pseudo-element on `.staff-mgr-toggle` because
   the divider is a real element with `aria-hidden` and works
   even when toggle isn't rendered.
2. Selected stat cards in StaffManager had a downward-pointing
   triangle below them (`.staff-mgr-stat-arrow`) pointing at the
   list. Visual noise — the blue ring already conveys "this
   filter is selected." Removed both the JSX render and the CSS
   rule. (AdminHome's `.adm-stat-arrow` left in place — the user
   only flagged the StaffManager case, and AdminHome's arrow
   does the connecting work between the stats banner and a
   detail card *swap* below, which is a slightly different UX.)

**Convention added:**
- **`flex-basis: 100%` divider for visual sectioning inside a
  flex-wrap row.** When a wrap-able flex row holds two
  conceptually distinct groups of controls, separate them with
  an empty `<div>` whose `flex-basis: 100%` forces a row break.
  Add `border-top` to also draw a rule. Beats restructuring the
  DOM into two separate flex containers because it preserves
  the single-row layout when the screen is wide enough for
  everything to fit.

### 2026-05-02 — Sprint 6.5.1: finish the Home/Staff de-duplication

Sprint 6.5B made the two banners *less* duplicated but didn't go far enough.
"On the clock" still appeared on both pages, and "Pending approvals" on
AdminHome was a leftover (manual-edit approval queue is empty in practice
— the OT bucket is the real action-required signal). The user also caught
a subtle bug in **Avg hours / staff**: the denominator was `total active`
even when half the staff didn't work that week, so the average drifted
down for reasons unrelated to scheduling.

**Final lens split.** Both pages now have one truly shared metric (Pending
OT) but expressed in the unit each page cares about:

- **Home (operational):** On the clock · Coming up today · Hours this week
  · **Pending OT** *(in hours, e.g. `5.5h` — "how much OT do I owe this
  week?")*
- **Staff (roster):** Active staff · **Needs OT approval** *(head count —
  "how many people need my approval?")* · Avg hours / staff · Recent hires

**Server (`GET /api/admin/dashboard`).** Added an 8th query reading
`overtime_threshold_hours` from `app_settings` (defaults to 40 if missing
or unparseable). The existing `staffHours` query also picks up
`BOOL_AND(te.ot_approved) AS all_approved`. JS then iterates staffHours
and, for each row where `hours > threshold && all_approved !== true`,
pushes to `staffWithPendingOT` (with `pending_ot_hours = hours - threshold`)
and adds the pending hours to `weekOTTotal`. Both new fields ship in the
response. `BOOL_AND` over an empty set is null, which is why the check is
`!== true` rather than `=== false` — staff with no entries still surface
correctly if their hours straddle the threshold via cross-week shifts.

**Avg hours bug fix.** Denominator is now the count of staff who actually
worked any hours this week (`hours_this_week > 0`), not all active staff.
Why: on a week where half the team was off, the old metric reported
half-strength averages even though the people who *did* work logged
normal hours. The number was technically correct but operationally
misleading — managers care about utilization of the people scheduled to
work, not utilization across everyone on payroll. Same logic should apply
to any future "per-X" metric where X excludes zero-cases.

**Files modified:**
- `server/server.js` — added `otThreshold` to the labels array (8th
  Promise.allSettled slot); `staffHours` query gains
  `BOOL_AND(te.ot_approved) AS all_approved`; new query reads
  `app_settings.overtime_threshold_hours`; JS pass builds
  `staffWithPendingOT` array and `weekOTTotal` number; both added to
  response payload.
- `src/pages/AdminHome/index.js` — `VIEWS` array swaps `'approvals'` →
  `'pending-ot'`; stat card 4 swaps eyebrow/value/meta to read pending
  OT in **hours** with `tone: 'action'` when nonzero; renderDetail
  branch lists `staffWithPendingOT` rows showing logged hours + pending
  OT, click navigates to `/admin/staff/:userId`. Standalone bottom
  approvals card removed (was already gone in this build).
- `src/components/AdminPanel/StaffManager.js` — `stats` useMemo splits
  `activeOnly` into `working = activeOnly.filter(hours > 0)` and uses
  `working.length` as the avg-hours denominator; new `needsOT` count of
  active staff with `pending_ot_hours > 0`; banner swaps "On the clock"
  for "Needs OT approval" (warn-tone when > 0, clickable when > 0);
  `filtered` useMemo replaces the `'on-clock'` branch with `'needs-ot'`
  (filters to `pending_ot_hours > 0`). Avg-hours subtitle reworded to
  "this week, working staff" to make the denominator explicit.

**Conventions added:**
- **Same metric, different unit.** When the same underlying data
  belongs on two pages, vary the unit so each page expresses the
  question its lens is asking. Pending OT lives on Home as a
  **time** ("how much do I owe?") and on Staff as a **count** ("how
  many people?"). The two cards stay in sync because they read the
  same server fields, but a reader skimming the two pages doesn't
  feel they're seeing the same number twice.
- **"Per-staff" averages exclude zero-cases.** Any avg/count/ratio
  whose denominator is "active staff" should ask first whether
  zero-case staff *belong* in the denominator. For utilization-style
  metrics they don't — the person who didn't work is not "below
  average," they're outside the population. Use the working subset
  as denominator; surface that fact in the meta line so it's
  auditable.
- **`BOOL_AND` for "all approved" rollups.** When you need "is every
  matching row in state X?", `BOOL_AND` over the boolean column is
  cheaper than counting separately. Watch for the empty-set case —
  `BOOL_AND` returns null, so always compare `!== true` (not
  `=== false`) when "no entries at all" should fall through to the
  not-yet-approved branch.

### 2026-05-02 — Sprint 6.5: QoL polish (closes Sprint 6)

Two cleanups before calling Sprint 6 done.

**6.5A — Export popover responsive on mobile.** The popover was a fixed
≥280px wide regardless of viewport. Switched the menu to
`width: max-content; min-width: 260px; max-width: calc(100vw - 32px);
box-sizing: border-box;` so it fits content without overflowing the
screen. Period control now `flex-wrap`s its buttons (4 in a row on
desktop, 2×2 on tight phones). Added a tighter mobile breakpoint at
720px (smaller padding, tighter type) and a phone breakpoint at 420px
that flips the anchor edge from `right: 0` to `left: 0` so the popover
doesn't spill off-screen when the trigger is deep on the right.

**6.5B — StaffManager stats: replace duplicates.** AdminHome already
shows "Hours this week" and "Pending OT"-adjacent metrics (it owns the
operational lens — what's happening *now*). StaffManager owning the
same numbers was redundant. New StaffManager stats focus on the
**roster lens** (who is *here*):
- Removed: Hours this week, Pending OT.
- Added: **Avg hours / staff** (totalHrs ÷ active count, "this week,
  active staff" subtitle). Informational, not clickable. Workforce
  utilization signal — if this drops, the team is under-scheduled.
- Added: **Recent hires** (count of active staff whose `hire_date`
  is within the last 30 days). Action-tone when > 0; clickable to
  filter the list to those new staff. Goes informational ("no one
  new") when zero.
- Existing list filter now supports `statFilter === 'recent-hires'` —
  same 30-day cutoff so the count and the filtered rows agree.

**Files modified:**
- `src/components/AdminPanel/AdminPanel.css` — rewrote
  `.staff-mgr-export-menu` width strategy, `.staff-mgr-export-period`
  flex-wrap, two responsive breakpoints (720px tighten, 420px anchor
  flip).
- `src/components/AdminPanel/StaffManager.js` — `stats` useMemo now
  also returns `avgHours` and `recentHires`; banner card array
  swapped two entries; `filtered` useMemo gained the `recent-hires`
  filter branch.

**Conventions added:**
- **Operational vs roster lens.** When two pages have stats banners,
  give them different lenses so they read as complementary rather
  than redundant. AdminHome = operational ("what's happening now —
  on the clock, coming up, hours, approvals"). StaffManager = roster
  ("who's here — total active, on the clock, avg utilization, growth").
  The "On the clock" overlap is fine because both lenses care about
  it; the *other* numbers should differ.
- **Popover sizing.** Use `width: max-content` + `max-width: calc(100vw
  - 32px)` so popovers grow to fit content but never overflow. Pair
  with `box-sizing: border-box` so padding is included in the cap.
  Don't hard-code widths.

### 2026-04-30 — Sprint 6.4: bulk CSV export + Add Staff repositioned

**Two changes on the staff list page:**

1. **Bulk CSV export** with the "↓ Export ▾" pattern from Timesheet,
   adapted for admin scopes.
2. **Tweak per user feedback:** the "Add new staff member" tile moves
   from the bottom of the list up to *between* the filter row and the
   list rows, so newly added staff appear right under it.

**Server (`GET /api/admin/entries?from=&to=&user_ids=&dept_id=`):**
- Returns time_entries in `[from, to]` (inclusive both ends) joined
  with `users.name` and `departments.name`.
- Optional filters: `user_ids` (comma-separated UUIDs) or `dept_id`
  (single department). Practically mutually exclusive — the client
  picks one based on selected scope.
- `requireAuth + requireRole('admin')`.

**Client (StaffManager export popover):**
- New "↓ Export ▾" button at the end of the filter row, primary tone
  (matches `.btn-add` color so it reads as the row's primary action).
- Click opens a 280px-wide popover with two sections:
  - **Period** segmented control: Today / Week / Month / Year. Today
    is `from === to`; Week is current Mon→Sun; Month is calendar 1st
    → last day; Year is Jan 1 → Dec 31.
  - **Scope** radio: All staff (count of active), Department: <name>
    (only enabled when a dept chip is active), Filtered list (count
    of currently-visible rows; uses `user_ids` from filter result).
- Click-outside dismisses. CSV columns: Name, Department, Date, Day,
  Clock In, Clock Out, Hours, Manual, OT Approved. Filename includes
  scope + period + start date for traceability:
  `staff-all-staff-week-2026-04-27.csv`,
  `staff-dept-front-desk-month-2026-04-01.csv`,
  `staff-filtered-12-year-2026-01-01.csv`, etc.

**Add Staff tile relocated:**
- Was: bottom of the page after the list.
- Now: directly under the filter row, above the list. The dashed-border
  visual stays the same; only its position changed.
- When form expands inline, it stays at the top so admin doesn't lose
  scroll context after submit. Reload places the new staff in
  alphabetical order in the list below — natural reading order.

**Files modified:**
- `server/server.js` — new `/api/admin/entries` endpoint.
- `src/components/AdminPanel/StaffManager.js` — added `apiFetch` import,
  CSV state (csvOpen / csvBusy / csvPeriod / csvScope), click-outside
  ref, `runExport` builder + downloader, `periodRange` helper.
  Repositioned the entire `.staff-mgr-add` block from below the list
  to between the filter row and the list.
- `src/components/AdminPanel/AdminPanel.css` — appended
  `.staff-mgr-export*` rules (button, caret, menu, period control,
  scope radios, CTA, mobile reposition for the popover).

**Conventions reinforced:**
- **Two-axis export popover.** When export has independent dimensions
  (period × scope, range × filter), present both as side-by-side
  controls in a single popover instead of a long combinatorial menu.
  4 × 3 = 12 items as buttons would have been overwhelming.
- **Disabled scope hint.** When the "department" scope is unavailable
  (no dept chip selected), keep the radio visible but greyed out and
  add a helper "pick a chip first" — better than hiding it (less
  confusing as the menu doesn't reflow).

### 2026-04-30 — Sprint 6.3: StaffManager rebuild — list-as-dashboard

**What:** The Staff list page (`/admin/staff`) used to be a basic CRUD
shell with an "+ Add" header button and a department-grouped accordion.
Replaced with a dashboard-style layout that mirrors AdminHome's stat-card
grammar.

**Server (`GET /api/admin/employees`):**
- Per-row enrichment via a CTE on `time_entries` (current Mon
  date_trunc): `hours_this_week`, `is_on_clock` (any open entry this
  week), `pending_ot_hours` (week_hours − threshold when weekly is over
  the configured threshold AND any entry is unapproved).
- Reads `overtime_threshold_hours` from `app_settings` so this stays in
  lockstep with the performance dashboard's definition. Falls back to
  40 if missing.
- Same response shape as before plus three new fields. Existing callers
  (StaffManager from earlier sprints, AdminHome flows) ignore them
  harmlessly.

**Client (`src/components/AdminPanel/StaffManager.js`):** full rewrite.

- **Header**: simple back-to-Home button + "Staff" title (the old
  prominent "+ Add" button is gone — adding moved to the bottom).
- **Stats banner** — 4 clickable cards driving the list filter:
  - **Active staff** (resets filter)
  - **On the clock** (filters to staff with an open entry; live-tone
    meta + pulse dot inside the row pill below)
  - **Hours this week** (informational, not clickable)
  - **Pending OT** (filters to staff with `pending_ot_hours > 0`;
    warn-tone meta and disabled when zero)
  - Selected card: blue ring + downward arrow → identical grammar to
    AdminHome.
- **Filter row** — search input (instant client-side, ~200-staff scale
  fine), department chips (All / each dept / Unassigned), inactive
  toggle (default off).
- **Rich rows**:
  - Avatar (first initial), name + role · department · hire date
  - This-week hours number + horizontal mini-bar scaled to the visible
    list's max
  - Status pills: "On the clock" (live pulse), "Xh OT pending" (warn),
    "Inactive" (muted)
  - Click anywhere → `/admin/staff/:userId` performance page
  - Mobile: pills wrap below name; hours bar hidden (rows stay tight)
- **Add staff = bottom tile**, dashed-border, opens the existing form
  inline. After save, full reload so the new row picks up its
  enrichment fields.

**Files modified:**
- `server/server.js` — `/api/admin/employees` query rewritten.
- `src/components/AdminPanel/StaffManager.js` — full rewrite.
- `src/components/AdminPanel/AdminPanel.css` — appended `.staff-mgr-*`
  rules (~250 lines): stats card, search/chips, list rows, add tile.

**Conventions reinforced:**
- **List-as-dashboard.** When a list page also surfaces aggregate
  metrics, the stats banner doubles as the filter — selecting a stat
  scopes the list. Same grammar as AdminHome (blue ring, downward
  arrow). Don't have two competing primary actions on the same screen.
- **De-emphasize occasional actions.** "+ Add" was the most prominent
  button on the page even though it's a once-a-week action vs.
  "click an existing staff" which happens hundreds of times. The bottom
  dashed tile is visible without dominating.
- **Server pre-computes enrichment on list endpoints.** Avoid asking
  the client to reduce N entries × M queries. One CTE reads time_entries
  once and emits the per-user numbers.

**Sprint 6.4 backlog (next planned slot):** Bulk CSV export on the staff
list — `↓ Export ▾` button next to the search input, menu of week /
month / year × all-staff / department / single staff. Same CSV shape
as the Timesheet page.

### 2026-04-29 — Sprint 6.2: OT approval

**What:** Admin can sign off on overtime hours per staff. Performance card
splits OT total into approved + pending; one click bulk-approves the
displayed period.

**DB — Migration 007 (`007_ot_approved.sql`):**
- `ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS ot_approved BOOLEAN NOT NULL DEFAULT FALSE`.
- Mirrored in `schema.sql`.
- Run on production: `psql "$DATABASE_URL?sslmode=require" -f database/migrations/007_ot_approved.sql`.

**Server:**
- Extracted `periodRange(period)` helper near the perf endpoint — both
  the perf computation and the new OT approve endpoint use it so they
  agree on what "this week / month / year" means.
- `GET /api/admin/staff/:userId/performance` — entries query now selects
  `ot_approved`. Per-week OT is split into `hoursOvertimeApproved`
  (every entry in that week is `ot_approved`) and `hoursOvertimePending`
  (otherwise). Both fields shipped on the response in addition to the
  existing `hoursOvertime`.
- `POST /api/admin/staff/:userId/approve-ot?period=week|month|year` —
  bulk update `ot_approved = true` on unapproved entries in range,
  audit_logs row with the entry IDs + admin username + count.

**Client (StaffDetail performance dashboard):**
- OT card num turns warn-orange only when `hoursOvertimePending > 0`
  (was: any OT). When OT exists, a small "Xh pending · Yh approved" row
  appears under the threshold meta.
- "Approve OT" button shows when pending > 0. Click → POST the bulk
  endpoint → success toast inside the card → reload perf data so the
  approved/pending split refreshes.
- Refactored the perf fetch into a `reloadPerf` `useCallback` so both
  the period-change effect and the post-approve refresh share one path.

**Conventions added:**
- **Weekly OT bucket = atomic approval unit.** A week's OT is
  "approved" only when *every* entry in that week is approved. Mixed
  status → pending. Keeps the rule simple and matches how labor laws
  treat the week as the OT calculation period.
- **Period helper colocated with consumers.** When two routes need to
  agree on a date range, a tiny `function periodRange(period)` near
  them beats duplicating the if/else chain. Don't lift to a separate
  file unless a third caller appears.

### 2026-04-29 — Sprint 6 hotfix: API URL collateral damage from rename

**Bug:** Clicking a staff row threw
`Uncaught (in promise) SyntaxError: Unexpected token '<', "<!doctype "...
is not valid JSON` and showed "Staff not found".

**Cause:** During Sprint 6A I ran `replace_all` on
`/admin/employees` → `/admin/staff` inside `StaffDetail.js`. That
correctly updated the page-route nav targets but **also rewrote every
API URL** in the file. The server still exposes the data layer at
`/api/admin/employees/...` (unchanged on purpose), so the client started
calling endpoints that don't exist. Express's SPA catch-all served
`index.html`, which `res.json()` tried to parse and choked on the
leading `<!doctype`.

**Fix:** reverted the API URLs in `StaffDetail.js` to `/api/admin/employees/...`
(`reloadEmployee`, `reloadEntries`, profile PUT, status PATCH, DELETE,
PIN PATCH, PIN reset). Kept the new
`/api/admin/staff/:userId/performance` endpoint (Sprint 6 addition,
intentionally on the new namespace) and the browser routes (`/admin/staff[/...]`).

**Convention added:**
- **Page routes ≠ API routes.** When you rename a UI route, don't blanket
  `replace_all` on the path string. The same path lives in three
  places — page nav, API URLs, and sometimes documentation — and the
  rename should only apply to the page. Use targeted edits or grep with
  context first.
- **Defense in depth.** All `res.json()` calls should be tolerant of
  non-JSON responses. `apiFetch` already swallows them silently; raw
  `fetch().then(r => r.json())` does not. Sprint 6.x cleanup: route
  every admin fetch through `apiFetch` so a stray HTML body never
  throws an unhandled SyntaxError again.

### 2026-04-29 — Sprint 6 hotfix: production build cleanup

**Bug:** Koyeb Docker build failed at `npm run build`. Two errors:
1. `App.js:9-27 — Import in body of module; reorder to top  import/first`.
   The `NavStaff` redirect helper had been placed *between* the
   imports in App.js. Local `npm start` (no `CI=true`) only flags this
   as a warning; Koyeb's Dockerfile sets `CI=true`, which makes any
   ESLint warning fail the build.
2. `MonthView.js:4 — 'MONTH_NAMES' is assigned a value but never used`.
   Long-standing unused constant; same `CI=true` mechanism turned it
   from warning to error.

**Fix:**
- App.js: moved `NavStaff` declaration **after** all imports.
- MonthView.js: deleted the unused `MONTH_NAMES` constant.

**Convention added:**
- **Local + production builds.** `npm start` lets warnings through;
  Koyeb's `CI=true` does not. Anything ESLint reports — unused vars,
  out-of-order imports, react-hooks/exhaustive-deps — is a build error
  in production. Run `CI=true npm run build` before relying on a green
  local dev server. Any helper component, utility, or hook that
  follows the imports must come *after* every `import` line.

### 2026-04-29 — Sprint 6: staff performance dashboard

Major rework. Employees → Staff everywhere. New per-staff performance
page with configurable thresholds and an 8-week trend chart.

**Sprint 6A — Rename Employees → Staff**
- Sidebar label, route (`/admin/staff` from `/admin/employees`),
  component file rename (EmployeeManager.js → StaffManager.js,
  EmployeeDetail.js → StaffDetail.js), all internal nav refs.
  `/admin/employees` and `/admin/employees/:userId` redirect to
  `/admin/staff[/:userId]` for back-compat. `App.js` exports a tiny
  `NavStaff` helper that re-injects `:userId` into the redirect target
  via `useParams` (note for next time: this pattern works for any
  param-preserving redirect).
- DB stays on `users` — the data layer doesn't change.
- API endpoints `/api/admin/employees*` are unchanged for now (they're
  the data resource, not the page route). Sprint 6.x can rename if the
  cosmetic break is worth it.

**Sprint 6B — Configurable performance thresholds**
- Migration `006_perf_config.sql` inserts three default rows into
  `app_settings`: `overtime_threshold_hours` (40), `on_time_tolerance_minutes`
  (10), `compare_baseline` ('self').
- `PUT /api/admin/settings` is now generic — accepts `{ key1: v1, key2: v2 }`
  pairs and validates each against an `ALLOWED` map. Single-key updates
  still work.
- AdminSettings.js gained a "Performance Thresholds" section: number
  inputs for OT hours and on-time minutes, radio for the compare
  baseline. Save batches all four settings (visibility + the three new
  ones) in one PUT.

**Sprint 6C — Performance endpoint**
- `GET /api/admin/staff/:userId/performance?period=week|month|year`
  (auth: admin). Returns user, current config, current period range,
  hoursWorked, hoursOvertime (weekly-bucketed against the threshold),
  shiftsScheduled / shiftsWorked / shiftsMissed / shiftsOnTime /
  shiftsLate, onTimeRate, comparison (self vs previous period for now),
  trend (last 8 weeks of weekly hours), recentShifts (last 10).
- Uses `Promise.allSettled` over 4 queries; user-not-found fails the
  whole request, others degrade to safe defaults.
- Schedule-vs-entry pairing: a schedule matches an entry if the entry's
  clock-in is within ±4h of the scheduled start; on-time if the lag
  ≤ tolerance.

**Sprint 6D — StaffDetail performance dashboard UI**
- New `<section className="staff-perf">` lives between the profile
  block and the existing edit/PIN/time-entries sections.
- **Period selector**: pill tabs (Week / Month / Year), pill-shaped
  segmented control with subtle background.
- **4 stat cards**: Hours worked (with delta vs comparison.previousValue),
  On-time rate (% + "X of Y on time"), Overtime (warn-orange when > 0),
  Shifts (count + "X missed · Y late").
- **8-week trend bar chart**: animated grow-on-mount, weeks with hours
  past the threshold use a warn-toned gradient (orange → red) instead
  of the normal accent gradient — visual cue for chronic overtime.
- All existing sections (edit, PIN management, Time Entries override,
  deactivate/delete) stay below. Sprint 6.x may consolidate them into
  the action panel I sketched in the kickoff message.

**Files added:**
- `database/migrations/006_perf_config.sql`
- `src/components/AdminPanel/StaffManager.js` (replacing EmployeeManager.js)
- `src/components/AdminPanel/StaffDetail.js` (replacing EmployeeDetail.js)

**Files modified:**
- `server/server.js` — generic settings PUT + performance endpoint.
- `src/components/Layout/Sidebar.js` — Employees → Staff in ADMIN_NAV.
- `src/App.js` — staff routes + `/admin/employees*` redirects.
- `src/pages/AdminHome/index.js` — nav targets updated to `/admin/staff/:id`.
- `src/components/AdminPanel/AdminSettings.js` — Performance Thresholds section.
- `src/components/AdminPanel/AdminPanel.css` — `.staff-perf*` rules,
  `.settings-perf-*` rules.

**Files deleted:**
- `src/components/AdminPanel/EmployeeManager.js`
- `src/components/AdminPanel/EmployeeDetail.js`

**Conventions added:**
- **Generic settings PUT.** When a settings table holds many keys, the
  endpoint should accept `{ key: value }` pairs and validate via an
  ALLOWED map. Avoids one route per setting.
- **Self-comparison default.** Performance dashboards comparing
  "yourself this period" against "yourself last period" gives the most
  actionable signal without needing department/all-staff baselines.
  The latter are slated as Sprint 6.x add-ons.
- **Param-preserving redirect.** When renaming a `:param` route, write
  a tiny inline component that calls `useParams()` and `<Navigate>` to
  the new path with the param re-inserted.

**Sprint 6.1 backlog:** Manual clock-in (admin: insert + reason; staff:
upload as approval_request) — including the staff-side UI for "I forgot
to clock in" requests.

**Sprint 6.2 backlog:** OT approval. Migration 007 adds
`time_entries.ot_approved BOOLEAN DEFAULT FALSE`. Performance card gains
a "Pending OT" subtotal + approve action.

**Sprint 6.3 backlog:** Bulk CSV export on the StaffManager list — same
Timesheet-style menu (week / month / year) plus scope (this staff /
department / all staff).

**To run before testing:**
- `psql "$DATABASE_URL?sslmode=require" -f database/migrations/006_perf_config.sql`
- Redeploy server (the new `/api/admin/staff/:userId/performance` route
  must be live for the dashboard to populate).

### 2026-04-29 — Sprint 5.3: blue-only selection + per-employee hours

**Two visual + functional fixes on AdminHome:**

1. **Tone-colored borders gone.** "On the clock" was always green-bordered
   (`is-live`) regardless of selection state, and the selected variants
   for live/warn/action overrode the blue ring. Result: inconsistent
   highlight grammar. Fix:
   - Removed `is-live` and `is-action` border-color rules entirely.
   - Removed the three `is-selected.is-{live,warn,action}` overrides.
   - Removed the matching `.adm-stat-arrow` tone overrides.
   - Selection ring is **always** `var(--accent-alt)` blue. Tone now
     only drives the meta text color (e.g. "Coming up today" still goes
     warn-orange when there are late staff).
2. **Hours this week is clickable.** Server's `/api/admin/dashboard`
   returns a 7th query result `staffHoursThisWeek`: per-employee totals
   for the current week, sorted desc. Client's stats card flipped to
   `clickable: true`; new `'hours'` view on the detail card shows a
   horizontal bar per employee (linear-gradient accent → accent-alt),
   click row → employee detail.

**Files modified:**
- `server/server.js` — added `staffHours` query (inner-join → only
  employees with > 0 hours this week) to the dashboard `Promise.allSettled`
  list. Response gained `staffHoursThisWeek`.
- `src/pages/AdminHome/AdminHome.css` — pruned tone borders, added
  `.adm-hours-list` + `.adm-hours-row` + `.adm-hours-bar` rules.
- `src/pages/AdminHome/index.js` — Hours card now clickable, new
  `view === 'hours'` branch in `renderDetail`, `VIEWS` array updated.

**Conventions reinforced:**
- **Single highlight grammar.** When a list of cards is acting as a
  picker, the selection state should look identical regardless of the
  card's underlying tone. Mixing tone+selection colors confuses which
  one is "active". Tone goes on text + small icons; the ring is reserved
  for selection.

### 2026-04-29 — Sprint 5.2: dashboard rework + admin auth cleanup

**Sprint 5.2A — Admin auth single-sourced:**
- Removed the legacy `POST /api/admin/login` route + ADMIN_USERNAME /
  ADMIN_PASSWORD env-var fallback. **`server/config/admins.json` is the
  only source of admin credentials.**
- admins.json supports multiple admins out of the box. Updated the
  comment block to spell that out and added an `_example_entries` block
  showing the schema (`{ username, password, name }`) so future-you
  doesn't have to read the loader to figure out the shape.

**Sprint 5.2B — Stats banner is now a click-through:**
- Dropped "Active staff" (≥50 employees → not actionable).
- New stat: **Coming up today** = today's schedule rows where status is
  `late` or `yet-to-start` (people scheduled today who haven't started).
  The meta line shows how many are running late.
- Reordered stats: **On the clock** is first; then Coming up today,
  Hours this week, Pending approvals.
- 3 of 4 stat cards are clickable (`is-clickable`). The selected card
  gets a colored ring, a downward triangle pointing to the detail card,
  and tone-aware highlight (success / warn / accent depending on the
  metric).
- Removed the standalone "Today's schedule" card and the bottom-of-page
  pending-approvals card. Their content now lives inside a single
  detail card whose contents swap based on the selected stat:
  - **on-clock** → "On the floor", currently working list (dept-grouped).
  - **coming-up** → "Coming up today", late + yet-to-start with status pills.
  - **approvals** → "Pending approvals", request queue.
- Detail card uses `key={view}` so React remounts on swap → the existing
  fade-in keyframe re-fires for a clean transition.

**Files modified:**
- `server/server.js` — legacy login route gone.
- `server/config/admins.json` — clearer multi-admin schema.
- `src/pages/AdminHome/index.js` — full rewrite around the click-through pattern.
- `src/pages/AdminHome/AdminHome.css` — `<button>` reset on stat cards,
  `is-clickable` / `is-selected` / `.adm-stat-arrow` styles, detail-card
  fade-in keyframe.

**Conventions added:**
- **Stats banner as nav.** When a dashboard has multiple "what's
  happening" lists, group them under one detail panel and use the stats
  banner cards as the picker. Saves vertical space, keeps the dashboard
  one screen, makes the count → list relationship explicit.
- **Card-as-button pattern.** When a card is clickable, render it as a
  `<button>` (with `appearance: none`, `text-align: left`) rather than
  a `<div onClick>`. Free keyboard support, focus ring, semantics.

### 2026-04-29 — Sprint 5.1.3: production schema backfill

**Diagnosis (from Koyeb logs):**
```
error: relation "approval_requests" does not exist
  code: '42P01'
  at async Promise.all (index 4)
```
Production DB never had `approval_requests`. Schema.sql defines it, but
the table was missing on the Koyeb deployment — likely an older partial
install. `audit_logs` (used by the hour-override endpoint) was probably
skipped at the same time.

**Fix — `database/migrations/005_backfill_approval_audit.sql`:**
- `CREATE TABLE IF NOT EXISTS approval_requests` (with `idx_approval_requests_status`).
- `CREATE TABLE IF NOT EXISTS audit_logs` (with both indexes).
- `entry_status` enum guarded by a `DO $$ … EXCEPTION WHEN duplicate_object` block (Postgres has no `CREATE TYPE IF NOT EXISTS`).
- All idempotent — running on a clean install does nothing harmful.

**To apply:** `psql "$DATABASE_URL?sslmode=require" -f database/migrations/005_backfill_approval_audit.sql`

**Conventions added:**
- **Schema convergence migrations.** When production drifts from
  `schema.sql`, ship a numbered migration that creates only the missing
  pieces with `IF NOT EXISTS` guards. Don't try to re-run schema.sql
  against a populated DB.
- **Use `DO $$ … EXCEPTION` for `CREATE TYPE`.** Postgres doesn't
  support `CREATE TYPE IF NOT EXISTS`. The block-level exception handler
  catches `duplicate_object` and continues.

### 2026-04-29 — Sprint 5.1.2: resilient dashboard + per-query error surfacing

**Bug:** `/api/admin/dashboard` returned 500 in production. The handler ran
6 queries via `Promise.all`, so any single query throwing collapsed the
whole response with no detail beyond "Server error" — couldn't tell which
of the 6 was failing.

**Fix:**
- Switched to `Promise.allSettled` so per-query failures don't 500 the
  whole endpoint. Queries are labeled (`activeStaff`, `currentlyWorking`,
  `todaySchedule`, `todayEntries`, `pendingApprovals`, `weekHours`).
- Failed queries are logged server-side (`[dashboard] LABEL failed: ERROR`)
  AND included in the response as `errors: ["LABEL: message", …]`.
- Successful queries still populate their cards. Failed ones fall back
  to safe defaults (empty list, 0).
- AdminHome's banner now has a third state (`isWarn`) that shows the
  per-query error list as an info-tone notice without hiding the working
  cards. Server errors still get the red error banner; auth errors still
  get the "Sign in" banner.

**Conventions added:**
- **Aggregator endpoints should be partial-failure tolerant.** Use
  `Promise.allSettled`, label each branch, surface failures in the
  response so the UI can show *what* broke without losing access to the
  rest of the data. A silent 500 is the worst outcome for a debug pass.

### 2026-04-29 — Sprint 5.1.1: 401 auto-recovery + apiFetch diagnostics

**Bug:** AdminHome was getting `401 {"message": "Missing token"}` from
`/api/admin/dashboard`, leaving the user on a useless dashboard with no
escape hatch. The Retry button just re-sent the same broken request.

**Fix — three layers:**
- **`apiFetch` instruments token usage in dev.** Logs
  `[apiFetch] METHOD /path token: <prefix>… | NONE` to the console for
  every call. Makes "is the token actually being sent?" a one-glance
  question.
- **`apiFetch` recovers from 401.** Any 401 response triggers
  `localStorage.removeItem('hotelops-token')` and dispatches a
  `window` `'auth:expired'` event. Stale/invalid tokens stop sticking
  around to fail subsequent calls.
- **`AuthProvider` listens for `'auth:expired'`** and clears `user`.
  RequireRole bounces the next render to `/login/staff` or
  `/login/admin` automatically.
- **`AdminHome` distinguishes auth errors from server errors.** Auth
  errors get a "Your session expired — Sign in" banner that walks the
  user through `logout()` + `nav('/login/admin')` instead of pointlessly
  retrying the same call. Other errors keep the standard Retry button.

**Conventions added:**
- **401 means session over.** Treat any 401 as terminal: clear the
  token, mark the user signed-out, and redirect. Don't quietly retry
  with a token the server has already rejected.
- **Auth state changes use a window event when the trigger isn't
  React-lifecycle.** Background fetches discovering a 401 can't easily
  call `setUser`, but they can dispatch `'auth:expired'`. AuthProvider
  subscribes once at mount and reacts cleanly.

### 2026-04-29 — Sprint 5.1.1: dev proxy fix

**Bug:** `npm start` (CRA dev server, port 3000) had no proxy to the
Express API on port 3001. All `/api/*` requests 404'd — login was
completely broken in development. The legacy `services/timeClock.js`
hit `/api` which got intercepted by CRA's dev server, returning the
React app HTML or 404.

**Fix:** added `"proxy": "http://localhost:3001"` to the frontend
`package.json`. CRA automatically forwards unknown paths (anything not
matching a static asset) to the proxy target during dev. Production
behavior is unchanged because the Express server serves the React build
on the same origin.

**Note for future iterations:** CRA reads the `proxy` field once at
dev-server startup. If you change it (or the backend port), you must
restart `npm start`. In production, it's not used — `server.js` serves
the static build via `express.static(buildPath)` plus the SPA `*`
fallback, so `/api/*` and `/*` share an origin.

### 2026-04-29 — Sprint 5.1: dashboard error surfacing

**Bug:** AdminHome silently swallowed fetch failures (auth errors, server
errors, partial data) and rendered as if nothing was wrong — empty cards
plus zeros across the stats banner. The user reported "dashboard not
displaying anything even when staff are working" with no diagnostic info
to point at the cause.

**Files modified:**
- `src/pages/AdminHome/index.js` — added `error` and `lastUpdated` state.
  `refresh` now distinguishes success vs failure and stores either the
  data or the error message. UI changes:
  - **Greeting row** has a "Updated 12s ago" indicator + manual refresh
    button (↻). Tick state re-renders the relative time every 10s
    without re-fetching.
  - **Error banner** appears above the stats banner when a request fails
    — shows the server's error message, HTTP status, and a Retry button.
  - **Empty states gained sub-text** ("Open clock-ins appear here.",
    "Add a shift in Scheduling to see it here.") so the user knows
    *what* would populate the card.
  - Fixed wrong `<ul>`-per-row structure in today's schedule list — now
    one `<ul>` with N `<li>`s as expected.
- `src/pages/AdminHome/AdminHome.css` — appended `.adm-greeting-row`,
  `.adm-greeting-actions`, `.adm-updated`, `.adm-refresh-btn`,
  `.adm-error-banner` (+ icon/title/detail/retry), `.adm-empty-sub`.
- `server/server.js` — `/api/admin/dashboard` currently-working query now
  filters `u.active = true`. Defensive against a stale open entry on a
  deactivated user.

**Conventions added:**
- **Surface fetch errors visibly on data-driven dashboards.** Silently
  empty UI hides auth and server failures, exactly the bugs you want to
  see fast. Pattern: `error` state + banner with Retry, `lastUpdated`
  indicator with relative-time tick, plus a manual refresh button.

**Sprint 5.x backlog (open — debug + extras):**
- User-driven bug fixes after this sprint settles.
- Approval-request review screen (clicking pending approvals on
  AdminHome should go somewhere actionable).
- Force clock-out from "On the floor" card.
- Per-employee weekly-hours summary on EmployeeDetail.
- Delete `src/components/AdminPanel/index.js` once confirmed unreachable.

**Long-running backlog (post-4.x):**
- Protect remaining `/api/admin/*` endpoints with `requireRole('admin')`;
  migrate AdminPanel sub-components to `apiFetch`.
- Remove legacy phone-based clock-in routes (`/api/authenticate`,
  `/api/clock-in`, `/api/clock-out`, `/api/user/:phone/history`) and
  `src/services/timeClock.js` once no callers remain.
- Cleanup orphans: `src/components/TimeClock/{index.js, Keypad.js,
  EmployeePanel.js, DashboardFace.js}` are not rendered anywhere.
  ClockWidget stays.
- Polish: login flip animation; loading skeletons; tenant-name copy audit.
- Investigate dead code: `src/components/AdminDashboard/`,
  `src/components/Scheduling/`, `src/lib/supabase.js`.

**Sprint 4 backlog (post-debug):**
- **Timesheet page** at `/timesheet`: port the rich layout from the old
  Home draft — bar chart, week nav, scheduled-vs-worked progress bar,
  status pill, full recent shifts list. Add payroll-period totals, CSV
  export, and a daily breakdown sheet.
- Protect remaining `/api/admin/*` endpoints with `requireRole('admin')`;
  migrate AdminPanel sub-components to `apiFetch`.
- Remove legacy phone-based clock-in routes (`/api/authenticate`,
  `/api/clock-in`, `/api/clock-out`, `/api/user/:phone/history`) and
  `src/services/timeClock.js` once no callers remain.
- Cleanup orphans: `src/components/TimeClock/{index.js, Keypad.js,
  EmployeePanel.js, DashboardFace.js}` are not rendered anywhere.
  ClockWidget stays.
- Polish: login flip animation; loading skeletons; tenant-name copy audit.
- Investigate dead code: `src/components/AdminDashboard/`,
  `src/components/Scheduling/`, `src/lib/supabase.js`.

**Sprint 2 — completed (see iteration log).**
