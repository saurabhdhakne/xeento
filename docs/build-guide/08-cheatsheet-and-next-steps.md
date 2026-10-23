# 08 — Cheat sheet and next steps

A reference to come back to: the patterns used across the app, every
gotcha in one list, how to debug, and how to build the next features
yourself.

---

## 1. Patterns you'll reuse

### Data

| Pattern | Where | One-line why |
|---|---|---|
| Database is the state; UI reads via `useLiveQuery` | everywhere | no store to keep in sync |
| Components never import `db.ts` | `src/components/` | backend can be swapped later |
| `ROOT_ID = "root"` instead of `null` | `db.ts` | IndexedDB can't index null |
| Flat records + `parentId` | pages | moving a subtree = one update |
| Sparse `order` + splice-and-renumber | `movePageToPosition`, favourites, folders, duplicate | simple, never runs out of gaps |
| New Dexie version per schema change; `upgrade()` fills defaults | `db.ts` | existing users migrate forward |
| Transactions for multi-row changes | trash, move, duplicate, restore | all-or-nothing |
| Move rows to another table instead of a `deleted` flag | Trash | no query has to filter |
| Store ids, read titles live | mentions, cards, backlinks | renames propagate for free |
| Compute on read instead of maintaining an index | search, backlinks, tags list | can't go stale |
| Custom URL schemes (`xeento-file://`, `xeento-page://`) | content | content stays portable; resolve at the edge |
| Two timestamps (`updatedAt` vs `lastOpenedAt`) | pages | viewing ≠ editing |

### React

| Pattern | Where | Why |
|---|---|---|
| `key={id}` to remount per page | PageView, BlockEditor | fresh editor, cleanup on switch |
| Debounce saves + flush on unmount | title, editor | fast typing, no lost edits |
| Local draft, don't sync while focused | title | no cursor jumps |
| Hydration-safe localStorage (default → read after mount) | `use-local-storage-*.ts` | server can't read storage |
| `mounted` flag before theme-dependent UI | ThemeToggle | server doesn't know the theme |
| `useRef` guard for "run once after load" | AppShell init | `allPages` changes on every edit |
| Ref to the latest callback (`openPageRef`, `chooseRef`) | AppShell, PasteUrlMenu | listeners registered once never go stale |
| `cancelled` flag in async effects | PDF, bookmark, printable | late results can't overwrite newer state |
| Clamp an index at render instead of resetting in an effect | palette, Move to | no extra render |
| `useState(() => create())` for a stable per-component object | file resolver | readable during render, unlike a ref |
| `useLayoutEffect` to measure then position | popover, context menu, paste menu, title | no visible jump |

### DOM and events

| Pattern | Where | Why |
|---|---|---|
| Portal to `document.body` + `position: fixed` | popover, context menu, paste menu | escape `overflow-hidden` parents |
| Two-pass positioning (place, measure, clamp) | popover, context menu | real size only known after render |
| Capture-phase listeners | file drop zone, paste menu keys | run before the editor's handlers |
| `currentTarget.contains(target)` check | `rowDragListeners` | portal events bubble through React parents |
| Drag counter instead of boolean | file drop zone | dragenter/leave fire per child |
| Window listeners added on mousedown, removed on mouseup | sidebar resize, PDF resize | drag keeps working off the handle |
| `stopPropagation` on buttons inside clickable rows | sidebar rows | button click ≠ row click |
| Check "is the user typing?" before global shortcuts | page copy/paste | don't break normal copy/paste |

---

## 2. Every gotcha in one list

**Data**
- `useLiveQuery` returns `undefined` while loading. Handle it.
- Never edit or delete an old `db.version(...)`.
- Booleans can't be IndexedDB indexes.
- Don't `await` non-Dexie work inside a Dexie transaction (it commits early).
- Filter only the top level by `folderId` when building trees.
- Moving pages between buckets needs renumbering, not a field flip.
- Check `isSameOrDescendant` before re-parenting.
- Collect duplicated pages first, add them after the walk.
- Restore must handle a missing parent/folder.
- File cleanup must count Trash and skip files under 24h old.

**Editor (BlockNote / ProseMirror)**
- One schema everywhere (live, print, headless export).
- `initialContent` is read once; pass `undefined`, not `[]`.
- Without `uploadFile`, uploads are disabled.
- Default slash menu and block-type dropdown don't include custom blocks.
- Don't put foreign DOM inside ProseMirror-managed nodes (gutter goes beside the `<pre>`).
- BlockNote's generated `render` needs `.call({ blockContentDOMAttributes: {}, renderType: "dom", props: undefined }, …)`.
- Interactive UI inside blocks needs `contentEditable={false}`.
- Re-check a saved ProseMirror range before replacing it.
- Custom inline content that renders via hooks exports as "…" headlessly; resolve to text first.
- Table content is `{ type: "tableContent", rows }`, not an array.

