# 06 — Milestone 4: Data safety

**Goal:** you can't lose work by accident. The browser is asked not to
evict the data, deleted pages go to a Trash you can restore from, unused
files are cleaned up safely, and the whole workspace can be backed up and
restored losslessly.

Features: DS-01 persistent storage · DS-02 Trash · DS-03 unused file
cleanup · DS-04 full backup and restore

Git commit: `Milestone 4` (`git show 8df8955 --stat` shows every file it
touched; a great way to study one milestone in isolation).

**Build order:**

```
1. Fix toasts (mount ToastHost)                → verify: any toast shows
2. Persistent storage request                  → verify: navigator.storage.persisted()
3. Schema v4 + trash functions                 → verify: delete → row moves to trash table
4. Switch every delete path to Trash           → verify: sidebar, Recent, folder delete
5. Trash dialog (restore / delete / empty)     → verify: restore lands at end of siblings
6. Unused-file cleanup                         → verify: DevTools createdAt trick
7. Backup and restore                          → verify: full round-trip
```

---

## Step 1 — The toast system (and the bug that hid it)

File: [`ui/toast.tsx`](../../src/components/ui/toast.tsx),
[`app/layout.tsx`](../../src/app/layout.tsx)

The toast system is a tiny **module-level store**, so any code (even
non-React code in `src/lib/`, like `storeFile`) can show a toast:

```ts
let toasts: ToastItem[] = [];
const listeners = new Set<(t: ToastItem[]) => void>();

function push(kind, message) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  toasts = [...toasts, { id, kind, message }];
  emit();
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit(); }, 5000);
}
export const toast = { info: (m) => push("info", m), warn: …, error: … };

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => { listeners.add(setItems); return () => { listeners.delete(setItems); }; }, []);
  … render items bottom-right …
}
```

**The bug:** `ToastHost` was never rendered anywhere, so every toast since
Milestone 3 (file too large, import failed…) silently did nothing. The fix
was one line: render `<ToastHost />` in the root layout.

**Lesson:** a pub/sub system fails silently when nobody subscribes. When
something "just doesn't appear", check that its host component is mounted.

---

## Step 2 — Ask for persistent storage

File: [`app-shell.tsx`](../../src/components/app-shell.tsx)

By default, browser storage is "best effort": under disk pressure the
browser may delete a site's IndexedDB without asking. For a notes app
that's catastrophic.

```ts
useEffect(() => {
  void navigator.storage?.persist?.();
  …
}, []);
```

- Chrome/Edge decide silently (based on engagement, bookmarks, installed
  PWA). Firefox may show a permission prompt.
- The optional chaining (`?.`) keeps older browsers from crashing.
- If refused, nothing changes. It's a request, not a guarantee, which is
  exactly why backups (Step 7) exist too.

Check in the console: `await navigator.storage.persisted()`.

---

## Step 3 — Trash: data model and functions

Files: [`db.ts`](../../src/lib/db.ts), [`trash.ts`](../../src/lib/trash.ts),
[`use-trash.ts`](../../src/lib/use-trash.ts)

### The key design decision

Two common ways to build a trash:

| Option | How | Problem |
|---|---|---|
| A. Soft-delete flag | add `deleted: true` to pages | **Every** query (tree, search, favourites, recent, backlinks, mention menu, move dialog…) must remember to filter it out. Forget once → deleted pages leak into the UI. |
| B. Move to a separate table | copy the rows into `trash`, delete them from `pages` | Restoring must put them back carefully. |

Xeento uses **B**. Deleted pages simply aren't in `pages` anymore, so no
other code needs to know Trash exists.

```ts
/** One deleted page with its whole sub-page tree, exactly as it was. */
export interface TrashRecord {
  id: string;            // the deleted (top) page's id
  deletedAt: number;
  pages: PageRecord[];   // the top page first, then its descendants
}

db.version(4).stores({
  …previous tables unchanged…,
  trash: "id, deletedAt",
});
```

**Why one entry per deleted page (with its subtree inside)?** Deleting a
page with 10 sub-pages is one action for the user, so it's one Trash entry
to restore. The sub-pages keep their own `parentId`s, so the tree rebuilds
itself on restore.

### `trashPage`

```ts
export async function trashPage(id: string) {
  await db.transaction("rw", db.pages, db.trash, async () => {
    const page = await db.pages.get(id);
    if (!page) return;
    const descendantIds = await getDescendantIds(id);
    const descendants = await db.pages.bulkGet(descendantIds);
    await db.trash.put({ id, deletedAt: Date.now(),
      pages: [page, ...descendants.filter((p) => p !== undefined)] });
    await db.pages.bulkDelete([id, ...descendantIds]);
  });
}
```

The transaction matters: either the pages are in Trash *and* gone from the
tree, or nothing happened. Never both, never neither.

### `restoreFromTrash`

