# 05 — Polish round (after Milestone 3)

**Goal:** the app *feels* good. These are smaller features and fixes that
came from actually using it. Several of them teach patterns you'll reuse
everywhere: portals, capture-phase listeners, "latest callback" refs,
working with ProseMirror positions, and a safe server-side fetcher.

From FEATURES.md's "Post-Milestone 3" changelog:

| Change | Feature | Section |
|---|---|---|
| Default icon is `FileText` everywhere | PG-01, SB-02 | §1 |
| Star moved to its own sticky toolbar row; fixed open-sidebar button | PG-04, SB-07 | §1 |
| Sidebar resizable (220–480px) | SB-07 | §2 |
| Recent order fixed until reload | SB-05 | Chapter 02 Step 5 |
| Right-click menu with Duplicate | SB-06 | §3, §4 |
| Recent rows get full page actions | SB-05 | Chapter 02 Step 5 |
| Keyboard copy/paste of pages | PG-05 | §5 |
| Drag rows from anywhere | SB-02 | §6 |
| Long titles wrap | PG-01 | §7 |
| Convert selection to code block | ED-06 | §8 |
| Paste URL menu (Mention / Bookmark / Embed / URL) | ED-08 | §9, §10 |

---

## §1 — Small visual fixes

- **One default icon.** Pages without an emoji show lucide's `FileText`
  icon in every place (sidebar sections, page header, Trash, backlinks).
  Consistency beats a random emoji placeholder.
- **Sticky toolbar.** In PageView, the star and "…" menu sit in their own
  full-width row: `sticky top-0 z-20 bg-background`. It sticks to the top
  of `<main>` (the scroll container). `bg-background` is required, or
  content shows through as it scrolls under it. `print:hidden` keeps it out
  of PDFs.
- **Fixed open-sidebar button.** When the sidebar is collapsed, the button
  to reopen it is `position: fixed` (top-left), so it's still reachable
  after scrolling a long page.

---

## §2 — Resizable sidebar

File: [`sidebar.tsx`](../../src/components/sidebar/sidebar.tsx) (`handleResizeStart`),
[`use-local-storage-number.ts`](../../src/lib/use-local-storage-number.ts)

A 6px handle on the sidebar's right edge. The pattern (same as the PDF
height handle):

```ts
function handleResizeStart(e: React.MouseEvent) {
  e.preventDefault();
  setIsResizing(true);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";       // don't select text while dragging

  function onMove(ev: MouseEvent) {
    setWidth(Math.min(480, Math.max(220, ev.clientX)));   // sidebar starts at x=0
  }
  function onUp() {
    setIsResizing(false);
    document.body.style.cursor = ""; document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
```

- Listeners go on `window`, not the handle, so fast mouse movement that
  leaves the 6px handle keeps resizing.
- The width transition is turned off while resizing (`isResizing`),
  otherwise the sidebar lags behind the cursor.
- The width is saved with `useLocalStorageNumber` (the numeric twin of the
  flag hook from Chapter 02).

---

## §3 — Right-click context menu

File: [`ui/context-menu.tsx`](../../src/components/ui/context-menu.tsx)

```tsx
onContextMenu={(e) => { e.preventDefault(); setMenuAt({ x: e.clientX, y: e.clientY }); }}
…
<ContextMenu position={menuAt} onClose={() => setMenuAt(null)}>
  <ContextMenuItem icon={<Copy />} label="Duplicate" onSelect={…} />
</ContextMenu>
```

Like Popover, it's **portaled to `document.body`** (the sidebar is
`overflow-hidden`). Positioning is at the cursor, then **clamped** so it
never goes off-screen:

1. First render: invisible (`visibility: hidden`) at the click point, so it
   can be measured.
2. `useLayoutEffect`: measure `offsetWidth/Height`, clamp x/y into the
   viewport with an 8px margin, make it visible. This happens before paint,
   so no flicker.

It closes on outside mousedown, Escape, scroll or resize.

---

## §4 — Duplicate a page (with its whole subtree)

File: `duplicatePage` in [`pages.ts`](../../src/lib/pages.ts)

`duplicatePage(id, afterId = id)` copies page `id` and all its
descendants, and inserts the copy **right after `afterId`** among
`afterId`'s siblings. Duplicate passes nothing (copy lands under the
original); keyboard paste (§5) passes the open page.

