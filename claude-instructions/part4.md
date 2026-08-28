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

## 4. Sprint 18.x roadmap — Reservations page redesign + scrape expansion

### 4.0 Why this sprint exists

User testing through 17.13–17.16 surfaced that the original
"Reservations" page (renamed from "Forecast" in 17.11) is
functionally weak — it shows the same RES/INH/DPT data we already
scrape but doesn't surface enough of it for the FD to actually
work day-to-day from. The mockup shared 2026-06-09 reorients it
as a *true reservations workbench*: searchable, filterable
table of every active reservation, click-to-drill into a side
panel, deep-link out to rGuest, with notes / flags / channel
information that isn't in our current scrape pool.

This sprint also tackles two infrastructure problems the user
flagged:
1. Each scrape stores ~MB of JSONB. After enough scrapes the
   `forecast_snapshot.payload` column eats real disk.
2. Sync takes 10–18s because we re-fetch everything (incl. ~22
   pages of mostly-future RES reservations) every time.

### 4.1 Recon needed before any code (18.0)

We're missing three data shapes that the mockup wants:

1. **Reservation detail URL** — for the "Open in rGuest Stay"
   button. The existing recons never clicked into a single
   reservation, so we don't have the URL pattern.
2. **Source / channel field** (Direct / Booking.com / Expedia
   / etc.) — visible in rGuest's UI as "Confirmation Details —
   Booking.com" but NOT in the `/reservations/search/date`
   payload. Lives on a per-reservation detail call we haven't
   identified.
3. **Notes / special requests** (for the Rollaway / pet / late
   arrival flag column) — same story; not in `search/date`.

**Action:** user opens one reservation in rGuest, runs
`scraper/agilysys_recon.py` (extended to target a reservation
detail URL) so we can capture the full set of API calls that
fire for that single reservation. We need: the URL itself,
plus every XHR the page makes — channel info + notes endpoint
will both show up.

### 4.2 Design decisions (locked 2026-06-09)

1. **Page split stays.** "Reservations" = booking workbench (this
   sprint). "Forecast" = room-type availability (no change).
2. **5 KPI cards on the Reservations page**, matching mockup:
   - Arrivals Today (with "N not arrived" sub-line)
   - In-house (currently staying)
   - Departures Today (with "N not checked out")
   - Staying Tonight (= in-house, not departing today)
   - **No Room Assigned** (= RES + arr=today + !roomId) — new
3. **Filter chips:** All / Arrivals Today / In-house / Departures
   Today / Future / No Room Assigned.
4. **"Future" chip shows all future reservations** — capped to
   prevent runaway display, but no operational date limit. UI
   needs to scale.
5. **Click row → right-rail "Selected reservation" panel.**
   "Today at a glance" stays above; both visible (mockup).
6. **"Open in rGuest Stay" deep-link** opens the reservation
   in rGuest's own UI in a new tab.
7. **Mobile keeps the 4 + More bottom nav** from 17.4 — ignore
   the mockup's 8-item bar.
8. **Storage strategy — two-track model.**
   - New table `reservation_history` — normalized per-reservation
     rows that grow over time. Survives `forecast_snapshot` purges.
   - `forecast_snapshot.payload` keeps the computed summary
     (KPIs, derived counts, per-room sheet) but its bulky raw
     `reservations[]` array can be pruned after 30 days
     (admin-configurable). Snapshots become metadata-only over
     time; reservation history persists.
9. **Sync optimization — three levers.**
   - **Cache `config/rooms` and `config/roomTypes`** for 24h.
     They almost never change between scrapes; refetching every
     time burns time. Cache lives in the `agilysys` client
     module (in-process).
   - **Hash metrics first.** If the metrics endpoint returns the
     same hash as last scrape, skip the heavy reservations
     pagination — return cached snapshot with updated timestamp.
   - **Cap future-date pagination.** Today rGuest returns 1600+
     future RES rows; we filter most out. Investigate whether
     `/search/date` accepts a date range so we can ask only for
     today + N days (probably 14–30) and slash the fetch by 90%.

### 4.3 Sub-sprint split

| Sprint | Scope                                                            |
| ------ | ---------------------------------------------------------------- |
| 18.0   | Recon + Sprint 18 prelog (this entry) — gather URL/channel/notes |
| 18.1   | 5 KPI cards + filter chips + restructured Reservations table     |
| 18.2   | "Selected reservation" right-rail panel + click-to-select        |
| 18.3   | Notes/Flags column + Open-in-rGuest deep link + VIP lookup       |
| 18.4   | Mobile redesign — expandable cards (4+More nav unchanged)        |
| 18.5   | `reservation_history` table + scrape caching + future-date cap   |

Sprint 18.5 is the infrastructure pass — once 18.1–18.4 prove
the UX, optimize the plumbing.

---

## 3. Sprint logs (17.1 → present)

### 2026-08-27 — Sprint 18.13: 12h hard shift cap + missed-clockout notif + AdminHome Edit hours

Bug fix + policy addition. The GM had to manually clock out a
staff member who forgot to clock out at ~13 hours on the clock.
Sprint 16.4 was *supposed* to auto-close after a while (shift +
grace, defaults to 12h). It didn't. Root cause: `runAutoClockOut`
is lazy-evaluated, only firing when an admin hits
`GET /api/admin/still-clocked-in`. No admin visit = no close. If
the GM checks the dashboard once in the morning and the next open
admin request is the following day, an overnight forgotten
clock-in can accumulate 12-24h of ghost hours before anyone
notices.

This sprint is threefold:

1. A **true background auto-close** (setInterval every 5 min) that
   enforces a **hard 12h cap** — every open entry beyond 12h gets
   closed at exactly `clock_in + 12h` and flagged
   `system_generated=true`.
2. A **one-time warning banner** on staff Home when their previous
   shift was auto-closed — copy reminds them to clock out today.
