# 02 — Milestone 2: Search and organization

**Goal:** a workspace you can organize and search. Folders, favourites, a
Recent list, tags, a Cmd/Ctrl+K search palette, and a collapsible sidebar.

Features: SR-01 command palette · SB-07 collapsible sidebar · SB-01 new page
button · SB-03 folders · SB-04 favourites · SB-05 recent · PG-04 favourite
star · PG-03 tags

**Build order:**

```
1. Schema v2 migration (new fields + folders table) → verify: old pages still load
2. Folders data + "buckets" ordering                → verify: create/rename/collapse persist
3. Shared drag & drop across Folders + Pages        → verify: page → folder → back
4. Favourites (separate order, sortable)            → verify: star, reorder, reload
5. Recent (lastOpenedAt, openPage)                  → verify: newest first after reload
6. Tags                                             → verify: add/remove, reload
7. Command palette                                  → verify: title, body, filters
8. Sidebar collapse, section collapse, shortcuts    → verify: state survives reload
```

---

## Step 1 — Schema v2: a migration

File: [`src/lib/db.ts`](../../src/lib/db.ts)

New fields on `PageRecord`:

```ts
folderId: string | null;       // ONLY set for top-level pages (see Step 2)
tags: string[];
favourite: boolean;            // NOT indexed: booleans can't be IndexedDB keys
favouriteOrder: number | null; // order among favourites only
lastOpenedAt: number | null;   // for Recent; separate from updatedAt
```

And a new table:

```ts
interface FolderRecord { id: string; name: string; order: number; collapsed: boolean; }
```

The migration:

```ts
db.version(2)
  .stores({
    pages: "id, parentId, folderId, order, updatedAt",
    folders: "id, order",
  })
  .upgrade((tx) =>
    tx.table("pages").toCollection().modify((page) => {
      if (page.folderId === undefined) page.folderId = null;
      if (page.tags === undefined) page.tags = [];
      if (page.favourite === undefined) page.favourite = false;
      if (page.favouriteOrder === undefined) page.favouriteOrder = null;
      if (page.lastOpenedAt === undefined) page.lastOpenedAt = null;
    }),
  );
```

**Why `upgrade`?** Pages created in Milestone 1 don't have these fields.
Without filling them in, code like `page.tags.includes(...)` crashes on old
data. `upgrade` runs once per browser, the first time it sees version 2.

**Why keep `version(1)` in the file?** Dexie needs the full history to
upgrade a browser that's still on v1. Never edit or delete an old version.

Update `createPage` to set the new fields (`folderId: null, tags: [],
favourite: false, favouriteOrder: null, lastOpenedAt: null`).

---

## Step 2 — Folders and "ordering buckets"

File: [`src/lib/folders.ts`](../../src/lib/folders.ts)

Folders are a flat list (they don't nest). Functions: `createFolder`,
`renameFolder`, `setFolderCollapsed`, `reorderFolders`, `deleteFolder`.
Note the folder's `collapsed` flag lives **in the database** (it persists
across reloads as part of the data), unlike page expansion which is UI
state.

### The key rule: folder membership is top-level only

> A page has a non-null `folderId` **only if** `parentId === ROOT_ID`.
> Nested pages always have `folderId: null`, even if their top-level
> ancestor is in a folder.

**Why?** A sub-page "is in" a folder because its ancestor is. If sub-pages
also stored the folderId, moving the top page to another folder would mean
updating every descendant, and it'd be easy for them to disagree.

This creates **independent ordering buckets** at the root:

```
(parentId = root, folderId = null)      → the "Pages" section
(parentId = root, folderId = "f1")      → folder f1's pages
(parentId = root, folderId = "f2")      → folder f2's pages
(parentId = "pageX")                    → children of pageX (folderId always null)
```

Each bucket numbers its own `order` from 1024. So `getChildren` and
`nextOrder` gain a `folderId` argument, used **only at the root**:

