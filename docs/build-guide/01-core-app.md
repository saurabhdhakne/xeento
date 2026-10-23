# 01 — Milestone 1: Core app

**Goal:** a working notes app. Create pages, nest them, drag to reorder,
give them a title and emoji, write block content, everything saves
automatically, and there's a dark mode.

Features: SB-01 page tree · PG-01 title and icon · ED-01 block editor ·
PG-02 autosave · ST-01 light/dark mode

**Build order:**

```
1. Database v1 (pages table)           → verify: row appears in DevTools
2. Page functions (create/rename/…)    → verify: call from console/button
3. Read hooks                          → verify: list re-renders on change
4. AppShell (selected page + layout)   → verify: click selects, reload restores
5. Sidebar tree (recursive rows)       → verify: nested pages render
6. Drag to reorder / nest              → verify: order survives reload
7. Page view: title + icon             → verify: sidebar updates live
8. Block editor + autosave             → verify: content survives reload
9. Theme (light/dark)                  → verify: editor restyles too
```

---

## Step 1 — The database (Dexie v1)

File: [`src/lib/db.ts`](../../src/lib/db.ts)

For this milestone a page only needs these fields (simplified for this
stage; Milestone 2 adds `folderId`, `tags`, `favourite`, `favouriteOrder`
and `lastOpenedAt`):

```ts
export const ROOT_ID = "root";

export interface PageRecord {
  id: string;          // nanoid()
  parentId: string;    // ROOT_ID for top-level pages, else another page's id
  title: string;
  icon: string | null; // an emoji character, or null for the default icon
  order: number;       // position among siblings (sparse, see Foundations §7)
  content: unknown;    // BlockNote block array, stored as-is
  createdAt: number;
  updatedAt: number;
}

export const db = new Dexie("xeento") as Dexie & {
  pages: EntityTable<PageRecord, "id">;
};

db.version(1).stores({
  pages: "id, parentId, order, updatedAt",
});
```

**Why these indexes?** `parentId` because "get the children of X" is the
most common query. `order` and `updatedAt` for sorting. `title` and
`content` aren't indexed because we never query by them in the database
(search runs in JS).

**Why `ROOT_ID = "root"` instead of `null`?** IndexedDB can't index `null`,
so `where("parentId").equals(null)` wouldn't work. A string sentinel can.

**Why `content: unknown`?** The data layer doesn't need to understand
BlockNote's types. Only the editor does. Keeping it `unknown` stops
BlockNote types leaking into `src/lib/`.

---

## Step 2 — Page functions

File: [`src/lib/pages.ts`](../../src/lib/pages.ts)

Write these small functions. Each is one or two Dexie calls.

```ts
const ORDER_STEP = 1024;

export function emptyDocument() {
  return [{ type: "paragraph", content: [] }];
}

export async function getChildren(parentId: string) {
  const items = await db.pages.where("parentId").equals(parentId).toArray();
  return items.sort((a, b) => a.order - b.order);
}

export async function nextOrder(parentId: string) {
  const siblings = await getChildren(parentId);
  return siblings.length === 0 ? ORDER_STEP : siblings.at(-1)!.order + ORDER_STEP;
}

export async function createPage(parentId = ROOT_ID, title = "Untitled") {
  const now = Date.now();
  const page = {
    id: nanoid(), parentId, title, icon: null,
    order: await nextOrder(parentId),
    content: emptyDocument(),
    createdAt: now, updatedAt: now,
  };
  await db.pages.add(page);
  return page;
}

export async function renamePage(id: string, title: string) {
  await db.pages.update(id, { title, updatedAt: Date.now() });
}
// setPageIcon, setPageContent: same shape.
```

Plus `getDescendantIds(id)` (breadth-first walk, see Foundations §6).

**Delete at this stage:** collect the page and all descendants and
`db.pages.bulkDelete([...])`. That's a hard delete. In Milestone 4 this is
replaced by "move to Trash" (Chapter 06), so don't over-invest here.

**Why always bump `updatedAt`?** Search (Milestone 2) groups results by
"last edited". Any real edit must refresh it. (Opening a page must *not*,
which is why Milestone 2 adds a separate `lastOpenedAt`.)

---

## Step 3 — Read hooks

File: [`src/lib/use-pages.ts`](../../src/lib/use-pages.ts)

```ts
export function useAllPages() {
  return useLiveQuery(() => db.pages.toArray(), []);
}
export function usePage(id: string | null) {
  return useLiveQuery(() => (id ? db.pages.get(id) : undefined), [id]);
}
```

**Why load *all* pages instead of querying per tree level?** The sidebar
needs the whole tree anyway, search needs all pages, and a notes app has
hundreds to a few thousand pages, which is small. One query, built into a
tree in memory, is simpler and fast enough.

