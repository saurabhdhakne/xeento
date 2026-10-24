# Contributing to Xeento

Thanks for helping. Xeento is MIT-licensed; by contributing you agree your
work is released under the same license.

## Setup

```
npm install     # also copies the pdf.js worker into public/
npm run dev     # http://localhost:3000
```

Node 24 is what CI uses.

## Before you open a pull request

1. `npm run lint` passes.
2. `npm run build` and `npm run build:static` pass (CI runs all three).
3. The relevant test steps in [FEATURES.md](FEATURES.md) pass in the
   browser. There's no automated test suite; FEATURES.md is the test plan.
4. Docs match the change: user-visible behavior goes in FEATURES.md (entry
   + Changelog line); architecture, data-model or rule changes go in
   [CLAUDE.md](CLAUDE.md).

## Ground rules

[CLAUDE.md](CLAUDE.md) holds the architecture and project rules. The short
version:

- Keep changes small and focused; match the surrounding style.
- New dependencies need a permissive license (MIT, Apache-2.0, BSD, ISC,
  MPL-2.0). No GPL/AGPL. Say why the dependency is needed.
- Components never import Dexie or `db.ts` directly; go through
  `src/lib/` modules and the `use-*.ts` hooks.
- Schema changes add a new Dexie version; never edit an existing one.
- Integrations run client-side behind adapters. The app must keep working
  as a static export, with no server.

[ROADMAP.md](ROADMAP.md) has the plan. Open an issue before starting on a
roadmap item so work isn't duplicated.
