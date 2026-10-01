# Claude Instructions — HotelOps (Part 5: Sprint 19+)

> **Read this AND `part1.md` … `part4.md` (same folder) every iteration
> before you start work.** Part 4 covers Sprints 17.0–18.14. Part 5
> starts here with Sprint 19 and continues with new entries from 19.1
> onward. Also read `MEMORY.md` (auto-memory index).

---

## 1. Sprint 19 theme — bug fixes

Sprint 19 is a bug-fix sprint. Entries are newest-first below the
sub-sprint list.

| Sub-sprint | Focus                                                        | Status |
|------------|--------------------------------------------------------------|--------|
| 19.1       | Koyeb/Neon DB compute hours ballooned (~140 h / ~$30)       | Deployed — user monitoring DB graph |
| 19.2       | Staff detail UI: compact profile card + weekly time entries | Built; layout verified at 390 px + 1280 px (static render) |
| 19.3       | Delete time entry, entries above PIN, mobile/PC polish, **endpoint auth audit** | Built, not yet run against live DB; audit done |
| 19.4       | Fix auth gaps found in 19.3 audit (21 unprotected routes)    | Built + route-matrix tested locally (80/80); **deploy as one release, then click-through** |
| 19.5       | Scraper: rGuest login 401 "Invalid credentials" after password change | Diagnostics + trim shipped; **root cause = verify server env (see entry)** |

---

## 2. Sprint logs (19.1 → present)

### 2026-09-30 — Sprint 19.5: scraper login 401 after the rGuest password change

**Symptom.** Forecast scrape fails: `agilysys.login.http_error` →
`{"status":401,"code":1003,"message":"Invalid credentials"}` for user
`richie` on tenant 1566, even after the user updated `AGILYSYS_PASS` in
`server/.env`.

**What was checked (no login attempted — repeated bad logins can lock the
rGuest account).**
- Local `server/.env` parses cleanly through dotenv: `AGILYSYS_USER` =
  `richie` (the raw line has trailing spaces; dotenv trims them),
  `AGILYSYS_PASS` = 17 chars, **no `#`, `$`, quotes, spaces or backslashes**
  (a `#` in an unquoted value would have been silently truncated by
  dotenv — ruled out).
- `client.js` reads `process.env.AGILYSYS_USER/PASS` per client; no
  caching of old values.
- The failing log shows `"username":"richie"` with no stray whitespace.

**Most likely cause: the running server isn't using the local `.env`.**
The scrape that produced the log runs on Koyeb, which only sees the
Koyeb service's environment variables — `server/.env` is gitignored and
never deployed. Editing it locally changes nothing in production. (Env
var changes in Koyeb also need a redeploy/restart to take effect, and if
`AGILYSYS_PASS` is stored as a Koyeb *Secret*, the secret's value must be
updated, not just the variable.) Second possibility: the new password
itself isn't accepted/locked (login at stay.rguest.com in a browser with
the same password to confirm). Note: earlier in Sprint 19.4 testing, a
few of *my* local test runs attempted real logins with the local `.env`
creds and got the same 401 — i.e. the local password was already
rejected at that point, and those attempts added to the failed-login
count.

**Code changes (`server/agilysys/client.js`).**
1. Credentials are `.trim()`-ed (a trailing space/newline pasted into a
   Koyeb env var is invisible in the dashboard but yields 401).
2. `agilysys.login.start` now also logs `passwordLength` (never the
   password) and `trimmedWhitespace`. After redeploying, the next scrape
   log should show `passwordLength: 17` — if Koyeb shows a different
   number, the Koyeb variable is stale/wrong.
3. A 401 now throws an actionable message (shown on the Forecast page /
   `forecast_snapshot.error_message`) telling the operator to fix the
   server environment and not to hammer retry.

**User checklist.**
1. Koyeb → service → Environment variables → set `AGILYSYS_USER` and
   `AGILYSYS_PASS` (no quotes, no trailing space) → **redeploy**.
