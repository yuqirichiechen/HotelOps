# Claude Instructions — HotelOps (index)

> **Read all files below every iteration before doing any work.** The
> running log was split for size; nothing is duplicated — each part
> hosts a different section of the project's history.

## Read these, in order

1. **[claude-instructions/part1.md](./claude-instructions/part1.md)** — original
   project overview (stack, architecture decisions, API endpoints) plus
   the full iteration log for **Sprints 1 through 9.4.1**. Ground truth
   for the existing codebase shape, locked decisions, and convention
   patterns.

2. **[claude-instructions/part2.md](./claude-instructions/part2.md)** — quick
   recap of Sprints 1–9 (so you don't have to re-read 5,000+ lines to
   orient), followed by the iteration log for **Sprints 10–14.3**.

3. **[claude-instructions/part3.md](./claude-instructions/part3.md)** —
   iteration log for **Sprints 15.0–16.9**. Shift Sheet redesign arc
   (15.x) plus the focused-clock + i18n + auto clock-out + admin clock
   override arc (16.x).

4. **[claude-instructions/part4.md](./claude-instructions/part4.md)** —
   iteration log for **Sprint 17.0+**. Front Desk forecast feature
   (Agilysys rGuest Stay integration) and onward.

## Why split

Each file caps around 2,000–3,000 lines before becoming unwieldy to
load every iteration. When the active file gets long, we start a new
part rather than retroactively restructuring — that way old entries
keep their line numbers and historical sprint cross-references stay
valid.

## When to write where

- **New sprint entry**: append to the most recent part file (`part4.md`
  as of Sprint 17). Never touch older parts.
- **Updating an old entry / fixing a typo**: edit the original part in
  place.
- **Architectural decision that changes the project shape** (auth
  model, routing scheme, etc.): add a new sprint entry to the active
  part with a "**Sprint-wide impact**" header.
- **Don't move sprint entries between parts.** Split points are fixed
  (9.4.1 → 10, 14.3 → 15, 16.9 → 17); respect them.
