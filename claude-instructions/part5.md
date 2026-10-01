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
| 19.2       | Staff detail UI: compact profile card + weekly time entries | Built, `npm run build` clean — **visual check pending** |

---

## 2. Sprint logs (19.1 → present)

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
