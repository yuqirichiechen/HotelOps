# Claude Instructions — HotelOps (Part 4: Sprint 17+)

> **Read this AND `part1.md` + `part2.md` + `part3.md` (same folder)
> every iteration before you start work.** Part 1 covers Sprints 1–9.4.1
> plus the original project brief. Part 2 covers Sprints 10–14.3. Part 3
> covers Sprints 15.0–16.9. Part 4 starts here with the Sprint 17
> roadmap and continues with new sprint entries from 17.1 onward.

---

## 1. Why this file exists

`part3.md` crossed ~2,600 lines after Sprint 16.9 and the Sprint 16 arc
closed clean. Rather than retroactively restructure, new sprint logs
(17.x and later) land here. Project overview, tech stack, conventions,
and the running glossary of internal concepts are all in part2 — don't
duplicate them. Sprint 15.x / 16.x background lives in part3 — don't
duplicate that either.

If you're starting a fresh iteration:

1. Skim `part1.md` for the deep architecture story (only if the task
   touches early-sprint surfaces).
2. Skim `part2.md` for the Sprint 10–14.3 work.
3. Skim `part3.md` for the Sprint 15–16 work.
4. Read this file's most-recent entry for current ongoing work.
5. Read `MEMORY.md` (auto memory pointer index) for any
   user-preference / project-context memory. Note especially
   `sprint17_rguest_api.md` — the rGuest API findings that
   unblock this whole sprint.

---

## 2. Sprint 17.x roadmap — Front Desk forecast (Agilysys rGuest Stay)

### 2.0 Why this sprint exists

