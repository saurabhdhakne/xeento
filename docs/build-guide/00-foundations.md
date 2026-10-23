# 00 — Foundations

Read this before any milestone. These ideas come up in every chapter.

---

## 1. The architecture in one picture

```
 ┌────────────────────────── Browser ───────────────────────────┐
 │                                                              │
 │   React components (src/components/)                         │
 │      │  write: call a function           ▲  read: hooks      │
 │      ▼                                   │  re-render        │
 │   src/lib/pages.ts, folders.ts,      src/lib/use-*.ts        │
 │   files.ts, trash.ts, backup.ts      (useLiveQuery)          │
 │      │                                   ▲                   │
 │      ▼                                   │  "data changed"   │
 │   ┌──────────────── Dexie → IndexedDB ──────────────┐        │
 │   │  pages   folders   files   trash                │        │
 │   └─────────────────────────────────────────────────┘        │
 └──────────────────────────────────────────────────────────────┘
                 Only server code: /api/link-preview
```

The loop is always the same:

1. The user does something (types a title, drags a page).
2. The component calls a plain async function, e.g. `renamePage(id, title)`.
3. That function writes to IndexedDB through Dexie.
4. Dexie notices the write and tells every `useLiveQuery` hook that read
   that table.
5. Those hooks return new data, and React re-renders.

**There is no Redux, Zustand or React Context for data.** The database *is*
the state. This is the most important idea in the app. It means:

- You never have to "update the store" after saving. Save, and the UI follows.
- Two parts of the UI showing the same page (sidebar row + page title) can't
  drift apart, because both read the same database row.

The only React state is UI state: which page is selected, which tree nodes
are expanded, whether a dialog is open.

### The storage boundary rule

Components **never** import `db.ts` or Dexie. They only import:

- write functions from `src/lib/pages.ts`, `folders.ts`, `files.ts`,
  `trash.ts`, `backup.ts`
- read hooks from `src/lib/use-pages.ts`, `use-folders.ts`, `use-files.ts`,
  `use-trash.ts`

**Why:** Dexie is a placeholder. The plan is to replace it with Supabase (or
another backend) later. If only `src/lib/` knows about Dexie, swapping it out
means rewriting those few files, not every component.

---

## 2. Why the whole app is client-side

IndexedDB only exists in the browser. A Next.js Server Component runs on the
server, where there is no IndexedDB. So:

- [`src/app/page.tsx`](../../src/app/page.tsx) is a tiny server component
  that renders `<AppShell />`.
- [`src/components/app-shell.tsx`](../../src/components/app-shell.tsx) starts
  with `"use client"`, and so does basically every component under it.

There is no routing per page (no `/p/[id]`). Which page is open is just a
`selectedId` in React state, saved to `localStorage` so a reload reopens it.

---

## 3. IndexedDB and Dexie in 5 minutes

IndexedDB is a database built into every browser. It stores JavaScript
objects (including `Blob`s, i.e. file bytes) in "object stores" (tables).
Its raw API is painful, so we use **Dexie**, a thin wrapper.

```ts
// src/lib/db.ts (shape)
export const db = new Dexie("xeento") as Dexie & {
  pages: EntityTable<PageRecord, "id">;
};

db.version(1).stores({
  pages: "id, parentId, order, updatedAt",   // primary key first, then indexes
});
```

Things to know:

- **The string lists indexes, not columns.** You can store any field on a
  record; only the listed ones can be used in `where(...)` or `orderBy(...)`.
- **Booleans can't be indexed** in IndexedDB. That's why `favourite` is never
  in the index list. To find favourites we load all pages and filter in JS
  (fine for thousands of pages).
- **Versions are migrations.** To add a table or index, you add
  `db.version(N + 1)`. You must **never edit or delete an old version**:
  users' browsers already ran it, and Dexie uses the history to migrate
  their data forward. `.upgrade(tx => …)` lets you fill in new fields on old
  records (see Chapter 02).
- **Transactions**: `db.transaction("rw", db.pages, db.trash, async () => …)`
  makes several writes all-or-nothing. **Gotcha:** an IndexedDB transaction
  auto-commits as soon as your code `await`s something that isn't a database
  call (like `fetch` or unzipping). So read/compute everything first, then
  open the transaction (Chapter 06 hits this).

Useful calls you'll see everywhere:

```ts
await db.pages.add(page);                  // insert
await db.pages.update(id, { title });      // partial update
await db.pages.get(id);                    // one by primary key
await db.pages.where("parentId").equals(x).toArray();
await db.pages.bulkAdd([...]); await db.pages.bulkDelete([...]);
```

**Debugging tip:** Chrome DevTools → Application → IndexedDB → `xeento`
shows every table. You can edit rows there (handy for testing Trash expiry).

