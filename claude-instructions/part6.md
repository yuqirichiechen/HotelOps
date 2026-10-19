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
| 22.2   | Dev-settings panel (schedule, flush, Run now, health) + change-feed UI | Planned |
| 22.3   | Forecast/Reservations read from the mirror (slim snapshot) + accuracy tracker (`daily_rollups`) | Planned |

## Sprint logs (newest first)

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
