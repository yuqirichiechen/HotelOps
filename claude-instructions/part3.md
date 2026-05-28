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
