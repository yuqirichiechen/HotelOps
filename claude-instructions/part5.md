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
| 19.5       | Scraper: rGuest login 401 "Invalid credentials" after password change | **Resolved** — Koyeb env var hadn't been updated (user fixed) |
| 20.1       | Reservations header: title + last-sync + icon-only refresh on one line | Built; rendered at 390/360/1280 px |
| 20.2       | **Scraper v2:** deep per-reservation fetch (~25 sections), stored in DB by a background job; UI reads stored data | Built + tested (unit, fake-DB job runner, live rGuest e2e). **Apply migration 027 before deploy** |
| 20.3       | **Status tabs** (Remaining arrivals default, clickable like rGuest) + job progress + **fix: scraper silently dropped ~19% of reservations** | Built; tab counts verified against rGuest's own numbers (5/5 match, stable across runs) |
| 20.4       | **Dense inline cards** (phone + desktop) from stored `reservation_detail.summary`; expand in place; right rail removed | Built; real component rendered at 390/1280 px; 23 automated checks |
| 20.5       | Search (name/conf/room), "needs attention" sort, print-friendly list, PII retention pruning | Planned |

---

## 2. Sprint logs (19.1 → present)

### Sprint 20 roadmap — Reservations redesign (proposal, 2026-09-30)

**Problem (from user screenshots + code read).**
- "Remaining arrivals: 4 of 38" is the number the front desk cares about,
  but there is no way to see *those 4*: the `Arrivals Today` chip
  (`FILTER_PREDICATES.arrival`, `kind === 'arrival'`) lists all 38.
- A collapsed card shows only name, conf #, room (`—`), type and two
  pills. Dates, nights, source, flags — and everything from the guest
  record (email, phone, channel, occupancy, balance, history, open
  requests, card on file) — sit behind a tap, and the guest record is a
  separate on-demand call per reservation (`useReservationDetail`,
  Sprint 18.7). That's the "second level" the user wants gone.
- rGuest's own reservation page carries far more (comments, preferences,
  folio summary, stay history, upsells, loyalty, documents, print/email
  history); `scraper/recon/20260611-143158` shows opening one reservation
  fires 249 XHRs, ~80% config noise.

**Proposed sprints** *(numbering updated: scraper became 20.2; status tabs 20.3; cards 20.4)*.
| # | What |
|---|------|
| 20.1 | Header layout (done) |
| 20.3 | **(DONE) Status model + filters:** tabs with live counts — *Remaining arrivals* (default), Arrived, In-house, Remaining departures, Departed, Future, No room. Definitions mirror rGuest's top tiles so numbers match theirs. Filters become one sticky row (room type / source collapse into a "Filters" popover on mobile). |
| 20.4 | **(DONE) Dense cards, no drill-down:** every card shows the essentials at a glance — name (+VIP), status, room/"Unassigned", type, dates + nights, ETA/early/red-eye, channel, rate plan, balance due, guests, flags, phone/email (tap-to-call/mail). Mobile: 3-line card. Desktop: table-style rows with the same fields as columns. Optional in-place expand (accordion, never a new page) for the long tail. |
| 20.2 | **Scraper expansion — DONE, reordered first at the user's request** (see the 20.2 entry for the final design: all ~25 per-reservation sections, sensitive data kept admin-only, stored by a background job so cards never depend on a live call). |
| 20.5 | **Search + sort + inline polish:** name/conf/room search, "needs attention" sorting (no room, VIP, early, unpaid), print-friendly list for the desk. |

**DECISIONS (user, 2026-09-30) — supersede the defaults below:** start with the
scraper (cards need its data); default tab = Remaining arrivals but switchable
like rGuest's tiles; prefetch **everything** even if slow; **keep sensitive
data** (admin-only) — scrape everything possible; and fetch guest detail in a
way that doesn't break when the list goes stale (→ the 20.2 design).

**Original open decisions (defaults in bold):** (1) default tab =
**Remaining arrivals**; (2) prefetch detail for **arrivals + in-house**
(≈40–150 reservations/scrape; adds ~1–2 min and N×4 rGuest calls — vs
arrivals only); (3) PII scope = **no card/ID/document data stored**.
Risk to manage: rGuest rate limits / account lockout (the scraper uses a
real staff login) → concurrency ≤ 4, back off on 429/401, never retry a
failed login.

