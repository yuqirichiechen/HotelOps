# Claude Instructions — HotelOps (Part 6: Sprint 21+)

> **Read §0 of `part5.md` (HANDOFF + roadmap) first, then this file's newest entry.**
> Part 5 covers Sprints 19.1–20.5. Part 6 starts with Sprint 21 (Room Forecast revamp)
> and continues with Sprint 22 (scraper database revamp) and onward.
> Conventions, test notes (`tests/README.md`), env/migration state: see part5 §0.

## Status

| Sprint | Focus | Status |
|--------|-------|--------|
| 21.1   | Diagnose why the Room Forecast "isn't working" | **Done** — no crash/data bug found; the model only answered "today" (see entry) |
| 21.2   | Date-aware forecast model + 14-day outlook + rebuilt page | **Built + tested** (19 tests incl. live rGuest checks) — awaiting user confirmation it fixes what they saw |
| 21.3   | Live room board (today), VI/PU semantics, workload-only future days, sync removed, HK/FD action lists | **Built + tested, NOT yet deployed** (see entry). Printable sheet for the selected day still open |
| 21.4   | Day 2–14 cleaning priority (expected arrivals, floor suggestions), selected-day Generate-forecast sheet, info popovers, late-booking settings | **Built + tested, NOT yet deployed** |
| 21.5   | Stored future list window 30 d → 365 d, separate from the 30 d guest-detail window | **Built + tested, NOT yet deployed** (no migration) |
| 22.1   | Sync engine: migration 028, mirror, ticks, endpoints, write-behind | **Built + tested (live dry run PASS), NOT yet deployed** |
| 22.2   | Auto-sync panel (health, run now, schedule, runs) + Recent-changes feed | **Built + tested, NOT yet deployed** (no migration) |
| 22.4   | Dev area (server-verified dev role): all settings/logs/debug moved out of the manager UI; full Reservations + Forecast replicas for dev; plain freshness badge | **Built + tested, NOT yet deployed** (needs env `DEV_PASSWORD_HASH`) |
| 22.5   | Manager Forecast simplified (dev keeps the full page) | **Done** 2026-10-20 (see entry) |
| 22.7   | Reservations tiles redo (left-first numbers, rings, count-up, room lists) | **Built + tested, NOT yet deployed** (no migration; new dev route `/api/dev/rooms/last-stays`) |
| 22.6   | One shell for dev + managers; lean manager Reservations; second-night cleaning plan; room status sheet | **Built + tested, NOT yet deployed** (no migration, no new env) |
| 22.3   | Pages read the mirror (no full scrape per refresh) + guest-detail refresh hook + forecast-accuracy tracker | **Built + tested, NOT yet deployed** (migration 029) |

## Sprint logs (newest first)

### 2026-10-21 — Sprint 22.7: Reservations tiles

User feedback: the tiles showed the wrong way round. Now **Arrivals left** (big) with "N arrived of T today", **Check-outs left** with "N checked out of T today"; **In-house**; "Staying tonight" removed (duplicated In-house); two new room tiles modeled on rGuest's Room Condition:
**Left to sell** (vacant Inspected + Pickup, sellable only; sub "x inspected · y pickup") and **Dirty rooms** (Dirty + In progress; sub shows dirty / in progress / occupied clean). Every tile has a **status ring** (arrived share, occupied share, checked-out share, left-to-sell share, dirty share) and a **count-up from 0** on first show and on each click (`shared/CountUp.js`; honors reduced motion; rAF with timer fallback).
Clicking Left to sell / Dirty opens a room list under the tiles (`RoomConditionPanel.js`, numbers from `roomCondition.js` over `payload.perRoomSheet`). **Left to sell**: room numbers + type + Inspected/Pickup for managers and dev. **Dirty + Occupied clean**: managers get room numbers only; dev gets guest details for occupied clean and the
**last previous stay** for vacant dirty rooms (new dev-only `GET /api/dev/rooms/last-stays?rooms=`, reads `reservation_history`; no lookup is made for managers). Tests: `kpi-tiles` 7 (new); `reservations-lean`, `forecastpage`, `devshell` updated/green. No migration, no new env.

### 2026-10-21 — Sprint 22.6: one shell, lean Reservations, second-night plan, room status sheet

User decisions this sprint: merge dev into the admin shell ("one shell with logins"); second night must also count **stay-overs to service** (they add to a housekeeper's 10-room minimum — the minimum itself, overridable, belongs to the
coming **Housekeeping page**, not built yet); the second night uses **booked** arrivals; days 3–14 keep the current method (too far to matter for the next two days; a future statistics page will use them); "Generate forecast" becomes a
printable/downloadable room sheet; wording "left to sell" instead of "turn first".

**1. One shell.** `/login/dev` → `/dev` = **property picker** (`TenantPicker kind="dev"`, one property today) → `/:tenant/admin` = the SAME `AdminShell` managers use. A dev session gets (a) a **"Dev tools" nav group** — Auto-sync, Logs, Forecast settings, Platform
(`pages/Dev/DevViews.js`, `DevLogs`, `DevPlatform`) — and (b) a slim **"View as: Full | Manager"** bar (remembered per browser session) that flips Reservations + Forecast between the full dev page and exactly what a manager sees, plus "Switch property".
Managers never get the group or the bar. `RequireRole('admin')` admits dev; dev is still kept out of the staff shell; dev sign-out goes to `/login/dev`. Server: admin-reader checks in `server.js` (`req.auth.type/role === 'admin'`) now also accept dev, so every admin page works for dev.
`DevShell` (22.4) is deleted — its content moved into the shell. Dev-only data routes remain 403 for managers (22.4 tests unchanged). Browser still has ONE token slot (dev and manager sessions replace each other).

