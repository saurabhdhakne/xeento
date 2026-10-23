# 04 — Milestone 3 (part 2): Export and import

**Goal:** your notes are never locked in. Export a page (or the whole
workspace) as Markdown or PDF, and import Markdown files or a Notion
export.

Features: IO-01 Markdown export · IO-02 PDF export · IO-03 workspace
export · IO-04 Markdown import · IO-05 Notion import · IO-06 round-trip and
errors

**Build order:**

```
1. Headless editor (convert without a mounted editor) → verify: console round-trip
2. Download helpers                                    → verify: a .md downloads
3. Single-page Markdown export (.md or .zip)           → verify: images in assets/
4. Workspace export                                    → verify: folders in zip
5. PDF export via print                                → verify: long page paginates
6. Import engine: zip walk, assets, links, CSV         → verify: Notion fixture
7. Entry points + progress dialog                      → verify: summary counts
```

---

## Step 1 — A headless editor for conversion

File: [`src/lib/export/headless-editor.ts`](../../src/lib/export/headless-editor.ts)

BlockNote's Markdown converters are **methods on an editor instance**. But
when exporting a page with sub-pages, those other pages aren't open. The
fix: create an editor that's never mounted to the DOM.

```ts
export function createHeadlessEditor() {
  return BlockNoteEditor.create({ schema: xeentoSchema });   // same schema!
}
export function blocksToMarkdown(blocks: unknown) {
  return createHeadlessEditor().blocksToMarkdownLossy(blocks as …);
}
export function markdownToBlocks(markdown: string) {
  return createHeadlessEditor().tryParseMarkdownToBlocks(markdown);
}
```

"Lossy" is honest: Markdown has no syntax for a PDF viewer, a colored
highlight or an embed. Custom blocks control their Markdown output through
`toExternalHTML` (BlockNote converts blocks → HTML → Markdown). That's why
embed and bookmark blocks render a plain `<a>` there.

---

## Step 2 — Download helpers

File: [`src/lib/download.ts`](../../src/lib/download.ts)

```ts
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Remove \ / : * ? " < > | (invalid on Windows/macOS), cap at 80 chars
export function sanitizeFileName(name: string) { … }

// "Notes", "Notes" → "Notes", "Notes (2)" (case-insensitive, records what it used)
export function dedupeName(name: string, used: Set<string>) { … }
```

`dedupeName` matters because two sibling pages can share a title, but two
files in one zip folder can't share a name (and on macOS/Windows, names
differing only by case also collide).

---

## Step 3 — Single-page Markdown export

Files: [`markdown-export.ts`](../../src/lib/export/markdown-export.ts),
[`rewrite-file-refs.ts`](../../src/lib/export/rewrite-file-refs.ts),
[`export-menu.tsx`](../../src/components/export-menu.tsx)

### 3a. Rewrite file references to relative paths

A block's `url` is `xeento-file://abc`, which means nothing outside Xeento.
Before converting, walk the blocks and rewrite each one:

```
xeento-file://abc  →  ../assets/abc-photo.png      (and remember to add the file)
data:image/png;…   →  ""                           (dropped)
https://…          →  unchanged
```

```ts
async function walkBlock(block) {
  const next = { ...block };                       // copy, never mutate stored content
  const fileId = parseFileUrl(next.props?.url);
  if (fileId) {
    const path = await resolvePath(fileId);        // "assets/<id>-<safe name>", cached
    if (path) next.props = { ...next.props, url: `${pathPrefix}${path}` };
  } else if (next.props?.url?.startsWith("data:")) {
    next.props = { ...next.props, url: "" };       // don't dump megabytes of base64
  }
  if (next.children) next.children = await Promise.all(next.children.map(walkBlock));
  return next;
}
```

- The asset name includes the file id so two files called `image.png` don't
  collide.
- **`pathPrefix`** fixes the relative path for the page's depth. A page at
  `Root/Child/Child.md` needs `../../assets/x.png` to reach the zip-root
  `assets/` folder. The prefix is `"../".repeat(depth + 1)`.

### 3b. The zip layout

