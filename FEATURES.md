# Xeento — Features & Test Guide

What Xeento does today, and how to verify each feature still works.

- **Before building:** search this file; the feature may already exist.
- **After changing behavior:** update the feature's entry and add a
  Changelog line (rules in CLAUDE.md → "Keeping docs current").
- Architecture and implementation detail live in CLAUDE.md, not here.

Each feature has an ID (`SB-03`), its current **Behavior**, numbered
**Test** steps ending in `→ expected result`, and a one-line **Code**
pointer.

---

## Test prerequisites

- Dev server running: `npm run dev` → http://localhost:3000
- `test-fixtures/notion-export-sample.zip` (for IO-05)
- A file over 25MB and one over 100MB (for ED-02)
- Sample `.pdf`, `.mp4`, `.mp3` and one other file type (for ED-02)
- A `.md` file with YAML front-matter (`title`, `tags`) (for IO-04)
- DevTools → Application → IndexedDB → `xeento` (for DS-02, DS-03)

---

## Quick smoke test (~5 min)

Run after any change. If something fails, run that area's full tests.

1. Create a page, give it a title, icon and some text; reload → everything
   is still there.
2. Create a sub-page and drag it to reorder → tree updates.
3. Create a folder and drag a page into it → page moves into the folder.
4. Star a page → it appears in Favourites.
5. Cmd/Ctrl+K, search a word from step 1 → the page is found and opens.
6. Type `/code`, write a line → highlighted code block.
7. Paste `https://github.com/vercel/next.js` → "Paste as" menu appears;
   pick Bookmark → preview card.
8. Drop a `.pdf` onto the page → inline PDF viewer.
9. Page "…" → Export → Markdown → a `.md` (or `.zip`) downloads.
10. Toggle dark mode → whole app, including the editor, restyles.
11. Delete a page, open Trash, restore it → it's back with its content.

---

## Sidebar

### SB-01 Page tree

**Behavior:** Create, rename and delete pages. Pages nest to any depth.
Drag a row to reorder siblings, or onto another page to nest it. Deleting
a page moves it and all its sub-pages to Trash (DS-02), with no confirm
and a "Moved to Trash" toast. The Pages section shows pages not
in any folder. New page button sits in the sidebar header next to Search.

**Test:**
1. Create a page from the sidebar header, rename it → title updates in the
   sidebar and page view.
2. Create a child page under it → appears nested under the parent.
3. Drag pages up/down → reorders; drag right onto another page → nests.
4. Delete a page that has children → the page and all descendants leave
   the tree; Trash lists one entry for them.
5. Reload → tree is identical.

**Code:** `src/lib/pages.ts`, `src/components/sidebar/pages-tree.tsx`

### SB-02 Row interaction and drag

**Behavior:** Page rows (Pages, folder contents, Favourites) and folder
rows drag from anywhere on the row; there's no grip icon. A 4px move
threshold keeps click (open), double-click (rename) and row buttons
working. Dragging inside a rename input selects text. Nothing inside the
emoji picker or right-click menu starts a drag. Pages without a custom
emoji show a monochrome `FileText` icon in every section. Long titles
truncate with an ellipsis.

**Test:**
1. Press anywhere on a page row (title, icon, empty space) and drag onto a
   folder → page moves into the folder.
2. Click a row → page opens. Double-click → rename mode.
3. While renaming, click-drag inside the input → text selects, row doesn't
   move.
4. Open the icon picker on a row and drag its scrollbar → no row drag.
5. A page with no custom icon → same plain document icon in Pages,
   Favourites and Recent.

**Code:** `src/lib/dnd-utils.ts` (`rowDragListeners`),
`src/components/sidebar/page-tree-row.tsx`

### SB-03 Folders

**Behavior:** Create with "+", rename by double-click, collapse (persists
across reload), drag to reorder. Drag pages into and out of folders.
Folders don't nest. Delete offers three choices: cancel, move pages to
Pages, or delete pages too (each page goes to Trash with its sub-pages).

**Test:**
1. Create a folder, drag a page into it → page appears inside.
2. Rename the folder by double-clicking → name updates.
3. Collapse it, reload → still collapsed.
4. Drag a folder row by its name → folders reorder.
5. Delete a folder, choose "move pages to Pages" → pages reappear in Pages.
6. Delete another, choose "delete pages too" → folder and its pages
   (including sub-pages) are gone; Trash has one entry per page.

