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
