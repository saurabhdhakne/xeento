import { nanoid } from "nanoid";
import { db, ROOT_ID, type FolderRecord } from "./db";
import { getChildren, getDescendantIds, movePageToPosition } from "./pages";

const ORDER_STEP = 1024;

export async function getAllFolders(): Promise<FolderRecord[]> {
  return (await db.folders.toArray()).sort((a, b) => a.order - b.order);
}

export async function createFolder(name = "New folder"): Promise<FolderRecord> {
  const existing = await getAllFolders();
  const order = existing.length === 0 ? ORDER_STEP : existing[existing.length - 1].order + ORDER_STEP;
  const folder: FolderRecord = { id: nanoid(), name, order, collapsed: false };
  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(id: string, name: string) {
  await db.folders.update(id, { name });
}

export async function setFolderCollapsed(id: string, collapsed: boolean) {
  await db.folders.update(id, { collapsed });
}

export async function reorderFolders(orderedIds: string[]) {
  await db.transaction("rw", db.folders, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.folders.update(orderedIds[i], { order: (i + 1) * ORDER_STEP });
    }
  });
}

/**
 * Deletes a folder. In "moveToRoot" mode, the folder's direct pages are
 * re-homed into the unfoldered-root bucket via movePageToPosition (awaited
 * sequentially, not in parallel, so each insertion sees the effect of the
 * previous one) rather than a bare `folderId: null` flip — a flip would
 * collide with order values already in use in that bucket, since each
 * (parentId, folderId) combination keeps its own independent order
 * sequence starting at ORDER_STEP.
 */
export async function deleteFolder(id: string, mode: "moveToRoot" | "deleteContents") {
  await db.transaction("rw", db.pages, db.folders, async () => {
    const directPages = await getChildren(ROOT_ID, id);

    if (mode === "deleteContents") {
      const allIds = new Set<string>();
      for (const page of directPages) {
        allIds.add(page.id);
        for (const descendantId of await getDescendantIds(page.id)) {
          allIds.add(descendantId);
        }
      }
      await db.pages.bulkDelete([...allIds]);
    } else {
      const rootSiblingCountBefore = (await getChildren(ROOT_ID, null)).length;
      for (let i = 0; i < directPages.length; i++) {
        await movePageToPosition(directPages[i].id, ROOT_ID, rootSiblingCountBefore + i, null);
      }
    }

    await db.folders.delete(id);
  });
}