2. Make sure the same username/password signs in at stay.rguest.com.
3. Run the scraper **once**; open the log and confirm
   `passwordLength: 17`. If it still 401s with the right length, the
   credentials themselves are being rejected (lockout / wrong user /
   different tenant) — stop retrying and unlock via rGuest/Agilysys.

**Verified.** `node --check`; module loads and builds a client with
padded creds. Not verified against rGuest (deliberately).

**Files touched:** `server/agilysys/client.js`, `claude-instructions/part5.md`

---

### 2026-09-30 — Sprint 19.4: close the 21 unauthenticated routes + harden tokens

Executes the plan from the 19.3 audit. Server + client change together —
**deploy as ONE release** (new server + new frontend). Expected side
effect: until the new frontend is live, old cached pages calling
`/api/admin/*` without a token get 401.

**Server (`server/server.js`, `server/auth.js`)**
- **Admin-only (`requireAuth, requireRole('admin')`) added to:**
  `GET/POST /admin/employees`, `GET/PUT/DELETE /admin/employees/:id`,
  `PATCH /admin/employees/:id/status`, `GET /admin/employees/:id/time-entries`,
  `GET /admin/shift-templates`, `GET/POST /admin/schedule`,
  `PUT/DELETE /admin/schedule/:id`, `GET/PUT /admin/settings`.
- **Any logged-in user (`requireAuth`):** `GET /admin/departments` (staff
  Notes page needs department names; not sensitive), `GET /shifts/range`,
  `GET /shifts/daily`.
- **New `GET /api/directory`** (`requireAuth`): `user_id, name, role,
  department_id, active` only. Replaces the staff Calendar's use of
  `/admin/employees` (which carries phone / rate / birthday).
- **`/shifts/*` identity fix:** staff are pinned to their own token
  (`scopeUserId`); the client-supplied `?userId=` is honored for admins
  only. Previously omitting `userId` under `department` visibility
  returned everyone's schedule.
- **Deleted dead/dangerous routes:** `POST /authenticate`,
  `POST /clock-in`, `POST /clock-out`, `GET /user/:phone/history`
  (phone-number-only; unused by the app except `/authenticate`, below).
- **`JWT_SECRET` hardened (`auth.js`):** no more public fallback
  `'dev-secret-do-not-ship'`. If unset → random per-boot secret (tokens
  unforgeable, server doesn't crash, but every restart signs everyone
  out) + loud `[auth] !!` log. Also logs if the secret is < 32 chars or
  looks like a placeholder. `.env.example` documents it.
  **ACTION: set a real `JWT_SECRET` on Koyeb** (user hadn't confirmed it
  was set). Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
  Changing it signs everyone out once — expected.
- **Crash fix (found by the test run):** Express 4 doesn't catch rejected
  promises from `async` handlers, so a DB error in a handler without its
  own try/catch killed the whole Node process. Found in my own 19.3
  delete endpoint (`pool.connect()` outside `try` — fixed) and 4 older
  handlers (`/admin/dashboard`, 3× `/handoff-notes`). Added the
  `express-async-errors`-style shim (patches `Layer.prototype.handle_request`
  to forward rejections to `next(err)`) + a last-resort error middleware
  returning `500 {success:false}`. Net: a Neon blip now fails one request
  instead of taking the server down.

**Client**
- **`authFetch(url, opts)`** added to `src/auth/index.js` — a drop-in for
  `fetch` (returns the real `Response`) that attaches the Bearer token,
  maps `/api/…` through `REACT_APP_API_URL`, and applies the same 401
  handling as `apiFetch`. Chosen so ~32 call sites changed by a rename
  rather than a rewrite. **Convention from now on: every non-public API
  call uses `apiFetch` or `authFetch`; only `/api/public-config` and the
  login endpoints are called without a token.**
- Converted: StaffDetail, StaffManager, AdminSettings, Calendar,
  ShiftSheet, AdminReports, NotesPage, StaffCalendar, ShiftsCalendar,
  DevPanel. (Bonus: on the GitHub-Pages build these raw `/api/…` calls
  previously hit the wrong origin.)