```
My Page.zip
├── My Page/
│   ├── My Page.md
│   └── Sub page/
│       └── Sub page.md          ← links to ../../assets/…
└── assets/
    └── V1St…-diagram.png
```

One folder per page (mirrors the tree), one shared `assets/` folder at the
root. `addPageFolder` is recursive and is shared by single-page and
workspace export, so the depth math exists in one place.

### 3c. `.md` or `.zip`?

```ts
const probe = await pageMarkdown(page, "", titles);
if (children.length === 0 && probe.assets.length === 0) {
  downloadBlob(new Blob([probe.markdown], { type: "text/markdown;charset=utf-8" }), `${name}.md`);
  return;
}
// otherwise build the zip
```

**Why?** A simple text page should download as a simple `.md`. A zip is
only needed when there are files or sub-pages to bundle.

Each page's Markdown starts with `# <icon> <title>` (the title isn't part of
the block content, so it's added as a heading).

The "…" menu ([`export-menu.tsx`](../../src/components/export-menu.tsx))
has Markdown, PDF and an "Include sub-pages" checkbox. Errors show a toast
instead of failing silently.

(In Milestone 5 a `resolvePageRefs` step is added before conversion, to
turn page mentions into plain titles. See Chapter 07.)

---

## Step 4 — Workspace export

`exportWorkspaceAsZip()`:

1. For each folder (in order): a top-level zip folder named after it,
   containing each of its pages (with all sub-pages).
2. Then every unfoldered root page at the zip root.
3. Then all collected assets.
4. Download as `xeento-workspace-<YYYY-MM-DD>.zip`.

The folder and page names at the top level share one `dedupeName` set, so a
folder and a page with the same name don't collide.

Wired to Settings (gear icon) → "Export entire workspace".

---

## Step 5 — PDF export through the browser's print dialog

Files: [`editor/printable-document.tsx`](../../src/components/editor/printable-document.tsx),
[`editor/printable-page.tsx`](../../src/components/editor/printable-page.tsx),
print rules in [`globals.css`](../../src/app/globals.css)

**The decision:** don't generate PDFs in JavaScript. The options were
`@blocknote/xl-pdf-exporter` (GPL-or-proprietary license, so ruled out) or
`@react-pdf/renderer` (you'd have to re-implement the look of every block
in a second rendering system). Instead: render the page normally, and let
the browser print it. "Save as PDF" is in every browser's print dialog.

How it works:

1. Clicking "PDF" in the menu stores the ids to print in PageView state
   (`printPageIds`, the page plus descendants if "Include sub-pages").
2. PageView mounts `<PrintableDocument pageIds={…} onDone={…}>`.
3. PrintableDocument loads those pages, then renders each as a
   `PrintablePage`: a **read-only** BlockNote view
   (`editable={false}`, `theme="light"`) with the title on top, inside a
   wrapper with `hidden print:block`.
4. The live editable view has `print:hidden`. So on screen you see the
   normal page; on paper you see only the printable copy.
5. Once the pages have rendered, call `window.print()` in a
   `requestAnimationFrame` (so the DOM is committed first), then `onDone()`
   unmounts the printable copy.

```tsx
useEffect(() => {
  if (!pages) return;
  const frame = requestAnimationFrame(() => { window.print(); onDone(); });
  return () => cancelAnimationFrame(frame);
}, [pages]);
```

Print CSS (`@media print` in globals.css):

- hide the sidebar (`aside`), code-block toolbar and gutter
- white background, dark text
- `break-inside: avoid` for images, code, PDFs and files
- page margins via `@page`
- each page gets `break-after-page` so sub-pages start on a new sheet

