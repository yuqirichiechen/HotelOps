# Claude Instructions — HotelOps (index)

> **Read both files below every iteration before doing any work.** The
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
   orient), followed by the iteration log starting at **Sprint 10**.
   New sprint entries get appended here, not to part 1.

## Why split

Part 1 grew to ~5,700 lines / ~290KB across Sprints 1–9. Reading it
end-to-end each iteration cost a lot of tokens. Part 2 starts fresh
with a synthesis at the top, so future iterations can be productive
with the recap as primary context and dip into part 1 when they need
the deeper "*why* did we land here" detail.

## When to write where

- **New sprint entry**: append to `part2.md`. Never touch part 1.
- **Updating an old entry / fixing a typo**: edit part 1 in place.
- **Architectural decision that changes the project shape** (auth
  model, routing scheme, etc.): update part 2's recap *and* add a new
  sprint entry there.
- **Don't move sprint entries between parts.** The split point
  (Sprint 9.4.1 → Sprint 10) is fixed; respect it.
