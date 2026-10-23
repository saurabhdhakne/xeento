# Build Xeento Yourself — Step-by-Step Guide

This folder explains **how Xeento was built, in the order it was built**, and
**why each piece works the way it does**. It's written so you can rebuild the
app by hand (in a fresh repo, or by re-reading this one) and only reach for AI
when you're stuck on a nasty bug.

You don't need to read the code first. Each chapter tells you what to build,
shows the important lines, and links to the real file.

---

## How to use this guide

1. Read [00 — Foundations](00-foundations.md) first. It explains the handful of
   ideas that the whole app rests on (IndexedDB, live queries, BlockNote's
   block JSON, sparse ordering, custom URL schemes). Everything else is
   built from them.
2. Then go chapter by chapter. Each chapter is one milestone (or half of a
   big one). Every chapter has the same shape:
   - **Goal**: what the user can do when you're done
   - **Steps**: what to build, in order
   - **Why**: the reasoning behind each design choice
   - **Checkpoint**: how to check it works before moving on
   - **Gotchas**: the bugs that were hit (so you don't hit them)
3. Keep [FEATURES.md](../../FEATURES.md) open. Every feature has an ID
   (`SB-01`, `ED-06`…) and test steps. This guide uses the same IDs.
4. Use [08 — Cheat sheet](08-cheatsheet-and-next-steps.md) as a reference
   for recurring patterns and gotchas once you've read the rest.

> **Tip for learning:** for each step, try writing the code yourself from the
> explanation *before* looking at the snippet or the real file. Then compare.
> Where your version differs, ask yourself which edge case the real one
> handles.

---

## Chapters

| # | Chapter | Milestone | Feature IDs |
|---|---|---|---|
| 00 | [Foundations](00-foundations.md) | Before you start | — |
| 01 | [Core app](01-core-app.md) | Milestone 1 | SB-01, PG-01, ED-01, PG-02, ST-01 |
| 02 | [Search and organization](02-search-and-organization.md) | Milestone 2 | SR-01, SB-03, SB-04, SB-05, SB-07, PG-03, PG-04 |
| 03 | [Files and media blocks](03-files-and-media-blocks.md) | Milestone 3 (part 1) | ED-02 → ED-07 |
| 04 | [Export and import](04-export-and-import.md) | Milestone 3 (part 2) | IO-01 → IO-06 |
| 05 | [Polish round](05-polish-round.md) | Post-Milestone 3 | SB-02, SB-06, PG-05, ED-08, … |
| 06 | [Data safety](06-data-safety.md) | Milestone 4 | DS-01 → DS-04 |
| 07 | [Linking pages](07-linking-pages.md) | Milestone 5 | ED-09, ED-10, PG-06, PG-07 |
| 08 | [Cheat sheet and next steps](08-cheatsheet-and-next-steps.md) | Reference | — |

---

## A note on history

Git has three commits: `Initial commit` (Milestones 1–3 plus the polish
round), `Milestone 4` and `Module 5`. So the exact order *inside* Milestones
1–3 isn't recorded in git. This guide rebuilds that order from:

- FEATURES.md's Changelog (which lists what each milestone added), and
- the Dexie schema versions in [`src/lib/db.ts`](../../src/lib/db.ts): v1 =
  pages only, v2 = folders + favourites/tags/recent fields, v3 = files,
  v4 = trash. Each new version marks a milestone boundary.

Code snippets show the **final** code unless a chapter says "simplified for
this stage". When an early version was simpler (for example, delete was a
hard delete before Trash existed), the chapter says so.

---

## The app in one paragraph

Xeento is a Next.js app that runs **entirely in the browser**. Every page,
folder, uploaded file and Trash entry is stored in the browser's IndexedDB
(through a library called Dexie). The editor is BlockNote, which stores a
page's content as a JSON array of blocks. React components never talk to the
database directly: they call small functions in `src/lib/` to write, and
read through "live query" hooks that re-render automatically whenever the
data changes. The only server code is one API route that fetches link
previews (because browsers can't read other sites' HTML).

## Size of the job

About 12,000 lines of TypeScript/TSX across ~85 files. Realistic pace if you
rebuild by hand while learning: Milestone 1 in a weekend, each later
milestone in a few evenings to a week. Milestone 3 is the biggest.