```ts
const [top, ...descendants] = entry.pages;
// Does the old parent still exist? (It might itself be in Trash, or gone.)
const parentExists = top.parentId === ROOT_ID || (await db.pages.get(top.parentId)) !== undefined;
const parentId = parentExists ? top.parentId : ROOT_ID;
// Old folder still exists? Only meaningful at the root.
const folderId = parentId === ROOT_ID && top.folderId && (await db.folders.get(top.folderId))
  ? top.folderId : null;

await db.pages.bulkAdd([
  { ...top, parentId, folderId, order: await nextOrder(parentId, folderId) },  // append at the end
  ...descendants,                                                               // unchanged
]);
await db.trash.delete(id);
```

- **Fallback to the top level** if the parent or folder is gone, so a
  restored page is never orphaned (invisible).
- **Append at the end** of its old siblings instead of its old position:
  the old order number might collide with pages added since.
- Favourite status, tags, icon and content are restored as they were.

### The rest

```ts
deleteFromTrash(id)  → db.trash.delete(id), then deleteUnusedFiles()
emptyTrash()         → db.trash.clear(),    then deleteUnusedFiles()
purgeExpiredTrash()  → db.trash.where("deletedAt").below(now - 30 days).delete()
useTrash()           → live query, newest first: orderBy("deletedAt").reverse()
```

`purgeExpiredTrash` uses the `deletedAt` index, which is why it's in the
schema string.

---

## Step 4 — Route every delete through Trash