- **StaffCalendar** → `/api/directory`.
- **`/kiosk` (ShiftsView):** the phone-keypad lookup is gone; it now shows
  the signed-in staff member's own schedule (token identity) via the
  existing flip-card markup. `src/services/timeClock.js` deleted (all
  exports unused).
- **DevPanel (`/dev`):** its gate is client-side only (hardcoded
  `dev`/`dev`, localStorage flag). Its settings save now needs a real
  admin session; a 401/403 shows "Saving needs an admin session…".
  Consider a server-backed dev role later (or delete the panel).

**Testing done**
- Local route matrix (`authmatrix.js` in the session scratchpad): spawned
  the server against an **unreachable dummy DB** and hit all 80 routes
  with (a) no token, (b) a forged admin token signed with the OLD public
  fallback secret, (c) a valid staff token, (d) a valid admin token.
  Expected: no token → 401; forged → 401; staff on admin routes → 403;
  admin → passes the gate. **80 routes, 0 failures.** Legacy routes
  now 404. Server stayed up with the DB down.
- `npm run build` compiles; no new warnings in touched files.
- **Not done:** no click-through in a browser against the real DB, so
  expect to verify (below). Test-run side effect to know about: a few
  matrix runs sent an admin token to `/admin/reservations/:id/detail`
  (and possibly `/admin/forecast/scrape`), which attempted real Agilysys
  logins using the creds in the local `server/.env` — they failed (401),
  nothing was changed, but a handful of failed logins may appear in
  rGuest's log. The matrix now skips those two routes for the admin
  token.

**Post-deploy checklist (user)**
1. Apply migration 026 (see 19.3).
2. Set `JWT_SECRET` on Koyeb (≥ 32 random chars) *before* deploying; check
   the deploy log has no `[auth] !!` line.
3. Deploy server + frontend together. Everyone must log in again once.
4. Click through as **admin**: Staff list → a staff detail (entries, edit,
   delete, PIN), Add staff, Calendar (create/edit/delete a shift), Shift
   Sheet, Settings (change + save one), Reports, Forecast.
5. Click through as **staff**: Home clock in/out, Calendar (week view
   shows names), Notes, `/kiosk`.
6. Anything that now shows "Missing token"/empty = a call site I missed
   → tell me the page.

**Known follow-ups (not done)**
- Admin accounts in the DB with bcrypt hashes, add/change/remove admins,
  token invalidation on password change (discussed; own sprint).
- `server/config/admins.json` still plaintext (private repo).
- No rate limiting on `/auth/*/login`.
- `/dev` panel gate is client-side `dev`/`dev`.
- `requireRole` has only `admin`; `front_desk` has no distinct permissions.
- `GET /admin/employees` etc. return full rows to any admin — fine for the
  single-admin case, revisit for per-department/multi-tenant admins.

**Files touched:**
- `server/server.js`, `server/auth.js`, `server/.env.example`
- `src/auth/index.js` (+ `authFetch`), `src/components/AdminPanel/{StaffDetail,StaffManager,AdminSettings}.js`,
  `src/components/AdminPanel/Calendar/index.js`, `src/components/ShiftsView/{index,ShiftsCalendar}.js`,
  `src/pages/{NotesPage,StaffCalendar,ShiftSheet,AdminReports,Dev/DevPanel}`
- deleted `src/services/timeClock.js`
- `database/migrations/026_time_entries_delete_cascade.sql`, `database/schema.sql`
- `claude-instructions/part5.md`

---

### 2026-09-30 — Sprint 19.3: delete time entries, section reorder, responsive pass, endpoint auth audit

**1. 19.2 responsive pass (mobile + PC).** Rendered the real built CSS +
the component's real markup in headless Chrome at 390 px and 1280 px
(static mock — no login/DB needed; animations disabled for the capture).
Verified both layouts; fixes made from what the render showed:
- **PC:** `.emp-detail` was stretching to the full main-area width
  (~1,350 px on a wide monitor). Now `max-width: 960px`, centered.
- Facts grid is deterministic: 2 columns by default, 4 at ≥1100 px,
  1 column ≤360 px (was `auto-fit`, which could produce a lopsided 3+3+2).