---

### 2026-09-30 — Sprint 20.4: dense inline reservation cards (no drill-down)

Replaces the Sprint 18.4 collapsed-card / 18.1 table / 18.2 right-rail
trio with ONE dense list used on phone and desktop. Everything the desk needs
is visible without a click; the long tail expands **in place**. Reads only the
stored summaries from 20.2 — a card can never fail because rGuest changed.

**What a card shows (collapsed).**
- *Guest:* name, confirmation #, room type, **tap-to-call phone**, **tap-to-mail
  email**, city/country.
- *Stay:* `Sep 30 → Oct 3 · 3 nights`, `2 adults · 1 child`, channel (Booking.com /
  Walk-in) · rate plan.
- *Status & room:* status pill, `Room 305 · Dirty` or **No room assigned**, plus the
  existing flag pills (VIP, Early arrival, Pet, Group…).
- *Charges & notes chips* (money problems first, colour-coded): `Balance $239.55`
  (red), `Deposit due $100 · Sep 29` (amber) / `Deposit paid` (green), `Paid`, `Stay
  $940.46`, `Visa ••8018 +1` / **`No card on file`** (amber), `1 prior no-show`
  (amber), `Returning · 5 stays`, `2 notes`, `1 preference`, `Loyalty member`,
  `2 service requests`, `Do not disturb/move`, `Group · <name>`.
- *Footer:* **"Details as of 3:12 PM"** (amber + "9h old" after 6 h; "N sections
  couldn't refresh" / "refresh failed" when relevant) · **Refresh** (live re-fetch
  of that one reservation) · **rGuest ↗** · **More details**.
- A reservation gone from rGuest shows a dashed card + banner "No longer in rGuest
  (cancelled, merged or moved) — showing the last details we saved." Not-yet-loaded
  shows "Loading guest details…" (job running) or "not loaded yet".

**"More details" (in place, multiple open at once; "Expand all on this page").**
Sections, each hidden when empty: Guest (contact, additional guests, loyalty) ·
Stay (dates, guests, room, group, booked by, channel, avg rate, created/cancelled)
· Charges (estimated, rooms, taxes, posted, paid, balance, deposits, authorized,
folios) · Payment cards (masked: brand, last 4, exp, holder, auth) · Notes ·
Preferences · Guest history (prior stays, no-shows, cancellations, total spent,
avg rate) · Service requests · Communications (last email, reg card, unread).

**Layout.** Phone: stacked blocks, ≥40 px buttons that never wrap. Desktop
(≥1000 px): a 4-column row (Guest | Stay | Status & room | Charges & notes) with a
column-header strip. **The right rail (Today at a glance + Selected reservation) is
removed** — the clickable KPI tiles are the glance; the list gets full width.

**Data flow.** `useResnSummaries(idsOnScreen, jobTick)`: one request for just the
rows on the current page (`GET /admin/reservations/summaries?ids=…`, ≤100, UUID-
validated, deduped) — not the whole 600-row snapshot; refetched as the 20.2 job
progresses (only while it runs). Module-level store survives tab/page switches.
`POST …/:id/refresh` updates one card; failures keep the stored data and show
"refresh failed".

**Findings along the way.** rGuest returns `cardIssuer` as a readable name (Visa /
Mastercard / American Express) — no mapping needed; corrected a wrong comment.

**Code removed (dead after this).** `ReservationCard`, `SelectedReservation`,
`TodayAtAGlance`, `useReservationDetail` + its 5-min cache, ~15 `fmtDetail_*`
helpers, the desktop table. `index.js` 1,979 → ~1,300 lines. (An over-eager regex
also deleted `RawOutputModal` + `HousekeepingMessagePreview` mid-way; caught by
the build and restored from the pre-change backup — verified by diffing top-level
declarations before/after.)

**New files.** `resnFormat.js` (pure view-model: chips/sections/dates/money/
as-of), `ResnItem.js` (component + data hook), `ResnList.css`.