3. AdminHome's **"Past scheduled end"** card now covers both
   still-on-the-clock overdue *and* recently-auto-closed (12h cap)
   entries. Per-row action swaps from destructive "Clock out" to
   corrective **"Edit hours"** — navigates to StaffDetail and
   auto-opens the entry-edit modal (reusing Sprint 18.11 +
   18.12's plumbing).

**Backend** (`server/server.js`):

- **New `enforceHardShiftCap(maxHours=12)`** next to the existing
  `runAutoClockOut` (line ~1447). Single-round-trip UPDATE with
  `RETURNING` — no per-row loop. Sets `clock_out_time =
  clock_in_time + 12h` (backdated, so payroll sees the capped
  duration, not "however long it took the system to notice") +
  `system_generated = TRUE`. Named for the guarantee it provides,
  not the action (contrast the vaguer `runAutoClockOut` from 16.4).
- **Background scheduler** at server boot: `setInterval` every
  5 minutes, `isRunning` guard so a slow DB tick can't overlap the
  next fire, try/catch that logs (never throws) so transient DB
  blips don't kill the timer. Also fires once at boot so a fresh
  deploy doesn't leave the first 5 minutes uncovered. Non-zero
  close batches log to `console.info` for ops visibility.
- **Lazy triggers** for freshest possible view: `enforceHardShiftCap`
  now also runs at the top of `/api/me/hours` (staff-side: catches
  the caller's own forgotten clock-in before we compute their
  hours + notif flag) and `/api/admin/still-clocked-in` (admin-side:
  runs alongside the existing `runAutoClockOut` call).
- **`/api/me/hours` extension.** Now returns
  `previousShiftAutoClosed: { entry_id, clock_in_time,
  clock_out_time, hours } | null`. Query: most recent
  `system_generated=true` closed entry within the last 48h.
  Client-side dismissal via localStorage (no DB writes).
- **`/api/admin/still-clocked-in` extension.** Now returns
  `recentlyAutoClosed[]` alongside `overdue[]`. Query: all
  `system_generated=true` closed entries within the last 24h for
  active/non-deleted users. Each row carries the same shape as
  `overdue` plus a computed `hours` field for display.

**Frontend — Staff Home** (`src/pages/Home/index.js` +
`Home.css`):

- Reads `previousShiftAutoClosed` from `/me/hours`.
- Renders `.home-auto-close-warning` (soft-amber panel matching
  the note-card palette from Sprint 18.8, in-flow above the
  greeting — not fixed like `.home-notif` because it's persistent
  until dismissed and shouldn't obscure the clock button).
- Copy: "You didn't clock out last shift. Your shift on **{date}**
  was auto-closed after 12 hours. Please remember to clock out at
  the end of your shift today."
- Dismiss button writes the entry_id into
  `localStorage['hop-acked-auto-close-ids']` (an array of ids so
  historical acks accumulate). `ackedAutoCloseIds` Set is seeded
  from localStorage at mount so refreshes don't re-show.

**Frontend — AdminHome** (`src/pages/AdminHome/index.js` +
`AdminHome.css`):

- New `recentlyAutoClosed` state, populated from the extended
  `/still-clocked-in` response.
- **Card metric** = `overdue.length + recentlyAutoClosed.length`.
  Meta line adapts:
  - Both empty → "everyone is on schedule"
  - Both present → "N on the clock · M auto-closed"
  - Only overdue → "still on the clock"
  - Only auto-closed → "N auto-closed at 12h"
- **Panel** splits into two `.adm-overdue-subhead` sections when
  both lists have entries: **"Still on the clock"** (existing
  rows) + **"Recently auto-closed (12h cap)"** (new rows). Empty
  state copy updated to mention both categories + the Edit hours
  affordance.
- **Per-row button** is now **"Edit hours"** for both sections.
  Click → `goTo('staffDetail', { userId: row.user_id,
  editEntryId: row.entry_id })`. The old "Clock out" button on
  the overdue panel is retired; the `clockOutStaff` handler stays
  because the *on-clock* panel (a separate, active-shift view)
  still uses it for direct force-out.
- **Auto-closed row styling**: `.adm-overdue-row-closed` uses
  the same amber palette as the staff-side warning (`#fffbeb` bg,
  `#fde68a` border) so the two surfaces read as related. Reserves
  the red hover state for still-on-clock rows (those are
  actively ticking upward).

**Frontend — StaffDetail** (`src/components/AdminPanel/StaffDetail.js`):

- Accepts new prop `editEntryId` — spread automatically from
  `view.params` via `AdminShell.js:87`, no shell changes needed.
- New `hasAutoOpenedRef` + `useEffect([editEntryId, entryLoad,
  entries])`: once entries load and the target entry is found,
  fires `openEntryEdit(entry)` exactly once per mount. The ref
  gate prevents the modal from re-opening after the admin
  dismisses it (which would otherwise happen because
  `openEntryEdit` sets state that re-renders and re-runs the
  effect).

**No schema changes.** `time_entries.system_generated` already
exists (migration 023, Sprint 16.4). Both the shift+grace close
and the new 12h hard cap set the same flag — UI doesn't need to
differentiate. If a report ever needs to attribute closes to a
mechanism, it can infer from `(clock_out - clock_in)`: exactly
12h → hard cap; other durations → shift+grace.

**What this sprint didn't touch.**

- The existing `runAutoClockOut` (shift+grace) mechanism stays
  in place as-is. It's still lazy-triggered from
  `/still-clocked-in`, and only activates when
  `auto_clock_out_enabled='true'`. For hotels that opt in, it
  fires *earlier* than 12h (e.g. 8h shift + 4h grace = 12h — same
  as our cap; but 4h shift + 2h grace = 6h — closes earlier).
  The 12h hard cap is a universal safety net; the shift+grace
  mechanism is an optional earlier close policy.
- Per-shift/per-role custom max durations. If different roles
  eventually need different caps (e.g. HK 10h, FD 12h), we'd
  need a per-role/per-shift-template setting. Deferred.

**Verified.** `npm run build` compiles clean (+564 B JS / +230 B
CSS). Server `require()` parses without error (EADDRINUSE when
probed = live dev server bound to 3001, which means the module
loaded successfully).

**End-to-end test plan for the GM:**

1. Force a stuck entry: manually update DB so a test staff has
   `clock_in_time = NOW() - INTERVAL '13 hours'`, `clock_out_time
   = NULL`. Wait ≤5 minutes or refresh the admin dashboard —
   should show as auto-closed at exactly 12h with
   `system_generated = TRUE`.
2. Log in as that staff → amber banner appears on Home with the
   correct date. Dismiss → refresh → stays gone.
3. As admin, click "Past scheduled end" — see the auto-closed
   entry in the "Recently auto-closed" section. Click "Edit
   hours" → lands on StaffDetail with the entry-edit modal open,
   clock-in / clock-out pre-filled. Adjust clock_out, save,
   confirm DB update + audit_logs entry.

---

### 2026-06-29 — Sprint 18.12: Staff page layout polish + themed datetime picker

Two follow-ups on 18.11. First fix is layout — the new "Add new
staff member" pill from 18.10 was burning its own row at the
end of the controls; the GM wanted it on the same line as Sort,
and Include inactive moved up into the chips row (separated
from the dept chips by a small vertical rule). Second is the
datetime picker in the entry-add modal — the native
`datetime-local` input renders the OS picker, which looks
foreign next to our chip-pill control language. Built our own.

**Staff page layout** (`StaffManager.js` + `AdminPanel.css`):

Before this sprint the rows were:
1. KPI cards
2. Search + dept chips
3. *(divider)*
4. Include inactive · Sort · Add new staff

After:
1. KPI cards
2. Search + dept chips · *|* · Include inactive
3. *(divider)*
4. Sort · Add new staff

- New `.staff-mgr-chip-sep` — a 1px × 18px vertical rule
  rendered inline inside `.staff-mgr-chips`. Reads as "still
  in the same row, but conceptually a different control" —
  the dept chips are filter values, Include inactive is a
  filter scope modifier. The rule says "these are siblings but
  not peers."
- Dropped the toggle's old `margin-right: auto` (which was a
  Sprint 11.4 compromise for the old post-divider row).
  Now it sits inline alongside the dept chips at the natural
  flex flow position.
- Add staff button keeps its `margin-left: auto` so it still
  pins to the right of the post-divider row. With Include
  inactive gone from that row, Sort floats to the left,
  Add staff to the right — the row reads cleanly as
  [Sort] · *(slack)* · [Add staff].

**HopDateTimePicker** (new shared component):

File: `src/components/shared/HopDateTimePicker.js` +
`HopDateTimePicker.css`. Drop-in replacement for `<input
type="datetime-local">` — same string shape on the wire
(`YYYY-MM-DDTHH:MM`), so the existing form state in StaffDetail
didn't need a single change beyond swapping the JSX.

Anatomy:

- **Trigger** — chip-pill button, calendar emoji + formatted
  value + ▾ caret. Matches the visual language of
  `DropdownSelect` (the existing shared popover control from
  Sprint 13.3). Open state highlights the trigger with the
  accent-bg + accent-alt border.
- **Calendar grid** — 6 rows × 7 columns (fixed height so the
  popover doesn't jump when navigating months). Lead/trail days
  from the prev/next month render at 50% opacity so the
  current month is the visual anchor. Today gets an inset ring,
  the selected day gets a solid accent fill.
- **Time row** — separated from the calendar by a soft top
  border. Two numeric inputs (HH, MM) with the browser's
  spinner stripped (`-webkit-appearance: none` + `-moz-
  appearance: textfield`), separated by a monospaced `:`.
  AM/PM is a two-button segmented toggle to the right (chip-
  shape, accent-fill when active).
- **Footer** — Clear (left-pinned, soft-red), Now (jumps to
  the current wall-clock moment), Done (accent-primary,
  closes the popover). Clear only renders when `allowEmpty`
  AND a value is already set — keeps the UI tidy.

Props (mirror DropdownSelect where they overlap):
- `value`, `onChange` — datetime-local string shape
- `required` — empty trigger draws a red border in this state
- `allowEmpty` — toggles whether Clear is offered (off for
  Clock In since payroll can't have a punch without a start;
  on for Clock Out since "in progress" is valid)
- `minuteStep` — passed to the minute input's `step` (default 1)
- `align` — `'left' | 'right'` for the popover anchor edge
- `placeholder` — shown in the trigger when no value

Implementation choices:

- **Why not the native picker?** Same reasoning as Sprint 6.7's
  `.hop-radio` / `.hop-check`: the native widget is correct
  behaviorally but visually foreign. For datetime the gap is
  bigger because every OS renders a different picker (iOS spins,
  macOS pops a small calendar, Windows is a third thing). Our
  custom one is consistent across every device the GM uses.
- **Why keep the time-side native `<input type="number">` for
  HH/MM?** Behavioral cost of a fully-custom number scroller
  isn't worth it — `<input type="number">` carries keyboard
  arrows, hold-to-repeat on mobile, IME compatibility, etc.
  Just stripped the spinner chrome and bounded the values in
  the `onChange` handler.
- **Local-vs-UTC handling.** Same trick the native input uses:
  the value is a wall-clock string, not an instant. Callers
  convert to ISO via `new Date(value).toISOString()` when
  posting to the server (which is exactly what StaffDetail
  already did with the native input — no changes needed).

**Wiring** (`StaffDetail.js`):

- One new import line.
- Two `<input type="datetime-local">` → two `<HopDateTimePicker>`
  in the entry-edit/add modal. Clock In gets
  `required allowEmpty={false}`; Clock Out gets `allowEmpty`
  (so the FD can leave it open for an in-progress shift).

**What 18.12 didn't touch.**

- Other native `<input type="date">` / `<input
  type="datetime-local">` sites in the admin app (calendar
  page's for_date picker, settings forms). The
  HopDateTimePicker is now available; swapping the rest is a
  separate cleanup pass.
- The picker's mobile layout — at 280px wide it fits on
  every phone we've tested, but if/when we want it to render
  full-screen on small viewports we'd add a media-query branch.

**Verified.** `npm run build` compiles clean (+1.46 kB JS /
+858 B CSS — most of that is the new picker component, which
is expected since it's a from-scratch addition).

---

### 2026-06-29 — Sprint 18.11: manual time-entry creation + mobile nav swap

Two unrelated quick fixes after the GM tested 18.10 in production
for a week.

**Problem 1 — no way to backfill a missed shift.** A staff member
forgot to clock in *and* clock out for an entire 8-hour shift.
The admin could open StaffDetail, see all their existing punches,
edit any one of them, but had no path to insert a new row.
Payroll cycle was the next morning and the GM had to skip that
staff's pay for the week (or fudge an unrelated entry up by 8h,
which would also have skewed the OT split).

**Problem 2 — Forecast lives on the mobile bottom nav, Staff
doesn't.** The mobile bottom tabs were [Home / Calendar /
Reservations / Forecast / More]. But the GM uses Staff far more
on mobile than Forecast — manual time-entry adds (Problem 1
above!), recent-hire lookups, OT approvals. Forecast is mostly
desk-bound (10-day occupancy projection). Swap them: Staff
becomes a primary tab; Forecast falls into the More sheet.

**Backend.** New endpoint
`POST /api/admin/employees/:id/time-entries` (admin-only,
requireAuth + requireRole('admin')):

- Validates `clock_in_time` required + valid; `clock_out_time`
  optional but if present must parse and be after clock_in.
- **Overlap check** before insert. Uses Postgres's native
  `OVERLAPS` operator with `COALESCE(clock_out_time,
  'infinity'::timestamptz)` so open-ended (in-progress) entries
  are treated as ending at infinity — both for the new entry
  being added AND for existing rows in the table. A new entry
  proposed inside another shift's window returns 409 with
  `{code: 'overlap', conflict: { entry_id, clock_in_time,
  clock_out_time }}`. Frontend uses `conflict` to show the
  admin *which* punch is in the way, not just "an overlap
  exists somewhere".
- Inserts with `manual_entry = true` so the existing payroll
  pipeline knows it wasn't from the clock kiosk; audit-logs as
  `admin_time_entry_create` with the admin's username folded
  into `new_data` (mirrors the PATCH audit pattern).
- 404 explicit if the user_id doesn't exist (clearer than the
  raw FK violation Postgres would otherwise return).

**Frontend** (`StaffDetail.js`):

- New `entryMode` state ('create' | 'edit') drives the modal's
  title, copy, submit handler, and primary button label. Same
  modal markup; the create path POSTs to the new endpoint, the
  edit path keeps PATCHing the existing one.
- New `entryConflict` state holds the colliding row returned
  by a 409 so the modal can render a soft-red callout showing
  the date range + time window of the overlapping punch. When a
  conflict is present, the plain `<admin-error>` is suppressed
  to avoid duplicating the same message twice.
- `openEntryCreate()` initializes the modal in create mode with
  blank fields (sentinel `{entry_id: null}` so the render guard
  `{editEntry && …}` still fires). `openEntryEdit(row)` keeps
  the old edit behavior; both call `setEntryConflict(null)` to
  clear stale conflicts when reopening.
- New `.emp-entries-head` row wraps the section title + the
  new "+ Add entry" pill on the right (accent-colored, matches
  the language of the inline add-staff button from 18.10).

**Mobile nav** (`AdminShell.js`):

- Single-line change to the NAV array: dropped `mobilePrimary`
  from `forecast`, added it to `staff`. The existing Sidebar
  logic auto-collapses non-primary items into the More sheet,
  so Forecast moves there with no other code changes. Desktop
  sidebar still shows everything (the flag is mobile-only).

**CSS** (`AdminPanel.css`):

- `.emp-entries-head` (flex row, space-between for the title +
  add button).
- `.emp-entry-add` (accent-pill, mirrors the inline Add Staff
  button visual language).
- `.entry-edit-conflict` + `.entry-edit-conflict-meta` (soft-red
  panel inside the modal; monospaced meta line for the
  conflicting time range so it reads as data, not prose).

**What 18.11 didn't touch.** The PATCH override endpoint
(existing edit flow) still doesn't check overlaps when the admin
*moves* an entry — if an admin edits row A's window to land on
row B's window the database accepts it. Scoping discipline: the
user asked for the manual-add overlap guard, and the edit-side
overlap is a separate (and rarer) case. If we want to add it
later it's a copy-paste of the same OVERLAPS query with
`AND entry_id != $X` to exclude the row being edited.

**Verified.** `npm run build` compiles clean (+315 B JS / +117
B CSS). Server `require()` parses without errors (EADDRINUSE
when probed = dev server already bound to 3001, which means
the module loaded successfully).

---

### 2026-06-17 — Sprint 18.10: payroll export format + staff page layout polish

Quick turn after the GM signed off on the workbook structure.
Two parts: the Excel sheets get restructured to match the GM's
mock (Total Hours at top, per-row layout below), and the Staff
page reshuffles its action controls so the page header and the
controls row each carry one primary action.

**Excel export.** Previous structure put per-row data first
(Name / Department / Date / Day / Clock In / Clock Out / Hours)
then a summary block at the bottom. The GM wants the summary on
top and the table to feel like a timecard. Each sheet is named
for the staff member, so Name + Department columns are dead
weight (just repeated across every row of that tab) — dropped.

New per-sheet layout:

```
Row 1 : "Total Hours Worked"
Row 2 : <value>
(if hourly rate set on the staff record:)
Row 4 : "Hourly Rate"   Row 5 : <rate>
Row 7 : "Total Pay"     Row 8 : <pay>
(blank row)
Header: Date(s) | Time In | Time Out | Hours Worked | Overtime
        [| Hourly Rate | Pay] when rate set
Data rows
```

- **Overtime column** is always present. Cell is blank when
  the row doesn't push the week over threshold; cell contains
  the OT hours (e.g. `1.25`) when it does. Computed with a new
  `computePerRowSplit()` helper that walks rows chronologically
  and tracks running weekly totals — the portion of each row
  that crosses the threshold gets attributed to that row.
- **Pay columns are conditional**. `base_hourly_rate == null` =
  the staff record doesn't track pay, so we skip both Hourly
  Rate and Pay columns entirely (column-existence reflects
  whether the GM has chosen to use the pay feature for that
  staffer). When rate IS set, per-row Pay uses the FLSA-standard
  formula: `regular × rate + overtime × rate × 1.5`. Top-of-
  sheet Total Pay sums those across all rows.
- Column widths adjusted (no Name/Dept means more breathing
  room for the timestamp columns).
- Date formatting changed to `M/D/YY` to match the GM mock
  (`4/6/26` not `2026-04-06`).

**What we dropped from the old summary block.** The bottom
block had a "Regular Hours" + "Overtime Hours" row pair that's
now redundant — the Overtime column shows per-row OT and the
top block shows the total. We also dropped the literal "TBD"
OT pay placeholder since OT pay is now folded into the per-row
Pay value at 1.5×.

**Staff page layout.** Before: 4 KPI cards → filter row (search +
chips + divider + toggle + sort + Export) → full-width "Add new
staff member" tile → list. The full-width Add tile burned 70+
px of vertical space for a single action; Export sat shoulder-
to-shoulder with the filter controls even though it isn't a
filter.

After:

- **Topbar**: `‹ Home · Staff · … · ↓ Export`. Export gets the
  conventional "page action" slot, right-aligned via
  `margin-left: auto` on a new `.staff-mgr-export-topbar`
  modifier class.
- **Actions row**: `Include inactive · Sort · Add new staff`.
  The toggle keeps its existing `margin-right: auto`; the new
  `.staff-mgr-add-inline` button mirrors with `margin-left:
  auto` so the two `auto` margins split the row, leaving Sort
  floating between them.
- The full-width `.staff-mgr-add-tile` JSX is gone (and so is
  the redundant collapsed-tile branch — the inline button IS
  the trigger now). The expanded form still renders below
  the actions row when `showAdd === true`, so the layout just
  pushes the list down when the admin starts a new entry.
  Saves ~70 px of resting height.

**CSS** (`AdminPanel.css`):

- `.staff-mgr-export-topbar { margin-left: auto; }` — pins
  Export to the title row's right edge without touching the
  popover positioning (the popover is still anchored under the
  trigger via the existing `.staff-mgr-export-menu` rules).
- `.staff-mgr-add-inline` + `.staff-mgr-add-inline-icon` — pill
  button using the accent color, with a small circular
  semi-transparent `＋` glyph on the left. Disabled state at
  0.55 opacity when the form is already open (prevents stray
  clicks while the form is showing).

**Verified.** `npm run build` compiles clean (+157 B JS / +114
B CSS — the JSX move was nearly zero-cost; most of the budget
went to the new per-row OT split + conditional pay columns).
Per-row OT logic verified by manually walking the math: a row
that starts at 38h-into-week, working 4 hours → 2h regular + 2h
OT. The helper returns `{ regular: 2, overtime: 2 }`. ✓

---

### 2026-06-11 — Sprint 18.9: rate plan catalog + service requests

Two final pieces from the recon backlog: the bulk Reservations
table's Channel column finally shows friendly names instead of
opaque codes ("Best Available Rate" instead of "BAR"), and the
detail panel surfaces open service requests so the FD knows
when HK or maintenance is mid-task on a room before the guest
asks.

**The channel-column rabbit hole.** The recon proved
`sourceInfo.bookingSources[]` (the real channel field) lives
only on the per-reservation detail endpoint — too expensive to
fan out 200×/scrape. But the bulk search response already
carries `ratePlanCode`, and `/rate-service/.../ratePlans` is a
single 836-entry catalog with clean `{code, name}` pairs that's
cacheable for 24h. So: cache the catalog, join in compute.js,
swap `source = ratePlanCode` → `source = catalog.name || code`.
One extra request on cache miss, zero on cache hit. The raw
code stays around as a new `ratePlanCode` field for future
channel logic (`bookingChannelIds[]` on each rate plan could
later resolve to "Expedia"/"Booking.com" if we want).

**Service requests.** Three sibling endpoints
(`servicerequests/{guest|housekeeping|maintenance}/byReservation`)
each return an array. The recon hit the no-query variant
(returned 10 property-wide items); we pass `?reservationId={id}`
to filter server-side and stamp `_kind` on each item before
returning. Each branch is independently catch-wrapped so a
single 4xx collapses to `[]` rather than blowing up the
aggregate. Open vs closed is inferred from `statusId` — rGuest
prefixes closed states with `C-`; unknowns default to "open"
since the FD would rather see one ghost ticket than miss a real
one.

**Backend.** `server/agilysys/client.js`:

- `getRatePlans()` — 24h module-cache slot
  (`_refCache.ratePlans`), same pattern as rooms / roomTypes /
  vipStatuses. Single GET; logs the count on fetch + cache_hit.
- `getServiceRequestsByReservation(reservationId)` — parallel
  fan-out over the three kinds, returns flat array with `_kind`
  injected. Per-kind catch + log so partial failure is
  graceful.
- `fetchReservationFullDetail` — `serviceRequests` joins the
  parallel batch (independent of accountId/profileId so it
  fires immediately).
- `fetchForecastInputs` — `ratePlans` joins the existing
  4-way parallel batch (`rooms, roomTypes, reservations,
  metrics, ratePlans`). Soft-fail to `null` if the rate-service
  is down — the rest of the scrape still ships.

**compute.js.**

- New optional input `ratePlans` (defaults gracefully to `[]`).
- `ratePlanByCode = new Map(ratePlans.filter(p=>p.code).map(p=>[p.code,p]))`.
- Per-reservation: `source = ratePlanByCode.get(code)?.name || code`.
  Raw code preserved as a sibling `ratePlanCode` field.

**runScrape.js.** Wires `inputs.ratePlans → computeForecast`.

**Frontend.** `src/components/Forecasting/index.js`:

- `fmtDetail_serviceRequests(arr)` — buckets into `{items, open,
  closed, totalOpen, totalClosed}`. The `closed` check accepts
  `C-…` / `CLOSED` / `COMPLETED` so future status renames don't
  silently mis-bucket.
- `SelectedReservation` desktop rail — a new Service Requests
  section above the stay-history badges. Header includes a
  bold-amber "· N open" callout when totalOpen > 0. Each row
  is a kind-color-dotted line: HK = blue, maint = orange,
  guest = purple. Closed rows render with strike-through +
  reduced opacity so history stays visible without dominating.
- `ReservationCard` mobile — gains an "Open requests" row with
  a count pill. Doesn't try to list individual requests on
  mobile; if FD needs the detail they tap into the desktop view.

**CSS.** `.fc-svc-list / -row / -dot / -kind / -status /
-ticket / -closed / -open-count`. Kind dots use the same hue
family as the existing flag pills (HK adjacent to the
turquoise/sky range, maintenance with the orange-construction
hue, guest as a soft purple to read as "guest-originated").

**What this leaves on the table.**

- `bookingChannelIds[]` on each rate plan → OTA brand name
  (Expedia / Booking.com). The catalog
  `/booking-service/bookingChannels` exists but wasn't in this
  recon; would need one more 24h-cached fetch + a per-rate-plan
  channel attribution before showing it in the column.
- Guest preference catalog — the `/preferences/GUEST` +
  `/preferenceCategories` endpoints both returned empty arrays
  at Snoqualmie. Wiring stays simple to add later (24h cache
  pattern); skipped here since there's nothing to render.

**Verified.** `npm run build` compiles clean (+464 B JS / +187
B CSS). Module load on `server/agilysys/client.js` exports
`getRatePlans`, `getServiceRequestsByReservation`,
`fetchForecastInputs`, `fetchReservationFullDetail` as
functions.

---

### 2026-06-11 — Sprint 18.8: finishing the rich detail panel

Closes the loop on Sprint 18.7 by shipping the items that were
explicitly deferred (card on file) plus the fields the recon
caught but 18.7 didn't surface (occupancy, rate rollup, loyalty,
additional guests, comment text, expanded stay history).