---

## 4. Live queries (`useLiveQuery`)

From `dexie-react-hooks`:

```ts
// src/lib/use-pages.ts
export function useAllPages() {
  return useLiveQuery(() => db.pages.toArray(), []);
}
export function usePage(id: string | null) {
  return useLiveQuery(() => (id ? db.pages.get(id) : undefined), [id]);
}
```

- It runs the query, returns the result, and **re-runs it whenever any table
  it read from changes**.
- It returns `undefined` **while loading** (the first render). Always handle
  that: `const loading = pages === undefined`.
- The second argument is a dependency list, like `useEffect`.

There's one subtle variant, `usePageOrNull`, added in Milestone 5:

```ts
// undefined = still loading, null = looked and it's not there (deleted/in Trash)
export function usePageOrNull(id: string) {
  return useLiveQuery(async () => (await db.pages.get(id)) ?? null, [id]);
}
```

**Why:** a page mention chip needs to tell "loading…" apart from "this page
was deleted". With plain `usePage`, both are `undefined`.

---

## 5. BlockNote's document model

BlockNote is the editor (built on ProseMirror/TipTap). A document is a
**JSON array of blocks**:

```json
[
  { "id": "a1", "type": "heading", "props": { "level": 1 },
    "content": [{ "type": "text", "text": "Hello", "styles": {} }],
    "children": [] },
  { "id": "b2", "type": "paragraph", "props": {},
    "content": [
      { "type": "text", "text": "See ", "styles": {} },
      { "type": "link", "href": "https://x.com", "content": [ … ] }
    ],
    "children": [] },
  { "id": "c3", "type": "image", "props": { "url": "xeento-file://Xyz" },
    "content": undefined, "children": [] }
]
```

- **Block**: `type`, `props` (settings like heading level or url), `content`
  (inline text, or none for things like images), `children` (nested blocks,
  e.g. indented list items).
- **Inline content**: text runs, links, and custom inline things (our page
  mentions and link mentions).
- We store this array as-is in `PageRecord.content`. No conversion.

Key APIs you'll use:

| API | What it does |
|---|---|
| `useCreateBlockNote({ schema, initialContent, … })` | Create an editor instance (React hook) |
| `<BlockNoteView editor={editor} />` | Render it |
| `editor.document` | Current blocks (what we save) |
| `editor.insertBlocks / updateBlock / replaceBlocks` | Edit programmatically |
| `editor.insertInlineContent([...])` | Insert inline nodes at the cursor |
| `createReactBlockSpec(config, { render })` | Define a custom block |
| `createReactInlineContentSpec(config, { render })` | Define custom inline content |
| `BlockNoteSchema.create({ blockSpecs, inlineContentSpecs })` | The schema: which blocks exist |
| `editor.blocksToMarkdownLossy` / `tryParseMarkdownToBlocks` | Markdown export/import |

**One schema rule:** every custom block lives in
[`src/components/editor/schema.ts`](../../src/components/editor/schema.ts),
and the live editor, the export code and the print layout all use that same
schema. If they didn't, a block would render in the editor but vanish in
exports.

**BlockNote changes fast.** Before writing code against it, check the
installed version's types in `node_modules/@blocknote/*` or existing usage in
this repo. The repo uses `^0.56.0`.

---

## 6. Trees from a flat list

Pages nest to any depth, but there is **no tree table**. Each page stores
`parentId`. Top-level pages have `parentId: "root"` (`ROOT_ID`).

To show the tree, load all pages and build it in memory:

```ts
function buildChildren(all: PageRecord[], parentId: string): PageTreeNode[] {
  return all
    .filter((p) => p.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ ...p, children: buildChildren(all, p.id) }));
}
```

To find every descendant (for delete, duplicate, move checks), walk
breadth-first with a queue:

```ts
// src/lib/pages.ts
const result = []; const queue = [id];
while (queue.length) {
  const current = queue.shift();
  const children = await db.pages.where("parentId").equals(current).toArray();
  for (const child of children) { result.push(child.id); queue.push(child.id); }
}
```

**Why flat + parentId:** moving a page (and its whole subtree) is a single
update: change one `parentId`. A nested-JSON tree would need you to cut and
paste subtrees.

---

## 7. Sparse ordering

Siblings are sorted by an `order` number. New pages get
`lastSibling.order + 1024` (`ORDER_STEP`).

**Why 1024 and not 1, 2, 3?** Leaving gaps means you *could* insert between
two items with one write (`(a + b) / 2`). In practice, Xeento keeps it simple:
whenever it reorders, it **renumbers the whole sibling list** to
`1024, 2048, 3072…` and only writes the rows whose number actually changed.
Sibling lists are short, so that's cheap and never runs out of gaps.

