# 03 — Milestone 3 (part 1): Files and media blocks

**Goal:** pages can hold real files and rich media. Drop a PDF, image,
video, audio or any file onto a page; write highlighted code; embed
YouTube/Spotify/Figma or any web page. With no backend.

Features: ED-02 file drop and storage · ED-03 file block · ED-04 PDF block ·
ED-05 video/audio · ED-06 code block · ED-07 embed block

**Build order:**

```
1. Schema v3: files table                         → verify: blob row in DevTools
2. "Upload" = store blob, return xeento-file://id → verify: image block shows after reload
3. resolveFileUrl + object-URL cache              → verify: no leaked URLs on page switch
4. The single editor schema                       → verify: custom blocks appear in /menu
5. Drop zone (files → right block type)           → verify: drop pdf/mp4/mp3/zip
6. File block with size label                     → verify: name + size
7. PDF block (pdf.js, lazy pages, resize)         → verify: big PDF scrolls smoothly
8. Code block (Shiki + copy + line numbers)       → verify: /code, toggle theme
9. Embed block (provider mapping)                 → verify: YouTube, Spotify, plain site
10. Custom slash menu items                       → verify: /pdf, /embed, /bookmark
```

---

## Step 1 — Schema v3: store file bytes in IndexedDB

File: [`src/lib/db.ts`](../../src/lib/db.ts)

```ts
export interface FileRecord {
  id: string; name: string; mimeType: string; size: number;
  blob: Blob;           // the actual bytes
  createdAt: number;
}

db.version(3).stores({
  pages: "id, parentId, folderId, order, updatedAt",
  folders: "id, order",
  files: "id, mimeType, createdAt",
});
```

IndexedDB stores `Blob`s natively (a `File` is a `Blob`), so there's no
base64 encoding and no size blow-up.

**Why not put the bytes inside the page's content?** Content is saved on
every keystroke (debounced). Re-writing a 20MB PDF each time would be
horribly slow. Files live in their own table; content holds only a tiny
reference.

---

## Step 2 — "Uploading" without a server

Files: [`src/lib/files.ts`](../../src/lib/files.ts) (`storeFile`),
[`src/lib/upload-file.ts`](../../src/lib/upload-file.ts),
[`src/lib/use-files.ts`](../../src/lib/use-files.ts)

```ts
const WARN_BYTES = 25 * 1024 * 1024;
const REJECT_BYTES = 100 * 1024 * 1024;

export async function storeFile(file: File) {
  if (file.size > REJECT_BYTES) { toast.error(…); throw new Error("File too large"); }
  if (file.size > WARN_BYTES)   toast.warn(…);   // still stored
  const record = { id: nanoid(), name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size, blob: file, createdAt: Date.now() };
  await db.files.add(record);
  return record;
}

export const FILE_URL_SCHEME = "xeento-file://";
export const fileUrl = (id: string) => `${FILE_URL_SCHEME}${id}`;

export async function uploadFileToFileStore(file: File): Promise<string> {
  const record = await storeFile(file);
  return fileUrl(record.id);       // e.g. "xeento-file://V1StGXR8_Z5jdHi6B"
}
```

BlockNote has an `uploadFile` option: "given a File, return a URL string".
We give it `uploadFileToFileStore`. Every built-in image/video/audio/file
block's "Upload" tab now saves into IndexedDB and stores
`xeento-file://<id>` as its `url` prop.

**Without `uploadFile`, BlockNote hides the Upload tab entirely** and only
offers "Embed URL".

**Why the 100MB limit?** IndexedDB *can* store more, but the bytes also
have to sit in memory to display, back up and export. 100MB keeps the tab
responsive.

---

## Step 3 — Turning `xeento-file://` back into something displayable

BlockNote's other hook, `resolveFileUrl`, is "given the stored url, return
a URL the browser can load". BlockNote calls it for **every** file-type
block's rendering **and** its download button.