The Front Desk has been hand-building a paper forecast every morning:
who's checking in today, what room types are needed, distributed by
floor to housekeepers. The data lives in Agilysys rGuest Stay (the
property's PMS / LMS) — the FD reads from one page, transcribes
manually, then walks the sheet to the HK office.

The whole thing is a copy-job between two systems both Snoqualmie
already owns. HotelOps automates it.

### 2.1 Discovery (done before sub-sprints — 2026-06-04)

Built a one-shot Python Playwright reconnaissance scraper at
`scraper/agilysys_recon.py` to capture every XHR/fetch the rGuest UI
fires while logged in as a real FD user, and dumped per-page HTML +
text + screenshots. Two pages walked:

1. **Reservations search** (`/v2/search/reservations?...`) — today's
   arrivals (the demand side).
2. **HK Condition** (`/v2/housekeeping/condition?...`) — every room
   with its current HK status + occupancy status (the supply side).

**Findings — the holy-grail outcome:** rGuest has a clean JSON REST
API behind the SPA. We don't need DOM scraping or a headless browser
in production. Three endpoints cover the whole forecast:

- `GET  /property-service/tenants/{tid}/properties/{pid}/config/rooms`
  → every room with `roomNumber`, `floor`/`floorId`, `roomTypeId`,
  `currentOccupancyStatus` (OCC/VAC), `housekeepingRoomStatus`
  (D/PU/VI/IP), `housekeepingSectionId`, `reservation` (UUID pointer).
  Single call = entire HK supply view.
- `GET  /property-service/.../config/roomTypes` → 15 room types with
  `typeCode` (e.g. "NQRR") → `name` (e.g. "Double Queen Standard").
- `POST /reservation-service/v2/.../reservations/search/date` →
  Spring-pageable arrivals/in-house/departures. Per-reservation:
  `arrivalDate`, `roomType`, `roomNumber`, `redEyeArrival`,
  `earlyArrival`, `housekeepingRoomCondition`, `occupancyStatus`,
  `primaryGuestInfo`, `status`.

**Auth pattern:**
- `POST /auth-service/auth/tenants/{tid}/users/login` with body
  `{username, password}` returns `{token: "<uuid>", ...}`.
- Every subsequent call carries the token as `x-token: <uuid>`.
  Not Authorization, not Bearer, not a cookie — custom header.

Full findings + admin-override notes live in `MEMORY.md` →
`sprint17_rguest_api.md`.

### 2.2 Design decisions (GM-approved 2026-06-04)

These bake in the user's resolutions to the open questions raised
during planning. Use them as the source of truth.

1. **Production language → Node.** The Python scraper at
   `scraper/agilysys_recon.py` stays in the repo as a one-off
   discovery tool for when rGuest changes their API; re-run by hand.
   The prod "scraper" is a Node module inside the existing Express
   backend — no Chrome, no Playwright, no second deploy on Koyeb.
   ~100 lines of `fetch()`.

2. **Storage model → snapshot per scrape.** Each run inserts one
   `forecast_snapshot` row with a JSONB payload (entire computed
   forecast) + SHA256 `payload_hash`. Dedup window 60 minutes:
   if the same hash exists from the last hour, skip insert and
   return the existing snapshot. Admin can hard-delete snapshots
   from the history view. Retention = forever (Koyeb DB is
   compute-billed, not storage-billed).

3. **Run modes → manual only for Sprint 17. Cron deferred.**
   - Manual: `Run scraper` button in admin → `POST /api/admin/forecast/scrape`.
   - Cron is deferred to a future sprint. Setting up Koyeb scheduled
     deployments + a shared secret is non-trivial and the FD can
     trigger a fresh scrape with one button-click before each shift,
     so the cost/benefit didn't pencil out for v1.
   - **The DB columns are pre-wired so reviving cron is later is a
     code-only change**: `forecast_config.cron_schedules` (JSONB
     array, default `["30 5 * * *", "0 11 * * *"]`) and
     `cron_timezone` (default `America/Los_Angeles`) live in the
     applied 024 migration. When we add the cron endpoint later,
     no schema migration is needed — those columns and defaults
     are already there, dormant.

4. **Room-type bucketing → auto-onboard from prefix.** First 4 chars
   of `typeCode` = base bucket (`NKRR` King Standard, `NKJZ` King
   Studio, `NQRR` Double Queen Standard, `NQJZ` Double Queen Studio).
   Trailing letters = sub-category (`A`=Accessible, `P`=Pets, `D`=
   Hearing Accessible / ADA Tub, `G`=Hearing Accessible, `B`=Roll-In,
   etc.). New codes (`NKRRA`, `NQJZP`) auto-insert into
   `room_type_mapping` on first scrape. Admin can pin a row with
   `admin_override=TRUE` to stop the next scrape from rewriting it.
   ROH (Run of House) and other prefix-mismatches get `base_code=NULL`
   and need admin review.

5. **No shift definitions in `forecast_config`.** Forecasts are
   room-driven, not shift-window-driven; the scraper runs whenever
   (manually or on cron) regardless of who's working. The desktop
   mockup's "Labor Plan by Shift" table is dropped from the
   Forecast page scope. We keep `productivity_target` (rooms /
   attendant / shift) and `avg_min_per_clean` (per base type) only
   because they feed the "Housekeepers needed" KPI card — pure
   math, not a schedule.

6. **"Send to housekeeping" → "Generate forecast."** Renamed.
   What it does: render a per-room sheet (room#, floor, type,
   OCC/VAC, HK status, checkout date if any, action). HTML with
   `@media print` CSS for v1 — admin opens it in a tab and prints
   on physical paper to walk to HK. Real PDF generation deferred
   (avoid pulling Puppeteer back into prod).

7. **By-floor toggle.** The Forecast page table has three views:
   By cleaning type / By room type / **By floor** (added per GM
   request — the actual handoff unit since Snoqualmie's HK
   doesn't use rGuest's `housekeepingSectionId` field; every room
   is `"unsectioned"`).

8. **Logs viewer per snapshot.** Each scrape run emits structured
   log entries (level/message/context) into
   `forecast_snapshot.logs` JSONB. The Settings → History view
   drills into a snapshot and renders its log lines for debugging.

9. **Mobile bottom nav refactor.** As HotelOps grows, labels won't
   fit at the bottom. Move to the standard 4 primary + "More"
   sheet pattern. Primary: Home / Calendar / Forecast / More.
   More-sheet contents: Staff, Logbook, Assistant, Settings,
   Sign out.

### 2.3 Sub-sprint split

| Sprint | Scope                                              |
| ------ | -------------------------------------------------- |
| 17.1   | DB migration 024 + rGuest API client (`server/agilysys/`) |
| 17.2   | Forecast compute fn + `/api/admin/forecast/*` endpoints   |
| 17.3   | Admin Forecast page (desktop mockup, manual Run-scraper)  |
| 17.4   | Mobile nav refactor (4 + More) + Generate Forecast sheet  |
| 17.5   | Forecast settings UI + snapshot history / logs viewer     |

Cron-based auto-scrape was originally paired with 17.3 but is
deferred (decision §2.2.3). When we add it later it gets its own
sub-sprint — likely 17.6 — and reads the dormant config columns
already in the DB.

---

## 3. Sprint logs (17.1 → present)

### 2026-06-04 — Sprint 17.7.1: diagnostic instrumentation (data still mismatches)

After 17.7 fixed the CXL over-count, a fresh live scrape at 18:59
showed arrivals=28 / departures=42 / stayovers=25 vs rGuest's
arrivals=38 (17 remaining of 38) / departures=30 (0 remaining of
30). The 17.7 fix correctly handles the recon-time data (33
arrivals at 14:17 — matches rGuest's curve), but something is off
in live data we can't see from here.

**Suspected vectors, ranked by likelihood:**

1. **Pagination boundary.** size=99 fits in one page at 14:17
   (100 raw reservations) but the property could be over 99 by
   evening (rooms sold = 60, today's resv ≥ 38 arrivals + 30
   departures + ~30 stayovers + ~15 cancelled ≈ 113+). If
   `searchAllReservationsByDate` thinks `totalPages = 1` when
   rGuest's `totalElements > 99`, we silently miss the tail.
2. **Departure KPI vs perRoomSheet gap (42 vs 28).** The 14-room
   gap suggests reservations are bumping the KPI without
   appearing on any room — i.e. departures whose `roomId`
   doesn't match a `rooms[].id`. Could be rGuest clearing
   roomId after checkout, or a different field name.
3. **Date-format edge case** on the live data — some
   `arrivalDateLocalDate` missing → fallback to slicing
   `arrivalDate` ISO, which on a late-night arrival can shift
   the day in the wrong direction.

**Diagnostics added** so the next snapshot tells us which it is.

`server/forecast/compute.js` — `payload.meta` block extended:
- `rawByStatus` — every status seen in the raw payload (incl.
  filtered).
- `statusDateMatrix` — status × arr-vs-today × dep-vs-today
  cross-tab so we can see what buckets reservations actually
  fell into.
- `arrivalsByStatus` / `departuresByStatus` / `stayoversByStatus`
  / `inHouseByStatus` — per-bucket histograms with their KPI
  sums.
- `unmatchedArrivals` / `unmatchedDepartures` — reservations
  classified into those buckets but whose `roomId`/`roomNumber`
  doesn't match any record in `rooms`. Catches "ghost
  cleanings" that bloat KPIs without showing up on the floor
  sheet.
- `consistency` block — `arrivalsSum` / `departuresSum` /
  `stayoversSum` / `inHouseSum` next to `kpis`. If these ever
  disagree the per-bucket counter is wrong.

`server/agilysys/client.js` — `searchAllReservationsByDate` now
emits per-page log entries:
```
agilysys.reservations.page_fetched
  { pageNum, gotInPage, totalPages, totalElements }
```
and a summary at the end:
```
agilysys.reservations.all_pages_fetched
  { date, pagesFetched, total, totalElements, walkComplete }
```
`walkComplete: false` flags a pagination bug (sum of pages ≠
`totalElements`).

**Snapshot History detail view** — added a Diagnostics panel
that JSON-dumps `payload.meta`. Screenshot it; that's the
fastest path to telling me what's going on.

**Verified on recon (14:17):** the diagnostic block reproduces
the breakdown exactly:
- rawByStatus: {RES:31, INH:29, CXL:15, DPT:25}
- arrivalsByStatus: {RES:31, INH:2} = 33 ✓ matches kpis
- departuresByStatus: {INH:6, DPT:25} = 31 ✓
- stayoversByStatus: {INH:21}, inHouseByStatus: {INH:29}
- unmatched: arrivals=19 (the 19 RES without pre-assigned room),
  departures=0
- statusDateMatrix gives full visibility into how each status's
  arr/dep relates to today.

**Files touched:**
- `server/forecast/compute.js` (~120-line `buildDiagnostics()`
  helper called from the main return).
- `server/agilysys/client.js` (pagination logging).
- `src/components/Forecasting/ForecastHistory.js` + `.css`
  (Diagnostics panel rendering `payload.meta` as JSON).

**Action needed from user:**

1. Restart the server (compute.js + client.js touched).
2. Open the admin Forecast page, click **Run scraper**.
3. Open **Snapshot history** → click the latest snapshot.
4. Send back: the **Diagnostics** JSON block + the
   **agilysys.reservations.all_pages_fetched** log entry's
   context.

That tells us whether (1) pagination is broken, (2) reservations
are bumping KPIs without matching rooms, or (3) something else
we haven't thought of yet.

---

### 2026-06-04 — Sprint 17.7: data-correctness fixes (arrivals over-count + missing room types)

Live-test surfaced the forecast over-counting arrivals: our scrape
showed 42 vs rGuest's 37 (and rGuest's 20 *remaining*). Root cause
was the classifier in `server/forecast/compute.js` ignoring the
reservation `status` field entirely. Three bugs found and fixed,
all in `compute.js`.

**Bug 1: cancellations + no-shows counted as arrivals.**

The recon shows rGuest's status enum is `RES` / `INH` / `DPT` /
`CXL` (Reserved / In House / Departed / Cancelled), with `CXL`
making up 15% of the date-filtered set. Our old classifier checked
only date overlap — so cancelled rooms with today's original
arrival date still landed in the arrivals bucket. Added
`EXCLUDED_STATUSES = {CXL, NS, NSG, MOV}` at top of file; the
classifier returns `null` immediately for any of these. Confirmed
against recon: arrivals drop from 42 → 33 (= 42 − 9 cancelled
rows whose arrival was today; the other 6 excluded rows had
arrivals on different dates).

**Bug 2: every reservation bucketed as `Other` in byRoomType.**

The old code did:
```js
const rtCode = r.roomType && (r.roomType.typeCode || r.roomType.code);
```

But rGuest's reservation payload stores `roomType` as a **UUID
string** pointing into the `/config/roomTypes` record, not an
embedded object. The expression silently returned `undefined`, the
mapping lookup missed, every reservation bucketed into the
"unmapped" bucket. Added `resolveReservationTypeCode()` that
looks the UUID up in the `roomTypeById` map (with a fallback for
the embedded-object shape in case rGuest ever changes their
mind). After fix: byRoomType correctly distributes across King
Standard / King Studio / Double Queen Standard / Double Queen
Studio with realistic per-bucket counts.

**Bug 3: single-kind classifier under-counted day-uses + in-house.**

`classifyForDate` used to return one of `'arrival'` / `'departure'`
/ `'stayover'` / `null`. A reservation could only be in one
bucket, so a day-use guest (arrival = departure = today) showed
up only as arrival; an INH guest whose arrival was today never
showed up in the in-house count.

Replaced with a multi-flag classifier returning an object:

```js
{
  arrivesToday, departsToday, isStayover, isInHouse, hasRoom
}
```

All call sites updated (KPI counters, byRoomType, byFloor,
perRoomSheet, actionForRoom). Day-uses now correctly bump both
`arrivals` and `departures`; INH-with-today-arrival now correctly
bumps both `arrivals` and `inHouse`. New KPI
`kpis.inHouse` added for the 17.8 mockup's 6-card grid; also
`kpis.remainingArrivals` (RES-with-today-arrival) which matches
rGuest's headline "Remaining Arrivals" widget.

**New payload field: `payload.reservations[]`.**

The 17.8 UI revision needs a per-guest list (mockup images 9 +
10 — "Today's Arrivals" sidebar, "Reservation Details" table).
Built it once during compute and stuck it on the snapshot
payload. Per-row shape:

```js
{
  id, confirmationId, guestName,
  arrivalDate, departureDate, nights,
  roomNumber, roomId, isPreAssigned,
  typeCode, baseLabel, subLabel,
  source,           // ratePlanCode — 'BAR', 'LOCAL', 'WACHA', etc.
  status,           // raw — 'RES' | 'INH' | 'DPT'
  statusLabel,      // pretty — 'Confirmed' | 'Pending' | 'In house' | 'Departed'
  kind,             // 'arrival' | 'departure' | 'stayover' | 'inhouse'
  isDayUse, isEarlyArrival, isRedEye, scheduledForRoomMove,
}
```

`statusLabel` distinguishes `Confirmed` (RES + has roomId, i.e.
pre-assigned by FD) from `Pending` (RES, no roomId yet) — matches
the mockup's two badge variants.

**Diagnostic block added.**

`payload.meta.excludedCount` + `payload.meta.excludedByStatus`
({CXL: 15}) so the admin Settings/History view can show what got
filtered. Helps confirm at a glance whether a number mismatch is
"we excluded the right things" vs "we're missing data."

**Verified against the live recon.** Loaded
`scraper/recon/20260604-141754/requests.jsonl` (100 reservations,
100 rooms, 15 room types) through the new compute fn:
- arrivals 33, departures 31, stayovers 21, inHouse 29
- 15 excluded (all CXL)
- byRoomType: King Standard 16/15/4, Double Queen Studio 3/7/7, etc.
- First 6 reservations match rGuest's UI row-by-row (Nancy
  Aguilar / 322 / WACHA / King Standard / Confirmed, Evan
  Allshouse / 412 / BAR / King Standard / In house, etc.).

