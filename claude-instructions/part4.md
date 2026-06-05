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

### 2026-06-05 — Sprint 17.16: dedupe reservations, drop the mismatch banner, click-to-expand variant rows

User shared a diagnostics dump showing the persistent ~4 arrival
gap (rGuest's 22 vs our 26) is `RES arr=today` x 26 in the
status×date matrix. Combined with the NKRRP "1 vacant clean"
mystery (user verified only 2 NKRRP rooms exist in rGuest and
both are OCC), there are two unresolved questions: where the 4
extras come from, and which specific room our code thinks is a
vacant NKRRP.

**1. Dedupe by `reservation.id` before classifying for arrivals.**

The /search/date endpoint returns 2129 rows total. rGuest's
metrics widget appears to dedupe (a master reservation + its
group children, or duplicate join rows from the search result)
before counting "remaining arrivals". We weren't deduping at
all, which is the leading hypothesis for the +4 over-count.

```js
const seenResIds = new Set();
for (const r of payload.reservations || []) {
  recordLabels(r);
  if (r.id) {
    if (seenResIds.has(r.id)) continue;
    seenResIds.add(r.id);
  }
  if (r.typeCode && r.kind === 'arrival' && r.status === 'RES') {
    arrivalsByType.set(r.typeCode, …);
  }
}
```

If the gap closes after this, dedup was the cause. If not, the
extras are real RES records with a status sub-flag we're not
checking — diagnosable only with raw payload access.

**2. Dropped the yellow mismatch banner per user feedback.**

The 17.15 banner was confusing the user ("there are NO 26"). The
top-stat uses rGuest's authoritative count (correct); the
per-type sum may diverge slightly post-dedupe but isn't surfaced
visually now. Quiet wins over noisy.

**3. Click-to-expand variant rows — debugs NKRRP-style mysteries.**

Each subtype row in the Need-by-Room-Type table is now
clickable. Clicking opens a detail row below that lists every
physical room of that typeCode as a chip:

```
[ G28  OCC  Dirty ]   [ 122  OCC  Dirty ]   [ 309  VAC  Vacant Inspected ]
```

Chips for `VAC + (VI || PU)` rooms get a soft green highlight so
"vacant clean" rooms pop. Click NKRRP, see exactly which rooms
we think are vacant clean — settles the question instantly:
- 2 chips, both OCC → user was right; we have a stale-status
  bug to chase via `config/rooms`.
- 3 chips, one VAC → there's a third NKRRP the user missed in
  rGuest's paginated HK Condition page.

Wiring: new `roomsByType` Map built in the page component
(`roomsByType[typeCode] = perRoomSheet[]`), passed into
`NeedTable` as a prop. `NeedTable` keeps a single `openType`
state — only one detail row open at a time (prevents the table
from sprawling). Caret on the variant row flips ▾/└ to indicate
state.

**Files touched:**
- `src/components/Forecast/index.js` — id-dedup loop, dropped
  banner JSX, `NeedTable` becomes a real component (was an
  arrow expression), accepts `roomsByType` prop, click handler
  + detail-row renderer, `roomsByType` `useMemo` on the page.
- `src/components/Forecast/Forecast.css` — `.fb-clickable`
  hover/open states, `.fb-detail-row` background, `.fb-detail-grid`
  flex wrap for room chips, `.fb-room-chip` chip styling,
  `.fb-room-clean` green highlight, `.fb-room-stat` pill.

**Verified.** Brace + paren balance OK (240/240, 297/297;
css 142/142).

**Action needed from user:** Re-sync, expand NKRRP. Share what
the detail row shows (specifically the room numbers + statuses).
If you see G28 + 122 only and our "Vacant Clean: 1" is still
showing, dump the raw payload from "Raw scraper output" so I
can look at the specific perRoomSheet entries. If you see 3
chips, mystery solved.

---

### 2026-06-05 — Sprint 17.15: PU = clean, Total Rooms column, metrics-backed top arrival count

Three fixes to the Forecast page based on user testing.

**1. Pickup (PU) status now counts as vacant-clean.**

The user clarified: when a room is `PU - Pickup` it means HK has
finished cleaning and it's waiting for FD inspection before flipping
to `VI - Vacant Inspected`. Operationally those rooms are *ready
to sell* — they were unnecessarily excluded from "vacant clean"
before, which under-reported supply.

`isVacantClean` in `computeNeedTree`:
```js
// before
occ === 'VAC' && hk === 'VI'
// after
occ === 'VAC' && (hk === 'VI' || hk === 'PU')
```

**2. New "Total Rooms" column.**

Lets the FD verify counts directly: an NKRRP row that says
"Total: 2, Vacant Clean: 1" plus knowing both physical NKRRP
rooms are occupied = data bug we need to look at; "Total: 3"
= "I missed a room in rGuest's paginated UI." The user's
specific NKRRP=1-vacant-clean question gets answered at a
glance.

`totalByType` map built alongside `vacantByType` in the same
pass over `perRoomSheet`. Wired through `variants` and
`g.totals.totalRooms`. Table now has 8 columns
(`colSpan` updated on the empty-state row).

**3. Top "Remaining arrivals" stat now uses rGuest's metric
when available.**

The user reported "Reservations shows 23 check-ins; Forecast
shows 20 remaining arrivals." Reservations reads
`metrics.remainingArrivalsSummary.remaining` (rGuest
authoritative); Forecast was summing per-type derived RES
counts. The two can disagree when a reservation:
- has an unmapped room type (we skip it in the per-type
  bucketing) ;
- carries an exotic status code (e.g. PND, RLS — we treat as
  non-arrival) ;
- is a walk-in that rGuest counts but isn't in the
  /search/date payload.

Forecast top stat now reads from `metricsSnapshot` first, falls
back to the derived sum. The per-type rows still show the
derived value (we can't break it down without that data).

**Visible breakdown-mismatch notice** between the stats strip
and the table:

> rGuest reports **23** remaining arrivals across the property,
> but our per-type breakdown sums to **20**. Gap of **3** may be
> walk-ins, reservations with unmapped/unknown room types, or
> status codes we haven't seen before.

Yellow warn-bg banner, shows only when the two disagree. Both
pages now match on the headline; the FD sees that the per-type
breakdown is best-effort but is explicit about why.

**Files touched:**
- `src/components/Forecast/index.js` — `isVacantClean` helper,
  `totalByType` map, `totalRooms` on variants + group totals,
  Total Rooms column in `NeedTable`, mismatch notice block,
  `totals` memo now also computes `derivedArrivals` +
  `metricRemaining` for the gap calc.
- `src/components/Forecast/Forecast.css` — `.fb-cell-total`
  (muted color for the new column), `.fb-mismatch-note` banner
  style.

**Verified.** Brace + paren balance OK (221/221, 266/266).

**Not in scope yet (follow-ups):**

- The NKRRP=1-vacant-clean question is a data verification
  story now that Total Rooms is visible. If it shows
  `Total: 2, Vacant Clean: 1` we need to look at the
  `perRoomSheet` row for that 1 room (almost certainly will
  show a third NKRRP the user didn't notice in rGuest's
  paginated HK Condition page, but if not it points at stale
  inventory data).
- The 3-arrival gap should be diagnosable now too — open
  Snapshot history → latest → Diagnostics, look for any RES
  arrivals with a typeCode we don't have a `room_type_mapping`
  row for.

---

### 2026-06-05 — Sprint 17.14: align scrape date with rGuest's property day (fixes Reservations ↔ Forecast mismatch)

Live test at 12:08 AM showed the two pages disagreeing about
basic numbers. Reservations: "Arrivals 3 of 39 not yet arrived"
(from `metrics.remainingArrivalsSummary.remaining`). Forecast:
"Remaining arrivals 18" (derived from `reservations[] where
status === 'RES' && kind === 'arrival'`). Same snapshot, 6×
disagreement.

**Root cause: date mismatch between our local clock and rGuest's
business day.**

At 12:08 AM PT on Jun 5, `todayInLA()` returns `'2026-06-05'`.
But the property hasn't done its day-roll yet (rGuest day-rolls
some time around 3–4 AM), so rGuest's dashboard widgets are
*still* operating on Jun 4. The Reservations KPI reads
`metrics.remainingArrivalsSummary.remaining` which is rGuest's
Jun 4 number (3); the Forecast page derives against
`forecastDate=Jun 5` which picks up the 18 RES bookings for the
**next** business day (Jun 5) — all "pending" because none of
those Jun 5 guests have arrived yet (it's still mid-Jun-4
operationally).

Both numbers are internally self-consistent for their own
denominator; they disagree because they're for different days.

**The fix — `propertyDate` is the source of truth.**

rGuest exposes `GET
/property-service/tenants/{tid}/properties/{pid}/propertyDate`
that returns a bare string (`"2026-06-04"`). That's the
property's current business day. When we use it as our scrape's
`forecastDate`, our derived counts and rGuest's metrics widgets
share a denominator.

**Wiring** (3 files):

`server/agilysys/client.js`:
- New `getPropertyDate()` exported from the factory. Returns the
  bare string or null (defensive parse against `{date}` object
  shape too).
- `fetchForecastInputs(requestedDate)` now resolves an
  `effectiveDate`:
  ```
  const propertyDate = await getPropertyDate();
  const effectiveDate = requestedDate || propertyDate;
  ```
  All four parallel calls (rooms / roomTypes / reservations /
  metrics) use `effectiveDate`, and the result object includes
  `{ propertyDate, effectiveDate }` so the orchestration layer
  knows what was actually used.

`server/forecast/runScrape.js`:
- `effectiveDate` hoisted to the top-level let so both the
  success path and the catch-block failure record can use it.
- Passes `forecastDate || null` to `fetchForecastInputs` —
  `null` lets the client default to rGuest's propertyDate.
- After `await`, reassigns `effectiveDate` from
  `inputs.effectiveDate`; falls back through `forecastDate` then
  `todayInLA()` only if everything upstream failed.
- `computeForecast({ forecastDate: effectiveDate })` and the DB
  insert's `forecast_date` both use the resolved date.
- Failure-record `forecast_date` uses the best-available
  fallback chain.

**Operational effect.** From 12:08 AM scrape:
- propertyDate = `"2026-06-04"` (rGuest's view)
- forecastDate = `"2026-06-04"` (our compute)
- searchReservationsByDate(`"2026-06-04"`) ← Jun 4-affecting
- getReservationMetrics(`"2026-06-04"`) ← Jun 4 dashboard
- `_meta.arrivesToday = (arrivalDateLocalDate === "2026-06-04")`
- → Forecast page's "Remaining arrivals" drops from 18 → **3**
- → matches Reservations KPI; matches rGuest UI

Once rGuest does its day-roll (~3–4 AM), the next sync returns
propertyDate `"2026-06-05"` and everything moves over together.

**Files touched:**
- `server/agilysys/client.js` — `getPropertyDate` + reworked
  `fetchForecastInputs`.
- `server/forecast/runScrape.js` — hoisted `effectiveDate`,
  passes `null` through to let the client choose, success +
  failure inserts both use the resolved date.

**Verified.** Brace + paren balance OK across both files
(85/85, 42/42). `getPropertyDate` is on the exported surface;
module loads cleanly; the existing recon shows
`'2026-06-04'` as the returned shape.

**Follow-ups:**

- The previous snapshot stored with `forecast_date='2026-06-05'`
  is now stale relative to the new scrapes' `'2026-06-04'`. No
  data corruption; subsequent scrapes will use the right date
  going forward. Old snapshot can be deleted from History if
  the user wants a clean list.
- If `propertyDate` endpoint ever 500s, the client falls back
  to whatever the caller passed (or eventually `todayInLA()`
  via runScrape). The fallback should never silently mismatch
  again, but worth a Datadog-style sanity log entry if
  `propertyDate === null` happens in prod.

---

### 2026-06-05 — Sprint 17.13: forecast counted all today's arrivals, not just remaining

Live test surfaced the math error. Reservations page (correct):
"Arrivals 4 of 39 not yet arrived". Forecast page (wrong):
showed NKRR at 17 arrivals vs 1 vacant — 16 short. Cause: the
Forecast was using `kind === 'arrival'` for demand without
filtering by status, so it counted everyone arriving today
including the 35 already-checked-in guests who were already in
their rooms.

**The conceptual bug:** an already-checked-in arrival is no
longer demand. Their room is already OCC and *not* in the
VAC+VI supply we're comparing against. Counting them as demand
was effectively asking "do we have rooms for guests we've
already housed?" — which always under-reports availability.

**The fix** in `computeNeedTree` (`server-less, pure compute,
in src/components/Forecast/index.js`):

```js
// before
if (r.typeCode && r.kind === 'arrival') {
  arrivalsByType.set(r.typeCode, …);
}
// after
if (r.typeCode && r.kind === 'arrival' && r.status === 'RES') {
  arrivalsByType.set(r.typeCode, …);
}
```

Matches the Reservations page semantics: arrivals = RES status
(not yet checked in). INH-with-arrival-today are excluded —
they're already in their rooms.

**Label sweep** so the page is honest about what it's counting:
- Top stat card "Total arrivals" → **"Remaining arrivals"**.
- Need-by-Room-Type column header "Arrivals" →
  **"Remaining Arrivals"** with a `title` tooltip ("Guests not
  yet checked in").
- Forecast formula tooltip now reads `Vacant Clean − Remaining
  Arrivals = Net Balance` with a clarifying note that
  already-checked-in guests are excluded because their rooms
  are already OCC.
- ForecastSummaryCard chart title + legend → "Vacant Clean vs
  **Remaining Arrivals**" / "Remaining Arrivals" key.

**Verified against the recon** (14:17 snapshot, 33 arrivals
total): RES-only count = 31, INH-today = 2 → 33 total, matches
expectation. For the user's 23:56 snapshot the headline drops
from 39 to 4 — the operational truth for "how many rooms do we
still need tonight."

**Files touched:**
- `src/components/Forecast/index.js` — RES-only filter in
  `computeNeedTree`, label updates in `StatBar`, `NeedTable`,
  `ForecastSummaryCard`, formula tooltip.

**Verified.** Brace balance OK (213/213, 246/246).

**Follow-ups:**

- Pre-assigned-vs-unassigned isn't yet considered. A VAC+VI
  room that's already earmarked for a RES guest tonight is
  "spoken for" in real life — but our supply count still
  includes it. The current math is still self-consistent: that
  room counts as supply, that guest counts as demand, they
  match. Worth a closer look if the FD wants to filter "rooms
  unassigned + unassigned arrivals" specifically.
- Some rooms might also be at "VAC + PU" (vacant pickup-clean
  needed) — currently excluded from supply. If HK reliably
  clears those before tonight, they could count as available.
  Loosening this is a forecast-policy choice; flag as TBD.

---

### 2026-06-04 — Sprint 17.12: Forecast page polish — sync-only, generate forecast moved over, subtypes under generics

Five items off the user's punch list. Forecast page is the
target; Reservations only loses the Generate Forecast affordance.

**1. Removed Send to housekeeping button.** That button belongs to
the handoff/Reservations workflow, not the room-availability
projection. `HkMessageCard` component and `buildHkMessage()`
helper deleted from the Forecast page.

**2. Removed Housekeeping Message Preview card.** Same reasoning —
not a forecast deliverable.

**3. Sync arrivals no longer triggers a new scrape.** The button
is now read-only: it re-fetches the latest snapshot via `GET
/admin/forecast/snapshots/latest`. Renamed local state
`scraping` → `syncing` to reflect that. Title attribute spells
out that scrapes still happen on the Reservations page. Both
pages always render from the same persisted snapshot.

**4. Generate Forecast moved Reservations → Forecast.**

- Reservations (`Forecasting/index.js`):
  - `ForecastSheet` import dropped.
  - `sheetOpen` state + `handleGenerate` + `generateDisabled` dropped.
  - Header "Generate forecast" button removed.
  - Right-rail `SendoutCard` removed.
  - `<ForecastSheet>` modal mount removed.
  - `HousekeepingMessagePreview` kept (still serves the
    Reservations / FD audience — different from the Forecast page).
- Forecast (`Forecast/index.js`):
  - `ForecastSheet` imported from `../Forecasting/ForecastSheet`.
  - New `sheetOpen` state.
  - "Generate forecast" button wires to `setSheetOpen(true)`,
    disabled until a snapshot exists.
  - `<ForecastSheet snapshot={snapshot} onClose={…} />` mount
    added at the bottom of the page.

**5. Need-by-Room-Type now shows subtypes under each generic.**

`computeNeedRows` → **`computeNeedTree`**. Replaces the flat
list keyed by 4-char base code with a 2-level structure:

```
groups: [
  {
    baseCode: 'NKRR', baseLabel: 'King Standard',
    totals: { vacantClean, arrivals, netBalance, roomsNeeded, status },
    variants: [
      { typeCode: 'NKRR',  subLabel: 'Standard',                 vacantClean, arrivals, … },
      { typeCode: 'NKRRA', subLabel: 'Accessible',               … },
      { typeCode: 'NKRRP', subLabel: 'Pets',                     … },
      { typeCode: 'NKRRD', subLabel: 'Hearing Accessible / ADA Tub', … },
      …
    ]
  },
  …
]
```

**Counts.** Per-typeCode `vacantClean` is `perRoomSheet.filter(r
=> r.typeCode === code && r.occupancyStatus === 'VAC' && r.hkStatus
=== 'VI').length`. Per-typeCode `arrivals` is
`reservations.filter(r => r.typeCode === code && r.kind ===
'arrival').length`. Variant rows show those exact counts (`netBalance =
vacantClean - arrivals`).

**Substitutability** baked into group totals only. A NKRR
reservation can be fulfilled by NKRRA / NKRRP rooms (the guest
didn't ask for accessible), so group-level `roomsNeeded` is
`max(0, sum(arrivals) − sum(vacantClean))` across all variants
in the base. A NKRRA reservation can only be served by NKRRA →
the variant row shows the specific shortage; this also drives a
new "can't be substituted" operational note for guests who
booked a subtype that's short.

**Render.** `NeedTable` switched to a tree render. Each group
emits a header row (bold base code in a navy chip + base label +
"all subtypes" subtitle + aggregated stats) followed by indented
variant rows (└ + monospace typeCode + sub label). Group rows
get a heavier top border + soft accent background; variant rows
sit lighter and smaller.

**Group order:** NKRR → NKJZ → NQRR → NQJZ → Other (anything
that didn't match a known base).

**ForecastSummaryCard** also rewritten to take `groups` and roll
totals up per group both in the list (left) and bar chart
(right).

**`deriveOperationalNotes`** now consumes groups too:
- Category-level shortages bubble up as one consolidated
  "Prioritize clean turns" note (with each baseCode + count).
- Within an otherwise-fine group, a short subtype gets its own
  urgent note ("NKRRA (Accessible) is short 2 — can't substitute
  another type").
- Surplus per group still surfaces.
- Trailing reminder to confirm late check-ins stays.

**Top stats** (`totalRoomsNeeded`, `totalVacantClean`,
`totalArrivals`, `deficitTypes`, `surplusTypes`) read from group
totals — `deficitTypes` is the count of groups whose totals are
short (not the count of short variants), keeping the headline
honest about substitutability.

**Sync button stabilized.** Added the same icon-slot lock
(`width:16px / height:16px / flex-shrink:0`) we did for
Reservations in 17.10 so the button doesn't jump width when the
label flips between "Sync arrivals" and "Syncing…".

**Files touched:**
- `src/components/Forecast/index.js` — new `computeNeedTree`,
  rewritten `NeedTable`, rewritten `ForecastSummaryCard`,
  rewritten `deriveOperationalNotes`, new `handleSync` replacing
  `handleScrape`, `ForecastSheet` import + sheetOpen state,
  removed `HkMessageCard` + `buildHkMessage`, empty-state copy
  points the user back to Reservations.
- `src/components/Forecast/Forecast.css` — group-row /
  variant-row styles, `.fb-empty-link`, `.fb-btn > svg` size
  lock.
- `src/components/Forecasting/index.js` — removed
  `ForecastSheet` import, `sheetOpen` state, `handleGenerate`,
  `generateDisabled`, the Generate Forecast button, the
  `SendoutCard` from the right rail, and the `<ForecastSheet>`
  modal mount.

**Verified.** Brace balance OK across all 3 touched JS files.

**Follow-ups for 17.13:**

- Substitutability math currently is symmetric on group totals
  ("sum supply − sum demand"). A more rigorous version would
  first satisfy specific-subtype demand from its own pool, then
  spill leftover specific supply into generic demand. Today's
  math undercounts category need when there's a subtype
  shortage AND a generic surplus that can't actually substitute
  for the subtype. Visible operationally because the per-row
  shortage flags catch it; the group total doesn't.
- Operational Notes ordering could prioritise urgent before
  info; currently chronological by group order.
- "Reservations detail" cross-link icon is still the briefcase
  used elsewhere on the page — consider swapping.

---

### 2026-06-04 — Sprint 17.11: split the page into Reservations + Forecast (new room-availability view)

User noticed the page labelled "Forecast" was actually a
reservations/booking overview (arrivals/departures/in-house) — the
*forecast* concept hadn't been built yet. Split into two pages.

**1. Renamed the existing page → Reservations.**

- `AdminShell.js`: NAV gains a `reservations` entry pointing at the
  existing `Forecasting` component; the `forecast` entry now points
  at the new `Forecast` component (below).
- `src/components/Forecasting/index.js`: page title `Room Forecast`
  → `Reservations`. Internal file/folder name stays `Forecasting`
  (would otherwise cascade through CSS classnames + modal imports
  + sub-component identifiers; not worth the churn). The mental
  model is: "Forecasting/" = the *reservations-detail* page,
  "Forecast/" = the *availability-forecast* page. Code comments
  flag the slight mismatch.

**2. New `Forecast` page — `src/components/Forecast/index.js`.**

Matches the user's mockup at image 19. Self-contained file (~440
lines) + its own CSS (~360 lines). Uses the `fb-` prefix
(forecast-balance) so its styles are independent of the
Reservations page's `fc-` styles.

**Compute.**

For each base room type (NKRR / NKJZ / NQRR / NQJZ) the page
shows:
```
vacantClean = perRoomSheet rooms matching baseCode WHERE
              occupancyStatus='VAC' AND hkStatus='VI'
arrivals    = byRoomType[i].arrivals
netBalance  = vacantClean − arrivals
roomsNeeded = max(0, −netBalance)
status      = 'surplus' | 'short' | 'even'
```

Logic lives in `computeNeedRows(payload)` — pure, no I/O.

**Layout.**

- Breadcrumb (`Home > Forecast`) + title + descriptive subtitle
  ("Room-type availability forecast from Agilysys rGuest Stay and
  housekeeping room conditions.").
- Meta-link row: Snapshot history (clock), Forecast settings
  (gear), Reservations detail (briefcase — cross-link to the
  sister page).
- Header actions: **Sync arrivals** (refresh icon, runs the same
  scrape endpoint), **Generate forecast** (chart icon, no-op stub
  — placeholder for a PDF-style output in 17.12), **Send to
  housekeeping** (paper-plane, stub), Last sync badge.
- 5 top stats: Total rooms needed today, Total vacant clean, Total
  arrivals, Deficit room types, Surplus room types. Colored icon
  chips (warn/success/info backgrounds).
- Main column: **Need by Room Type** table (room code / name /
  vacant clean / arrivals / net balance / rooms needed / status
  pill) with a callout box explaining the formula, then **Arrival
  Detail Reference** table showing today's arrivals (first 30,
  sorted by guest name).
- Right rail: **Forecast Summary** card (per-type needed counts +
  a pure-SVG horizontal bar chart comparing Vacant Clean vs
  Arrivals per type) and **Operational Notes** (auto-generated
  bullet list — prioritization for short types, surplus call-outs,
  reminder to confirm late arrivals).
- Bottom: **Housekeeping Message Preview** with auto-generated
  text (uses the same compute output) + Edit / Send to
  housekeeping actions.

**Pure-SVG bar chart.** Two-row-per-type bars, scaled to the max
value across all types. Legend chips (green = Vacant Clean, blue
= Arrivals) + axis labels (0 → maxVal/4 → maxVal/2 → 3/4 →
maxVal). Lightweight; no charting library added.

**Shared modals.** Imports `ForecastSettings` and `ForecastHistory`
from `../Forecasting/` rather than duplicating. Both pages drive
the same scrape pipeline so it's correct to share.

**Files touched:**
- `src/shells/AdminShell.js` (new import + 2 NAV entries + VIEWS
  map update).
- `src/components/Forecasting/index.js` (title text only).
- `src/components/Forecast/index.js` (new, ~440 lines).
- `src/components/Forecast/Forecast.css` (new, ~360 lines).

**Verified.** Brace balance OK across all touched JS files.

**Follow-ups for 17.12+:**

- "Generate forecast" + "Send to housekeeping" buttons are stubs
  — they don't yet produce a PDF or distribute the message.
- The Reservations page still uses the 17.10 KPI cards designed
  for that view (in-house, arrivals, etc.). Forecast page uses
  its own different top-stat strip. They aren't kept in sync on
  purpose — different audiences, different urgency.
- "Reservations detail" cross-link uses the briefcase icon —
  worth swapping to a more distinctive icon if visually
  confusing.

---

### 2026-06-04 — Sprint 17.10: KPI row redesigned to 6 cards, button width stabilized, "Home" back-button

Three things off the user's punch list.

**1. Run scraper button no longer fluctuates during scrape.**

Two contributing causes; both fixed:
- The progress ring (size 18) was bigger than IconRefresh (size 16),
  so the icon slot jumped when scraping started. Dropped
  `ProgressRing` default size to **16** (stroke 2.2) — same square
  as IconRefresh.
- The `Running… 7%` → `Running… 100%` digit-count change pushed
  the button width around. Added `font-variant-numeric:
  tabular-nums` to `.fc-btn`, a `min-width: 154px` (fits
  "Running… 100%" + icon), and a fixed 16×16 slot for the
  icon SVG. Whole button now feels rock-stable across states.

**2. "< Home" back-button above the title.**

Quiet text+chevron link styled like a breadcrumb. Uses
`useView` from `shells/ViewContext` — calls `goTo('home')` to
return to the admin shell's Home page without a full URL
navigation. Redundant with the sidebar Home link on desktop but
matches the mobile mockup's "back chevron at top-left" pattern
and reads as an intentional breadcrumb.

**3. KPI row → 6 cards with primary/secondary number layout.**

Per the user's spec (and the reference snapshot):

| # | Card | Primary | Secondary | Sublabel |
|---|------|---------|-----------|----------|
| 1 | Rooms to service today | remaining (= remDep + stay) | of {total} | full cleans + touch-ups |
| 2 | Arrivals | `kpis.remainingArrivals` | of `kpis.arrivals` | not yet arrived |
| 3 | Departures | `kpis.remainingDepartures` | of `kpis.departures` | not yet checked out |
| 4 | In-house | **inHouseTonight** | — | staying tonight |
| 5 | Stayover service | `kpis.stayovers` | — | touch-ups needed |
| 6 | Housekeepers needed | `kpis.housekeepersNeeded` | — | attendants recommended |

`inHouseTonight = inHouse − remainingDepartures` — i.e. currently
in-house minus the ones leaving today. Matches the user's spec
("current staying AND checkout date is not today").

When `primary === 0` the card gains a soft-green outline + green
primary number ("done").

User asked for "2 more useful metrics" beyond their first 4
(rooms-to-service, arrivals, departures, in-house). Picked
**Stayover service** (touch-up subset of cleaning workload —
makes the workload mix legible) and **Housekeepers needed**
(operational core of the whole feature — staffing target).
Alternative is **Total guests** (`metricsSnapshot.totalGuests.total`,
people in property); swap one out if the GM prefers headcount
over staffing.

**KpiCard component refactored.** Old props (`value`, `remaining`,
`sublabel`) replaced with (`primary`, `secondary`, `sublabel`,
`icon`). The icon is rendered inside a colored circle by the
card, using a fresh accent palette per KPI:

- arrivals  → purple (#e9d8fd / #6b46c1)
- departures → orange (#feebc8 / #c05621)
- inhouse   → blue   (#bee3f8 / #2b6cb0)
- stayover  → gray   (#e2e8f0 / #4a5568)
- clean     → green  (#c6f6d5 / #276749)
- staff     → yellow (#fefcbf / #744210)

Stroke uses currentColor so each icon picks up its accent
foreground.

**6 new SVG icons** (broom, briefcase, exit, bed, sparkle, users
+ back chevron) added inline. No new PNGs.

**Responsive:** 6-across on ≥1281 px, drops to 3-across at
1280–901 px (6 in a row is cramped on most laptop widths), drops
to 2-across on ≤900 px.

**Files touched:**
- `src/components/Forecasting/index.js` — `useView` import, 7
  new icon components, `ProgressRing` default size 16, KpiCard
  signature rewritten, 6-card render block with `inHouseTonight`
  computation, back-button in header.
- `src/components/Forecasting/Forecasting.css` — back-button
  style, new KPI card layout (`.fc-kpi-numbers`,
  `.fc-kpi-primary`, `.fc-kpi-secondary`), per-accent icon
  palette, `.fc-btn` min-width + tabular-nums + fixed icon
  slot, dropped stale `.fc-kpi-remaining` from 17.8, added
  1280px mid-breakpoint.

**Verified.** Brace balance OK (375/375, 317/317, css 173/173).

**Follow-ups not in scope:**
- Donut-legend block still lingers as dead code (referenced in
  17.8 follow-ups).
- ServiceProgress card duplicates the rooms-to-service KPI
  ratio. Could consolidate in 17.11.

---

### 2026-06-04 — Sprint 17.9: page header polish — SVG icons + progress ring + Raw output link

Three small UX fixes on the Forecast page header.

**1. Subtitle removed.** "Scraped from Agilysys rGuest Stay and
compared with housekeeping conditions." was descriptive filler;
the three meta links carry the actionable affordances now.

**2. Inline SVG icons everywhere — no new PNGs.**

Stroke uses `currentColor` so each icon matches whatever color the
parent button paints in.

- `IconRefresh` — circular arrow (Run scraper).
- `IconSend` — paper-plane (Generate forecast).
- `IconClock` — clock with hour/minute hand (Snapshot history).
- `IconGear` — settings cog (Forecast settings).
- `IconDocument` — file with lines (Raw scraper output).

**3. `ProgressRing` component for scrape progress.**

Backend doesn't stream per-step progress, so the ring is
**fake-progress**: a `useEffect` started by `scraping = true`
runs a 200 ms tick over a 14-second ease-out curve up to 95%.
`handleScrape` snaps to 100 on completion; a 700 ms tail effect
drops it back to 0 so the next run starts clean.

Button label becomes `Running… 87%` while in flight; the SVG
ring sits next to it (`strokeDashoffset` driven by `pct`,
0.25 s transition between ticks). The percentage shown is the
fake one — fine for FD perception, not a real measurement.

The ring is also reusable for stayover-touch-up progress in a
future sprint once we wire up real signals.

**4. Meta links restyled — icon + label, three of them.**

Was: `Snapshot history · Forecast settings` (small underlined
text). Now: three blue icon+text links, no separator dots, hover
adds the underline:

- Snapshot history (clock)
- Forecast settings (gear)
- **Raw scraper output** (document — new)

The Raw output link opens `<RawOutputModal>` — a quiet wide modal
that pretty-prints the snapshot's full `payload` as JSON with a
Copy JSON button. Useful when the FD wants to verify what's
actually coming from rGuest without leaving the Forecast page.
Disabled (40% opacity, "Run the scraper first" title) until a
snapshot exists. The dispatch-summary card's stale "View raw
output" text-link is now redundant; could be removed in a 17.10
cleanup.

**Files touched:**
- `src/components/Forecasting/index.js` — 5 inline SVG icon
  components, `ProgressRing`, `RawOutputModal`, `scrapePct`
  state + the 14-second ease-out effect, header refactor.
- `src/components/Forecasting/Forecasting.css` — meta-link
  icon+text styling (gap: 20px, no dot separator, hover
  underline), `.fc-btn svg` flex-shrink helper, `.fc-raw-pre`
  for the JSON pre tag inside the new modal.

**Verified.** Brace + paren balance OK (341/341, 296/296);
962 lines total now.

---

### 2026-06-04 — Sprint 17.8: Forecast page UI revision (KPI cards + Reservation Details tab + HK Message Preview)

User-approved mockup pass after the data was correct in 17.7.2.
Treats the mockup as a template; layout doesn't have to match
pixel-for-pixel.

**1. KPI cards — now show "remaining of total".**

`KpiCard` updated with optional `remaining` prop. When set:
- A second line renders `<strong>N</strong> remaining` in accent
  color.
- If `remaining === 0`, the card gets a subtle green outline and
  the line goes green ("done").

Five cards in the row (was the same five, now richer):
1. Arrivals — `value=kpis.arrivals`, `remaining=kpis.remainingArrivals`,
   sublabel `"check-ins today"`.
2. Departures — `value=kpis.departures`,
   `remaining=kpis.remainingDepartures`, sublabel `"check-outs today"`.
3. Stayovers — value only (no progress signal yet),
   sublabel `"occupied rooms needing service"`.
4. **Rooms to service** — value = total cleaning load,
   remaining = `remainingDepartures + stayovers` (no per-room
   completion tracking yet, so this stays at total until 17.9
   wires that up). User asked for "remaining 0 = done" semantics
   and this is the closest we can do with current rGuest signals.
5. In-house — value only, sublabel `"currently occupied rooms"`.

Replaces the prior "Housekeepers needed" card; HK headcount
still surfaces in the Dispatch Summary right-rail card.

**2. New "Reservation Details" tab — the readable guest list.**

`ReservationDetailsTable` reads from `payload.reservations`
(added in 17.7). Default view is now this tab (was "By Cleaning
Type"). Toggle order: Reservation Details / Cleaning Type / Room
Type / Floor. The three legacy tabs still work for the
analytics-style breakdowns.

Columns: Guest · Room/Type · Check-in · Check-out · Nights ·
Source · Status · HK Action.

- Guest cell shows the full name + a `Pre-assigned` indicator
  when `isPreAssigned=true` and a `No room assigned` warning
  (yellow) when an arrival doesn't have a roomId yet.
- Status badge: Confirmed / Pending / In house / Departed /
  Cancelled — colored pills per status.
- HK Action: derived from `r.kind` — departure → "Full Clean"
  (warm), stayover → "Touch-up" (cool blue), arrival/inhouse →
  "None" (gray).

Filter chips above the table: **All / Arrivals / Departures /
In-house / Stayovers** — matches the mockup's chip row. Two
dropdowns alongside: **Room type** (populated from
`detailRoomTypes` derived from the payload) and **Source**
(populated from `detailSources`). All filters compose
(`AND`-combined). Footer shows `Showing X of Y reservations`.

**3. Service Progress card — right rail.**

`ServiceProgress` component computes:
- **Departure cleans** — progress from
  `metricsSnapshot.remainingDepartures.{total, remaining}`.
  `done = total - remaining`, `pct = round(done/total*100)`.
  Bar accent: purple.
- **Stayover touch-ups** — placeholder 0 / total for now (no
  rGuest signal for per-room touch-up completion). Wire up in
  17.9 once we figure out which HK status transitions imply
  completion. Bar accent: green.

Each row has label · % · bar · `done / total` counter.

**4. Housekeeping Message Preview — bottom.**

`HousekeepingMessagePreview` generates a one-paragraph handoff
note from the KPIs:

> Good {morning/afternoon/evening}, Housekeeping team — today's
> forecast shows N rooms to service: X full cleans (check-outs)
> and Y stayover touch-ups. Based on a productivity target of Z
> rooms per attendant, K attendants are recommended. Please
> review the assigned rooms below.

Greeting flexes by clock hour. "Copy" button writes the message
to the clipboard (silent failure if denied). Replaces the donut
chart at the bottom (donut still defined in the file as dead
code; safe to delete next pass).

**Files touched:**
- `src/components/Forecasting/index.js` (KpiCard prop signature
  expanded; new `ReservationDetailsTable`, `ServiceProgress`,
  `HousekeepingMessagePreview` components; toggle order +
  default view + filter chip state).
- `src/components/Forecasting/Forecasting.css` (chip styles,
  status/action pill colors, Service Progress rows, HK
  Message card, KPI remaining/done variants).

**Verified.** Brace + paren balance OK (278/278, 230/230).

**Open work / known limitations:**

- Stayover touch-up progress is placeholder — no rGuest signal
  for "this stayover room has been touched up." Possible
  approaches for 17.9: track HK status changes between scrapes,
  or surface a checkbox per room in the printable sheet.
- "Rooms to service" remaining can't decrease until we have
  per-room completion tracking. For now it equals
  `remainingDepartures + stayovers` so the FD at least sees the
  remaining departure work shrink throughout the day.
- DonutLegend component is dead but still in the file — clean
  up in 17.9 along with the dispatch-summary card consolidation.
- HK Message Preview doesn't yet wire to the "Send to
  housekeeping" button; copy-to-clipboard is the only output.

---

### 2026-06-04 — Sprint 17.7.2: use rGuest's authoritative `reservationMetrics` for KPIs

17.7.1's diagnostics surfaced the real problem: `/reservations/search/date`
returns **every reservation from `date` forward** (2112 results for
Snoqualmie at 7 PM — 22 pages — of which 2031 were future or
cancelled noise and only 81 actually touched today). And of those
81, our derived headline numbers didn't match what rGuest's UI
showed (43 arrivals vs rGuest's 38) because their dashboard counts
some INH cases differently than "arrivalDate === today" — semantics
we can't reproduce from the raw data alone.

**The fix.** rGuest has a dedicated `reservationMetrics` endpoint
that returns exactly the dashboard widget numbers:

```
GET /reservation-service/v1/tenants/{tid}/properties/{pid}/reservations/reservationMetrics?endDate=YYYY-MM-DD
→ {
  remainingArrivalsSummary:   { remaining, total, walkIns, earlyCheckIns },
  remainingDeparturesSummary: { remaining, total },
  totalGuestsSummary:         { adults, children, total },
  vipsSummary:                { arriving, inHouse, departing },
  roomConditionSummary:       [{ name: 'D', value: 36 }, …]  // matches HK widget
}
```

Discovered in the existing recon at
`scraper/recon/20260604-141754/requests.jsonl` — rGuest's UI is
calling this on every dashboard load. Use it.

**Wiring:**

1. `server/agilysys/client.js` — added
   `getReservationMetrics(date)` (GET, no body). `fetchForecastInputs`
   now runs four parallel calls instead of three (rooms, roomTypes,
   reservations, metrics). One extra round-trip; same single login
   thanks to 17.6's pre-login.
2. `server/forecast/runScrape.js` — passes `inputs.metrics`
   through to `computeForecast`.
3. `server/forecast/compute.js` — KPI table now sources headline
   counts from metrics when present, falls back to derived counts
   if the endpoint changed:
   ```
   arrivals          ← metrics.remainingArrivalsSummary.total
   departures        ← metrics.remainingDeparturesSummary.total
   remainingArrivals ← metrics.remainingArrivalsSummary.remaining
   remainingDepartures ← metrics.remainingDeparturesSummary.remaining
   totalGuests       ← metrics.totalGuestsSummary.total
   stayovers         ← derived (no equivalent in metrics)
   inHouse           ← derived (no equivalent in metrics)
   ```

**Verified against the 14:17 recon:**
- KPIs: arrivals 33, departures 31, remainingArrivals 31,
  remainingDepartures 6, totalGuests 53 — all match rGuest's
  dashboard exactly.
- `kpiSourceComparison`: zero gap at recon time (the dataset was
  small enough that derived = metrics). For the user's live 7 PM
  data, `arrivalsGap` was −5 / `departuresGap` was +15 — those
  gaps will now be invisible to the user since we trust metrics.
- `metricsSnapshot.roomConditions`: VI=29, IP=3, PU=29, OC=2, D=36
  — exact match for rGuest's "ROOM CONDITION" widget. Surfaced on
  the snapshot so 17.8's UI can render it directly.

**New diagnostic field:** `meta.kpiSourceComparison` shows
arrivalsRGuest vs arrivalsDerived (and gap) side-by-side. When
they disagree, the metrics endpoint wins — but the gap shows up
in the History → Diagnostics panel so any future
silently-divergent drift is obvious.

**Open questions / acknowledged limitations:**

- `stayovers` + `inHouse` are still derived from /search/date.
  metrics doesn't expose those. For now they're approximate; if
  the gap is material we can compute inHouse from rooms[]
  (count `currentOccupancyStatus === 'OCC'`).
- `/search/date` still fetches the 22-page firehose. Bandwidth
  waste, not correctness — defer the body-shape investigation
  (probably needs a `startDate`+`endDate` filter or a `statuses`
  array) until 17.9.
- New status codes seen in the live data: `PND` (pending),
  `RLS` (released). Both are future-only in the recon, so they
  don't affect today's counts; mention added to the status
  enum comment so future-me knows.

**Files touched:**
- `server/agilysys/client.js` (new `getReservationMetrics`,
  `fetchForecastInputs` now 4-way parallel).
- `server/forecast/runScrape.js` (threads `metrics` through).
- `server/forecast/compute.js` (metrics-first KPI sourcing,
  `metricsSnapshot` on payload, `kpiSourceComparison` in meta,
  `derived` destructure on `buildDiagnostics`).

**Action needed:** restart server, run scraper again. The 38/30
should now match rGuest's dashboard exactly.

---

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