```ts
export async function getChildren(parentId: string, folderId: string | null = null) {
  const items = await db.pages.where("parentId").equals(parentId).toArray();
  const scoped = parentId === ROOT_ID
    ? items.filter((p) => (p.folderId ?? null) === folderId)
    : items;
  return scoped.sort((a, b) => a.order - b.order);
}
```

### `movePageToPosition` gets a folder argument

```ts
export async function movePageToPosition(activeId, newParentId, targetIndex, newFolderId = null) {
  if (await isSameOrDescendant(activeId, newParentId)) return;
  const effectiveFolderId = newParentId === ROOT_ID ? newFolderId : null;   // enforce the rule
  …siblings = same parent AND (if root) same folder…
  …splice, renumber, write { parentId, folderId: effectiveFolderId, order }…
}
```

**Why force `null` when nested?** So no caller can break the rule by
passing a stale folderId. The invariant is enforced in one place.

### Building the tree per section

File: [`src/lib/build-page-tree.ts`](../../src/lib/build-page-tree.ts)

```ts
export function buildPageTree(allPages, isRoot: (p) => boolean) {
  return allPages
    .filter((p) => p.parentId === ROOT_ID && isRoot(p))   // filter ONLY the top level
    .sort(byOrder)
    .map((p) => ({ ...p, children: buildChildren(allPages, p.id) }));
}

// Pages section:   buildPageTree(pages, (p) => p.folderId === null)
// Folder section:  buildPageTree(pages, (p) => p.folderId === folder.id)
```

**Gotcha (a real bug to avoid):** don't pre-filter the whole array by
`folderId` before building. Sub-pages have `folderId: null`, so filtering
for `folderId === "f1"` would throw them away and the folder's pages would
appear to have no children.

### Deleting a folder

Three choices in [`delete-folder-dialog.tsx`](../../src/components/sidebar/delete-folder-dialog.tsx):
cancel, "Move pages to Pages", "Delete pages too".

```ts
export async function deleteFolder(id, mode: "moveToRoot" | "deleteContents") {
  await db.transaction("rw", db.pages, db.folders, db.trash, async () => {
    const directPages = await getChildren(ROOT_ID, id);
    if (mode === "deleteContents") {
      for (const page of directPages) await trashPage(page.id);   // M4; hard delete before
    } else {
      const start = (await getChildren(ROOT_ID, null)).length;
      for (let i = 0; i < directPages.length; i++) {
        await movePageToPosition(directPages[i].id, ROOT_ID, start + i, null);
      }
    }
    await db.folders.delete(id);
  });
}
```

**Why not just set `folderId: null` on each page?** Each bucket has its own
order numbers starting at 1024. Flipping the folderId would drop pages into
the Pages bucket with *colliding* order values. Moving them one at a time
(**sequentially**, each `await`ed) appends them cleanly at the end.

---

## Step 3 — One shared drag & drop context

File: [`src/components/sidebar/sidebar.tsx`](../../src/components/sidebar/sidebar.tsx)

You need to drag pages between the Folders section and the Pages section.
dnd-kit only lets things interact inside the **same** `DndContext`, so both
sections sit inside one:

```tsx
<DndContext sensors={sensors} onDragStart onDragOver onDragEnd onDragCancel>
  <FoldersSection … />
  <PagesSection … />
  <DragOverlay>…</DragOverlay>
</DndContext>
```

Every draggable/droppable carries `data: { type }` so `handleDragEnd` can
tell them apart. Ids are always the real record ids:

| `data.type` | Thing | Draggable? | Droppable? |
|---|---|---|---|
| `"page"` | a page row | yes | yes |
| `"folder"` | a folder row | yes | yes |
| `"folder-end"` | invisible strip at the end of a folder's list | – | yes |
| `"folders-end"` | strip at the end of the folder list | – | yes |
| `"pages-root-end"` | strip at the end of the Pages section | – | yes |

The "end" strips are [`DropSentinel`](../../src/components/sidebar/drop-sentinel.tsx)s:
4px tall normally, they grow into a dashed 24px target only while a drag is
active. **Why?** Without them there's no way to say "put this *last*" or
"drop into an *empty* folder".

### The decision table in `handleDragEnd`

