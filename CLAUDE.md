# Xeento

A local-first, block-based notes and docs app. Xeento is its own product:
own name, branding, colors and UI copy. Never copy another product's.

**Read this file first in any new session.** It holds how to work here and
the architecture. [FEATURES.md](FEATURES.md) lists every feature with test
steps (by feature ID).

---

## How to work in this repo

These rules bias toward caution over speed. For trivial tasks (a typo, a
one-line CSS fix), use judgment.

### 1. Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State your assumptions before implementing. If uncertain, ask.
- If a request has more than one reasonable reading, list them. Don't pick
  one silently.
- If a simpler approach exists, say so and push back when warranted.
- If something is unclear, stop, name what's confusing, and ask.
- Check FEATURES.md before building: the feature (or part of it) may exist.
- **Next.js 16 / Tailwind v4 / BlockNote change fast.** Don't rely on memory
  for their APIs. Check the installed version's types and docs in
  `node_modules/` (or existing usage in this repo) before writing code
  against them.

### 2. Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features, options or configurability beyond what was asked.
- No abstractions for single-use code. No error handling for impossible
  cases.
- Prefer what BlockNote, Dexie or the browser already provide over new code.
  Prefer new code over a new dependency.
- If 200 lines could be 50, rewrite it. Would a senior engineer call this
  overcomplicated? Then simplify.

### 3. Surgical changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments or formatting. Don't refactor what
  isn't broken. Match the existing style.
- Noticed unrelated dead code or a bug? Mention it; don't fix it unasked.
- Remove imports, variables and functions that *your* change made unused.
  Leave pre-existing dead code alone.
- Test: every changed line should trace directly to the request.

### 4. Goal-driven execution

Define success criteria. Loop until verified.

There is **no automated test suite**. Verification means:
1. `npm run lint` passes
2. `npm run build` and `npm run build:static` pass (type errors surface
   here)
3. The relevant FEATURES.md test steps pass in the browser at
   http://localhost:3000. For a new feature, write its test steps first;
   they are the success criteria.

For multi-step tasks, state a brief plan before starting:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```
Don't report a task done until it's verified. If you couldn't verify
something (e.g. it needs a manual browser check), say exactly what is
unverified. Don't add a test framework without asking. One exception is
approved: Firestore rules tests (Firebase emulator via `firebase-tools`,
MIT, plus `@firebase/rules-unit-testing`, Apache-2.0, dev dependencies
only), added in ROADMAP.md Phase 4 as `npm run test:rules`. Not installed
yet; Phase 4 adds the command to Commands below.

### Project rules (ask before breaking any of these)

- **New dependencies:** ask first and state the license. GPL/AGPL and
  "GPL-or-Proprietary" packages are out (that's why `@blocknote/xl-*` isn't
  used). MIT, Apache-2.0, BSD, ISC and MPL-2.0 are fine.
- **Storage boundary:** components never import Dexie, `db.ts` or a backend
  SDK (ESLint `no-restricted-imports` enforces it under `src/components/`).
  They take types from `records.ts`, call `src/lib/pages.ts` /
  `folders.ts` / `files.ts` and read through the `use-*.ts` hooks. Dexie is the only local store in every mode; optional
  sync adapters (ROADMAP.md) copy changes between Dexie and the user's own
  backend behind those modules, never replacing it.
- **Schema changes:** add a new Dexie version in `db.ts`. Never edit or
  delete an existing version (existing users' data migrates forward).
- **One editor schema:** every custom block goes in
  `src/components/editor/schema.ts`. The live editor, headless export and
  print layout all use it; that's what makes blocks round-trip.
- **Client-side only.** Integrations run client-side behind adapters.
  Route handlers are only for optional extras (today: `/api/link-preview`);
  the app must still work as a static export. Don't add server routes or a
  backend without asking.
- **Pages are not routed** (`/p/[id]`). Selection is client state in
  `AppShell`, persisted to `localStorage` so a reload reopens the page.
  Don't add routing unless deep-linking is requested.

**These rules are working if:** diffs contain only requested changes,
there are fewer rewrites from overcomplication, and clarifying questions
come before implementation rather than after mistakes.

---

## Stack

- **Next.js 16 (App Router)** + TypeScript + Tailwind v4
- **BlockNote** (`@blocknote/core`, `react`, `mantine`): editor, slash menu,
  drag handles, markdown shortcuts, Markdown im/export
  (`blocksToMarkdownLossy` / `tryParseMarkdownToBlocks`)
- **@blocknote/code-block** (MPL-2.0): Shiki code block; we add a copy
  button and line-number gutter
- **pdfjs-dist** (Apache-2.0): canvas-rendered inline PDF viewer
- **jszip** (used under MIT; dual MIT/GPL-3.0): zip import/export
- **gray-matter** (MIT): front-matter on markdown import
- **papaparse** (MIT): CSV parsing (Notion database → table block)
- **Dexie** + `dexie-react-hooks`: IndexedDB storage, the local store in
  every mode
- **@dnd-kit/core** (page/folder tree), **@dnd-kit/sortable** (Favourites)
- **emoji-picker-react**, **next-themes** (class-based dark mode; custom
  `dark` variant in `globals.css`), **lucide-react**, **nanoid** (all ids)

**Deliberately not used:** `@blocknote/xl-pdf-exporter`, `xl-docx-exporter`,
`xl-multi-column` (GPL-or-Proprietary). `@react-pdf/renderer` (would need a
second renderer for every block). PDF export is `window.print()` over a
hidden print layout instead.

`npm install` runs `scripts/copy-pdf-worker.mjs` (postinstall), copying the
pdf.js worker into `public/`. Re-run it if the worker goes missing.

---

## Data model

Types and `ROOT_ID` live in `src/lib/records.ts` (no Dexie import). The
schema is in `src/lib/db.ts`, Dexie **version 4** (v1–v3 kept for
migration).

```ts
interface PageRecord {
  id: string;
  parentId: string;              // ROOT_ID ("root") for top-level pages
  folderId: string | null;       // ONLY set when parentId === ROOT_ID.
                                 // Nested pages always have folderId: null.
  title: string;
  icon: string | null;           // emoji character
  order: number;                 // sparse int; siblings scoped by
                                 // (parentId, folderId) at root, parentId when nested
  content: unknown;              // BlockNote PartialBlock[] as JSON
  tags: string[];
  favourite: boolean;            // not indexed (booleans aren't IndexedDB keys)
  favouriteOrder: number | null; // order among favourites only
  lastOpenedAt: number | null;   // Recent section; separate from updatedAt so
                                 // viewing never counts as editing
  createdAt: number;
  updatedAt: number;
}