**2. Second night (tomorrow, offset 1) — `buildDayModel`.** Uses tonight's real room state (live board; falls back to the payload's rooms) and BOOKED arrivals (no allowance):
`carry = clean vacant rooms (VI/PU) − tonight's remaining arrivals (pre-assigned arrivals reserve their own room)`; `shortfall = tomorrow's booked arrivals − carry` per room-type group. The shortfall is covered from **dirty vacant rooms (in-progress first) → rooms checking out today → rooms checking out tomorrow**.
After that: every remaining check-out gets a full clean, leftover dirty rooms are listed, and **every room staying over is serviced**. Output per group (`totals.dayTwo`): carry, shortfall, unresolved, priority list (with the reason per room), remaining check-outs, dirty leftovers, stay-overs, counts of
clean / service; model-level `dayTwo = {clean, service, total}`. Priority tiers: normal (no shortfall) / early / first / short (unresolved > 0 → "Not enough rooms"). Days 3–14 unchanged (booked + weekday late-booking allowance; vacant assumed clean).
For every future night: `potential = sellable − occupied by stay-overs` and **`leftToSell = potential − arrivals`**; totals `leftToSellFuture`, `potentialRooms`. The outlook now gets the live board for day 2 as well.
UI: the summary card says **"NKRR left to sell … Total left to sell N rooms"** with bars "Arriving (booked/expected)" vs "Rooms that can be ready" (the old "Total to turn first" is gone — it summed a different quantity than the label suggested; I found no arithmetic mismatch, so I treated it as a wording/meaning problem). Manager table (future days):
*Room type · Arriving · Left to sell · Priority*; the dropdown for tomorrow lists **Clean first (why: dirty now / checks out today / checks out tomorrow) · Check-outs to clean · Also still to clean · Staying over — service**, by floor, with "Rooms to clean N · to service M" (`DayTwoDetail.js`, also shown in the dev plan card; dev table header "Already empty" → "Clean now" for tomorrow).
Verified on live data (Oct 20 plan): NQRR 5 arriving, 2 clean left, 3 dirty rooms cleaned first, 9 check-outs, 17 stay-overs → 12 to clean + 17 to service.

**3. Room status sheet** (replaces "Generate forecast"; `roomSheet.js`, `RoomStatusSheet.js`): every room by floor — **Available** (vacant + inspected / awaiting inspection), **Unavailable** (dirty / being cleaned / out of order / blocked), **Occupied** with its **check-out day**; per-floor and total counts, "arriving today" flag for pre-assigned arrivals,
**Print** and **Download CSV**; no guest names. rGuest exposes only the check-out DATE (`estimatedTimeDetails` is always empty), so the time shown is the standard **12:00 PM** (noon — confirmed by the user; constant `STANDARD_CHECKOUT`; footnote on the sheet). Housekeeping assigns same-day check-outs in the morning regardless of the time. The previous priority-plan sheet stays as a dev-only **"Plan sheet"** button (no function lost).

**4. Lean manager Reservations.** `ResnTable lean`: each guest = **name · stay (dates + nights) · confirmation code · room type**, nothing else (`ResnItemLean.js`); no summary / contact lookups and no server-side contact search (search = name, confirmation, room type from the list); no Recent changes, no "No Room Assigned" tile, no "Needs a room" tab, no source filter, sort, CSV, attention chips or expand-all; lean Print sheet
(guest, confirmation, room type, stay). Kept: KPI tiles (arrivals / in-house / departures / staying tonight), status tabs, room-type filter, search, Print, freshness badge, refresh. Dev ('Full') keeps every function (a test lists them).

**Tests:** `forecastmodel` 26 (+6 second-night / left-to-sell; allowance tests moved to the third day) · `forecastpage` 23 (dev layout + manager layout + room sheet + parity) · `roomsheet` 8 · `reservations-lean` 6 · `devshell` 13 (one shell: nav groups, view-as, dev tools pages, property picker, role redirects, sign-out) · `dev-auth` 12 · plus all earlier suites (sync, payload, slices, migration, panel, refresh) re-run green. Build compiles. Screenshots checked (manager forecast tomorrow dropdown on live data).

**Not built yet (next):** the Housekeeping page (assign rooms to housekeepers: 10-room minimum overridable, admin adjusts, printable per-housekeeper sheets; will reuse `dayTwo` clean+service lists); a statistics page using days 3–14.

### 2026-10-20 — Sprint 22.5 (part 1): manager Forecast simplified

User's direction for 22.5 (full list): (a) Dev: after sign-in show a **tenant selection** (one tenant today), then the dev pages in the **same layout as the admin shell** (reuse Sidebar etc.); (b) manager Reservations: per guest only **name, stay duration, confirmation code, room type**;
"Recent changes" becomes dev-only; (c) merge every current function of both tabs into Dev before anything is removed from the manager; (d) manager Forecast: the "Sellable vs arriving" block first, then a simpler "rooms to sell"
table focused on each room type, with a dropdown for the detailed rooms. **User asked to do (d) first; (a)–(c) follow after review.**

