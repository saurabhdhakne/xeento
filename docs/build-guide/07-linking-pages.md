# 07 — Milestone 5: Linking pages

**Goal:** pages connect to each other. Mention a page inline with `@` or
`[[`, see which pages link here ("Linked from"), embed a sub-page as a card
with `/page`, and move a page anywhere from the keyboard.

Features: ED-09 page mentions · PG-06 backlinks · ED-10 sub-page block ·
PG-07 Move to… · plus updates to SB-06/PG-05 (duplicate) and IO-01 (export)

Git commit: `Module 5` (`git show 9fba710`). Read the diff alongside this
chapter; it's only ~700 lines.

**Build order:**

```
1. usePageOrNull (loading vs deleted)            → verify: hook returns null for a trashed id
2. pageMention inline content                    → verify: chip renders, click opens
3. @ and [[ menus                                → verify: search, New page, email doesn't trigger
4. Sub-page block + /page                        → verify: card + child in sidebar
5. Backlinks                                     → verify: live list, trash hides source
6. Move to… dialog + shortcut                    → verify: folder, page, root
7. Duplicate remaps sub-page cards               → verify: copy's card opens copy's child
8. Export resolves page refs to titles           → verify: no "…" in exported .md
```

---

## The idea that makes this milestone small

Chapter 04 already built **`xeento-page://<id>` links plus one global click
listener** in AppShell that calls `openPage(id)`. Every new thing in this
milestone (mention chip, sub-page card, backlink row) simply renders an
`<a href="xeento-page://<id>">`. None of them need navigation callbacks
passed down through props. Reusing that one mechanism is why this
milestone is small.

The second idea: **store only the id, read the title live.** A mention
doesn't store "Meeting notes"; it stores `pageId`. The chip looks up the
page with a live query, so renaming the target updates every mention
instantly, and a trashed target shows "Deleted page".

---

## Step 1 — `usePageOrNull`

File: [`use-pages.ts`](../../src/lib/use-pages.ts)

```ts
/** undefined = still loading; null = the lookup finished and there's no such page */
export function usePageOrNull(id: string) {
  return useLiveQuery(async () => (await db.pages.get(id)) ?? null, [id]);
}
```

Rendering:

```tsx
{page ? page.title || "Untitled" : page === null ? "Deleted page" : "…"}
```

Because Trash *moves* pages out of the `pages` table (Chapter 06), a page in
Trash looks exactly like a deleted page here, and restoring it makes the
query return it again. No Trash-specific code needed.

---

## Step 2 — The page mention chip (custom inline content)

File: [`inline/page-mention.tsx`](../../src/components/editor/inline/page-mention.tsx)