**Not touched in this sprint:** UI revision is 17.8 per the
user's "fix data first" call. The existing Forecast page renders
correctly because `kpis.arrivals` etc. still exist; the new
fields are purely additive.

**Files touched:**
- `server/forecast/compute.js` (multi-flag classifier,
  EXCLUDED_STATUSES, statusLabel, fullGuestName, nightsBetween,
  resolveReservationTypeCode helpers, new reservations array on
  payload, new excludedCount/excludedByStatus diagnostics)

**Follow-ups for 17.8:**

- Revise the cards UI per mockup images 9 + 10 — 6 KPI cards,
  per-reservation list with status badges (Confirmed / Pending /
  In house / Departed), filter chips (All / Arrivals /
  Departures / Stayovers / In-house / Checked-out today),
  pre-assignment indicator per row, "Selected Segment"
  drill-down card, "Housekeeping Message Preview" composer.
- Source detection is `ratePlanCode` only right now. The mockup
  shows `Booking.com` / `Expedia` / `Direct` channel labels —
  those probably live in another field (`guestDetails.bookingSource`
  or similar). If a re-recon reveals one, swap in for `source`.

---

### 2026-06-04 — Sprint 17.6: live-test bug-fix pass

First live scrape against rGuest surfaced three real issues. All
fixed.