```ts
return db.transaction("rw", db.pages, async () => {
  const original = await db.pages.get(id);
  const anchor = await db.pages.get(afterId);
  if (!original || !anchor) return undefined;

  const copyOf = (page, parentId, overrides = {}) => ({
    ...page,
    id: nanoid(), parentId,
    content: structuredClone(page.content),   // deep copy, not a shared reference
    tags: [...page.tags],
    favourite: false, favouriteOrder: null, lastOpenedAt: null,   // fresh page
    createdAt: now, updatedAt: now,
    ...overrides,
  });

  // 1. The top copy goes next to the ANCHOR, in the anchor's parent/folder
  const root = copyOf(original, anchor.parentId, {
    folderId: anchor.parentId === ROOT_ID ? anchor.folderId : null,
    title: `${original.title || "Untitled"} (copy)`,
  });
  // 2. Splice it in after the anchor and renumber the siblings
  // 3. Breadth-first walk of the ORIGINAL's subtree, copying each child
  //    under its parent's copy (sub-pages keep their titles)
  // 4. Add all copies at once
  await db.pages.bulkAdd(copies);
  return root;
});
```

Design decisions worth understanding:

- **Copies are collected first, added at the end.** If you paste a page
  *inside its own subtree* and added copies during the walk, the walk would
  find the new copies as children and copy them again, forever. Building
  the whole list before writing anything makes that impossible.
- **`structuredClone` the content.** A shallow copy would share nested
  arrays between the original and the copy in memory.
- **Files are shared, not copied.** Both pages reference the same
  `xeento-file://id`. Cheaper, and the cleanup in Milestone 4 only deletes
  a file once *nothing* references it.
- **Fresh metadata:** the copy isn't a favourite, isn't in Recent, and
  isn't opened automatically by Duplicate.
- Milestone 5 adds one more step: sub-page cards inside the copies are
  remapped to point at the copied children (Chapter 07).

---

## §5 — Copy and paste pages with the keyboard

File: [`app-shell.tsx`](../../src/components/app-shell.tsx)

With a page open and **nothing being typed**, Cmd/Ctrl+C remembers the page
and Cmd/Ctrl+V pastes a full copy after whatever page is open now.

```ts
const copiedPageIdRef = useRef<string | null>(null);   // in-app clipboard, cleared on reload

useEffect(() => {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  function onKeyDown(e: KeyboardEvent) {
    if (!(isMac ? e.metaKey : e.ctrlKey) || e.shiftKey || e.altKey || e.repeat) return;
    const key = e.key.toLowerCase();
    if (key !== "c" && key !== "v") return;
    if (isTypingContext()) return;          // let normal text copy/paste work

    if (key === "c") { … copiedPageIdRef.current = selectedId; toast.info("Page copied …"); return; }
    const sourceId = copiedPageIdRef.current;
    if (!sourceId) return;
    e.preventDefault();
    void duplicatePage(sourceId, selectedId ?? sourceId).then((copy) => {
      if (copy) openPageRef.current(copy.id);
      else toast.error("The copied page no longer exists");
    });
  }
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [selectedId]);

function isTypingContext() {
  const active = document.activeElement;
  if (active && (active.isContentEditable || active.closest("input, textarea, select"))) return true;
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed;        // some text is selected somewhere
}
```

Details:

- **Mac uses Cmd only, others Ctrl only.** Ctrl+C on a Mac is not "copy",
  so it shouldn't trigger.
- **`e.repeat`** ignores the auto-repeat from holding the key (otherwise
  holding Cmd+V would paste dozens of copies).
- **`isTypingContext`** is what keeps this from breaking normal copy/paste
  in the editor, the title, tag input and search.

### The stale-closure problem and `openPageRef`

The listener is set up in an effect. It captures the variables from the
render it was created in. `openPage` reads `allPages`, which changes all
the time. If the listener called `openPage` directly, it would use an old
`allPages`.

The fix used throughout the app:

```ts
const openPageRef = useRef(openPage);
useEffect(() => { openPageRef.current = openPage; });   // after every render, no deps
// listeners call openPageRef.current(id)
```

The ref always points at the latest function, and the listener never has
to be re-registered. You'll see the same pattern in the paste-URL menu
(`chooseRef`, `activeRef`).

---

## §6 — Drag rows from anywhere

File: `rowDragListeners` in [`dnd-utils.ts`](../../src/lib/dnd-utils.ts)

At first rows had a small grip icon. Now the **whole row** is the drag
handle (dnd-kit listeners spread on the row). Two kinds of events must
*not* start a drag, so the listeners are wrapped:

