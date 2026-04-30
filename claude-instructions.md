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
- `/admin` — `AdminHome` dashboard: greeting, stats banner (active staff / on the clock / hours this week / pending approvals), Currently Working card (dept-grouped, click to detail), Today's Schedule with status pills, Pending Approvals list.
- `/admin/employees` — `EmployeeManager` (list, grouped by dept; click row → detail).
- `/admin/employees/:userId` — `EmployeeDetail` (profile, PIN management, Time Entries with admin override modal, deactivate/delete).
- `/admin/scheduling` — `SchedulingManager` (week/month views).
- `/admin/shift-notes` — `AdminShiftNotes` placeholder.
- `/admin/reports` — `AdminReports` placeholder.
- `/admin/settings` — `AdminSettings` (visibility config + Sign Out card).

`/login/staff`, `/login/admin` — public entry points.

**Router**: `BrowserRouter`. **Multi-tenant strategy**: path prefix (`/<tenant>/...`). Param can be added later in a single config change.

### Sidebars (role-driven)

- **Staff**: Home → Timesheet → Calendar → Shift Notes → Settings.
- **Admin**: Home → Employees → Scheduling → Shift Notes → Reports → Settings.

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

`users` columns: `user_id` (UUID), `phone_number` (10-char unique), `name`,
`email`, `role` (ENUM `employee | front_desk | admin`), `department_id`,
`hire_date`, `base_hourly_rate`, `active`, `created_at`, `updated_at`.

After Sprint 1: `users` also has `pin_hash`, `pin_required`, `pin_must_set`.

## 6. API surface

### Auth (JWT, HS256, 8h expiry)

- `POST /api/auth/staff/login`           body: `{ phone, pin? }` → `{ token, user }`
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
- `GET  /api/admin/dashboard`                  auth (admin) — Sprint 5 — aggregated home data
- `PATCH /api/admin/time-entries/:id`          auth (admin) — Sprint 5 — hour override (writes audit_logs)
- `GET  /api/admin/departments`
- `GET  /api/admin/employees`                  (returns pin_required, pin_must_set, has_pin)
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
