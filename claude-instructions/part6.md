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
| 21.3   | Live room board (today), VI/PU semantics, workload-only future days, sync removed, HK/FD action lists | **Built + tested** (see entry). Printable sheet for the selected day still open |
| 21.4   | Day 2–14 cleaning priority (expected arrivals, floor suggestions), selected-day Generate-forecast sheet, info popovers, late-booking settings | **Built + tested** |
| 21.5   | Stored future list window 30 d → 365 d, separate from the 30 d guest-detail window | **Built + tested** (no migration) |
| 22.1   | Sync engine: migration 028, mirror, ticks, endpoints, write-behind | **Built + tested (live dry run PASS), NOT yet deployed** |
| 22.2   | Auto-sync panel (health, run now, schedule, runs) + Recent-changes feed | **Built + tested** (no migration) |
| 22.4   | Dev area (server-verified dev role): all settings/logs/debug moved out of the manager UI; full Reservations + Forecast replicas for dev; plain freshness badge | **Built + tested** (needs env `DEV_PASSWORD_HASH`) |
| 22.5   | Manager Forecast simplified (dev keeps the full page) | **Done** 2026-10-20 (see entry) |
| 26.2   | Reservations (dev card): rGuest audit log, authorization & payment history, and real FD comments are now saved and shown under "More details" | **Done** 2026-11-09 (see entry; no migration) |
| 26.1   | Log Book: green live dot, rights per role (front desk own notes only, manager edits, dev everything), posted-by / edited-by, send to a front-desk person + Logbook badge, rich-text descriptions | **Built + tested** — **RUN MIGRATION 033 after 032 before deploying** |
| 26     | **Log Book** — replaces the Logbook prototype: month calendar + list, day page, note form (priority / span / audience / flags / draft-publish-archive); Admin, Dev and Front Desk; other staff "under construction" | **Built + tested** — **RUN MIGRATION 032 before deploying** |
| 25.5   | Front desk Reservations: "Rooms to sell today" table under Sellable vs arriving; bigger VI / VI + PU key; Refresh no longer pulls rGuest (2-min server cache) | **Built + tested** — no migration |
| 25.4   | Rename pencil for numbered housekeepers; For [Today · date | Tomorrow · date] box; icon steppers / chevrons | **Built + tested** — UI only |
| 25.3   | In Progress as its own group; dev setting for plan-by-name (default No name only) + typed names for numbered housekeepers; own chevron / Move-to menu / tick box; floor headers re-flow; touch sizes | **Built + tested** — new dev setting `hk_plan_by_name` (default off); no migration |
| 25.2   | In Progress carries into tomorrow; floor cards no longer clip; Select rooms mode; edge arrows + auto-scroll between housekeepers; Move here removed; below-min as one line | **Built + tested** — no server / migration change |
| 25     | First front-desk feedback: whole-floor / multi-select moves, In Progress state, priority room types, Auto-assign rewrite, preferred floors, trimmed all-rooms sheet | **Built + tested** — new route `…/housekeeping/prefs` (app_settings key `hk_prefs`), new colour group `progress`; no migration |
| 24.11  | Tomorrow's Print all sheets = same one-page sheet; tile text + IP icon/no ring; drag auto-scroll; AM/PM replaced by dev-option return slips | **Built + tested** — setting `hk_print_two_sheets` replaced by `hk_print_slips` (never deployed-claimed; no migration) |
| 24.10  | "Print all sheets" = one-page sheet of every room (3 × Room/Status); new pink rule (pre-assigned arrivals); housekeeper sheets use the same colours | **Built + tested** — no migration, no new setting |
| 24.9   | Housekeeping wrap-up: short tile descriptions + aligned numbers (IP), aligned dev room table, coloured print legend, dev option AM/PM sheets, No-name "blank name" switch | **Built + tested** — NO migration; two new settings (see entry) |
| 24.8   | Housekeeping polish: no "Step 1 · done", tiles without descriptions, Save into the Plan card (one Print all sheets), phantom-refresh bug fixed (FLIP glides only on a change of owner) | **Built + tested** (UI only) |
| 24.7   | Housekeeping two-step flow (manager / dev): overview folded into seven KPI tiles, full-width calendar, Plan card with a no-rooms preview, Confirm → rooms board (Not assigned + assignments) | **Built + tested** (UI only; the front-desk portal keeps its 24.6 layout until its own pass) |
| 24.6   | Housekeeping fixes: header status bar top-right in dev, layout v3 (overview + calendar row, wide Not assigned, full-width assignments), fade pop-ups, blue dots, Reset in No-name mode | **Built + tested** (UI only) |
| 24.5   | Housekeeping redesign to match Reservations/Forecast (user's reference mockup): header + links + six KPI tiles, left Not assigned panel, right overview donuts + housekeeper cards, floor accordions | **Built + tested** (UI only: no server, migration or env change; hkWork.js untouched) |
| 24.4   | Staff Home redo (3-card row + timeline), expandable room types on Sellable vs arriving, short dev bar, dev parity audit + dev-only PIN reveal (PIN vault) | **Built + tested** — NEEDS migration 031 + env `PIN_VIEW_KEY` for the PIN reveal |
| 24.3   | Portal: Reservations tab (tiles + sellable, no chart), Home = hours + timesheet (no Timesheet page, no CSV); Sellable vs arriving x/y (VI only / VI+PU) + dev Available toggle; dev "Front desk view" | **Built + tested** (no migration, no new env) |
| 24.2   | Login always opens on Clock in; front-desk access = role "front desk" OR department "Front Desk" | **Built + tested** (no migration, no new env) |
| 24.1   | Staff-portal rework after review: Staff login = PC form (admin-card design, no numpad); icon-only mode buttons; Clock in door = clock only; old multi-page staff shell removed, its pages merged into the portal for all staff (no clocking there); front-desk features follow the DEPARTMENT "Front Desk" | **Built + tested** (no migration, no new env) |
| 24     | Staff portal (front desk): third login mode "Staff login", portal Home (forecast tiles + sellable vs arriving + the clock/hours dashboard) and a simplified Housekeeping; original staff pages kept as the "Clock in" door | **Built + tested** (no migration, no new env) |
| 23.8   | Obvious Dev / Manager view switch (admin panel) | **Built + tested** |
| 23.7   | Housekeeping: in-app dialogs, count card, multi-select/menu/copy-paste, housekeeper strip | **Built + tested** |
| 23.6   | Housekeeping QoL: Not assigned by floor (unlocked), strip removed, sidebar scroll fix | **Built + tested** |
| 23.5   | Housekeeping: count-card/stepper fixes, wider Not assigned, evenOut balancing | **Built + tested** |
| 23.4   | Housekeeping: plan by number, print colours (dev), sheet summary | **Built + tested** |
| 23.3   | Housekeeping: aligned layout, manual-first + Auto-assign/Reset, fixed columns, dev room table | **Built + tested** |
| 23.2   | Housekeeping: do-not-move rooms, new layout, drag flicker, mobile | **Built + tested** (no new migration) |
| 23.1   | Housekeeping redesign: history, two cards, draggable cards, auto-balance | **Built + tested** (no new migration) |
| 23     | Housekeeping page: assign rooms to housekeepers, print one sheet each | **Built + tested** — NEEDS migration 030 |
| 22.10  | Animations: summary bars, 14-day outlook, room-type dropdowns | **Built + tested** — closes Sprint 22 |
| 22.9   | Forecast: outlook on top, rooms by floor, colored room sheet with stay dates, print fixed | **Built + tested** (frontend only) |
| 22.8   | UI fixes: dark mode, tiles consistent, slower animation, Recent changes card | **Built + tested** (CSS/JS only) |
| 22.7   | Reservations tiles redo (left-first numbers, rings, count-up, room lists) | **Built + tested** (no migration; new dev route `/api/dev/rooms/last-stays`) |
| 22.6   | One shell for dev + managers; lean manager Reservations; second-night cleaning plan; room status sheet | **Built + tested** (no migration, no new env) |
| 22.3   | Pages read the mirror (no full scrape per refresh) + guest-detail refresh hook + forecast-accuracy tracker | **Built + tested** (migration 029) |

## Sprint logs (newest first)

### 2026-11-09 — Sprint 26.2: reservation history, payments and comments (dev)

**No migration.** Everything is stored in the existing `reservation_detail.detail` / `sections` JSONB (migration 027). Deploy server + frontend together, then press **Refresh** on Reservations once.
**Probe first** (`tests/probe-reservation-extras.js`, read-only, uses `server/.env`; method: read rGuest's public JS bundle for the endpoint builders, then confirm live). Verified endpoints:
- **Audit log** (the "enlarge" popup): `GET /reservation-service/tenants/T/properties/P/audit/reservation/{id}?page&size` → Spring page, newest first; entries `{ user, timestamp, changes:[{ path, type ADD|REMOVE|MODIFY, from, to }] }` — matched the 3 rows in the user's screenshot.
- **Authorization & payment history**: `GET /payment-service/v1/tenants/T/properties/P/accounts/{accountId}/authorizationHistory` (note the **`/v1`** — without it 404). Rows: authCode, cardNumber (last 4), amount, issuer, transactionDate/Time, user, authorizationType, failureReason, success.
- **Comments**: `GET /comment-service/tenants/T/comments?associatedObjectId={reservationId | profileId}`; type names from `GET …/config/commentTypes`. Archived comments come back with `metadata.deleted = true` (rGuest's "Include Archived" just filters them).
- **Bug found:** the old `comments` section called `…/comment-service/…/reservation/{id}`, which is only rGuest's "suppress alerts" setting (always `{}`) — so FD comments were never captured before. That section is replaced.
**What changed**
1. `server/agilysys/client.js`: new `getReservationAuditLog` (pages 100 at a time, cap 500, `truncated` flag), `getAuthorizationHistory`, `getCommentsFor` (+ cached comment-type catalog); `deepFetchReservation` now stores `reservationComments`, `profileComments`, `auditLog`, `authHistory` (each its own isolated section, previous good data kept on failure); new `deepFetchExtras` = only those four sections for an already-stored reservation (~5 calls instead of ~25).
2. `server/forecast/detailJob.js`: a stored reservation missing any of the four sections gets reason `new-sections` and the light refetch — so **one manual refresh backfills every existing reservation** (within the detail window); no timers.
3. `server/forecast/extras.js` (pure): audit entries → readable lines ("Added Disclose Room Type Yes", "Changed … from A to B"; service accounts shown as "Stay integration user"/"System"), payments newest-first with totals (card shown as `************1234` only), comments split reservation / profile with archived flagged. `summarize.js` now sets `hasComments` from the real comments (archived ignored).
4. `GET /api/admin/reservations/:id/extras` — **dev only** (`requireRole('dev')`; admin and front desk get 403); reads the stored row, never calls rGuest.
5. `src/components/Forecasting/ResnExtras.js` (+ CSS in `ResnList.css`) inside a card's "More details" (the full card exists only in the dev view): Audit log (newest 5, "Show all N"), Authorization & payment history table (DATE, TIME, USER, AUTH CODE, CARD, TYPE, AMOUNT, ISSUER, STATUS, REASON + totals), Comments (Reservation / Guest profile tabs, "Include archived"). A reservation not yet refreshed says "Not saved yet — press Refresh".
Tests: `reservation-extras` 10 (simulated rGuest: paging, v1 path, catalog cache, extras refetch makes no core call, failure isolation, formatter, summary flag, job selection, dev-only route), `reservation-extras-ui` 4. Full regression green; build compiles.
**Open:** Expected Authorization / Available Balance (top of rGuest's modal) is not re-fetched — the numbers already live in `estimatedCharges` / `authDetails`. The comment **History tab** (comment edit trail) could not be probed: no comment with edits was found, so only `metadata.history` length ("edits") is kept. `tests/staffportal.test.js` has fixtures hard-coded to the week of 2026-11-02 and fails once the real week rolls over (passes with the clock pinned to Nov 4) — pre-existing, not caused by this sprint.

### 2026-11-13 — Sprint 26.1: Log Book additions

**Needs deploying:** `database/migrations/033_sprint26_1_logbook_rich_notify.sql` (run AFTER 032; adds `body_rich`, `recipients`, `modified_at`, `modified_by` to `logbook_notes` and the table `logbook_reads`; idempotent).
1. **Green live dot** on the admin / dev "Logbook" nav item (`live: true`, like the other live pages); the portal's Logbook already had it.
2. **Rights (`server/logbook.js` `permissions`, decided by WHO is asking, not by the URL):** front desk — edit, pin and **delete only notes they posted**; manager (admin) — edit and pin any note, **no delete, no archive**; dev — edit, pin, delete, **archive / restore** (the Archived chip only exists for dev; a manager's `?archived=1` returns nothing). Duplicate is open to everyone and the copy belongs to whoever copied it. New `DELETE /logbook/notes/:id` is a real delete (reads go with it) behind a "Delete this note? This cannot be undone." confirmation. Every note comes back with `can: { edit, delete, archive }` for the viewer, and the page only offers what would be accepted (the server still refuses the rest: 403).
3. **Posted by / edited by:** each card ends with "Posted by **Name** · Nov 1, 8:15 AM" ("Drafted by" for a draft; the name is the person's name in the system — staff `users.name`, a manager's configured name, "Dev"). When anyone **except dev** changes a note that was already published, the card also says "Edited by **Name** · time" (`modified_at` / `modified_by`); dev edits, draft edits, publishing and pinning leave it alone.
4. **Send to (optional):** in the form, a "Send to" list of front-desk people only (department "Front Desk" or role front_desk; the server refuses anyone else, deleted people and more than 20). Published notes notify them: a badge with the count on the portal's **Logbook** tab when they open the portal (one request, `GET /frontdesk/logbook/unread`; managers / dev are never recipients), a "New for you" strip on the month page, "New for you" highlight on the card; opening the day that shows the note marks it read (`POST …/read`, table `logbook_reads`) and the shell is told through the window event `hotelops:logbook-unread`. Drafts notify nobody until published; copies are not re-sent. `Sidebar` got a generic `badges={{ [view]: n }}` prop (the old handoff-notes badge is unchanged and now only fetches when a Calendar item exists).
5. **Formatted descriptions:** bold, italic, underline, strikethrough, text colour (8), highlight (8 + none), bullet and numbered lists, clear formatting; Ctrl/⌘ B / I / U work too. **Stored as data, not HTML**: `body_rich` = `{ v:1, lines:[{ k:'p'|'ul'|'ol', runs:[{ t, b, i, u, s, c, h }] }] }`; the server validates every field (types, #rrggbb colours, ≤ 400 lines, ≤ 120 runs a line, ≤ 4000 characters, no line breaks inside a run), drops anything else and derives the plain `body` (bullets as "• ") for search / fallback. The editor fills its box with createElement and reads it back with `domToDoc`; paste inserts plain text only; cards draw the document with React elements (`RichText`) — there is no `dangerouslySetInnerHTML`, so markup typed in a note stays visible text. Old plain notes open as unformatted documents.
Tests: `logbook-server` 12 (REAL postgres — rich validation incl. XSS strings, the full rights matrix, posted / edited-by rules, recipients rules, unread / read), `logbook` 18 (rich model round trip + hostile DOM, editor toolbar / typing / paste / rendering, bylines, who sees what incl. Delete confirm, send-to, notifications + event), `staffportal` 24 (live dot for dev and manager, portal badge); everything else green; lint clean; screenshots.
**Open:** dev can edit without leaving a trace by design (no edited stamp); a manager still cannot remove a bad note — only dev can (or the front desk person who posted it); the unread count is read when the portal opens and when the Log Book page changes it (no polling, so a note sent while someone is already logged in appears at their next page load / login); acknowledgement ("Require ack") and who-can-read enforcement for non-desk staff are still to come.

### 2026-11-12 — Sprint 26: the Log Book

**Decisions (user):** 3 priority levels (High / Medium / General); the new Log Book REPLACES the Sprint 10–12 prototype page (old `handoff_notes` tables are left alone and not migrated — "it was a prototype"); the staff portal's Calendar tab is renamed **Logbook** and, for everyone except Front Desk, shows "under construction"; dev, manager and Front Desk get exactly the same Log Book for now (rights get split later).
**Needs deploying:** `database/migrations/032_sprint26_logbook.sql` (new table `logbook_notes`, idempotent). No new env var.
1. **Data (`logbook_notes`):** title ≤ 120, body ≤ 4000, `priority` high|medium|general, `start_date` / `start_time` / `end_date` / `end_time` (hotel-local DATE + TIME, NULL times = all day; a note covers every day from start to end), audience = `audience_all` OR `audience_departments INT[]` + `audience_staff UUID[]`, flags `show_on_calendar` / `require_ack` / `pinned`, `status` draft|published|archived (+ published_at / archived_at), author (user id when staff, always a label), `property_id` (same key as hk_plans). Index on (property, start, end). **Audience and acknowledgement are stored but not enforced yet** — the staff side comes later.
2. **Routes** (same handlers under `/api/admin/logbook/*` — manager + dev — and `/api/frontdesk/logbook/*` — front desk + manager + dev): `GET notes?from&to[&archived=1]` (notes that touch the range, ≤ 100 days, drafts included, archived only on request; ordered pinned → start → time), `POST notes`, `PUT notes/:id` (not on archived notes), `POST notes/:id/archive | restore | duplicate | pin`, `GET audience` (departments + active people, names only). `server/logbook.js` validates (a draft needs a title + dates; publishing also needs a description and an audience; real calendar dates within 3 years; both times or none; end after start; ids / uuids checked). Every query is parameterized and scoped to the property; other properties' notes are 404. Found by the real-postgres test: `$15` used as both a column and a CASE operand needs `::text`.
3. **Month page** (Admin / Dev "Logbook", Front Desk "Logbook"): title, Month | List switch, month navigation (+ Today), audience filter (all / all-staff notes / a department — its notes plus the all-staff ones), four totals for the month (High / Medium / General / Total — notes with "show on calendar" off are left out), a 6-week grid with a coloured dot per priority present and a count per day (multi-day notes count on every day they cover), and a side summary of the selected day (counts per priority → each opens the day filtered, "View day notes"). Double-click a day also opens it. **List** layout: every note of the month in a table with search and priority chips; a row opens its day with the note ready to edit.
4. **Day page:** breadcrumb, Back to calendar, previous / next day buttons labelled with their dates, New note; filter chips with counts (All / High / Medium / General) + an **Archived** chip (lists the day's archived notes with Restore); sort (time earliest / latest, priority, newest — pinned always first); cards with a colour bar, priority pill, Pinned / Draft / Needs ack / Hidden-on-calendar tags, time span (or "All day", or the date span), audience chip, description, edit pencil and a "…" menu (Duplicate → opens the draft copy, Pin / Unpin, Archive).
5. **Note form** (panel on the right of the day page; stacks under the list on narrow screens): Priority (3-way), Title, From / To (date + time; **All day** switch; the end follows the start so it can never come before it), Intended for (All staff · Departments (chips) · Selected staff (search + tick, chips to remove)), Description (counter), Show on calendar · Require acknowledgment · Pin to top, **Save draft** / **Publish note** (a published note shows **Save changes** instead). Checks run before anything is sent; a server error keeps the form and shows the reason; closing / moving away from a half-written note asks first.
6. **Controls in our own style** (`pickers.js`): date field with a month popover, time field with a 15-minute list, a "…" action menu, floating panels portaled with fixed coordinates (flip upward near the bottom; Esc / outside click close) — no browser date / time / select widgets. Dark-mode via theme variables; container / media queries for narrow screens; coarse-pointer sizes.
7. **Wiring:** `pages/AdminReports` (view `reports`, nav "Logbook") now renders `<LogBook apiBase="/admin" />`; the staff portal NAV `calendar` → `logbook` ("Logbook", icon logbook) renders `<LogBook apiBase="/frontdesk" />` for Front Desk (and the dev's "View as → Front desk" preview) and a `ComingSoon` page for everyone else. **The old staff Calendar page (`pages/StaffCalendar`) and `pages/NotesPage` are no longer reachable from the portal** — staff lose that schedule view for now (the code is untouched; point a nav item at it to bring it back). The admin Calendar's "Open Logbook" link now lands on the new page; its small notes card still reads the old handoff notes.
Tests: `logbook-server` 8 (REAL postgres: migration applied twice + constraints, access matrix, create / list / update / pin / duplicate / archive / restore, property scoping, SQL-injection title, audience names only), `logbook` 12 (jsdom: pure model, month page, audience filter, list, day page, empty states, new-note flow + validation, all-day / staff pick / drafts / failures / discard prompt, edit, menu actions + archive, pickers, front desk vs admin routes), `staffportal` 23 (Logbook tab for front desk / other staff, no Calendar), all other suites green; lint clean; screenshots of the month and day pages.
**Open:** nothing enforces the audience or acknowledgement yet (staff cannot read notes); dev / manager / front desk share all rights (to split later); a note can't be deleted — only archived; the old handoff-notes tables and the staff Calendar code are still in the repo, unused by these pages; no unread badge on the Logbook tab yet.

### 2026-11-11 — Sprint 25.5

1. **Front-desk Reservations → "Rooms to sell today"**: the manager's table (room type · Clean · Arriving · Left to sell · Status, tap a type for its rooms with their status) now sits right below "Sellable vs arriving" (`SimpleRoomTable`, exported from Forecast along with the new `roomsByTypeOf(payload, live, model)` helper, which the manager page now uses too). Same numbers as the manager; room numbers and status only, no guest data (the portal payload is already redacted server-side).
2. **VI / VI + PU key:** no longer small grey text above the list — big dark serif ("VI / VI + PU", same weight and colour as the "18 / 39 rooms" total). In the front desk (no chart) it sits on the title line of the card, right above the numbers; in the manager / dev Forecast (chart on the right) it stays at the head of the list but with the new styling. `viLegend` in `ForecastSummaryCard`.
3. **Front desk cannot pull rGuest by hand:** the Refresh button stays but now only re-reads what has already been synced (`/frontdesk/forecast/current`, our own copy) — it never requests the live board. The live board comes from the existing 2-minute timer and from opening the tab. Server-side guard so it holds for the Housekeeping portal's "Refresh rooms" and for page reloads too: `/api/frontdesk/forecast/live` has its own **2-minute cache** (`FD_LIVE_TTL_MS`, managers keep 20 s); both share the same pull, so a fresher manager pull is reused by the desk. `liveHandler(ttl)` in server.js.
Tests: `staffportal` 22 (+rooms-to-sell table / key / refresh makes no live call), `forecastlive-route` 6 (+front-desk cache window, shared pull, 401 / 403), `forecastpage` updated for the key markup; all suites green; screenshot.
**Open:** the front desk's room board can be up to ~2 min old (+ the 2-min timer); the Housekeeping portal's "Refresh rooms" now returns the cached board inside that window.

### 2026-11-10 — Sprint 25.4

1. **Rename pencil:** next to a numbered housekeeper's name in the assignment column (No-name mode only, not for real staff, not on past days) a small pencil icon opens a box in place of the name: Enter or leaving the box saves, Esc cancels, empty puts "Housekeeper N" back; prefilled with the typed name when there is one. Uses the same `nameAnon()` as the How-many card's Names list (saved with the plan, printed on the sheet).
2. **For box:** Today / Tomorrow is now one box — "For" label + two tabs "Today · Oct 19" / "Tomorrow · Oct 20" (real dates from the room board's day) — the same height as the Rules / How many buttons next to it (`min-height: 38px` shared). Shared `DayPicker` component for the plan card and the portal layout; classes `.hk-dayswitch / .hk-dayfor / .hk-dayseg` (the old `.hk-seg` is only Names / No name now); the date hides under 560 px, the box wraps on phones; coarse-pointer padding.
3. **Icons in our style:** How-many − / + are SVG icons (`IcMinus`, `IcPlus`), Prev / Next use chevron icons (`IcChevronL/R`) instead of ‹ ›, the How many / Who's working button has the chevron icon (turns over when open). Added `IcPencil`.
Tests: `housekeeping` 62 (+For box, rename flow incl. Enter / Esc / blur / empty / print / save / no pencil for staff, icons), `staffportal` 21 (day buttons now "Today Nov 2"), rest green; lint clean; screenshot.

### 2026-11-09 — Sprint 25.3

1. **In Progress = its own group** in Not assigned: IP rooms are no longer drawn inside their floors; a dashed grey **"In progress"** block comes after the floors (grey note stays on top). The Not assigned count and Select all leave them out; Auto-assign still skips them; a hand-placed IP room still works. No floor actions on that block.
2. **Plan by name is a dev setting** — `app_settings.hk_plan_by_name` ('true'/'false', dev-only write via the existing `hk_` guard, read by managers and the front-desk allow-list), switch in Rules (dev only). **Off (default): managers and the front desk only have "No name"** — no Plan by switch, the plan card says "Enter how many". On: the Names / No name switch is back. Dev always has both and starts in Names. A day whose saved plan was made by name stays by name even if the setting is off.
   **Typed names for the numbered housekeepers:** in the How-many card (after Start) a "Names (optional)" list with a box per housekeeper. A typed name replaces "Housekeeper N" on the cards, preview, sheets and is saved in the plan (`assignments[].name`, userId stays `anon-N`; restored on reload); clearing the box puts the number back. The "leave blank" switch now only affects housekeepers with NO typed name (they print `______`). State `anonNames`; `nameAnon()`.
3. **UI:**
   - **Floor headers no longer truncate** ("Grou", "Floo" in the narrow Not assigned columns): floor sections are CSS containers (`container-type: inline-size`); when one is ≤ 335 px wide the buttons wrap under the title (same font size), and the Not assigned grid keeps floors ≥ 290 px wide (`minmax(290px, 1fr)`), wrapping to a second row on smaller desktops. "N rooms" collapses to "N" (title on hover) when the buttons share the row.
   - **Our own controls:** the text caret is an SVG chevron (`IcChevron`); the browser `<select>` for "Move to…" is replaced by `MoveMenu` (HkParts) — a button that opens the same style of menu as the right-click one, in a portal with fixed coordinates (flips up near the bottom, Esc / outside click / scroll / resize close it); the Select-rooms tick glyph is a CSS-drawn box (em-sized, scales with the font).
   - **Touch / mobile groundwork:** `@media (pointer: coarse)` raises the header buttons, the menu items, the card tick box and the chips to finger size; the container query keeps headers usable at phone widths; the menu is tap-friendly. Full mobile layout is still for the later sprint.
Tests: `housekeeping` 59 (+IP group, plan-by-name setting incl. saved named plan, typed names end to end incl. print / blank / save / reload, own controls + CSS, the menu tests rewritten for MoveMenu), `staffportal` 21 (+front desk with names off), `housekeeping-server` 13 and `frontdesk-server` 13 (+hk_plan_by_name); all others green; lint clean; screenshot.
**Open:** with names off the front desk cannot pick real staff for the time clock / reports from here — only labels typed per day; the setting is global, not per role (dev decides for both); the How-many card is not opened automatically on load (the plan card shows "Enter how many").

### 2026-11-08 — Sprint 25.2 (follow-up to 25 / "25.1")

1. **In Progress for tomorrow:** the work list for a later day now reads IP from the LATEST room inventory (`buildRoomSheet(payload, live)`, tone `progress`): a vacant room that is IP now is still `ip` in tomorrow's list (why "In progress", not priority), so it is never auto-assigned, counts on the IP tile, is grey on the all-rooms sheet ("In progress") and is not "dirty tomorrow". Nothing is remembered: if the board stops showing IP, it is no longer IP. A locked (do-not-move) IP room no longer gets "clean first".
2. **Floor cards clipped / would not scroll:** the housekeeper column body is a flex column with `overflow:auto`, and the floor sections (flex items) were SHRINKING to fit instead of making it scroll, so the last row was cut off and the lower floor squeezed the upper. Floor sections are now `flex: 0 0 auto`, the column has no fixed height (`height:auto; min-height:380px`) and the body no longer clips — expanding a floor shows all its rooms and the page grows (vertical auto-scroll while dragging still works).
3. **Select rooms** replaces Select floor: a compact toggle on every floor header. On, each card on that floor shows a tick box and a plain click ticks / unticks (no Ctrl needed; touch friendly); **All / None** appears beside it; **Move to…** moves the TICKED rooms of that floor (label becomes "Move 3 to…") or the whole floor when nothing is ticked; the floor header drag takes the ticked rooms too. Header is now one line (nowrap label, "N rooms" collapses to "N" when the buttons are shown, smaller buttons).
4. **Edge arrows + auto-scroll between housekeepers:** while a card / floor is dragged and there are more housekeepers than fit, the left and right edges of the board show a faded blue band with an arrow (lit only for a direction that has more to show; pulses when the mouse holds that edge). Holding the mouse within 90 px of an edge scrolls the board smoothly (up to 24 px/frame, faster at the very edge); snapping is switched off while dragging and re-snaps on drop. **"Move here" bars removed** from Not assigned and every column (right-click, Move to… and drag cover it). Fixed on the way: a window-level `drop` listener ran before React's and cleared the dragged selection (only one room moved) — caught by the multi-drag test.
5. **Below the minimum / over the maximum** is no longer a line inside each card (it made cards unequal): one line next to Prev / Next ("Housekeeper 2, Ana are below the minimum of 10"; 4+ names become "5 housekeepers are …"), shown even with three or fewer housekeepers, and the same line in the Plan preview header. The yellow border on the card stays.
Tests: `housekeeping` 55 (+tomorrow IP, floor-card CSS + header, edge scroll incl. arrows / zone speeds / drop / none with three; Move-here tests rewritten for Select rooms and Move to…), `hkwork` 24 (+IP into tomorrow); all other suites green; lint clean; screenshots of select mode and edge arrows.
**Open:** floor cards no longer have an inner scroll, so a housekeeper with 40+ rooms makes the page long (vertical drag auto-scroll helps); edge-scroll speed (90 px / 24 px per frame) is a guess — tune after the desk tries it.

### 2026-11-07 — Sprint 25: fixes from the front desk's first real use

Source: the front-desk staff's email after trying the tool. Six items:
1. **"We cannot assign entire floors … can't move more than one room at a time."** Multi-select already existed (Ctrl/⌘-click, Shift range, drag a selected card, right-click menu) but nothing told anyone, and on a Mac **Ctrl-click arrives as a right-click** (contextmenu with ctrlKey) so it opened the menu instead of selecting. Now: every floor header (Not assigned and each housekeeper) has **Select floor / Unselect floor** and **Move floor to… ▾** (a housekeeper, or back to Not assigned) — a whole floor in one action; the floor header itself is draggable (drops the whole floor on a housekeeper); **Select all N** in Not assigned; a one-line hint under the Not assigned title lists all the ways; Mac Ctrl-click now adds to the selection (a real right-click still opens the menu). Floor actions skip In Progress rooms.
2. **In Progress rooms were shown as dirty** (decided with the user: *separate state, left unassigned*). rGuest `IP` is now its own state: work item flag `ip`, grey dashed card with an IP tag, an "N in progress — someone is already on them" note in Not assigned, an **IP tile** (count of rooms in progress; hourglass, no ring), To clean excludes them, they don't count as unassigned work (Progress reaches 100% without them), **Auto-assign / No-name auto-share never hand them out**, a hand-placed one is respected. New print colour group **`progress`** (default grey `#e2e8f0`, dev can change it like the others; server colour validator + plan sanitiser accept it); sheets / all-rooms say "In progress". Guard: the No-name auto-share effect ignores `ip` items (without it, an unassignable room made the effect re-fire forever — proven by temporarily removing the guard).
3. **Priority room types:** Rules → **Priority room types** chips (all room types seen in the data). Every room of a ticked type that needs cleaning (not stay-overs, not In Progress) is `priority` (★, listed first, CLEAN FIRST on the sheet) and pink on cards-print, housekeeper sheets and the all-rooms sheet — in addition to pre-assigned arrivals. Property-wide, saved the moment it changes, any manager / front desk can edit (`buildWorkList({priorityTypes})`, item flag `ptype`).
4. **Auto-assign rewritten** (`balance()` in hkWork.js; `evenOut` is still exported and tested but no longer used — it was what spread a housekeeper over 3 floors). Rooms are laid out floor → room number and cut into ONE contiguous run per housekeeper, the cut positions found exactly by dynamic programming over a cost: fair-share deviation (×100), floors touched beyond one (8·(k−1)²), a cut through the middle of a floor (12), over the max (25 per unit + quadratic), under the minimum (relative to what the day can give: a day too small for everyone is not allowed to leave anyone empty), preferred floors (below). Typical results on a 54-room day: 4 housekeepers → one floor each; 3 → neighbouring floors, only the cuts split a floor; 98 rooms / 8 housekeepers → everyone in the min–max band, ≤ 2 floors each. Pinned rooms still count; In Progress rooms are left out; runs in a few ms.
5. **Preferred floors:** each housekeeper card in the Plan preview has **Prefers G 1 2 3 4** chips (named staff only; no-name slots have none). Stored property-wide, per staff member, so tomorrow already knows. Auto-assign tries all orderings (≤ 5 housekeepers; a centroid heuristic above that) and charges work on non-preferred floors; conflicting wishes still give a full, fair split.
   Storage for 3 + 5: `app_settings.hk_prefs` = `{ floors: { userId: ['3'] }, priorityTypes: ['NQRR'] }`, **new routes `GET/PUT /api/admin/housekeeping/prefs` and `/api/frontdesk/housekeeping/prefs`** (same handlers, gated like the plan routes; `sanitizePrefs` in server/housekeeping.js: ids/floors/types pattern-checked, `anon-*` refused, size-capped; parameterized SQL). No migration (app_settings exists).
6. **All-rooms sheet trimmed** — the status column is now almost empty: only a staying guest's stay span, "In progress" and "Out of service". Gone: "Vacant · inspected", "Dirty", "Check-out 12 PM" (departures stay blank so a late check-out can be pencilled in), "· arrival". `STANDARD_CHECKOUT` removed. Colour still says everything (green dirty · yellow checking out · pink priority · grey in progress).
Tests: `housekeeping` 52 (+whole floors / many at once incl. Mac Ctrl-click, IP state incl. No-name settle, preferred floors, priority types; fixtures have no IP room unless a test makes one), `hkwork` 23 (+Auto-assign scenarios, IP, prefs, priority types, tiny day), `housekeeping-server` 12 (+prefs validation + routes), `frontdesk-server` 13 (+prefs routes for desk / role / manager / dev), others green; screenshots of the plan card and board.
**Open:** preferences are per property (not per day) and only offered for named staff; the min/max are still soft (a floor that fits one person is kept whole even if that leaves them 1 under the minimum — the warning shows); I could not reproduce "can't move more than one room" in the tests, so the Mac Ctrl-click and discoverability are my best explanation — ask the desk what computer they use.

### 2026-11-05 — Sprint 24.11: tomorrow's all-rooms sheet, tiles, drag auto-scroll, return slips

1. **Print all sheets for TOMORROW** is now the same one-page all-rooms sheet (24.10), titled "Planned room status". Only past days (no room board left) still print housekeeper pages. Tomorrow's statuses come from the plan: a guest leaving → "Check-out 12 PM" (yellow), a stay-over → the stay span, a room dirty tomorrow because its guest leaves today → "Dirty" (green; `catOf` now treats "Checks out today…" as dirty), a reservation arriving tomorrow that already holds a room → pink + "· arrival" while the room needs work. `preAssignedRooms()` shared by the work list and the sheet; `buildMasterSheet({offset})`.
2. **Tiles:** To clean says "check-outs" (the "& dirty" was clipping; dirty rooms are the IP tile), IP says "dirty + IP", IP has its own hourglass icon (`IcHourglass`) and **no ring**. Why: the rings on To clean / To service are that tile's share of the day's rooms; IP is already inside To clean, so a second ring only repeated the same idea in red.
3. **Drag auto-scroll** (`useDragAutoScroll.js`): while a room card is held, the page (or the scrolling container the page lives in) scrolls towards the top/bottom edge the mouse is near — 96 px zone, up to 26 px per frame, faster nearer the edge. Stops on drop, drag end, Esc and unmount. The existing sideways scroll of the housekeeper board is unchanged.
4. **AM/PM sheets removed** (24.9 option, `hk_print_two_sheets`, PM ticks, live re-read at print, `cleanedRooms`). Replaced by a dev-only Rules option **"Print return slips after each sheet"** (`hk_print_slips`, 'true'/'false', dev writes, managers + front desk read): after each housekeeper's sheet comes one page with TWO half-page slips (dashed cut line), each with Name · date · Time ____ and three columns **Cleaned** (vacant dirty / check-outs), **Serviced** (stay-overs), **DND** — the housekeeper's own rooms pre-listed with tick boxes, DND as blank lines. Off by default; the all-rooms sheet never has slips.
Tests: `housekeeping` 48 (+tomorrow master, drag auto-scroll, slips; tiles updated), `hkwork` 18 (+tomorrow master/pink), server tests renamed to `hk_print_slips`; all suites green; printed the slips page to PDF.
**Open / decided with the user:** whether the slips should be on for everyone (it is a dev option for now); DND is not in rGuest data we use, so it stays handwritten; no housekeeper phone input (GM said no) — an optional later step is for the front desk to tick returned slips into the app.

### 2026-11-05 — Sprint 24.10: the one-page "all rooms" sheet + new colour rule

1. **Print all sheets (header button + the one in the Plan card; dev, admin, front desk) now prints ONE page with every room of the hotel:** three groups of `Room | Status` side by side, rooms in floor/number order filled down each group (9 rows for 27 rooms). Header cards: dirty vacant · check-outs · priority · rooms; legend lists only the colours in use. Needs no housekeepers and no save; uses today's board already on the page (press Refresh rooms first for the very latest). Built by `buildMasterSheet` (hkWork.js), rendered by `HkSheets` `master` prop, CSS `.hk-master*`.
2. **Room-cell colour (same on the housekeepers' sheets):** green = dirty vacant (dirty or in progress) · yellow = a guest checks out that day · **pink = priority = the room is pre-assigned to an arriving reservation (RES arriving that day that already carries this room number) AND still needs cleaning** · everything else white. A reservation with no room yet makes nothing pink (it can take any room of its type). A pre-assigned room that is already inspected stays white and its status says "· arrival". The old pink (forecast "clean first" / do-not-move) no longer colours rows; those rooms are still cleaned first and still say CLEAN FIRST on the housekeeper sheets. New item flag `pre`; `catOf` uses it; housekeeper sheets list pre-assigned rooms first. Dev can still recolour all four groups (Rules → print colours); legend labels renamed ("Dirty (vacant)", "Checking out that day", "Priority — pre-assigned to an arriving guest", "In-house (stay-over)").
3. **Status text:** Dirty · In progress · Vacant · inspected · Awaiting inspection · Out of service; a guest leaving today → "Check-out 12 PM" (rGuest gives no per-guest time; `STANDARD_CHECKOUT` in hkWork.js); a guest staying on → the stay span "Oct 17 → Oct 22" as before.
4. **Housekeeper sheets:** per-card "Print sheet" is unchanged; the all-housekeepers batch moved to the header link **Print housekeeper sheets**. Tomorrow and past days have no board of their own, so Print all sheets there still prints the housekeepers' pages. AM/PM and blank-name options (24.9) apply to those pages only.
No migration, no new setting, no server change.
Tests: `housekeeping` 46 (+master page: columns, 27 rooms, order, colours, statuses, legend, cards, dev colours, no save, manager + dev; past day fallback; older print tests moved to the housekeeper link and the new legend labels), `hkwork` 17 (+master builder and pink rule), `staffportal` 20; all other suites green; build clean; checked a printed PDF page.
**Open:** the "arrival" suffix and pink rely on the reservation already holding the room number in rGuest; the check-out time is the standard 12 PM, not the guest's real one.

### 2026-11-03 — Sprint 24.9: wrap-up (tiles, dev table, print legend, AM/PM sheets, blank names)

1. **Tiles:** a short one-line description is back under each number (≤ 22 characters, no wrapping): To clean "check-outs & dirty", To service "stay-overs", **IP** "dirty / in progress" (renamed from "Dirty / In progress"), Total workload "clean + service", Housekeepers "working", Avg. workload "target 10–15", **Progress** (renamed from "Assignment progress") "N of M rooms". Every label is now one line (nowrap + ellipsis on label and description, CSS for `.hk-kpis-7`), so all the numbers sit on the same baseline — in the screenshot "Dirty / In progress" and "Assignment progress" wrapped and pushed their numbers down.
2. **Dev room table:** each floor was its own auto-width table, so columns jumped between floors. All tables now share one `<colgroup>` (`c-room · c-type · c-now · c-stay · c-guest · c-task · c-by`) with `table-layout: fixed` and fixed widths (guest takes the rest).
3. **Print legend:** the colour key under the sheet title printed as empty boxes — browsers drop background colours when printing unless told otherwise. The swatches now force their colour (`print-color-adjust: exact`) and use the colours dev saved (only groups that are on the sheet and not set to "no colour" are listed). Checked by printing to PDF.
4. **AM / PM sheets — dev option (Rules → "Print two sheets per housekeeper (AM and PM)"):** global setting `hk_print_two_sheets` ('true'/'false'; the `hk_` prefix is dev-write-only on the server; managers and the front-desk portal read it, so everyone's prints follow it). On: every housekeeper (Names and No name alike) gets an **AM page then a PM page** (same list; a pill says "AM sheet" / "PM sheet"). The **PM page marks what is already clean**: just before printing, the page re-reads the live room board (the DB-free live route; falls back to the board it already has) and ticks / greys / strikes the room number / writes "done in the AM" on rooms that are clean now — a clean job counts as done when the room is vacant and Inspected / Pickup, a stay-over service when it shows occupied-clean (or clean) — plus a "Cleaned so far N / M" card. The AM page is always the plain list. Applies to today and tomorrow (tomorrow has nothing to tick); past days reprint as one page. Reading the board never changes the page's own data.
5. **No name → "blank name" switch:** in the *How many* pop-over (so for managers, dev AND the front-desk portal): "Name them Housekeeper 1, 2, 3…" — on (default) the sheets say Housekeeper N; off, the printed sheets show an empty underscore line (`______________________`) for the name to be written by hand. Saved with the day's plan (`settings.blankNames`, boolean only; the stored names stay "Housekeeper N" and the screen keeps showing them); restored on reopen; past days reprint the way they were saved.
Server: `hk_print_two_sheets` validator in `PUT /admin/settings`, added to the front-desk settings allow-list, `blankNames` kept by `sanitizeSettings`. **No migration, no new env var.**
Tests: `housekeeping` 44 (+aligned table, legend colours incl. dev-chosen ones and the print rule, AM/PM option dev-only + PM ticks + counts + names mode + off = one page, blank-name switch for manager and dev incl. saved / restored; tiles updated), `housekeeping-server` 10 (+hk_print_two_sheets rules, blankNames), `frontdesk-server` 13, `staffportal` 20 (portal also gets the blank-name switch); all other suites re-run green; lint clean; screenshots of the tiles and a printed PDF page.
**Open:** the PM page can only tick rooms the board shows as clean — refresh the rooms first if you print later in the day; whether the AM/PM option should also split the preview/Print buttons ("Print AM", "Print PM").

### 2026-11-03 — Sprint 24.8: Housekeeping polish + the "other columns refresh" bug

1. **"Step 1 · done" removed.** The small "Step 1" chip is shown only while you are still planning (before Confirm); after confirming — and on past / saved days — the Plan card title has no chip.
2. **KPI tiles have no description lines** (they made the row tall): the seven tiles are label + number (+ the ring on To clean / To service / Dirty / Assignment progress). The detail that used to be in the text ("N of 26 rooms assigned", "9 of 26 rooms to clean") is in each ring's tooltip. Reservations / Forecast tiles are untouched.
3. **Save moved into the Plan card** (next to Confirm plan / Assign by hand; same disabled / "Saved" logic, the "Unsaved changes" text stays in the bar below it). **Only one Print all sheets** now: the page header's. The front-desk portal (unchanged layout) keeps Save in its header.
4. **Bug: opening / closing one housekeeper's floor sometimes made other housekeepers' cards "refresh" (glide).** Cause: `useFlip` (the card-glide animation) runs after *every* render of the page and animates any room card whose page position differs from the one it remembered. A floor accordion opens with a 350 ms CSS transition, but the position remembered right after the toggle is the *start* of that transition; the next render (e.g. opening a floor in another housekeeper a moment later) found the cards under the first accordion "moved" and replayed a glide on them — only when two toggles were close together, hence "sometimes". Fix, in two parts (`shared/useFlip.js`): (a) a card now carries `data-flip-group` (its owner: housekeeper id or `pool`) and **only glides when its group changed** — layout shifts (accordions, scrollbars, pop-overs, resizes) never animate cards that stay with their owner; (b) the remembered positions are refreshed on every `transitionend`, so they can't keep a mid-transition layout. Cards without a group (the hook's other callers: none today) behave as before. The new test fails with the old behaviour (checked).
Tests: `housekeeping` 40 (+Save/Print placement for manager and dev, +no-phantom-refresh at hook level and page level; tiles / two-step tests updated), `staffportal` 20 unchanged, all other suites re-run green; build compiles; screenshot at 1680 px. No deploy steps.

### 2026-11-03 — Sprint 24.7: Housekeeping as a two-step flow

User's brief: the Assignment overview was too big and duplicated the tiles → fold it into the KPI row like Reservations (clean + service were already there, add Dirty / In progress, drop Unassigned = Assignment progress); calendar spans the row; the functions from the assignments header (Auto-assign / Reset / Print, Plan by / For / Who's working / Rules / save state) become their **own card**; below it, Not assigned; the card shows the plan as a **preview — how many rooms each, no rooms**; once confirmed it "jumps down" to Not assigned on top and the housekeepers' assignments. Manager + dev now (dev gets more info); front desk later.

**Page (manager / dev):** header (status bar top-right, links row under) → **seven KPI tiles** (To clean "N check-out · M other" · To service · **Dirty / In progress** · Total workload · Housekeepers · Avg. workload · Assignment progress; rings on clean / service / dirty = share of the day's rooms, progress ring = assigned share; the overview card, its donuts and the separate "Unassigned" are gone) → **Calendar** full width (the legacy day strip, unchanged) → **Plan the day · Step 1** card → *after Confirm* **step 2**: Not assigned (wide, floors side by side) and Housekeepers' assignments (full width, only the cards).
**Plan card:** buttons — **Confirm plan** (shares the rooms out with the same balancer as Auto-assign, reveals step 2 and smooth-scrolls to it), **Assign by hand** (reveals step 2 with every room still in Not assigned), Print all sheets; once confirmed the primary button reads **Auto-assign** (re-share) and **Reset** appears (it keeps the board and the people, rooms go back to Not assigned). Below the buttons: Plan by [Names | No name] · For [Today | Tomorrow] · Who's working / How many pop-over · Rules · save state. Then the **preview**: one mini-card per housekeeper — name, rooms, "N clean · M service · workload W", workload bar + % with the min tick, under / over warnings — titled *Proposed split* (the balancer's proposal, "nothing is assigned until you confirm"), *Current split* after confirming (the real assignment, matches the cards) or *Saved split* on a past day; a "Not assigned N rooms" card appears when rooms are left over. The preview follows the people / rules live. **Dev** additionally sees the floors each housekeeper covers in the preview (plus the existing balancer line and room table).
**Rules of the flow:** a day that already has a saved plan opens straight in step 2; past days are read-only with the calendar + a "Saved split" preview and no controls; changing mode (Names ↔ No name) clears the plan and returns to step 1; No-name **Start / Update only sets the number** until the plan is confirmed (then it re-shares as before); the No-name auto-share and the 24.6 `held` reset guard apply from step 2 on. The front-desk portal (`simple`) is untouched — its board is always shown and its tools / Plan-by bar stay in the assignments panel.
Bug caught by the screenshot: my "Step 1" chip reused the class `hk-step`, which is the round −/+ stepper button (54 px circle) → renamed `hk-stepchip`. Tile row: `.fc-kpis.hk-kpis-7` (needs the extra class to beat Forecasting.css).
Tests: `housekeeping` 38 (ported: most tests now confirm / assign by hand first; new: layout order + seven tiles + no overview, KPI numbers and ring fractions follow the plan, two-step flow incl. preview counts, no room cards in the preview, Confirm reveals + scrolls, Assign by hand, Reset keeps the board, saved plan opens in step 2, dev floors in the preview), `staffportal` 20 unchanged (portal unaffected), all other suites re-run green; build compiles (temp BUILD_PATH); screenshots of step 1 and step 2 at 1680 px. No deploy steps.
**Open:** front-desk portal pass; the Plan card could collapse after confirming; "Assign by hand" could be a link instead of a button.

### 2026-11-03 — Sprint 24.6: Housekeeping bug fixes

1. **Header (dev):** the status bar (freshness + Rooms live) and Refresh / Save / Print wrapped under the title in the dev view because the dev-only "Snapshot history" link made the left block too wide. The **links row now has its own line under the whole header** (`.hk-links { flex: 0 0 100% }`), so the status group stays top-right in dev, manager and portal alike.
2. **Layout v3 (replaces the side-by-side grid; this also settles "Not assigned should be as tall as the assignments" — it no longer sits beside them):** header → six tiles → one row **[Assignment overview | Calendar]** → **Not assigned** as a wide card (the floors sit side by side, every floor that has rooms starts open, its own scroll above 340 px; the legend sits on the title line; hint "Drag to a housekeeper below") → **Housekeepers' assignments full width** (3-up strip, names have room; each card's header row is avatar · name · × · Print sheet, the "N rooms · clean · service · workload" line has its own row under it, then bar + %, then the floor accordions). The **calendar is the legacy day strip back** (14 past days + today + tomorrow, "N HK · M rooms" on saved days, ‹ › scroll buttons, scrolled to today on open); picking a past day opens it read-only (banner + "Back to today"; the overview and calendar stay so you can navigate), Today/Tomorrow in the modebar still work. The front-desk portal keeps its trimmed version (no tiles / overview / calendar / links).
3. **Pop-ups fade in and out** (Who's working pop-over, Rules and Assignment-log dialogs: opacity + a small slide, 180 ms; `useFade` in `HkParts.js`; instant under reduce-motion and in tests via `__HOTELOPS_NO_ANIM`). **No-name dots** (the "how many" card) are **always blue** — one per housekeeper in the box — instead of grey-until-Start.
4. **Reset did nothing in No-name mode:** that mode shares any room that isn't handed out by itself (so new rooms get a housekeeper), and after Reset every room looked "new", so it instantly shared them out again. Reset now records the rooms it handed back (`held`) and the auto-share skips them until you press Auto-assign, Start / Update, change the mode or the day (or a genuinely new room appears). Names mode was already fine. The new test fails with the old behaviour (checked).
Tests: `housekeeping` 36 (layout v3 order/structure, dev header, calendar, Reset in both modes, fade, dots; accordions: Not assigned opens every floor with rooms), `staffportal` 20 (portal Housekeeping matches the trimmed v3), everything else re-run green; build compiles; screenshot at 1680 px. (Note for the future: `react-scripts build` without `BUILD_PATH` empties the gitignored `build/`; I rebuilt it.) No deploy steps.
**Open:** card height is a fixed clamp, so a card with few rooms shows empty space (could shrink to content); calendar could show tomorrow's saved plan marks in colour.

### 2026-11-03 — Sprint 24.5: Housekeeping redesign

User's brief: redo Housekeeping to match the reference image and the Reservations/Forecast look; **UI/UX only — keep every function, API and the assignment algorithms**. `hkWork.js`, the server routes and the saved-plan format are untouched; the changes are in `components/Housekeeping/{index.js, HkParts.js, Housekeeping.css}`, `shared/KpiCard.js` (moved out of Forecasting so the same tile is used) and `shells/ViewContext.js` (`useViewOptional`).

**Layout (manager / dev):** header (breadcrumb Home › Housekeeping, title, subtitle, links *Snapshot history* (dev only) · *Housekeeping settings* · *Print sheets* · *Assignment log*, freshness badge + "Rooms live HH:MM" / "Live unavailable" chip, Refresh rooms, Save, Print all sheets) → **six KPI tiles** (To clean "N check-out · M other", To service, Total workload "clean x · service y", Housekeepers "active (of N)", Avg. workload "target min – max", Assignment progress ring) → grid: **LEFT "Not assigned"** (~30 %, sticky, fixed viewport height, its header + legend stay while the floor list scrolls on its own; "Drag to assign" hint) · **RIGHT**: **Assignment overview** ("26 / 92 rooms assigned" + bar + % and four rings: Clean green, Service blue, Dirty / In progress red, Unassigned grey, each count + share of the rooms with work; an "i" explains them) over **Housekeepers' assignments** (Auto-assign, Reset, Print all sheets; one card per person: avatar, name, "N rooms · clean · service · workload", × (names mode), Print sheet, workload bar + % of max with the minimum tick, floors as accordions in a scrolling body). Housekeeper cards keep the 3-up strip with Prev / Next.
**Floor accordions** (Not assigned and each card): header = floor + room count + caret; the first floor that has rooms starts open; open/closed is remembered; cards stay mounted (closing animates); **cards you move open their destination floor** (feedback); empty floors show "none". Dragging, multi-select, copy/paste, right-click menu, "Move here", pinning, auto-balancing are unchanged.
**Where the mockup had no place (my decisions, easy to change):** *Plan by [Names | No name]*, *For [Today | Tomorrow]*, **Who's working** (pop-over: searchable checkbox list, Housekeeping-only switch; in No name mode the count stepper — opens by itself when you switch to No name) and **Rules** sit in a bar at the top of the assignments panel; *Housekeeping settings* / *Rules* open the same dialog (min, max, clean/service weights; dev also gets the print-colour card there); *Assignment log* is a dialog of the last 14 days + today + tomorrow (replaces the old day strip); a past day shows a read-only banner with "Back to today" and hides the Not assigned panel and the planning controls. **Front-desk portal** gets the same page trimmed: no KPI tiles, overview or links row (as in your earlier simplified screenshot) — Plan by / For / Who's working / Rules, Not assigned, the cards.
**Definition note:** the overview's "Dirty / In progress" is the part of *Clean* that is dirty or being cleaned right now (the mockup's four numbers don't add up, ours are all computed from the real work list; Dirty ⊂ Clean is stated in the "i").
Tests: `housekeeping` 32 (ported to the new layout; new: layout/order, KPI tiles + overview numbers follow the assignment, floor accordions, header links/dialogs, Who's working pop-over), `staffportal` 20 (portal Housekeeping updated); everything else re-run green (dev-auth 12, housekeeping-server 8, forecastlive-route 5, sync-route 12, forecast-allowance-settings 3, devshell 15, kpi-tiles 10, reservations-lean 6, hkwork 16, forecastmodel 26, roomsheet 8, frontdesk-server 13, pinvault 7, forecastpage 28, dev-parity 3); build compiles; screenshots at 1680px compared with the reference. No deploy steps.
**Open:** "To clean" tile is not a filter (the mockup highlights it); stat tiles for the portal if wanted; mobile pass on a real phone.

### 2026-11-02 — Sprint 24.4: Home redo, expandable types, short dev bar, dev parity + PIN vault

1. **Staff Home** (screenshot: misaligned, flipped "Clocked in!" card). The portal Home is rebuilt as one column on one left edge: greeting → **one row of three cards [This week · Total worked · Recent]** → **Timeline** header (week label + ‹ This week ›) → **Daily totals** (chart) → **Daily breakdown**. "This week" = the current week's server total with its date range (the "N shifts below" line is gone); "Total worked" = the week on screen (status pill + progress, "of X scheduled"); "Recent" = the last 3 shifts (date · times · hours, "in progress"). Browsing earlier weeks changes Total worked + the timeline only; the current week is fetched once and kept. The clock-in `Home` page is kiosk-only again (its dashboard branch, the flip cards that rendered mirrored, and `variant` are removed); `PortalHome` + `pages/Timesheet` own the dashboard (`summarizeWeek`, `rangeLabel`). Still no clocking, no CSV.
2. **Sellable vs arriving: expandable.** Each room-type row (today) opens (caret, animated, several open at once, stays mounted so closing animates) to its TYPES — e.g. "Standard NKRR 1/1", "Pets NKRRP 1/2" — with the same x/y, never room numbers. Applies in manager, dev and the portal; the dev "Available" switch applies inside too. Later days unchanged.
3. **Dev bar**: the three buttons are just "Dev view · Manager view · Front desk view" (descriptions removed, shorter buttons) and the sentence is "You are viewing as Dev / Manager / Front desk".
4. **Dev parity audit** ("dev should see everything"): found the Calendar notes powers (`NotesDrawer`, `NotesCenter`) keyed on `role === 'admin'`, so dev lost resolve/delete/edit-any-note and the manager notes labels — fixed (admin OR dev). Server checks were already dev-aware (`requireRole('admin')` admits dev; direct checks include dev; verified line by line). New guard `tests/dev-parity.test.js` fails the build of any new `role/type === 'admin'` check (client or server) that does not also mention dev.
5. **Dev-only PIN reveal ("PIN vault")** — user chose "encrypted copy, dev reveals". PINs are still verified against the bcrypt hash only. New `server/pinvault.js` (AES-256-GCM, key derived from env **`PIN_VIEW_KEY`**, ≥16 chars) and column `users.pin_enc` (**migration 031**). The copy is written whenever a PIN is set/changed (`savePinHash`), cleared on reset, and **back-filled at sign-in** for PINs set earlier (when the owner types their PIN correctly); with no key nothing is stored. `POST /api/dev/employees/:id/pin/reveal` (`requireRole('dev')` → managers 403, no-store) returns the PIN or a reason (`not_configured` / `not_stored` / `no_pin`) and writes an `audit_logs` row (`dev_pin_reveal`: which dev, which employee — never the PIN). Staff page: in the full Dev view a **Reveal PIN** button next to Reset PIN, shows the PIN for 20 s (Hide button), plain messages for the reasons; Manager view and managers are unchanged ("can reset, cannot view"). Safe ordering: if migration 031 hasn't been applied, setting/changing PINs and sign-in still work (the update falls back to the hash-only form) and reveal says "not viewable yet".
**Deploy:** run `database/migrations/031_sprint24_pin_vault.sql`, set Koyeb env `PIN_VIEW_KEY` (a long random secret; changing it later just makes stored copies unreadable until people sign in again), deploy. Without the env var everything works and the reveal says it isn't configured. Security note: this deliberately weakens "nobody can read a PIN" to "only dev can, with an audit trail" at the user's request; a leaked DB alone is not enough (the key lives in the server env).
Tests: `pinvault` 7 (crypto, no-key behaviour, set/change/reset hooks, reveal auth matrix + audit content, reasons, login back-fill, pre-migration fallback), `forecastpage` 28 (+expandable), `staffportal` 20 (+Home layout/order, week browsing keeps This week/Recent), `devshell` 15 (short bar, three buttons, no descriptions), `dev-parity` 3; all other suites re-run green; build compiles; screenshots of Home and the expanded sellable card checked.
**Open:** a way for dev to set a PIN on someone's behalf (not asked); showing the audit log of reveals in the Dev tools Logs.

### 2026-11-02 — Sprint 24.3: Reservations tab, timesheet on Home, VI column, dev Front desk view

User asks (one by one): (1) front-desk Home must not hold the reservation cards — make a **Reservations** tab (the 5 cards + the forecast card); Home stays the working hours and also gets the timesheet; no Timesheet page; no CSV export. (2) "Sellable vs arriving": add a column showing VI only vs VI+PU as x/y, for dev AND admin; decided semantics: left to sell, x counting only inspected (VI) rooms, y the old number (VI+PU); plus a **dev-only toggle** "Left to sell | Available" (Available = nothing subtracted for arrivals: x = VI rooms, y = VI+PU rooms). (3) no bar chart for the front desk. (4) dev gets a **Front desk view** (no logging in as an employee); "dev should in future see everything".

- **Portal nav** (`StaffPortalShell`): Home · **Reservations** (front desk) · Housekeeping (front desk) · Calendar · Settings. The Timesheet page is gone. `pages/PortalReservations` = `FrontDeskSummary` (title "Reservations · today", five tiles, sellable card without chart). The tile row stays 5-across down to 1250px.
- **Home** (`PortalHome`): `Home variant="dashboard"` (this week + recent, now two cards side by side) with the full timesheet underneath (week navigator, total worked + status, daily chart, daily breakdown). **CSV export removed** from `pages/Timesheet` (button, menu, code and CSS) — it was only used here. Portal CSS overrides the kiosk-locked height rules of the original Home. Still no clocking.
- **Sellable vs arriving** (`ForecastSummaryCard`, today only): per room type `x/y` = max(0, VI − arriving) / max(0, VI+PU − arriving) with a small "VI / VI + PU" header; total row = sums ("0/1 rooms"). Same card for manager, dev and the portal; later days keep the single number (VI/PU only exist for today's live board). Props: `showChart` (portal: false), `toggle` (dev layout of the Forecast page only; a dev viewing "as Manager" sees the manager version). Switch state is local to the card.
- **Dev "Front desk view"**: third button on the dev bar (Dev · Manager · **Front desk**, amber bar). `AdminShell` renders the real `StaffPortalShell` with `preview={{ bar }}` (`shells/PortalPreview.js` context): the dev is treated as Front Desk (the server accepts the dev token on `/api/frontdesk/*`), the bar stays on top to switch back, Settings is hidden (a dev has no staff profile), and Home shows a note instead of personal hours (no `/me/hours` request for a dev). Remembered per browser session (`hotelops-view-as`). Pattern for future views (e.g. plain staff): one more mode + one `preview` consumer.
Tests: `forecastpage` 27 (+x/y for manager and dev, toggle dev-only and correct in both directions, later days unchanged), `staffportal` 18 (+Reservations tab content/no chart/no toggle, x/y in the portal, Home = hours + timesheet without CSV, no Timesheet nav, dev Front desk view end to end); `frontdesk-server` 13, dev-auth 12, housekeeping-server 8, forecastlive-route 5, sync-route 12, forecast-allowance-settings 3, housekeeping 29, devshell 15, kpi-tiles 10, reservations-lean 6, hkwork 16, forecastmodel 26, roomsheet 8 re-run green; build compiles; screenshots of Reservations and Home checked. No deploy steps.
**Open:** whether the dev Available toggle should also be remembered across visits; Settings in the dev Front desk view; the dev bar will need a "Staff view" when staff communications arrive.

### 2026-11-02 — Sprint 24.2: login default + front-desk access by role or department

1. **Login default.** `/:tenant/login` now ALWAYS opens on **Clock in** (the numpad). The other two modes are one click away and are no longer remembered for the next visit (24.1 reopened on the last door used). `hotelops-staff-entry` is still stored, but only to route an already-signed-in user back to the right shell.
2. **Front-desk access.** The user tested with Staff → role = **front desk** and department "— None —", and the portal showed nothing extra: 24.1 only looked at the department. Access is now **role `front_desk` OR department "Front Desk"** (either one), on both sides: `requireFrontDesk` (server/auth.js; role and department are read from the signed token, still no DB lookup per request) and `isFrontDesk(user)` (client). Managers/dev unchanged. Role/department changes take effect at the person's next sign-in. NOTE for testing: these features are in the **Staff login** portal (PC form); signing in through **Clock in** only clocks in/out by design.
Tests: `frontdesk-server` 13 (role-only, role + no department, other role/department combinations) and `staffportal` 16 (the reported case — role front desk, department None — gets Housekeeping + the Home block and calls the front-desk routes; plain employee does not; login opens on Clock in even right after a Staff login). Build compiles; dev-auth, housekeeping-server, devshell, housekeeping re-run green. No deploy steps.

### 2026-11-02 — Sprint 24.1: staff-portal rework (user review of Sprint 24)

User feedback on Sprint 24 and decisions: (1) Staff login must NOT share the numpad — it is the admin-style login card, typed on a PC (the numpad is the pad where people clock in / out); credentials = **username / phone / ID + PIN** (the PIN is optional unless the person has one). (2) Remove the names on the mode buttons, icon only; keep the current badge icon for Staff login (user will replace icons later). (3) Animations on the login mode switch were wrong. (4) Logic: **Clock in** = only clocking in / out; the legacy multi-page staff page is removed and merged for everyone into **Staff login**; Staff login has **no** clock in / out (that is its own feature). (5) Staff in the **Front Desk department** (user chose department over role) get the forecast tiles + Housekeeping from Sprint 24.

**Login screen.** Three modes, each screen showing the other two as identical icon-only squares beside the HotelOps mark (`LoginModeSwitch`; name = tooltip/aria-label; tag and labels removed). **Clock in** = the numpad `StaffLogin` (unchanged apart from landing on `/:tenant/clockin`). **Staff login** = new `StaffPortalLogin.js`: same card as `AdminLogin` (single column), fields "Your phone number or employee ID…" (label follows the admin's enabled login methods; letters/`._-` allowed so a username works) and "PIN (if you have one)"; calls the existing `POST /api/auth/staff/login` (no new credential path); a missing PIN shows "Enter your PIN to sign in."; `pin_must_set` still goes to /set-pin. *Animation:* I can't watch the browser, so I fixed the likely causes — the labelled buttons had different widths per screen (the HotelOps mark jumped during the card morph), the extra tag shifted the layout, and `key={mode}` forced extra remounts. Now every screen has HotelOps + two equal squares, the Staff login card is the same shape as the manager card (so staff↔manager is the old, proven morph), no tag. If it still looks wrong, send which transition + what it does.

**Clock in door** (`shells/ClockInShell.js`, replaces `StaffShell`, which is deleted): no sidebar; `Home variant="kiosk"` = greeting + focused-action screen + Clock In/Out + a confirmation card with the auto-signout countdown (new `.home-confirm`), plus the old shell-level idle sign-out. No hours / recent shifts / timesheet / calendar / settings. **Staff portal** (`StaffPortalShell`, `/:tenant/staff`, every employee): Home (`Home variant="dashboard"`: greeting, this-week hours, recent shifts — the clock section and the focused-action/auto-signout are not rendered), Timesheet, Calendar, Settings; plus, for the Front Desk department, Housekeeping and the front-desk block on Home (tiles + Sellable vs arriving).

**Department-based access.** `auth.js`: `requireFrontDesk` (managers/dev, or a staff token whose `dept` is "Front Desk": case-insensitive, `front desk` / `front-desk` / `front_desk`, exact name — "Front Desk Supervisor" does not match) replaces role `front_desk` on every `/api/frontdesk/*` route; the `ROLE_IMPLIES` additions from Sprint 24 are gone. The staff sign-in query now joins `departments`, puts `dept` in the token and `department` in the response user (so no DB lookup per request — the live board poll must stay DB-free; `/api/me` already returned `department`). Consequence: a department change takes effect at the person's next sign-in (tokens last 8 h); the old role `front_desk` alone no longer opens anything. Client: `isFrontDesk(user)` in `auth/index.js` gates the nav item, the Home block and every request.

**Tests:** `frontdesk-server` 13 (department matrix incl. role-only 403, token `dept` + `user.department` at sign-in, name matching) and `staffportal` 16 (icon-only buttons and order, Staff login = typed form without numpad, same card shape, exact request body, PIN message, door routing/remembered/stale link, portal for Front Desk vs other staff vs role-only, no clock anywhere in the portal, Clock in door = clock only incl. confirmation + countdown, simple Housekeeping). All earlier suites re-run green (dev-auth 12, housekeeping-server 8, forecastlive-route 5, sync-route 12, forecast-allowance-settings 3, housekeeping 29, devshell 15, kpi-tiles 10, forecastpage 24, reservations-lean 6, hkwork 16); build compiles; screenshot of the Staff login card checked.
**Deploy:** nothing to run. People need to be in a department named **Front Desk** (Staff → department) and sign in again after a change.
**Superseded from Sprint 24:** Staff login using the numpad; labelled mode buttons + the entry tag; the clock on the portal Home; the legacy `StaffShell`; role-based gating.
**Open:** the user will supply final icons; whether the Clock in door should also show last clock time / hours after clocking (kept to "clock only" as asked).

### 2026-11-02 — Sprint 24: staff portal for the front desk

**User brief:** a separate sign-in for the front desk that opens a simplified Forecast + Housekeeping (same functions as the manager for now), everything under Home for staff; add a button to the right of the manager icon on the login page. Decisions (user): **same credentials as clock-in** (whatever login methods the admin enabled); the old staff pages are NOT deleted, they stay as the legacy "Clock in" door; Home merges the old dashboard (clock, hours, recent shifts) with the new front-desk content; Forecast and Housekeeping like the left-hand menu of admin/dev; naming: rename the old staff entry (Clock in) and call the new one **Staff login** because future daily staff communications may include housekeepers.

**Two doors, one sign-in endpoint.** `/:tenant/login` now has three modes — **Clock in** (the original phone / ID / PIN screen), **Manager**, **Staff login** (same screen and same `POST /api/auth/staff/login`; no new credential path). Each screen shows the other two as buttons beside the HotelOps mark (`LoginModeSwitch.js`): HotelOps · Manager · **Staff login** (icon + visible label; label hidden ≤760px, aria-label/title stay); a small tag under the headline says which door you are on. The screen opens on the door this browser used last (`hotelops-staff-entry` in localStorage; default Clock in). Landing: Clock in → `/:tenant/clockin` (the unchanged `StaffShell`: 15 s idle sign-out, focused-action overlay, auto-signout after clocking); Staff login → `/:tenant/staff` (new `StaffPortalShell`). `homePathFor(user, slug)` (auth/index.js) picks the door for RootRoute / RedirectIfAuthed / RequireRole; a stale `from` deep link to the OTHER staff shell never overrides the door just chosen. Managers/dev unchanged.

**Portal shell** (`shells/StaffPortalShell.js`): nav Home · Housekeeping (front desk only) · Timesheet · Calendar · Settings (the existing staff pages, unchanged). No shell-level idle logout (desk PC; the 8 h token still expires). **Home** (`pages/PortalHome`) = left: front-desk block (`components/FrontDesk/FrontDeskSummary.js`: the five Reservations tiles — arrivals left, in-house, check-outs left, left to sell, dirty rooms — and the Forecast's "Sellable vs arriving" card, TODAY only, the very same `KpiCard` / `ForecastSummaryCard` / `buildRoomCondition` / `buildDayModel` the manager pages use, so numbers match; freshness badge + refresh button); right: the original dashboard (`Home` with new prop `portal`: no focused-action overlay, no auto-signout countdown). Other employees who use Staff login get only their own dashboard and make no front-desk requests (role `front_desk` gates both the UI and the server). Cost rules kept: payload loads on open / tab focus / Refresh only; the live board (DB-free) polls every 2 min while visible and pauses after 30 min idle.

**Housekeeping, simplified** (`Housekeeping` new props `apiBase` ('/admin' default | '/frontdesk') and `simple`): no stat cards and no 14-day history strip; "Plan by [Names | No name]  For [Today | Tomorrow]" + save state, then Staff · Working today · Not assigned and the housekeepers' columns exactly as the manager page. Every function is the same (names / no name, staff picker, min/max/clean/service rules, Auto-assign, Reset, drag, multi-select, copy/paste, Save, Print). Dev-only extras (print colours card, room table) stay hidden. History is not in the portal (managers have it).

**Server (least privilege).** The portal never calls `/api/admin/*`. New `/api/frontdesk/*` routes, role `front_desk` (managers and dev may call them too: `ROLE_IMPLIES` = dev→admin,front_desk; admin→front_desk): `forecast/current` (same payload, **guest identifiers removed server-side** — `server/frontdesk.js` `redactPayload`: guestName, confirmationId, primaryGuestProfileId, vipUuid/vipLabel on reservations; guest names on per-room rows), `forecast/live` (room numbers + housekeeping status, no guests; DB-free, bypasses the shift-cap query like the admin one), `employees` (user_id, name, active, department only — no phone/pay/birthday/PIN), `settings` (allow-list: hk_print_colors, forecast_allowance_*), `housekeeping/plan` GET+PUT, `plans`, `locked-rooms` (shared handlers with the admin routes, so validation is identical; plans a desk saves are visible to managers). Admin routes unchanged.

**Tests:** new `frontdesk-server` 12 (role matrix none/employee/front_desk/admin/dev on every route, desk blocked from admin routes, redaction incl. no mutation of the cached payload, allow-listed settings, DB-free live, plan save/read, dev-only routes still closed to desk + managers) and `staffportal` 14 (door logic + guards, login modes/order/labels, same request → /clockin vs /staff and remembered, stale deep link, error message; portal nav for desk vs employee, tiles = model numbers, no manager routes, no overlay/countdown + positive control on the legacy Home, simple Housekeeping layout, save through /frontdesk, Tomorrow, No-name). Re-run green: dev-auth 12, housekeeping-server 8, forecastlive-route 5, sync-route 12, forecast-allowance-settings 3, housekeeping 29, devshell 15, kpi-tiles 10, forecastpage 24, reservations-lean 6, hkwork 16. Build compiles; screenshots checked (login both modes, portal Home 1600px, portal Housekeeping).
**Deploy:** nothing to run — no migration, no env var. To use it, set a person's role to **Front Desk** (Staff → role); they sign in with Staff login.
**Not built (ideas / open):** daily staff communications (the reason for the "Staff login" name); history + statistics in the portal Housekeeping; a Reservations (guest list) page for the desk; a per-property setting for which role(s) see the front-desk block; making the Clock-in kiosk door optional per property.

### 2026-10-22 — Sprint 23.8: obvious Dev / Manager switch

Admin panel only (`src/shells/AdminShell.js` + `src/pages/Dev/DevPages.css`; nothing else touched). The small "View as Full | Manager" strip is replaced by a bold bar at the top of every admin page for dev sessions: **the bar's colour tells you the view** (purple = Dev, teal = Manager), it says "You are viewing as Dev — full / a Manager", and the switch is **two big buttons** with an icon, a name and a line of explanation — "Dev view · Every control and debug tool" / "Manager view · Exactly what a manager sees" — the current one white and pressed (`aria-pressed`), the other translucent with hover/focus states; "Switch property" is now a bordered button on the right. Phones: the bar wraps and drops the sub-lines. Same session-remembered behaviour (`hotelops-view-as`); managers never see the bar. Old `dv-viewbar / dv-seg / dv-link` styles removed.
Tests: `devshell` 15 (+obvious-switch test; selectors moved to the new markup); build compiles.

### 2026-10-21 — Sprint 23.7: in-app dialogs, count card, multi-select / menu / copy-paste, housekeeper strip

1. **In-app confirmations**: the browser's "hotelops… says" dialogs for switching Plan-by mode and for switching day with unsaved changes are replaced by the shared `ConfirmModal` (themed, Esc / backdrop closes, danger button). No `window.confirm` is left on the page.
2. **Count card (No name)** redesigned to fill the card: title, a big number between round − / + buttons, a row of person dots (one per housekeeper in the box; they light up once started), and a full-width Start / Update at the bottom. The explanatory paragraph is gone.
3. **Multi-select**: click = just that card; **Ctrl/⌘-click** adds/removes; **Shift-click** selects the range inside the same group (a touch tap adds); **Esc** clears. Dragging a selected card takes the whole selection; "Move N cards here" does the same by tapping; everything moved is hand-placed (pinned). **Right-click** a card → a themed menu: "N cards", Copy (Ctrl/⌘ C), Move to Not assigned / each housekeeper (right-clicking an unselected card selects it first). **Copy / paste**: Ctrl/⌘+C copies the selection, Ctrl/⌘+V pastes (moves) it into the group under the mouse (or the last group clicked); right-click a group → "Paste N cards here"; a bar shows what is copied (Clear). Shortcuts are ignored while typing in a field.
4. **Housekeepers as a horizontal strip**: three columns in view (two ≤1100px, one on phones), each a fixed-size card whose rooms scroll inside; "Housekeepers 1–3 of 5" with **Prev / Next** (slide one housekeeper; hidden with three or fewer) or a trackpad swipe; dragging near the strip's edges scrolls it; cards in off-screen columns stay reachable through the menu / paste / "Move here". `useFlip` now keeps its remembered positions in step with scrolling inside the board so the card glide never fires from stale places.
5. "Plan by" option renamed **Just a number → No name**.
Tests: `housekeeping` 29 (+multi-select, multi-drag, right-click menu, copy/paste, strip, count card, in-app dialogs), other suites green; build compiles; screenshots checked (light + dark).

### 2026-10-21 — Sprint 23.6: quality of life

1. Removed the explanatory strip next to the "Plan by" switch ("no names — Housekeeper 1, 2, 3…, rooms shared out automatically") and the count card's suggestion line ("Workload 44 → 3–4 housekeepers keeps everyone between 10 and 15").
2. **Not assigned** is unlocked: it grows with its cards (no fixed height, no inner scroll) and is organised as one block per floor — **Ground, 1, 2, 3, 4 always shown** ("none" when empty); any other floor with cards (e.g. reservations without a room yet) is added after them; cards dropped back land under their floor. The "Everything is assigned." text is gone (only the "add a housekeeper / enter how many" hint remains when nobody is working).
3. **Sidebar fix** (dev "Platform" / bottom of the page): the dev nav group made the link list taller than a laptop screen, so the sidebar grew past the shell's 100vh and Dark mode / Sign out were pushed below the fold (overlapped by the page). The sidebar is now exactly viewport height; the link list scrolls (thin scrollbar) while the brand and footer stay put. Applies to every shell.
Tests: `housekeeping` 23 (+floor presets, no suggestion/strip), `devshell` 14 (+sidebar scroll rules); others green; build compiles; sidebar checked in a 640px-high viewport.

### 2026-10-21 — Sprint 23.5: number-mode card fixes, wider "Not assigned", smarter balancing

1. **Layout (both modes)**: row 2 is now [Staff or "How many housekeepers?"] + [Working today] side by side, and **Not assigned spans the full width below both** (same widths for the two cards, the pool just gets more room and shows more cards per row; slim when empty). The old stack wrapper is gone; names mode keeps a 300px minimum row so the staff list is usable even before anyone is added; number mode has no empty space (the count card also shows "Workload 43.5 → about 3–4 housekeepers keeps everyone between 10 and 15").
2. **Stepper**: − and + now work from the start and ONLY change the number in the box (previously they were disabled until Start and then applied instantly); the button is **Start** at first and **Update** afterwards (disabled while the number equals the applied count); Enter applies; capped 1–40; the − / + width rule no longer squeezes the Update button.
3. **Balancing — `evenOut` (new, runs at the end of `balance`)**: after the floor-by-floor split, repeatedly take the lightest housekeeper and the heaviest who has something movable and move a small group until the gap is ≤ 1 workload (and nobody stays under the minimum while the donor stays above it). What moves: stay-over **services first** (cleans only if there are no services, and only for a gap > 40% of an average load so floors of cleans stay whole); **one floor at a time** — a floor the light person already works, otherwise the donor's smallest leftover floor (so the busy one keeps their main floors and the light one gets a compact block, e.g. 311 + 312); pinned cards never move; nobody is pushed over the maximum. The reported case (HK1: 8 ground cleans + 3 services = 9.5, HK2: 23 rooms = 12) → 311 and 312 go to HK1 (10.5 / 11 / 11 / 11).
Tests: `hkwork` 16 (+exact reported case, rules, end-to-end), `housekeeping` 22 (stepper behaviour, layout rows), other suites green; build compiles; laptop screenshot checked.

### 2026-10-21 — Sprint 23.4: plan by number, print colours, sheet summary (GM requests)

1. **"Just a number" mode**: a "Plan by [Names | Just a number]" switch above row 2. In number mode the Staff card becomes "How many housekeepers?" (stepper − / number / +, Start/Apply); people are "Housekeeper 1…N" (ids `anon-N`, no × buttons) and the rooms are **shared out automatically** — on Start, on every change of the number (hand-placed cards stay), and when new rooms appear after a refresh; the capacity warning, minimum/maximum, drag, Reset and printing all work as before. Saved as `settings.anonymous` (+ the N housekeepers); reopening a day restores number mode with the saved count; switching modes asks first because it clears the day's assignment.
2. **Print colours** (`hk_print_colors`, JSON `{dirty, departure, priority, inhouse}`; each `#RRGGBB` or `''` = no colour): defaults **dirty rooms green** (#c6f6d5), **remaining check-outs yellow** (leaving that day, #fefcbf), **priority / pre-assigned (clean first, do-not-move) pink** (#fed7e2), **in-house stay-overs no colour** and they print their **check-in → check-out**. Every work item has a group (`cat`, priority beats the others) and a `stay`; both are saved with the plan (so printing history keeps the colours). **Dev only** can change them: a "Print sheet colours" card in the Full view (colour pickers, "No colour", "Default", live preview, Save, Reset all) → `PUT /api/admin/settings` (the `hk_` prefix is dev-write-only like `forecast_`/`sync_`; managers can READ it so their prints use it; value validated: JSON, known groups, hex only).
3. **Sheet summary card**: top of every printed page — Rooms to clean · Rooms to service · Workload — plus a small legend of the colours that appear on that page. Verified by printing through headless Chrome (colours exact, one page per housekeeper).
Tests: `hkwork` 13 (+groups/stay/colour parsing), `housekeeping-server` 8 (+colour setting dev-only/validation, plan keeps cat/stay/anonymous), `housekeeping` 22 (+number mode flow, save/restore, switch confirm, sheet summary + colours + legend, manager uses saved colours, dev colour card); other suites green; build compiles.
No migration (setting + plan JSON only).

### 2026-10-21 — Sprint 23.3: Housekeeping alignment, manual-first assignment, dev room table

1. **Row 1**: the five numbers are now small separate cards on the LEFT (wider), the day strip on the RIGHT showing about five days (scroll for the rest).
2. **Row 2**: Staff is wider and exactly as tall as the stack beside it (the row's height comes from the stack; the staff list scrolls inside); the stack = **Working today** (top, with **Auto-assign** and **Reset** beside the title, then the rules) and **Not assigned** (below). **Nothing is assigned by itself any more**: adding people leaves every room in "Not assigned" (the capacity warning still shows); **Auto-assign** shares the not-hand-placed rooms out (same balancer: floor affinity, min/max) and keeps hand-placed (pinned) cards; **Reset** asks "Put every room back in Not assigned?" (Yes, reset / Cancel) and empties every column incl. hand-placed (people stay). Dragging / tap-and-"Move here" / pin dot unchanged. Removing someone sends their rooms back to the pool. Saved plans now restore the WHOLE assignment (hand-placed → pinned, the rest → auto) via `reconcile` + `resolveAssign`.
3. **Divider** ("Housekeepers' rooms") between the controls and the columns; each housekeeper's column has a **fixed height** (clamp(340px, 54vh, 540px); 380px on phones) — header, totals and meter stay put, the cards scroll inside.
4. **Dev table** (`HkRoomTable.js`, "Full" view only, below the cards + balancer line): every room by floor like the Forecast room status sheet — status now, stay (in → out), guest, task + reason, **who cleans it** (marks: ★ clean first, ⚑ do not move, ● hand-placed; "not assigned" highlighted), filter All / Needs work / Not assigned, Download CSV, reservations without a room as a "to be assigned" section; for tomorrow the status/stay are the board as of now (noted).
Bug found in the screenshot: floors showed twice ("FLOOR 2" and "FLOOR 02") because stay-over rooms carry the reservation's raw floor id — all work-list floors are now normalised (`mkItem` → `normFloor`).
Tests: `hkwork` 12, `housekeeping-server` 6, `housekeeping` 17 (manual-first, Auto-assign, Reset confirm, layout rows/stack/divider/scrolling body, dev table), all earlier suites green; build compiles; screenshots at 1440px (dark, dev) and 390px.

### 2026-10-21 — Sprint 23.2: Housekeeping fixes (do-not-move rooms, layout, drag flicker, mobile)

1. **Do-not-move rooms (point 5 of 23.1, now real)**: the rGuest field is `doNotMoveRoom` on the reservation (already stored by the detail job as `reservation_detail.summary.stay.doNotMoveRoom`). New `GET /api/admin/housekeeping/locked-rooms?date=` (admin/dev; DB only, no rGuest call; room numbers only): arriving (RES) reservations with a room, still current (`gone_at IS NULL`), stay covering the day, flag ON. In the page those rooms get ⚑ on the card, and if they need cleaning they are clean-first (★, reason "guest asked not to be moved (do not move)"). A stay-over room with the flag is marked but not prioritised. Asked once per day view; none for history.
2. **Layout**: row 1 = day strip card + numbers card side by side; row 2 = Staff (narrow, 270px) · Working today (+ rules) · Not assigned; the housekeepers' columns follow directly below (no more scrolling past tall cards). Legend line (clean / service / ★ / ⚑ / placed by hand). Cards are 76px, type on one line (no "svc" wrapping — the colour bar says clean vs service).
3. **Drag flicker fixed**: `dragleave` fired every time the pointer crossed a child card → the column highlight toggled and the board re-rendered continuously; now only a real exit clears it. A hand-dropped card no longer FLIP-animates across the page (`useFlip(skipRef)` one-shot skip) — it just pops in place; automatic re-balancing still glides.
4. **Mobile**: ≤760px single column, order = numbers → working today → staff (short scroll list) → not assigned → columns; full-width action buttons, larger tap targets, 4 cards per row, tap-a-card then "Move here".
Also: dev last-stay lookup no longer repeats when the work list rebuilds (keyed by room list).
Tests: `hkwork` 10, `housekeeping-server` 6 (+do-not-move route and its real SQL on postgres incl. gone / INH / false / other property cases), `housekeeping` 15 (+layout rows, drag-leave, do-not-move marks, useFlip); all earlier suites green; screenshots checked at 1440px and 390px (dark).

### 2026-10-21 — Sprint 23.1: Housekeeping redesign (history, two cards, cards you drag, automatic balancing)

User decisions: past days read-only, dev sees extra detail, "locked room" field to be named by the user (not found in our data), dragged cards stay put.
1. **History**: a day strip (14 days back, today, tomorrow). Past days show the SAVED assignment read-only (cards, no drag/save/staff panel, printable without writing); days with a plan show "N HK · M rooms"; no plan → "Nothing was saved". New `GET /api/admin/housekeeping/plans?from&to` (≤60 days, counts per day). Saved rooms now keep `typeCode`, `why`, `pinned` (server sanitizes; junk dropped).
2. **Two cards**: left = all staff (search, scrolling list, Add), right = who is working today/tomorrow (remove ×) + rules (min, **max**, clean/service weights, "Reset hand-placed"). 3. The "Housekeeping only" checkbox is a themed switch. Slimmer stat bar replaces the big tiles.
4. **No "no room number" note**: reservations without a room still count by ROOM TYPE — each becomes a placeholder card "TBD · NQRR" (clean-first / check-out / stay-over) that is handed out like a room.
5. **Locked rooms**: plumbing only — `isRoomLocked(res)` (reads `roomLocked` / `roomAssignmentLocked` / `lockedRoom`); a locked arrival room that needs cleaning becomes clean-first with "guest requested this room". The real rGuest field name is still unknown → NOT populated by the scraper yet (needs the user to name it, or one detail probe).
6. **Automatic balancing** (`balance`, replaces the Auto-suggest button): runs on every add/remove/rule change; all added housekeepers share the work evenly; a floor goes to ONE housekeeper when the cut can move to a floor boundary within 20% of a share and nobody exceeds the max; **warnings**: "Add a housekeeper…", "Too many rooms for 1 housekeeper: about 17.5 each (maximum 15). Add 1 more.", per-person over-max / below-min flags on cards, meters (with a min tick). **Rooms are small cards** grouped by floor, no names/drop-downs; drag between columns / the "Not assigned" pool (HTML5 DnD) or tap a card then "Move here" (touch); a hand-placed card is PINNED (dot; click to release) and ignored by the balancer; cards glide to their new place (FLIP, `shared/useFlip.js`).
7. **Dev ("Full") view**: guest on every card (current guest · confirmation, or the last stay in a dirty vacant room via /api/dev/rooms/last-stays) + balancer details line; managers see neither and trigger no guest lookups.
Tests: `hkwork` 10 (balance, adding people, pins, reconcile, saving shape, TBD cards, locked rooms), `housekeeping-server` 5 (+day strip route, real SQL), `housekeeping` 11 (two cards, auto-balance, drag, tap-move, save/restore, history read-only, tomorrow, print, dev vs manager); all other suites green; build compiles; dark-mode screenshot checked. No new migration (030 from Sprint 23).

### 2026-10-21 — Sprint 23: Housekeeping (assign rooms to housekeepers)

Decisions (user): auto-suggest then edit; housekeepers = existing staff accounts, searchable; weighted workload (check-out clean vs stay-over service); today + tomorrow, saved.
**Page** (`src/components/Housekeeping/`, admin nav "Housekeeping", same for managers and dev): Today / Tomorrow tabs · tiles (rooms to clean, stay-overs to service, total workload, housekeepers) · staff picker (search `/admin/employees`; defaults to the Housekeeping department, checkbox widens to everyone; inactive hidden; list closes on choose / click outside) · settings (**minimum workload each = 10, clean counts 1, service counts 0.5**, all adjustable and saved with the plan) ·
**Auto-suggest** (`hkWork.suggest`): uses only as many housekeepers as the minimum allows (total workload ÷ min, at least one), hands rooms out floor by floor in order so each gets a contiguous run; the rest can be given rooms by hand · every room has a "move to" drop-down (Unassigned / any housekeeper) · per-housekeeper card with counts, workload, minimum meter and a "below the minimum" warning · Save · Print all sheets / Print sheet per person.
**Work list** (`hkWork.buildWorkList`): TODAY = vacant Dirty/In-progress rooms (clean), occupied rooms checking out today (clean), every other occupied room (stay-over service); rooms the forecast says must be ready first are flagged *Clean first*. TOMORROW = the second-night plan: clean-first rooms, remaining check-outs, leftover dirty rooms (clean), rooms staying over (service); reservations with no room number yet are only counted and shown in a note.
**Saved plans**: migration **030** `hk_plans` (property_id, plan_date, settings, assignments JSON; one row per day), `GET/PUT /api/admin/housekeeping/plan` (admin + dev; `server/housekeeping.js` validates: date range, ≤60 housekeepers, room-number pattern, kinds, no duplicates, settings clamped). Written ONLY on Save/Print (Print saves first if anything changed) — no timers, no polling (Neon). Reopening a day restores it and **reconciles** with the current work list (rooms that no longer need work drop out, new rooms appear unassigned).
**Print**: `HkSheets` — one portrait page per housekeeper (name, date, totals, tick-box, room, floor, type, task, clean-first marker, notes column, start/finish/sign-off line), verified through headless Chrome (2 housekeepers → 2 pages, app content not printed). Also fixed a **regression from 22.9**: the "hide everything but the sheet" print rule was global and would have blanked the Reservations print sheet; it is now scoped to `body.is-printing-sheet` (set by `usePrintSheet`, used by the room sheet, plan sheet and these sheets).
Bug found by tests: the work list threw before the room data had loaded (no date) — guarded.
Tests: `hkwork` 6 (work list today/tomorrow, weights, suggest, reconcile, assignments), `housekeeping-server` 4 (validation, routes + auth, bad input, migration + real SQL on postgres), `housekeeping` 9 (page: load, picker, suggest, move, save/restore, reconcile, tomorrow, print, failed save); `devshell` nav updated; all earlier suites green; build compiles.
**Deploy**: run `database/migrations/030_sprint23_hk_plans.sql` BEFORE using the page (psql, like 028/029). No new env vars.
**Not built (ideas)**: front-desk (staff shell) access to this page; drag-and-drop; remembering a usual housekeeper roster; per-room time estimates; a statistics page.

### 2026-10-21 — Sprint 22.10: animations (closes Sprint 22)

Forecast (dev + manager): the **"Sellable vs arriving" bars grow from 0** and the per-type / total "left to sell" numbers **count up**, on first show and whenever another day is chosen (`GrowBar`, `useGrow`, `CountUp` in `shared/CountUp.js`, 1.6 s). **14-day outlook**: each day's occupancy bar grows and its percentage counts up on first show and when that day is clicked (`OutlookDay`).
**Rooms to sell (manager)**: the room-type dropdowns now **animate open/closed** (grid-rows 0fr↔1fr + fade, rotating caret) and **any number can be open at once** (previously one). Closed rows stay mounted after the first open so the close can animate. "Reduce motion" skips all of it; a `window.__HOTELOPS_NO_ANIM` flag lets tests read final values. Fixed a bug found by the new test: the timer fallback for browsers without requestAnimationFrame passed the wrong clock (animation finished instantly).
Tests: `forecastpage` 24 (+animation test, multi-open test); all others green; build compiles.

### 2026-10-21 — Sprint 22.9: Forecast + room sheet fixes

1. Manager Forecast: the **14-day outlook is now first**, then the summary, then the table. 2. "Rooms to sell" dropdown (today) **groups by floor** (Ground, Floor 1…; chips with the room type code when the group has several subtypes; one summary line per subtype stays above). 3. **Room status sheet**: occupied rooms show **check-in → check-out dates** (e.g. "Oct 10 → Oct 13"), no time anywhere (STANDARD_CHECKOUT and the footnote removed; CSV column "Stay (check-in → check-out)"); colors: **green** vacant inspected, **yellow** pickup, **red** occupied (dirty or not), **blue** in progress (+ grey dirty, dark grey out of service), legend on top; the same colors on the room chips in the dropdown (`roomTone` in `roomSheet.js`; dark-mode variants added). 4. **Print fixed**: the old rule hid the page with `visibility:hidden`, which still occupied the page's height → the sheet landed on a blank first page. The sheet (and the dev plan sheet) is now a **portal child of `<body>`** and print CSS removes every other body child (`display:none`), so the first printed page is the sheet. The room sheet prints **landscape, two floor columns per page, colors forced on**; verified by printing 84 rooms through headless Chrome → 2 pages (floors 1–2, then 3–4), nothing else from the app on paper. Tests: `roomsheet` 8, `forecastpage` 23 updated (order, floors, colors, portal, dates); all others green; build compiles.

### 2026-10-21 — Sprint 22.8: UI fixes

1. **Dark mode**: `src/darkFixes.css` (imported in `index.js`) re-colors everything Sprints 20–22 hard-coded for light (room chips, tile icon chips, forecast stat icons / pills / formula box, plan + room-status sheet rows, accuracy button, dev "View as" bar); screen-only so printed sheets stay light. Checked in a dark screenshot (manager + dev).
2. Reservations page: **Housekeeping Message Preview deleted**. 3. **All five tiles behave the same**: the first three switch the guest tabs, Left to sell / Dirty rooms switch the SAME Guest Reservations card to a room list (no separate panel above); close (×) or any tile returns. 4. **No green "done" tint** on a 0 tile; the selected tile is held in its own state set on the click, so the highlight is immediate (previously derived from the tab, which was lost when a 0-count tab was hidden); stronger selected style. 5. Count-up and ring now 1.6 s (were 0.7 / 0.8). 6. Dev: **Recent changes is a small card on the right** (`.fc-body-dev > .fc-side`); stacks under 1100 px; managers unchanged.
Tests: `kpi-tiles` 10 (+3), others re-run green; build compiles.

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