```ts
// use-files.ts
export function createFileUrlResolver() {
  const cache = new Map<string, string>();   // fileId → blob: URL

  async function resolve(rawUrl: string) {
    const fileId = parseFileUrl(rawUrl);
    if (!fileId) return rawUrl;              // https://… passes through untouched
    const cached = cache.get(fileId);
    if (cached) return cached;
    const file = await getFile(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    const objectUrl = URL.createObjectURL(file.blob);   // "blob:http://localhost:3000/…"
    cache.set(fileId, objectUrl);
    return objectUrl;
  }

  function revokeAll() {
    for (const url of cache.values()) URL.revokeObjectURL(url);
    cache.clear();
  }
  return { resolve, revokeAll };
}
```

In `BlockEditor`:

```tsx
const [fileResolver] = useState(() => createFileUrlResolver());  // one per editor
const editor = useCreateBlockNote({
  schema: xeentoSchema,
  uploadFile: uploadFileToFileStore,
  resolveFileUrl: fileResolver.resolve,
  …
});
// in the unmount cleanup:
fileResolver.revokeAll();
```

**What's an object URL?** `URL.createObjectURL(blob)` gives a temporary URL
pointing at in-memory bytes. `<img src>`, `<video src>` and downloads all
work with it. It lives until you revoke it or the tab closes, and holds
the memory until then.

**Why a cache?** BlockNote may resolve the same URL many times while
rendering. Creating a new object URL each time would leak memory.

**Why revoke on unmount?** Remember PageView remounts the editor per page
(`key`). So "unmount" = "this page is no longer shown", which is exactly
when its blob URLs can be freed.

**Why `useState(() => …)` and not `useRef`?** It's created once, never
changes, and is read during render (passed to `useCreateBlockNote`).
Reading a ref during render is discouraged by React's lint rules; a lazy
state value is fine.

**Hosted URLs** (`https://…`) work the same way: `resolve` just returns
them unchanged. So every block supports both local and hosted files with
one code path.

---

## Step 4 — The single schema

File: [`src/components/editor/schema.ts`](../../src/components/editor/schema.ts)

```ts
export const xeentoSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    file: fileBlockSpec(),      // overrides BlockNote's file block
    pdf: pdfBlockSpec(),
    embed: embedBlockSpec(),
    codeBlock: codeBlockSpec,   // overrides BlockNote's code block
    // bookmark (Ch. 05), subPage (Ch. 07)
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    // linkMention (Ch. 05), pageMention (Ch. 07)
  },
});
type XeentoEditor = typeof xeentoSchema.BlockNoteEditor;
```

Pass `schema: xeentoSchema` to `useCreateBlockNote`. **Every** place that
creates an editor (live editor, print layout, headless export editor in
Chapter 04) must use this same object, or custom blocks won't survive.

### Anatomy of a custom block

```tsx
export const pdfBlockSpec = createReactBlockSpec(
  {
    type: "pdf",
    propSchema: { url: { default: "" }, name: { default: "" }, height: { default: 480 } },
    content: "none",   // no editable text inside; "inline" would allow text
  },
  {
    render: ({ block, editor }) => <PdfBlockRender block={block} editor={editor} />,
    toExternalHTML: …   // optional: what Markdown/HTML export should produce
  },
);
```

- `propSchema` defines what's saved in the JSON. Defaults matter: old
  blocks missing a new prop get the default.
- To change a prop from inside the block: `editor.updateBlock(block.id, { props: { … } })`.
  That goes through the editor's normal change → autosave path.
- Interactive parts of a block's UI should have `contentEditable={false}`,
  so typing in them doesn't confuse the editor.

---

## Step 5 — Drop zone: files become blocks

Files: [`editor/file-drop-zone.tsx`](../../src/components/editor/file-drop-zone.tsx),
[`src/lib/block-type-for-file.ts`](../../src/lib/block-type-for-file.ts)

```ts
export function blockTypeForFile(file: File) {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  return "file";
}
```

`FileDropZone` wraps the editor, shows a dashed "Drop files" overlay while
an OS file is dragged over it, and calls `onDropFiles(files)` on drop. Three
tricks inside:

1. **Only react to file drags:**
   `e.dataTransfer.types.includes("Files")`. BlockNote's own block
   drag-handle also uses drag events; those must pass through untouched.