```
dragging a FOLDER:
  over a folder      → reorder folders (before/after via isAfter)
  over folders-end   → move folder to the end
  anything else      → ignore

dragging a PAGE:
  over pages-root-end           → last in Pages (root, folderId null)
  over folder / folder-end      → last in that folder
  over folders-end              → ignore
  over a page, nest gesture     → last child of that page
  over a page, otherwise        → before/after it, in ITS parent and folder
```

For "before/after a page", compute the index among the target's siblings
(same parent, and same folder if at root), excluding the dragged page, then
call `movePageToPosition(active, over.parentId, index, over.folderId)`.

---

## Step 4 — Favourites

Files: [`sidebar/favourites-section.tsx`](../../src/components/sidebar/favourites-section.tsx),
`toggleFavourite` / `reorderFavourites` in [`pages.ts`](../../src/lib/pages.ts)

- A favourite is just `favourite: true` on the page, plus its own
  `favouriteOrder` (separate from the tree order, so reordering favourites
  doesn't move pages in the tree).
- Starring puts it last: `favouriteOrder = max(existing) + 1024`.
- Unstarring sets `favourite: false` (the old `favouriteOrder` is just
  ignored).
- The section lists `pages.filter(p => p.favourite)` sorted by
  `favouriteOrder`.

**Why filter in JS instead of an index?** IndexedDB can't index booleans.
Loading all pages is something we already do.

Favourites is a flat list, so it uses **@dnd-kit/sortable**, which animates
rows sliding out of the way:

```tsx
<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
  <SortableContext items={ids} strategy={verticalListSortingStrategy}>
    {favourites.map((p) => <FavouriteRow key={p.id} page={p} />)}
  </SortableContext>
</DndContext>

// on drop:
reorderFavourites(arrayMove(ids, fromIndex, toIndex));  // renumber all
```

`FavouriteRow` calls `useSortable` and passes its `transform`/`transition`
as a style to the shared `PageTreeRow`. A `KeyboardSensor` is added too, so
favourites can be reordered with the keyboard.

**Why is Favourites its own `DndContext`?** Favourites don't interact with
the tree (dragging a favourite into a folder makes no sense). Separate
contexts keep the tree's drop logic simpler.

The star button in the page toolbar (PG-04) and on row hover both call
`toggleFavourite(id)`. The section updates instantly because it reads the
live query.

---

## Step 5 — Recent

Files: `openPage` in [`app-shell.tsx`](../../src/components/app-shell.tsx),
[`sidebar/recent-section.tsx`](../../src/components/sidebar/recent-section.tsx)

### Two timestamps, on purpose

- `updatedAt` = last **edit**. Drives search's "Today / Yesterday…" grouping.
- `lastOpenedAt` = last **view**. Drives Recent.

```ts
/** Deliberately does NOT touch updatedAt */
export async function touchLastOpened(id: string) {
  await db.pages.update(id, { lastOpenedAt: Date.now() });
}
```

**Why separate?** If opening a page bumped `updatedAt`, just browsing would
make every page look "edited today" in search.

### `openPage` is the one door for navigation

```ts
function openPage(id: string) {
  setSelectedId(id);
  const mostRecentId = /* page with the biggest lastOpenedAt */;
  if (mostRecentId !== id) void touchLastOpened(id);
}
```

Every real user navigation (sidebar click, search result, favourite,
mention click) goes through `openPage`. The restore-on-reload in AppShell
uses `setSelectedId` directly **on purpose**: reloading isn't the user
opening a page. The `mostRecentId` check skips a pointless write when you
click the page that's already the most recent.

### Frozen order until reload

Recent's order is computed **once at load** and kept in `recentIds` state:

```ts
setRecentIds(allPages.filter((p) => p.lastOpenedAt !== null)
  .sort((a, b) => b.lastOpenedAt! - a.lastOpenedAt!)
  .map((p) => p.id));
```

The section shows the first 8, looking up each page **live** by id (so
renames and stars show immediately), but the order doesn't change until
the next reload.

**Why freeze it?** If Recent reordered on every click, the row you're about
to click would jump away under your cursor. (This "frozen" behaviour was
added in the polish round after the first version reshuffled live.)

Recent rows reuse `PageTreeRow` with no drag props and no chevron.

---

## Step 6 — Tags

Files: [`tag-editor.tsx`](../../src/components/tag-editor.tsx), `setPageTags`

A chip list plus an input under the title.

- Enter, comma or blur adds the trimmed draft.
- Duplicates are rejected **case-insensitively** (`Work` and `work` are the
  same tag), but the original casing is kept.
- × on a chip removes it.
- Saved with `setPageTags(id, tags)` (which bumps `updatedAt`).

There's no tags table: the list of all tags is computed when needed:
`new Set(pages.flatMap((p) => p.tags))`.

---

## Step 7 — The command palette (Cmd/Ctrl+K)

Files: [`search/command-palette.tsx`](../../src/components/search/command-palette.tsx),
[`search-filters.tsx`](../../src/components/search/search-filters.tsx),
[`search-result-row.tsx`](../../src/components/search/search-result-row.tsx),
[`src/lib/block-text.ts`](../../src/lib/block-text.ts),
[`src/lib/recency.ts`](../../src/lib/recency.ts)

Search runs **entirely in memory** over the pages AppShell already has.
No search index. For a personal notes app that's fast enough and has zero
sync problems.

### 7a. Turn block JSON into searchable text

```ts
// block-text.ts — walk blocks → inline nodes → children, collecting text
function walkInline(nodes, out) {
  for (const node of nodes) {
    if (typeof node.text === "string") out.push(node.text);
    if (node.type === "linkMention" && node.props?.title) out.push(node.props.title); // added in polish round
    if (Array.isArray(node.content)) walkInline(node.content, out);   // e.g. text inside links
  }
}
export function blockNoteToPlainText(blocks): string { … join(" ") }
```

The palette memoizes `pageId → plain text` with `useMemo([pages])`, so the
conversion runs only when pages change, not on every keystroke.

### 7b. Filter → sort → group

```ts
const filtered = pages.filter((page) => {
  if (!matchesDateFilter(page.updatedAt, dateFilter, customRange)) return false;
  if (selectedTags.length && !selectedTags.some((t) => page.tags.includes(t))) return false;
  if (!query) return true;
  const haystack = titleOnly ? page.title : `${page.title} ${plainText.get(page.id)}`;
  return haystack.toLowerCase().includes(query);
});
// newest edit first, then bucket into Today / Yesterday / Past week / Last 30 days / Older
```

`recency.ts` compares against **the start of today** (local midnight), not
"24 hours ago". So "Yesterday" means the previous calendar day, which is
what people expect.

Custom date range: the "to" date is inclusive, so the check is
`timestamp < to + one day`.

### 7c. Snippet and highlight

- **Snippet:** find the query in the body text and take ~60 characters on
  each side, adding `…` at cut ends.
- **Highlight:** split the text with a case-insensitive regex built from
  the query and wrap matches in `<mark>`. **Escape the query first**
  (`escapeRegExp`), otherwise searching for `c++` or `(` throws.
- **Path:** `getPagePath` shows "Parent / Child" for nested pages or the
  folder name for foldered ones. (Milestone 5's Move-to dialog reuses it.)

### 7d. Keyboard navigation

- `selectedIndex` in state; ↑/↓ change it; Enter opens; Escape closes.
- The index is **clamped at render time**:
  `const activeIndex = Math.min(selectedIndex, results.length - 1)`.
  **Why not reset it in an effect when results change?** Clamping is
  simpler and avoids an extra render. If filters shrink the list, the
  highlight just stays on the last row.
- Opening resets all filters and focuses the input
  (`requestAnimationFrame(() => input.focus())`, because the input doesn't
  exist until after this render).
- Clicking the backdrop closes; the dialog body calls
  `e.stopPropagation()` so clicks inside don't.

### 7e. Global shortcut

In AppShell, one `keydown` listener on `window`:

```ts
const mod = e.metaKey || e.ctrlKey;
if (mod && e.key.toLowerCase() === "k")  { e.preventDefault(); setSearchOpen((v) => !v); }
if (mod && e.key === "\\")               { e.preventDefault(); setSidebarOpen((v) => !v); }
```

`preventDefault` stops the browser's own Cmd+K (focus address bar in some
browsers).

---

## Step 8 — Sidebar collapse and persisted UI flags

Files: [`src/lib/use-local-storage-flag.ts`](../../src/lib/use-local-storage-flag.ts),
[`sidebar.tsx`](../../src/components/sidebar/sidebar.tsx),
[`section-header.tsx`](../../src/components/sidebar/section-header.tsx)

UI preferences (sidebar open, each section collapsed, later the sidebar
width) live in `localStorage`, not IndexedDB. They're per-device view
settings, not workspace data.

### The hydration-safe localStorage hook

```ts
export function useLocalStorageFlag(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(defaultValue);   // same on server and client
  const didInit = useRef(false);
  useEffect(() => {                                   // after mount: read stored value
    if (didInit.current) return;
    didInit.current = true;
    const stored = localStorage.getItem(key);
    if (stored !== null) setValue(stored === "1");
  }, [key]);
  useEffect(() => {                                   // write on change
    localStorage.setItem(key, value ? "1" : "0");
  }, [key, value]);
  return [value, setValue] as const;
}
```

**Why not `useState(() => localStorage.getItem(...))`?** Next.js renders
the first HTML on the server, where `localStorage` doesn't exist, and React
then requires the client's first render to match the server's. Reading
storage in the initializer would crash on the server or cause a hydration
mismatch. Start with the default, then switch after mount.

### Collapsing the sidebar

- The `<aside>` width animates between `width` and `0`
  (`transition-[width]`), with `overflow-hidden`.
- The inner content keeps its full width so text doesn't reflow while
  animating, and gets `pointer-events-none` when closed.
- When closed, AppShell shows a small "open sidebar" button (in the polish
  round it became `position: fixed` so it stays visible while scrolling).
- Each section (Favourites, Recent, Folders, Pages) has its own flag and a
  `SectionHeader` with a chevron.

### Why popovers are portaled

File: [`src/components/ui/popover.tsx`](../../src/components/ui/popover.tsx)

The sidebar is `overflow-hidden` (for the collapse animation), so any
dropdown rendered inside it (emoji picker, settings menu) gets clipped.
The fix: render the dropdown with `createPortal(..., document.body)` and
`position: fixed` at the trigger's `getBoundingClientRect()`.

Two layout passes:

1. On open, place it under the trigger.
2. After it renders (now its real width is known), shift it so it stays
   inside the viewport, and right-align it if `align="right"`.

Both run in `useLayoutEffect`, which runs before the browser paints, so the
user never sees it jump. It closes on outside mousedown, Escape, or any
scroll (rather than following the trigger).

---

## Checkpoint (Milestone 2)

- [ ] Open the app with data from Milestone 1 → nothing lost (migration
      worked).
- [ ] Create a folder, drag a page in, drag it back out to Pages.
- [ ] A folder's page has sub-pages → they still show inside the folder.
- [ ] Collapse a folder, reload → still collapsed.
- [ ] Delete a folder with "move pages" → pages appear at the end of Pages,
      in their original order.
- [ ] Star three pages, reorder them in Favourites → tree order unchanged.
- [ ] Open A, B, C; reload → Recent shows C, B, A.
- [ ] Add tags; Cmd/Ctrl+K → filter by tag.
- [ ] Search a body word → snippet with highlight. Search `(` → no crash.
- [ ] Cmd/Ctrl+\ toggles the sidebar; reload keeps the state.

## Gotchas from this milestone

- Filtering by folderId before building the tree hides sub-pages.
- Flipping `folderId` without renumbering creates order collisions.
- Forgetting the `upgrade()` defaults → crashes on old data
  (`undefined.includes`).
- Reading `localStorage` during render → hydration errors.
- Building a regex from user input without escaping it.
- Making `openPage` bump `updatedAt` → everything looks "edited today".