```ts
export function rowDragListeners(listeners) {
  if (!listeners) return undefined;
  return Object.fromEntries(Object.entries(listeners).map(([name, handler]) => [
    name,
    (event) => {
      const target = event.target as HTMLElement;
      // 1. Events from a PORTAL (emoji picker, context menu) bubble through
      //    React to the row even though they're not inside it in the DOM.
      if (!event.currentTarget.contains(target)) return;
      // 2. Dragging inside the rename input should select text.
      if (target.closest("input, textarea")) return;
      handler(event);
    },
  ]));
}
```

**The portal lesson:** React propagates events along the **React** tree,
not the DOM tree. A portal rendered "inside" a row in JSX, but attached to
`document.body`, still bubbles its events up through the row's React
handlers. `currentTarget.contains(target)` is a DOM check that filters those
out.

The 4px activation distance (Chapter 01) keeps click, double-click and the
row's buttons working.

---

## §7 — Titles that wrap

File: `TitleField` in [`page-view.tsx`](../../src/components/page-view.tsx)

An `<input>` can't wrap, so long titles got clipped. A `<textarea>` wraps,
but it's multi-line and fixed-height. The solution makes a textarea behave
like a one-line field that grows:

```tsx
function fitHeight() {
  el.style.height = "auto";                  // shrink first, so it can get smaller
  el.style.height = `${el.scrollHeight}px`;  // then grow to fit the content
}
useLayoutEffect(fitHeight, [value]);         // on every change, before paint

useEffect(() => {                            // re-wrap when the WIDTH changes
  const observer = new ResizeObserver(fitHeight);
  observer.observe(el);
  return () => observer.disconnect();
}, []);

<textarea rows={1} value={value}
  onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, " "))}   // pasted newlines → space
  onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}      // Enter adds nothing
  className="resize-none overflow-hidden …" />
```

**Why `ResizeObserver`?** Window resizes and sidebar drags change the width
without changing the text, so the height must be re-measured on size
changes too.

---

## §8 — Convert a selection to a code block

File: `getBlockTypeSelectItems` in [`block-editor.tsx`](../../src/components/editor/block-editor.tsx)

The formatting toolbar's block-type dropdown (Paragraph, Heading,
Quote, List…) didn't include "Code block". Worse, on a code block the
dropdown disappeared entirely, because it only shows when the current
block matches one of its items.

```tsx
function getBlockTypeSelectItems(editor) {
  return [...blockTypeSelectItems(editor), { name: "Code block", type: "codeBlock", icon: Code }];
}

<BlockNoteView formattingToolbar={false} …>
  <FormattingToolbarController
    formattingToolbar={(props) =>
      <FormattingToolbar {...props} blockTypeSelectItems={getBlockTypeSelectItems(editor)} />}
  />
```

Same approach as the slash menu: turn off the default, render BlockNote's
own controller with one extra item. No `props` on the item, so it matches a
code block in any language. Converting drops inline formatting (bold,
links), because code blocks hold plain text.

---

## §9 — Paste a URL: Mention / Bookmark / Embed / URL

Files: `pasteHandler` in [`block-editor.tsx`](../../src/components/editor/block-editor.tsx),
[`paste-url-menu.tsx`](../../src/components/editor/paste-url-menu.tsx),
[`inline/link-mention.tsx`](../../src/components/editor/inline/link-mention.tsx),
[`blocks/bookmark-block.tsx`](../../src/components/editor/blocks/bookmark-block.tsx),
[`src/lib/link-preview.ts`](../../src/lib/link-preview.ts)

When you paste a bare URL, it's inserted as a normal link **and** a small
menu appears offering other forms. This is the most intricate editor
feature, so take it slowly.

### 9a. Intercept the paste

BlockNote's `pasteHandler` option runs on every paste:

```ts
pasteHandler: ({ event, editor, defaultPasteHandler }) => {
  const url = parsePastedUrl(event.clipboardData?.getData("text/plain"));
  const { selection } = editor.prosemirrorState;
  const block = editor.getTextCursorPosition().block;
  // Not a bare URL, text is selected, in a code block, or in a table → normal paste
  if (!url || !selection.empty || block.type === "codeBlock" || !Array.isArray(block.content)) {
    return defaultPasteHandler();
  }
  const from = selection.from;
  editor.insertInlineContent([{ type: "link", href: url, content: url }], { updateSelection: true });
  const to = editor.prosemirrorState.selection.from;
  void fetchLinkPreview(url);                    // start fetching NOW (prefetch)
  setPastedUrl({ url, from, to, blockId: block.id });   // opens the menu
  return true;                                    // we handled it
}
```