**Verification.**
- 7 unit tests for the formatters (money/dates/guests, as-of staleness, contact
  links only when valid, chip ordering/tones, settled/deposit/no-card cases,
  hostile/empty input, section dropping).
- 5 in-process route tests for `summaries?ids=` (auth 401/403, only valid UUIDs
  reach SQL incl. an injection attempt + duplicates, cap 100, all-junk → empty
  without a query, no-ids fallback).
- Earlier suites re-run: exact-fetch 5/5, job+summary 11/11, auth matrix 83/83;
  build compiles with only pre-existing warnings.
- **Visual:** rendered the REAL `ResnItem` component (Babel + react-dom/server)
  with realistic data at 390 px and 1280 px — collapsed, expanded, cancelled and
  loading states. Two issues found and fixed from the render (mobile "More
  details" wrapping; payment-card row cramped).
- **Not exercised:** the full page in a browser against the real DB (needs
  migration 027 applied + a scrape + login).

**Deploy.** Same order as 20.2/20.3: migration 027 → deploy → scrape once; cards
fill in as the background job runs (header bar shows progress).

**Follow-ups.** 20.5: search by name/conf/room, "needs attention" sort (no room,
no card, balance, deposit due), print-friendly desk list. **PII retention**
pruning for `reservation_detail` still open (see 20.2). Summary `comments` /
`preferences` / `loyalty` remain defensive (no real examples seen yet) — once one
exists, check how it renders.

**Files touched:** `src/components/Forecasting/{index.js, Forecasting.css,
resnFormat.js (new), ResnItem.js (new), ResnList.css (new)}`, `server/server.js`
(`summaries?ids=`), `server/forecast/summarize.js` (comment),
`claude-instructions/part5.md`.

---

### 2026-09-30 — Sprint 20.3: status tabs + exact reservation fetch (scraper data-loss bug)

**Headline finding — the scraper has been losing ~15–19% of reservations on
every scrape.** While validating the new tab counts against rGuest's own
numbers, the same hotel's in-house count changed 72 → 61 in 25 seconds. Root
cause, measured live: `POST …/reservations/search/date` has **no stable page
order** (`response.sort` is always empty; every sort param tried — body and
query-string — is ignored). `searchAllReservationsByDate` walked ~11 pages of
99, so pages overlapped and skipped: **813–870 unique of 1,008 per walk, a
different subset each time (~195 duplicates, ~195 missing).** This is the
real reason counts wandered and never matched rGuest, and the long history of
"numbers don't match" sprints (17.7, 17.7.1, 17.14, 17.16 dedupe…). Snapshots
already in the DB are incomplete by this amount.

**Fix — `client.fetchReservationsExact(date, window)`** (replaces the walk in
`fetchForecastInputs`; old function kept, marked DEPRECATED):
- The endpoint *does* honour `endDate` (range) and `statuses` (live-probed).
  **INH and DPT single-day slices are exact single pages** (68 / 46 → identical
  to rGuest's counts, identical across runs). A single page has no ordering
  problem.
- **RES is not sliceable** (quirk: `statuses:['RES']` with a one-day range
  returns 0; multi-day ranges return totals that don't track arrival dates).
  The date-only form `{date, statuses:['RES']}` has a stable `totalElements`,
  so RES is fetched by **repeated walks unioned until unique == totalElements**
  (2–4 walks), `complete:false` if it can't (never a silent success).
- `payload.reservationsComplete` is stored on the snapshot; the page shows a
  warning banner if false. `runScrape` passes `future_window_days`.
- Cost: ~6 s, ~10–40 calls per scrape (was ~11 calls that were wrong).

**Acceptance test (live).** Ground truth = union of full walks (1008/1008).
Exact fetch ×3: **0 missing, identical sets every run, `complete=true`**;
payload = 609 rows = the expected set. Against rGuest's own metrics:
remaining arrivals ✔, arrivals total (arrived + remaining) ✔, departures
total ✔, remaining departures ✔, in-house ✔ — **5/5 match**. 5 automated
tests with a mock rGuest that reproduces the random-page-order bug (including
a control proving a naive walk loses rows, and a "can never complete" case).

**Tabs (`src/components/Forecasting/resnTabs.js`, pure + tested against live
data).** Replace the old chips (All / Arrivals Today / …), rGuest-style with
live counts, default **Remaining arrivals**:
| Tab | Definition |
|-----|-----------|
| Remaining arrivals | `kind=arrival` and `status=RES` (not checked in) — default |
| Arrived | `kind=arrival` and `status=INH` |
| In-house | `status=INH` (everyone in a room: arrived today + stayovers + not-yet-out departures) |
| Remaining departures | `kind=departure` and `status=INH` |
| Departed | `status=DPT` |
| Future | `kind=future` (next 30 days, RES) |
| Needs a room | remaining arrival with no pre-assigned room |
| All | everything |
(Behaviour change: *In-house* now means every INH guest — matches rGuest's
80/72 — the old chip showed only stayovers; *Departures Today* chip became
Remaining departures + Departed.)
- Counts always cover all rows; room-type / Source dropdowns narrow only the list.
  Per-tab sort: arrival tabs list room-less guests first, then A→Z; Future by
  arrival date; others A→Z. Page size default 10 → 25.
- Friendly empty states with a jump ("Everyone expected today has arrived →
  See who has arrived"); "Clear filters" when the dropdowns hide everything.
- **KPI tiles are tab buttons** (like rGuest's top tiles): Arrivals → Remaining
  arrivals, In-house, Departures → Remaining departures, No Room → Needs a
  room; active tile outlined; keyboard accessible.
- Tabs: one horizontally-scrolling row on phones, wrap on desktop.
- **Guest-detail job progress** (from 20.2): "Loading guest details 37 / 130" +
  bar under the title while the background job runs; amber/red notes for
  partial / failed / interrupted. Polls `/admin/forecast/jobs/latest` every
  2.5 s **only while running and visible**; fetched once on mount; idle page
  = no polling (19.1 compute rule).

**Verification.** All server files `node --check`; exact-fetch 5/5, job/summary
11/11, auth matrix 83/83; `npm run build` compiles (only pre-existing
warnings). Layout rendered at 390 px and 1280 px. **Not exercised in the real
app** (needs migration 027 applied + a login) — expect a final look on a
device.

**Deploy order.** 1) migration 027 (from 20.2) 2) deploy 3) scrape once —
the first scrape after this is the first *complete* one; counts may jump up
vs. earlier snapshots (that is the 15–19% that was missing).

**Follow-ups.** Old snapshots remain incomplete (not backfilled).
`reservation_history` upserts from past scrapes are missing the same rows
(they will fill in as scrapes run). `searchAllReservationsByDate` is unused
by the app now — delete once nothing else references it. rGuest quirks are in
memory `rguest_search_quirks`.

**Files touched:** `server/agilysys/client.js`, `server/forecast/runScrape.js`,
`src/components/Forecasting/{resnTabs.js (new), index.js, Forecasting.css}`,
`claude-instructions/part5.md`.

---

### 2026-09-30 — Sprint 20.2: Scraper v2 — stored deep fetch of every reservation

**Problem.** Guest detail was fetched LIVE from rGuest when a card was tapped
(`GET /admin/reservations/:id/detail`, a fresh rGuest login each time). If the
list snapshot was hours old and that reservation had since moved/cancelled/
merged, the live call failed and the card showed an error. It also covered only
~8 of the ~25 per-reservation data sources rGuest exposes, and "all the data"
(comments, folio, deposits, history, group…) was never available inline.

**Design — "list snapshot + stored detail, UI reads only the DB".**
1. *Fast list scrape* (as before, ~15 s) → `forecast_snapshot`.
2. *Background job* (`server/forecast/detailJob.js`) is kicked off by the
   scrape route and returns immediately. It deep-fetches each reservation in
   the snapshot and **upserts it into `reservation_detail` as each one
   completes** (progressive), heart-beating progress to `scrape_job`.
3. **UI never calls rGuest to render a card.** `GET …/detail` reads the stored
   row; fallback: if not stored yet it fetches once live and stores it.
4. **Staleness is explicit, not an error:** every row has `fetched_at`,
   `remote_state` (`ok` | `gone` = 404 in rGuest) and per-section status.
   A cancelled/moved/merged reservation keeps its last data and is flagged
   `gone` instead of throwing.
5. **Failure isolation:** each section has its own try/catch; a failed section
   keeps its previous good data (flagged `staleSince`) and is retried next run;
   a failed reservation never wipes or creates a row.
6. **Incremental:** re-fetch only if new, list-fingerprint changed (status /
   kind / room / dates / type / rate plan…), older than TTL (3 h active, 24 h
   future), or has a section that failed > 30 min ago. A second scrape with no
   changes fetches nothing.
7. **Order:** remaining (pending) arrivals first, then in-house, departures,
   future — so the cards the desk needs appear first.

**What is scraped per reservation (all stored RAW, admin-only; `summary` is
derived).** reservation (full: rate snapshots, occupancy, source, preferences,
policies…), guest profile (contact, addresses, loyalty, preferences),
preferred rooms, comments, additional guests, loyalty info, messages summary,
scheduled deposits, coupons, room-assignment restrictions, email/print
history, service requests (guest/HK/maintenance), group, room allocation,
stay history counts, guest's other stays (slimmed), account details, folios
(+line items), posting rules, estimated charges, auth details, balances, and
payment instruments (masked card metadata: last4/holder/exp/auth amount).
**Sensitive data is kept** (user decision): contact info, folio lines, masked
cards. Protected by `requireAuth + requireRole('admin')` on every route that
returns it. **Not scraped (no known GET endpoint):** identity-document images,
document-attachment list (POST with unknown body) — IDs sit in `reservation`
(`verifiedGuestIdentityIds`); revisit if wanted.

**Safety / ops.**
- Client (`server/agilysys/client.js`): global cap of **6 in-flight requests**
  (`AGILYSYS_MAX_INFLIGHT`); backoff+retry on 429/502/503/504; one shared
  re-login for concurrent callers; **a rejected login is never retried** and
  aborts the job (`err.fatal`) — protects the rGuest account from lockout;
  204/empty bodies → `null`; errors carry `.status`; balances call now tries
  the body shape rGuest accepts first (the old one 500'd).
- Job aborts after 8 consecutive failures ("rGuest looks down"); one job at a
  time; a job with no heartbeat for 90 s is marked `interrupted` lazily (no
  boot query, no timers — respects the 19.1 compute rule). Runs only when an
  admin scrapes/refreshes.

**API (all admin-only).**
- `POST /api/admin/forecast/scrape` → now also starts the job; response adds
  `detailJob {started, reused, job}`. Body `{details:false}` skips it,
  `{forceDetails:true}` re-fetches everything.
- `GET /api/admin/forecast/jobs/latest` → progress (`total/done/failed/gone/status`).
- `GET /api/admin/reservations/summaries` → compact card data for every
  reservation in the latest snapshot in ONE query (for the 20.3 cards).
- `GET /api/admin/reservations/:id/detail` → stored `detail` (same keys the
  18.7 UI uses → existing UI keeps working) + `summary` + `meta`
  (`source`, `fetchedAt`, `remoteState`, `sections`).
- `POST /api/admin/reservations/:id/refresh` → live re-fetch of one
  reservation; tolerant (returns stored data + `refreshError` on failure).

**DB — migration 027** (`database/migrations/027_sprint20_reservation_detail.sql`,
mirrored in `schema.sql`): `reservation_detail` (raw `detail` JSONB, `summary`
JSONB, `sections` JSONB, `fetched_at`, `remote_state`, `list_fingerprint`,
attempts/last_error) and `scrape_job` (status/progress/heartbeat).
**Apply 027 on Koyeb BEFORE deploying** — without it the job fails to start
(caught: the list scrape still succeeds) and the detail route 500s.

**Findings from the live probes (2026-09-30).** rGuest answered every
per-reservation endpoint with 200/204 for 45 + 30 real reservations (0 failed
sections). One reservation = ~25 requests, ~0.6 s unthrottled; avg raw detail
≈ 48 KB (up to ~130 KB for long in-house stays with many folio lines).
`stay/allocation` etc. shapes recorded in `server/forecast/summarize.js`.
Comments / guest preferences / loyalty were **empty** in every probed
reservation, so `summarize.js` reads them defensively (collects any readable
text) — revisit once a real example exists (raw is stored, so the summary can
be re-derived without re-scraping).

**Verification.**
- 11 automated tests (scratchpad `jobtest.js`): target selection/ordering/TTL/
  fingerprint/section-retry; job runner against an in-memory fake pg + fake
  rGuest — happy path, incremental no-op second run, 404→`gone` keeps prior
  data, partial failure creates no empty row, fatal login aborts without
  attempting the rest, 8-failure circuit breaker, single-job guard + stale
  detection; summary math on a real-shape fixture + hostile input.
- **Live e2e (real rGuest, fake DB):** 30 real reservations in **8.4 s**,
  730 HTTP calls, **peak in-flight 6 (cap holds)**, 0 failed sections;
  extrapolates to ~40 s for a full ~130-reservation run. Summary coverage:
  email 28/30, phone 26/30, card 28/30.
- Auth matrix: 83 routes, 0 failures (new routes admin-only).
- **Not done:** not run against the real Koyeb DB; no UI changes yet (cards
  still render as before — they just read stored data now).

**Known follow-ups / risks.**
- **PII retention:** the DB now holds guest contact + folio data for every
  reservation we've seen, indefinitely. Add pruning (e.g. delete detail for
  reservations departed > 90 days ago) — not done.
- No UI for job progress yet (20.3: header "Details 37/130" + per-card
  "as of 3:12 PM" / "no longer in rGuest" / "refreshing" states + a refresh
  action).
- `summary` v1 can be re-derived from stored raw if the format improves.
- TTLs/constants live at the top of `detailJob.js`.

**Files touched:** `server/agilysys/client.js`, `server/forecast/detailJob.js`
(new), `server/forecast/summarize.js` (new), `server/server.js`,
`database/migrations/027_sprint20_reservation_detail.sql` (new),
`database/schema.sql`, `claude-instructions/part5.md`.

---

### 2026-09-30 — Sprint 20.1: Reservations header on one line (icon-only refresh)

Layout fix, mobile first. On the Reservations page the title sat on its own
line while "Run scraper" (a 154 px min-width labelled button) and the
"Last sync" badge wrapped underneath — three rows of chrome before any data
on a phone.

- **One row at every width:** `Reservations` (left) · `● Last sync 8:23 PM`
  badge · square **refresh icon button** (right). The "Run scraper" text is
  gone; the button keeps `title` + `aria-label` ("Refresh: run the rGuest
  scraper"), and while running shows the progress ring (percent moved into
  the tooltip/aria-label — no width-changing text).
- **Sizes:** icon button 40 px (44 px on `pointer: coarse` touch screens);
  h1 32 → 24 px at ≤480 px; at ≤360 px the badge drops the words "Last
  sync" and shows dot + time only.
- **Also fixed:** the three meta links (Snapshot history / Forecast
  settings / Raw scraper output) were `inline-flex` with no wrap — now wrap
  under the title instead of overflowing a 390 px screen.
- Empty-state copy updated ("Tap the refresh button above…").
- **Not changed:** the *Forecast* page header (it has "Sync arrivals" +
  "Generate forecast" + badge) — not requested; same pattern can be applied
  if wanted.

**Verified.** Static render of the real built CSS + header markup at 390,
360 and 1280 px (all single-row); `npm run build` compiles; no new
warnings. Not yet checked on a real device / with the running state.

**Files touched:** `src/components/Forecasting/index.js` (header JSX),
`src/components/Forecasting/Forecasting.css`, `server/agilysys/client.js`
(401 message revert), `claude-instructions/part5.md`.

---

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
3. ~~Actionable 401 message~~ — **reverted at user request (20.1 session):**
   a 401 now throws the short `rGuest rejected the login — username or
   password is incorrect.` (the Koyeb hint was too specific).

**RESOLUTION (user, later same day):** the Koyeb `AGILYSYS_PASS` env var had
not been updated — only the local `.env`. Updating Koyeb fixed it.

**User checklist (kept for reference).**
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