---

## Step 4 — AppShell: the top-level component

File: [`src/components/app-shell.tsx`](../../src/components/app-shell.tsx)

AppShell owns the **UI state** and wires sidebar + page view together.

```tsx
export function AppShell() {
  const pages = useAllPages();
  const loading = pages === undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  …
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar … />
      <main className="flex-1 overflow-y-auto">
        {loading ? null : selectedId
          ? <PageView key={selectedId} pageId={selectedId} />
          : <EmptyState onCreate={handleCreateRoot} />}
      </main>
    </div>
  );
}
```

### 4a. Remember the open page across reloads

```ts
const STORAGE_KEY = "xeento:last-page-id";

// Save whenever it changes
useEffect(() => {
  if (selectedId) localStorage.setItem(STORAGE_KEY, selectedId);
  else localStorage.removeItem(STORAGE_KEY);
}, [selectedId]);

// Restore ONCE, after the pages have loaded
const didInitSelection = useRef(false);
useEffect(() => {
  if (didInitSelection.current || loading) return;
  didInitSelection.current = true;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && allPages.some((p) => p.id === stored)) setSelectedId(stored);
  else setSelectedId(firstRootPage?.id ?? null);
}, [loading, allPages]);
```

**Why wait for `loading` to be false?** Until IndexedDB answers, we don't
know if the stored id still exists. **Why a ref guard?** `allPages` changes
on every edit; without the guard, every keystroke would reset the selection.

### 4b. `key={selectedId}` on PageView

When you switch pages, React sees a different `key` and **throws away the
old PageView and mounts a fresh one**. That's deliberate:

- The editor is created once per page with that page's content. No need to
  "reset" the editor's internal state when switching.
- The old editor's unmount runs its cleanup: flush pending saves (Step 8),
  free blob URLs (Chapter 03).

### 4c. Create and delete

```ts
async function handleCreateRoot() {
  const page = await createPage(ROOT_ID);
  setSelectedId(page.id);            // later: openPage(page.id)
}
async function handleCreateChild(parentId: string) {
  const page = await createPage(parentId);
  setExpanded((prev) => new Set(prev).add(parentId));  // show the new child
  setSelectedId(page.id);
}
```

When the selected page (or one of its ancestors) is deleted, pick a
fallback: its parent if it had one, otherwise nothing (EmptyState).

### 4d. Keep the selected page visible

An effect walks up from the selected page and adds every ancestor to
`expanded`, so a page opened from search is never hidden inside a collapsed
parent. It returns the **same Set object** when nothing changes, which
avoids an unnecessary re-render loop.

---

## Step 5 — Sidebar tree

Files: [`src/lib/build-page-tree.ts`](../../src/lib/build-page-tree.ts),
[`sidebar/pages-tree.tsx`](../../src/components/sidebar/pages-tree.tsx),
[`sidebar/page-tree-row.tsx`](../../src/components/sidebar/page-tree-row.tsx)

1. `buildPageTree(allPages)` turns the flat list into nested nodes (see
   Foundations §6).
2. `PagesTree` renders a list of nodes. For each node it renders a row, and
   **if the node is expanded, it renders another `PagesTree` for the
   children with `depth + 1`**. That recursion is the whole tree.
3. `PageTreeRow` is purely visual: chevron, icon, title, hover buttons.
   Indentation is `paddingLeft: depth * 16 + 4`.

Row behaviour:

- **Click** → open the page.
- **Double-click title** → swap the `<span>` for an `<input>`; Enter or blur
  commits, Escape cancels. Empty title becomes "Untitled".
- **Hover buttons** (`opacity-0 group-hover:opacity-100`): add child, delete.
- Every button handler calls `e.stopPropagation()` so clicking "+" doesn't
  also open the row.

**Why is the row "drag-agnostic" (it receives drag props instead of calling
dnd-kit itself)?** Later the same row is reused in Pages, Folders,
Favourites (which uses a different dnd-kit API) and Recent (no drag at all).
Keeping drag wiring outside the row lets one component serve all four.

---

## Step 6 — Drag to reorder and nest

Files: [`sidebar/sidebar.tsx`](../../src/components/sidebar/sidebar.tsx)
(`handleDragEnd`), [`src/lib/dnd-utils.ts`](../../src/lib/dnd-utils.ts),
`movePageToPosition` in [`pages.ts`](../../src/lib/pages.ts)

We use **@dnd-kit/core**. Each tree row is both draggable and droppable:

```tsx
const { attributes, listeners, setNodeRef: setDragRef, isDragging } =
  useDraggable({ id: node.id, data: { type: "page" } });
const { setNodeRef: setDropRef } =
  useDroppable({ id: node.id, data: { type: "page" } });
// ref={(el) => { setDragRef(el); setDropRef(el); }}
```