**Backend.** `server/agilysys/client.js` gains two more methods
and a second-stage parallel batch in the orchestrator.

- `getAccountDetails(accountId)` — pulls the full folio account.
  We only need `paymentSettings.paymentInstruments[]` for now,
  but returning the whole object means later sub-sprints can
  surface charges / authorizations / split-pay rules without
  another round trip.
- `getPaymentInstrument(accountId, instrumentId)` — masked card
  metadata: `accountNumberLast4`, `cardIssuer` (UUID),
  `cardIssuerName`, `cardType`, `cardHolderName`,
  `expirationYearMonth`.
- `fetchReservationFullDetail` now runs two parallel batches:
  batch 1 (existing fan-out) gains `accountDetails`; batch 2
  dereferences each instrument ID in parallel. Total wall-time
  stays ~2 round trips because batch 1 carries the long pole.
  Null vs empty-array semantics for `paymentInstruments`: null
  = no account or fetch failed (UI shows nothing), empty array
  = account but no card (UI confidently shows "No card on file").

**Frontend helpers** (`src/components/Forecasting/index.js`):

- `fmtDetail_occupancy` — `"2 adults, 1 child"` from
  `reservation.occupancy.{totalAdults, totalChildren, totalInfants}`.
- `fmtDetail_loyalty` — `"Stash Hotel Rewards · Gold"` from
  `profile.loyaltyDetails.loyaltyProfiles[0]`. Prefers `isDefault`.