- Week navigator capped at 480 px so the arrows don't fly to the card
  edges on desktop; on phone the "This week" pill drops to its own row.
- Replaced a `:has()` selector with an explicit `.has-facts` class.
- Phone page padding 24 → 16 px at ≤480 px.
- Limits of this check: static mock, real fonts/data/dark mode not
  exercised; the real page still deserves a quick look on a device.

**2. Delete a time entry.** Edit could only change times. Now:
- **UI:** the Override-Hours modal (edit mode only — not "Add entry")
  has a **Delete** button on the left. It swaps in an inline red confirm
  panel showing the entry's date/times and the consequence ("removes it
  from payroll hours… recorded in the audit log") with **Keep** /
  **Yes, delete**. Phone: modal is bottom-sheet style with ≥44 px
  buttons, Delete on its own row.
- **API:** `DELETE /api/admin/time-entries/:id`
  (`requireAuth` + `requireRole('admin')`, UUID-validated). One
  transaction: `SELECT … FOR UPDATE` → delete dependent
  `approval_requests` (NOT NULL FK; table has no writers today) → delete
  the entry → insert `audit_logs` row `admin_time_entry_delete` with the
  **full original row in `old_data`** and the admin username in
  `new_data`. Hard delete, but reconstructable from the audit log.
- Client: uses `apiFetch` (token), then reloads entries and stays on
  the current week.