**Code:** `src/lib/folders.ts`, `src/components/sidebar/folders-section.tsx`

### SB-04 Favourites

**Behavior:** Flat list of starred pages with its own order (separate
from the page tree). Drag to reorder. Pages enter and leave only via the
star (page toolbar or a row's hover actions); changes show instantly.

**Test:**
1. Star a page from the page view → appears in Favourites immediately.
2. Star a page from a sidebar row's hover actions → appears immediately.
3. Unstar one → disappears immediately.
4. Drag a Favourites row by its title → reorders within Favourites only.

**Code:** `src/components/sidebar/favourites-section.tsx`

### SB-05 Recent

**Behavior:** The last 8 opened pages, newest first. Order and membership
are fixed at app load and only update on the next reload, so opening pages
mid-session doesn't reshuffle the list (each row's title, icon and star
still update live). Rows have the same actions as other sections (rename,
icon, star, "+" sub-page, delete, right-click menu) but can't be dragged
and have no expand chevron.

**Test:**
1. Open several pages, reload → Recent lists them newest first.
2. Open A, then B, then C → Recent doesn't reorder mid-session.
3. Reload → C first (the page left open), then B, then A.
4. Hover a Recent row → star, "+" and trash appear; dragging does nothing.
5. Double-click a Recent row's title and rename → Pages shows the new title.
6. Click "+" on a Recent row → a sub-page is created under it and opens.
7. Click trash on a Recent row → "Moved to Trash" toast; the page and its
   sub-pages disappear from Recent and Pages.

**Code:** `src/components/sidebar/recent-section.tsx`,
`src/components/app-shell.tsx` (`recentIds`)

### SB-06 Right-click menu: Duplicate

**Behavior:** Right-clicking any page row (Pages, folders, Favourites,
Recent) opens a context menu with **Duplicate**. It copies the page and its
whole sub-page tree into the slot right below the original (same parent,
same folder). The top copy is titled "<title> (copy)"; sub-pages keep
their titles. Icon, tags and content are copied. The copy starts
un-favourited, absent from Recent, and is not opened. Uploaded files are
shared, not re-stored.

**Test:**
1. Right-click a page row → menu with "Duplicate" at the cursor (no
   browser menu). Esc, scroll or clicking elsewhere → menu closes.
2. Click Duplicate → "<title> (copy)" right under the original, same icon,
   tags and content.
3. Duplicate a page with sub-pages, expand the copy → sub-pages present;
   editing one doesn't change the original.
4. Duplicate a page inside a folder → copy stays in that folder.
5. Duplicate from the Favourites section → copy appears in Pages/its
   folder, not in Favourites.
6. Duplicate from a Recent row → copy appears under the original in Pages,
   not in Recent.
7. Right-click a row near the bottom/right window edge → menu stays fully
   on screen.

**Code:** `src/components/ui/context-menu.tsx`, `src/lib/pages.ts`
(`duplicatePage`)

### SB-07 Collapse and resize

**Behavior:** Collapse with the header button or Cmd/Ctrl+\\. While
collapsed, a fixed "open sidebar" button shows top-left and stays visible
when scrolling. Drag the right edge to resize (220–480px). Collapsed state
and width persist across reload. Each sidebar section (Favourites, Recent,
Folders, Pages) collapses independently.

**Test:**
1. Collapse via the button, reopen via the floating button → works.
2. Collapse/reopen with Cmd/Ctrl+\\ → works.
3. Reload → collapsed/open state is kept.
4. Collapse the sidebar and scroll a long page → open-sidebar button stays
   visible top-left.
5. Drag the right edge → cursor changes to resize, width stays within
   220–480px; reload → width kept.

**Code:** `src/components/sidebar/sidebar.tsx`,
`src/lib/use-local-storage-flag.ts`

---

## Page view

### PG-01 Title and icon

**Behavior:** Editable title that wraps onto multiple lines but behaves as
one line (Enter adds nothing, pasted newlines become spaces). Emoji icon
picker; with no emoji, the placeholder is the `FileText` icon.

**Test:**
1. Rename a page and pick an emoji → both update in the sidebar.
2. Open a page with no custom icon → picker shows the plain document icon,
   not a smiley.
3. Type a title longer than the page width → wraps; tags and editor move
   down, nothing is cut off.