**Browser**
- Revoke object URLs when done.
- pdf.js needs its worker at `/pdf.worker.min.mjs` (postinstall script).
- Many sites refuse iframes; always show an "open" link.
- Print prints the box: use `print:h-auto print:overflow-visible` on scroll containers.
- Reset `input.value = ""` after reading a file input.
- Escape user input before building a RegExp.

**Server**
- The link-preview route must refuse private IPs on every redirect hop.

**General**
- A toast/pub-sub host that's never mounted fails silently.

---

## 3. Debugging toolkit

- **DevTools → Application → IndexedDB → `xeento`**: see and edit every
  row. Change `createdAt`/`deletedAt` to test time-based logic.
- **DevTools → Application → Local Storage**: UI flags (`xeento:*`).
- **Reset everything**: DevTools → Application → Storage → "Clear site
  data". (Take a backup first.)
- **Inspect a page's block JSON**: click the row in the IndexedDB viewer
  and expand `content`, or temporarily `console.log(editor.document)` in
  `handleChange`.
- **When a library throws from inside itself**: open its source in
  `node_modules/@blocknote/...` and read the function in the stack trace.
  That's how the `render.call` fix was found.
- **Type errors only appear in `npm run build`**, not always in `npm run dev`.
- **Study a milestone in isolation**: `git show 8df8955 --stat` (M4),
  `git show 9fba710` (M5).

---

## 4. How to build a new feature yourself

This is the workflow the project follows (from CLAUDE.md). Use it for
every feature, with or without AI.

1. **Search FEATURES.md.** Part of it may already exist.
2. **Write the test steps first** in FEATURES.md format
   (`1. Do X → expected result`). They're your success criteria.
3. **Decide the data change.** New field? New table? → new Dexie version
   with `upgrade()` defaults. Write the `src/lib/` functions first and test
   them from a temporary button or the console.
4. **Then the UI**, reading through hooks and writing through `lib/`
   functions only.
5. **Check what BlockNote / Dexie / the browser already provide** before
   writing code. Prefer them, then your own small code, then (last) a
   dependency with an OK license.
6. **Verify:** `npm run lint`, `npm run build`, then your test steps in the
   browser.
7. **Update docs in the same change:** FEATURES.md entry + Changelog line;
   CLAUDE.md only if architecture/data model/rules changed.

### Practice exercises (in rising difficulty)

Small, self-contained features that use the patterns above. Good for
building confidence before the roadmap items:

1. **Folder icons**: add `icon` to `FolderRecord` (new Dexie version!),
   reuse `IconPicker` on folder rows.
2. **"Copy link" in the page "…" menu**: copies a `xeento-page://` link;
   pasting it in another page should open the page when clicked.
3. **Word count** under the title: reuse `blockNoteToPlainText`.
4. **Sort search results by relevance**: title matches before body
   matches, within each recency bucket.
5. **Rename tags globally**: a function in `pages.ts` that updates every
   page's `tags` in one transaction.
6. **Restore Trash entries in bulk**: multi-select in the Trash dialog.
7. **Export page links as real Markdown links** between `.md` files
   (fixes a known limitation; needs the page → path map from
   `addPageFolder`).

---

## 5. The roadmap, and how you'd approach it

From CLAUDE.md "Not yet built", in priority order:

1. **Supabase (or Drive/Firebase) sync.** This is what the storage
   boundary was built for. Only `src/lib/pages.ts`, `folders.ts`,
   `files.ts`, `trash.ts`, `backup.ts` and the `use-*.ts` hooks should
   change. Start by listing every function components call; that's your
   interface.
2. **Offline write queue + conflict resolution.** Keep IndexedDB as the
   local copy, queue writes while offline, replay them online. Decide a
   conflict rule (last-write-wins per field is the simple start;
   `updatedAt` already exists).
3. **Database/table blocks** with board/calendar views. CSV imports
   already create plain tables with a TODO note; this would replace them.
4. **Richer HTML paste.**
5. **Real-time collaboration** (BlockNote supports Yjs; this is the
   biggest item by far).

For these, it's reasonable to use AI for research and for critical bugs,
as you planned. The design decisions (sync model, conflict rules, what
lives where) are yours to make; this guide's "why" sections show the kind
of trade-offs to weigh.