- `parsePastedUrl` accepts only a single `http(s)` URL with no spaces.
- With text selected, the default handler turns the selection into a link,
  which is what people expect.
- `!Array.isArray(block.content)` excludes tables (their content is an
  object, not an array).
- `from` and `to` are **ProseMirror positions**: integer offsets into the
  whole document. They mark exactly where the link text now sits.

### 9b. The menu

`PasteUrlMenu` is portaled to `document.body`, positioned under the end of
the link using `editor.prosemirrorView.coordsAtPos(to)` (flipped above if
it would go off the bottom; repositioned on scroll/resize).

Keyboard handling is a **capture-phase** listener on `window`:

```ts
window.addEventListener("keydown", onKeyDown, true);   // true = capture
// ↑/↓ change the active option, Enter/Tab choose, Escape closes —
//   each with preventDefault + stopPropagation so the editor never sees them.
// Any other key (except modifiers) closes the menu and goes through to the editor.
```

**Why capture phase?** ProseMirror also listens for Enter and arrow keys.
Capture-phase listeners on `window` run *before* the editor's, so the menu
can claim those keys while it's open. Typing anything else just dismisses
it; the URL stays a plain link.

### 9c. The safety check: is the link still there?

Between pasting and choosing, the document can change (an undo, a click
elsewhere and typing…). Replacing `[from, to)` blindly could delete the
wrong text. So every option first checks:

```ts
function linkStillInPlace() {
  try { return editor.prosemirrorState.doc.textBetween(pasted.from, pasted.to) === pasted.url; }
  catch { return false; }
}
```

If not, the menu just closes. Mention re-checks **after** awaiting the
preview, because the wait gives the user time to edit.

### 9d. What each option does

- **URL:** close the menu. The link is already there.
- **Mention:** replace the link text with a `linkMention` inline node plus
  a space, in one ProseMirror transaction:
  ```ts
  editor.transact((tr) => tr.replaceWith(from, to, [
    pmSchema.nodes.linkMention.create({ url, title: preview.title, favicon: preview.favicon }),
    pmSchema.text(" "),
  ]));
  ```
- **Bookmark / Embed:** delete the link text, then:
  - if the paragraph is now empty → **replace** it with the new block
  - otherwise → **insert** the new block after it (the rest of the
    sentence stays)
  - Embed of a direct media URL (`.mp4`, `.png`…) becomes the native
    video/image/audio/PDF block via `directMediaBlockType`.

### 9e. Link mention (inline content)

```ts
export const linkMentionSpec = createReactInlineContentSpec(
  { type: "linkMention", propSchema: { url: {default:""}, title: {default:""}, favicon: {default:""} },
    content: "none" },     // an "atom": no editable text inside
  {
    render: ({ inlineContent }) => <a href={url} contentEditable={false} className="xeento-link-mention"
       onClick={(e) => { e.preventDefault(); window.open(url, "_blank", "noopener,noreferrer"); }}>
       <Favicon src={favicon} /> <span>{title || url}</span></a>,
    toExternalHTML: ({ inlineContent }) => <a href={url}>{title || url}</a>,   // Markdown: [title](url)
  },
);
```

- Title and favicon are **stored in the props** at creation time, so the
  chip never refetches on reload.
- Clicks inside a contenteditable editor aren't reliably followed, so the
  click is handled explicitly with `window.open`.
- Search indexes the mention's title (the `linkMention` case in
  `block-text.ts`).

### 9f. Bookmark block

Props: `url, title, description, image, favicon, loaded`.

- When `url` is set and `loaded` is false, fetch the preview once and save
  it into the props with `loaded: true` (even if the fetch failed, so it
  never refetches on every open).
- Before updating, check `editor.getBlock(block.id)` still exists (the user
  may have deleted it while the fetch was in flight).
- While loading: grey pulsing placeholder lines.
- `Favicon` falls back to a globe icon when the image fails to load
  (`onError`). Same for a broken og:image: it hides itself.

### 9g. Client-side preview cache

```ts
const cache = new Map<string, Promise<LinkPreview>>();   // one request per URL per session

export function fetchLinkPreview(url) {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((data) => ({ ...fallbackLinkPreview(url), ...stripEmpty(data) }))
      .catch(() => fallbackLinkPreview(url));     // NEVER rejects
    cache.set(url, pending);
  }
  return pending;
}
```