interface FolderRecord { id: string; name: string; order: number; collapsed: boolean; }

interface FileRecord { id: string; name: string; mimeType: string; size: number; blob: Blob; createdAt: number; }

interface TrashRecord { id: string; deletedAt: number; pages: PageRecord[]; }
// id = the deleted top page's id; pages = that page first, then its
// descendants, exactly as they were. Deleted pages leave the `pages`
// table, so no other query needs to filter them out.
```

- A page's children are pages whose `parentId` points at it. No tree table.
- Folders don't nest. Folder membership is root-level only.
- **Asset URLs:** a block's `url` is either `https://…` (hosted) or
  `xeento-file://<fileId>` (local upload). Everything resolves through
  BlockNote's `editor.resolveFileUrl`; `createFileUrlResolver()` in
  `use-files.ts` keeps an object-URL cache per editor, revoked on unmount.
- **Internal links:** `xeento-page://<id>`, intercepted by a click listener
  in `app-shell.tsx` that calls `openPage`. Page mentions (`pageMention`
  inline, `props.pageId`), sub-page cards (`subPage` block) and backlink
  rows all render as these anchors, so they need no navigation plumbing.
  Both store only the id and read the live title via `usePageOrNull`.

---

## Architecture and gotchas

Where things live, plus the non-obvious decisions. Read the relevant file
before changing it.

**Data layer (`src/lib/`)**
- `db.ts`: `getDb()` opens the database on first call and caches it.
  `createDb(name)` applies the schema to any name; Local mode uses
  `xeento`. Data modules take `const db = getDb()` once per function (a
  whole transaction uses one instance); hooks call `getDb()` inside the
  live query.
- `backend/`: type-only adapter interfaces for Sync mode, backend-neutral.
  `auth.ts` (`AuthProvider`), `sync.ts` (`SyncAdapter`: push / pull since
  an opaque cursor / subscribe; `SyncChange` with tombstones; `Synced*`
  types drop device-only fields), `file-storage.ts`
  (`FileStorageAdapter`). Adapters never touch Dexie; a sync engine
  applies their results. Local mode has no adapters.
- `pages.ts`: page CRUD. `movePageToPosition` handles reorder, re-parent and
  folder moves, and enforces the nested-`folderId: null` invariant. Also
  `toggleFavourite`, `reorderFavourites`, `touchLastOpened`, `setPageTags`,
  `duplicatePage(id, afterId = id)` (builds every copy before adding any,
  then remaps `subPage` ids to the copies). Pages are never hard-deleted
  here.
