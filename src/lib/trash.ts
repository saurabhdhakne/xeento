import { getDb } from "./db";
import { ROOT_ID } from "./records";
import { deleteUnusedFiles } from "./files";
import { getDescendantIds, nextOrder } from "./pages";

const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Moves a page and all its sub-pages out of the workspace into one Trash entry. */
export async function trashPage(id: string) {
  const db = getDb();
  await db.transaction("rw", db.pages, db.trash, async () => {
    const page = await db.pages.get(id);
    if (!page) return;
    const descendantIds = await getDescendantIds(id);
    const descendants = await db.pages.bulkGet(descendantIds);
    await db.trash.put({
      id,
      deletedAt: Date.now(),
      pages: [page, ...descendants.filter((p) => p !== undefined)],
    });
    await db.pages.bulkDelete([id, ...descendantIds]);
  });
}

/**
 * Puts a Trash entry back, appended after its old siblings. If its parent
 * page or folder no longer exists, it lands at the top level of Pages.
 */
export async function restoreFromTrash(id: string) {
  const db = getDb();
  await db.transaction("rw", db.pages, db.folders, db.trash, async () => {
    const entry = await db.trash.get(id);
    if (!entry) return;
    const [top, ...descendants] = entry.pages;

    const parentExists = top.parentId === ROOT_ID || (await db.pages.get(top.parentId)) !== undefined;
    const parentId = parentExists ? top.parentId : ROOT_ID;
    const folderId =
      parentId === ROOT_ID && top.folderId && (await db.folders.get(top.folderId)) ? top.folderId : null;

    await db.pages.bulkAdd([
      { ...top, parentId, folderId, order: await nextOrder(parentId, folderId) },
      ...descendants,
    ]);
    await db.trash.delete(id);
  });
}

export async function deleteFromTrash(id: string) {
  const db = getDb();
  await db.trash.delete(id);
  await deleteUnusedFiles();
}

export async function emptyTrash() {
  const db = getDb();
  await db.trash.clear();
  await deleteUnusedFiles();
}

/** Permanently deletes Trash entries older than 30 days. */
export async function purgeExpiredTrash() {
  const db = getDb();
  await db.trash.where("deletedAt").below(Date.now() - TRASH_TTL_MS).delete();
}