```tsx
export const pageMentionSpec = createReactInlineContentSpec(
  { type: "pageMention", propSchema: { pageId: { default: "" } }, content: "none" },
  { render: ({ inlineContent }) => <PageMentionChip pageId={inlineContent.props.pageId} /> },
);

function PageMentionChip({ pageId }) {
  const page = usePageOrNull(pageId);
  return (
    <a href={`xeento-page://${pageId}`} contentEditable={false}
       className={`xeento-link-mention ${page === null ? "text-muted line-through" : ""}`}>
      {page?.icon ? <span>{page.icon}</span> : <FileText … />}
      <span>{page ? page.title || "Untitled" : page === null ? "Deleted page" : "…"}</span>
    </a>
  );
}
```

- `content: "none"` makes it an **atom**: the cursor treats it as one
  character; you can't edit text inside it.
- It reuses the `.xeento-link-mention` CSS from the link mention (Chapter
  05), so both chip types look alike.
- Register it in [`schema.ts`](../../src/components/editor/schema.ts)
  under `inlineContentSpecs`.

---

## Step 3 — The `@` and `[[` menus

File: [`block-editor.tsx`](../../src/components/editor/block-editor.tsx)
(`getPageMentionItems`, `atWordStart`)

BlockNote's `SuggestionMenuController` (the same component that powers the
slash menu) works with any trigger, **including multi-character ones**:

```tsx
<SuggestionMenuController triggerCharacter="@" shouldOpen={atWordStart}
  getItems={(query) => getPageMentionItems(editor, pageId, query)} />
<SuggestionMenuController triggerCharacter="[["
  getItems={(query) => getPageMentionItems(editor, pageId, query)} />
```

`query` is whatever was typed after the trigger. When an item is chosen,
BlockNote removes the trigger and query text for you (so `[[` disappears).
Suggestion menus don't open inside code blocks, so neither trigger fires
there.

### The items

```ts
async function getPageMentionItems(editor, pageId, query) {
  if (/^\s/.test(query)) return [];          // "@ " (space first) isn't a mention → no items → menu closes
  const q = query.trim().toLowerCase();
  const mention = (id) =>
    editor.insertInlineContent([{ type: "pageMention", props: { pageId: id } }, " "]);

  const matches = (await getAllPages())
    .filter((p) => p.id !== pageId && (p.title || "Untitled").toLowerCase().includes(q))  // not itself
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))   // recently opened first
    .slice(0, 10);

  return [
    ...matches.map((p) => ({ title: p.title || "Untitled", icon: …, group: "Link to page",
      onItemClick: () => mention(p.id) })),
    { title: q ? `New page "${query.trim()}"` : "New page", group: "Create",
      onItemClick: () => void createPage(pageId, query.trim() || "Untitled").then((p) => mention(p.id)) },
  ];
}
```

Note `getAllPages()` is a plain function from `pages.ts` (not a hook),
because this runs in a callback, not during render. Sorting by
`lastOpenedAt` makes the page you were just looking at the top suggestion,
which is usually the one you want. A trailing space is inserted after the
chip so you can keep typing.

**"New page"** creates a **sub-page of the current page** titled with what
you typed, then links to it. That makes "write `@Meeting notes`, create it
on the spot" a single gesture.

### Don't trigger on email addresses

```ts
function atWordStart(tr) {
  const before = tr.selection.$from.nodeBefore?.text;
  return !before || /\s$/.test(before);     // at block start, or right after whitespace
}
```

`shouldOpen` gets the ProseMirror transaction. `$from.nodeBefore` is the
text node just before the cursor. If its last character isn't whitespace
(as in `me@`), the menu doesn't open. `[[` doesn't need this, because it
never appears in normal text.

---

## Step 4 — The sub-page block (`/page`)

File: [`blocks/sub-page-block.tsx`](../../src/components/editor/blocks/sub-page-block.tsx)

```tsx
export const subPageBlockSpec = createReactBlockSpec(
  { type: "subPage", propSchema: { pageId: { default: "" } }, content: "none" },
  { render: ({ block }) => <SubPageCard pageId={block.props.pageId} /> },
);
// SubPageCard: same idea as the chip, but a full-width row: icon + underlined title
```

The slash item creates the page **first**, then inserts the card:

```ts
{
  title: "Page", subtext: "Create a sub-page and show it here",
  aliases: ["page", "subpage", "sub-page", "child"], group: "Basic blocks",
  onItemClick: () => {
    void createPage(pageId).then((page) =>
      insertOrUpdateBlockForSlashMenu(editor, { type: "subPage", props: { pageId: page.id } }));
  },
}
```

Design decisions (from FEATURES ED-10):

- **The card is only a link.** Deleting the card leaves the page in the
  sidebar. Pages created from the sidebar don't get a card. **Why?**
  Keeping the page tree and the document content in sync both ways is a
  big source of bugs (what happens on undo? on drag? on paste into another
  page?). One-way is predictable.
- Cards **don't** count as backlinks (it's structure, not a reference).

---

## Step 5 — Backlinks ("Linked from")

Files: [`backlinks.tsx`](../../src/components/backlinks.tsx),
`pageLinkIds` in [`block-text.ts`](../../src/lib/block-text.ts)

### Extract outgoing links from content

Same walking pattern as `blockNoteToPlainText` (Chapter 02):

```ts
function walkInlineLinks(nodes, out: Set<string>) {
  for (const node of nodes) {
    if (node.type === "pageMention" && node.props?.pageId) out.add(node.props.pageId);
    if (node.type === "link" && node.href?.startsWith("xeento-page://"))
      out.add(node.href.slice("xeento-page://".length));         // e.g. from Notion import
    if (Array.isArray(node.content)) walkInlineLinks(node.content, out);
  }
}
export function pageLinkIds(blocks): Set<string> { … walk blocks and children … }
```

### Compute backlinks on the fly

```tsx
export function Backlinks({ pageId }) {
  const pages = useAllPages();
  const sources = useMemo(() => (pages ?? [])
      .filter((p) => p.id !== pageId && pageLinkIds(p.content).has(pageId))
      .sort((a, b) => (a.title || "Untitled").localeCompare(b.title || "Untitled")),
    [pages, pageId]);
  if (sources.length === 0) return null;     // hidden when nothing links here
  …"Linked from · N", each row an <a href="xeento-page://id">…
}
```

**Why no backlinks table/index?** It'd have to be kept in sync on every
content save, rename, delete, restore, import and backup restore. Scanning
all pages is fast for a personal workspace and **can't go stale**. It's
live (the `useAllPages` query re-runs on any change), and pages in Trash
are naturally excluded.

If the workspace grew to tens of thousands of pages, this is the first
thing you'd optimize (e.g. store `linkIds` on each page when saving).

Rendered under the editor in PageView, `print:hidden`.

---

## Step 6 — The Move to… dialog

Files: [`move-to-dialog.tsx`](../../src/components/move-to-dialog.tsx),
shortcut in [`app-shell.tsx`](../../src/components/app-shell.tsx),
menu item in [`export-menu.tsx`](../../src/components/export-menu.tsx)

The keyboard alternative to dragging. Structure is the same as the command
palette (input, filtered list, ↑/↓/Enter/Esc, clamped active index).

### Building the list of targets

```ts
// 1. Exclude the page itself and its whole subtree (BFS over the in-memory pages)
//    — moving into your own descendant would create a loop.
// 2. "Pages" (root)    — unless the page is already at root with no folder
// 3. Every folder      — except the one it's already in
// 4. Every other page  — except the current parent; sorted by title,
//                        each with its path (reuses getPagePath from search)
```

Each target carries the `parentId` and `folderId` it means:

| Target | parentId | folderId |
|---|---|---|
| Pages | `ROOT_ID` | `null` |
| A folder | `ROOT_ID` | folder id |
| A page | that page's id | `null` |

### Doing the move

```ts
function handleMove(target) {
  onClose();
  void movePageToPosition(pageId, target.parentId, Number.MAX_SAFE_INTEGER, target.folderId)
    .then(() => toast.info(`Moved to ${target.label}`));
}
```

`Number.MAX_SAFE_INTEGER` as the index means "at the end", because
`movePageToPosition` clamps the index (Chapter 01). The page stays open,
and AppShell's "keep the selected page visible" effect expands the new
ancestors automatically.

### The shortcut

In AppShell's global keydown handler, checked **before** Cmd+K:

```ts
if (e.shiftKey && e.key.toLowerCase() === "m") { e.preventDefault(); setMoveOpen(true); }
```

It works even inside the editor (Shift+Cmd+M isn't a text-editing shortcut).
The "…" menu item shows the platform-correct hint (`⇧⌘M` or
`Ctrl+Shift+M`). The dialog only renders when a page is selected.

Small UX detail: the active row scrolls into view with a callback ref,
`ref={isActive ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}`.

---

## Step 7 — Duplicate remaps sub-page cards

File: `remapSubPageIds` in [`pages.ts`](../../src/lib/pages.ts)

Problem: you duplicate page A. A's content has a `/page` card pointing at
its child B. The copy A′ has a copied child B′, but A′'s card still points
at **B**, the original.

Fix: while copying, record `originalId → copyId` in a map, then rewrite
every `subPage` block's `pageId` through it:

```ts
const idMap = new Map([[id, root.id]]);
// …during the BFS: idMap.set(child.id, copy.id)
for (const copy of copies) remapSubPageIds(copy.content, idMap);

function remapSubPageIds(blocks, idMap) {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    const target = block?.type === "subPage" ? block.props?.pageId : undefined;
    if (target && idMap.has(target)) block.props.pageId = idMap.get(target);
    remapSubPageIds(block?.children, idMap);
  }
}
```

Mutating in place is fine here because the content was already
`structuredClone`d for the copy.

**Page mentions are deliberately *not* remapped.** A mention is a reference
to "that page over there". A sub-page card represents "my child". After
duplication the copy's children are the copied ones, but a mention of some
other page should still point at that page.

---

## Step 8 — Export turns page references into titles

File: [`export/resolve-page-refs.ts`](../../src/lib/export/resolve-page-refs.ts)

The chip and card render their titles with a **React hook**
(`usePageOrNull`). The headless export editor (Chapter 04) has no React and
no database access, so they'd export as "…".

Fix: before converting to Markdown, replace them with plain text:

```ts
export function resolvePageRefs(blocks, titles: Map<string, string>) {
  const titleOf = (id) => titles.get(id ?? "") ?? "Deleted page";
  const text = (value) => ({ type: "text", text: value, styles: {} });
  const inline = (nodes) =>
    nodes.map((n) => (n?.type === "pageMention" ? text(titleOf(n.props?.pageId)) : n));

  function walk(block) {
    const next = block?.type === "subPage"
      ? { ...block, type: "paragraph", props: {}, content: [text(titleOf(block.props?.pageId))] }
      : { ...block };
    if (Array.isArray(next.content)) next.content = inline(next.content);
    else if (next.content?.type === "tableContent") { /* same, for every table cell */ }
    if (Array.isArray(next.children)) next.children = next.children.map(walk);
    return next;
  }
  return Array.isArray(blocks) ? blocks.map(walk) : [];
}
```

- Mentions → inline text. Sub-page cards → a paragraph with the title.
- **Tables** store content differently (`{ type: "tableContent", rows: [{
  cells: [...] }] }`), and each cell can be an inline array or an object
  with `content`. Easy to forget; mentions inside tables would otherwise
  export as "…".
- Export builds the `id → title` map once (`getPageTitles()`) and pipes it
  through: `rewriteFileRefs(resolvePageRefs(page.content, titles), prefix)`.

Known limitation (FEATURES): links become plain titles, not links between
the exported `.md` files.

---

## Checkpoint (Milestone 5)

From FEATURES.md ED-09, ED-10, PG-06, PG-07:

- [ ] `@` + part of a title → menu, Enter → chip. `[[` → same, `[[`
      removed.
- [ ] Click the chip → opens. Rename the target → chip updates.
- [ ] `@Meeting notes` → "New page" → sub-page created and linked.
- [ ] `me@example.com` → no menu. `@ ` → menu closes. In a code block →
      no menu.
- [ ] Trash the target → "Deleted page", struck through. Restore → normal.
- [ ] `/page` → card + sidebar child. Delete the card → page stays.
- [ ] Mention B from A → B shows "Linked from · 1". Trash A → gone.
- [ ] Cmd/Ctrl+Shift+M → move to a folder, under a page, back to Pages.
      The page and its sub-pages never appear as targets.
- [ ] Duplicate a page with a `/page` card → the copy's card opens the
      copy's sub-page.
- [ ] Export a page with a mention and a card → titles appear in the `.md`.

## Gotchas from this milestone

- Treating "loading" and "deleted" the same (`undefined`) → chips flash
  "Deleted page" on every load.
- `@` opening inside email addresses.
- Two-way syncing cards with the page tree → endless edge cases. Keep it
  one-way.
- A backlinks index that goes stale; computing on read can't.
- Forgetting table cells when transforming content.
- Remapping mentions on duplicate (they should keep their targets).