**1. `PAGE_SIZE_LIMIT_EXCEEDED` on `/reservations/search/date`.**

The 17.1 default was `size: 200`. rGuest enforces `MAX=100` with the
message "Page size must be less than 100" — strict `<`, so 100 also
fails. Dropped the default to **99** in both
`searchReservationsByDate` and `searchAllReservationsByDate`. The
existing pagination walker handles any property with >99
reservations on a single day.

(Body shape `{date, page, size}` confirmed correct — rGuest parsed
the body and only rejected the size value.)

**2. Three duplicate logins per scrape.**

`fetchForecastInputs` called `Promise.all([listRooms, listRoomTypes,
searchAllReservationsByDate])` with no cached token. All three
parallel calls hit `ensureToken()` at the same instant, all three
saw `token === null`, and each kicked off its own `login()` — 3×
the auth traffic per scrape. Fixed by pre-logging-in serially:

```
async function fetchForecastInputs(date) {
  log('info', 'agilysys.scrape.start', { date });
  if (!token) await login();          // ← single login
  const [rooms, roomTypes, reservations] = await Promise.all([...]);
  ...
}
```

The token cache then makes the three parallel data calls cheap.

**3. ISO-string dates rendered raw on the Forecast page + History modal.**

Postgres `DATE` columns serialise as `'2026-06-04T00:00:00.000Z'`
over JSON. Our `fmtDate` helpers in `Forecasting/index.js` and
`ForecastSheet.js` were doing `ymd.split('-').map(Number)` — which
on the ISO string parses the last segment as `'04T00:00:00.000Z'`
→ `NaN` → `Invalid Date`. `ForecastHistory.js` rendered
`{detail.forecast_date}` raw with no formatter.

Fixed three places with the same slice-first pattern:

```
const s = String(val).slice(0, 10);
const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
return m ? new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString(…) : '—';
```

The slice handles both raw `YYYY-MM-DD` (e.g. payload.forecastDate
from compute.js) and ISO timestamps (DB columns).

Added `fmtDateOnly` to `ForecastHistory.js` and applied to the
"Forecast date" meta row.

**Files touched:**
- `server/agilysys/client.js` (size 200→99 in two methods,
  pre-login in `fetchForecastInputs`, comment updates)
- `src/components/Forecasting/index.js` (`fmtDate` slice-safe)
- `src/components/Forecasting/ForecastSheet.js` (`fmtDate` +
  `fmtDateShort` slice-safe via shared `_parseYmd` helper)
- `src/components/Forecasting/ForecastHistory.js` (`fmtDateOnly`
  added, applied to forecast_date meta cell)

**Verified.** Brace + paren balance OK across all 4 files; client
module loads + exposes the same 6 public methods after refactor.

**Next live re-test:** Run scraper → expect a `success` snapshot
this time. If the reservations endpoint takes a different filter
key for the date (we passed `{date}`; rGuest might want
`{startDate, endDate}` or `{businessDate}`), that's the next
candidate. Check the logs view → Errors filter → look at the
`body` field in the http_error context.

---

### 2026-06-04 — Sprint 17.5: forecast settings UI + snapshot history with logs viewer

Closes out the Sprint 17 build arc. Two modals, both reachable from
new "Snapshot history · Forecast settings" text links under the
Forecast page subtitle. Kept as quiet secondary affordances so they
don't fight the primary "Run scraper" / "Generate forecast" buttons
for attention — these are configure-once-revisit-occasionally.

**1. Settings modal — `src/components/Forecasting/ForecastSettings.js`.**

Two tabs:

*Labor constants:*
- `productivity_target` (rooms/attendant/shift, default 6.00) — single
  number input with a help line that documents the formula
  (`ceil(roomsToClean / productivity_target)`).
- `avg_min_per_clean` — 6-cell grid: NKRR / NKJZ / NQRR / NQJZ /
  STAYOVER / DEFAULT, each with its own minute input.
- `dedup_window_minutes` — bumped editable so admins can drop it to
  0 during test runs (skip-dedup) or push it higher in production.
- Single "Save labor settings" button calls `PUT /admin/forecast/config`
  with the dirty values; success surfaces as a green inline banner
  that auto-clears after ~3 s.

*Room-type mapping editor:*
- Lists every `typeCode` the scraper has ever seen, sorted with
  `needs_review` (NULL base_code — unknown prefix) at the top and
  highlighted yellow.