2. **Capture phase** (`onDropCapture`, `onDragOverCapture`, …) so our
   handler runs *before* BlockNote's. Otherwise BlockNote also handles the
   drop and the file gets inserted twice.
3. **A drag depth counter** instead of a boolean. `dragenter`/`dragleave`
   fire for every child element you pass over, so a boolean flickers off
   as you move across the editor. Count enters minus leaves; show the
   overlay while the count is above 0.

The editor's drop handler inserts blocks one after another:

```ts
async function handleDropFiles(files: File[]) {
  let refId = editor.getTextCursorPosition().block.id;
  for (const file of files) {
    const url = await uploadFileToFileStore(file);
    const [inserted] = editor.insertBlocks(
      [{ type: blockTypeForFile(file), props: { url, name: file.name } }], refId, "after");
    refId = inserted.id;     // next file goes after this one, keeping drop order
  }
}
```

The same `FileDropZone` is reused around the sidebar for importing `.md`/
`.zip` files (Chapter 04), with a different message.

---

## Step 6 — File block (with a size label)

File: [`editor/blocks/file-block.tsx`](../../src/components/editor/blocks/file-block.tsx)

BlockNote's default file block has no size display. Instead of rewriting
it, we **reuse its config and wrapper** and only replace the inner render:

```tsx
function FileBlockRender({ block, editor }) {
  const file = useFile(parseFileUrl(block.props.url));   // live query
  return (
    <FileBlockWrapper block={block} editor={editor}>     {/* BlockNote's: upload/embed tabs, toolbar */}
      <FileNameWithIcon block={block} />
      {file && <span>{formatBytes(file.size)}</span>}
    </FileBlockWrapper>
  );
}
export const fileBlockSpec = createReactBlockSpec(defaultBlockSpecs.file.config, {
  render: FileBlockRender,
});
```

**Lesson:** reuse what the library gives you and change the smallest
piece. Rename, caption, replace, delete and download all keep working.

Video and audio (ED-05) need **no code at all**: BlockNote's default
blocks plus our `resolveFileUrl` already play local and hosted files.

---

## Step 7 — PDF block

Files: [`blocks/pdf-block.tsx`](../../src/components/editor/blocks/pdf-block.tsx),
[`blocks/pdf-viewer.tsx`](../../src/components/editor/blocks/pdf-viewer.tsx),
[`src/lib/pdf.ts`](../../src/lib/pdf.ts),
[`scripts/copy-pdf-worker.mjs`](../../scripts/copy-pdf-worker.mjs)

**Why not just `<iframe src={pdfUrl}>`?** Browser PDF viewers differ, some
won't render blob URLs in iframes, and they don't follow our theme or allow
inline sizing. pdf.js draws pages onto `<canvas>`, the same everywhere.

### 7a. The pdf.js worker

pdf.js parses PDFs in a Web Worker. Bundlers handle worker imports
unreliably, so we copy the worker file to `public/` and point at it:

```js
// package.json:  "postinstall": "node scripts/copy-pdf-worker.mjs"
// the script copies node_modules/pdfjs-dist/build/pdf.worker.min.mjs → public/
```
```ts
// pdf.ts
GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
export const loadPdfDocument = (url: string) => getDocument({ url }).promise;
```

Running it on `postinstall` means it updates automatically when pdfjs-dist
is upgraded.

### 7b. The block

- Empty state: an "Upload PDF" file input, or paste a PDF URL.
- Once there's a `url`, resolve it with `editor.resolveFileUrl` (the same
  resolver as Step 3) inside an effect, then render `<PdfViewer>`.
- Effects that do async work use a `cancelled` flag so a late result from an
  old `url` can't overwrite a newer one:
  ```ts
  useEffect(() => {
    let cancelled = false;
    resolve(url).then((r) => { if (!cancelled) setResolvedUrl(r); });
    return () => { cancelled = true; };
  }, [url]);
  ```

### 7c. Lazy page rendering

A 300-page PDF rendered all at once would freeze the tab. Each page is a
`PdfPage` component that waits until it's near the visible area:

```ts
const observer = new IntersectionObserver(
  (entries) => {
    if (entries.some((e) => e.isIntersecting)) { setShouldRender(true); observer.disconnect(); }
  },
  { root: scrollContainer, rootMargin: "300px" },   // start 300px before it's visible
);
```

