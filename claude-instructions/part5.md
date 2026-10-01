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
| 19.1       | Koyeb/Neon DB compute hours ballooned (~140 h / ~$30)       | Fixed in code — **deploy + verify pending** |

---

## 2. Sprint logs (19.1 → present)

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