**Manager Forecast (done):** `Forecast mode='manager'` renders, top to bottom: header (Generate forecast, freshness badge, Rooms live) → **Sellable vs arriving** card (unchanged format: "NKRR left to sell 4 … Total 16 rooms" + clean-vs-arriving bars)
→ **Rooms to sell today** (`SimpleRoomTable.js`): one row per room type — *Clean · Arriving · Left to sell · Status* — tap a row for the dropdown: each subtype's rooms with plain housekeeping states (Inspected / Awaiting inspection / Dirty / In progress / Occupied / Out of service)
and "Inspect now" / "Clean first" room numbers → **14-day outlook** (choosing a day returns to the top). For later days the same table becomes *Expected · Turn first · Priority* and the dropdown shows booked/expected/already-empty + the departing rooms to clean by floor.
Removed from the manager view (all still in Dev): stats bar, full table with subtype rows and housekeeping columns, action-list card, housekeeping-plan card, arrivals table, operational notes, snapshot-history / forecast-settings links.
**Parity guarantee:** `mode='dev'` is the previous page, untouched; a test asserts every old function exists there (outlook, stats, full table + click-to-expand chips, action lists, plan, arrivals, notes, summary, print sheet, links, live badge).
Verified against the live payload: the top card shows NKRR 4 / NKJZ 5 / NQRR 2 / NQJZ 5, total 16 (matches the user's reference); screenshots at 1200 px (today + tomorrow). Tests: `forecastpage` 22 (17 dev-mode + 5 manager), `devshell` 9.

### 2026-10-20 — Sprint 22.4: Dev area, manager/dev split, plain freshness badge

**Before deploying — REQUIRED setup (otherwise nobody can open /dev):**
1. Generate a hash locally: `node server/scripts/hash-password.js "<any password>"` (prints a bcrypt hash). Any non-empty string works — short is fine while debugging (the script only prints a note); replace it with a long one later and redeploy. **Debug convenience:** if `DEV_PASSWORD_HASH` is not a bcrypt hash (e.g. someone typed `dev` there), the server treats it as the PLAIN password (constant-time compare, still rate-limited, logs a warning) — added after the first deploy where the plain value was pasted into the hash variable.
2. Koyeb env: `DEV_PASSWORD_HASH=<that hash>` (and optionally `DEV_USERNAME`, default `dev`). Redeploy.
3. The old client-side `dev` / `dev` gate is **gone** — it never worked as security (the browser decided). With no hash set, dev sign-in answers 503 ("not set up") and there is no default password.
Dev sessions share the browser's single token slot: signing into /dev replaces a manager session in that browser (and vice versa) — use another browser/profile for both at once.

**Server (`auth.js`, `server.js`)**
- `POST /api/auth/dev/login` → token `role:'dev'`; env credentials, bcrypt, constant-time user check, **5 failures per client / 30 overall per 15 min → 429 + Retry-After**,
  generic "Invalid credentials" (never says which field). `/api/me` understands dev. `requireRole('admin')` now also admits `dev` (dev ⊇ admin); `requireRole('dev')` excludes managers.
- **Dev-only (managers get 403):** forecast config + room-type mapping (GET/PUT), snapshot history list/detail/delete, `/admin/sync/status|settings|runs`, `/admin/forecast/accuracy`,
  `/api/dev/jobs` (guest-detail job log, new), sync runs other than `refresh`, and any `forecast_*` / `sync_*` / `guest_detail_retention_days` key in `PUT /admin/settings`.
- **Managers keep:** `/admin/forecast/current`, the change feed, `POST /admin/sync/run {kind:'refresh'}`, and the new `GET /admin/sync/health` (state + last-sync time + `running`,
  no technical detail). `/forecast/current` now also returns `sync` (the same summary) so the pages need no extra call. Refresh button waits on `/sync/health`
  (an earlier draft polled the now dev-only status endpoint and would have hung for 2 min — caught by the test).
- `syncHealth` (pure): ok / stale (> 3× the schedule in force, min 15 min) / down (paused, rGuest login rejected, last 3 runs failed) / off.
- Per-reservation refresh (`latestListItem`) now reads the mirror payload first (the stored snapshot can be days old); `refreshOne` uses the shared rGuest client (no extra login).

**Client**
- `RequireDev`, `loginDev`; dev users are redirected to `/dev` from the manager/staff shells and login pages; `/dev` = `DevShell`. `DevLogin` is server-backed with clear messages (503 / 429 / 401).
- **DevShell** (`pages/Dev/*`): Auto-sync (home) · Reservations · Forecast · Settings (labor / late bookings + accuracy / mapping; inline, no Auto-sync tab) · Logs (change feed with every event type,
  snapshot history + per-run logs inline, guest-detail jobs) · Platform (tenant-logo strategy, moved from the old DevPanel). The old `DevPanel.js` is deleted.
- **Manager vs dev is a fixed `mode` prop, not a toggle:** `Forecasting` (Reservations) and `Forecast` take `mode='manager'` (default; AdminShell) or `'dev'`. Manager mode drops Snapshot history,
  Forecast settings, Raw scraper output and the guest-detail job bar; dev mode is the unchanged full page. (No code copy: in 22.5 the manager surface gets its own simplified components and the
  current full components stay as the dev view, so the two cannot drift into each other.)
- **Freshness badge** (`shared/SyncBadge`, `freshnessOf`): replaces "Last sync 9:12 AM" on Reservations and joins the Forecast header. Plain words: **Up to date · 3 min ago** (green) /
  **May be out of date · updated 2 h ago** (amber, "tap refresh") / **Not updating · last update 9:15 AM** (red, "please tell the manager") / **Manual update** (legacy snapshot). Ticks every
  minute client-side; no requests.

**Tests (all green):** `dev-auth` 11 (env/503, bad creds, rate limits, dev ⊇ admin, every dev-only route × none/staff/admin/dev, manager still-allowed set, settings key guard) ·
`devshell` 9 (real auth + router: sign-in states, RequireDev, role redirects; manager vs dev pages; freshness states; shell navigation) · `sync-pure` 16 (+syncHealth) ·
`reservations-refresh` 3 · existing suites re-run (sync-route/forecast-allowance updated to dev tokens). Screenshots checked (manager header at 1200/390 px, dev Auto-sync).

**Not in this sprint:** simplifying what managers see (22.5); the manager Settings page (other admin settings) is untouched; password rotation UI for dev.

### 2026-10-20 — Sprint 22.3: pages read the mirror, detail refresh hook, accuracy tracker

User confirmed the Cloudflare Worker cron works (Trigger Events/logs: `outcome: ok`, ~300 ms per ping).

**Deploy:** run `database/migrations/029_sprint22_rollups.sql` (new tables `daily_rollups`, `daily_actuals`; idempotent) → deploy. Needs 22.1's
migration 028 + a finished first backfill (Auto-sync tab shows "History load complete"); until then the pages silently keep using the last snapshot.

**Pages read the mirror** (`server/sync/payload.js`, `GET /api/admin/forecast/current`)
- Payload = `computeForecast` over the mirror's raw rows (open RES/INH + today's DPT; the typed `status` column overrides the raw row's status because
  checkGone patches only the column) + 3 small rGuest calls (property date, rooms for live HK status, reservationMetrics). Same shape as a snapshot, so the pages
  only changed their URL. Verified equal to a full scrape's payload (offline test with real Postgres; live parity run below).
- Server flow: hydrate → `isMirrorReady()` (first full load done, `storeRaw` on, a sync in the last 24 h) → `flushPending()` (so the newest scan is visible) → build
  (30 s cache, in-flight de-dup, invalidated when the sync writes) → `{source:'mirror', snapshot:{scraped_at: last sync time, payload}}`. **Any failure or a not-ready
  mirror falls back to the latest stored snapshot** (`source:'snapshot'`) — the pages can't break because of the new path.
- Forecast page + Reservations page now call `/admin/forecast/current`. **Reservations refresh button**: with the mirror = `POST /admin/sync/run {kind:'refresh'}` (quick scan + hourly
  check), poll `/admin/sync/status` (DB-free) until idle (cap 2 min), re-read; without it = the legacy scrape. Forecast stale banner words adapted ("Auto-sync last updated…").
- `forecast_snapshot` and the old scrape stay (fallback + history); nothing creates snapshots automatically any more. "Slimming" them is deferred — they only matter as fallback.

**Guest details follow changes:** after every flush that wrote changes the server rebuilds the payload and calls `startDetailJob` for reservations in the 30-day detail window (the job
itself skips unchanged rows by fingerprint/TTL; shares the single rGuest client) — so new/changed bookings get their guest details minutes later, with no manual scrape.