A `DndContext` wraps the tree, with a pointer sensor that needs 4px of
movement before a drag starts:

```ts
useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
```

**Why 4px?** Without it, every click would start a drag and clicks/
double-clicks would stop working.

### Deciding what a drop means

When a drag ends, dnd-kit gives you `active` (what was dragged) and `over`
(what it was dropped on), each with a rectangle. Two tiny helpers decide the
intent:

```ts
// dnd-utils.ts
export const NEST_THRESHOLD_PX = 28;

// Dragged noticeably to the RIGHT of the target → "put it inside"
export function isNestGesture(activeRect, overRect) {
  return activeRect.left - overRect.left > NEST_THRESHOLD_PX;
}

// Dragged item's center is below the target's middle → "insert after"
export function isAfter(activeRect, overRect) {
  return activeRect.top + activeRect.height / 2 > overRect.top + overRect.height / 2;
}
```

Then:

- **Nest:** move into `overPage` as its last child.
- **Reorder:** find `overPage`'s index among its siblings, use
  `index` or `index + 1` depending on `isAfter`, and move to that parent at
  that index.

### `movePageToPosition(activeId, newParentId, targetIndex)`

One function handles every move:

```ts
export async function movePageToPosition(activeId, newParentId, targetIndex) {
  // 1. Can't drop a page into itself or its own descendant (would create a loop)
  if (await isSameOrDescendant(activeId, newParentId)) return;

  await db.transaction("rw", db.pages, async () => {
    const activePage = await db.pages.get(activeId);
    // 2. New siblings, without the moving page, in order
    const siblings = (await db.pages.where("parentId").equals(newParentId).toArray())
      .filter((p) => p.id !== activeId)
      .sort((a, b) => a.order - b.order);
    // 3. Insert at the target index (clamped to a valid range)
    const i = Math.max(0, Math.min(targetIndex, siblings.length));
    siblings.splice(i, 0, activePage);
    // 4. Renumber 1024, 2048, …; only write rows that changed
    for (let n = 0; n < siblings.length; n++) {
      const order = (n + 1) * ORDER_STEP;
      if (siblings[n].id === activeId) {
        await db.pages.update(activeId, { parentId: newParentId, order, updatedAt: Date.now() });
      } else if (siblings[n].order !== order) {
        await db.pages.update(siblings[n].id, { order });
      }
    }
  });
}
```

**Why one function for reorder AND re-parent?** Reordering is just "move to
the same parent at a new index". One code path means one place for bugs.
**Why clamp the index?** Callers can pass a huge number to mean "at the
end" (Milestone 5's Move-to dialog passes `Number.MAX_SAFE_INTEGER`).
**Why a transaction?** If the browser dies mid-renumber, you don't end up
with two pages sharing an order.

Milestone 2 adds a `folderId` argument to this function (Chapter 02).

### Drag preview

`<DragOverlay>` renders a floating chip (icon + title) that follows the
cursor. The original row gets `opacity-40` while dragging, and the hovered
target gets a ring (`isDropTarget`). To know which row is hovered,
`onDragOver` stores `over.id` in state.

---

## Step 7 — Page view: title and icon

File: [`src/components/page-view.tsx`](../../src/components/page-view.tsx)

```tsx
export function PageView({ pageId }) {
  const page = usePage(pageId);
  const [titleDraft, setTitleDraft] = useState(page?.title ?? "");
  const isEditingTitle = useRef(false);
  const titleSaveTimeout = useRef(null);

  // Sync the draft from the DB, but NOT while the user is typing in it
  useEffect(() => {
    if (!isEditingTitle.current && page) setTitleDraft(page.title);
  }, [page]);
  …
}
```

### The title: a local draft + debounced save

- Typing updates `titleDraft` (instant) and schedules `renamePage` 250ms
  later, cancelling any earlier pending save.
- On blur, cancel the timer and save right away (trimmed; empty →
  "Untitled").

**Why a local draft instead of reading `page.title` directly?** If the input
were controlled by the database value, every keystroke would be a DB write
followed by a re-render, and a slow write could make the cursor jump or
lose characters. The draft keeps typing instant; the DB catches up.

**Why skip syncing while focused?** The live query re-runs after our own
save. If we synced then, a slightly stale value could overwrite what the
user has typed since.

The sidebar row updates as you type because it reads the same row through
`useAllPages`. No extra wiring.

(In the polish round the title became an auto-growing `<textarea>` so long
titles wrap; see Chapter 05. Start with an `<input>`.)

### The icon picker

File: [`src/components/icon-picker.tsx`](../../src/components/icon-picker.tsx)

```tsx
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });
```