4. Press Enter in the title → no new line. Paste text with line breaks →
   one line with spaces.
5. Resize the window or drag the sidebar edge → title re-wraps; delete
   text → height shrinks back.
6. The sidebar row for that page → one truncated line.

**Code:** `src/components/page-view.tsx` (`TitleField`)

### PG-02 Autosave

**Behavior:** Every edit to content, title and icon saves to IndexedDB
(content is debounced 400ms and flushed when switching pages).

**Test:**
1. Edit content, title and icon, then reload → all changes kept.
2. Type, then immediately switch to another page and back → last edit kept.

**Code:** `src/components/editor/block-editor.tsx`

### PG-03 Tags

**Behavior:** Add/remove chip editor under the title. Tags are searchable
via the command palette's tag filter (SR-01).

**Test:**
1. Add tags to a page → chips appear.
2. Remove one → chip disappears; reload → still removed.
3. Cmd/Ctrl+K, filter by a remaining tag → the page is listed.

**Code:** `src/components/page-view.tsx`, `src/lib/pages.ts` (`setPageTags`)

### PG-04 Page toolbar

**Behavior:** A full-width row above the title holds the favourite star
(outlined/filled `#FACC15`) and the "…" menu (export, see IO-01/IO-02).
The row is sticky: it stays at the top while the page scrolls, with
content scrolling underneath. Hidden in print/PDF.

**Test:**
1. Open a page → star and "…" sit in their own row above the title,
   spanning the content width.
2. Scroll a long page → toolbar stays at the top, content passes under it
   with no see-through.
3. Export as PDF → toolbar doesn't appear.

**Code:** `src/components/page-view.tsx`

### PG-05 Copy and paste a page (keyboard)