- **AppShell `handleDelete`** (used by every sidebar section):
  ```ts
  const descendants = await getDescendantIds(id);
  const deletedIds = new Set([id, ...descendants]);
  await trashPage(id);
  toast.info("Moved to Trash");
  if (selectedId && deletedIds.has(selectedId)) {
    setSelectedId(target.parentId !== ROOT_ID ? target.parentId : null);
  }
  ```
  Collect descendant ids **before** trashing (afterwards they're gone), so
  you can tell whether the open page was inside the deleted subtree.
- **Folder "delete pages too"**: `trashPage` for each direct page, so each
  becomes its own Trash entry (Chapter 02 Step 2).
- No confirm dialog on delete. Since it's recoverable, a toast is enough.
  Confirms are kept for the irreversible actions (delete forever, empty).

On load, AppShell runs `purgeExpiredTrash().then(deleteUnusedFiles)`.

---

## Step 5 — The Trash dialog

File: [`sidebar/trash-dialog.tsx`](../../src/components/sidebar/trash-dialog.tsx)

- A "Trash N" button in the sidebar footer (N from `useTrash()?.length`).
- The dialog lists entries: icon, title, "Deleted <date>" and
  "· N sub-pages" (`entry.pages.length - 1`).
- Restore button; Delete-forever button (with `window.confirm`); "Empty
  trash" (with confirm).
- Escape and backdrop click close it.

Because pages in Trash aren't in the `pages` table, other features react
correctly with no extra code: a page mention to a trashed page shows
"Deleted page" (Milestone 5), backlinks from trashed pages disappear, and
restoring brings both back.

---

## Step 6 — Cleaning up unused files

File: `deleteUnusedFiles` in [`files.ts`](../../src/lib/files.ts)

Deleting an image block doesn't delete its bytes from the `files` table.
That's deliberate (undo would otherwise break). But without cleanup the
database grows forever.

```ts
const FILE_REF = /xeento-file:\/\/([\w-]+)/g;
const UNUSED_GRACE_MS = 24 * 60 * 60 * 1000;

export async function deleteUnusedFiles() {
  await db.transaction("rw", db.files, db.pages, db.trash, async () => {
    const used = new Set<string>();
    const collect = (content) => {
      for (const m of JSON.stringify(content ?? null).matchAll(FILE_REF)) used.add(m[1]);
    };
    await db.pages.each((page) => collect(page.content));
    await db.trash.each((entry) => entry.pages.forEach((p) => collect(p.content)));

    const oldIds = await db.files.where("createdAt").below(Date.now() - UNUSED_GRACE_MS).primaryKeys();
    await db.files.bulkDelete(oldIds.filter((id) => !used.has(id)));
  });
}
```

Three decisions:

1. **Search the JSON as a string with a regex**, instead of walking block
   types. Any block type, now or in future, that stores
   `xeento-file://…` anywhere is counted. A walker that only knew today's
   block types could delete files used by tomorrow's blocks.
2. **Pages in Trash count as "used".** Otherwise restoring a page would
   bring back broken images.
3. **Never delete files less than 24 hours old.** A just-uploaded file
   isn't referenced until the editor's 400ms autosave runs, and an import
   stores its files *before* creating the pages that reference them. A
   cleanup running in that window would delete them. The grace period makes
   the race impossible.

It runs on load (after the 30-day purge), and after delete-forever / empty
trash.

**How to test it** (from FEATURES DS-03): drop an image, delete the block,
then in DevTools set that file row's `createdAt` to two days ago and
reload. The file is gone.

---

## Step 7 — Full backup and restore

Files: [`src/lib/backup.ts`](../../src/lib/backup.ts),
[`settings-menu.tsx`](../../src/components/settings-menu.tsx)

**Why another export?** Markdown export (Chapter 04) is for reading
elsewhere. It's lossy: no ids, no favourites, no Trash, media becomes
links. A backup must restore *exactly*.

### Format

```
xeento-backup-2026-10-23.zip
├── backup.json     { app: "xeento", version: 1, exportedAt,
│                     pages: [...], folders: [...], trash: [...],
│                     files: [{ id, name, mimeType, size, createdAt }] }   ← no bytes here
└── files/
    ├── <fileId>    raw bytes
    └── …
```

File bytes go in the zip as real files, not base64 in the JSON (JSON can't
hold binary; base64 would add 33% and load everything as one giant
string).

The `app` and `version` fields let restore reject zips that aren't Xeento
backups, and let a future format change be detected.

### Download with feedback

The zip is built in memory before the download can start, so a large
workspace looks like "nothing happened" for a while:

```ts
export async function downloadBackup() {
  let sizeLabel = "";
  const slowWarning = setTimeout(() => toast.warn(`… still hasn't started after 30 seconds …`), 30_000);
  try {
    await buildAndDownloadBackup((totalBytes) => {
      sizeLabel = formatBytes(totalBytes);
      toast.info(`Preparing backup (${sizeLabel})… the download starts when it's ready.`);
    });
  } finally {
    clearTimeout(slowWarning);     // always cancel, success or failure
  }
}
```

The settings menu catches errors and shows "Couldn't create the backup…".

### Restore: read first, then write

```ts
export async function restoreBackup(zipFile: File) {
  const zip = await JSZip.loadAsync(zipFile);
  const json = await zip.file("backup.json")?.async("string");
  if (!json) throw new Error("Not a Xeento backup");
  const manifest = JSON.parse(json);
  if (manifest.app !== "xeento" || manifest.version !== 1) throw new Error("Not supported");

  // Read EVERY blob BEFORE opening the transaction
  const files = [];
  for (const meta of manifest.files) {
    const bytes = await zip.file(`files/${meta.id}`)?.async("blob");
    if (bytes) files.push({ ...meta, blob: new Blob([bytes], { type: meta.mimeType }) });
  }

  await db.transaction("rw", db.pages, db.folders, db.files, db.trash, async () => {
    await Promise.all([db.pages.clear(), db.folders.clear(), db.files.clear(), db.trash.clear()]);
    await db.pages.bulkAdd(manifest.pages);
    await db.folders.bulkAdd(manifest.folders);
    await db.files.bulkAdd(files);
    await db.trash.bulkAdd(manifest.trash);
  });
}
```

**The IndexedDB transaction gotcha (important!):** a transaction
**auto-commits** as soon as the event loop is idle with no pending database
requests. If you `await zip.file(...).async("blob")` *inside* the
transaction, JSZip's work isn't a database request, so the transaction
commits halfway, and the next write throws `TransactionInactiveError`. You
could end up with a cleared workspace and nothing restored. So: do all
non-database async work first, then open the transaction and only touch
the database inside it.

**Validate before touching anything.** Every check that can throw runs
before the transaction, so a bad zip leaves the workspace untouched.

In the UI: a hidden file input, a `window.confirm` warning that restore
**replaces** everything, then `window.location.reload()` on success (the
simplest way to reset all UI state: selection, expanded nodes, Recent
snapshot). On failure: "isn't a valid Xeento backup" toast.

---

## Checkpoint (Milestone 4)

- [ ] Any toast appears bottom-right (e.g. drop a 30MB file).
- [ ] Delete a page with sub-pages → toast, "Trash 1", gone from the tree.
- [ ] Restore → back at the end of its old siblings with content, tags,
      icon and star.
- [ ] Delete a page in a folder, delete the folder (move pages), restore
      the page → lands in Pages.
- [ ] Delete forever and Empty trash both ask first.
- [ ] Set a Trash entry's `deletedAt` to 31 days ago in DevTools, reload →
      gone.
- [ ] Unused-file cleanup: the DevTools `createdAt` test (DS-03).
- [ ] Backup → change things → restore → exactly the backed-up state,
      media and Trash included.
- [ ] Restore a random zip → error toast, nothing changed.

## Gotchas from this milestone

- An unmounted subscriber (ToastHost) makes a whole feature silently dead.
- A soft-delete flag means every query must remember it; moving rows out
  avoids that.
- Restoring under a parent/folder that no longer exists → invisible
  orphan.
- Cleanup racing with autosave or import → freshly uploaded files deleted.
- Awaiting non-IndexedDB work inside a Dexie transaction → it commits
  early.