When `shouldRender` turns true:

1. `doc.getPage(n)`, get its natural size (`getViewport({ scale: 1 })`).
2. Pick a scale so it fits the container width (capped 0.5×–2.5×, max 900px).
3. Size the canvas and `page.render({ canvas, canvasContext, viewport })`.
4. On cleanup, `renderTask.cancel()` so unmounting mid-render doesn't throw.

Pages are lazy but **not virtualized** (rendered canvases stay in the DOM).
That's a known limitation for very large PDFs.

### 7d. Resizable height

A thin handle under the viewer. On mousedown, attach `mousemove`/`mouseup`
listeners to `window` (so the drag keeps working when the cursor leaves the
handle), compute `startHeight + (y - startY)`, clamp to 200–1200px, and
`editor.updateBlock(id, { props: { height } })`. Because the height is a
block prop, it's saved with the page.

Toolbar: "open full screen" (`window.open(url)`) and "download"
(`<a href={url} download={name}>`).

---

## Step 8 — Code block

Files: [`blocks/code-block.tsx`](../../src/components/editor/blocks/code-block.tsx),
code-block CSS in [`globals.css`](../../src/app/globals.css)

### 8a. Base: BlockNote's code block + Shiki

```ts
import { createCodeBlockSpec } from "@blocknote/core";
import { codeBlockOptions, syntaxHighlighter } from "@blocknote/code-block";

const supportedLanguages = {
  ...codeBlockOptions.supportedLanguages,
  go: { name: "Go", aliases: ["golang"] },   // the only one missing from the default set
};
const baseSpec = createCodeBlockSpec({
  indentLineWithTab: true,
  defaultLanguage: codeBlockOptions.defaultLanguage,
  supportedLanguages,
});
```

And in the editor: `extensions: [syntaxHighlighter]`. That gives the
language dropdown, highlighting, Tab-indent and light/dark themes. `/code`
and ` ``` ` work out of the box.

### 8b. Adding copy + line numbers around it

This block isn't React; BlockNote renders it as plain DOM
(`{ dom, contentDOM }`, where `contentDOM` is the part ProseMirror edits).
We wrap that DOM:

```
div.xeento-code-block
├── div.xeento-code-toolbar   (contentEditable=false)  [line-numbers] [copy]
└── div.xeento-code-row  (flex)
    ├── div.xeento-code-gutter  (contentEditable=false)  1 2 3 …
    └── div.xeento-code-content
        └── base.dom   ← BlockNote's own <pre>, untouched