**Behavior:** With a page open and nothing being typed (focus not in the
editor, title, tag input or search, no text selected), Cmd/Ctrl+C copies
the open page and shows a toast. Cmd/Ctrl+V pastes a full copy ("<title>
(copy)" with all sub-pages) right after whichever page is open, at the
same level and in the same folder, and opens it. Paste repeatedly for more
copies. Inside inputs, the keys do normal text copy/paste. The page
clipboard is in-app only and lasts until reload. macOS uses Cmd;
Windows/Linux use Ctrl.

**Test:**
1. Click page A in the sidebar, press Cmd/Ctrl+C → "Page copied" toast.
2. Press Cmd/Ctrl+V → "A (copy)" appears right after A and opens.
3. Copy A, click page B inside a folder, paste → copy lands after B in that
   folder.
4. Click a nested sub-page and paste → copy lands next to it at that level.
5. Copy a page with sub-pages, paste after one of its own sub-pages → the
   copy appears once, no runaway copies.
6. In the editor, select text, Cmd/Ctrl+C then Cmd/Ctrl+V → normal text
   copy/paste, no toast.
7. Windows: Ctrl+C/V works. macOS: Ctrl+C does nothing, Cmd+C works.
8. Copy a page, delete it, paste → "The copied page no longer exists"
   error.

**Code:** `src/components/app-shell.tsx`, `src/lib/pages.ts`
(`duplicatePage`)

---

## Editor and blocks

### ED-01 Block editor basics

**Behavior:** BlockNote editor with slash menu (including custom blocks:
`/pdf`, `/embed`, `/bookmark`, `/file`, `/code`), drag handles and
markdown shortcuts.

**Test:**
1. Type `/` → slash menu lists default and custom blocks.
2. Type `# ` → heading; `- ` → bullet list.
3. Drag a block by its handle → block moves.

**Code:** `src/components/editor/block-editor.tsx`,
`src/components/editor/schema.ts`

### ED-02 File drop and storage

**Behavior:** Dragging a file over a page shows a "drop files here"
overlay. Dropped files become the matching block: image, video
(`.mp4`/`.webm`), audio (`.mp3`/`.wav`), PDF, or File block for anything
else. Uploads are stored as blobs in IndexedDB; hosted URLs work the same
way. Over 25MB shows a warning toast; over 100MB is rejected.

**Test:**
1. Drag a file over a page → overlay appears.
2. Drop a `.pdf`, `.mp4`, `.mp3` and another file type → each becomes the
   right block (PDF, video, audio, File).
3. Reload → all blocks still display their files.
4. Upload a 30MB+ file → warning toast, file is stored.
5. Upload a 100MB+ file → error toast, file rejected.

**Code:** `src/components/editor/file-drop-zone.tsx`,
`src/lib/block-type-for-file.ts`, `src/lib/files.ts`

### ED-03 File block

**Behavior:** `/file` or drop a non-media file. Shows icon, name and size,
with BlockNote's rename/caption/replace/delete/download toolbar.

**Test:**
1. Drop a `.zip` or `.docx` → block shows icon, name and size.
2. Use rename, caption and download from its toolbar → each works.

**Code:** `src/components/editor/blocks/file-block.tsx`

### ED-04 PDF block

**Behavior:** `/pdf` or drop a `.pdf`. Inline canvas viewer, pages load
lazily as you scroll, height resizes by dragging the bottom handle
(persists), plus "open full screen" and "download".

**Test:**
1. Scroll through pages → each renders as it comes into view.
2. Drag the bottom handle → height changes; reload → height kept.
3. Click "open full screen" → opens full screen.
4. Click "download" → file downloads.

**Code:** `src/components/editor/blocks/pdf-block.tsx`, `pdf-viewer.tsx`

### ED-05 Video and audio blocks

**Behavior:** Native players for `.mp4`/`.webm`/`.mp3`/`.wav`, from local
uploads or hosted URLs.

**Test:**
1. Drop an `.mp4` → video plays.
2. Drop an `.mp3` → audio plays.

**Code:** BlockNote defaults via `src/components/editor/schema.ts`

### ED-06 Code block

**Behavior:** `/code` or ` ``` `. Language dropdown (JS, TS, Python, JSON,
HTML, CSS, SQL, Bash, Java, Go, Rust, Markdown and more), Shiki
highlighting that follows light/dark mode, copy button, line-number
toggle, Tab inserts an indent. The text-selection toolbar's block-type
dropdown includes "Code block", converting selected blocks (each selected
block becomes its own code block; formatting like bold and links is
dropped) and back to paragraph.

**Test:**
1. `/code`, switch between a few languages → highlighting changes.
2. Toggle line numbers → gutter shows/hides.
3. Click copy → code is on the clipboard.
4. Press Tab → indent inserted (focus stays in the block).
5. Toggle dark mode → highlighting theme switches.
6. Select text in a paragraph → dropdown lists "Code block"; pick it →
   paragraph becomes a highlighted code block.
7. Convert a paragraph with bold text → text kept, bold removed.
8. Select text inside a code block → dropdown shows "Code block"; pick
   "Paragraph" → turns back.

**Code:** `src/components/editor/blocks/code-block.tsx`,
`src/components/editor/block-editor.tsx`

### ED-07 Embed block

**Behavior:** `/embed` or paste a link → Embed (ED-08). Players for
YouTube, Vimeo, Loom, Spotify, SoundCloud and Figma. Direct media links
(`.mp4`, `.mp3`, `.png`, `.pdf`…) become the native block. Anything else
is iframed, with an "open" link under it for sites that refuse framing.

**Test:**
1. `/embed` a YouTube link → player.
2. Embed a Spotify track link → compact Spotify player.
3. Embed a `.mp4` URL → native video block.
4. Embed an ordinary website → iframe with an "open" link below.

**Code:** `src/components/editor/blocks/embed-block.tsx`,
`src/lib/embed-providers.ts`

### ED-08 Paste a URL: Mention / Bookmark / Embed / URL

**Behavior:** Pasting a bare `http(s)` URL into text (empty selection, not
in a code block or table) inserts a clickable link and opens a "Paste as"
menu at the cursor:
- **Mention:** inline chip with favicon and page title.
- **Bookmark:** preview card block (title, 2-line description, favicon +
  URL, og:image). Also available as `/bookmark`.
- **Embed:** as ED-07.
- **URL:** keeps the plain link.

Arrow keys + Enter choose. Escape, typing or clicking away keeps the plain
link. Pasting a URL over selected text links the selection instead.
Mentions, bookmarks and links open in a new tab. Metadata is fetched once
and stored. The preview route refuses private/local addresses.

**Test:**
1. Paste `https://github.com/vercel/next.js` into an empty paragraph →
   link + menu. Pick Mention → GitHub icon + "GitHub - vercel/next.js…"
   chip; click → new tab.
2. Paste again, pick Bookmark → paragraph becomes a card with title,
   description, image, favicon and URL; click anywhere → new tab.
3. Paste `https://www.youtube.com/watch?v=dQw4w9WgXcQ` → Embed → player.
4. Paste a URL, press Escape (or type) → stays a plain link; click opens it.
5. Paste a URL mid-sentence → Bookmark → card inserted after the paragraph,
   rest of the sentence stays.
6. Reload → mentions/bookmarks keep title and image without refetching.
7. `curl "localhost:3000/api/link-preview?url=http%3A%2F%2F127.0.0.1"` →
   "Refusing to fetch a private or local address".

**Code:** `src/components/editor/paste-url-menu.tsx`,
`inline/link-mention.tsx`, `blocks/bookmark-block.tsx`,
`src/app/api/link-preview/route.ts`

---

## Search

### SR-01 Command palette

**Behavior:** Cmd/Ctrl+K opens search over titles, body text and link
mention titles. Filters: date (Any time / Today / Past week / Last 30 days
/ Custom range), tags, "Title only". Results are grouped by last edit
(Today / Yesterday / Past week / Last 30 days / Older) with highlighted
snippets. Arrow keys navigate; click or Enter opens.

**Test:**
1. Search a word from a title → page found, match highlighted.
2. Search a word from body text → page found with a snippet.
3. Try each date filter and a custom range → results narrow correctly.
4. Filter by tag → only tagged pages.
5. Enable "Title only" and search a body-only word → no match.
6. Search a word from a link mention's title → the page matches.
7. Arrow down and press Enter → that page opens.

**Code:** `src/components/search/command-palette.tsx`, `src/lib/recency.ts`

---

## Import and export

### IO-01 Markdown export

**Behavior:** Page "…" → Export → Markdown, with "Include sub-pages". A
single page with no attachments downloads as `.md`. With sub-pages or
attachments it downloads a `.zip` (one folder per page mirroring the tree,
shared `assets/`, relative links). Mentions and bookmarks export as
`[title](url)`; embeds as the URL.

**Test:**
1. Export a text-only page → plain `.md` opens correctly.
2. Export a page with images and sub-pages checked → `.zip` with page
   folders and `assets/`; images display in a Markdown viewer.
3. Export a page with a mention and a bookmark → both appear as
   `[title](url)`.

**Code:** `src/lib/export/markdown-export.ts`

### IO-02 PDF export

**Behavior:** Page "…" → Export → PDF opens the browser print dialog over
a clean, paginated, syntax-highlighted render (sub-pages included if
checked). Choose "Save as PDF". Long pages paginate fully.

**Test:**
1. Export a long page → print preview shows all pages, no toolbar or
   sidebar.
2. Export with "Include sub-pages" → sub-pages included.
3. Code blocks keep syntax highlighting in the preview.

**Code:** `src/components/printable-document.tsx`, `printable-page.tsx`

### IO-03 Workspace export

**Behavior:** Settings (gear icon in sidebar header) → "Export entire
workspace" → one `.zip` of every folder, page and file.

**Test:**
1. Run it → `.zip` downloads containing all folders, pages and assets.

**Code:** `src/lib/export/markdown-export.ts` (`exportWorkspaceAsZip`)

### IO-04 Markdown import

**Behavior:** Settings → "Markdown files" (one `.md`, several, or a `.zip`
of folders), or drag `.md`/`.zip` files onto the sidebar. YAML
front-matter sets title and tags. A progress dialog shows files processed,
then a summary (pages created, files imported, items skipped with reasons).

**Test:**
1. Import a `.md` with front-matter → page created with that title and
   tags.
2. Import several `.md` files at once → one page each; summary correct.
3. Drag a `.md` onto the sidebar → imported.

**Code:** `src/lib/import/markdown-import.ts`, `import-core.ts`

### IO-05 Notion import

**Behavior:** Settings → "Notion export (.zip)". Strips Notion's 32-hex
ids from titles, rebuilds hierarchy from folders, rewrites internal links
to navigate inside Xeento, imports images/attachments, turns each `.csv`
into a page with a table block (plus a TODO note about future databases),
and puts everything in a new "Imported from Notion – <date>" folder.

**Test:**
1. Import `test-fixtures/notion-export-sample.zip` → new dated folder
   appears.
2. Check titles → no hex ids.
3. Check nesting → matches the zip's structure.
4. Click the cross-page link → opens the target page in Xeento.
5. Image displays; the roster `.csv` is a page with a table.

**Code:** `src/lib/import/notion-import.ts`, `import-core.ts`

### IO-06 Round-trip and error handling

**Behavior:** Export → import preserves content, with media (PDF, file,
video, audio) coming back as re-imported attachments rather than identical
embeds. Bad input fails with a toast or skip reason, never a crash.

**Test:**
1. Build a page with every block type, export to Markdown, re-import →
   content matches; media blocks are working attachments.
2. Import a corrupted zip → error toast or skip reason, app keeps working.
3. Import an unsupported file type → skipped with a reason.

**Code:** `src/lib/import/import-core.ts`

---

## Data safety

### DS-01 Persistent storage

**Behavior:** On load, Xeento asks the browser to keep its storage
persistent, so IndexedDB isn't evicted when disk space runs low. Chrome
and Edge decide silently; Firefox may show a permission prompt. Nothing
changes if the browser refuses.

**Test:**
1. Load the app, then run `await navigator.storage.persisted()` in the
   console → `true` in Chrome once the site has some engagement (on a fresh
   profile it may still be `false`; that's the browser's call).
2. Firefox → a "store data in persistent storage" prompt; Allow → `true`.

**Code:** `src/components/app-shell.tsx`

### DS-02 Trash

**Behavior:** Deleting a page (any sidebar section, or a folder's "delete
pages too") moves it and its sub-pages to Trash as one entry. "Trash" at
the bottom of the sidebar shows a count and opens a dialog listing entries
newest first (icon, title, deleted date, sub-page count). **Restore** puts
the page and sub-pages back at the end of their old siblings, keeping
content, tags, icon and favourite. If the old parent page or folder no
longer exists, it goes to the top level of Pages. **Delete forever** (per
entry) and **Empty trash** ask for confirmation. Entries older than 30
days are deleted on the next load.

**Test:**
1. Delete a page with sub-pages → "Moved to Trash" toast; sidebar footer
   shows "Trash 1".
2. Open Trash → one entry with the title, date and "N sub-pages".
3. Restore → page and sub-pages back in the tree, last among their old
   siblings, same content; Trash is empty.
4. Delete a page inside a folder, delete the folder (move pages), restore
   the page → it lands in Pages.
5. Delete a starred page, restore it → it's back in Favourites.
6. Delete forever → confirm → entry gone, page not restorable.
7. Empty trash → confirm → Trash shows "Trash is empty."
8. In DevTools, set an entry's `deletedAt` in the `trash` table to 31 days
   ago, reload → entry gone.
9. Esc or clicking outside closes the dialog.

**Edge cases:** Restoring a sub-page whose parent is itself in Trash puts
it at the top level of Pages.

**Code:** `src/lib/trash.ts`, `src/components/sidebar/trash-dialog.tsx`

### DS-03 Unused file cleanup

**Behavior:** On load (after the Trash purge) and after any Delete forever
or Empty trash, stored files that no page references are deleted. Pages in
Trash count as references, so restoring brings their files back. Files
stored less than 24 hours ago are kept, so a fresh upload or import isn't
removed before its page saves.

**Test:**
1. Drop an image on a page, delete the image block. In DevTools set that
   file's `createdAt` to 2 days ago, reload → the file is gone from `files`.
2. Repeat, but delete the whole page instead of the block (it's in Trash),
   reload → file kept; restore → image displays.
3. Then delete it forever → file is gone from `files`.
4. Upload a file, delete its block, reload right away → file kept (under
   24h old).

**Code:** `src/lib/files.ts` (`deleteUnusedFiles`)

### DS-04 Full backup and restore

**Behavior:** Settings → "Download full backup" downloads
`xeento-backup-<date>.zip`: `backup.json` (every page, folder and Trash
entry exactly as stored) plus `files/<id>` for each stored file. Settings →
"Restore from backup…" asks for confirmation, then **replaces** the whole
workspace (pages, folders, files, Trash) with the backup and reloads.
Nothing is lost, unlike Markdown export (IO-03). A zip that isn't a Xeento
backup shows an error toast and changes nothing. The zip is built in memory
before the download starts, so clicking shows "Preparing backup (<size>)…"
at once. If the download hasn't started after 30 seconds, a warning says
the workspace may be too large; if building fails, an error toast says so.

**Test:**
1. Build pages with sub-pages, a folder, favourites, tags, an image, a PDF
   and a Trash entry. Download full backup → zip has `backup.json` and
   `files/`.
2. Change things (delete pages, rename a folder), restore the backup →
   confirm → app reloads to exactly the backed-up state, media included,
   Trash entry included.
3. Cancel the confirm → nothing changes.
4. Restore a Notion export zip or a random zip → "isn't a valid Xeento
   backup" toast; workspace unchanged.
5. Click Download full backup → "Preparing backup (<size>)…" toast at once.
6. With a large workspace (or `SLOW_BACKUP_MS` lowered temporarily) → the
   "still hasn't started… may be too large" warning appears.

**Code:** `src/lib/backup.ts`, `src/components/settings-menu.tsx`

---

## Settings and theme

### ST-01 Light/dark mode

**Behavior:** Toggle in the sidebar header. Restyles the whole app,
including the editor and code highlighting.

**Test:**
1. Toggle → entire app restyles, editor included.
2. Reload → theme kept.

**Code:** `src/app/globals.css`, next-themes

---

## Keyboard shortcuts

| Action | macOS | Windows/Linux | Where |
|---|---|---|---|
| Open search | Cmd+K | Ctrl+K | Anywhere |
| Toggle sidebar | Cmd+\\ | Ctrl+\\ | Anywhere |
| Copy open page | Cmd+C | Ctrl+C | Not typing, no text selected |
| Paste page copy | Cmd+V | Ctrl+V | Not typing |
| Navigate / choose | ↑ ↓ Enter | ↑ ↓ Enter | Search, "Paste as" menu |
| Close menu | Esc | Esc | Menus, "Paste as" menu |
| Indent | Tab | Tab | Code block |
| Slash menu | / | / | Editor |
| Rename | Double-click | Double-click | Sidebar rows, folders |

---

## Known limitations

- Single browser only: data lives in IndexedDB, no sync yet.
- A deleted block's file stays stored until the next cleanup (DS-03): at
  least 24 hours, then the next load.
- Restore from backup replaces the workspace; it can't merge.
- Backup and restore hold the whole workspace in memory, so very large
  workspaces may be slow.
- Very large PDFs may be slow (pages load lazily but aren't virtualized).
- Markdown round-trip is lossy for media blocks (expected; Markdown has no
  syntax for them).
- Notion import's link rewriting handles `[text](path.md)`; unusual link
  syntax may not be rewritten.
- Some sites refuse to be iframed; their embeds show the "open" link.
- The page clipboard (PG-05) is in-app and clears on reload.

---

## Changelog

**Milestone 1 — Core app:** SB-01 page tree, PG-01 title and icon,
ED-01 block editor, PG-02 autosave, ST-01 light/dark mode.

**Milestone 2 — Search and organization:** SR-01 command palette, SB-07
collapsible sidebar, new page button in header (SB-01), SB-03 folders,
SB-04 favourites, SB-05 recent, PG-04 favourite star, PG-03 tags.

**Milestone 3 — Embeds, export, import:** ED-02 file storage and drop,
ED-03 file block, ED-04 PDF block, ED-05 video/audio, ED-07 embeds,
ED-06 code block, IO-01 Markdown export, IO-02 PDF export, IO-03
workspace export, IO-04 Markdown import, IO-05 Notion import, IO-06
round-trip.

**Post-Milestone 3:**
- PG-01, SB-02: default icon is `FileText` everywhere
- PG-04: star moved to its own toolbar row
- SB-07: sidebar resizable (220–480px)
- SB-05: Recent order fixed until reload
- SB-06: right-click menu with Duplicate
- SB-05: Recent rows get full page actions
- PG-05: keyboard copy/paste of pages
- SB-02: drag rows from anywhere
- PG-01: long titles wrap
- ED-06: convert selection to code block
- PG-04, SB-07: sticky toolbar, fixed open-sidebar button
- ED-08: paste URL menu (Mention / Bookmark / Embed / URL)

**Milestone 4 — Data safety:** DS-01 persistent storage, DS-02 Trash
(SB-01, SB-03, SB-05 delete now goes to Trash), DS-03 unused file
cleanup, DS-04 full backup and restore.
- DS-04: backup progress toast and slow/failed-backup warnings
- Toasts render again (`ToastHost` was never mounted, so no toast showed)
