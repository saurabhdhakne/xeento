import { nanoid } from "nanoid";
import { db, ROOT_ID, type PageRecord } from "./db";

const ORDER_STEP = 1024;

export function emptyDocument() {
  return [{ type: "paragraph", content: [] }];
}

/**
 * Siblings for ordering purposes. At the root level, pages split into
 * independent ordered buckets by folder — unfoldered-root (folderId: null)
 * and one bucket per folder — so folderId narrows the match there. Nested
 * pages (parentId = another page) always have folderId: null and keep the
 * simple parentId-only scoping.
 */
export async function getChildren(
  parentId: string,
  folderId: string | null = null,
): Promise<PageRecord[]> {
  const items = await db.pages.where("parentId").equals(parentId).toArray();
  const scoped =
    parentId === ROOT_ID ? items.filter((p) => (p.folderId ?? null) === folderId) : items;
  return scoped.sort((a, b) => a.order - b.order);
}

export async function getPage(id: string): Promise<PageRecord | undefined> {
  return db.pages.get(id);
}

async function nextOrder(parentId: string, folderId: string | null = null): Promise<number> {
  const siblings = await getChildren(parentId, folderId);
  if (siblings.length === 0) return ORDER_STEP;
  return siblings[siblings.length - 1].order + ORDER_STEP;
}

export async function createPage(
  parentId: string = ROOT_ID,
  title = "Untitled",
): Promise<PageRecord> {
  const now = Date.now();
  const page: PageRecord = {
    id: nanoid(),
    parentId,
    folderId: null,
    title,
    icon: null,
    order: await nextOrder(parentId, null),
    content: emptyDocument(),
    tags: [],
    favourite: false,
    favouriteOrder: null,
    lastOpenedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.pages.add(page);
  return page;
}

export async function renamePage(id: string, title: string) {
  await db.pages.update(id, { title, updatedAt: Date.now() });
}

export async function setPageIcon(id: string, icon: string | null) {
  await db.pages.update(id, { icon, updatedAt: Date.now() });
}

export async function setPageContent(id: string, content: unknown) {
  await db.pages.update(id, { content, updatedAt: Date.now() });
}

export async function setPageTags(id: string, tags: string[]) {
  await db.pages.update(id, { tags, updatedAt: Date.now() });
}

/** Deliberately does NOT touch updatedAt — that field drives search's recency grouping. */
export async function touchLastOpened(id: string) {
  await db.pages.update(id, { lastOpenedAt: Date.now() });
}

export async function toggleFavourite(id: string) {
  const page = await db.pages.get(id);
  if (!page) return;
  if (page.favourite) {
    await db.pages.update(id, { favourite: false });
    return;
  }
  const favourites = (await db.pages.toArray()).filter((p) => p.favourite);
  const maxOrder = favourites.reduce((max, p) => Math.max(max, p.favouriteOrder ?? 0), 0);
  await db.pages.update(id, { favourite: true, favouriteOrder: maxOrder + ORDER_STEP });
}

export async function reorderFavourites(orderedIds: string[]) {
  await db.transaction("rw", db.pages, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.pages.update(orderedIds[i], { favouriteOrder: (i + 1) * ORDER_STEP });
    }
  });
}

export async function getDescendantIds(id: string): Promise<string[]> {
  const result: string[] = [];
  const queue = [id];
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    const children = await db.pages.where("parentId").equals(current).toArray();
    for (const child of children) {
      result.push(child.id);
      queue.push(child.id);
    }
  }
  return result;
}

export async function deletePage(id: string) {
  const descendants = await getDescendantIds(id);
  await db.pages.bulkDelete([id, ...descendants]);
}

export async function isSameOrDescendant(
  ancestorId: string,
  candidateId: string,
): Promise<boolean> {
  if (ancestorId === candidateId) return true;
  const descendants = await getDescendantIds(ancestorId);
  return descendants.includes(candidateId);
}