- `trash.ts` (+ `use-trash.ts`): `trashPage`, `restoreFromTrash` (falls
  back to Pages root if the parent page/folder is gone), `deleteFromTrash`,
  `emptyTrash`, `purgeExpiredTrash` (30 days, run on load from
  `app-shell.tsx`).
- `folders.ts`: `deleteFolder` either re-homes pages one at a time through
  `movePageToPosition` (avoids order collisions) or trashes each page.
- `files.ts`: `storeFile` (warn >25MB, reject >100MB, via `ui/toast.tsx`).
  `deleteUnusedFiles` scans `pages` and `trash` content for
  `xeento-file://` refs; files under 24h old are always kept (uploads wait
  on the autosave debounce, imports store files before pages).
- `backup.ts`: lossless zip (`backup.json` + `files/<id>`); restore
  replaces every table. **Gotcha:** a Dexie transaction commits as soon as
  it awaits non-IndexedDB work (jszip, fetch), so read everything first,
  then open the transaction.
- `build-page-tree.ts`: filters **only the top level** by folder. Don't
  pre-filter the whole array by `folderId`; nested descendants (always
  `folderId: null`) would vanish.
- `dnd-utils.ts`: nest/reorder math and `rowDragListeners` (whole-row drag
  that ignores rename inputs and portal-bubbled events).
- `block-text.ts` (content → plain text for search; `pageLinkIds` for
  backlinks: mentions + `xeento-page://` links, not sub-page cards),
  `recency.ts` (date
  buckets), `use-local-storage-flag.ts` (hydration-safe boolean flag).

**Shell and sidebar (`src/components/`)**
- `app-shell.tsx`: selected page, global shortcuts (Cmd/Ctrl+K,
  Cmd/Ctrl+\\, page copy/paste). On load it requests persistent storage,
  then runs `purgeExpiredTrash` → `deleteUnusedFiles`. `openPage(id)` is
  the only path for real navigation (touches `lastOpenedAt`). Restore-on-reload calls
  `setSelectedId` directly on purpose. It also snapshots `recentIds` once at
  load, so Recent's order only changes on reload.
- `sidebar/sidebar.tsx`: one shared `DndContext` for Folders + Pages. Drag
  kinds use `data.type`; ids are always real nanoids, never prefixed.
- `sidebar/page-tree-row.tsx`: drag-agnostic row (takes drag props), reused
  by Pages, Folders, Favourites (`useSortable`) and Recent (no drag).
- `sidebar/trash-dialog.tsx`: Trash list, opened from the sidebar footer.
- `ui/popover.tsx`, `ui/context-menu.tsx`: portaled to `document.body` and
  viewport-clamped, because the sidebar `<aside>` is `overflow-hidden`.
- `page-view.tsx`: title (`TitleField`), icon, sticky toolbar (star + "…"
  menu: Move to + export), tags, editor, `backlinks.tsx`, hidden print
  subtree.
- `move-to-dialog.tsx`: keyboard move via `movePageToPosition` (to the
  end). Opened from the "…" menu or Cmd/Ctrl+Shift+M; state lives in
  `AppShell`.

**Editor (`src/components/editor/`)**
- `block-editor.tsx`: BlockNote wrapper. 400ms debounced autosave with
  flush-on-unmount. Custom slash menu (BlockNote's default omits custom
  blocks; `/page` creates a child then a `subPage` card). `@` and `[[`
  page menus are two more `SuggestionMenuController`s (multi-char triggers
  work; `@` uses `shouldOpen` to require a word start). `pasteHandler`
  for the paste-URL menu. Block-type dropdown adds Code block.