You'll see this "splice into array, then renumber" pattern in
`movePageToPosition`, `reorderFavourites`, `reorderFolders` and
`duplicatePage`.

---

## 8. Custom URL schemes (a trick used three times)

Xeento stores special "fake URLs" inside block content:

| Scheme | Means | Turned into a real thing by |
|---|---|---|
| `xeento-file://<fileId>` | A file stored in the `files` table | BlockNote's `resolveFileUrl` → object URL (Ch. 03) |
| `xeento-page://<pageId>` | A link to another Xeento page | One global click listener → `openPage(id)` (Ch. 04, 07) |
| `xeento-pending-link://<path>` | Import-time placeholder | Second import pass → `xeento-page://` (Ch. 04) |

**Why:** the content JSON stays portable and stable. A block says *what* it
points at (an id), not *how* to show it right now (a blob URL that dies on
reload). The translation happens at the edge, at render or click time.

---

## 9. Styling: Tailwind v4 with color tokens

[`src/app/globals.css`](../../src/app/globals.css):

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));   /* `dark:` = inside .dark */

:root { --background: #ffffff; --foreground: #1f1e1c; --accent: #5b4fe0; … }
.dark { --background: #121212; --foreground: #ecebe8; --accent: #8b7fff; … }

@theme inline {
  --color-background: var(--background);   /* creates bg-background, text-… */
  --color-accent: var(--accent);
  …
}
```

- Colors are CSS variables, swapped by the `.dark` class on `<html>`.
- `@theme inline` turns them into Tailwind classes (`bg-background`,
  `text-muted`, `border-border`, `bg-accent-soft`).
- So components write `bg-background` once and get both themes for free.
- BlockNote's editor has its own variables (`--bn-colors-…`); `.bn-container`
  maps them to ours so the editor matches.

Tailwind v4 has no `tailwind.config.js`; config lives in CSS. It's wired to
Turbopack in [`next.config.ts`](../../next.config.ts).

---

## 10. Setting up the project

```bash
npx create-next-app@latest xeento --typescript --tailwind --eslint --app --src-dir
cd xeento
```

Make sure `tsconfig.json` has the alias `"@/*": ["./src/*"]`.

Dependencies, roughly in the order you'll need them:

| When | Package | Why | License |
|---|---|---|---|
| M1 | `dexie`, `dexie-react-hooks` | IndexedDB + live queries | Apache-2.0 |
| M1 | `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine` | Editor | MPL-2.0 |
| M1 | `nanoid` | Short random ids | MIT |
| M1 | `next-themes` | Dark mode with no flash | MIT |
| M1 | `emoji-picker-react` | Page icons | MIT |
| M1 | `lucide-react` | Icons | ISC |
| M1 | `@dnd-kit/core`, `@dnd-kit/utilities` | Sidebar drag and drop | MIT |
| M2 | `@dnd-kit/sortable` | Favourites reordering | MIT |
| M3 | `@blocknote/code-block` | Shiki code highlighting | MPL-2.0 |
| M3 | `pdfjs-dist` | PDF viewer | Apache-2.0 |
| M3 | `jszip` | Zip export/import/backup | MIT (dual) |
| M3 | `gray-matter` | Markdown front-matter | MIT |
| M3 | `papaparse` | CSV parsing | MIT |

**Deliberately not used:** `@blocknote/xl-*` packages (PDF/DOCX exporters,
multi-column). They're "GPL or proprietary", which this project avoids.

Rule of thumb from the project: prefer what BlockNote, Dexie or the browser
already give you → then your own small code → and only then a new
dependency.

### Folder layout you'll end up with

```
src/
  app/                 layout.tsx, page.tsx, globals.css, api/link-preview/
  components/
    app-shell.tsx      top-level state + global shortcuts
    page-view.tsx      one open page (title, icon, tags, editor)
    sidebar/           all sidebar sections and rows
    editor/            BlockNote wrapper, schema, custom blocks, inline content
    search/            command palette
    ui/                popover, context menu, toast (tiny primitives)
  lib/
    db.ts              the ONLY file that defines the database
    pages.ts folders.ts files.ts trash.ts backup.ts   writes
    use-*.ts           live-query read hooks
    export/ import/    Markdown/zip/PDF in and out
scripts/               postinstall: copy the pdf.js worker
```

---

## 11. How to verify (no test suite)

The project deliberately has no automated tests. "Done" means:

1. `npm run lint` passes
2. `npm run build` passes (this is where type errors show up)
3. The FEATURES.md test steps for that feature pass in the browser

Each chapter ends with a checkpoint built from those test steps.