**Big gotcha: long pages got cut off at one sheet.** The app's layout is
`h-screen overflow-hidden` with a scrolling `<main>`. When printing, the
browser prints the *box*, not the scrolled content. The fix is to undo
those on print: `print:h-auto print:overflow-visible` on every scroll
container (AppShell's wrapper and `<main>`).

**Why reuse BlockNote with `editable={false}`?** Every custom block (code
highlighting, PDFs, embeds) renders exactly as in the editor, with zero
extra code.

---

## Step 6 — The import engine

Files: [`src/lib/import/import-core.ts`](../../src/lib/import/import-core.ts),
[`zip-utils.ts`](../../src/lib/import/zip-utils.ts),
[`markdown-import.ts`](../../src/lib/import/markdown-import.ts),
[`notion-import.ts`](../../src/lib/import/notion-import.ts)

Markdown-zip import and Notion import are **the same engine** with one
"dialect" switch:

```ts
interface ImportDialect { stripHexIds: boolean }   // true for Notion
```

### 6a. What a Notion export looks like

```
Export-abc.zip
├── Projects 1a2b…(32 hex).md
├── Projects 1a2b….csv?               (a database)
└── Projects 1a2b…/                   ← SAME name as the .md = its children
    ├── Roadmap 3c4d….md
    └── image.png
```

Notion appends a 32-character hex id to every name, and a page's children
live in a folder with the same name as the page's `.md`.

### 6b. Opening the zip

`loadZip` uses JSZip and **unwraps one level** if the zip contains only
another zip (Notion sometimes double-wraps its export). `listFiles` returns
every non-directory path.

### 6c. Walking directories → pages

`importDirectory(ctx, dirPath, parentId, folderId)`:

```
for each FILE directly in dirPath:
  .md  → create a page (title from front-matter, else filename)
  .csv → create a page with a table
  supported attachment (png, pdf, mp4…) → skip here (imported when linked)
  anything else → record "Unsupported file type" in skipped
  if a sibling FOLDER has the same name (minus extension):
      that folder "belongs" to this page → recurse into it with parentId = new page

for each FOLDER not owned by a file:
  create an empty "group" page with the folder's name, recurse into it
```

**Why turn plain folders into pages?** Xeento folders can't nest. The only
way to represent `a/b/c` is page nesting.

Everything lands in **a brand-new folder** (`Imported from Notion –
2026-10-23` or `Imported – <date>`). **Why?** An import never mixes into
your existing pages, and if it went wrong you delete one folder.

`placeNewPage` moves a newly created root page into that folder using
`movePageToPosition(…, Number.MAX_SAFE_INTEGER, folderId)` (end of the
folder).

`displayTitle` strips Notion's ` <32 hex>` suffix from the title shown to
the user, but the **raw path** is still used to match files and links.

### 6d. Inside one Markdown file

```ts
const parsed = matter(raw);                         // gray-matter: front-matter → data, rest → content
const title = parsed.data.title ?? filenameTitle;
const tags = Array.isArray(parsed.data.tags) ? parsed.data.tags.filter(isString) : [];
const { markdown } = await rewriteMarkdownLinks(ctx, filePath, parsed.content);
const blocks = markdownToBlocks(markdown);          // headless editor
const page = await createPage(parentId, title);
await setPageContent(page.id, blocks);
```

`rewriteMarkdownLinks` finds every `[text](target)` / `![alt](target)`
with a regex and, for targets that resolve to a file **in the zip**:

| Target | Becomes |
|---|---|
| `http(s)://`, `mailto:`, `#anchor` | unchanged |
| another `.md` in the zip | `xeento-pending-link://<encoded path>` |
| an image/attachment in the zip | stored with `storeFile` → `xeento-file://<id>` |
| not found in the zip | unchanged |

`resolveRelativePath(fromFile, "../img/a.png")` resolves the link against
the linking file's folder (handling `..`, `.` and URL-encoded spaces).

A small `replaceAsync` helper runs an async function for each regex match
(the built-in `String.replace` can't await).

### 6e. Two-pass link fixing

**Problem:** page A links to page B, but B hasn't been created yet when A
is imported, so B has no id.

**Solution:** in pass 1, write a placeholder
`xeento-pending-link://<path of B.md>` and record `path → pageId` for every
page created. After everything is imported, pass 2 walks each imported
page's blocks and rewrites each pending link:

- target found → `xeento-page://<id>` (a real internal link)
- not found → unwrap the link, keep its text

`xeento-page://` links are opened by a single click listener in AppShell:

```ts
document.addEventListener("click", (e) => {
  const anchor = e.target.closest("a[href^='xeento-page://']");
  if (!anchor) return;
  e.preventDefault();
  openPageRef.current(anchor.getAttribute("href").slice("xeento-page://".length));
});
```

(`openPageRef` holds the latest `openPage`; see the stale-closure pattern
in Chapter 05.) Milestone 5 reuses this listener for page mentions,
sub-page cards and backlinks.

### 6f. CSV → table page

```ts
const rows = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true }).data;
setPageContent(page.id, [
  { type: "paragraph", content: "⚠️ Imported from a Notion database as a plain table … TODO" },
  { type: "table", content: { type: "tableContent", headerRows: 1,
      rows: rows.map((row) => ({ cells: row })) } },
]);
```

Databases with views and properties aren't supported yet, so the note tells
the user what was lost.

### 6g. Never crash: collect a summary

Each file is imported inside `try/catch`. Failures go into
`summary.skipped` with a reason; the import continues. The result:

```ts
{ pagesCreated: number; filesImported: number; skipped: { path, reason }[] }
```

### 6h. Loose `.md` files

`importMarkdownFiles(files)`:

- a `.zip` among them → zip import
- one `.md` → a page at the root
- several `.md` → a new dated folder, one page each

---

## Step 7 — Entry points and the progress dialog

Files: [`use-import-flow.ts`](../../src/lib/import/use-import-flow.ts),
[`import/import-progress-dialog.tsx`](../../src/components/import/import-progress-dialog.tsx),
[`settings-menu.tsx`](../../src/components/settings-menu.tsx)

`useImportFlow()` holds `progress` and `summary` state and exposes
`run(importFn)`:

```ts
async function run(importFn) {
  setProgress({ processed: 0, total: 0, currentPath: "" });
  try {
    const result = await importFn((processed, total, currentPath) =>
      setProgress({ processed, total, currentPath }));
    setSummary(result);
  } catch {
    toast.error("Import failed — the file may be corrupt or in an unexpected format.");
    setProgress(null);
  }
}
```

Every importer accepts an `onProgress(processed, total, path)` callback, so
the dialog shows a progress bar and the current file, then switches to a
summary with the skipped list.

Two places start imports, each with its own `useImportFlow`:

- **Settings menu**: hidden `<input type="file">` elements, clicked from
  menu buttons. Reset `e.target.value = ""` after reading, otherwise
  picking the same file twice doesn't fire `onChange`.
- **Sidebar drop zone**: `FileDropZone` around the sidebar, accepting
  `.md`/`.zip`.

A fixture lives at `test-fixtures/notion-export-sample.zip`, generated by
[`scripts/generate-notion-fixture.mjs`](../../scripts/generate-notion-fixture.mjs).
Build a fixture like this early; it makes testing import a one-click job.

---

## Checkpoint (Milestone 3, part 2)

- [ ] Export a text-only page → a `.md` opens correctly in any editor.
- [ ] Export a page with an image and sub-pages → `.zip`, images show in a
      Markdown viewer (relative paths right at every depth).
- [ ] Export as PDF → print preview shows every sheet of a long page, no
      sidebar or toolbar; code is highlighted.
- [ ] Workspace export → zip contains all folders, pages and assets.
- [ ] Import a `.md` with front-matter → title and tags set.
- [ ] Import the Notion fixture → dated folder, no hex ids, correct
      nesting, image shows, CSV is a table, cross-page link opens the page.
- [ ] Import a corrupted zip → error toast, app still works.

## Gotchas from this milestone

- Using a different schema in the headless editor → custom blocks vanish
  from exports.
- Mutating stored content while rewriting refs → corrupts the live page.
  Always copy (`{ ...block }`).
- Wrong `../` depth → broken images only in nested pages.
- Inlining `data:` URLs → huge Markdown files.
- Printing a fixed-height scroll container → only one sheet prints.
- Resolving page links in one pass → forward links break.
- Not resetting a file input's value → re-selecting the same file does
  nothing.