- Per-row inline editors for `base_code` (select from the 4 base
  buckets + "Other"), `sub_label` (free text), `admin_override`
  (checkbox — pins the row so the next scrape's auto-derivation
  doesn't rewrite it).
- Per-row "Save" button enabled only when the row is dirty; calls
  `PUT /admin/forecast/mapping/:code`. The server's canonical
  response replaces the local row.
- Tab badge shows the count of `needs_review` rows so admins notice
  new codes after a scrape without opening the tab.

Intentionally absent: cron-schedule editing. Cron is deferred
(decision §2.2.3) and the DB columns are dormant — surfacing them
in the UI would mislead admins into thinking they wire up cron.

**2. History modal — `src/components/Forecasting/ForecastHistory.js`.**

Master-detail layout:

*Left pane — snapshot list (limit 50, newest first):*
- Status badge (✓ for success, ! for failed).
- Scraped-at time + source ('manual' / 'cron') + KPI shorthand
  (`5A · 3D · 12S` = arrivals/departures/stayovers).
- Click → loads detail.

*Right pane — selected snapshot:*
- Meta strip: scraped_at, forecast_date, source, status pill,
  records_processed, optional error_message.
- KPI grid (auto-fit cards for each kpi key).
- **Logs viewer** — the actual debug surface. Each log entry has:
  - Time, level pill (info=blue / warn=yellow / error=red /
    debug=gray), message.
  - Click expands a JSON `<pre>` of the `context` object if any.
  - Filter chips: All / Warn+ / Errors. Errors-only is the typical
    use case when a snapshot is `status='failed'`.
- Delete button uses the shared `ConfirmModal` with `tone='danger'`.
  After delete: row drops from list, detail clears.

**3. Wired into `Forecasting/index.js`.**

Imports + two state booleans (`settingsOpen`, `historyOpen`). Two
new buttons in a meta-actions row below the subtitle:

```
Scraped from Agilysys rGuest Stay …
Snapshot history · Forecast settings   ← these
```

Both modals open over the existing page; closing either returns to
the unchanged Forecast view.

**4. Shared modal scaffold — `ForecastSettings.css`.**

The `.fc-modal-backdrop` / `.fc-modal` / `.fc-modal-header` / tabs
/ form-row / buttons / pill / banner styles all live here. The
History modal `@import`s this CSS so both modals look identical.
Saves duplication and keeps polish consistent if we tweak modal
chrome later.

Mobile-friendly: at ≤700 px the modals go full-screen
(`height: 100vh; border-radius: 0;`). History's master-detail
switches to a stacked layout at ≤800 px (200 px list strip on top,
detail below).

**Files touched:**
- `src/components/Forecasting/ForecastSettings.js` (new, ~270 lines)
- `src/components/Forecasting/ForecastSettings.css` (new, ~240 lines)
- `src/components/Forecasting/ForecastHistory.js` (new, ~200 lines)
- `src/components/Forecasting/ForecastHistory.css` (new, ~190 lines)
- `src/components/Forecasting/index.js` (imports + state + modals + meta-actions row)
- `src/components/Forecasting/Forecasting.css` (added `.fc-header-meta-actions` block)

**Verified.** Brace + paren balance OK across all three touched JS
files (index.js 164/164, ForecastSettings.js 97/97, ForecastHistory.js
102/102).

**Sprint 17 arc — build done. Live testing + bug fixes next.**

To exercise the whole flow end-to-end:
1. Set `AGILYSYS_USER`, `AGILYSYS_PASS`, `AGILYSYS_TENANT_ID`,
   `AGILYSYS_PROPERTY_ID` in the server env.
2. Click **Forecast** in the admin sidebar.
3. Click **Run scraper** in the top-right.
4. If 4xx on the reservation endpoint: open **Snapshot history**,
   pick the failed row, read the logs — the request shape guess
   from 17.1 (`{date, page, size}` body) is the first thing to
   adjust.
5. Once a successful snapshot lands, **Generate forecast** opens
   the printable sheet; the **Forecast settings** modal lets you
   tune labor numbers + categorize any new typeCodes.

---

### 2026-06-04 — Sprint 17.4: mobile nav refactor + printable Generate Forecast sheet

Paired sprint — both touch the shells / forecasting surfaces.

**1. Mobile bottom nav — 4 + More.**

The bottom nav was rendering every NAV item at all widths. After
17.3 added the Forecast item, admin had 7 mobile tabs and the bar
overflowed. Refactored to the standard 4-primary-+-More pattern.

Each NAV item gets an optional `mobilePrimary: true` flag (added in
both AdminShell and StaffShell). `Sidebar.js` splits the list:
flagged items render in the bottom tab bar; the rest collapse into
a "More" tab that opens a bottom-anchored sheet.

Per-shell:
- **Admin** primary: Home / Calendar / Forecast / More. More sheet:
  Staff, Logbook, Assistant, Settings, theme toggle, Sign out.
- **Staff** primary: Home / Timesheet / Calendar / More. More sheet:
  Settings, theme toggle, Sign out.

UX details:
- "More" tab icon is an **inline 3-dots SVG** (no new PNG required).
  Uses `currentColor` so it matches the active/inactive tab color
  automatically.
- The sheet sits **above** the bottom nav (`bottom: 64px`) so the
  More button stays visible and re-tappable to dismiss. Backdrop
  covers the rest of the viewport.
- Tapping any sheet item closes the sheet and navigates.
- Tapping a primary tab also closes any open More sheet first
  (defensive cleanup if the user reaches around).
- When `currentView` lives in the More set, the More tab gets the
  `.active` class so the user can tell where they are.
- The Calendar unread badge is mirrored on the More tab when
  Calendar lives in the sheet (it doesn't currently for either
  shell, but the logic is in place for future reorderings).
- Animations: backdrop fades in 120ms, sheet slides up from below
  180ms.

Files: `src/components/Layout/Sidebar.js` (split + sheet markup),
`src/components/Layout/Sidebar.css` (new `.more-sheet*` block, all
under the existing 768px media query so desktop is untouched),
`src/shells/AdminShell.js` + `src/shells/StaffShell.js`
(`mobilePrimary` flags added to NAV items).

**2. Printable Housekeeping Forecast sheet.**

The "Generate forecast" button — disabled all of 17.3 — now opens
`<ForecastSheet snapshot={...} />` as a full-screen modal.

The sheet uses the latest snapshot's already-computed `byFloor`
rollup, so no extra API call. Layout:
- Header: "Housekeeping Forecast", property name, full date,
  inline 5-stat strip (Arrivals / Departures / Stayovers / To
  clean / Attendants).
- Per floor: section header with floor label + room count + clean
  count, then a 7-column table (Room / Type / OCC-VAC / HK Status
  / Action / Checkout / Guest).
- Footer: totals strip + "Generated by HotelOps + timestamp".

Visual cues for scanning:
- OCC/VAC chips are color-coded (red OCC, green VAC).
- Action rows tinted (warm peach for check-out cleans, cool blue
  for stayover service, muted gray for none-action rows).

**Print pipeline.**

Pure CSS via `@media print`:
```
body * { visibility: hidden !important; }
.fc-sheet, .fc-sheet * { visibility: visible !important; }
```
Combined with `position: static` on the backdrop and modal scaffold
(to strip them from the flow), this gets only the sheet content
onto paper. Controls bar (Print + Close buttons) is hidden via
`display: none`. `@page { size: letter; margin: 0.5in; }` sets
the paper size. Each `.fc-sheet-floor` uses `page-break-inside:
avoid` to keep a floor's table together when possible.

Modal scaffold:
- Backdrop click → close.
- Esc key → close (parity with `ConfirmModal`).
- Print button → `window.print()`.
- Close button → close.

Wired into `Forecasting/index.js`: import + `sheetOpen` state +
flipped `generateDisabled = !snapshot` (was a hardcoded `true`
flag pointing at this sprint). Both Generate buttons (header and
right-rail) now enable as soon as a snapshot loads, and both open
the same modal.

Files: `src/components/Forecasting/ForecastSheet.js` (new, ~160 lines),
`src/components/Forecasting/ForecastSheet.css` (new, ~200 lines),
`src/components/Forecasting/index.js` (import + state + render +
button title updates).

**Verified.** Brace + paren balance OK across all 5 touched JS
files (index.js 158/158, ForecastSheet.js 55/55, AdminShell 24/24,
StaffShell 47/47, Sidebar 85/85). Still batching live verification
to end of sprint per the user's preference.

**Follow-ups:**

- **17.5** (next): forecast settings UI (productivity, avg min,
  room-type mapping editor) + snapshot history table with the per-
  run logs viewer. Closes out the Sprint 17 arc — at that point
  the user does the live end-to-end test.

---

### 2026-06-04 — Sprint 17.3: admin Forecast page (desktop mockup)

The backend's been ready since 17.2; this sprint puts a face on it.
Replaces the `ComingSoon` stub at
`src/components/Forecasting/index.js` with the desktop mockup the
user signed off on, minus the "Labor Plan by Shift" table that was
dropped from scope when cron was deferred.

**1. Page — `src/components/Forecasting/index.js`.**

One file, inline sub-components (KpiCard, ByCleaningTable,
ByRoomTypeTable, ByFloorTable, ScraperOutputCard, DispatchSummaryCard,
SendoutCard, DonutLegend). Matches AdminHome's "one folder per page,
sub-pieces inline" pattern instead of fragmenting into 8 files.

Data flow:
- Mount → `GET /api/admin/forecast/snapshots/latest` → render.
- "⟳ Run scraper" header button → `POST /api/admin/forecast/scrape`
  with `{}` body, replaces state with the returned snapshot.
- Three-way table toggle (`'cleaning' | 'room' | 'floor'`) decides
  which sub-component renders.

Three states beyond the happy path:
- **Loading** (initial fetch) — quiet centered message.
- **Empty** (no snapshot ever) — large empty card with a nudge to
  hit Run scraper.
- **Error** (network or scrape failed) — red banner above the body.

The **by-floor view** is the operational one (HK assignment unit at
Snoqualmie). Each floor row is clickable; expanding it reveals a
per-room list with room#, base+sub type, color-coded HK status pill,
and the computed action (`Check-out clean` / `Stayover service` / `—`).
This is what 17.4's printable sheet renders into HTML/print CSS.

**Generate Forecast button** is in the page but disabled with a
tooltip pointing at 17.4. Flipping `generateDisabled = !snapshot`
when 17.4 ships is the only change needed there.

**2. Styles — `src/components/Forecasting/Forecasting.css`.**

`fc-` prefix throughout. Reads from `theme.css` custom properties
(`--bg-surface`, `--brand-text`, `--success-bg`, etc.) so dark mode
inherits without any extra rules. ~370 lines.

KPI cards use accent backgrounds keyed off the metric kind (purple
for arrivals, orange for departures, green for stayovers, blue for
clean count, yellow for staffing). The HK status pills (D/PU/VI/IP)
map to danger/warn/success/accent backgrounds.

The "donut" is **CSS-only**: a thick ring with the total in the
center + a legend with colored dots + percentages. No charting
library added. If real arc rendering becomes important later, swap
the ring for a tiny SVG without touching the legend.

Mobile breakpoint at 900px: KPI cards drop to a 2-col grid, the
main + right rail collapse to single column. Real mobile redesign
is 17.4's separate work — this is just "doesn't look broken on a
small browser window."

**3. Wired into `AdminShell.js`.**

Added `Forecasting` import, a `{ view: 'forecast', label: 'Forecast',
icon: 'calendar', live: true }` NAV entry between Calendar and
Logbook, and `forecast: Forecasting` in the VIEWS map. Uses the
`calendar` icon as a placeholder until `/public/logo/forecast.png`
ships — flagged with an inline comment.

**Files touched:**
- `src/components/Forecasting/index.js` (replaced ComingSoon stub
  with ~330-line full page)
- `src/components/Forecasting/Forecasting.css` (new, ~370 lines)
- `src/shells/AdminShell.js` (import + NAV entry + VIEWS entry)

**Verified.** Brace + paren balance OK in both edited JS files.
Did NOT run `npm run build` — the user is batching all live testing
for end-of-sprint per their preference.

**Follow-ups:**

- Need `/public/logo/forecast.png` to retire the temporary `calendar`
  icon. Cosmetic; doesn't block functionality.
- **17.4** (next, paired): mobile bottom-nav refactor (4 + More
  pattern) + Generate Forecast printable sheet. Both touch the
  same shells/nav surface area.
- The Sidebar component currently renders all NAV items at all
  widths — with 7 items now (added Forecast), the mobile bottom
  nav is already at risk of overflow. 17.4 fixes this.

---

### 2026-06-04 — Sprint 17.2: forecast compute + scrape endpoints

Builds on 17.1's client. Two pieces: a pure compute fn that turns
raw rGuest output into the snapshot payload, and a small REST surface
that admins use to trigger / inspect / edit it.

**1. Compute — `server/forecast/compute.js`.**

`computeForecast({ rooms, roomTypes, reservations, roomTypeMapping,
config, forecastDate })` → snapshot payload. No I/O, no DB; fully
testable. Lookup tables for HK statuses (D/PU/VI/IP) and the 4 base
buckets (NKRR/NKJZ/NQRR/NQJZ) live in this file as constants.

Reservation classification: for the forecast date, each reservation
is one of `arrival` (arrives today), `departure` (departs today and
arrived earlier), `stayover` (in-house through today), or filtered
out. Same-day arrival+departure counts as `arrival` since the room
still needs prep.

Cleaning logic:
- `checkoutClean` ← rooms with a `departure` today (full turn before
  the next guest)
- `stayoverService` ← rooms with a `stayover` (light touch-up)
- arrivals don't generate a clean (the room got cleaned by whoever
  just departed it)