- `schema.ts`: the single schema (see Project rules).
- `blocks/`: `sub-page-block`, `file-block` (BlockNote's own + size label), `pdf-block` +
  `pdf-viewer` (lazy per-page canvas, not virtualized), `embed-block`
  (providers in `lib/embed-providers.ts`), `bookmark-block`, `code-block`.
- `inline/link-mention.tsx`, `inline/page-mention.tsx`, `paste-url-menu.tsx` (re-checks the pasted
  range still holds the URL before replacing).
- **code-block gotcha:** the line-number gutter is a sibling column, never
  inside the ProseMirror-managed `pre`. To get the base `{dom, contentDOM}`,
  call `render.call({ blockContentDOMAttributes: {}, renderType: "dom",
  props: undefined }, block, editor)`. A bare call drops `this` and throws.
- `file-drop-zone.tsx` + `lib/block-type-for-file.ts`: routes dropped files
  to block types; reused by the sidebar import drop zone.
  `lib/upload-file.ts` is BlockNote's `uploadFile`: `storeFile` → a
  `xeento-file://` URL.
- `lib/pdf.ts` loads the pdf.js worker from
  `${NEXT_PUBLIC_BASE_PATH}/pdf.worker.min.mjs`. Any other absolute
  public-asset path needs the same prefix or it breaks under `basePath`.

**Link preview:** `app/api/link-preview/route.server.ts` refuses
private/loopback IPs on every redirect, reads up to `</head>` (2MB cap),
6s timeout. `lib/link-preview.ts` fetches from `NEXT_PUBLIC_LINK_PREVIEW_URL`,
caches per session and never rejects. `linkPreviewsEnabled()` (URL
configured and the device setting `xeento:link-previews` not `"0"`)
gates every fetch, the paste prefetch, the Mention/Bookmark paste options
and `/bookmark`.

**Static export (`next.config.ts`):** `XEENTO_STATIC_EXPORT=1`
(`build:static`) sets `output: 'export'` and drops `cacheComponents` and
`partialPrefetching` (export rejects PPR). Route handlers are named
`route.server.ts`; only the server build lists `server.ts` in
`pageExtensions`, so the export leaves them out. A new route handler must
use that name too. `basePath` comes from `NEXT_PUBLIC_BASE_PATH`.

**Export (`src/lib/export/`)**
- `headless-editor.ts`: unmounted editor for Markdown conversion of pages
  that aren't open.
- `rewrite-file-refs.ts`: `xeento-file://` → `assets/…`; drops `data:` urls
  instead of inlining them.
- `resolve-page-refs.ts`: page mentions / sub-page cards → plain title
  text before Markdown conversion (their React render can't look titles
  up headlessly and would export as "…").
- `markdown-export.ts`: single `.md`, or a zip (folder per page + shared
  `assets/`); `exportWorkspaceAsZip`.
- **PDF:** `components/editor/printable-document.tsx` /
  `printable-page.tsx` render a hidden
  `print:block` copy; `window.print()` makes the PDF. Scroll containers
  carry `print:h-auto print:overflow-visible` or long pages get truncated.

**Import (`src/lib/import/`)**
- `import-core.ts`: shared engine with a `{ stripHexIds }` dialect. A
  `.md`/`.csv` owns a same-named sibling folder (Notion's shape); other
  folders become parent pages. Links go `xeento-pending-link://` →
  `xeento-page://` in a second pass.
- `zip-utils.ts`, `markdown-import.ts`, `notion-import.ts`: thin helpers
  and entry points.
- `use-import-flow.ts` + `components/import/import-progress-dialog.tsx`:
  progress and summary UI. `components/settings-menu.tsx`: import/export
  entry points.
- Fixture: `test-fixtures/notion-export-sample.zip` (from
  `scripts/generate-notion-fixture.mjs`).

**Styling:** `src/app/globals.css` holds color tokens (light/dark),
BlockNote theme overrides, code-block CSS and `@media print` rules.

---

## Known gaps

Flagged on purpose. Don't fix these unless asked.
- PDF viewer is lazy but not virtualized; slow on huge PDFs.
- Import link rewriting is regex-based, not a Markdown AST walk.

## Not yet built

See [ROADMAP.md](ROADMAP.md): static export, sync through the user's own
Firebase + Google Drive (Dexie stays the local store), Yjs page content,
databases, Tauri apps, bring-your-own-key AI. Build history is in
FEATURES.md's Changelog.

---

## Commands

```
npm run dev     # dev server (Turbopack), http://localhost:3000
npm run build   # production build, also type-checks
npm run build:static  # static export to out/ (no link preview route);
                      # NEXT_PUBLIC_BASE_PATH=/sub for a sub-path
npm run lint    # ESLint
```

CI (`.github/workflows/ci.yml`) runs lint, `build` and `build:static` on
every pull request.

---

## Keeping docs current

A task that adds, changes or removes behavior is **not done** until the docs
match, updated in the same turn.

- **FEATURES.md**, for any user-visible change: add or edit the feature
  entry under its area (Behavior, Test steps with expected results, Edge
  cases, one-line Code pointer). New features get the next ID in their area
  prefix. Add one line to the Changelog citing the ID. Update the shortcuts
  table or Known limitations if they changed.
- **CLAUDE.md**, only when something here goes stale: a new dependency (with
  license), a data-model change, a new module or gotcha a future session
  needs, or a changed project rule. Small fixes and CSS tweaks don't touch
  this file.
- Keep both concise. Describe current state, not history.

This is an instruction rather than a hook because deciding what counts as a
feature needs judgment. If docs start drifting, add a `Stop` hook reminder
or a CI check that flags `src/` changes without doc changes.