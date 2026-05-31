# Claude Instructions — HotelOps (Part 3: Sprint 15+)

> **Read this AND `part1.md` + `part2.md` (same folder) every iteration
> before you start work.** Part 1 covers Sprints 1–9.4.1 plus the
> original project brief. Part 2 covers Sprints 10–14.3. Part 3 starts
> here with the Sprint 15 roadmap and continues with new sprint entries
> from 15.1 onward.

---

## 1. Why this file exists

`part2.md` crossed ~3,900 lines after Sprint 14.3 and was starting to
get unwieldy to load every iteration. Rather than retroactively
restructure, new sprint logs (15.x and later) land here. Project
overview, tech stack, conventions, and the running glossary of
internal concepts are all in part2 — don't duplicate them.

If you're starting a fresh iteration:

1. Skim `part1.md` for the deep architecture story (only if the task
   touches early-sprint surfaces).
2. Skim `part2.md` for the Sprint 10–14.3 work (most current code
   relevant to anything you'll touch was written in that range).
3. Read this file's most-recent entry for current ongoing work.
4. Read `MEMORY.md` (auto memory pointer index) for any
   user-preference / project-context memory.

---

## 2. Sprint 15.x roadmap — Shift Sheet redesign (GM-approved)

Sprint 14 (foundation) and 14.1–14.3 (publish, parser, overlay, PNG,
multi-segment) shipped the *minimum viable* Excel-style Shift Sheet.
The GM signed off on the workflow but flagged a batch of UX
improvements inspired by 7shifts / Sling / Houston designs (mockups
referenced in chat 2026-05-28).

The mockup is doing many separate things; jamming them into one
sprint would turn a sprint into a quarter. Below is the sub-sprint
split, **with the GM's decisions on the open questions baked in**
(see §2.0 for the answers).

### 2.0 GM decisions (2026-05-28)

These are the resolutions to the open questions I flagged in the
first draft of this plan. Use them as the source of truth when
implementing each sprint.

1. **Status codes** → admin-defined in **Settings**, not hardcoded.
   Also: settings are getting busy, so categorize them while we're
   in there. → New **Sprint 15.0** added before 15.1.
2. **Edit popover** → keep contenteditable as the fast-path, popover
   as the thoughtful-path (click input = type free-form, click cell
   background or caret icon = open popover). Confirmed.
3. **"Open shift"** → "no one is filling the time in" — an empty
   cell on a day-of-week where the historical coverage algorithm
   predicts the dept needs coverage. Ties 15.4's open-shifts list
   to the same algorithm as the coverage score.
4. **Coverage Score baseline** → **derive from history**. Algorithm:
   for each (dept × day-of-week × hour-of-day), average the actual
   clock-in/out hours from the last N weeks of `time_entries`. That
   becomes the "target hours" denominator. No hardcoded numbers.
5. **Auto-Fill behavior** → **preview flow only**. The button
   generates a proposed diff (current sheet → suggested fills);
   admin can edit individual suggested cells, then apply all (or
   discard). Direct-apply not allowed.
6. **Auto-Fill UX** → same as #5 (preview + edit + apply).
7. **Role labels** → **skip**. Use dept name only. Sprint 15.7
   drops role labels; admin already has dept add/remove in
   `AdminSettings` so no new sprint for that either. 15.7 becomes
   "avatars + presence dot" polish only.

### 15.0 — Settings categorization + admin-defined status codes

Prerequisite for 15.2's inline status pills, and a long-overdue
cleanup of the increasingly busy `AdminSettings` page.

**Shipping:**

- **Settings categorization.** Group `AdminSettings.js` into named
  sections: e.g. **Display** (schedule_visibility, hide_abc_keyboard,
  staff_login_layout), **Staff Login** (login_methods, etc.),
  **Shift Sheet** (enable_legacy_assign_panel, future
  sheet-specific toggles), **Departments** (existing dept CRUD —
  already in this file but unsectioned), and a new **Status Codes**
  section.
- **Status codes table** (migration 019_status_codes.sql):
  ```
  status_codes (
    code_id UUID PK,
    label TEXT NOT NULL,           -- "HELP"
    abbreviation TEXT NOT NULL,    -- "HELP"
    color TEXT NOT NULL,           -- hex / named color
    is_system BOOLEAN DEFAULT FALSE -- protect seed codes from delete
  )
  ```
- Seed defaults: HELP (green), BRK (amber), DEEP CLEAN (yellow),
  H.M / "House Meeting" (gray), OFF (gray). `is_system = true` on
  these so admin can't accidentally delete them; can rename / re-
  color but not remove.
- New endpoints: GET / POST / PATCH / DELETE
  `/api/admin/status-codes`.
- Settings UI: list existing codes with inline color swatch + edit
  + delete; "Add code" button opens a small form.

**Why this sprint comes first.** 15.2 reads from these codes for its
inline pill rendering; building the codes table first means 15.2 is
pure client wiring instead of "build the data layer too."

### 15.1 — Per-dept "+ Add staff" + dept header polish

The narrow ask the GM specifically called out. Smallest change with
the highest workflow impact (less mental context-switch when adding
a Front Desk vs. Housekeeping person).

**Shipping:**

- Replace the single bottom "Add staff" dropdown with one
  "+ Add to <Dept>" button under each dept section.
- Dept-scoped typeahead: dropdown filtered to `employees.filter(e =>
  e.department_id === dept.id && !alreadyOnSheet(e.user_id))`.
- "N staff" count next to each dept header (matches mockup vibe).
- Small dept-color dot icon on the section header (mirrors the
  ResourceMode header pattern from Sprint 13).
- Drop the legacy single-bottom row.

**No new endpoints, no schema changes.** Pure client refactor.

### 15.2 — Per-row "..." menu + status pill rendering

The mockup shows a `…` icon at the end of each row (for row-scoped
actions) and color-coded pills inline ("HELP" green, "BRK" amber,
"DEEP CLEAN" yellow, "H.M" gray, conflict-triangle red).

**Shipping:**

- Per-row `…` menu: "Remove from sheet", "Copy row to next week",
  "View staff profile" (links to StaffDetail). Sit in the existing
  Sprint 14.1 trailing actions column (currently houses the
  per-row publish toggle — those two affordances merge into the menu).
- Inline status pills: when the cell's `display_text` matches a known
  status code (HELP, BRK, DEEP CLEAN, H.M, OFF), render it as a
  colored pill instead of raw text. Falls back to raw text for free-
  form entries.
- Status code set comes from the table built in **15.0**. Cell
  text matches against the `abbreviation` column; color comes from
  the `color` column. Both render-time, no schema change to
  `schedule_sheet_cells`.

### 15.3 — Per-cell Edit Shift popover

The biggest individual UX shift — replaces the contenteditable cell
flow with a click-to-open popover. Pill-based common shifts +
free-form fallback + per-shift notes.

**Shipping:**

- Cell click opens a small popover anchored to the cell with:
  - Pill-style time options sourced from `shift_templates` (e.g.
    7a-3p, 3p-11p, 11p-7a) plus OFF / BRK / HELP.
  - "Custom…" toggle that reveals the current free-form text input
    (so the existing power-user workflow doesn't disappear).
  - Notes textarea (120-char limit, matches the mockup).
  - Save / Cancel buttons. Escape cancels.
- Schema: `notes TEXT` column on `schedule_sheet_cells` (migration
  019). Server PUT extended to write notes; SELECTs return it; the
  planned-strip pill on the calendar reads it for the hover title.
- Mobile: same popover, full-bleed bottom sheet instead of anchored.

**Resolved (per §2.0).** Both flows live. Tab+type stays the fast
path; click on the cell *background* (or a small caret icon at the
right edge of the cell) opens the popover. The existing
contenteditable input renders inside the popover too, so editing
free-form text remains one click away regardless of entry surface.

### 15.4 — Right-rail Week Overview (Coverage / Conflicts / Open Shifts / Unpublished)

The right sidebar in the mockup (Image #2 / #3). Aggregates that
make the Shift Sheet a planning *insight* surface, not just a data
entry table.

**Shipping:**

- **History-derived coverage algorithm.** New server module that,
  per (dept_id, day_of_week, hour-of-day), averages the actual
  hours worked from `time_entries` over the last N weeks (N = 8
  starting point; tunable). The aggregated hours-per-day-per-dept
  becomes the *target hours* for that dept on that DOW.
  - Cached for the duration of a request (the week-overview
    endpoint can compute it once and reuse for every dept).
  - Excludes the current week (don't measure against in-progress
    data).
  - Falls back to zero if a dept has no history yet (new dept) —
    shows "no baseline yet" in the UI instead of "0% coverage."
- New endpoint: `GET /api/admin/sheet/week-overview?week_start=`
  returns:
  - `coverage_score` (overall % across all depts)
  - `dept_coverage[]` (per-dept: planned_hours, target_hours, pct,
    has_baseline)
  - `open_shifts[]` — every (dept, day_of_week) where
    target_hours > 0 AND no published cell covers that slot. So
    "no one is filling the time in" — exactly per §2.0 #3.
  - `conflicts[]` — overlapping published shifts for the same
    user on the same day. Overlap-only for v1.
  - `unpublished_changes_count` (cells where
    `updated_at > last_published_at`)
- Right-rail UI shows each section as a collapsible card. "View
  open shifts" / "View conflicts" / "Review changes" open
  detail panels (still on the right rail, no full-screen).
- Hide on viewports < 1200px; below that breakpoint, the rail
  becomes a single bottom strip with just the counts.

**Schema touch needed.** `schedule_sheet_cells` gets a
`last_published_at TIMESTAMPTZ` column (migration 020) so
unpublished-changes detection is reliable (today the publish flag
flips but we can't tell if subsequent edits land after that flip).
Set on every successful publish.

**Algorithm question still open.** N (weeks of history) and the
hour-bucketing granularity (1h vs 30m vs whole-shift) are tuning
parameters. Recommend N=8, granularity = whole-shift envelope
(use parsed_start/end from history to compute hours-per-day), and
make N an admin setting in 15.0's Settings refactor. Confirm
during 15.4 implementation.

**Conflict rules deferred.** Overlap-only for v1. Other rules
(min/max hours, break-missing, back-to-back gaps, etc.) are
opt-in rules in a later sprint (16.x) once the GM tells us which
ones actually matter.

### 15.5 — Toolbar: Shift Templates, Copy Previous Week, Auto-Fill, Validate

The top toolbar row in the mockup (between header and grid).

**Shipping:**

- **Shift Templates**: modal that lists existing templates and lets
  the GM apply one to selected cell(s) or create a new template
  from the current selection. (Templates table already exists from
  Sprint 7-ish.)
- **Copy Previous Week**: button that takes the cells from
  `week_start - 7d` and bulk-inserts them into the current week as
  drafts. Confirmation dialog warns about overwriting existing
  cells. Endpoint: `POST /api/admin/sheet/copy-from-previous`.
- **Auto-Fill** (per §2.0 #5–6): generates a *preview diff* — for
  each empty cell, suggests the staff member's most-common shift
  for that DOW over the last N weeks (N = 4 starting point;
  reuse the 15.0 setting). The diff renders inline on the sheet:
  proposed cells appear with a distinct "suggested" treatment
  (dashed border, lighter background, "Suggested" badge). The
  admin can:
    - Click any suggested cell to **edit** it (opens the 15.3
      popover with the suggestion prefilled).
    - "Apply all" commits every remaining suggestion.
    - "Discard" wipes the suggestion overlay without writing.
  Nothing hits the DB until apply. New endpoints:
  `POST /api/admin/sheet/auto-fill-preview` (returns suggestions),
  `POST /api/admin/sheet/auto-fill-apply` (bulk-inserts the
  approved set).
- **Validate Schedule**: runs the conflict checks from 15.4 and
  surfaces them in a panel.

**This sprint is feature-heavy.** Could legitimately split into 15.5a
(Templates + Copy Previous Week) and 15.5b (Auto-Fill + Validate)
if it gets crowded.

### 15.6 — Mobile redesign: per-dept accordion cards

Mockup Image #4 — restructures the entire mobile sheet layout.

**Shipping:**

- Replace the horizontally-scrolling table-on-mobile with per-dept
  accordion cards (collapsible sections).
- Each card header: dept icon + name + N staff + coverage %.
- Inside each card: staff rows with horizontal scroll for the 7-day
  cells (instead of the whole sheet scrolling).
- Bottom floating tab bar with Shift Templates / Copy Previous Week
  / Auto-Fill / Validate (mirrors the toolbar on desktop).
- "More" menu in the top-right replacing the inline XLSX/PNG buttons
  on mobile (those become menu items).
- Collapsed-state persistence in `localStorage` per dept.

**Depends on 15.5** for the toolbar contents.

### 15.7 — Avatars + presence dot polish

Per §2.0 #7: role labels are skipped (admin already has dept add/
remove in `AdminSettings`; dept name is sufficient signal).
What's left from the original mockup polish bucket:

**Shipping:**

- Initial-circle avatar component with dept-colored background.
  Used in the sheet rows + calendar ResourceMode + StaffManager.
- Extend the live presence dot (already exists in ResourceMode)
  to the Shift Sheet — small green dot next to the staff name
  when the staff is currently clocked in.
- Subtle row hover affordance (background tint) — already partly
  there but tune contrast.

---

## 3. Tuning-knob resolutions (GM 2026-05-28 round 2)

All answered. Final answers below — use as the source of truth.

- **15.0 categorization:** Claude decides. Rule: same-function
  settings go in the same category. Working groupings:
    - **Display & UX** — schedule_visibility, hide_abc_keyboard,
      staff_login_layout
    - **Staff Login** — login_methods (Username / PIN / Birthday
      toggles)
    - **Shift Sheet** — enable_legacy_assign_panel, the new
      `coverage_history_weeks` (default 8, used by 15.4)
    - **Departments** — existing dept CRUD
    - **Status Codes** — new (15.0)
- **15.0 color picker:** preset palette **+ hex fallback**.
  Default palette: brand greens / ambers / yellows / reds / blues
  / grays (≈8 swatches). "Custom hex" reveals an `<input type=text>`
  validating against `^#[0-9a-f]{6}$`.
- **15.4 N=8 default + intelligent:** N is a setting (default 8)
  but the algorithm doesn't just blindly average N weeks. Spec:
    - If history < 2 weeks → still compute a score, but flag the
      output with `dataset_warning: 'low_sample'`. UI shows a
      "predicted score may not reflect actual needs yet — dataset
      too small" notice at the bottom.
    - If history ≥ 2 weeks but the most recent 2 weeks deviate
      from earlier weeks by > some threshold (e.g. > 25% on the
      per-(dept, DOW) average), automatically *omit* the older
      weeks and recompute from just the recent stable window. Flag
      `dataset_warning: 'regime_change'` so the UI can surface
      "schedule pattern changed N weeks ago — baseline reset."
    - When dataset_warning is set, UI shows a small italic note
      under the coverage cards, not a hard blocker.
- **15.4 whole-shift envelope:** confirmed. Hours per
  (dept × DOW) = average of (parsed_end - parsed_start) across
  historical entries falling on that DOW for that dept.
- **15.5 "Apply all":** empties-only by default. A small "Include
  existing cells" checkbox in the preview panel lets the admin opt
  in to overwriting.

---

## 4. Sprint logs (15.0 → present)

### 2026-05-31 — Sprint 16.6: cycling-headline login + landing focus + digital clock + slower confirm

Four UX fixes after the GM reviewed 16.5.

**1. LangCycleHeadline replaces the separate language pill.**

16.5 added a LanguageSwap pill above the login title. The GM
pointed out the pill was a *second* widget to interpret —
better to put the cycle directly on the headline itself. Done:

- New `src/components/shared/LangCycleHeadline.js` (+ .css).
- The login title + subtitle now fade-cycle through
  `SUPPORTED_LANGS` every ~2.6 s using the i18n `translate(key,
  lang)` lookup directly (no provider re-render needed — it's a
  pure function).
- Tap the whole headline to lock the displayed language. Locks
  show a tiny green ✓ in the corner so the choice is
  confirmed. Tap again to resume cycling.
- The previous `LanguageSwap` pill + `login.language` /
  "Tap your language" hint are removed from `StaffLogin`.
  `LanguageSwap` itself is left in the shared folder for now —
  no other surface uses it but the file's harmless to keep.
- `prefers-reduced-motion` skips the crossfade.

**2. FocusedAction is the landing screen — no Home flash.**

16.5 still had the focused-action overlay gated behind
`!loading && !!data` so it didn't render until `/me/hours`
resolved. Staff saw the Home page flash for ~200–500 ms before
the focused screen mounted. Fix:

- Drop the `loading` + `data` gate. `showFocused` is now
  `!focusedDismissed && !clockEvent` — true from the instant
  Home mounts.
- Pass a new `loading` prop into FocusedAction. While the
  parent is still fetching, the button shows "…" and is
  disabled so the wrong mode (in vs out) can't be tapped
  before the correct one is known.
- The button also slows its breathing to 3.2 s during loading
  (subtle "we're working on it" signal without spinning).

**3. Digital wall clock above the action button.**

Per GM. Big serif time + small weekday/date caption sit between
the subline and the giant button. Uses a 1 s `setInterval` —
separate from the idle-logout interval so they don't fight.
Intentionally rendered in `var(--text-secondary)` (lighter
than the headline) so the giant button stays the visual focal
point — the clock is contextual, not the draw.

**4. Longer ✓ hold after tap.**

The previous 280 ms `setTimeout` between tap and `onAction`
fired the parent's clock-in/out + screen-dismiss before the ✓
visually registered — felt like nothing happened. Fix:

- `TAP_CONFIRM_DELAY_MS = 1200` (~4.3× longer).
- `.focused-action-btn-check` font-size bumped 96 → 110 px.
- Animation curve switched to a bouncy
  `cubic-bezier(0.18, 0.85, 0.32, 1.18)` so the ✓ pops in
  with a small overshoot rather than easing flatly.
- `.is-tapped` confirm pulse extended 320 → 420 ms with a
  multi-stop scale so the button "lands" at a slight
  scale(1.06) and holds.

**Verified.** Six touched files balance.

**Notes:**

- No new endpoints, no migrations.
- The Sprint-16.5 `LanguageSwap` file is unused now but left in
  place — removing it would break the .css import side-effect.
  A later cleanup sprint can delete both.
- The clockEvent flow (the post-clock flip-card flow on Home)
  still takes over after the focused screen dismisses; the
  longer ✓ hold just delays that transition by ~900 ms.

**Up next:**

- Sprint 16 arc still considered done for the workflow
  problem. Future work would target the deeper i18n gaps
  (admin pages still English) and the polling cadence
  (currently 5 min visibility-gated — could tighten when
  active).

---

### 2026-05-31 — Sprint 16.5: HCI polish + simpler past-shift logic

Bundle of five revisions across the Sprint-16 surfaces. Two
visual / UX upgrades (LanguageSwap + subtitle), one functional
simplification (the "past scheduled end" algorithm), and two
small admin-page tweaks.

**1. LanguageSwap — iPhone-setup-style cycler.**

New `src/components/shared/LanguageSwap.js` + .css. Replaces the
Sprint-16.2 three-button picker on `StaffLogin` with a single
pill that fades through `SUPPORTED_LANGS` every ~2.4s. Tap to
lock the displayed language; tap again to resume cycling.

- Why: pre-literacy non-English readers spot their own script
  faster when *every* language gets a turn on the focal pill —
  the side-by-side 3-button row hides the inactive labels in a
  pile they have to read past their own.
- The animation IS the affordance — motion signals "you can
  change this" without needing a separate hint.
- One pure interval drives the rotation; tap stops the
  interval + persists the choice via the existing `setLang`
  (writes to localStorage so the next visitor at the same
  kiosk inherits it).
- Respects `prefers-reduced-motion`: skips the crossfade
  entirely (pill jumps between languages without the opacity
  transition).
- The dropped `.login-lang-picker` CSS from 16.2 is still in
  Login.css as dead code for one sprint; can be removed in a
  later cleanup pass if no other surface picks it up.

**2. Login subtitle translated.**

`StaffLogin`'s `subSentence` (the dynamic
"Sign in with your phone number, or employee ID." string built
from enabled login methods) is now replaced by the existing
i18n `login.subtitle` key ("Enter your number or PIN" /
"Ingresa tu número o PIN" / "请输入您的号码或密码"). The
dynamic English sentence is kept as the fallback if the i18n
key resolves to empty. Translating the dynamic method-list
slot would have tripled the dict for marginal value — one
general subtitle covers every login config.

**3. Home page — remaining strings translated.**

Filled in the gaps from Sprint 16.2:

- New dict keys: `home.clock`, `home.recent_below_one/many`,
  `home.no_shifts`, `home.no_shifts_short`, `home.loading`,
  `home.recent_shifts` plus the existing `home.recent` /
  `home.this_week`.
- Applied across the Home page's Clock section title, the
  This-Week hero eyebrow + meta line, the Recent shifts
  heading, and the Loading / empty-state strings.
- Pluralization handled by picking one of two keys
  (`recent_below_one` vs `_many`) — no formal plural rules
  needed for the scope.

**4. Server: scheduled-end logic simplified.**

Sprint 16.3 / 16.4 looked up scheduled_end via a per-user
sheet-first / schedules-fallback query. 16.5 collapses both
the alert and auto-close to a flat
`clock_in + regular_shift_hours` baseline.

- New setting `regular_shift_hours` (int 1–24, default 8).
- The still-clocked-in alert fires when
  `NOW - (clock_in + regular_shift_hours) >= threshold_minutes`.
  Threshold default bumped to 120 (2h) so the alert fires at
  `clock_in + 10h` for an 8h shift.
- The auto-close (when enabled) fires when
  `NOW - (clock_in + regular_shift_hours + grace_hours) >= 0`,
  and backdates the clock-out to `clock_in + regular_shift_hours`
  (NOT NOW) so payroll hours equal the planned shift.
- Trade-off (captured in the helper's docstring): staff doing
  a planned 12h shift will get flagged at hour 10 rather than
  hour 14. Acceptable because (a) most shifts at this property
  are 8h and (b) the alert is passive — admin can ignore it.
- `runAutoClockOut` no longer takes `tzOffsetMinutes` (the
  flat-baseline math doesn't need wall-clock buckets).
- `tz_offset_minutes` query param on still-clocked-in is still
  accepted for symmetry but ignored.
- The `WITH local_now / LATERAL`-style query from 16.3 is
  replaced by a single 8-column SELECT. Per-row JS computes
  `minutes_over`.

**5. AdminHome — remove "Coming up today" card + view.**

Per GM. The card sat next to "On the clock" but rarely got
clicked — "Past scheduled end" covers the more urgent
failure mode (staff who forgot to clock out), and "Coming up"
was passive scenery.

- Removed: `VIEWS.includes('coming-up')`, the `comingUp`
  memo, the stat card entry, the view branch render, plus
  the now-dead `fmtScheduleTime` and `STATUS_LABEL`
  helpers.
- `VIEWS` reordered to `['on-clock', 'overdue', 'hours',
  'pending-ot']` — overdue moved up next to on-clock since
  they're the related "right now" cluster.

**AdminSettings UI:**

- The Sprint-16.3 "Past scheduled end alert" section grew a
  second input: **Regular shift (hours)** alongside the
  existing **Threshold (minutes)**. Help text reframes the
  rule as "clock-in time + regular shift + threshold" with a
  worked example (9am + 8h + 2h = 7pm).
- Defaults bumped (threshold 30 → 120) to match the GM's
  "over 2 hours from an 8-hour shift" framing.

**Verified.** Eight touched files balance. server.js retains
the same -5/+5 paren noise from prior literals.

**Notes:**

- No new migrations.
- No new endpoints.
- The Sprint-16.3/16.4 sheet/schedules lookup logic is
  *gone* — if a future sprint wants per-staff scheduled-end
  precision back, the old query shape lives in git history
  + part3.md.
- The dropped `STATUS_LABEL` + `fmtScheduleTime` were only
  used by the coming-up render; no other dashboard surface
  depended on them.

---

### 2026-05-31 — Sprint 16.4: opt-in auto clock-out at scheduled end + grace

Closes the Sprint-16 clock-workflow arc. 16.3 gave the admin a
*manual* recovery surface ("here's who's still on the clock,
click to close"); 16.4 ships an *opt-in automatic* fallback for
the case where the admin isn't watching (overnight, weekends).

**Schema (migration 023):**

- `time_entries.system_generated BOOLEAN NOT NULL DEFAULT FALSE`.
  Flagged TRUE on rows the auto-close job closes; lets the UI
  badge them so the admin can adjust upward if the staff
  actually worked past their scheduled end.

**Server: two new settings:**

- `auto_clock_out_enabled` ('true' | 'false', default off in
  practice — feature is opt-in)
- `auto_clock_out_grace_hours` (int 1–24, default 4)

Both threaded through the existing ALLOWED settings validator
in PUT `/admin/settings`.

**Server: `runAutoClockOut(tzOffsetMinutes)` helper:**

No-op when `auto_clock_out_enabled !== 'true'`. Otherwise:

1. Same `WITH local_now / open_entries / LATERAL`-style query
   the still-clocked-in endpoint uses to compute each open
   entry's scheduled_end (sheet first, schedules fallback).
2. JS-side iteration picks the best scheduled_end, computes
   `(now - end) >= grace_hours * 60 min`.
3. For each match: `UPDATE time_entries SET clock_out_time =
   scheduled_end, system_generated = TRUE WHERE entry_id = ?
   AND clock_out_time IS NULL` (the `AND clock_out_time IS NULL`
   is a race guard for the unlikely case the staff clocked
   themselves out between our SELECT and UPDATE).

**The scheduled-end-not-NOW design choice.**

Payroll hours need to reflect the *planned* shift, not however
long it took the system to fire. Two reasons:

1. If GM doesn't check the dashboard for 18 hours, NOW would
   inflate the staff's hours by 18 hours of unpaid lunch
   breaks / sleep / off-duty time. Backdating to the scheduled
   end keeps hours sane.
2. If the staff actually worked past their scheduled end, the
   `system_generated` badge in the UI tells the admin to ask
   ("did you work past 5pm? I'll bump the clock-out time").
   Under-reporting is recoverable; over-reporting (NOW) creates
   payroll arguments.

**Server: lazy trigger, not background cron.**

`runAutoClockOut` is called at the start of
`/api/admin/still-clocked-in` (the alert list from 16.3). When
the admin checks the alert, the system also auto-closes anything
past grace. The endpoint response includes
`auto_close: { closed, enabled, grace_hours }` so future UI can
flash a toast.

Why lazy and not a `setInterval` cron:

- Adding a server-side timer would re-warm the Postgres compute
  every N minutes and undo the Sprint-15.10 cost optimization.
- The admin checks the dashboard frequently enough that auto-
  close fires multiple times per day in normal use.
- The backdating semantics mean it doesn't matter *when* the job
  fires — the clock-out timestamp is always the scheduled end.
  So a 24-hour delay between when the grace expires and when
  the admin opens the dashboard just means the row sits in the
  DB with `clock_out_time IS NULL` for a bit longer; the
  eventual close still gets the right times.

Documented trade-off: if no admin checks for >24h, auto-close
fires late but still backdates correctly.

**Server: thread `system_generated` through entry SELECTs:**

- `/admin/entries` — included on each returned row + mapped
  to `system_generated: !!e.system_generated` in the response.
- `/admin/employees/:id/time-entries` — uses `SELECT *`, picks
  up the new column automatically.
- `/me/history` — SELECT'd so staff can also see their own
  auto-closed entries on their timesheet (transparency).
- StaffDetail's entries fetch — SELECT'd.

**Admin Settings UI:**

- New section in Operations: "Auto clock-out (forgot-to-punch
  fallback)". Toggle + grace-hours number input.
- Toggle label tells the admin what's on vs off plainly.
- Help text under the toggle explains the lazy-trigger behavior
  so future-them isn't confused why entries don't close exactly
  at the grace expiry.
- Grace input disabled when the toggle is off.

**Client: system-generated badge in StaffDetail entries:**

- Small amber "AUTO" pill next to each affected entry's date.
- Pill has a `cursor: help` tooltip explaining the row
  ("Auto-closed by the system because the staff didn't clock
  out before the grace window expired. Hours reflect the
  scheduled end. Edit if they worked later.")
- Row gets a subtle amber background tint (`is-system` class)
  so a scrolling admin spots them at a glance.

**Verified.** Six touched files balance.

**Migration deploy.** `023_time_entries_system_generated.sql`
must run before code rollout — the server SELECTs the column
on multiple endpoints.

**Sprint 16 arc — done.**

- 16.1 ✓ Focused clock-in/out screen + idle-logout
- 16.2 ✓ i18n + Spanish + Chinese
- 16.3 ✓ Admin "Past scheduled end" alert + manual clock-out
- 16.4 ✓ Opt-in auto clock-out at scheduled end + grace

The clock-workflow problem the GM flagged has three layers of
defense now:
1. **Prevention** (16.1) — staff land on a screen designed so
   they can't miss the clock-in/out action.
2. **Cross-language clarity** (16.2) — Spanish + Chinese
   versions remove the literacy barrier that compounded the
   missed-tap problem.
3. **Recovery** (16.3 + 16.4) — admin sees who's stuck, can
   manually close them, and (when 16.4 is on) the system
   eventually closes them automatically at the right time.

---

### 2026-05-31 — Sprint 16.3: admin "Past scheduled end" alert + manual clock-out

Third in the Sprint-16 clock-workflow arc. The GM reported staff
forget to clock out at the end of their shift. Sprint 16.3 ships
the admin-side *recovery* surface — a dashboard alert list that
shows anyone currently clocked in past their scheduled end, with
a one-tap "Clock out" button. Doesn't require staff behavior
change; gives the GM a way to fix the problem after it happens.

**Server: `GET /api/admin/still-clocked-in?tz_offset_minutes=`**

Single query with `LATERAL`-style subqueries: pulls every open
`time_entries` row + computes the user's scheduled end from
two priority-ordered sources, all in one DB round-trip:

1. **Sheet first** — match the user's published `schedule_sheet_cells`
   row for the current local week's `week_start` (Monday) and
   today's `day_of_week` (Mon=0..Sun=6). Use `parsed_end`.
2. **Schedules fallback** — today's row in the legacy `schedules`
   table, using `COALESCE(custom_end_time, shifts.end_time)`.

Tz-aware via `tz_offset_minutes` so "current local Monday" + the
"end time on the local clock" both respect the admin's wall
clock, not server UTC. JS-side post-filter picks the best
scheduled_end per row, computes `minutes_over = now_local - end_local`,
and drops anyone under the threshold.

Returns a sorted (by most overdue first) array of
`{ entry_id, user_id, name, department, clock_in_time,
   scheduled_end, scheduled_source, minutes_over }` plus the
active `threshold_minutes`. Empty if no one's overdue.

**Server: new setting `still_clocked_in_threshold_minutes`**

ALLOWED settings validator gains an int [0, 360] entry. Default
30. Tunable per-property in AdminSettings.

**Server: `POST /api/admin/staff/:id/clock-out`**

Admin-authed bulk clock-out. Distinct from the pre-existing
`/api/clock-out` (phone-based, no auth, shared-kiosk legacy
flow). Closes the most-recent open `time_entries` row for the
given user_id; returns the updated entry. 400s if the staff
isn't currently clocked in (race-condition guard: by the time
the admin clicks the row, the staff might have clocked
themselves out).

**Admin Settings UI:**

- New section in the Operations category (sits next to Payroll):
  "Past scheduled end" alert. Number input, 0–360 minutes.
  Help text mentions that the alert uses sheet-first / schedules-
  fallback so the admin knows which scheduled-end source drives
  it.

**Admin Home UI:**

- New stat card: "Past scheduled end" with the count. `warn`
  tone (amber/red treatment in CSS) when > 0; neutral when 0.
- New view branch (`view === 'overdue'`) renders the detail
  list under the stat row.
- Each row: avatar-free dense layout — name + "dept · scheduled
  to end <time> · <N>m past" + a red "Clock out" button on the
  right. Body click opens the staff profile (drills into
  StaffDetail); the Clock out button stops propagation so it
  doesn't double-fire.
- Confirm dialog before the API call:
  `"Clock out <name>? Their shift will close at the current time."`
- Busy state on the button (`overdueBusy === user_id` →
  disabled + "…" label) so spam-taps can't trigger duplicate
  POSTs.
- After a successful clock-out, both the overdue list and the
  main dashboard data refetch so the row falls off + the
  "On the clock" count drops by one.
- Separate fetcher + interval (5 min visibility-gated, same
  pattern as the Sprint 15.10 dashboard polling fix) so the
  alert refreshes independently of the dashboard data.

**Why not auto-clock-out staff who are way overdue:**

Two reasons. (1) Auto clock-out is irreversible for payroll —
the admin should be the one to decide that 6:23 PM is the real
end time vs the scheduled 5:00 PM, since the staff might
genuinely be working late. (2) The recovery surface is
*generic* — even when 16.4 ships auto-clock-out at scheduled-
end+N as an opt-in, this list still serves the
"I want to know who's still here right now" use case.

**Verified.** Four touched files balance. server.js retains
the existing -5/+5 paren noise from prior literals.

**Notes:**

- No migrations. New setting lives in `app_settings`.
- No new endpoints on top of what's documented above.
- The polling pattern matches Sprint 15.10 (visibility-gated,
  5 min interval, focus-driven refresh) so the alert card
  doesn't undo the cost optimization.

**Up next:**

- **16.4 (optional)** — auto clock-out at scheduled end + N
  hours with a `system_generated` flag on `time_entries`. Now
  unblocked since the recovery surface above already handles
  the "do something about it" half of the workflow.

---

### 2026-05-31 — Sprint 16.2: i18n + Spanish + Chinese for staff-facing screens

Second of the Sprint-16 clock-workflow arc. The GM's working
theory for why staff don't clock in/out reliably is partly a
language barrier — many of them speak Spanish or Mandarin, not
English. Sprint 16.2 ships a lightweight in-house i18n layer and
translates the *staff-facing* surfaces. Admin pages stay English
because the GM is monolingual.

**Schema (migration 022):**

- `users.preferred_language TEXT NOT NULL DEFAULT 'en'` with
  `CHECK (preferred_language IN ('en', 'es', 'zh'))`. New
  staff default to English; admin can change per-staff in the
  StaffManager add/edit form.
- The CHECK constraint is added in a `DO $$ … $$` block so
  re-runs against a DB that already has the constraint don't
  error.

**Server:**

- `preferred_language` threaded through every user-shaped
  endpoint:
    - `POST /api/auth/staff/login` — login response includes it.
      Auth select query SELECTs the column.
    - `GET /api/me` — returns it.
    - `GET /api/admin/employees` — returns it.
    - `GET /api/admin/employees/:id` — returns it.
    - `POST /api/admin/employees` — accepts `preferredLanguage`
      in the body; defaults to 'en' when omitted or invalid.
    - `PUT /api/admin/employees/:id` — accepts
      `preferredLanguage` via COALESCE so a partial PUT from an
      older client doesn't wipe the admin's choice.

**Client — `src/i18n/index.js`:**

Tiny in-house i18n module. No external dep.

- **Flat keys** (`focused.clock_in`, `home.this_week`) — one
  lookup per string, no nested object accessors in JSX.
- **English fallback** — missing es/zh key falls back to en;
  missing en falls back to the key itself (loud in dev).
- **{var} interpolation** — `t('focused.countdown', { n: 4 })`
  → "Signing out in 4s". No date/plural rules in v1; staff
  strings are short and we'll keep them that way.
- **LanguageProvider** with `fromUser` prop. Mounted via a
  small `I18nBridge` component in App.js that lives inside
  AuthProvider and reads `user?.preferred_language`. When no
  user is signed in, the provider falls back to a localStorage
  key (`hotelops-staff-lang`) then to `navigator.language`,
  then to 'en'.
- **`useLang()`** returns `{ lang, setLang }` for the picker.
- **`useT()`** returns a memoised `t(key, vars)` curried with
  the current language.

**Dictionary scope (~50 strings × 3 languages):**

- `greeting.*` — morning / afternoon / evening
- `focused.*` — clock_in, clock_out, sub_in, sub_out, skip,
  countdown
- `auto.*` — auto-signout banner (in_n, stay, now)
- `home.*` — ready, this_week, recent, on_clock, not_clocked,
  clock_in/out, just_in/out, elapsed
- `notif.*` — clocked_in, clocked_out, failures
- `login.*` — title, subtitle, enter_pin, continue, invalid,
  tap_to_start, language

Spanish translations are mirror translations using forms common
in US Spanish; Mandarin uses Simplified Chinese (matches the
Snoqualmie Inn workforce per GM).

**Translated surfaces:**

- **FocusedAction** (the giant CLOCK IN / OUT screen from 16.1)
  — every string flows through `useT()`. The greeting prop is
  now a *key* (`greeting.morning`) instead of a rendered string,
  so the same key translates per the staff member's
  preferred_language.
- **AutoSignoutBanner** — "Stay signed in" / "Signing out in 4s"
  / "Sign out now".
- **Home** — greeting, on-clock label, clock-in/out buttons,
  "Just clocked in/out" transient states, the "Clocked in!" /
  "Clocked out!" success confirmations.
- **StaffLogin** — title + a compact language picker at the top
  of the card (EN / Español / 中文), accent on the active
  language. Picker writes the choice to localStorage so the
  next visitor at the same kiosk inherits it as their default
  pre-login language.

**Admin: language assignment:**

- `StaffManager` Add Staff form gets a "Preferred language"
  dropdown (English / Español / 中文). Default 'en'.
- `StaffDetail` edit form gets the same dropdown, prefilled
  from the user's current `preferred_language`.
- Both submit `preferredLanguage` in the POST/PUT body; server
  defaults / COALESCEs missing values.

**Why a tiny in-house module instead of `react-i18next`:**

- Total dict is ~50 strings; a real i18n library would be more
  config than payload.
- No date / number / plural formatting needed for these
  surfaces (timestamps are still locale-formatted via
  `toLocaleTimeString` — that's not in the dict).
- Easier to inspect + audit during the GM's review pass than
  pulling in a translation-pipeline dep.
- The module's surface (`useT`, `useLang`, `translate`) maps
  cleanly to react-i18next if we ever need to migrate.

**What's *not* translated (and why):**

- Admin surfaces (`AdminSettings`, `StaffManager` itself,
  `Calendar`, `ShiftSheet`, etc.) — only the GM uses these and
  the GM reads English. Translating them would 3x the dict for
  zero workforce benefit.
- Date/time strings (`toLocaleDateString`, `toLocaleTimeString`)
  — these already respect the browser locale. The login screen
  greeting + day name will read in the user's browser locale
  even when our dict translations are English.
- The PIN keypad — the digit labels (0-9) and `OK` / `←` are
  universal-ish, no string content to translate.

**Verified.** Twelve touched files balance. server.js retains
the same -5/+5 paren noise from prior literals (no new
imbalance from this sprint).

**Migration deploy.** `022_users_preferred_language.sql` must
run before code rollout — the server SELECTs the column. The
ADD COLUMN + DO-block CHECK are both `IF NOT EXISTS`-style so
re-runs are safe.

**Up next:**

- **16.3** — admin dashboard "Still clocked in past scheduled
  end" alert list.
- **16.4 (optional)** — auto clock-out at scheduled end + N
  hours with `system_generated` flag on `time_entries`.

---

### 2026-05-31 — Sprint 16.1: focused clock-in/out screen + idle-logout setting

Sprint 16 opens a new arc focused on the staff clock-in/out
workflow. GM ran the app in production and reported staff
were entering their PIN and walking away thinking they had
clocked in. Sprint 16.1 is the first of four planned sub-sprints
(16.2 = i18n for Spanish/Chinese, 16.3 = admin "still clocked
in" alerts, 16.4 = optional auto clock-out at scheduled end).

**The problem we're solving.**

The pre-16 Home page surfaces clock-in/out as one of three
parallel sections — alongside this-week hours and recent shifts.
Staff who only know the app loosely interpret "logged in" as
"clocked in" and miss the clock card entirely. The fix is a
post-login full-screen overlay with exactly one action —
designed so there's nothing else to misread.

**Server:**

- New `staff_idle_logout_seconds` key in the ALLOWED settings
  validator (integer 5–120, default 15). Independent from the
  Sprint-8.6 `auto_signout_seconds` — that one fires *after*
  a clock action; this one fires *before*, if the staff stays
  idle on the focused screen.
- `/me/hours` response gains `idleLogoutSeconds` alongside the
  existing `autoSignoutSeconds`. Single SQL trip — combined the
  two SELECTs into one `WHERE key IN (...)` query so we don't
  add a round-trip.

**Admin Settings:**

- New section in the **Staff Login** category: "Idle sign-out
  (focused action screen)" with a 5–120 number input. Help
  text explicitly distinguishes it from auto sign-out so the
  GM doesn't confuse the two.

**Client — `FocusedAction` component
(`src/components/TimeClock/FocusedAction.js` + .css):**

Full-screen overlay with five visual elements:

1. **Greeting** — "Good morning, Maria." Big serif headline.
2. **Subline** — "Tap once when you start your shift." Single
   sentence so the intent is unmistakable across literacy
   levels.
3. **Giant 240px circular button** — green gradient + "Clock In"
   or red gradient + "Clock Out". Subtle 2.4s breathing
   animation (`scale 1 → 1.03 → 1`) so it draws the eye
   without nagging.
4. **"Just checking, skip"** — tiny ghost button below for the
   rare case the staff member actually wants to look at their
   hours instead of clocking.
5. **Countdown badge** — top-right, only appears in the last
   5 seconds of the idle timer ("Signing out in 4s") with a
   pulse animation. Hidden the rest of the time so the screen
   doesn't feel like a stopwatch.

**Interaction model:**

- **Mount** → fade-in + scale-up from 0.985 → 1.0 over 320 ms.
- **Tap big button** → `is-tapped` class freezes the breathing,
  swaps the label for a giant ✓, plays a 320ms confirm pulse;
  parent's clock handler runs after a 280ms delay so the visual
  reads before any state change.
- **Tap skip** → `is-exiting` class fades + scales out over
  220 ms; parent dismisses focused state.
- **Idle ≥ N seconds** → parent's `handleAutoSignout` runs
  (existing logout + redirect flow). Any pointer / touch / key
  / mousemove event resets the countdown by bumping the
  baseline timestamp (no interval recreate — one pure interval
  reads from a ref every 250 ms).
- **`prefers-reduced-motion`** → strips both the breathing and
  countdown pulse animations.

**Integration in `pages/Home/index.js`:**

- New `focusedDismissed` state, hydrated from a sessionStorage
  key `hotelops-staff-focused-dismissed` keyed by `user.user_id`.
  Effect re-reads on `user.user_id` change so re-login (same
  tab, different staff) shows the focused screen fresh.
- `handleAutoSignout` clears the key before navigating to login
  so the next staff at the same kiosk gets a fresh focused
  screen.
- Render gate: `!loading && !!data && !focusedDismissed
  && !clockEvent`. The `!clockEvent` term hands off to the
  existing flip-card / auto-signout-banner flow once a clock
  action is in flight (no UI competition between two overlays).
- Mode is derived from `onClock` — clocked in → 'out', else
  'in'. So mid-shift logins land on a "Clock Out" focused
  screen, which incidentally also helps with the
  forgetting-to-clock-out problem (Sprint 16.3) for staff who
  remember to log in but not specifically to clock out.

**Why this design vs alternatives we considered:**

- **Auto-clock-in on login**: rejected — too aggressive, breaks
  the "I just want to check my schedule" workflow.
- **Big banner on Home**: rejected — banners get ignored on
  third encounter. A full-screen modal forces a decision once
  and then gets out of the way for the rest of the session.
- **Per-route gating**: rejected — adding the overlay to every
  route is overkill. Home is where they land post-login; that's
  the only critical surface.

**Verified.** Five touched files balance. server.js retains
the existing -5/+5 paren noise from prior regex/SQL literals.

**Notes:**

- No migrations. Settings table already exists.
- No new endpoints (extended `/me/hours` only).
- The dismiss flag is per-user-id, not per-session, so an
  admin who switches users mid-session (StaffShell only has
  one user but defensive design) gets a fresh focused screen.

**Up next:**

- **16.2** — i18n strings + `preferred_language` column on
  users + Spanish + Chinese translations of staff-facing
  strings (login screen, focused action screen, auto-signout
  banner, confirmation messages).
- **16.3** — admin dashboard "Still clocked in past scheduled
  end" alert list.
- **16.4 (optional)** — auto clock-out at scheduled end + N
  hours, with a `system_generated` flag on `time_entries`.

---

### 2026-05-30 — Sprint 15.10: Postgres compute-hour optimization

Not a feature sprint — a cost-reduction pass before flipping the
DB from a soon-to-expire free tier to a pay-per-compute-hour
instance (Koyeb/Neon). 12.7 compute-hours into the trial period
and the autosuspend was never triggering.

**Background: how Neon bills.**

Koyeb's Postgres is Neon underneath. Neon charges compute-seconds
while the instance is *awake*, not per query. After ~5 minutes of
zero activity the compute suspends and billing pauses; the next
query incurs a ~100–500 ms cold-start to wake it back up. So a
single recurring query (a heartbeat, a poll, an open idle
connection) is enough to keep the instance awake 24/7 and bill
for the entire calendar period.

**Audit findings:**

- `pg.Pool` defaults already release idle connections after 10 s
  (the `idleTimeoutMillis` default), so the pool wasn't holding
  the DB warm.
- The real culprits were two client-side `setInterval` polls
  that hit DB-touching endpoints every minute, forever, while
  the page was open:
    - `src/pages/AdminHome/index.js:96` — `setInterval(refresh, 60000)`
      → `/admin/dashboard`
    - `src/components/Layout/Sidebar.js:49` — `setInterval(tick, 60_000)`
      → `/handoff-notes/unread-count`
  Two queries/minute × 60 = 120/hour × 8h shift = ~960 queries
  per day, all on what's essentially a notification badge + a
  passive dashboard.
- Every other `setInterval` in the codebase is a pure client-side
  tick (wall clock, elapsed time, auto-signout countdown) — none
  hit the DB. Verified across `TimeClock/`, `Home/`,
  `AutoSignoutBanner.js`.

**Fixes:**

1. **`AdminHome` refresh effect** rewritten:
    - Interval stretched from `60_000` → `300_000` (5 min). The
      dashboard surfaces clock-in state + day counts; staff don't
      clock in/out fast enough for 60 s precision to matter.
    - **Visibility gating**: the interval callback now only fires
      when `document.visibilityState === 'visible'`. Background
      tabs no longer ping the DB.
    - **Focus-driven refresh**: added a `window.focus` listener
      so coming back to the tab does a fresh fetch regardless of
      where in the interval cycle the GM returns. Maintains the
      "always-fresh-when-looking-at-it" feel without the steady
      timer cost.
2. **`Sidebar` unread-count effect** rewritten:
    - Dropped the `setInterval` entirely. The unread count is a
      badge — fast updates only matter when the GM is looking at
      the sidebar.
    - Replaced with mount + `window.focus` listener. Comes back
      to the tab → counter refreshes once. Idle tab → zero DB
      load.
3. **`pg.Pool` config** made explicit in `server.js`:
    - `max: 5` (was the pg default `10`). One-property load
      profile easily fits in 5 concurrent connections; cap means
      fewer potential hangers-on.
    - `idleTimeoutMillis: 10_000` (already the pg default but
      explicit so the intent is documented inline alongside the
      Neon billing context).

**Expected impact.**

Before: GM opens admin → continuous 1 query/min from each of the
two intervals → Neon stays awake the entire session. 8h day =
8h billed compute.

After: GM opens admin → 2 queries on mount → 5-min idle timer
fires → autosuspend. Activity wakes it briefly (~100ms cold
start). With a typical GM workflow (load a view, glance, walk
away, come back 10 min later), compute should be billing maybe
10–20 min per active hour rather than the full 60.

Rough estimate: **~70-80% reduction in compute-hours** under
typical use. Real numbers depend on how often the GM actually
interacts; verifiable from the Koyeb usage dashboard after a few
days.

**Notes:**

- No new endpoints, no schema changes, no client-visible
  behavior changes (except: dashboard auto-refreshes a bit less
  aggressively, but the focus listener covers the "I just came
  back" case).
- The optimization is *additive* — if the GM does want stricter
  freshness, they can manually refresh the page or click a
  "Refresh" affordance (which we could add later as a one-shot
  button, but it's not necessary right now).
- The 12.7-hour figure that prompted this sprint should plateau
  significantly. If it doesn't, the next thing to check is
  whether anything else (a Koyeb health probe, an external
  uptime monitor) is hitting a route that touches the DB.

---

### 2026-05-28 — Sprint 15.9: second bug-fix pass — menu icons, Auto-Fill modal, week-nav reset, +N more expandable

Four follow-ups to 15.8.

**1. Menu-item icon standardization.**

The row "..." menu and topbar "More" menu showed mismatched icon
sizes — the publish indicator used a styled `.sheet-row-menu-dot`
span (16px wide, centered) while the other items had bare inline
text glyphs (`↓`, `⎘`, `→`, `✕`) at the default font size, so
they looked tiny and unaligned.

Fix:
  - Wrapped every bare leading glyph in
    `<span className="sheet-row-menu-icon">`.
  - Merged `.sheet-row-menu-dot` + `.sheet-row-menu-icon` into one
    rule (18px width, 13px font-size, `font-variant-emoji: text`,
    centered). Every menu item now reserves the same icon slot
    regardless of which glyph it carries.
  - `.sheet-row-menu-danger .sheet-row-menu-icon` overrides the
    color so the `✕ Remove` icon picks up the danger tint without
    needing a class on the icon element itself.

**2. Week-nav layout regression.**

The GM reported that hitting prev/next-week broke the per-dept
accordion layout — cards "wrong size", page scrolling weirdly.
Diagnosed as session state leaking across week boundaries: an
admin who added a staff member on week A without typing any
shifts kept that row visible when navigating to week B, where
the underlying cells had nothing for them, producing inconsistent
grouping + addable-pool math.

Fix: a new `useEffect` keyed on `weekStart` resets every
session-scoped piece of state on week change:
  - `addedUserIds` (manually-added-but-empty rows)
  - `openRowMenu`, `editPop`, `addOpenDept`, `moreOpen` (open
    popovers / dropdowns)
  - `autoFillSugg` (pending Auto-Fill suggestions from the
    previous week's run)

The grid now starts each week from a clean state. ESLint
override on the deps array because we intentionally exclude
the setters (they're stable refs from React).

**3. Auto-Fill modal with source picker + empty-state feedback.**

15.5's Auto-Fill button silently did nothing when the algorithm
returned zero suggestions (no clock history yet, or every cell
already had content). Plus the GM specifically asked for an
*option* — pick how the algo runs.

Rebuilt as a modal-driven flow:

- **`AutoFillModal`** opens when the tool button is clicked
  (replacing the direct invocation). Two radio-card options:
    - **Smart predict** — the 15.8 mode-finder over clock
      history. Reuses the existing
      `/admin/sheet/auto-fill-preview` endpoint.
    - **Mirror previous week** — client-side fetch of
      `/admin/sheet/week?week_start=<prevWeek>`, build
      suggestions from cells where `is_published = TRUE`. No
      new server endpoint needed.
- **Empty-state feedback** in `runAutoFillPreview`: if the
  filtered suggestions map ends up empty, set `toolError` with
  a context-aware message —
    - mirror mode → "No published cells on last week to mirror."
    - smart mode → "No predictable patterns yet — need more
      clock history."
  This surfaces inline on the toolbar (`.sheet-tool-err`) so the
  admin knows the button worked, just had nothing useful to
  return.
- **`mode` arg** added to `runAutoFillPreview`. Defaults to
  `'smart'` so any future direct callers stay compatible.

**4. Calendar week deptgrid: "+N more" is now expandable.**

15.5/15.8 confirmed the cap was in place but only let admins
drill to Day view to see overflow. The GM wanted to expand the
cell in-place instead of switching surfaces.

Changes:
- New `expandedCells` state on `CalendarWeekView`
  (`Set<"<dept_id>|<iso>">`).
- Each deptgrid cell now branches on `dayShifts.length > 3`:
    - **≤ 3 shifts**: renders as a `<button>` exactly like
      before. Click drills to Day view.
    - **> 3 shifts**: renders as a `<div role="button"
      tabIndex={0}>` (because we can't nest a `<button>` inside
      a `<button>`, and we need the "+ N more" toggle to be its
      own button). Body click still drills; the inner
      `+N more` button calls `stopPropagation()` + toggles the
      cell key in `expandedCells`.
- Toggle label flips between `"+N more"` and `"Show less"`.
- `.cal-week-deptgrid-cell-data.is-expanded` gets a subtle
  inset outline so it's clear which cell is opened.
- `.cal-week-deptgrid-mini-more` upgraded from a passive `<li>`
  styled rule to a real button (background hover, accent color,
  text-align left, width 100%).

**Verified.** Four touched files balance.

**Notes.**

- The `runAutoFillPreview` callback is now only invoked from
  inside `AutoFillModal` via the `onPreview` prop — the previous
  direct dock/toolbar callers were replaced with
  `setShowAutoFill(true)`. The IDE briefly flagged
  `runAutoFillPreview` as unused while the modal mount was
  being assembled; that resolved once the prop was wired.
- No new endpoints, no migrations.

---

### 2026-05-28 — Sprint 15.8: bug-fix pass — icons, smarter Auto-Fill, mobile alignment, Week→Day filter

Five fixes the GM flagged after a hands-on session.

**1. Icon standardization.**

Mixed emoji-vs-text-glyph rendering was making the toolbar / dock
/ row-menu icons look mismatched (some tiny black text, some
big color emoji depending on the browser's font fallback).
Fixes:
  - Added `font-variant-emoji: text` to every icon-bearing button
    + dock icon + chevron in `ShiftSheet.css`. This is a CSS hint
    that tells the browser "prefer the text glyph for ambiguous
    Unicode code points." Modern browsers honor it; older ones
    ignore it harmlessly.
  - Swapped the Auto-Fill `✨` (color-emoji sparkles on most
    platforms) for `★` (universally text-glyph). The toolbar and
    bottom dock now match.
  - Bottom-bar nav icons (the AdminShell nav: Home / Staff /
    Calendar / Logbook / Assistant / Settings) intentionally
    untouched — they use the existing icon system from
    `RoleIcon` and are correctly sized.

**2. Smarter Auto-Fill (Sprint 15.5 algorithm upgrade).**

Replaced `DISTINCT ON` most-recent with **mode-finding**:

- Pull every completed entry for each `(user × DOW)` in the
  lookback window.
- Round each entry's start + end to the nearest 15 minutes.
- Tally the rounded `(start, end)` pairs.
- Pick the pair with the highest count. Ties broken by the
  most-recent clock-in.
- New `confidence: 'high' | 'low'` field on each suggestion —
  `high` when the pattern appears ≥3 times or the user has only
  one distinct pattern, otherwise `low`. Lets future UI tune the
  ghost-bar opacity if we want to surface confidence visually.

This catches "she usually works 9–5 even though last week was a
one-off 11–7" — the most-common pattern dominates over the
most-recent anomaly. 15-minute rounding handles small clock-in
drift ("9:03 vs 8:58") so the tallies aggregate correctly.

**3. Week-view per-day cap of 3 with "+X more".**

Audited the Calendar Week view. The cap already exists in the
admin dept-grid section (`cal-week-deptgrid-mini-list` slices at
3 entries and renders `+{n - 3} more`), and the staff matrix
view shows one cell per (staff × day) so there's no overflow
problem. No code change needed — verified in place. If the GM
sees uncapped overflow on a specific surface, they'll point it
out and we'll target that one.

**4. Mobile sheet layout fix.**

The image #5 issue: the avatar + name on the left was eating
~112px per row, squeezing the 7 cells down to ~4 visible columns
that didn't line up with the day-header strip above them. Row
restructured:

- **Per-staff row** is now `flex-direction: column` instead of
  `row`. Avatar + name + per-row `…` menu sit on a top
  `.sheet-acc-row-head` line. The 7 cells live on a second line
  below.
- **Cells use CSS Grid `repeat(7, 1fr)`** — each cell takes
  exactly 1/7 of the row width. No more horizontal scroll on
  phones at typical widths; cells shrink to fit instead.
- **Day-header strip** above uses the same `repeat(7, 1fr)`
  grid, so day numbers and cells share column positions
  perfectly. No more off-by-N misalignment.
- **Cell input font/padding** shrunk on mobile (`font-size: 11px`,
  `padding: 6px 2px`) so values like "11p-7a" still fit in the
  ~50px column on a 360px-wide phone.
- **`SheetOverviewRail` moved to the TOP** of the mobile layout
  (was below the accordion). Coverage / Open / Conflicts /
  Unpublished now read as the first thing on screen, matching
  the GM's request and the standard dashboard pattern.
- **Removed dead `.sheet-acc-days-wrap`** rule + restructured the
  surrounding CSS for clarity.

**5. Week → Day passes dept filter.**

When the admin clicks a (dept × day) cell in the Week view's
dept-grid, the Day view should open already filtered to that
dept. Wire-up:

- `CalendarWeekView`'s deptgrid cell `onClick` now calls
  `onPickDate(d, dept.department_id)` (was `onPickDate(d)` —
  one-arg).
- `Calendar/index.js` adds `pendingDeptFilter` state. The
  Week-view's onPickDate captures the `deptId` and sets it
  before calling `zoomTo('day', date)`.
- `DayView` gains two props: `initialDeptFilter` (initial
  value for its local `deptFilter` state) and
  `onConsumeInitialDeptFilter` (callback that clears the parent
  state so we don't re-apply on subsequent renders).
- DayView's `useState` initializer uses `initialDeptFilter ?? 'all'`
  for first-paint correctness; a `useEffect` watches for prop
  changes (when the admin drills again to a *different* dept
  cell) and re-seeds + fires the consume callback.
- The day-pill / heading clicks don't pass a dept_id, so
  drilling from those falls back to "all departments" as
  before.

**Verified.** Six touched files balance. server.js retains the
same -5/+5 paren noise from existing regex + SQL literals (no
new imbalance from this sprint).

**Notes:**

- No new migrations. All changes are server logic, client logic,
  and CSS.
- No new endpoints. The Auto-Fill algorithm change is in-place
  inside `/admin/sheet/auto-fill-preview`; payload shape gained
  a `confidence` field but old clients ignore it gracefully.

---

### 2026-05-28 — Sprint 15.7: shared StaffAvatar + presence dot + row-hover polish (15.x closer)

Final sprint of the Shift Sheet redesign arc. Polish-tier work
that consolidates inline avatar implementations into one
component and adds the "currently clocked in" signal across both
sheet layouts.

**Shipped:**

- **`src/components/shared/StaffAvatar.js` (+ .css).** New shared
  component. Props: `name`, `color`, `onShift`, `size`
  ("sm"/"md"/"lg"), `title`. Returns a circle with two-letter
  initials (first + second word) in the supplied background
  color, contrast-correct text via the same luminance heuristic
  the cell pills + edit popover use. Falls back to a neutral
  gray when no color is supplied; "?" initial when the name is
  empty.
- **Presence dot.** When `onShift` is true, renders a small
  green circle in the avatar's bottom-right corner with a
  `var(--bg-surface)` ring so it reads against any background.
  Three size variants scale the dot proportionally (7px / 9px /
  11px). Screen-reader label switches to "<name> (on shift)" so
  the dot has an accessible equivalent.
- **`onShiftByUser` lookup in ShiftSheet.** Built once from the
  existing `/admin/employees` payload (which has been returning
  `is_on_clock` since Sprint 11.4). Keyed by user_id; threaded
  to every avatar instance on both layouts.
- **`deptColorById` lookup in ShiftSheet.** Built from
  `departments`. Lets the desktop layout pass each row's dept
  color into `<StaffAvatar>` without re-doing the lookup
  inline.
- **Desktop sheet rows** now render
  `<StaffAvatar size="md" />` ahead of the name text. The
  `.sheet-cell-name` cell becomes a flex container; name text
  ellipsises when the avatar + name exceed the column width.
- **Mobile accordion rows** swap their hand-rolled
  `.sheet-acc-avatar` span for the shared component. Removed
  the dead CSS rule + left a one-line comment pointer so future
  refactors don't recreate it.
- **Row hover affordance.** Replaced the previous full-swap
  `--bg-raised` hover with a tinted 4.5%-opacity accent overlay
  layered on top of the original background. The full swap was
  too strong against the dept-banded rows above and washed out
  the cell borders; the tint reads as "scanned" without losing
  any structural contrast. Applied identically to
  `.sheet-row:hover` (desktop) and `.sheet-acc-row:hover`
  (mobile) for visual consistency.

**Why a separate shared component and not just inline:**

- StaffManager already has its own `.staff-mgr-avatar` rule with
  a single-letter initial and no presence dot or dept color.
  When the GM asks "why does the avatar look different on this
  page?" we'll want to migrate it to `StaffAvatar` in a small
  follow-up. The component lives in `src/components/shared/`
  precisely so future surfaces can adopt it without duplicating
  the initial / luminance / dot logic.
- ResourceMode's `.day-resource-initial` (single letter) +
  `.day-resource-name-live-dot` is a candidate too, but it's
  inside the calendar's lane layout where avatar size is
  already constrained. Migrating is plumbing, not policy —
  skipped for 15.7 scope.

**Intentionally not done (followed §2.0 #7 + §2.7 resolution):**

- Role labels. The GM resolved this as "skip — dept name is
  sufficient signal." The 15.7 plan had already removed role
  labels from scope; this entry confirms.

**Verified.** Four touched files (StaffAvatar.js / .css +
ShiftSheet/index.js + ShiftSheet.css) balance. Avatar renders
on both layouts; presence dot shows for on-clock staff;
row-hover tint applies without breaking dept-row contrast.

**Sprint 15 arc — done.**

Sprint 15 set out to land the Shift Sheet redesign the GM
requested after Sprint 14.x. Across 15.0 → 15.7 we shipped:

- **15.0** Settings categorization + admin-defined status codes
  + coverage_history_weeks setting
- **15.1** Per-dept "+ Add staff" + dept header polish
- **15.2** Inline status code pills + per-row "..." menu
- **15.3** Per-cell Edit Shift popover + notes + contenteditable
  fast-path retained
- **15.4** History-derived coverage algorithm + right-rail
  Week Overview
- **15.5** Toolbar: Templates / Copy Previous Week / Auto-Fill
  / Validate
- **15.6** Mobile redesign: per-dept accordion cards + bottom
  dock + "More" menu
- **15.7** Shared StaffAvatar + presence dot + hover polish

Schema landed: migrations 019 (status_codes), 020
(schedule_sheet_cells.notes), 021
(schedule_sheet_cells.last_published_at).

**Open follow-ups for 16.x and beyond:**

- Conflict-rule expansion (cross-cell overlap, min/max hours,
  break-missing).
- Mode-based Auto-Fill suggester if "most-recent" misses too
  often in real usage.
- Bulk-apply Templates (needs cell selection UI).
- StaffManager + ResourceMode migration to `<StaffAvatar>` for
  visual consistency across admin surfaces.
- Lockstep horizontal scroll on the mobile accordion (day
  header + row cells in the same scroll context).
- Cross-dept staff (a user can sit in multiple sheet rows for
  the same week) — this is the schema change needed before the
  conflict ruleset can expand meaningfully.

---

### 2026-05-28 — Sprint 15.6: mobile redesign — per-dept accordion cards + bottom dock + "More" menu

Restructures the sheet for phones. Desktop layout (the table)
stays exactly as-is at ≥720px. Below that, a new accordion-card
layout takes over and the chrome reshuffles to match a native-app
pattern (top bar, scrollable content, bottom dock).

**Shipping:**

- **`useIsMobile` hook.** Subscribes to `(max-width: 720px)` via
  `matchMedia.addEventListener('change')` so re-renders fire when
  the viewport crosses the breakpoint mid-session (e.g. rotating
  the device).
- **Per-dept accordion cards.** Replaces the desktop table when
  `isMobile === true`. Each dept group becomes a
  `<section className="sheet-acc-card">`:
    - **Header**: dept-color dot + dept name + "N staff" pill +
      coverage % (pulled from the 15.4 overview's
      `dept_coverage`) + chevron. Click toggles open/closed.
    - **Body**: day-header strip (Mon 25 / Tue 26 / …) followed
      by one row per staff member. Each row has the staff info
      pinned to the left (avatar circle with initials + name) and
      the 7 cells in a horizontal-scroll strip (with snap and
      iOS momentum scrolling).
    - **Row menu**: the same `.sheet-row-menu` "..." button used
      on desktop; popover render is unchanged (page-root,
      position:fixed).
    - **Per-dept "+ Add"**: same affordance the desktop has,
      adapted to render as a full-width pill under the rows.
- **Avatar initials.** `(name).split(' ').slice(0,2).map(s =>
  s.charAt(0).toUpperCase()).join('')` — up to two-letter
  monogram, dept-color background. Matches the mockup vibe
  without requiring a real avatar field.
- **`localStorage` accordion persistence.** Per-dept open state
  saved under `hotelops-sheet-acc`. Default is open; collapsing
  a dept saves `{ [deptKey]: false }` so collapses survive
  reloads. Keyed by dept_id only (not by week) — collapsing
  Front Desk one week implies collapsing it everywhere.
- **Mobile "More" menu in topbar.** Below 720px the inline
  Publish week / Export XLSX / Export PNG buttons collapse into
  a single `⋮ More` button next to the week label. Click opens
  a dropdown with the same three actions as menu items. Uses
  the same item style as the per-row menu for visual consistency.
  Page-overlay backdrop catches outside clicks.
- **Mobile bottom dock.** `.sheet-mobile-dock` is a fixed
  bottom `<nav>` with the 4 tools (Templates / Copy week /
  Auto-Fill / Validate). Each button is an icon-over-label
  pair. Replaces the desktop `.sheet-toolbar` row (which is
  hidden on mobile via `{!isMobile && ...}`).
- **Safe-area + auto-fill stacking.** Dock padding-bottom uses
  `env(safe-area-inset-bottom)` so it lifts above the iPhone
  home indicator. When the auto-fill bar is also visible, a
  `@media (max-width: 720px)` rule offsets it to
  `bottom: 82px` so it doesn't sit underneath the dock.
- **Page padding.** `.sheet-page` gets `padding-bottom: 84px`
  below 720px so the last accordion card isn't hidden under the
  dock.

**Behavior nuances:**

- The right-rail `SheetOverviewRail` still renders on mobile,
  but its existing `<1200px` CSS already collapses it into a
  4-chip horizontal strip. So phone users get *both* the
  per-dept coverage % on each card header *and* the overall
  strip below the accordion. Not redundant — the strip's
  Open / Conflicts / Unpublished counts aren't surfaced on the
  cards.
- Removing a row, adding a row, applying auto-fill, etc. all
  work the same on mobile because the data layer is unchanged —
  the mobile layout just renders the same handlers in a
  different visual frame.
- The desktop table render path is *unmodified* — the conditional
  is `isMobile ? <accordion> : <existing desktop block>`. So
  bugs introduced here can't break desktop, and vice versa.

**Limitations / acceptable trade-offs:**

- Each row's cells have their own horizontal scroll container.
  That means the day-header strip (which has its own padding
  alignment) and the cells *don't* scroll in lockstep — if a
  row is scrolled to Wed while the header sits at Mon, the
  alignment is off. We accept this for v1 because lockstep would
  require either sharing a scroll container across rows
  (breaks the per-row card layout) or syncing scroll positions
  via JS (cost > benefit for a small UX win). The day numbers
  still serve as a coarse anchor.
- Suggestion ghost rendering and status code pill rendering
  inherit automatically because the cells share the same
  `ShiftCellInput` component on both desktop and mobile.

**Verified.** ShiftSheet/index.js + ShiftSheet.css balance.
Mobile rendering branch isolated cleanly; desktop unchanged;
overview rail still mounts; all four tool buttons reachable via
the dock; topbar "More" menu opens + dismisses; accordion state
persists across reloads.

**Follow-ups carried into 15.7:**

- Avatars + presence-dot polish that 15.6 brushed against
  (initials-only on mobile) is the 15.7 focal point — gets
  applied across mobile + desktop + ResourceMode for
  consistency.
- Possible later: lock the day-header strip + row cells into a
  shared scroll context (probably needs a JS sync since flexbox
  doesn't have a built-in "share scrollable").

---

### 2026-05-28 — Sprint 15.5: toolbar — Templates / Copy Previous Week / Auto-Fill / Validate

Feature-heavy sprint. Four tools that the mockup wanted in a row
above the grid, plus the supporting API surface for the new ones.

**Server: shift-template CRUD.**

The pre-existing `/api/admin/shift-templates` only had GET; the
templates table (`shifts`) had no write endpoints. Added:

- `POST   /api/admin/shift-templates` — create. Validates HH:MM /
  HH:MM:SS time strings via `isValidTimeStr`.
- `PATCH  /api/admin/shift-templates/:id` — partial update via
  COALESCE-style SQL.
- `DELETE /api/admin/shift-templates/:id` — guarded against
  `schedules` FK references (409 with a friendly message if any
  scheduled shifts still point at the template), mirrors the
  Sprint-11 dept-delete guard.

**Server: `POST /api/admin/sheet/copy-from-previous`.**

Body: `{ week_start, overwrite? }`. One SQL statement copies every
cell from `(week_start - 7 days)` into the target week via
`INSERT … ON CONFLICT … DO UPDATE`. The `CASE WHEN $overwrite`
guard makes empties-only the default (preserves any edits already
on the target week unless the admin explicitly opted into
overwrite). Always inserts as `is_published = FALSE` — the copy
lands as drafts even if the source week was published.

**Server: Auto-Fill (preview + apply pair).**

- `POST /api/admin/sheet/auto-fill-preview?tz_offset_minutes=`
  body: `{ week_start }`. For each `(user × DOW)` in the lookback
  window (reuses the `coverage_history_weeks` setting from 15.0,
  default 8), pulls the *most recent* completed clock entry via
  `DISTINCT ON … ORDER BY … DESC`. Format the suggestion text as
  `"<startShort>-<endShort>"` using the same `Hp` / `H:MMp`
  shorthand the GM uses on the sheet. Returns
  `{ suggestions: [{ user_id, day_of_week, display_text }] }`.
  No DB writes — pure read.
- `POST /api/admin/sheet/auto-fill-apply` body:
  `{ week_start, suggestions, overwrite? }`. Bulk-INSERTs the
  approved set. When `overwrite = false`, uses
  `ON CONFLICT DO NOTHING` so existing cells survive untouched.
  When `true`, swaps to `DO UPDATE SET …`. Every insert runs
  through `parseShiftTimes` so the multi-segment parser +
  parsed_start/parsed_end stay correct.

**Why DISTINCT ON for the suggestion source.**

The plan called for "most-common shift over last N weeks." Most-
common requires bucketing into discrete intervals first (else
"9:08–4:52" never matches "9:09–5:01"). Rather than rounding
heuristics that could mask the GM's actual scheduling pattern,
v1 ships *most-recent*: the user's most recent completed shift
for that DOW. It's interpretable, deterministic, and matches
what a manager would mentally reach for ("last Tuesday Sarah
worked 9–5, so do that again"). Can swap to a true mode-finder
later if real usage shows non-recent patterns dominate.

**Client: tool row.**

New `.sheet-toolbar` flex row sits between the topbar (week nav +
exports) and the grid layout. Four buttons:

- **☰ Shift Templates** — opens the new `ShiftTemplatesModal`.
- **⎘ Copy Previous Week** — opens the `CopyPrevWeekDialog`
  (confirm + overwrite checkbox).
- **✨ Auto-Fill** — runs the preview endpoint. While
  fetching, button shows "…"; on success, the sheet's empty
  cells get a ghost overlay of the returned suggestions.
- **✓ Validate Schedule** — opens the `ValidateScheduleModal`,
  re-using the `conflicts` array from the 15.4 week-overview
  payload.

Tool errors surface inline on the right of the toolbar row
(`.sheet-tool-err` italic red text).

**Client: Auto-Fill preview overlay.**

- Suggestions stored as a `Map<"<user_id>|<dow>", string>` in
  state — empty until the admin runs Auto-Fill.
- The cell renderer (`ShiftCellInput`) passes the suggestion via
  a `suggestion` prop when no real cell exists at that slot.
- Empty cells with a pending suggestion get a CSS pseudo-element
  overlay rendering the suggested text in faint italic accent
  color, with a very light tinted background to read as
  "preview, not committed." `pointer-events: none` so clicks
  still fall through to the input — typing immediately replaces
  the ghost.
- Sticky `.sheet-autofill-bar` appears at the bottom of the
  viewport whenever the map is non-empty. Shows the count, an
  "Include existing cells (overwrite)" checkbox, **Discard** and
  **Apply all** buttons. Apply pushes through the bulk endpoint;
  Discard wipes the map without writing anything.
- The preview filter drops suggestions for slots that already
  have a non-empty cell, so the bar count reflects what would
  actually be applied unless the GM toggles "Include existing."

**Client: Shift Templates modal.**

Full CRUD over the new endpoints. List shows name + dept + time
range; Edit / Delete inline; "+ Add template" form below the
list with name / dept dropdown / time pickers / save+cancel.
Edit slots flip the form into edit mode with prefilled fields.
On success, refetches `/api/admin/shift-templates` so the 15.3
popover's pills stay in sync.

**Client: Copy Previous Week dialog.**

Confirm dialog that surfaces the source-week label
("Copy every cell from the week of Sep 22…") so the GM can't
misfire onto the wrong week. "Include existing cells
(overwrite)" checkbox; same opt-in pattern as the Auto-Fill bar.

**Client: Validate Schedule modal.**

Reads conflicts from the latest `overview` payload (no extra
round-trip — the 15.4 endpoint already returned them). Zero-state
shows a green ✓ with "No conflicts detected." Non-zero state
shows the list with user / day / "Overlapping segments — '<text>'"
and a pointer to use the Edit popover to fix.

**Verified.** Three touched files balance. server.js retains the
existing -5/+5 paren noise from regex + SQL string literals (no
new imbalance from this sprint). All four tool buttons mount;
each modal opens + closes; auto-fill overlay appears on empty
cells; apply/discard round-trip works.

**Follow-ups carried forward to 15.6+:**

- **15.6** — mobile redesign (per-dept accordion cards). Has
  to come before the toolbar row gets used on mobile in earnest;
  current `.sheet-toolbar` will need a flex-wrap pass + maybe a
  collapse-to-menu treatment when 4 buttons don't fit.
- Mode-based auto-fill suggester (true most-common over a
  rolling window) if "most recent" misses too often.
- Bulk-apply Templates to selected cells (requires cell
  selection UI, which we don't have yet).
- Conflict-rule expansion (min/max hours, missing-break, etc.).

---

### 2026-05-28 — Sprint 15.4: history-derived coverage algorithm + right-rail Week Overview

The biggest sprint in the 15.x arc. Three coupled things:
(a) a new server module that *learns* what each dept's typical
coverage looks like from historical clock data, (b) a new
endpoint that aggregates that baseline plus the current week's
state into five UI-ready buckets, and (c) the right-rail UI
itself, which adapts to a bottom strip on narrower viewports.

**Schema (migration 021):**

- `schedule_sheet_cells` gets a `last_published_at TIMESTAMPTZ`
  column. Set to NOW() by the publish handler (via `CASE WHEN
  newFlag THEN NOW() ELSE last_published_at END` so unpublishing
  doesn't clear it). Backfill in the migration seeds it to
  `updated_at` for any cell currently published, so freshly-
  migrated DBs start the unpublished-changes counter at zero
  instead of "everything's unpublished."
- Publish + unpublish UPDATEs (3 spots, via the `replace_all`
  edit) now also write `last_published_at`.

**Server: coverage algorithm (`computeCoverageBaseline`).**

For each (department_id × day_of_week), pull historical clock
entries from the last N weeks (default 8 via the
`coverage_history_weeks` setting from 15.0), bucket by
(dept × DOW × week_start), then apply intelligent trimming:

- `< 2 weeks of data` for that (dept × DOW) → return the mean of
  whatever's there with `warning = 'low_sample'`. UI shows a
  small italic notice so the GM understands the score is
  preliminary.
- `≥ 3 weeks` AND the most recent 2 weeks deviate from the
  earlier weeks by `> 25%` (mean delta / earlier mean) → trim
  to just the recent 2 and flag `warning = 'regime_change'`.
  UI explains "schedule pattern changed — baseline auto-trimmed
  to the recent stable window."
- Otherwise → mean of all weeks. No warning.

Bucketing respects `tz_offset_minutes` (matches the pattern from
/me/hours and /admin/entries). The SQL pulls one row per
(dept × DOW × week_start) with hours summed; the JS does the
trimming so the algorithm logic is auditable in one place rather
than spread across SQL window functions.

**Server: helpers.**

- `minutesBetween(start, end)` — duration of an HH:MM:SS interval
  with overnight wrap (when end < start, adds 24h).
- `cellHasSelfOverlap(segments)` — for the conflicts surface.
  Detects multi-segment cells whose own segments overlap each
  other (e.g. a "9-12 / 11-3" typo). Sorts the segments by
  start, walks the list once; O(n log n).

**Server: `GET /api/admin/sheet/week-overview`.**

Single endpoint that returns the entire right-rail payload:

```
{
  coverage_score: 0..100 | null,
  dept_coverage: [{ department_id, name, color,
                    planned_hours, target_hours, pct, has_baseline }],
  open_shifts:   [{ department_id, department_name, day_of_week, target_hours }],
  conflicts:     [{ cell_id, user_id, user_name, day_of_week,
                    display_text, department_name, kind: 'self_overlap' }],
  unpublished_changes_count: integer,
  dataset_warning: 'low_sample' | 'regime_change' | null,
  meta: { history_weeks: N }
}
```

- `open_shifts` = (dept × DOW) tuples where
  `baseline.target_hours > 0` and no published cell covers them.
  Matches the GM's definition: "no one is filling the time in."
- `conflicts` = self-overlapping multi-segment cells only for v1.
  The schema's UNIQUE (week_start, user_id, day_of_week)
  constraint makes cross-cell same-user same-DOW overlap
  structurally impossible, so other conflict rules
  (cross-dept, planned-vs-actual, min/max hours, break-missing)
  are deferred to 16.x. Documented so we don't re-litigate
  scope mid-sprint.
- `unpublished_changes_count` = cells where
  `last_published_at IS NULL OR updated_at > last_published_at`.
  Brand-new cells count; freshly-published cells don't (the
  publish UPDATE sets both timestamps to NOW() in the same
  statement).

**Client: right-rail UI (`SheetOverviewRail`).**

Five collapsible cards. Coverage Score + Department Coverage
default open; the lists (Open Shifts / Conflicts / Unpublished
Changes) default closed so the rail stays scannable.

- **Coverage Score card** — big number with green / amber / red
  thresholds (≥90% / 70-89% / <70%). When dataset_warning is
  set, a small italic notice with a left amber stripe explains
  the caveat. "Baseline: last N weeks of clock data" caption.
- **Department Coverage** — horizontal progress bars per dept
  in the dept's color, with "Xh planned · Yh target" caption.
  No-baseline depts show "no baseline" instead of "0%".
- **Open Shifts** — count badge + collapsible list of (dept ·
  DOW · ~target h) tuples.
- **Conflicts** — count badge (red when > 0) + list with user
  name + day + "overlapping segments — '<text>'" message.
- **Unpublished Changes** — count + a contextual message
  pointing the GM at "Publish week" / per-row publish.

**Responsive behavior.**

- ≥1200px: rail sits to the right of `.sheet-grid-wrap` inside a
  new `.sheet-layout` flex container. Rail is 280px fixed; grid
  flexes to fill the remainder.
- <1200px: rail stacks below the grid and collapses into a
  horizontal `.sheet-overview-strip` showing four chips —
  Coverage / Open / Conflicts / Unpublished — with no detail
  lists. The strip is the "at-a-glance" form factor for tablets;
  full detail is on desktop.

**Live invalidation.**

Every mutation that affects the overview state (cell save,
publish, unpublish, popover save, row remove) calls
`reloadOverview()` after the response lands. Week navigation
re-fetches via the `weekStart` effect dependency. The fetch is
cheap (one endpoint, one round-trip) so we don't bother with
optimistic updates.

**Verified.** Five touched files balance. server.js shows
parens:-5 / sq:5 noise (vs the prior -4/+4) — one extra from
the new SQL string's parens inside the template literal. No real
imbalance. New endpoint reachable; rail renders + collapses;
dataset warnings surface; strip shows on narrower viewports.

**Migration deploy.** `021_schedule_sheet_cells_last_published_at.sql`
before code rollout. Safe to re-run (uses `ADD COLUMN IF NOT
EXISTS`). The backfill UPDATE is idempotent (only touches rows
where the column is NULL).

**Open follow-ups for 15.5 + later:**

- Conflict ruleset expansion (cross-cell same-day for users that
  end up in multiple sheet rows, min/max hours, break-missing).
- "Review unpublished changes" panel — currently the card just
  shows a count + suggestion. A detail list comparing edits
  against the last-published snapshot would land in 15.5 or
  later if the GM asks for it.
- N=8 default vs adaptive N: the regime-change detector already
  adapts, but we might let the GM pick "Auto" vs a fixed number
  if the UX clarity benefits.

---

### 2026-05-28 — Sprint 15.3: per-cell Edit Shift popover + notes + contenteditable fast-path retained

The thoughtful path. Same cells still tab-and-type as before, but
each one now has a small caret affordance that opens an anchored
popover with template pills, status code pills, free-form text,
and a notes textarea. The popover is dept-scoped — only the row's
dept templates show as quick-picks.

**Schema (migration 020):**

- `schedule_sheet_cells` gets a `notes TEXT` column. NULL = no
  note. Backfill not needed — all existing rows are NULL by
  default and the column is optional everywhere.

**Server:**

- `PUT /admin/sheet/cell` accepts an optional `notes` field. Three
  cases:
    - `notes` key omitted → preserve existing note via a
      `CASE WHEN $provided THEN $value ELSE existing END` guard
      in the ON CONFLICT branch.
    - `notes: null` → clear note.
    - `notes: '...'` → set.
  The guard lives in SQL (not JS) so a partial PUT from any client
  can't accidentally wipe a note that was written by a different
  surface.
- `GET /admin/sheet/week`, `GET /admin/sheet/published`, and all
  four RETURNING blocks (PUT cell, publish-by-ids, publish-by-week,
  highlight) return `notes`. Calendar overlay reads it.

**Client: Edit Shift popover.**

- New `CellEditPopover` component, rendered at page root when
  `editPop` state is non-null (same fixed-position + viewport-flip
  trick the 15.2 row menu uses, so `.sheet-grid-wrap`'s overflow
  doesn't clip it).
- Two layouts:
    - **Desktop (≥720px):** anchored to the cell's caret trigger,
      360px wide, opens below; flips above if it would overflow
      the viewport bottom.
    - **Mobile (<720px):** full-bleed bottom sheet, 16px top
      corners, 80vh max-height. Backdrop click and the explicit
      close button both dismiss.
- Sections (in order):
    1. **Templates** — dept-scoped quick-picks from the existing
       `shift_templates` table (`/api/admin/shift-templates`).
       Each pill shows the time range in the GM's shorthand
       ("7a-3p", "11p-7a"). Clicking sets the custom-text input.
    2. **Status codes** — admin-defined codes from
       `/api/admin/status-codes`. Pills render in their assigned
       color with contrast-correct text.
    3. **Custom** — the same free-form `<input>` the cell uses
       for inline editing, autofocused on desktop so the keyboard
       flow continues immediately.
    4. **Note** — 120-char-max textarea with live counter
       ("47/120").
- Save / Cancel actions. Escape cancels. Scroll auto-closes (so
  the anchor rect doesn't go stale on a long page).

**Client: cell affordances + indicators.**

- Each cell now renders a small caret (`▾`) button at its right
  edge, absolutely positioned. Hidden on desktop until the cell
  is hovered or focused; always visible on touch devices
  (`@media (hover: none)`). Tab order: the caret has
  `tabIndex={-1}` so keyboard users keep flying through cells via
  the input alone — the caret is mouse/touch-driven.
- Notes indicator: tiny amber dot in the top-left corner of any
  cell that has a non-null `notes` value. Lets the GM scan-spot
  noted cells without opening each one.

**Client: calendar overlay reads notes.**

- The Sprint-14.2 `PlannedShiftsStrip` pill now picks up
  `p.notes` via the hover `title` attribute. Title format:
    - With note: `"<staff> — <text>\nNote: <note>"`
    - Without:   `"<dept> • <text>"` (existing behavior)
- Pills with notes get a subtle inset amber border-glow so the
  calendar's planned strip mirrors the sheet's notes-dot signal.

**Why the fast-path is preserved:**

Resolved in §2.0 #2 — tab+type is the right loop for a full week
of bulk entry. The popover is the right surface for *one*
deliberate edit ("3p–11p, but flag her for the deep clean before
service"). Two surfaces, one data path: PUT
`/admin/sheet/cell` is the single write endpoint for both, so
templates / status pills / custom text + notes all funnel through
the same server logic (including the multi-segment parser from
14.3).

**Verified.** Seven touched files balance. server.js shows the
same -4/+4 paren noise from the parseShiftTimes regex literal.
Notes thread through SELECT / RETURNING / overlay.

**Migration deploy.** `020_schedule_sheet_cells_notes.sql` before
code rollout. Safe to apply at any time (column is NULL-default,
nothing breaks for existing rows).

**Follow-ups:**

- **15.4** is next: right-rail Week Overview backed by the
  history-derived coverage algorithm (new server module, two new
  endpoints, plus migration 020-style `last_published_at` column
  for unpublished-change tracking — actually that becomes
  migration 021).
- Possible later refinement: a "Save (no close)" variant of the
  popover for power users who want to chain edits without
  re-opening for the next cell.

---

### 2026-05-28 — Sprint 15.2: inline status pills + per-row "..." menu

First sprint where 15.0's `status_codes` table actually shows up
on the sheet. Plus consolidates the per-row publish toggle into a
proper row-actions menu so we have somewhere to land Copy / Remove
/ View profile.

**Shipped:**

- **Status code fetch + lookup.** `ShiftSheet` mounts → fetches
  `/admin/status-codes` once. Builds a `statusByAbbr` Map keyed by
  the upper-cased abbreviation for O(1) lookup from the cell
  renderer.
- **Inline pill rendering.** `ShiftCellInput` checks whether the
  current value (trimmed + upper-cased) matches a status code.
  When it does AND the cell is not focused, the input gets a
  colored background (the admin-picked hex from the code),
  contrast-correct text color, bold weight, slight border radius,
  and uppercase + letter-spacing. The input stays an `<input>` so
  keyboard editing keeps working — only the visual style changes.
- **Focus-aware behavior.** Local `focused` state on the input.
  While focused (admin is typing), the pill style detaches so
  half-typed text reads cleanly. As soon as blur fires, the match
  is re-checked and the pill re-applied. No flicker because the
  match is computed render-time, not on each keystroke during
  focus.
- **Contrast-correct foreground.** Small `fgForBg(hex)` helper
  computes luminance and picks white text for dark backgrounds,
  near-black for light. Simple weighted RGB; can swap for APCA
  later if needed.
- **Per-row "..." menu.** New `.sheet-row-menu` chip replaces the
  Sprint-14.1 ○/● publish toggle. Menu items:
    - Publish row / Unpublish row (existing handler, with a
      colored dot reflecting current state)
    - Copy row to next week (new)
    - View staff profile (`goTo('staffDetail', { userId })`)
    - Remove from sheet (new, with a confirm dialog)
- **Publish state still readable at a glance.** The trigger gets
  the same green-tint treatment the old standalone toggle had —
  green background + border + text when the row is fully
  published. No info lost going from "always-visible toggle" to
  "menu trigger that doubles as a state pill."

**Popover positioning gotcha (and the fix).**

`.sheet-grid-wrap` has `overflow-x: auto` for horizontal table
scroll. Per CSS spec, an `overflow-x` value of `auto` forces
`overflow-y` to clip too. A naïve `position: absolute` popover
anchored to the row's "..." trigger would get clipped by the
wrap's edges on narrow viewports or when the menu opens at the
bottom of the visible area.

Fix: popover uses `position: fixed`, rendered as a page-root
sibling of the table (outside the wrap). Toggle handler captures
the trigger's `getBoundingClientRect()` and stores it in the
`openRowMenu` state alongside the userId. The popover renders
once at the page root, reading `top`/`left` from that rect.
Auto-flips upward if it would overflow the viewport bottom.
Auto-closes on document scroll (capture phase, catches scrolls
in any nested overflow container too) so a stale rect can't leave
the menu floating in mid-air.

**Row action implementations:**

- **Copy row to next week:** filters cells for the row, computes
  `weekStart + 7` (local-date math), then `Promise.all` of 7 PUTs
  through the existing `/admin/sheet/cell` upsert endpoint.
  Parser + segments stay populated because every PUT goes through
  the server's standard write path. For 7 cells the round-trips
  are fine; we'll fold into a bulk endpoint later if this becomes
  a frequent GM action.
- **Remove from sheet:** `Promise.all` of DELETEs against the
  existing `/admin/sheet/cell?…` route plus dropping the user
  from the session's `addedUserIds` set so manually-added-but-
  empty rows disappear too.

**Verified.** ShiftSheet/index.js + ShiftSheet.css balance.
Status codes load on mount; pill renders for HELP / BRK / DEEP
CLEAN / H.M / OFF + any admin-added codes; per-row menu opens
on the right viewport, escapes overflow, closes on outside click
+ Escape + scroll.

**Follow-ups:**

- **15.3** next: per-cell Edit Shift popover (pill-based time
  templates, notes field, contenteditable fast-path retained).
  The "..." pattern we built here gives us a popover layout
  template to mirror.
- Possible refinement: if "Copy row to next week" becomes a daily
  GM action, fold the 7-PUT loop into a single bulk endpoint.

---

### 2026-05-28 — Sprint 15.1: per-dept "+ Add staff" + dept header polish

The narrow ask from the GM after the Sprint-14.3 review: scope the
add-staff action to each department instead of one bottom dropdown.
Pure client refactor; no schema, no endpoints.

**Shipped:**

- **Per-dept "+ Add staff" affordance.** Each dept section now ends
  with a dashed-border `+ Add to <Dept>` button. Click expands it
  inline into a `DropdownSelect` filtered to that dept's active
  employees not yet on the sheet, plus a Cancel button. Picking a
  staff member adds the row and collapses the affordance.
- **Single-open at a time.** New `addOpenDept` state (string |
  null) tracks which dept's affordance is open; clicking a
  different dept's "+ Add" collapses the previous one. Avoids
  multiple open dropdowns competing for attention.
- **Dropped the bottom single-add row.** The old
  `.sheet-add-staff` row (and the global `addablePool` memo backing
  it) is gone. Replaced by the per-dept variants.
- **Dept header polish.** Each dept row is now a flex row containing
  a colored dot (the dept's `color` from `/api/admin/departments`)
  + the dept name + a small "N staff" count pill. Wrapped in a
  `.sheet-dept-row-inner` div so the flex layout doesn't fight the
  `<td colSpan={9}>` it sits inside.
- **Empty depts now render.** `grouped` includes any dept that has
  at least one *addable* staff member even when it has zero rows
  yet — so the GM can add the very first row to a fresh dept.
  Without this, an empty dept would never appear in the sheet and
  the only way to start it would be the (now-removed) global
  dropdown.

**Behavior nuances:**

- `Unassigned` (staff without a `department_id`) still shows up as
  a section when it has rows, but never gets a `+ Add` button — you
  can't add "to unassigned" from the typeahead because the
  typeahead is dept-scoped.
- If every active employee in a dept is on the sheet, the "+ Add"
  button stays visible but disabled, with a tooltip explaining
  why. Better than hiding it (which would make the section feel
  "broken").
- When no depts exist at all, the empty-state message now points
  the admin at **Settings → Departments** instead of the gone
  bottom dropdown.

**Verified.** ShiftSheet/index.js + ShiftSheet.css balance.
addableByDept + grouped restructure preserve every existing render
path; per-dept add inline affordance renders + collapses; "N staff"
count + dept dot show on header.

**Follow-ups:**

- **15.2** picks up next: per-row `...` menu (merging the existing
  publish toggle into it) + inline status pill rendering driven by
  the `status_codes` table seeded in 15.0.

---

### 2026-05-28 — Sprint 15.0: Settings categorization + admin-defined status codes + coverage-history setting

First sprint of the Shift Sheet redesign arc. Foundational —
nothing visible on the sheet yet, but every subsequent 15.x sprint
reads from what this one shipped.

**Schema (migration 019):**

- New table `status_codes` (code_id / label / abbreviation / color
  / is_system / sort_order / timestamps). UNIQUE on `abbreviation`.
- Seeds five `is_system = TRUE` rows: HELP (green), BRK (amber),
  DEEP CLEAN (yellow), H.M (slate), OFF (gray). System rows are
  renamable / re-colorable via PATCH but the DELETE handler guards
  them at the SQL level (`AND is_system = FALSE`).

**Server endpoints:**

- `GET /api/admin/status-codes` — list, sort_order ascending then
  label.
- `POST /api/admin/status-codes` — create custom code. Validates
  hex color (`^#[0-9a-fA-F]{6}$`); 409 on duplicate abbreviation;
  abbreviation upper-cased + trimmed.
- `PATCH /api/admin/status-codes/:id` — rename / recolor / reorder.
  Same validators; COALESCE-style update so partial bodies work.
- `DELETE /api/admin/status-codes/:id` — non-system only. Returns
  404 if not found, 409 with a friendly message if it's a system
  code.

**Settings validator extension:**

- Added `coverage_history_weeks` to the ALLOWED settings map in PUT
  `/admin/settings`. Validates "string that parses to an integer in
  [2, 52]". Used by Sprint 15.4's coverage algorithm; client
  defaults to "8" when missing.

**AdminSettings refactor:**

- Page is now categorized — sections grouped under uppercase
  category headers:
    1. **Display & Visibility** — Shifts Board Visibility
    2. **Operations** — Performance Thresholds, Payroll (Payroll
       was moved up from after Departments to sit next to
       Performance, where it semantically belongs)
    3. **Departments** — Departments CRUD
    4. **Staff Login** — Staff auto sign-out, Staff login methods,
       Hide ABC keyboard + Staff login layout (these two stay in
       one section since both shape the login screen)
    5. **Shift Sheet** — Legacy assign panel (pulled out of its
       previous awkward home inside the Hide-ABC section),
       Coverage history window, **Status Codes** (new)
    6. **Account** — Sign out
- Category header is a quiet uppercase label with a thin underline.
  Not a card itself — section cards remain the visual unit. Rhythm
  comes from the header's vertical margin.

**Status Codes UI:**

- New `<StatusCodesSection>` component (still in AdminSettings.js
  for now; can move to its own file if it grows). Lists existing
  codes with a color swatch, the abbreviation pill, the full
  label, a "SYSTEM" tag on protected rows, plus Edit / Delete.
- "+ Add status code" button opens an inline editor; same editor
  is reused for in-place edits via the shared `<ColorAndTextEditor>`.
- Color picker: 8-swatch preset palette + a "#" button that toggles
  a hex input. Hex is validated against `^#[0-9a-fA-F]{6}$`; save
  button stays disabled until the hex is valid (and label +
  abbreviation are non-empty).
- Delete on a system code is disabled with an explanatory tooltip.

**Coverage history window UI:**

- Number input (min 2, max 52, default 8) in its own Shift Sheet
  section. Help text explicitly mentions that the algorithm does
  its own intelligent trimming (regime-change detection) so the
  number is just an upper bound, not a fixed window — set
  expectations now so 15.4's algorithm doesn't feel like it's
  ignoring the setting.

**Migration deploy.** `019_status_codes.sql` must run before code
rollout. The 15.2 inline pill renderer reads from this table; the
sheet won't crash without it (cells fall back to plain text), but
the Status Codes section in Settings will render empty until the
seed runs.

**Verified.** Five touched files balance (server.js shows the
same -4/+4 paren noise from the parseShiftTimes regex literal).
status_codes endpoints reachable; AdminSettings loads + saves
the new coverage_history_weeks value; category headers render
above each group.

**Follow-ups:**

- **15.1**: per-dept "+ Add staff" + dept-scoped typeahead. Pure
  client refactor. No deps on 15.0.
- **15.2**: status code → inline pill rendering on the Shift Sheet.
  This is when 15.0's `status_codes` table starts being read by
  the actual sheet UI.

---
