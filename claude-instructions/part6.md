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
| 21.3   | HK action list (which rooms to clean first), printable sheet for the selected day | Planned |
| 21.4   | Layout polish | Mostly done in 21.2 (phone + desktop rendered) |
| 21.5   | Widen stored list-level future window to ~12 months (separate from 30-day detail window) | Planned |
| 22     | Scraper DB revamp (incremental mirror) + forecast on top | Planned |

## Sprint logs (newest first)

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