Output shape (also documented in compute.js's main function comment):
`{ forecastDate, generatedAt, kpis, byCleaningType, byRoomType,
byFloor, perRoomSheet, dispatchSummary, scraperOutput, newMappings,
meta }`. The Forecast page reads from this directly.

Auto-onboarding: any rGuest `typeCode` not yet in the mapping table
gets a derived mapping pushed into `payload.newMappings` for the
orchestration layer to upsert. The derivation uses `typeCode.slice(0,4)`
as base + the rest as suffix; unknown bases keep `base_code=null` so
they surface in the admin "needs review" filter.

**Smoke test passed** with a 4-room, 4-reservation fixture: KPIs
correct (1/1/1 arrivals/departures/stayovers, 2 to clean,
ceil(2/6)=1 attendant), NKRRA auto-derived as "King Standard /
Accessible", floor grouping correct, off-window reservation (future
arrival) correctly filtered.

**2. Orchestration — `server/forecast/runScrape.js`.**

Single entry point: `runScrape({ pool, source, triggeredBy,
forecastDate? })`. Sequence:
1. Load `forecast_config` + `room_type_mapping` from DB.
2. `createAgilysysClient()` → `client.fetchForecastInputs(date)`.
3. `computeForecast(...)`.
4. Upsert any new typeCodes (`ON CONFLICT DO NOTHING` so admin
   overrides are never clobbered).
