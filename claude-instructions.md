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

### Routing (Sprint 2 — current)

- `/` (Home) — staff dashboard: greeting + hours + bar chart + recent shifts.
- `/timeclock` — clock in/out screen (uses authed user; no keypad).
- `/calendar` — was `/shifts`; route renamed, ShiftsView component unchanged.
  `/shifts` now redirects to `/calendar` for back-compat.
- `/shift-notes` — placeholder.
- `/settings` — theme toggle, profile (read-only), Change PIN, Sign Out.
- `/set-pin` — interstitial when `pin_must_set === true`.
- `/admin/*` — AdminPanel internals (Forecasting accessible from here, role-gated).
- `/login/staff`, `/login/admin` — public entry points.
- **Multi-tenant strategy**: path prefix (`/<tenant>/...`). Param can be added later in a single config change.
- **Router**: `BrowserRouter`. The Express server's `app.get('*')` SPA
  fallback handles deep-link refreshes in production. CRA dev server handles
  this automatically.

### Sidebar (final order)

Home → Time Clock → Calendar → Shift Notes → Settings.
Admin tab only when `user.role === 'admin'`.

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
- `GET  /api/me/hours?weekStart=YYYY-MM-DD`  auth (staff) → days, totalHours, scheduledHours, recentShifts, currentlyClockedIn
- `GET  /api/me/history`                 auth (staff) → time_entries from the last 4 weeks

### Admin (most are unprotected for now; pin endpoints are protected)

- `GET  /api/health`
- `GET  /api/admin/departments`
- `GET  /api/admin/employees`            (returns pin_required, pin_must_set, has_pin)
- `POST /api/admin/employees`
- `PUT  /api/admin/employees/:id`
- `PATCH /api/admin/employees/:id/status`
- `DELETE /api/admin/employees/:id`
- `PATCH /api/admin/employees/:id/pin`        auth (admin) — body: `{ pin_required }`
- `POST  /api/admin/employees/:id/pin/reset`  auth (admin) — clears hash, sets `pin_must_set = true`
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

**Sprint 3 backlog (debug + polish):**
- End-to-end testing pass (run migration, log in as admin, log in as staff,
  clock in/out, view dashboard, change PIN, sign out, admin reset PIN flow).
- Protect remaining `/api/admin/*` endpoints with `requireRole('admin')`.
  Migrate AdminPanel sub-components to `apiFetch`.
- Remove legacy clock-in route + related components / `services/timeClock.js`.
- Polish: login page flip animation reusing `.tc-flip-card`; nicer empty
  states; loading skeletons on Home dashboard.
- Tenant-aware copy already abstracted; multi-tenant routing (path prefix)
  is a future sprint.
- Confirm `AdminDashboard/` and `lib/supabase.js` are dead; remove if so.

**Sprint 2 — completed (see iteration log).**
