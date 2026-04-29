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

### Routing

- `/` (Home) — staff dashboard: greeting + hours breakdown (Mon–Sun week).
- `/timeclock` — clock in/out (no more phone entry; uses logged-in user).
- `/calendar` — was `/shifts`; renamed UI label, route migrated.
- `/shift-notes` — placeholder.
- `/settings` — theme toggle, profile (read-only), Change PIN, Sign Out.
- `/admin/*` — existing AdminPanel internals, role-gated.
- `/login/staff`, `/login/admin` — entry points.
- **Forecasting is moving under Admin** (drops from staff sidebar).
- **Multi-tenant strategy**: path prefix (`/<tenant>/...`). Architect routes
  with this in mind; param can be added later in a single config change.
- **Router type**: `BrowserRouter` (migrating from `HashRouter`). Requires SPA
  404 fallback when deployed to a static host.

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
├── package.json                    ← frontend (CRA).
├── server/
│   ├── package.json                ← backend deps (express, pg, cors, dotenv).
│   ├── server.js                   ← all API routes (single file).
│   ├── auth.js                     ← (NEW Sprint 1) JWT + middleware.
│   ├── config/
│   │   └── admins.json             ← (NEW Sprint 1) admin credentials.
│   └── .env.example
├── database/
│   ├── schema.sql                  ← full canonical schema (PostgreSQL 16).
│   ├── teardown.sql                ← drops everything.
│   └── migrations/
│       ├── 002_schedule_custom_times.sql
│       ├── 003_app_settings.sql
│       └── 004_auth_columns.sql    ← (NEW Sprint 1) PIN columns on users.
├── src/
│   ├── index.js                    ← React entry. Renders <App />.
│   ├── App.js                      ← Router + theme management.
│   ├── App.css
│   ├── index.css                   ← global resets + body font.
│   ├── theme.css                   ← CSS custom properties (light + dark).
│   ├── fonts.css                   ← @font-face for Tiempos family.
│   ├── auth/                       ← (NEW Sprint 1) AuthProvider, RequireRole, useAuth.
│   ├── pages/
│   │   ├── Login/                  ← (NEW Sprint 1) staff + admin login pages.
│   │   ├── Home/                   ← (NEW Sprint 2) dashboard.
│   │   └── Settings/               ← (NEW Sprint 2) settings page.
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.js          ← desktop sidebar + mobile bottom nav.
│   │   │   └── Sidebar.css
│   │   ├── TimeClock/              ← clock in/out screen (will lose phone-entry step).
│   │   │   ├── index.js            ← container; flip card UI.
│   │   │   ├── ClockWidget.js, DashboardFace.js, EmployeePanel.js, Keypad.js
│   │   │   └── TimeClock.css       ← .tc-flip-container / .tc-flip-card primitive.
│   │   ├── ShiftsView/             ← will be relabelled "Calendar" in sidebar.
│   │   │   ├── index.js, ShiftsCalendar.js, ShiftsView.css
│   │   ├── ShiftNotes/index.js     ← placeholder.
│   │   ├── Forecasting/index.js    ← will move under AdminPanel.
│   │   ├── AdminPanel/
│   │   │   ├── index.js            ← top-level admin shell. Currently gates with internal AdminLogin (see "removing" below).
│   │   │   ├── AdminLogin.js       ← OLD admin login form. Will be replaced by /login/admin route + RequireRole.
│   │   │   ├── AdminHome.js        ← admin landing (module grid).
│   │   │   ├── AdminSettings.js    ← admin settings.
│   │   │   ├── EmployeeManager.js  ← employee list. Will gain PIN toggle + reset buttons (Sprint 2).
│   │   │   ├── EmployeeDetail.js
│   │   │   ├── AdminPanel.css
│   │   │   └── Scheduling/         ← admin scheduling (calendar views).
│   │   │       ├── index.js, AssignModal.js, MonthView.js, WeekView.js, Scheduling.css
│   │   ├── AdminDashboard/index.js ← appears unused; verify before touching.
│   │   ├── Scheduling/index.js     ← appears unused (separate from AdminPanel/Scheduling); verify.
│   │   └── shared/
│   │       ├── ComingSoon.js, ComingSoon.css
│   ├── services/
│   │   └── timeClock.js            ← fetch wrappers for /api/authenticate, /api/clock-in, /api/clock-out, /api/user/:phone/history.
│   └── lib/
│       └── supabase.js             ← appears unused (server uses pg); verify.
├── public/index.html
├── build/                          ← gitignored; CRA output.
├── tiempos-font-family/            ← font assets (also in src/fonts/).
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

**Existing** (in `server/server.js`):

- `GET  /api/health`
- `POST /api/admin/login` ← OLD plain login. Will be replaced by `/api/auth/admin/login`.
- `POST /api/authenticate` ← phone-only employee lookup (legacy clock-in flow).
- `POST /api/clock-in`, `POST /api/clock-out`
- `GET  /api/user/:phone/history`
- `GET  /api/admin/departments`
- `GET  /api/admin/employees`, `POST /api/admin/employees`, `PUT /api/admin/employees/:id`, `PATCH /api/admin/employees/:id/status`, `DELETE /api/admin/employees/:id`
- `GET  /api/admin/employees/:id/time-entries`
- `GET  /api/admin/shift-templates`
- `GET  /api/admin/schedule`, `POST /api/admin/schedule`, `PUT /api/admin/schedule/:id`, `DELETE /api/admin/schedule/:id`
- `GET  /api/shifts/daily`
- `GET  /api/admin/settings`, `PUT /api/admin/settings`

**Planned (Sprint 1)**:

- `POST /api/auth/staff/login`        body: `{ phone, pin? }` → `{ token, user }`
- `POST /api/auth/admin/login`        body: `{ username, password }` → `{ token, user }`
- `POST /api/auth/staff/set-pin`      body: `{ pin }` (auth required) → `{ ok }`
- `GET  /api/me`                      auth required → `{ user }`
- `POST /api/auth/logout`             auth required → `{ ok }` (stateless; client just discards token)

**Planned (Sprint 2)**:

- `POST /api/admin/employees/:id/pin/toggle` body: `{ pin_required }`
- `POST /api/admin/employees/:id/pin/reset`  → clears `pin_hash`, sets `pin_must_set = true`

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
- **`adminAuth` localStorage flag** (set by old AdminLogin) is going away.
  Replaced by `hotelops-token` (JWT) + `useAuth()`.
- **Theme key in localStorage**: `hotelops-theme` (`'light' | 'dark' | null`).
  `null` = follow OS.

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

**Sprint 2 backlog:**
- Migrate `HashRouter` → `BrowserRouter` + SPA 404 fallback.
- New Home (`/`) dashboard: greeting + hours breakdown.
- Rename Shifts → Calendar in sidebar; reshape sidebar to final order.
- Settings page: theme toggle, profile (read-only), Change PIN, Sign Out.
  Move sign-out out of sidebar footer.
- TimeClock: drop phone-keypad; clock-in becomes a single button using
  the authed user.
- AdminPanel: PIN toggle + reset buttons in EmployeeManager.
- Remove dead code: `AdminPanel/AdminLogin.js`, legacy `/api/admin/login`,
  `localStorage.adminAuth`.