5. SHA256-hash a normalized payload (strips `generatedAt`, keeps
   forecastDate + KPIs + per-room action/status/reservation refs).
6. Look for a `status='success'` snapshot with same hash inside
   `dedup_window_minutes` (default 60); if found, return it as-is
   with a `deduped: true` flag.
7. Otherwise insert a fresh `forecast_snapshot` row with the
   client's structured logs in the `logs` JSONB column.

On any error, inserts a `status='failed'` snapshot row with the
error message + partial logs, then re-throws so the route handler
also returns 500. Failures surface in the admin history view.

`todayInLA()` helper uses `Intl.DateTimeFormat` so we don't pull a
tz library — Snoqualmie's local date is the default when no
`forecastDate` is passed.

**3. Routes added to `server.js` (above the React static-file block).**

All admin-only (`requireAuth, requireRole('admin')`). Admin trigger
sets `triggered_by = NULL` because admins aren't in `users` (the FK
constraint would reject a username string).

- `POST /api/admin/forecast/scrape` — manual run; body
  `{ forecastDate? }`.
- `GET  /api/admin/forecast/snapshots?limit&offset&date` — lean
  list (KPIs only, not full payload).
- `GET  /api/admin/forecast/snapshots/latest?date` — most recent
  `status='success'` for the date (defaults today).
- `GET  /api/admin/forecast/snapshots/:id` — full snapshot + logs.
- `DELETE /api/admin/forecast/snapshots/:id` — hard delete (admin
  cleanup affordance).
- `GET  /api/admin/forecast/config` / `PUT` — read + update.
  PUT only allows `productivity_target`, `avg_min_per_clean`,
  `dedup_window_minutes`. Cron columns intentionally not editable
  here (deferred).
- `GET  /api/admin/forecast/mapping` — sorted with `needs_review`
  (NULL base_code) rows first.
- `PUT  /api/admin/forecast/mapping/:code` — override a row. Can
  set `admin_override=TRUE` to pin against future auto-rewrites.

UUID validation via inline regex on `:id` so an invalid string
returns 400 instead of pg's noisy 22P02.

**Files touched:**
- `server/forecast/compute.js` (new, ~320 lines)
- `server/forecast/runScrape.js` (new, ~170 lines)
- `server/server.js` (added require + ~180 lines of routes before
  the static-frontend block; existing routes untouched)

**Notes:**

- The reservation search request body shape `{date, page, size}` is
  still the educated guess from 17.1 — the first live `POST /scrape`
  is when we'll find out if rGuest accepts it. If `agilysys.call`
  returns 4xx from the reservations endpoint, swap the body shape.