/**
 * Moves `activeId` so it becomes a child of `newParentId`, inserted at
 * `targetIndex` among its new siblings (0-based, excluding itself). Handles
 * same-parent reordering and cross-parent/cross-folder moves through one
 * path, and renumbers every sibling's `order` so drag targets stay stable.
 *
 * `newFolderId` is only meaningful when `newParentId === ROOT_ID` — it's
 * forced to null otherwise, enforcing the invariant that nested pages never
 * carry folder membership even if a caller passes a stale value.
 */
export async function movePageToPosition(
  activeId: string,
  newParentId: string,
  targetIndex: number,
  newFolderId: string | null = null,
) {
  if (await isSameOrDescendant(activeId, newParentId)) return;

  const effectiveFolderId = newParentId === ROOT_ID ? newFolderId : null;

  await db.transaction("rw", db.pages, async () => {
    const activePage = await db.pages.get(activeId);
    if (!activePage) return;

    const siblings = (await db.pages.where("parentId").equals(newParentId).toArray())
      .filter((p) => p.id !== activeId)
      .filter((p) => newParentId !== ROOT_ID || (p.folderId ?? null) === effectiveFolderId)
      .sort((a, b) => a.order - b.order);

    const clampedIndex = Math.max(0, Math.min(targetIndex, siblings.length));
    siblings.splice(clampedIndex, 0, activePage);

    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      const newOrder = (i + 1) * ORDER_STEP;
      if (sibling.id === activeId) {
        await db.pages.update(activeId, {
          parentId: newParentId,
          folderId: effectiveFolderId,
          order: newOrder,
          updatedAt: Date.now(),
        });
      } else if (sibling.order !== newOrder) {
        await db.pages.update(sibling.id, { order: newOrder });
      }
    }
  });
}

/**
 * Copies a page — and its whole sub-page tree — into the slot right after
 * `afterId` among that page's siblings (same parent, same folder). By
 * default that's the original itself (Duplicate); Cmd/Ctrl+V passes the
 * currently open page instead, so a copy can be pasted anywhere. Only the
 * top-level copy gets " (copy)" appended; sub-pages keep their titles.
 * Copies start un-favourited and never-opened. File references are shared
 * with the original rather than duplicated in the files table.
 */
export async function duplicatePage(
  id: string,
  afterId: string = id,
): Promise<PageRecord | undefined> {
  return db.transaction("rw", db.pages, async () => {
    const original = await db.pages.get(id);
    const anchor = await db.pages.get(afterId);
    if (!original || !anchor) return undefined;

    const now = Date.now();
    const copyOf = (page: PageRecord, parentId: string, overrides: Partial<PageRecord> = {}) => ({
      ...page,
      id: nanoid(),
      parentId,
      content: structuredClone(page.content),
      tags: [...page.tags],
      favourite: false,
      favouriteOrder: null,
      lastOpenedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });

    const root = copyOf(original, anchor.parentId, {
      folderId: anchor.parentId === ROOT_ID ? (anchor.folderId ?? null) : null,
      title: `${original.title || "Untitled"} (copy)`,
    });

    // Renumber siblings so the copy lands directly below the anchor.
    const siblings = await getChildren(anchor.parentId, root.folderId);
    const insertAt = siblings.findIndex((p) => p.id === afterId) + 1;
    siblings.splice(insertAt, 0, root);
    for (let i = 0; i < siblings.length; i++) {
      const order = (i + 1) * ORDER_STEP;
      if (siblings[i] === root) root.order = order;
      else if (siblings[i].order !== order) await db.pages.update(siblings[i].id, { order });
    }
    await db.pages.add(root);

    // `created` matters when pasting into the source's own subtree: the new
    // copies then sit under pages the walk is still visiting, and must not
    // be copied again (that would never terminate).
    const created = new Set([root.id]);
    const queue: [string, string][] = [[id, root.id]];
    while (queue.length) {
      const [fromId, toId] = queue.shift()!;
      const children = await db.pages.where("parentId").equals(fromId).toArray();
      for (const child of children) {
        if (created.has(child.id)) continue;
        const copy = copyOf(child, toId, { folderId: null });
        created.add(copy.id);
        await db.pages.add(copy);
        queue.push([child.id, copy.id]);
      }
    }
    return root;
  });
}