- `fmtDetail_additionalGuests` — array of names from
  `reservation.additionalGuests[]`. Tolerates both flat and
  `personalDetails`-nested shapes since rGuest returns either.
- `fmtDetail_comments` — flattens the comments dict
  (`{general: [...], housekeeping: [...]}`) into a flat
  `{type, text}` array, dropping blank entries.
- `fmtDetail_paymentInstruments` — `{last4, issuer, exp, holder}`
  tuples. Tolerates `expirationYearMonth` in both `"2027-12"`
  and `"202712"` forms; falls back through
  `cardIssuerName → cardType → "Card"`.
- `fmtDetail_rateRollup` — total + nights + avg from
  `reservation.rateSnapshots[]`. Null for groups/comps.
- `fmtDetail_stayHistoryBreakdown` — `"3 past · 1 future · 2 no-shows"`.

**Desktop rail panel** (`SelectedReservation`):

- **Guest details** section gains a Loyalty row (only renders
  when present so quiet guests don't get an empty field).
- **Booking** section gains Occupancy + Room charges (rate
  rollup with `(N × avg)` subtitle), and a Walk-in pill next to
  Channel when `sourceInfo.walkIn === true`.
- **Folio** section gets a card-chip row below the balance grid:
  dark-gradient pill with brand / `•••• 4242` / `exp 12/27`,
  monospaced. Empty-array case renders a muted "No card on file"
  chip in the same slot.
- **Additional guests** section — bulleted list, only when
  populated.
- **Notes** section replaces the old `{N} notes` badge with
  actual cards (warm-amber, type label uppercased, `white-space:
  pre-wrap` so multi-line FD notes don't collapse).
- Stay history badge now shows the breakdown when `pastCount=0`
  but other counters are non-zero (no-shows etc).

**Mobile expanded card** (`ReservationCard`):

- Adds Occupancy to the rich grid.
- Adds a card-chip row below the grid (same component as
  desktop, just stacked) so FD on phone can still see the card
  on file at a glance.
- Skips the long-form sections (notes / additional guests /
  loyalty) — those are best read on the rail panel.

**CSS** (`Forecasting.css`):

- `.fc-card-chip` — dark-gradient pill (`#1f2937 → #374151`)
  with monospaced number; `.fc-card-chip-empty` swaps to a soft
  italic look so the absence of a card reads as informational
  rather than alarming.
- `.fc-note-card` — warm-amber panel (`#fffbeb` bg, `#fde68a`
  border) so notes visually anchor as "advisory" against the
  cooler factual grid above.
- `.fc-addl-guests` — plain bulleted list, no heavy styling.

**What's left** (probably 18.9+):

- Channel column on the bulk table still shows `ratePlanCode`.
  Switching to `sourceInfo.bookingSources[]` requires the bulk
  scrape to fetch reservation detail for every row — too
  expensive at 200 rows × 5 calls. Compromise option for later:
  add a single `sourceInfo` field to the bulk-search shape if
  rGuest's search response carries it (recon didn't capture
  the search-response shape carefully enough to confirm).
- Card-issuer UUID → brand mapping. We trust
  `cardIssuerName` from the response for now; if rGuest stops
  populating that, populate `_CARD_ISSUER_NAMES` from the
  `/cardIssuers` catalog.

**Verified.** `npm run build` compiles clean (+1.3 kB JS,
+237 B CSS — well within budget for what we shipped). Module
load on `server/agilysys/client.js` exports
`getAccountDetails`, `getPaymentInstrument`, and
`fetchReservationFullDetail` as functions.

---

### 2026-06-04 — Sprint 18.7: per-reservation detail on demand

Ships the rich rail-panel content the 18.6.1 recon unlocked.
On-demand only — no bulk scrape. When the user clicks a row (or
expands a mobile card) the frontend calls a new backend
aggregator that fans out to 5 rGuest endpoints in parallel and
returns a single envelope.

**Backend.** `server/agilysys/client.js` gains 6 methods:

- `getReservationDetail(id)` — the full reservation incl.
  `accountId`, `sourceInfo.bookingSources`, occupancy, rate
  snapshots, primary guest profileId.
- `getGuestProfile(profileId)` — email/phone/address/loyalty.
- `getReservationComments(id)` — long-text notes.
- `getAccountBalances([accountId])` — folio totals. POST body
  shape unknown from recon (response-only logging) so we send the
  structured `{accountStatementMap: {id: {}}}` form first and
  fall back to `{accountIds: [...]}` on 4xx. Whichever shape the
  endpoint accepts will get cached by the request-success
  pathway — second & subsequent calls skip the fallback.
- `getStayHistory(profileId)` — `pastCount` powers the
  "5th visit" badge.
- `fetchReservationFullDetail(id)` — orchestrator. Sequentially
  awaits the reservation (need `accountId` + `profileId`), then
  `Promise.all`s the other four. Each branch is independently
  `.catch()`-wrapped so a single 403 doesn't blank the panel —
  partial results render whatever did succeed.

`server/server.js` exposes
`GET /api/admin/reservations/:id/detail` — admin-only, UUID-
guarded, returns `{success, detail, logs}`.

**Frontend.** `src/components/Forecasting/index.js`:

- `useReservationDetail(id)` hook — null id skips the fetch
  entirely (matters for mobile, where collapsed cards mustn't
  preflight). In-memory cache at module scope: `Map<id, {data,
  fetchedAt}>` with a 5-min TTL. The cache survives component
  remounts (tab-switching) so the panel re-opens instantly.
- `SelectedReservation` (desktop right rail) renders a new
  "Guest details" + "Booking" + "Folio" section below the
  existing row-level grid. Loading state is inline italic copy;
  errors render in a soft-red callout. The old "View details"
  and "Guest folio" placeholder buttons retire — folio now
  ships inline.
- `ReservationCard` (mobile) mirrors the same fields in a
  compact 1-column grid, fetched only when the card is expanded.
- Helpers `fmtDetail_email/_phone/_address/_channel/_balance` and
  `fmtMoney` keep the rendering logic shallow; each prefers the
  `isDefault`-flagged entry and falls back to the first.

**CSS.** `Forecasting.css` adds `.fc-selected-rich`,
`.fc-selected-rich-head`, `.fc-selected-grid-rich`,
`.fc-selected-loading`, `.fc-selected-error`,
`.fc-selected-badges`, `.fc-balance-due` (amber),
`.fc-balance-good` (green), plus mirror selectors for the
mobile card. Dashed top-border separates the on-demand block
from the static row metadata so the user can tell at a glance
which fields just loaded.

**What's deferred to 18.8+.**

- Card-on-file (•••• 4242 12/27) — needs the account-details →
  instrument-id flow that the recon caught at `accountDetails`
  but didn't decode the masking format.
- Channel column upgrade — table currently shows `ratePlanCode`;
  swapping to `sourceInfo.bookingSources[]` belongs in a
  separate sub-sprint because it touches the bulk scrape too.

`npm run build` compiles clean (warnings are all pre-existing
unused-imports). Server `require()` loads without syntax errors.

### 2026-06-11 — Sprint 18.6.1: per-reservation recon analysis

User ran the 3-page recon at
`scraper/recon/20260611-143158`. Opening a single reservation
fires **249 distinct JSON XHRs** — rGuest is *very* chatty.
~80% of those are config/feature-flag/catalog calls we already
fetch elsewhere; the rest fall into 6 buckets that map cleanly
to "rich detail panel" use cases.

**1. The reservation, in full.**

```
GET /reservation-service/v1/tenants/{tid}/properties/{pid}/reservations/{id}
    ?travelAndTransportInfo=false&updateCasinoDetails=true
```

Returns the same shape as the search/date item PLUS:
- `accountId` — the folio account UUID. Critical: lots of other
  calls key off this.
- `sourceInfo` — `{bookedBy, walkIn, groupId, bookingSources[],
  agentProfileIds[], associatedTravelAgents}`. **Channel /
  source for the table column lives in `bookingSources[]`**
  (empty for Rosa = Direct/group; would contain `Booking.com` /
  `Expedia` / `Agoda` for OTAs).
- `trackingInfo` — `{segmentCode, guestType}` (both UUIDs).
- `occupancy` — adults / children / age categories with totals.
- `rateSnapshots[]` — per-night rate + cancellation/deposit
  policy references. Useful for "total to be paid" rollups.
- `emailDetails`, `loyaltyProgramsInfo`, `additionalGuests`,
  `verifiedGuestIdentityIds`.

**2. Full guest profile.**

```
GET /profile-service/v1/tenants/{tid}/properties/{pid}/guests/{guestProfileId}
    ?updateCasinoDetails=true
```

`{guestProfileId}` we already have on each reservation via
`primaryGuestProfileId` (surfaced in 18.5). Returns:
- `personalDetails: {firstName, lastName, ...}`
- `addressDetails: {addresses[]}`
- `phoneDetails: {phones[]}`
- `emailDetails: {emailAddresses[{emailAddress, isDefault, isPrivate, ...}]}`
- `loyaltyDetails: {loyaltyProfiles[]}`
- `customFieldDetails`, `preferenceDetails`, `compCertificateDetails`,
  `smsPreferences`, `emailPreferences`, ...

Rosa's profile had `personalDetails + emailDetails` populated;
`addresses` / `phones` / `loyaltyProfiles` were empty. Real
guests will have more.

**3. Reservation comments / notes.**

```
GET /comment-service/tenants/{tid}/reservation/{reservationId}
```

Returns a dict (empty `{}` for Rosa). Rollaway-style notes /
special requests live here. Tied also to:

```
GET /comment-service/tenants/{tid}/config/commentTypes
```

(catalog — cacheable).

**4. Folio / charges / balance.**

```
GET  /account-service/v1/tenants/{tid}/properties/{pid}/accounts/{accountId}/details
GET  /account-service/v1/tenants/{tid}/properties/{pid}/accounts/{accountId}/foliosDetail
POST /account-service/v1/tenants/{tid}/properties/{pid}/accounts/balances
```

The balances endpoint is the cleanest for "what does the FD see
on Rosa's folio right now?". Sample for Rosa:

```json
{
  "subtotal": 468.0,
  "tax": 56.62,
  "paid": -262.31,
  "total": 262.31,
  "badDebt": 0
}
```

So: $468 + $56.62 tax = $524.62 charged, $262.31 paid (deposit),
$262.31 still owed at checkout. Real-money numbers we can render
in the rail panel.

**5. Payment card on file.**

```
GET /payment-service/tenants/{tid}/properties/{pid}/accounts/{accountId}/paymentInstruments/{instrumentId}
```

Returns `accountNumberLast4`, `cardIssuer`, `cardType`,
`cardHolderName`, `expirationYearMonth`. Instrument IDs come
from the account `/details` response (`paymentSettings`).

**6. Stay history.**

```
GET /reservation-service/v1/.../reservations/guest/{guestProfileId}/stayHistory
```

Returns counts: `totalNoPrevStays, totalNoShows, totalCancelled,
currentCount, futureCount, pastCount`. Lets the FD see
"returning guest" at a glance.

Plus housekeeping/maintenance service requests by reservation
ID (`/servicerequest-service/.../servicerequests/{type}/byReservation?reservationId={id}`),
which are real but probably outside our v1 scope.

**Plan for 18.7 (Reservations rail: rich detail panel).**

This is where the "Selected reservation" panel earns its space.
Architecture: detail is fetched **on demand** when a row is
clicked, not bulk-scraped. Keeps the regular scrape lean (no
per-reservation fan-out × 200 rows) and the data stays fresh.

Sub-tasks:

- **Server**: Add 6 client methods to `server/agilysys/client.js`:
  `getReservationDetail(id)`, `getGuestProfile(profileId)`,
  `getReservationComments(id)`, `getAccountDetails(accountId)`,
  `getAccountBalances(accountIds)`,
  `getPaymentInstrument(accountId, instrumentId)`,
  `getStayHistory(profileId)`.
- **New backend endpoint**:
  `GET /api/admin/reservations/:id/detail` — orchestrates the
  6 calls in parallel (fetches reservation → uses accountId +
  profileId for the other 5 in parallel), returns one shaped
  response. ~6s round-trip total since they're parallel.
- **Frontend**: `useReservationDetail(id)` hook fetches on
  selection change; loading state while in flight; renders into
  the right-rail `SelectedReservation` panel (desktop) AND the
  expanded mobile card.
- **Rail panel additions**: Channel / Booked by / Booked walk-in
  / Email / Phone / Address (if present) / Folio balance (the
  $262.31) / Card on file (•••• 4242 expires 12/27) / Stay
  history badge ("5th visit").
- **Caching**: cache detail responses in-memory on the frontend
  by reservation ID; expire after 5 min so progress updates
  reflect changes.

**Files touched (this 18.6.1 turn — analysis only, no code):**
- `claude-instructions/part4.md` — this entry.

**Verified.** Recon analysis only; no code shipped. Endpoint
shapes confirmed against the live recon at
`scraper/recon/20260611-143158/requests.jsonl`.

---

### 2026-06-11 — Sprint 18.6: Reservations pagination + recon prep for per-reservation deep-dive

Two fixes flagged after live testing of the Sprint 18 arc:
(1) Reservations page scrolls forever at high record counts, and
(2) the right-rail "Selected reservation" panel duplicates what
the row already shows. (1) gets a real fix; (2) gets a recon
prep so the next sprint can fill the panel with actually-unique
data (guest profile / address / folio / cards / notes).

**1. Pagination on the Reservations table.**

New `Pagination` component + local `page` / `pageSize` state on
`ReservationDetailsTable`. Defaults: 10 per page, options
10/25/50/100 (matches rGuest's own UI). Filter or sort changes
reset to page 1 via `useEffect`.

Page-number windowing: always show 1, current ± 1, and last;
ellipses bridge gaps. Disabled prev/next at boundaries.
Active page styled with the brand accent.

Footer block becomes a flex row:
- Left: "Showing X–Y of Z" (with "(filtered from N)" suffix
  when the filter chip is anything but All).
- Right: pager nav + per-page selector.

Both the desktop `<table>` AND the mobile card list (`<ul>`)
now consume `paged` instead of `filtered`, so a 200-reservation
load with 10/page renders 20 short pages — no more infinite
vertical scroll.

**2. Recon prep — per-reservation deep-dive (3rd page).**

The Selected-reservation rail panel currently shows exactly
what the row shows. For it to actually earn its space we need
the *richer* per-reservation data rGuest holds: guest profile
(name / address / phone / email), folio + charges, payment cards
on file, special-request notes, channel/source. None of that is
in `/reservations/search/date`'s payload — it lives behind a
per-reservation detail call we've never recon'd.

`scraper/agilysys_recon.py` updated to add a **third page-capture
step** after HK Condition:

```python
RESERVATION_DETAIL_ID = "a0b3ac38-afeb-45f4-a227-478ed92d2b3a"  # Rosa Santiago
RESERVATION_DETAIL_URL = f"https://stay.rguest.com/v2/reservation/{RESERVATION_DETAIL_ID}?tenantId=1566&propertyId=481"
```

New `navigate_to_reservation_detail(page)` helper does a direct
goto (URL pattern was confirmed by user 2026-06-09); falls
through to manual prompt if the chosen UUID has been archived /
cancelled. Wired into the main loop after the existing
HK-Condition step:

```
…
dump_page(page, out_dir, "02-hk-condition")

page_label_ref["current"] = "03-reservation-detail"
navigate_to_reservation_detail(page)
page.wait_for_timeout(SETTLE_SECONDS * 1000)
dump_page(page, out_dir, "03-reservation-detail")
```

Page label tag flows through the network logger as expected,
so the post-run summary groups every XHR / fetch fired while
on the detail page under `03-reservation-detail` — easy to
spot the new endpoints we haven't yet touched.

Header doc comments updated to describe the 3-page flow.

**Files touched:**
- `src/components/Forecasting/index.js` — new `Pagination`
  component + `PAGE_SIZE_OPTIONS`; `ReservationDetailsTable`
  gains `page` / `pageSize` state + windowed page-number math;
  both row maps changed to `paged.map`; footer rewritten to
  show range + pager + size selector.
- `src/components/Forecasting/Forecasting.css` — `.fc-pager*`
  block with button / active / disabled / gap styles; footer
  flex layout + size selector.
- `scraper/agilysys_recon.py` — `RESERVATION_DETAIL_ID` +
  `RESERVATION_DETAIL_URL` constants; new
  `navigate_to_reservation_detail()` helper; third page-capture
  step in `main()`; header docstring + OUTPUT block updated.

**Verified.** Brace + paren balance OK (Forecasting/index.js
517/517, 450/450); Python AST parse clean on the recon script.

**What user needs to do before 18.7:**

1. Run `python3 scraper/agilysys_recon.py` (one of the existing
   credentials still works — use the same env vars).
2. If Rosa Santiago's UUID has been archived since 06-09, edit
   `RESERVATION_DETAIL_ID` at the top of the file to a current
   in-house reservation's UUID first.
3. Share the new `recon/<timestamp>/` folder. I'll grep the
   network log for `03-reservation-detail` entries, identify
   the per-reservation detail endpoints, and wire them into
   `server/agilysys/client.js` + `compute.js` for the rail
   panel to render properly in 18.7.

**Acknowledged limitations:**

- Pagination state is local to the table component — switching
  views resets to page 1. That's intentional (filter changes
  should reset too); add per-filter persistence later if anyone
  asks.
- No URL hash sync — `?page=3` in the address bar would be nice
  but isn't worth wiring up before 18.7.
- The right-rail "Selected reservation" panel still shows the
  same data as the row. That gets unblocked in 18.7 once the
  detail endpoints are recon'd.

---

### 2026-06-09 — Sprint 18.5: reservation_history table + scrape caching + future-date cap

Closes the Sprint 18 arc. Four infra changes; all backend, no UI
work. Run migration 025 before the next scrape.

**1. Migration 025 — `reservation_history` table.**

29-column table keyed by `reservation_id` (UUID from rGuest).
Mirrors the shape of `payload.reservations[i]` from compute.js so
the upsert is a straight column mapping. `first_seen_at` set on
insert, `last_seen_at = NOW()` bumped on every conflict update.
`last_snapshot_id` FK references `forecast_snapshot.snapshot_id`
with `ON DELETE SET NULL` so deleting a snapshot doesn't orphan
the row.

Four indexes for the FD's daily lookups:
- `arrival_date DESC` — "today's arrivals"
- `status, arrival_date` — "everything not yet checked in"
- `last_seen_at DESC` — "what scraped most recently"
- `LOWER(guest_name)` — case-insensitive name search

Schema.sql synced in tandem so fresh DB installs get the new
table without needing to apply 025 on top.

**Run on Koyeb:**
```bash
psql "$DATABASE_URL?sslmode=require" -f database/migrations/025_sprint18_reservation_history.sql
```

**2. Upsert in runScrape.js.**

After `insertSnapshot` succeeds, `upsertReservationHistory(pool,
payload.reservations, snapshot.snapshot_id, logs)` batches into
chunks of 50 (29 cols × 50 = 1450 params; well under pg's 65 535
limit). Single `INSERT … ON CONFLICT (reservation_id) DO UPDATE
SET …` per batch — full upsert with `last_seen_at = NOW()` +
`last_snapshot_id = EXCLUDED.last_snapshot_id`.

Best-effort: per-batch failures are caught and pushed as
`{level: 'warn', message: 'reservation_history.batch_failed', context: {...}}`
log entries that get merged into `forecast_snapshot.logs` via a
follow-up UPDATE. The snapshot itself still counts as a success;
admin sees the partial failure in the Snapshot History →
Diagnostics panel.

Return value adds `historyUpserted` for visibility.

**3. Future-date cap (compute.js).**

`classifyForDate` gains a `futureWindowDays` parameter (default
**30**, configurable via `forecast_config.future_window_days` in
the DB — column doesn't exist yet; falls back to default).

```js
const futureCutoff = addDaysISO(forecastDate, futureWindowDays);
const isFuture = arr > forecastDate && arr <= futureCutoff && status === 'RES';
```

Drops the snapshot payload's `reservations[]` array from ~1700 →
~200 (today's pipeline + 30 days of future RES). The full
firehose still lives in `reservation_history` for occasional
long-range lookups; the day-to-day FD view doesn't carry the
weight.

Helper `addDaysISO(ymd, days)` does the date math in UTC to
avoid timezone shifts when crossing DST boundaries.

**4. Module-level cache for `rooms` / `roomTypes` / `vipStatuses`
(client.js).**

`_refCache` at module scope (outside the `createAgilysysClient`
factory so it persists across scrape calls). 24 h TTL on each
slot, keyed by `tenantId/propertyId`.

Each `listRooms` / `listRoomTypes` / `getVipStatuses` checks its
slot first; on hit, logs `agilysys.{name}.cache_hit` with TTL
remaining and returns immediately. On miss, fetches as before
and stores. **Cuts ~3 HTTP round-trips off every scrape after
the first one** — Snoqualmie's typical scrape now overlaps
roughly: login + propertyDate + (search/date pagination +
metrics). Rooms/roomTypes/vip catalog won't hit the wire again
for 24h.

Cache lives in-process; restarting the Node server clears it.
Acceptable for now since Koyeb cold-starts are infrequent.

**Files touched:**
- `database/migrations/025_sprint18_reservation_history.sql`
  (new).
- `database/schema.sql` — `reservation_history` table + indexes
  added after `forecast_snapshot`.
- `server/forecast/compute.js` — `FUTURE_WINDOW_DAYS_DEFAULT`,
  `addDaysISO` helper, `classifyForDate(... , futureWindowDays)`
  signature, `futureWindowDays` resolved from config in
  computeForecast, `primaryGuestProfileId` surfaced on each
  reservation.
- `server/forecast/runScrape.js` — `upsertReservationHistory`
  batching helper; called after `insertSnapshot`; per-batch
  failure logs merged back into the snapshot.
- `server/agilysys/client.js` — module-level `_refCache` +
  `REF_TTL_MS` + `_cacheKey(tenantId, propertyId)`; cache checks
  + writes wired into `listRooms`, `listRoomTypes`,
  `getVipStatuses`.

**Verified.** Brace + paren balance OK across all 3 server files
(client 117/117, compute 105/105, runScrape 55/55). Module load
test confirms the client surface and `runScrape` is still
exported cleanly.

**Sprint 18 arc closed.** Live test + bug-fix pass is the next
step per the user's plan ("debug and sanity check after all
sprints are done").

**Outstanding follow-ups** for the inevitable 18.6+ debug pass:

- Per-reservation recon still pending — will unlock the real
  channel/source field (Direct/Booking.com/Expedia) + Rollaway
  notes endpoint.
- "View details" + "Guest folio" buttons still stubbed on both
  the desktop rail panel and the mobile card.
- "Filters" collapse button + search bar on mobile (mockup has
  them; we punted in 18.4).
- Admin UI for `future_window_days` config (column not in
  `forecast_config` yet; defaults to 30).
- Old `ScraperOutputCard` / `DispatchSummaryCard` /
  `ServiceProgress` / `ByCleaningTable` / `ByRoomTypeTable` /
  `ByFloorTable` component definitions in
  `Forecasting/index.js` are now dead code. Safe sweep.
- `forecast_snapshot.payload`'s reservations array now caps at
  ~200, but we could go further — once `reservation_history`
  proves itself, drop the array from payload entirely and have
  the page query the new table directly.

---

### 2026-06-09 — Sprint 18.4: mobile redesign — expandable reservation cards

Mobile Reservations now matches the mockup. Same data + selection
state as the desktop view; just a different rendered surface at
≤700 px.

**1. New `ReservationCard` component.**

Mobile-only collapsed/expanded card. Collapsed: guest name (big),
Conf. + Room + Room Type (small sub-line), Reservation Status +
Room Status pills stacked on the right, caret on the far right.
Tapping anywhere on the card toggles expand.

Expanded body:
- 2-col metadata grid: Arrive · Depart · Nights · Source.
- Notes / Flags row (uses 17.x's `buildResnFlags`).
- Two action buttons side-by-side: **View details** (stub) +
  **Open in rGuest Stay ↗** (live deep link from 18.2).

Selection state shared with the desktop table — same
`selectedId` prop / `onSelect` callback. If a row was already
selected on desktop and you resize to mobile, that card opens
automatically.

**2. `ReservationDetailsTable` renders both layouts.**

The card list (`<ul class="fc-resn-cards fc-mobile-only">`)
sits just before the existing
(`<div class="fc-detail-tablewrap fc-desktop-only">`) table.
CSS hides whichever's wrong for the viewport. Filter chips +
Room Type / Source dropdowns + footer count stay shared above /
below.

**3. CSS overhaul for ≤700 px.**

```css
.fc-mobile-only  { display: none; }
.fc-desktop-only { display: block; }
@media (max-width: 700px) {
  .fc-mobile-only  { display: block; }
  .fc-desktop-only { display: none; }
}
```

Plus, inside `@media (max-width: 700px)`:

- **KPI grid** `.fc-kpis-5` → `1fr 1fr` (2 across). The 5th
  card (`No Room Assigned`) gets `grid-column: 1 / -1` so it
  spans the full row by itself — matches the mockup's "2x2 +
  1 wide" layout.
- **Right rail hidden** — cards expand inline, and "Today at
  a glance" is redundant with the top KPI cards anyway. Frees
  up the full width for the reservation list.
- **Filter controls stacked** — chips on top, dropdowns
  underneath, each select takes ~45% width so they pair up.
- **Bottom HK message preview hidden** — that's a forecast-y
  card that doesn't belong on mobile Reservations.

Mobile bottom nav stays unchanged — 4+More from 17.4 (Home /
Calendar / Reservations / More), per the locked decision in
§4.2.7.

**4. Card styling.**

`.fc-resn-card` block: white surface, 10px radius, thin border.
Selected state: accent border + 2px accent-bg ring (mirrors the
desktop row's selection look so the visual language is
consistent). Heading uses `TiemposHeadline` to match the page's
typography; metadata sub-line stays in `TiemposText`. Card grid
inside expanded body is `1fr 1fr` for the 4 detail rows; full-
width Notes/Flags + Actions rows underneath.

**Files touched:**
- `src/components/Forecasting/index.js` — new
  `ReservationCard` component; `ReservationDetailsTable`'s
  return block now emits both the mobile `<ul>` and the desktop
  `<div class="fc-detail-tablewrap">`.
- `src/components/Forecasting/Forecasting.css` — `.fc-mobile-
  only` / `.fc-desktop-only` visibility helpers; full
  `.fc-resn-card*` block (~110 lines); new ≤700 px media query
  block for the mobile-specific layout overrides.

**Verified.** Brace + paren balance OK (index.js 477/477,
397/397; css 261/261).

**Acknowledged limitations:**

- No "Filters" collapse button (mockup shows one) — the
  Room Type / Source dropdowns stay visible on mobile,
  stacked. Easy to add a toggle in 18.5 if it feels crowded.
- No search bar on mobile yet — same story (mockup shows one
  next to Filters). Hooks up via a new state + filter
  predicate.
- "View details" still stubbed; "Guest folio" was already
  stubbed on desktop, removed entirely on mobile so the action
  row stays a clean 2-up.

---

### 2026-06-09 — Sprint 18.3: VIP lookup + new derived flags + legacy toggle cleanup

Three deliverables; channel/source + Rollaway notes deferred
until we have the per-reservation recon (still pending).

**1. VIP lookup — new client endpoint + label resolution.**

Added `getVipStatuses()` to `server/agilysys/client.js`. Tries
the property-scoped catalog
(`/property-service/.../properties/.../vipStatuses`); on failure
falls back to the tenant-scoped variant
(`/property-service/.../vipStatuses`). Both exist in the recon
URL list — different rGuest UI screens use different scopes.

`fetchForecastInputs` now fetches the VIP catalog before the
data parallel pull (soft failure — if it 404s the rest of the
scrape continues, vipStatuses just comes back null).
`runScrape` threads `inputs.vipStatuses` into `computeForecast`.

`compute.js` builds a `vipById` Map and resolves each
reservation's `primaryGuestInfo.vipStatus` UUID to the catalog
entry's `name` (with `displayName` / `label` / "VIP" fallbacks).
The resolved string ships on `payload.reservations[i].vipLabel`;
raw UUID stays on `vipUuid` for traceability.

**2. New derived flags on each reservation.**

`compute.js` builds a `roomById` Map and surfaces:
- `floorId` — pulled from the assigned room (null if unassigned).
- `isHighFloor` — `parseInt(floorId, 10) >= 3` (Snoqualmie tops
  out at floor 4; "high floor" = 3+ matches the FD's working
  definition).
- `isPetFriendly` — typeCode ends with `P`.
- `isGroupBooking` — `reservation.group` is non-null.

Pre-existing flags (`isEarlyArrival`, `isRedEye`,
`scheduledForRoomMove`, `isDayUse`) keep working unchanged.

**3. Notes/Flags pill column — fully populated.**

Both `ReservationDetailsTable` rows and the `SelectedReservation`
panel now read flags from a shared `buildResnFlags(r)` helper
(defined in `Forecasting/index.js`). Order of pills:

```
VIP · Early arrival · Late arrival · Room move · Day use ·
High floor · Pet friendly · Group
```

Pill colors live in `Forecasting.css` under `.fc-flag-*`:
- `.fc-flag-vip` — yellow (#fefcbf), bold weight; the strongest
  signal.
- `.fc-flag-high` — blue (#bee3f8).
- `.fc-flag-pet` — red-pink (#fed7d7).
- `.fc-flag-group` — gray (#e2e8f0).

**4. Legacy view toggle removed from Reservations page.**

The 4-tab toggle (Reservation Details / Cleaning Type / Room
Type / Floor) was a vestige from when this page was the
Forecast. Replaced with a plain `<h2>Guest Reservations</h2>`
header per the mockup. The `view` state still exists in the
component because the analytic table components are still
imported (and might be reused on the Forecast page later); only
the rendered tab strip is gone.

**Files touched:**
- `server/agilysys/client.js` — `getVipStatuses` + property/
  tenant fallback; `fetchForecastInputs` fetches it; exported
  on the public surface.
- `server/forecast/runScrape.js` — threads `vipStatuses` into
  `computeForecast`.
- `server/forecast/compute.js` — new `vipStatuses` param;
  `roomById` + `vipById` maps; `isHighFloor` helper; per-
  reservation derived fields (`floorId`, `isHighFloor`,
  `isPetFriendly`, `isGroupBooking`, `vipUuid`, `vipLabel`).
- `src/components/Forecasting/index.js` — `buildResnFlags`
  helper; table row + selected-panel both consume it; legacy
  view toggle removed; header now reads "Guest Reservations".
- `src/components/Forecasting/Forecasting.css` — new
  `.fc-flag-vip` / `.fc-flag-high` / `.fc-flag-pet` /
  `.fc-flag-group` pill colors.

**Verified.** Brace + paren balance OK (440/440, 378/378;
compute 101/101, 305/305; client 100/100, 131/131). Module
load test confirms `getVipStatuses` is on the client's exported
surface.

**Acknowledged limitations (still deferred to 18.4 / 18.5+):**

- Source/channel column still shows `ratePlanCode` (BAR / LOCAL
  / WACHA) instead of Booking.com / Expedia / Direct — needs
  the per-reservation recon.
- Notes / Special Requests endpoint not yet hit; Rollaway-style
  flags blocked.
- "View details" / "Guest folio" buttons still stubbed.
- The analytic-table component definitions (`ByCleaningTable`,
  `ByRoomTypeTable`, `ByFloorTable`) are now unused on this
  page — safe to delete in a follow-up sweep along with the
  rail's old `ServiceProgress` / `ScraperOutputCard` /
  `DispatchSummaryCard` dead code.

---

### 2026-06-09 — Sprint 18.2: right-rail "Today at a glance" + "Selected reservation" + Open-in-rGuest deep link

Two-phase rail. Builds on 18.1's table; adds row-click selection,
a compact rail summary, and the rGuest deep link confirmed
yesterday.

**1. Click-to-select on table rows.**

Each `<tr>` in `ReservationDetailsTable` is now a click target.
- First click highlights the row + populates the right-rail
  panel.
- Re-clicking the same row deselects.
- New `selected` class on `<tr>` styles the highlight: accent
  background tint + outline + 3px inset shadow on the first
  cell as a "you're here" cue.

Wiring: `selectedId` + `onSelect` props added to
`ReservationDetailsTable`; page-level `selectedResId` state +
`selectedReservation` memo (looks up the full reservation
object from `payload.reservations`).

**2. `TodayAtAGlance` compact rail card.**

5-row vertical list mirroring the 18.1 top KPI cards but
denser. Each row: small accent-colored icon chip · label +
sublabel · big number on the right. Same math as the top cards
so the rail stays useful as a quick reference.

Bottom of the card: **"View all reservations →"** link that
clears the current filter + deselection.

**3. `SelectedReservation` panel — when a row is clicked.**

Empty state ("Click a row in the table to see full reservation
details here.") when nothing's selected. When populated:
- Header: card title + status pill aligned right.
- Guest name (big) + `Conf. {confirmationId}` underneath.
- 2-col metadata grid with 9 cells: Room · Room Type ·
  Arrival · Departure · Nights · Source · Reservation Status ·
  Room Status · Notes/Flags.
- Two side-by-side stub buttons (View details, Guest folio)
  disabled with tooltips pointing at 18.3+.
- Full-width **"Open in rGuest Stay ↗"** primary button that
  `target="_blank"`s to:
  ```
  https://stay.rguest.com/v2/reservation/{id}?tenantId=1566&propertyId=481
  ```
  URL pattern confirmed via user-supplied URL on 2026-06-09;
  encapsulated in `RGUEST_RESERVATION_URL(id)` helper for easy
  per-tenant override later.
- Small "Close" text-link at the bottom for keyboard-less
  deselection.

**4. Rail content cleanup.**

The old rail cards from 17.x (ServiceProgress, ScraperOutputCard,
DispatchSummaryCard) were forecast-y concerns left over from
when this page was titled "Forecast". They're gone from the
Reservations rail now. ScraperOutputCard's sync info still
lives on the top "Last sync HH:MM" badge so we don't lose it.
The component definitions are still in the file as dead code;
safe to delete in a follow-up sweep.

**Files touched:**
- `src/components/Forecasting/index.js`:
  - `RGUEST_RESERVATION_URL` helper added.
  - `ReservationDetailsTable` signature gains `selectedId` +
    `onSelect`; rows get `.fc-detail-row` class + onClick + the
    `.selected` modifier.
  - New `TodayAtAGlance` + `SelectedReservation` components.
  - Page-level `selectedResId` state + `selectedReservation`
    memo; `tableEl` memo deps + props updated.
  - Rail's three legacy cards replaced with the two new cards.
- `src/components/Forecasting/Forecasting.css`:
  - `.fc-detail-row` hover + selected states.
  - Full `.fc-glance-*` block for the compact rail KPI list.
  - Full `.fc-selected-*` block for the detail panel
    (head/guest/grid/actions/deep link).

**Verified.** Brace + paren balance OK (450/450, 382/382).

**Acknowledged limitations:**

- "View details" + "Guest folio" buttons are stubs — pointed
  at 18.3+ via title attributes. View details could expand
  into a fuller modal once we surface more per-reservation
  data; Guest folio likely needs an `account-service` endpoint
  recon.
- The legacy `view` toggle (Reservation Details / Cleaning Type
  / Room Type / Floor) still renders at the top of the table
  area — it's a vestige from when the page hosted analytic
  views. Worth removing in 18.3 cleanup to match the mockup,
  which only shows the reservation list.
- ScraperOutputCard / DispatchSummaryCard / ServiceProgress
  component definitions stay as dead code for now.

---

### 2026-06-09 — Sprint 18.1: 5 new KPI cards + filter chips + restructured Reservations table

First UX delivery of Sprint 18. Server-side gains a `kind='future'`
classification so the new "Future" filter chip has something to
filter. Client-side delivers the mockup's 5-card row + new chips
+ 10-col table layout.

**1. Server: `_meta.isFuture` + `kind='future'` on payload.reservations.**

`classifyForDate` in `server/forecast/compute.js` now flags any
RES reservation with `arrivalDate > forecastDate` as `isFuture`.
The `touchesDay` filter widens to `touchesDay || isFuture` so
those records survive into `classifiedResn`. The kind cascade
gets a `future` branch at the end. Today's counts (arrivals /
departures / stayovers / inHouse / KPIs) are unaffected — they
key off `arrivesToday/departsToday/isStayover/isInHouse` which
remain false for future records.

Side effect: `payload.reservations` grows from ~92 entries to
~1700 (Snoqualmie has lots of future bookings). Storage bloat
is acknowledged; 18.5 tackles it with the
`reservation_history` two-table split.

**2. Client: 5 KPI cards** (replacing the 17.10 6-card row).

```
Arrivals Today     32  "19 not arrived"           briefcase  purple
In-house           39  "guests currently staying"  bed        blue
Departures Today   21  "3 not checked out"         exit       orange
Staying Tonight    23  "in-house, not departing"   moon       green
No Room Assigned   17  "needs review"              alert tri  yellow
```

The mockup's icons translate to two new inline SVG icons
(`IconMoon`, `IconAlertTriangle`); the other three already
existed from 17.10. Dropped from this view: "Rooms to service /
Stayover service / Housekeepers needed" — those are forecast
concerns and live on the Forecast page now.

`No Room Assigned` derives client-side from
`reservations.filter(r => r.kind === 'arrival' && !r.isPreAssigned)`.
That count maps to the FD's "needs review" workflow — every
arrival without a roomId needs a desk decision.

**3. New filter chips per mockup.**

```
All  Arrivals Today  In-house  Departures Today  Future  No Room Assigned
```

`RESN_FILTER_LABELS` constant rewritten; `FILTER_PREDICATES`
helper map added. "Stayovers" chip dropped (overlap with In-
house — staying-tonight is its own KPI). "Future" matches
`kind === 'future'`. "No Room Assigned" composes `kind ===
'arrival' && !isPreAssigned`. In-house chip now matches BOTH
`inhouse` and `stayover` kinds (cleaner UX — they're the same
operational bucket: "currently in the property").

**4. Table column rewrite** to match mockup's 10-col layout.

```
Guest | Room | Room Type | Arrival | Departure | Nights | Source | Status | Room Status | Notes/Flags
```

Was 8 cols (combined Room/Type, HK Action). Now:
- `Room` separated out; tabular-nums for alignment.
- `Room Type` shows base label with sub-label as a faint sub-
  line (e.g. "King Standard" + "Accessible").
- `Room Status` pulls `hkStatusLabel` for assigned reservations,
  shows "No Room Assigned" pill (pending color) for unassigned
  arrivals.
- `Notes / Flags` derives Early arrival, Late arrival (red-eye),
  Room move, Day use from existing reservation fields. **VIP /
  Rollaway / channel labels** wait for 18.3 (after recon).

Sub-line under Guest shows Conf. ID (the `confirmationId`
string).

**Files touched:**
- `server/forecast/compute.js` — `isFuture` flag, `kind='future'`
  in the kind cascade.
- `src/components/Forecasting/index.js` — `IconMoon`,
  `IconAlertTriangle` added; KPI block rewritten to 5 cards;
  `RESN_FILTER_LABELS` + `FILTER_PREDICATES` redone;
  `ReservationDetailsTable` body restructured to 10 cols.
- `src/components/Forecasting/Forecasting.css` — `.fc-kpis-5`
  variant + new `.fc-kpi-staying` / `.fc-kpi-noroom` accents;
  `.fc-flag-*` pill colors; `.fc-detail-table-v18` denser
  spacing for the 10-col layout.

**Verified.** Brace + paren balance OK (382/382, 334/334; server
compute 96/96, 283/283).

**Follow-ups (live in 18.2+):**

- **18.2** — "Selected reservation" right-rail panel with
  click-to-select. Today the rows are static.
- **18.3** — Real VIP / channel / notes columns after recon.
- **18.4** — Mobile redesign (expandable cards).
- **18.5** — `reservation_history` split + caching + future-date
  cap; without this the snapshot payload now carries ~1700
  reservations per scrape (was ~92).

---

### 2026-06-09 — Sprint 18.0: prelog + recon prep for Reservations redesign

User signed off on the Reservations-page redesign as Sprint 18.
Full roadmap + sub-sprint split logged in §4 of this file. This
entry just captures what was already confirmed via recon
analysis of existing files (so the next iteration doesn't redo
the work) and what's still blocking 18.1.

**Already in the scrape payload (no extra work needed):**
- VIP — `primaryGuestInfo.vipStatus` UUID exists; need to add a
  one-shot lookup of `/property-service/.../vipStatuses` to map
  UUID → label (already in the endpoint list from earlier
  recons; trivial add to the client).
- `earlyArrival`, `redEyeArrival` booleans on each reservation.
- `floorId` per room (for "High floor" derivation).
- `typeCode` suffix `P` for pet-friendly.

**Not yet in scope — needs a fresh recon:**
- Source / channel field (Direct / Booking.com / Expedia /
  Agoda). NOT in the `/reservations/search/date` payload. The
  rGuest UI shows it as "Confirmation Details — Booking.com |
  <number>" on each reservation card; lives on a per-reservation
  detail call we haven't captured.
- Reservation detail URL pattern, for the "Open in rGuest Stay"
  button.
- Notes / special requests (Rollaway, etc.) — same situation.

**What 18.0 needs from the user before 18.1 can start.**

Open *one* reservation in rGuest (any row in the Reservations
Search results), copy the URL from the address bar, paste it in
chat. From there I'll either (a) update
`scraper/agilysys_recon.py` to navigate to that URL as a third
page-capture and have the user run it, or (b) just look at the
URL pattern + ask them to scroll through the Network panel for
the reservation-detail XHR (whichever is faster).

The captured recon will give us: deep-link URL pattern, channel
field location, notes endpoint. After that 18.1 (KPI cards +
table + filter chips) is fully unblocked.

**Update 2026-06-09 — URL pattern confirmed.** User shared:

```
https://stay.rguest.com/v2/reservation/{reservationId}?tenantId=1566&propertyId=481
```

`{reservationId}` is the UUID from `reservation.id`. The
"Open in rGuest Stay" deep-link is fully unblocked — it's a
plain string template; no recon needed for it.

Source / channel field + notes endpoint are still TBD but
**don't block 18.1**. The new Reservations table can ship with
`ratePlanCode` (BAR/LOCAL/WACHA/etc.) as the Source column for
now; the real "Booking.com/Expedia/Direct" channel slots in at
18.3 after we run the per-reservation recon. Same for Notes/
Flags — derive what we can from existing data (VIP from
`primaryGuestInfo.vipStatus`, late/early from
`redEyeArrival`/`earlyArrival`, high floor from `floorId`, pet
from typeCode suffix); Rollaway-style notes come in 18.3.

---

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