- **Caching the promise** (not the result) means a second caller while the
  first request is still running shares the same request.
- **Never rejects:** on any failure you get a usable fallback (hostname as
  title, `/favicon.ico`). Callers don't need try/catch.
- Paste triggers the fetch immediately, so by the time you pick Mention,
  the data is usually ready.

---

## §10 — The link-preview API route (the only server code)

File: [`src/app/api/link-preview/route.ts`](../../src/app/api/link-preview/route.ts)

**Why a server route at all?** A browser page can't read another site's
HTML (CORS blocks it). A server can fetch anything. So the client asks
`/api/link-preview?url=…` and the route returns
`{ url, title, description, image, favicon, siteName }`.

### Security: don't become an SSRF proxy

A route that fetches any URL a user gives it can be abused to reach
**internal** addresses: `http://127.0.0.1:…`, `http://192.168.1.1`, cloud
metadata at `169.254.169.254`. This is called SSRF (server-side request
forgery). The route defends against it:

1. **Only `http:`/`https:`.**
2. **Resolve the hostname with DNS and check every IP** before fetching:
   ```ts
   const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
   if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new Error("Refusing …");
   ```
   `isPrivateAddress` rejects `0.x`, `10.x`, `127.x`, `100.64–127.x`,
   `169.254.x`, `172.16–31.x`, `192.168.x`, multicast/reserved (≥224), and
   IPv6 loopback/private/link-local (`::1`, `fc..`, `fd..`, `fe80..`,
   `ff..`), including IPv4-mapped IPv6 (`::ffff:127.0.0.1`).
3. **Follow redirects manually** (`redirect: "manual"`), up to 4 hops, and
   **re-check the host on every hop**. Otherwise a public URL could
   redirect to `http://127.0.0.1`.
4. **6-second timeout** (`AbortSignal.timeout`).
5. **Read at most 2MB, and stop at `</head>`.** Meta tags are in the head;
   no need to download the page body. (2MB because YouTube puts its OG
   tags ~800KB in, after inline scripts.) The search for `</head>` only
   scans the new chunk plus 7 overlap characters, not the whole buffer
   each time.
6. Non-HTML responses (e.g. a PDF link): cancel the body and use the file
   name as the title.

### Parsing

No HTML parser dependency, just regexes over the `<head>`:

- Collect every `<meta>` into a map keyed by `property`/`name`/`itemprop`.
- `title` = `og:title` → `twitter:title` → `<title>`.
- `description` = `og:description` → `twitter:description` → `description`.
- `image` = `og:image` → `og:image:url` → `twitter:image`.
- **Favicon scoring:** prefer a plain `rel="icon"` over `apple-touch-icon`,
  and `.svg`/`.png` over `.ico`. Fallback `/favicon.ico`.
- Relative URLs are made absolute against the final URL (`new URL(href, base)`),
  and only `http(s)` results are kept.
- Decode HTML entities (`&amp;`, `&#39;`, `&#x27;`) in titles.

Responses get `Cache-Control: public, max-age=3600`.

Test the protection:
`curl "localhost:3000/api/link-preview?url=http%3A%2F%2F127.0.0.1"` →
"Refusing to fetch a private or local address".

---

## Checkpoint (polish round)

- [ ] Right-click a row near the window edge → menu fully on screen.
- [ ] Duplicate a page with sub-pages → independent copies, under the
      original, "(copy)" only on the top one.
- [ ] Cmd/Ctrl+C then V with no focus → copy after the open page. Inside
      the editor → normal text copy/paste.
- [ ] Drag a row by its title → moves. Drag inside the rename input →
      selects text. Scroll the emoji picker → no drag.
- [ ] A very long title wraps; Enter does nothing; resizing re-wraps.
- [ ] Select text → dropdown has "Code block"; convert and back.
- [ ] Paste `https://github.com/vercel/next.js` → menu → Mention, Bookmark,
      Embed, URL each work. Escape keeps a plain link.
- [ ] Paste mid-sentence → Bookmark → card after the paragraph, text kept.
- [ ] The `curl` SSRF check above is refused.

## Gotchas from this round

- Portal events bubble through React parents.
- Event listeners registered once capture stale values: use a ref to the
  latest callback.
- Adding duplicated pages while still walking the tree → infinite copies.
- Replacing a stored ProseMirror range without re-checking it.
- Bubble-phase key handling loses to the editor's own handlers.
- A URL-fetching server route without SSRF checks (including on
  redirects) is a security hole.