**Accuracy tracker** (migration 029; `daily_rollups` = bookings on the books each morning for the next 15 days per room-type group, `daily_actuals` = guests that actually arrived
(INH/DPT) per group, finalised by the next day's reconcile; both idempotent upserts written with the reconcile flush) — `GET /api/admin/forecast/accuracy?days=` (rows booked vs actual).
`src/components/Forecast/accuracy.js` (pure): prediction = booked + allowance; per horizon measured vs assumed pickup, average miss with/without the allowance; least-squares
**suggested scale** over 1–3 days ahead (needs ≥7 days of results). UI: Forecast settings → Late bookings → "How accurate has it been?" with an "Use N%" button (fills the scale; the admin still
presses Save). Data starts accumulating from the first reconcile after deploy (history can't be reconstructed — creation dates only exist in detail for new bookings).

**Tests (all green):** `sync-payload` 6 (mirror payload == scrape payload; status override; legacy rows skipped; readiness rules; flushPending + onFlushed hook) · `sync-engine` 19
(+accuracy data written/idempotent) · `sync-route` 12 (+current fallback, accuracy, refresh kind) · `syncpanel` 15 (+accuracy maths and card) · `reservations-refresh` 3 (real page: new
endpoint, mirror refresh flow, legacy fallback) · forecast page/model suites re-run. Build compiles.

**Limits / next**
- The mirror payload costs one DB read (~700 raw rows) + 3 rGuest calls per page load (30 s cache); not DB-free like the live board, but pages are request-driven (same as before).
- Accuracy needs a week of data before it suggests anything. Optional later: enrich backfilled rows with creation dates (≈3,500 detail calls) to seed history.
- Remaining roadmap: the GUI-fix/wrap-up sprint; multi-property groundwork exists (`property_id` everywhere) but isn't exposed.

### 2026-10-20 — Sprint 22.2: Auto-sync panel + Recent changes feed

User confirmed the scheduler works (cron-job.org kept answering "malformed job" → switched to a **Cloudflare Worker cron trigger**
`*/5 * * * *` that POSTs `/api/sync/tick` with `x-sync-secret`; Worker → Settings → Triggers; changes can take ~15 min to propagate;
the Worker throws on a non-2xx so failures show in Trigger Events). The first secret was exposed in a screenshot → rotate
(`SYNC_TICK_SECRET` in Koyeb + Worker secret `SYNC_SECRET`), delete the cron-job.org job. Production already answered the tick URL
(401 without the secret), i.e. the 22.1 code was deployed by the user.

**Where:** Forecast settings → new **Auto-sync** tab (admin session; `SyncPanel.js`). I did NOT put it on the narrow `/dev` login-card
page (needs an admin session anyway). **Recent changes** card at the top of the Reservations page (`RecentChanges.js`).

**SyncPanel:** health pill (Healthy / Running <kind> / Paused / Disabled / Needs attention) with plain-language problems (no secret,
no ping for >15 min, never pinged since boot, rGuest auth failure, last 3 runs failed); last scheduler ping, next quick scan / hourly /
reconcile (≈, from the pure `schedule.nextDue`), history-load progress, tracked reservations, last DB write, writes waiting in memory;
**Run now** (quick scan / hourly / reconcile / backfill; Full re-sync needs a 2-step confirm with the ~4 min / 1,000-call warning);
Pause/Resume; settings form (window 12:00–24:00 default as 24-h text inputs because `type=time` cannot express 24:00, every N min,
days ahead, hourly every, near-days, reconcile time, **flush interval = the DB-cost lever**, advanced: history, look-ahead, raw data,
detail budgets, time zone) with Save/Discard and server validation messages; recent runs table (memory + stored, de-duplicated).
Polling hits `GET /admin/sync/status`, which is **DB-free once warm**: 4 s while a run is in progress, 30 s otherwise, visible tab only;
unsaved edits are never overwritten by a refresh.

**RecentChanges:** 24 h summary chips (new / cancelled / changed), filter chips (New, Cancelled+no-show+moved+gone, Changed, Arrived/departed
off by default — noise), rows with time, type pill, guest, room type, stay dates, room, confirmation, "via SiteMinder", and for edits the
old→new fields (room first). "Show older" pages with `before=<event_id>`. One GET on open / focus, no timers.

**Server:** `GET /api/admin/sync/events?limit&types&before` (validated, parameterised, limit ≤200, joins the mirror row for display) and
`GET /api/admin/sync/runs?limit`; engine status now has `lastTickAt`, `tickCount`, `bootedAt`, `nextDue`.

**Tests:** `syncpanel.test.js` 12 (real components in jsdom) · `sync-pure` 15 (+nextDue) · `sync-route` 9 (+events/runs: auth, validation,
injection attempts, caps) · `sync-engine` 17 (+status fields) · everything else re-run green; build compiles; screenshots at 800/1100/390 px
checked (`tests/syncrender.js`). No migration.

**Next:** 22.3 — Forecast/Reservations read from the mirror (slim snapshot) and the forecast-accuracy tracker (`daily_rollups`).
Open question for the user: whether "dev settings" should also be reachable from `/dev`.

### 2026-10-19 — Sprint 22.1: sync engine (migration 028, mirror, ticks, endpoints)

**Deploy order:** run `database/migrations/028_sprint22_sync_engine.sql` → set Koyeb env `SYNC_TICK_SECRET` (random, ≥16 chars) →
deploy → create the scheduler job: cron-job.org, every 5 minutes, `POST https://<app>/api/sync/tick` with header
`x-sync-secret: <the secret>`. Nothing runs until the secret + job exist. The first tick starts the automatic backfill in the
background (live dry run: 12 months back + 400 days ahead = **1,007 calls, ~224 s, 17.5 k rows**); later ticks are tiny.
The pages still read `forecast_snapshot` (22.3 moves them to the mirror), so nothing the staff sees changes yet.

**Design as built** (`server/sync/*`)
- Mirror = the existing `reservation_history` table, extended (never deleted): `fingerprint`, `gone_at/gone_reason`,
  `pms_created_at`, `booked_by`, `rate_plan_code`, `raw` (last raw list row), `property_id`, `last_changed_at`; label columns → TEXT.
  New: `reservation_events` (change feed, no guest PII), `sync_runs`, `sync_state`.
- Runs (`engine.js`): **frequent** (today + N days RES + in-house, default 12:00–24:00 PT every 5 min), **hourly**
  (count-gate over fixed 30-day slices; only slices whose count changed are re-fetched + an exact re-fetch of the next 14 days,
  because edits that keep a count the same are invisible to it), **reconcile** (daily after 04:30 PT: exact fetch of every future
  RES, baseline counts, vanish detection), **backfill/full** (resumable 30-day chunks × RES/INH/DPT/CXL, silent — no events).
- Vanished reservations are looked up one by one (`detail.status`): arrived / departed / cancelled / no_show / moved, or 404 →
  `gone_reason='not_found'`; **never deleted**. Incomplete slice fetches never mark anything gone (run = `partial`).
- New bookings (first `detailForNewMax` per run) get `reservationCreateTime` + `bookedBy` from the detail endpoint.
- **Cost design:** the scheduler is EXTERNAL; `POST /api/sync/tick` is secret-header protected, exempt from the shift-cap DB
  middleware, decides in memory (settings cached; first tick hydrates once) and returns 202 immediately. A frequent scan with no
  changes touches the database **zero** times (tested). Results are **write-behind**: buffered in memory, flushed in one
  transaction at most every `flushEveryMinutes` (default 15; hourly/reconcile/backfill flush at their end). Buffer is swapped
  before the write (nothing added during a flush is lost; a failed write merges back and retries).
- Safety: ONE shared rGuest client (token reused, no login per run); one run at a time (second ping → "busy"); a failed run stops
  the chain; **auth failure pauses the engine** (persisted) until an admin sets `paused:false`; never re-login after a 401.
- Endpoints: `POST /api/sync/tick` (secret), `GET /api/admin/sync/status`, `PUT /api/admin/sync/settings`
  (validated), `POST /api/admin/sync/run {kind: frequent|hourly|reconcile|backfill|full}`. Settings = JSON in
  `app_settings.sync_settings` (defaults in `settings.js`: window/everyMinutes/daysAhead, hourly everyMinutes/aheadDays/nearDays,
  reconcile.at, flushEveryMinutes, backfill monthsBack/chunksPerTick/auto, storeRaw, detail budgets, timezone).

**IMPORTANT rGuest finding (fixed in `client.fetchSliceExact` / `resSliceExact`)** — RES range semantics: `[from, to)` returns every
reservation with a **night** in the range (`arrival < to && departure > from`): a superset of the arrivals (stays that began earlier
are included), end exclusive. My earlier note "RES range = arrivals on d exactly" was wrong. The Sprint 20 `sliceExact` splits with
inclusive halves `[from,mid]+[mid+1,to]`, which is right for INH/DPT/CXL (inclusive day ranges) but **drops 1-night stays arriving on
the split day** for RES. The first live dry run exposed it (mirror 686 vs rGuest 707; 25 lost). RES now splits half-open
`[from,mid)+[mid,to)`, a one-night range with >99 stays uses the union-walk. `fetchReservationsExact` (RES via union-walk) was not affected.
Count-gate counts are night-overlap counts (= rGuest `totalElements`).

**Verification**
- `sync-pure.test.js` 14 · `sync-engine.test.js` 16 (real Postgres + fake rGuest: backfill, zero-DB frequent tick, write-behind,
  arrived/departed/cancelled/changed events, count-gate efficiency, reconcile, incomplete fetch, restart/legacy adoption, auth pause,
  busy, flush failure + in-flight writes) · `sync-route.test.js` 7 · `agilysys-slices.test.js` 7 (simulated rGuest, includes a
  sensitivity test proving the old split loses rows) · `migration-028.test.js` 3 (idempotent; the legacy runScrape upsert still works).
  Existing forecast suites re-run: model 20, page 17, window 4, allowance 3, live route 5 — all pass.
- **Live dry run** (`tests/sync-live-dryrun.js "$PWD" 12`: real rGuest read-only → throwaway local Postgres): complete=true;
  mirror RES **707 = rGuest `totalElements` 707**, missing 0 / extra 0; in-house 48 = 48; integrity clean (0 untyped, 0 un-fingerprinted,
  every CXL has `gone_at`); second pass (hourly + frequent + reconcile) = 0 new / 0 changed / 0 gone / 0 events.
- Probes: `forecast-probe-incremental.js` (no modified-since filter, sort ignored, order non-deterministic).
- Test-hygiene note: an early version of `sync-route.test.js` let the real client attempt ONE login with fake credentials
  (user `u`) before its client was fully faked; fixed — all methods are fake now. No real account was involved.

**Known limits / next**
- First hourly after the backfill re-fetches every slice once (no baseline yet); later hourlies are the cheap count-gate.
- No-show status code still unknown (`NS` probe → 400); CXL detail `cancellationInfo.isNoShow` is used meanwhile.
- 22.2: dev-settings panel (schedule, flush interval, Run now, last runs, pause/resume, raw toggle) + change-feed UI.
- 22.3: build the snapshot/Forecast/Reservations from the mirror (+ live board), `daily_rollups` + forecast-accuracy tracker.

### 2026-10-19 — Sprint 22 (start): incremental-sync probe (READ-ONLY) + agreed design

**User verified 21.4–21.5 in production ("works all good").** GM sees a long-term vision of HotelOps as a sellable HMS
for other hotels → keep new tables/adapters multi-property-ready. Agreed in this session: external scheduler
(cron-job.org, 5-min ping to a secret endpoint; server decides in memory whether a run is due), cost of ~$5–15/mo
accepted but cheaper options wanted, never delete reservations (mark cancelled/gone), dev-settings-configurable
schedule (frequent window default 12:00–24:00 PT every 5 min, hourly otherwise, full re-sync on demand, raw outputs).

**Probe findings (`tests/forecast-probe-incremental.js`, one login, ~40 calls):**
- rGuest's search has **no created/modified-since filter** (19 field names × 2 formats: all ignored) and **ignores `sort`**
  (body or query string). The result order is **non-deterministic** run to run (3 different orderings in 6 identical
  calls) — this is the cause of the ~15–19 % page drops (20.3). List rows carry no version/updated marker.
  → Change detection must be ours: id + fingerprint diff.
- Full exact fetch (`fetchReservationsExact`): 788 reservations, complete, **7 calls, ~20.7 s**.
- **Count-gate** works: `totalElements` per 30-day RES slice is stable between runs (14 calls, **2.2 s**). Only slices whose
  count changed need re-fetching; a daily full reconcile catches same-count swaps (a booking + a cancellation in one slice).
- Today + tomorrow RES slice: 34 rows, one page, **~0.2 s** — ideal for the 5-minute tick.
- Detail objects expose `reservationCreateTime`, `updateTime`, `version`, `sourceInfo.bookedBy` — these feed the change
  feed / pickup calibration (detail fetch only for new/changed rows).

**Design (to build):** `reservations` (typed mirror, upsert by id, never delete; `status`, `first_seen_at`, `last_seen_at`,
`gone_at`, `property_id`), `reservation_events` (new / cancelled / room / dates / status changes), `sync_runs` (kind,
trigger, counts, duration, error), `daily_rollups` (expected vs actual arrivals per type → accuracy tracker),
`sync_settings` in `app_settings`. Tick types: **frequent** (today+tomorrow), **hourly** (count-gate over 30-day slices,
re-fetch changed ones), **daily reconcile + full** (12 months back/forward, resumable monthly chunks). Business date from
rGuest property date. Cost lever: **write-behind** — keep the 5-minute scan state in memory and flush to the DB at most every
N minutes (setting), so database awake time follows the flush cadence, not the scan cadence.

### 2026-10-12 — Sprint 21.4–21.5: cleaning priority, selected-day sheet, 12-month stored list

**Deploy:** frontend + server together. **No migration** (settings use `app_settings`). After deploy run one scrape
on Reservations so the snapshot carries the 365-day list (`futureWindowDays: 365`, `detailWindowDays: 30`).
User verified 21.3 against rGuest ("spot on, perfectly resolved") before this sprint started.

**21.4a — Days 2–14 = cleaning priority (replaces plain workload)** (`forecastModel.js`)
- Per room-type group (substitutable pool, e.g. NKRR + subtypes): `expected = booked + allowance`;
  `alreadyEmpty = sellable − staying over − departing`; `needFromTurns = max(0, expected − alreadyEmpty)`;
  `turnFirst = min(need, departing)`; priority **normal / early / first / short** (short = even turning every
  departure can't cover it). Variant rows show booked/departing/staying; the verdict lives at group level.
- Late-booking **allowance** = `LATE_BY_HORIZON[daysAhead] × LATE_BY_WEEKDAY[arrivalWeekday]`, ×scale; at least
  `minExtra` for groups with 4+ booked; capped by free rooms (`sellable − staying over`); booked is never reduced.
  Calibrated from 1,111 sampled arrivals (see the entry below): tomorrow ≈ +25% of booked, Tuesdays high, Fridays low.
  Editable in **Forecast settings → Late bookings** (enable, scale 25–300 %, minimum extra 0–10) — keys
  `forecast_allowance_enabled|_scale_pct|_min_extra` in `app_settings` (validated in `PUT /admin/settings`).
- **Floor suggestions**: floors from rGuest `floorId` (normalised "01"→"1", "G"=Ground; `live.rooms` now carries
  `floorId`). The Housekeeping plan lists each group's *known* departing rooms by floor, fullest floor first,
  with the first N flagged; unassigned departures are counted (`unplacedFirst`, "no room number yet"), never
  invented. "Work by floor" lists departing/staying-over per floor. Today's action lists are grouped by floor too.
- Outlook strip: later days show "N to service" + "N to prioritise" flag; tooltip includes expected arrivals.
- Stats (future): Booked / Expected arrivals · Departing · Staying over · Rooms to turn first.

**21.4b — Selected-day printable sheet** (`ForecastDaySheet.js`, replaces the snapshot-only sheet on the page):
follows the selected day; today = status table + per-floor dirty/inspect/departing/stayover; future = priority
table + per-floor departing (turn-first rooms bold/underlined) + staying-over service. Reuses fc-sheet print CSS.
The old `Forecasting/ForecastSheet.js` is now unused (left in place).

**21.4c — Methodology behind an "i"** (`InfoTip.js`): formulas/assumptions are in click-to-open popovers
(card titles), not printed on the page. FD/HK see numbers + short action text only. Settings help text is plain
(admin-facing).

**21.5 — stored future window**
- `compute.js`: two windows. `future_window_days` (30) = **detail** window; new `future_list_days` (365) = **list**
  window for `reservationsOut` / `kind:'future'` / `reservation_history`. Payload: `futureWindowDays: 365`
  (list completeness, drives the model's "no data" cut-off) + `detailWindowDays: 30`.
- Cost measured on the live account: 840 reservations total, payload 439 KB → 650 KB raw (48 → 72 KB gzipped).
  rGuest's RES walk was already unbounded (693 RES out to 2027-10-05), so no extra rGuest calls.
- `detailJob.withinDetailWindow()` keeps the guest-detail deep fetch to arrivals ≤ today+30 (otherwise the first
  scrape would queue ~170 extra detail calls). Reservations rows beyond the window say "Guest details load
  closer to arrival" instead of "Loading…"; "Refresh" still fetches one on demand.
- Old snapshots (futureWindowDays 30) still render; the Future tab simply shows more rows after the next scrape.

**Tests (all re-run at the end):** `forecastmodel.test.js` 20 (+`--live` 22) · `forecastpage.test.js` 17
(tomorrow table, allowance reaching the page, info popover hides the method, sheet follows the day) ·
`forecast-window.test.js` 4 · `forecast-allowance-settings.test.js` 3 · `forecastlive-route.test.js` 5 ·
`forecast-live-check.js` 5 · build compiles (pre-existing warnings only). Real-data renders at 1280/390 px
checked: priority table, plan card by floor, sheet. Probes: `forecast-probe-fields.js`,
`forecast-calibrate-pickup.js` (writes /tmp/pickup.json).

**Known limits / watch after deploy**
- Allowance is one season of data (Aug–Oct 2026) at hotel level; scale is the tuning knob. Weekly swing +12…+44 %.
- Stayover/arrival *rooms* are mostly unassigned until check-in, so floor suggestions use departing rooms only.
- Assumes rooms vacant tonight will be clean; future HK status is unknowable.
- No-show status code not identified (probe `NS` → 400); no-shows aren't in the allowance.
- Sprint 22 (typed mirror/daily auto-sync) not started — user wants a GUI-fix + wrap-up sprint next.

### 2026-10-12 — Sprint 21.4 (start): floor check + pickup calibration probe (READ-ONLY)

**User direction:** day 2–14 should suggest which room types/floors to clean first from booked arrivals +
stayovers (+ an allowance for late bookings); "Generate forecast" must follow the selected day; widen the
stored future window; explanations of methodology go behind an "i"/dropdown — FD/HK don't need them inline.

**Floors:** rGuest room records carry `floorId` ("G","01","02","03","04", one typo "2" on room 209) and
`building:"Hotel"`. It always agrees with the first digit of the room number (1xx=01 … 4xx=04, G## = ground).
Use `floorId` normalized (strip leading zero, "G" = ground); fall back to the first digit.

**Booking creation date:** NOT in the list-search rows. Only in reservation *detail*: `reservationCreateTime`
(also `createdDateTime`, `createTime`; UTC — convert to America/Los_Angeles), plus `sourceInfo.bookedBy`
(SiteMinder / rGuest Book / staff name), `sourceInfo.walkIn`, `sourceInterfaceId`. 1,111 detail calls took
26 s at concurrency 3 (no errors). The list search reaches back ≥12 months (DPT/INH). No-show status code is
not `NS` (HTTP 400) — find the real code before measuring no-shows.

**Pickup calibration** (`tests/forecast-calibrate-pickup.js`, arrivals 2026-08-16..10-10, 2,254 found,
1,111 sampled; one season, list search drops ~15% of rows — fine for ratios):
- Share of final arrivals booked N+ days ahead ("on the books" k days before): k=1 80%, k=2 73%, k=3 69%,
  k=5 64%, k=7 59%, k=14 48%. → expected final = booked ÷ onBooks(k): +25% (1 day ahead), +38% (2), +44% (3),
  +57% (5), +69% (7), +109% (14).
- Strong weekday effect (k=1 allowance): Mon +31%, **Tue +47%**, Wed +29%, Thu +22%, **Fri +9%**, Sat +26%,
  Sun +17%. Weekly k=1 allowance across 8 weeks: 26, 25, 44, 24, 12, 21, 30, 26 (%). Signal is real but noisy.
- Channel: SiteMinder (OTA) 19.8% same-day; front-desk "rGuest Book" 2.6%; individual staff 8–39%.
- Cancellations: 467 CXL with arrival in the window; median cancel lead 25 days, only ~8% within 1 day of
  arrival → they're mostly already off the books at planning time; the net offset is small (~1–2% of arrivals).
- A flat 15% would under-allow tomorrow (+25%) and over-allow Fridays. Room-type-level history is too thin;
  calibrate at hotel level and spread by each type's share of booked arrivals.

### 2026-10-11 — Sprint 21.3: live room board, correct VI/PU semantics, workload-only future days

**User feedback that drove it**
1. Clean rooms did not match rGuest: tonight rGuest shows 2 NQRR available and no NKRRP, we showed NKRRP available.
2. The 14-day shortage/surplus logic was wrong: whether a room is sellable depends on *that day's* cleaning, which
   is updated manually after the FD checks the room (**PU = cleaned, not inspected; VI = inspected + cleaned**).
   Verdict only for **today** (purpose: "do we still have rooms to sell today? if not, close OTA/website on
   SiteMinder"). Days 2–14 should just show how many rooms need cleaning (workload).
3. Remove the Sync button — it will auto-sync in Sprint 22.

**Root causes found**
- **Ghost room "28"**: a deactivated record (start 2023-02-26, end/deactivate 2023-02-28, never occupied) is still
  returned by rGuest `config/rooms` as VAC/VI NKRRP; the rGuest UI hides it (condition summary totals 99 rooms,
  VI=2). Fixed with `isActiveRoom()` (isDeleted / status===false / start>today / end<today) in `compute.js`;
  `computeForecast` reports dropped rooms as `payload.inactiveRooms`.
- **`listRooms()` was cached 24 h** (Sprint 18.5) although rooms carry live HK/occupancy. Cache removed.
- rGuest `POST …/availability` could not be decoded (500 NPE "availabilityMode is null" for every body) — dropped.
  `reservationMetrics(date)` ignores the date (always today) so future days can't be validated against rGuest.
  RES range `{date:d,endDate:d+1,statuses:['RES']}` = arrivals on d (end exclusive).

**What was built**
- Server: `client.fetchTodayLive()` (property date, rooms, room types, remaining-arrivals RES slice, in-house
  departures, metrics; ~1.8 s), `clearLogs()`. `GET /api/admin/forecast/live` — admin-only, **DB-free**, shared
  client, 20 s cache, in-flight dedupe, generic 502 on failure. The `/api` hard-shift-cap middleware now skips
  this route so an open Forecast tab can never keep Neon awake (see [[no_db_timers_neon_cost]] rule).
- Model (`forecastModel.js`): TODAY per type: inspected (VI), awaiting (PU), dirty/in-progress, still departing,
  still arriving; `leftNow = VI+PU − arrivals`; status open / **tight ("Clean first")** / **full ("Sold out")** /
  **short ("Oversold")**; group pooling by substitutable room types. FUTURE days: arriving / departing / staying
  over / **rooms to service** only, no verdict. Beyond the stored window → "no data". `actions` = FD "inspect
  now" (PU rooms) + HK "turn these first" (dirty rooms, in-progress first, up to what's needed).
- Page: Sync button removed; snapshot loads on mount + window focus; live board polled every 120 s **only while
  the tab is visible**, auto-pauses after 30 min idle ("Live paused", resumes on activity); badge "Rooms live
  HH:MM" (amber when down/paused); outlook strip shows today's verdict + "N to sell", later days "N to service";
  action-list card; banners for live failure / paused / stale scrape / business-date mismatch.
- Unchanged / known follow-up: "Generate forecast" ForecastSheet still prints *today from the snapshot*; it
  should follow the selected day and use the live board.

**Verification (all re-run at the end)**
- `tests/forecastpage.test.js` 14 ✓ · `tests/forecastmodel.test.js --live` 14 ✓ (12 offline + 2 live) ·
  `tests/forecast-live-check.js` 5 ✓ (live board vs rGuest: ghost "28" excluded; HK conditions IP/VI/OC/D and
  99 total match roomConditionSummary; remaining arrivals 1 = rGuest; arrivals 52; departing+departed 63) ·
  **`tests/forecastlive-route.test.js` 5 ✓** (auth 401/403/200; **zero DB queries** on the route vs a control
  route that does query; 20 s cache; 8 concurrent requests → 1 rGuest pull; failure → generic 502, recovers) ·
  `npm run build` clean (only the pre-existing `IconSend` warning).
- Rendered with the live payload (`tests/fcrender.js`, now also feeds a live board and exits explicitly) at
  1280 px (today + tomorrow) and 390 px: layout fine; the wide table scrolls inside its card on phones.
- The 11:58 PM render shows Today = 1 to sell / "clean first" — expected late at night with 14 dirty rooms.

**Deploy:** frontend + server together; **no migration**; old snapshots still render; first Reservations scrape
refreshes the snapshot used for future-day workload. After deploy, ask the user to compare tonight's/tomorrow's
numbers against rGuest (Inspected VI, PU, NKRRP/NQRR availability).

**Still open:** printable HK/FD sheet for the selected day; 21.5 (stored list-level window → ~12 months);
future out-of-order ranges are not visible via the rGuest API; Sprint 22 (auto daily sync replaces the removed
button).

### 2026-10-11 — Sprint 21.1–21.2: Room Forecast diagnosis + date-aware rebuild

**Symptom reported:** "after the reservation revamp the room forecast is just not working at all."
Exact symptom not captured (no screenshot) — **ask the user to confirm what they saw.**

**Diagnosis (21.1) — nothing was broken by the Reservations work.**
- The Forecast page renders **without errors** against a payload from a *live* scrape (jsdom
  harness `tests/fcrender.js`, real compute, real CSS, screenshots at 1280/390 px).
- Its inputs are **accurate vs rGuest**: occupied-clean 50 ✓, dirty 44 ✓, in-progress 3 ✓,
  vacant-inspected 3 vs rGuest 2 (±1, timing); remaining arrivals 1 ✓, arrivals today
  51 arrived + 1 remaining = 52 = rGuest total ✓, departures 63 ✓, in-house 83 = rooms occupied ✓.
- **Real problem = the model, not a bug.** It answered one question — *today*,
  `Vacant-Clean − Remaining-Arrivals` — which at 11 PM is trivial ("3 clean vs 1 arriving → surplus") and
  useless for the question housekeeping/FD actually ask: *"will each room type have enough rooms for the
  guests arriving on day D?"* It also ignored rooms freed by today's remaining departures, dirty rooms
  that are being cleaned, and never looked past today. Not a regression — it was always that, but it is
  only obvious now that the surrounding pages are good.
- Small real data gap found: `compute.js` merged the room's **inventory status** into the occupancy
  field, so Out-of-Order / Off-the-Market / On-Hold rooms (rGuest catalog `OOO`/`OTM`/`HOLD`) could never
  be excluded. Fixed (see below). Today every room is OCC/VAC and unblocked, so this was latent.
- rGuest's `reservationMetrics(date)` **ignores the date** (returns today's numbers for any date), so it
  can't validate future days. Future-day arrivals/departures are exact by construction instead: the booked
  (RES) list is complete (20.3: 0 missing vs ground truth) and today's identities match rGuest.

**What was built (21.2).**
- `src/components/Forecast/forecastModel.js` (pure, tested): `buildDayModel(payload, date)`,
  `buildOutlook(payload, 14)`, `deriveNotes(model)`.
  - **TODAY:** per room type — *Ready now* (vacant, sellable, VI|PU), *Dirty vacant*, *Still departing*
    (in-house guests leaving today, by the room's ACTUAL type), *Arriving* (RES today).
    **Clean first** = max(0, arriving − ready); **Short** = max(0, arriving − (ready + dirty + departing)).
    Status: `short` (short even after cleaning) · `tight` ("Clean first": enough rooms, not clean yet) · `ok`/`even`.
  - **FUTURE day D:** *Staying over* (arrival < D < departure; guests leaving ON D free their rooms),
    *Unavailable* (OOO/OTM/HOLD/blocked/NA), *Available* = sellable − staying over, *Arriving* (RES on D),
    *Balance*/*Short*. Housekeeping status is deliberately not used for future days.
  - Substitutability kept (17.12): per-subtype rows + group totals pooling subtypes; a subtype booking
    (e.g. NKRRP) is short on its own even when the group is fine.
  - Day totals: arrivals, departures (today includes already-departed, = rGuest's 63), stayovers, occupied
    tonight + occupancy % (today: rooms occupied now + remaining arrivals − still departing ✓ verified).
  - **Data window:** days beyond `futureWindowDays` (default 30, now stored on the payload) are `nodata`,
    disabled and labelled — never a confident 0.
  - Plain-language notes, e.g. "Double Queen Standard: only 1 clean room ready for 3 arriving — clean 2
    more first (2 dirty, 0 still to depart)"; unsellable-room note; "no reliable data this far out".
- **Page (`Forecast/index.js`, `Forecast.css`):** **14-day outlook strip** (occupancy bar, ↓arrivals
  ↑departures, coloured top border + "short"/"clean N" flags; scrolls on phones), selected day drives the
  headline stats, "Need by Room Type" table (columns switch between *today* and *future* modes, click a row
  for its physical rooms), the arrivals list for that date, summary chart and notes. Selected day is remembered
  for the browser session. **Stale-snapshot banner** (> 3 h) with a path to the Reservations scrape.
  Old `computeNeedTree` / `deriveOperationalNotes` removed.
- **Server (`compute.js`):** `perRoomSheet` rows now carry `inventoryStatus` and `blocked`; payload carries
  `futureWindowDays`. Backward compatible — old snapshots without those fields are treated as sellable /
  30-day window. **No migration.**

**Live finding (Oct 11 evening):** occupancy 84% today → 68% tomorrow → 22–38% by late October, **no room type
short on any of the next 14 days**. So real "short"/"clean first" states are rare right now; they were
verified with a synthetic morning scenario instead.

**Verification (19 automated checks, all in the repo under `tests/`).**
- `tests/forecastmodel.test.js` — 8 offline (today buckets, tight vs short, substitutability, future-day
  math, unsellable rooms, data window, **conservation identity**
  `occupied(D+1) = occupied(D) − departures(D+1) + arrivals(D+1)`, hostile input) **+ 3 live** (`--live`:
  arrivals/remaining/departures match rGuest, occupied-tonight = rooms occupied + remaining − departing,
  identity holds on the real 14-day outlook).
- `tests/forecastpage.test.js` — 8 on the REAL page in jsdom with a synthetic morning payload with
  shortages: "Clean first 2"/"Short 1" rows + stats + notes, outlook flags, switching to a future day
  changes the whole page, future-day math, day remembered, window-disabled days, stale banner + link,
  OOO room exclusion, empty state.
- `tests/forecast-diagnose.js`, `tests/forecast-futurecheck.js`, `tests/fcrender.js` — live read-only probes.
- `npm run build` compiles (only the pre-existing `IconSend` warning).
- **Bugs caught by the checks and fixed:** today's "departures" excluded already-departed guests (0 vs rGuest's
  63); the notes function used an undefined total; two of my own hand-computed test expectations were wrong
  (model was right both times).

**Not done / known limits.**
- **"Generate forecast" (printable sheet)** still shows *today* only (`ForecastSheet` reads the snapshot's
  kpis) — should follow the selected day (21.3).
- Occupancy/availability assume each reservation sleeps in its booked or assigned room type; real room moves
  and overbooking decisions aren't modelled. Out-of-order *date ranges* in the future aren't visible (rGuest
  only exposes the room's current inventory status) — only "currently OOO" rooms are excluded.
- Dates beyond 30 days need Sprint 21.5 (wider list-level window).

**Deploy.** Frontend + server together (compute.js adds fields); no migration. After deploy, **scrape once on
Reservations**, then open Forecast → "Sync arrivals". Old snapshots still render (graceful defaults).

**Files touched:** `src/components/Forecast/{forecastModel.js (new), index.js, Forecast.css}`,
`server/forecast/compute.js`, `tests/{forecastmodel,forecastpage}.test.js (new)`,
`tests/{forecast-diagnose,forecast-futurecheck,fcrender}.js`, `claude-instructions/{part6.md,../claude-instructions.md}`.

---

<!-- Append new sprint entries above this line, newest first. -->
