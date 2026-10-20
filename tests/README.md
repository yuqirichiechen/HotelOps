# HotelOps test notes

**Honest status (2026-10-07):** during Sprints 19–20 I wrote ~10 throwaway test scripts in the session's temp
folder. That folder was cleaned before they were copied into the repo, so **only the files in this directory
survive**. The suites are described in `claude-instructions/part5.md` (§20.2–20.5 "Verification") and in the
memory note `testing_approach` — rebuild the ones you need; they were each 50–150 lines.

## What exists here
| File | Purpose | Run |
|---|---|---|
| `fcrender.js` | Renders the **Forecast** page (`src/components/Forecast`) in jsdom against a **live** payload (real rGuest scrape → `computeForecast`) and prints whether it crashes + the top-line numbers. Needs rGuest creds in `server/.env` (read-only GETs). | `node tests/fcrender.js "$PWD"` |
| `real-postgres/base.sql` | Minimal stand-in tables for testing SQL on a throwaway local Postgres. | see below |

## Real-Postgres recipe (postgres@14 via Homebrew)
```
initdb -D /tmp/hopdb -A trust -U postgres
pg_ctl -D /tmp/hopdb -o "-p 5439 -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l /tmp/hopdb.log -w start
psql -h 127.0.0.1 -p 5439 -U postgres -c "CREATE DATABASE hoptest"
for f in tests/real-postgres/base.sql database/migrations/025_sprint18_reservation_history.sql database/migrations/027_sprint20_reservation_detail.sql; do
  psql -h 127.0.0.1 -p 5439 -U postgres -d hoptest -v ON_ERROR_STOP=1 -q -f $f; done
pg_ctl -D /tmp/hopdb stop
```
Point `DATABASE_URL` at `postgres://postgres@127.0.0.1:5439/hoptest`. `server.js` hard-codes `ssl:{rejectUnauthorized:false}` (Neon), so wrap `require('pg').Pool` to pass `ssl:false` in test harnesses.

## Suites worth rebuilding first (what they covered)
1. **Auth matrix** — spawn server with a dummy DB, hit every route (parsed from `server.js`) with no token / token forged with a known weak secret / staff token / admin token; expect 401 / 401 / 403 / pass. Skip admin-token calls to Agilysys-backed routes.
2. **Exact reservation fetch** — mock `fetch` reproducing rGuest's random page order; assert `fetchReservationsExact` returns every row, `complete:false` when it can't.
3. **Detail job** — fake pool + fake client: incremental runs, 404→gone keeps data, fatal login aborts, circuit breaker, single-job guard.
4. **Reservations UI** — real `ResnTable` in jsdom with a mocked `apiFetch`: tabs/counts, search, attention chips, sorts, expand, stale auto-refresh, delete-details, print, CSV.

## Cautions
- Live scripts log in to rGuest (read-only). Never loop them — repeated failed logins can lock the account.
- Never send an admin token to `/admin/forecast/scrape` or `/admin/reservations/:id/detail|refresh` in a test (they call Agilysys).

## Added in Sprint 21 (in the repo, all runnable)
| File | What | Run |
|---|---|---|
| `forecastmodel.test.js` | Pure forecast model (today board, cleaning priority, floors): 20 offline tests; `--live` adds 2 read-only rGuest checks | `node tests/forecastmodel.test.js "$PWD" [--live]` |
| `forecastpage.test.js` | REAL Forecast page in jsdom (live board, priority table, sheet, info popover, idle pause…) — 17 tests | `node tests/forecastpage.test.js "$PWD"` |
| `forecast-live-check.js` | Live read-only: live room board vs rGuest (ghost room excluded, HK counts, arrivals) | `node tests/forecast-live-check.js "$PWD"` |
| `forecastlive-route.test.js` | `/api/admin/forecast/live`: auth, zero DB access, cache, dedupe, 502 handling (rGuest client faked) | `node tests/forecastlive-route.test.js "$PWD"` |
| `forecast-window.test.js` | Stored list window (365 d) vs guest-detail window (30 d) | `node tests/forecast-window.test.js "$PWD"` |
| `forecast-allowance-settings.test.js` | Late-booking settings: admin-only + validation (fake DB) | `node tests/forecast-allowance-settings.test.js "$PWD"` |
| `forecast-probe-fields.js`, `forecast-calibrate-pickup.js` | Live read-only probes: floor/creation-date fields; pickup (late-booking) study | `node tests/<file> "$PWD" [weeks] [perDay] [out]` |
| `forecast-probe-incremental.js` | Live read-only: does rGuest search support modified-since filters / sorting? (No — see part6, Sprint 22) | `node tests/forecast-probe-incremental.js "$PWD"` |
| `sync-pure.test.js` | Sprint 22 pure logic: settings validation, PT windows/DST, scheduler decisions, normalize/diff/events | `node tests/sync-pure.test.js "$PWD"` |
| `syncpanel.test.js` | Sprint 22.2: real SyncPanel + RecentChanges in jsdom, syncFormat helpers | `node tests/syncpanel.test.js "$PWD"` |
| `syncrender.js` | Renders those components with mock data for screenshots (`DUMP=f.html WHICH=panel\|changes`) | `node tests/syncrender.js "$PWD"` |
| `sync-payload.test.js` | Sprint 22.3: mirror payload == full-scrape payload (real Postgres, fake rGuest), status override, readiness, flushPending/onFlushed | `node tests/sync-payload.test.js "$PWD"` |
| `reservations-refresh.test.js` | Real Reservations page: reads /admin/forecast/current; refresh → sync run (mirror) or legacy scrape (fallback) | `node tests/reservations-refresh.test.js "$PWD"` |
| `sync-engine.test.js` | Sync engine vs a REAL throwaway Postgres (auto initdb on 5439) with a fake rGuest world — 16 scenarios | `node tests/sync-engine.test.js "$PWD"` |
| `sync-route.test.js` | `/api/sync/tick` secret + admin sync endpoints (DB and rGuest fully faked) | `node tests/sync-route.test.js "$PWD"` |
| `agilysys-slices.test.js` | Exact range fetch vs a SIMULATED rGuest (night-overlap RES semantics, shuffled order, dense nights) | `node tests/agilysys-slices.test.js "$PWD"` |
| `migration-028.test.js` | Migration 028 idempotent; legacy runScrape upsert still valid | `node tests/migration-028.test.js "$PWD"` |
| `sync-live-dryrun.js` | LIVE read-only rGuest → engine → throwaway local Postgres; validates the mirror against rGuest totals (≈4 min for 12 months, ~1,000 calls — run sparingly) | `node tests/sync-live-dryrun.js "$PWD" [monthsBack]` |
| `forecast-diagnose.js`, `forecast-futurecheck.js` | Live read-only probes (room conditions vs ours; per-day arrivals/departures) | `node tests/<file> "$PWD"` |
| `fcrender.js` | Render the Forecast page from a live payload (`DUMP=file.html FC_DAY=1` to capture HTML for screenshots) | `node tests/fcrender.js "$PWD"` |