- **Not tested against a live DB** (didn't run against the Koyeb DB).
  First real use: delete a throwaway test entry and confirm the
  `audit_logs` row exists.

**2b. Migration 026 (added in 19.4 session) —
`database/migrations/026_time_entries_delete_cascade.sql`.** The delete
endpoint did not *need* a schema change (it removes `approval_requests`
rows itself in the transaction), but the only FK into `time_entries`
(`approval_requests.entry_id`) had no `ON DELETE` rule. 026 finds that FK
by what it references and recreates it `ON DELETE CASCADE`, so the DB
enforces the same rule. Idempotent; `schema.sql` updated to match.
**Run it on Koyeb:** `psql "<conn>?sslmode=require" -f database/migrations/026_time_entries_delete_cascade.sql`
(not yet applied by Claude — user applies, as with 024).

**3. Time Entries now sits above PIN Access** (pure JSX reorder).

**4. Endpoint auth audit (no fixes yet — those are 19.4).** All 84
routes in `server/server.js` parsed for `requireAuth` / `requireRole`
(helper output kept in the session scratchpad). Findings:

*Public on purpose (keep):* `GET /api/health`, `POST /api/auth/staff/login`,
`POST /api/auth/admin/login`, `GET /api/public-config` (only 4 non-sensitive
login-screen keys), static `*`.

*Authenticated, any role — OK:* `/api/me*`, `/api/auth/staff/set-pin|change-pin|logout`,
`/api/clock-in-self|clock-out-self`, `/api/handoff-notes*` (PATCH/DELETE
verified: author-or-admin ownership check; pin/resolve admin-only).

**Unprotected — NO `requireAuth` at all (26 routes; 5 are public on purpose → 21 real problems):**

| Sev | Route(s) | Impact today | Client caller |
|-----|----------|--------------|---------------|
| CRITICAL | `DELETE /admin/employees/:id`, `PUT /admin/employees/:id`, `POST /admin/employees`, `PATCH /admin/employees/:id/status` | Anyone on the internet can create / edit (role, phone, rate, login IDs) / deactivate / delete staff | StaffManager, StaffDetail (raw `fetch`) |
| CRITICAL | `PUT /admin/settings` | Anyone can change app config (OT threshold, login methods, idle timeouts…) | AdminSettings, DevPanel (raw `fetch`) |
| CRITICAL | `POST /admin/schedule`, `PUT`/`DELETE /admin/schedule/:id` | Anyone can rewrite/erase the schedule | Calendar (raw `fetch`) |
| CRITICAL | `POST /clock-in`, `POST /clock-out` | Phone number alone clocks any employee in/out → falsified payroll | **none** (legacy; `services/timeClock.js` exports unused) |
| HIGH | `POST /authenticate`, `GET /user/:phone/history` | Phone → user_id/name/role/hire date; full punch history by phone number | `/authenticate`: only `ShiftsView` (`lookupEmployee`); history: **none** |
| HIGH | `GET /admin/employees`, `GET /admin/employees/:id`, `GET /admin/employees/:id/time-entries` | PII + pay rates + birthdays + punch times readable without login | StaffManager, StaffDetail, Calendar, ShiftSheet, **StaffCalendar (staff-role page!)** |
| HIGH | `GET /admin/settings` | All app settings readable | Calendar, StaffManager, AdminSettings |
| MED | `GET /admin/departments`, `GET /admin/shift-templates`, `GET /admin/schedule` | Org structure / schedule readable | many pages, incl. NotesPage, AdminReports, StaffCalendar |
| MED | `GET /shifts/range`, `GET /shifts/daily` | Schedule readable; trusts a client-supplied `userId` query param to decide visibility scope (IDOR-ish) | StaffCalendar, NotesDrawer, ShiftsCalendar |

**Other findings (outside route middleware):**
- `server/auth.js`: `JWT_SECRET` falls back to the literal
  `'dev-secret-do-not-ship'` if the env var is missing. If Koyeb lacks
  `JWT_SECRET`, anyone can forge an admin token and bypass **every**
  `requireAuth`. **Must verify the Koyeb env var is set — before/with
  19.4.** Fix: crash on boot in production if unset.
- `server/config/admins.json` holds plaintext admin passwords (committed
  to a private repo; `findAdmin` compares plaintext). Hash them (bcrypt)
  or move to env.
- No rate limiting on `/auth/*/login` (PINs/4-digit codes are brute-forceable).
- `requireRole('admin')` is the only role gate; `front_desk` has no
  distinct permissions yet.
- `cors` only whitelists localhost — fine (same-origin in prod).

**19.4 plan (do in this order):**
1. **Check `JWT_SECRET` on Koyeb**; make server refuse to start without it
   in production.
2. **Delete dead legacy routes:** `POST /clock-in`, `POST /clock-out`,
   `GET /user/:phone/history` (+ the unused exports in
   `src/services/timeClock.js`). Replace `/authenticate` use in
   `ShiftsView` with the token identity (`/api/me`), then delete it.
3. **Add `requireAuth, requireRole('admin')`** to every `/api/admin/*`
   route listed above, and switch their callers from raw `fetch` to
   `apiFetch` (raw fetch sends no token → they'd 401). Callers:
   StaffDetail, StaffManager, Calendar, ShiftSheet, AdminSettings,
   DevPanel, NotesPage, AdminReports, StaffCalendar.
4. **Staff-facing needs:** `StaffCalendar` (staff role) uses
   `/admin/employees` and `/admin/departments` to render names — after
   step 3 it would 403. Add minimal read-only endpoints for any logged-in
   user (e.g. `GET /api/directory` → `{user_id, name, department_id}` only,
   no phone/rate/birthday; departments list) and point it there.
   `/shifts/range|daily`: `requireAuth`, ignore client `userId` and use
   `req.auth.sub` (admins may pass one).
5. Tests: curl matrix — every route with no token (expect 401), staff
   token on admin routes (expect 403), admin token (expect 200); then
   click-through every admin page + staff pages in the browser.
6. Follow-ups: admin password hashing, login rate-limit.
Because step 3 changes callers and server together, deploy as one
release; expect admin pages to break if only one side ships.

**Verified.** `npm run build` clean (no `StaffDetail` warnings);
`node --check server/server.js` passes. Delete endpoint **not yet run
against a DB**. Static-render screenshots reviewed at 390 / 1280 px.

**Files touched:**
- `server/server.js` (new `DELETE /api/admin/time-entries/:id`)
- `src/components/AdminPanel/StaffDetail.js` (delete UI, section reorder,
  `.has-facts`)
- `src/components/AdminPanel/AdminPanel.css` (responsive pass, delete styles)
- `claude-instructions/part5.md`

---

### 2026-09-30 — Sprint 19.2: Staff detail — compact profile card + weekly time entries

UI fix on the admin Staff detail page (`StaffDetail.js`). Frontend only —
no server, schema, or API changes.

**1. Compact profile card.** The old layout was a tall centered card
(avatar / name / badge, ~380 px on phone) plus a separate full-width
8-row info table below it. Now one card: 52 px avatar on the left;
name + Active/Inactive badge on top; the 8 facts (Phone, Username,
Employee ID, Birthday, Role, Department, Hire date, Hourly rate) in a
label-over-value grid beside/below the name (auto-fit ≥112 px columns →
2 cols on phone, 4 on ≥900 px desktop). The separate info table is gone.
- Phone formatted `(425) 377-5167`; dates shortened (`Aug 9, 2026`);
  empty values (`—`) dimmed so gaps are visible but not loud.
- Facts hide in edit mode (the form shows the same fields) — the card
  collapses to avatar + name.
- Removed dead CSS selectors `.emp-detail-info-grid`, `.detail-info-*`
  (verified unused elsewhere in `src/`).

**2. Weekly time entries.** Was: every entry in one list, capped at the
latest 30 (so older entries were unreachable *and* long lists were hard
to scan). Now:
- Default = **this week** (Monday → Sunday, local time — same week
  definition as the Performance trend bars). Entries are bucketed by
  **clock-in**, so an overnight shift stays in the week it started.
- **Week navigator** above the list: `‹  Sep 28 – Oct 4  ›` with a
  subline `This week · 6h 18m · 2 entries` (week total + count), plus a
  "This week" reset pill when viewing another week. `›` disabled on the
  current week; `‹` disabled when no older entries exist (no endless
  empty weeks).
- **Tap a bar in "Last 8 weeks"** to jump to that week; the selected
  bar is highlighted (bars are now `<button>`s, `aria-pressed`).
- **Follows the data:** opening via AdminHome "Edit hours" jumps to the
  entry's week; after saving/adding an entry the view jumps to the
  saved entry's week so it never vanishes into a week you aren't on.
- Filtering is client-side on the already-loaded entries array →
  switching weeks is instant and adds **zero DB queries** (consistent
  with the 19.1 compute-cost rule).

**Verified.** `npm run build` compiles; no warnings from `StaffDetail.js`
(removed the now-unused `fmtDate`). Week math sanity-checked in node
(Monday start; Sun 23:30 buckets to the prior week; 8-week-old bar →
offset −8; DST-spanning weeks round correctly). **Not yet eyeballed in a
browser** — check on phone width + desktop, light/dark.

**Known / deferred.**
- Mixed-timezone caveat: week boundaries use the admin's browser tz;
  the Performance trend uses the server's `weekStart` strings. Fine for
  a single-property single-tz deployment; revisit for multi-tenant.
- **Security finding (not fixed, out of 19.2 scope):**
  `GET /api/admin/employees/:id/time-entries` (server.js ~2314) has **no
  `requireAuth`/`requireRole`**, and `StaffDetail.reloadEntries` calls it
  with raw `fetch` (no token). Anyone who knows a user_id can read that
  staff's punch times. Candidate for 19.3: add auth middleware + switch
  the client to `apiFetch`. Same pattern likely applies to
  `/api/admin/departments` — audit the other `/api/admin/*` GETs.

**Files touched:**
- `src/components/AdminPanel/StaffDetail.js`
- `src/components/AdminPanel/AdminPanel.css`
- `claude-instructions/part5.md`

---

### 2026-09-30 — Sprint 19.1: DB compute-hour blowup (background timer kept Neon awake 24/7)

**Symptom.** Koyeb DB showed ~140 compute-hours / ~$30 for September
2026. Prior months were a few dollars.

**Background (Sprint 15.10).** Koyeb Postgres is Neon-backed. Neon
bills compute only while the instance is awake and suspends after
~5 min with no queries. Sprint 15.10 already fixed one such leak
(60 s dashboard polls + 60 s sidebar badge poll) and set the pg Pool
to `max: 5, idleTimeoutMillis: 10_000`. The standing rule since then:
**nothing may touch the DB on a timer.**

**Root cause.** Sprint 18.13 (2026-08-27) added a server-boot
`setInterval(tick, 5 min)` that runs `enforceHardShiftCap()` — an
`UPDATE time_entries …` — every 5 minutes, plus once at boot. A query
every 5 min is never outside Neon's ~5 min idle window, so the
instance never suspended: compute ran around the clock instead of only
during real use. The timing matches (18.13 shipped Aug 27; the
September bill is the first full month). It silently violated the
15.10 rule — the 18.13 entry even described it as a feature.

**What was ruled out (audited, no change needed).**
- All `src/` timers (`TimeClock`, `FocusedAction`, `Home`,
  `DashboardFace`, `AutoSignoutBanner`, `StaffShell` idle logout,
  `Forecasting` progress ring) are local state ticks — no API calls.
- `AdminHome` dashboard + overdue refresh: 5 min interval, gated on
  `document.visibilityState === 'visible'`, plus on-focus. A GM tab
  left visible all day still polls (≈ workday-only wakes) — noted
  below as a possible follow-up, not the regression.
- `Sidebar` unread badge: on-mount + on-focus only.
- `/api/health` (what Koyeb probes) does **not** touch the DB.
- Forecast cron is still deferred (no scheduler for scrapes).
- `server.js` boot does a single `SELECT NOW()` — once per deploy.

**Fix (`server/server.js`).**
1. Deleted the 18.13 `setInterval` + boot `tick()` block.
2. Added a request-driven middleware, `app.use('/api', …)`,
   registered immediately **after** `/api/health` (so health checks
   skip it). It calls `enforceHardShiftCap()` at most once per 5 min
   (`CAP_THROTTLE_MS`), awaited so the triggering request sees fresh
   data, with one shared in-flight promise across concurrent requests.
   `capLastRunAt` only advances on success, so a failure retries on
   the next request. It rides on traffic that already has the DB
   awake → zero extra wake-ups when the app is idle.
3. Existing lazy calls in `/api/me/hours` and
   `/api/admin/still-clocked-in` unchanged.
4. Fixed the stale comment above `enforceHardShiftCap`.

**Behavior change to know about.** A forgotten clock-in is now closed
the next time *anyone* hits the API after the 12 h mark (not within
5 min of it). The closure is still backdated to exactly
`clock_in + 12h` with `system_generated = TRUE`, so payroll hours and
the admin "recently auto-closed" list are identical; only the moment
the row flips differs. Overnight with nobody using the app, the row
stays open in the DB until the first morning request.

**Verified.** `node --check server/server.js` passes; no `setInterval`
remains in `server/` (only explanatory comments). **Not yet verified
against the live DB** — see checklist.

**Post-deploy checklist (user).**
1. Deploy to Koyeb. Watch the Koyeb DB "active time" / compute-hours
   graph over the next 24–48 h: it should show gaps (suspended)
   overnight instead of a flat line.
2. Optional functional check: set a test entry's `clock_in_time =
   NOW() - INTERVAL '13 hours'`, `clock_out_time = NULL`; hit any
   `/api/...` endpoint (e.g. open the app) → entry closed at exactly
   12 h, `system_generated = TRUE`.
3. If compute stays high after 48 h, next suspects: an always-visible
   AdminHome tab (5 min poll), and any external uptime monitor that
   hits a DB-backed route instead of `/api/health`.

**Possible follow-ups (not done).**
- Make the AdminHome 5-min poll back off when the admin is idle (no
  input for N min) — only matters if a visible tab is left open
  overnight.
- Consider Neon's dashboard "autosuspend" setting / compute-size
  check to confirm the 5 min idle default is what's configured.

**Files touched:**
- `server/server.js` (removed boot timer; added throttled middleware;
  comment fix)
- `claude-instructions/part5.md` (new)
- `claude-instructions.md` (index → includes part5)

---

<!-- Append new sprint entries above this line, newest first. -->