- Admins trigger with `triggered_by=NULL`. The admin username is
  visible in the snapshot's `logs` JSONB if we ever need an audit
  trail. Not exposing it as a column to avoid a schema change.

**Follow-ups:**

- **17.3** (next): admin Forecast page. Replace
  `src/components/Forecasting/index.js` (currently `<ComingSoon>`)
  with the desktop mockup: 5 KPI cards, by-cleaning-type /
  by-room-type / **by-floor** toggle table, scraper output card,
  dispatch summary card, Run Scraper button (calls the endpoint
  above), Generate Forecast button (stub until 17.4), donut chart.

---

### 2026-06-04 — Sprint 17.1: DB migration 024 + rGuest API client

Foundation for the FD forecast feature. Two pieces, both backend-only,
both fully independent of UI work — so they could ship before any
React was touched.

**1. Migration 024 — `database/migrations/024_sprint17_forecast.sql`.**

Dropped the unused placeholder `forecasts` and `room_types` tables
(row-per-date model with `Standard/Deluxe/Suite/King` seeds — never
referenced in code, confirmed by `grep -rn` across server/src). The
Sprint 17 model is snapshot-based, not row-per-date, so the old shape
was the wrong abstraction anyway.

Added three new tables:

- `room_type_mapping` — Agilysys `typeCode` → display bucket. Each
  row carries `base_code` (the 4-char prefix: NKRR/NKJZ/NQRR/NQJZ),
  `sub_suffix` (A/P/D/G/B/…), display labels for both, and an
  `admin_override` boolean. New typeCodes auto-insert on first
  scrape unless the row is pinned. Seeded with the 4 base codes
  so the UI renders sensibly even before the first scrape lands.
- `forecast_config` — singleton row (CHECK config_id = 1).
  Holds `cron_schedules` (JSONB array of cron exprs, default
  `["30 5 * * *", "0 11 * * *"]`), `cron_timezone`,
  `productivity_target` (default 6.00 rooms/attendant/shift),
  `avg_min_per_clean` (JSONB per-base-code map), and
  `dedup_window_minutes` (60). **Deliberately no
  `shift_definitions` column** — the GM clarified the forecast
  is room-driven, not shift-window-driven; cron runs whenever,
  shift schedules live elsewhere.
- `forecast_snapshot` — one row per scrape. JSONB `payload`,
  CHAR(64) `payload_hash` (SHA256 of normalized payload), JSONB
  `logs`, `source` (`manual` | `cron`), `triggered_by`, `status`,
  `error_message`. Three indexes: by date, by hash (for dedup
  lookup), by status.

`schema.sql` synced in tandem so fresh DB installs get the new shape
without needing to apply 024 on top of the old. User applied 024 to
the Koyeb DB during this session.

**2. rGuest API client — `server/agilysys/client.js`.**

Factory pattern: `createAgilysysClient(overrides?)` returns a fresh
client with its own log buffer. The buffer is structured (level /
message / context / timestamp) and ends up in
`forecast_snapshot.logs` so the admin "view raw output" panel has
real per-step debug info.

Endpoints exposed:

- `login()` — `POST /auth-service/auth/tenants/{tid}/users/login`
  returns `{token}`. Token cached in closure.
- `listRooms()` — `GET /property-service/.../config/rooms`.
- `listRoomTypes()` — `GET /property-service/.../config/roomTypes`.
- `searchReservationsByDate(date, {page, size})` —
  `POST /reservation-service/v2/.../reservations/search/date`.
- `searchAllReservationsByDate(date)` — paginates the above.
- `fetchForecastInputs(date)` — fires rooms / roomTypes /
  reservations in parallel. Single entry point the scrape endpoint
  will call.

All non-login calls go through `call(method, path, body)` which sets
`x-token`, accepts JSON, and on 401 transparently re-logs-in once
and retries — covers the cookie-less token-expiry case without
requiring callers to think about it.

**Reservation request body is a guess.** The recon logged response
bodies but not request bodies (oversight in the logger), so the
body shape `{date, page, size}` is the most common Spring search
pattern but unverified. If a first-run scrape returns empty or 4xx
on this endpoint, swap the body shape (maybe pagination is
query-params, maybe the date filter has a different key).
Comment in the source flags this.

**Convenience exposures.** `_getToken()` and `_config` are exported
for tests / introspection but app code should not rely on them.

**Env vars.** `server/.env.example` updated with `AGILYSYS_USER`,
`AGILYSYS_PASS`, `AGILYSYS_TENANT_ID` (default 1566), and
`AGILYSYS_PROPERTY_ID` (default 481). No real values committed.
(Originally also added `CRON_SECRET` for an auto-scrape endpoint;
removed when cron was deferred — see decision §2.2.3.)

**Node version.** Node 20.x (per server/package.json engines field) →
`fetch` is built-in. No new dependency added.

**Verified.** `node -e` round-trip loads the module cleanly, all
exported names present, config defaults resolve correctly.

**Files touched:**
- `database/migrations/024_sprint17_forecast.sql` (new)
- `database/schema.sql` (drop old forecast/room_types, add 3 new)
- `server/agilysys/client.js` (new, ~200 lines)
- `server/.env.example` (4 new vars + 1 CRON_SECRET)
- `claude-instructions/part4.md` (new — roadmap + this entry)
- `claude-instructions.md` (index updated to include part3 + part4)

**Follow-ups:**

- **17.2** (next): pure forecast compute fn (`server/forecast/compute.js`)
  that takes the client output + room_type_mapping + forecast_config
  and produces the snapshot payload (KPI counts, by-cleaning-type /
  by-room-type / by-floor rollups, per-room sheet, dispatch summary).
  Then `/api/admin/forecast/*` endpoints to expose it.
- Re-verify the reservation search body shape against the live API
  once the scrape endpoint lands (17.2).
- The recon scraper at `scraper/agilysys_recon.py` should learn
  to log request bodies too, so the next API change doesn't leave
  us guessing.

---

<!-- Append new sprint entries above this line, newest first. -->