```

**Rule: never put anything inside the `<pre>` ProseMirror manages.**
ProseMirror watches that DOM; foreign nodes inside it cause cursor bugs and
content corruption. The gutter is a *sibling* column instead.

Line numbers: count `contentDOM.textContent.split("\n").length` and rebuild
the gutter only when the count changes. This runs in the block's
`update()` hook (called by ProseMirror when the block changes).
`marginTop` is set to the language dropdown's height so "1" lines up with
the first line of code.

Copy: `navigator.clipboard.writeText(contentDOM.textContent)`, then swap
the icon to a checkmark for 1.2s.

### 8c. The `render.call` gotcha

```ts
const base = render.call(
  { blockContentDOMAttributes: {}, renderType: "dom", props: undefined },
  block, editor,
);
```

BlockNote's generated `render` function reads `this.blockContentDOMAttributes`.
Calling it as `render(block, editor)` loses `this` and throws "Cannot read
properties of undefined". BlockNote itself calls it with `.call({...})`, so
we do the same. (You'd only find this by reading BlockNote's source,
which is exactly what to do when a library throws from inside itself.)

The "convert selection to code block" dropdown entry came later (Chapter 05).

---

## Step 9 — Embed block

Files: [`blocks/embed-block.tsx`](../../src/components/editor/blocks/embed-block.tsx),
[`src/lib/embed-providers.ts`](../../src/lib/embed-providers.ts),
[`src/lib/youtube.ts`](../../src/lib/youtube.ts)

The block stores only `url`. All the intelligence is a pure function that
maps a page URL to something an `<iframe>` can show:

```ts
export function getIframeEmbed(rawUrl: string): IframeEmbed | null {
  // invalid or non-http(s) → null
  // YouTube watch / youtu.be / shorts / embed → youtube.com/embed/<id>, 16:9
  // vimeo.com/<id>        → player.vimeo.com/video/<id>, 16:9
  // loom.com/share/<id>   → loom.com/embed/<id>, 16:9
  // open.spotify.com/<kind>/<id> → open.spotify.com/embed/<kind>/<id>,
  //                                 152px tall for track/episode, 352 otherwise
  // soundcloud.com/…      → w.soundcloud.com/player/?url=…, 166px
  // figma.com/file|design|proto|board/… → figma.com/embed?url=…, 16:9
  // anything else         → iframe the page itself, 480px
}
```

**Why a pure function in `lib/`?** It's easy to read, easy to extend with a
new provider, and it's reused by the paste-URL menu (Chapter 05).

Video players use CSS `aspect-ratio: 16 / 9` so they scale with width;
audio players use a fixed height.

**Many sites refuse to be iframed** (`X-Frame-Options` / CSP
`frame-ancestors`), and the browser shows a blank or error box. JavaScript
can't reliably detect that, so the block *always* shows an "open" link with
the URL under the iframe.

Direct media links (`.mp4`, `.mp3`, `.png`, `.pdf`…) should use the native
block instead of an iframe:

```ts
export function directMediaBlockType(rawUrl): "image" | "video" | "audio" | "pdf" | null
  // looks at the URL path's extension
```

`toExternalHTML` renders `<p><a href=url>url</a></p>` so Markdown export
keeps the link instead of dropping the block.

---

## Step 10 — Custom slash menu items

File: [`block-editor.tsx`](../../src/components/editor/block-editor.tsx)

BlockNote's default slash menu has a **fixed list** of its own blocks. Your
custom blocks don't appear automatically. So:

```tsx
<BlockNoteView editor={editor} slashMenu={false}>      {/* turn the default off */}
  <SuggestionMenuController
    triggerCharacter="/"
    getItems={async (query) =>
      filterSuggestionItems(
        [...getDefaultReactSlashMenuItems(editor), ...getCustomSlashMenuItems(editor)],
        query,
      )}
  />
</BlockNoteView>
```

A custom item:

```ts
{
  title: "PDF", subtext: "Embed a PDF file", aliases: ["pdf"], group: "Media",
  icon: <FileText size={18} />,
  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "pdf" }),
}
```

`insertOrUpdateBlockForSlashMenu` replaces the current block if it's empty
(just the `/pdf` you typed) or inserts after it otherwise. `aliases` make
`/youtube` find "Embed".

---

## Checkpoint (Milestone 3, part 1)

- [ ] Drag a file over the page → overlay. Drop a `.pdf`, `.mp4`, `.mp3`,
      `.zip` → PDF viewer, video, audio, file block.
- [ ] Reload → all still display (blobs came back from IndexedDB).
- [ ] 30MB file → warning toast, stored. 100MB+ → error toast, rejected.
- [ ] File block shows name and size; download works.
- [ ] Scroll a long PDF → pages appear as you reach them. Resize, reload →
      height kept.
- [ ] `/code`, pick Python → highlighted. Toggle line numbers. Copy. Tab
      indents. Dark mode switches highlight theme.
- [ ] `/embed` with YouTube, a Spotify track, a plain website, and an
      `.mp4` URL.
- [ ] Reorder a block with the drag handle → not inserted twice.

## Gotchas from this milestone

- No `uploadFile` option → BlockNote hides upload entirely.
- Bubble-phase drop handler → file inserted twice.
- Boolean "is dragging" flag → overlay flickers.
- Forgetting to revoke object URLs → memory grows with every page visit.
- Mutating ProseMirror's `<pre>` → cursor jumps and corrupted text.
- Calling BlockNote's generated `render` without `this`.
- pdf.js worker missing from `public/` → "Setting up fake worker" and slow
  or broken PDFs. Re-run `node scripts/copy-pdf-worker.mjs`.