- `dynamic(..., { ssr: false })` loads the (large) picker only in the
  browser, only when opened.
- The trigger shows the emoji, or a `FileText` icon when there's none.
- "Remove icon" sets `icon` back to `null`.
- The picker sits in a `Popover` (Chapter 02 explains why it's portaled).

---

## Step 8 — Block editor with autosave

File: [`src/components/editor/block-editor.tsx`](../../src/components/editor/block-editor.tsx)

Minimal version for this milestone:

```tsx
export function BlockEditor({ pageId, initialContent }) {
  const { resolvedTheme } = useTheme();
  const editor = useCreateBlockNote({
    initialContent: initialContent.length > 0 ? initialContent : undefined,
  });
  const saveTimeout = useRef(null);

  function handleChange() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      void setPageContent(pageId, editor.document);
    }, 400);
  }

  // On unmount (switching pages): if a save is pending, do it NOW
  useEffect(() => () => {
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      void setPageContent(pageId, editor.document);
    }
  }, []);

  return (
    <BlockNoteView editor={editor} onChange={handleChange}
      theme={resolvedTheme === "dark" ? "dark" : "light"} />
  );
}
```

PageView renders it as
`<BlockEditor key={pageId} pageId={pageId} initialContent={page.content} />`.

Things to understand:

- **`initialContent` is only read once**, when the editor is created. After
  that the editor owns the document. That's why we remount per page
  (`key`) rather than passing new content in.
- **`undefined` for empty content**: BlockNote throws on an empty array, so
  pass `undefined` and it creates one empty paragraph.
- **Debounce 400ms:** saving the whole document on every keystroke would
  be wasteful and would spam live queries (sidebar, search) with
  re-renders. 400ms after the last keystroke is invisible to the user.
- **Flush on unmount:** without it, typing and switching pages within
  400ms would lose the last edit. That's FEATURES test PG-02 step 2.

You get the slash menu (`/`), drag handles and Markdown shortcuts (`# `,
`- `) for free from BlockNote. Custom slash items come in Chapter 03.

---

## Step 9 — Light/dark theme

Files: [`src/app/layout.tsx`](../../src/app/layout.tsx),
[`theme-provider.tsx`](../../src/components/theme-provider.tsx),
[`theme-toggle.tsx`](../../src/components/theme-toggle.tsx),
[`globals.css`](../../src/app/globals.css)

1. Wrap the app in next-themes:
   ```tsx
   <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
   ```
   It adds/removes `class="dark"` on `<html>` and remembers the choice.
2. Add `suppressHydrationWarning` to `<html>`. next-themes sets the class
   before React hydrates (to avoid a white flash), so the server HTML and
   the client HTML differ on that one attribute. This tells React that's
   expected.
3. Define color tokens for `:root` and `.dark` and map them with
   `@theme inline` (Foundations §9). Add the custom `dark` variant.
4. Map BlockNote's CSS variables to your tokens inside `.bn-container`, and
   pass `theme={resolvedTheme}` to `BlockNoteView`.
5. The toggle button:
   ```tsx
   const [mounted, setMounted] = useState(false);
   useEffect(() => setMounted(true), []);
   if (!mounted) return <div className="h-7 w-7" />;   // placeholder, same size
   ```
   **Why?** On the server, the theme is unknown. Rendering a sun or a moon
   there would mismatch the client half the time. Render an empty box of
   the same size until mounted.

---

## Checkpoint (Milestone 1)

From FEATURES.md SB-01, PG-01, PG-02, ED-01, ST-01:

- [ ] Create a page, rename it → sidebar and page title both update.
- [ ] Create a child → appears nested. Create a grandchild → nests deeper.
- [ ] Drag a row up/down → reorders. Drag it right onto another → nests.
- [ ] Try to drag a parent into its own child → nothing happens.
- [ ] Pick an emoji → shows in the sidebar.
- [ ] Type content, reload → still there.
- [ ] Type, switch page within half a second, come back → last edit kept.
- [ ] `/` opens the slash menu; `# ` makes a heading.
- [ ] Toggle dark mode → app and editor both restyle; reload keeps it.
- [ ] `npm run lint` and `npm run build` pass.

## Gotchas from this milestone

- **Forgetting `loading`**: `useLiveQuery` returns `undefined` first. If you
  treat that as "no pages", you'll flash the empty state or pick the wrong
  initial page.
- **Restoring selection on every change** instead of once (use the ref
  guard).
- **Passing new `initialContent` to a mounted editor** does nothing. Remount
  with `key`.
- **Empty `initialContent` array** crashes BlockNote; pass `undefined`.
- **Moving a page into its own subtree** creates an orphaned loop that
  disappears from the tree. Always check `isSameOrDescendant` first.
