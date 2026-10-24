import { nanoid } from "nanoid";
import { getDb } from "./db";
import { ROOT_ID, type PageRecord } from "./records";

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
  const db = getDb();
  const items = await db.pages.where("parentId").equals(parentId).toArray();
  const scoped =
    parentId === ROOT_ID ? items.filter((p) => (p.folderId ?? null) === folderId) : items;
  return scoped.sort((a, b) => a.order - b.order);
}

export async function getPage(id: string): Promise<PageRecord | undefined> {
  const db = getDb();
  return db.pages.get(id);
}

export async function getAllPages(): Promise<PageRecord[]> {
  const db = getDb();
  return db.pages.toArray();
}

export async function nextOrder(parentId: string, folderId: string | null = null): Promise<number> {
  const siblings = await getChildren(parentId, folderId);
  if (siblings.length === 0) return ORDER_STEP;
  return siblings[siblings.length - 1].order + ORDER_STEP;
}

export async function createPage(
  parentId: string = ROOT_ID,
  title = "Untitled",
): Promise<PageRecord> {
  const db = getDb();
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
  const db = getDb();
  await db.pages.update(id, { title, updatedAt: Date.now() });
}

export async function setPageIcon(id: string, icon: string | null) {
  const db = getDb();
  await db.pages.update(id, { icon, updatedAt: Date.now() });
}

export async function setPageContent(id: string, content: unknown) {
  const db = getDb();
  await db.pages.update(id, { content, updatedAt: Date.now() });
}

export async function setPageTags(id: string, tags: string[]) {
  const db = getDb();
  await db.pages.update(id, { tags, updatedAt: Date.now() });
}

/** Deliberately does NOT touch updatedAt — that field drives search's recency grouping. */
export async function touchLastOpened(id: string) {
  const db = getDb();
  await db.pages.update(id, { lastOpenedAt: Date.now() });
}

export async function toggleFavourite(id: string) {
  const db = getDb();
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
  const db = getDb();
  await db.transaction("rw", db.pages, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.pages.update(orderedIds[i], { favouriteOrder: (i + 1) * ORDER_STEP });
    }
  });
}

export async function getDescendantIds(id: string): Promise<string[]> {
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
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
    // Copies are only added once the walk is done, so pasting into the
    // source's own subtree never makes the walk visit (and re-copy) them.
    const copies = [root];
    const idMap = new Map([[id, root.id]]);
    const queue: [string, string][] = [[id, root.id]];
    while (queue.length) {
      const [fromId, toId] = queue.shift()!;
      const children = await db.pages.where("parentId").equals(fromId).toArray();
      for (const child of children) {
        const copy = copyOf(child, toId, { folderId: null });
        copies.push(copy);
        idMap.set(child.id, copy.id);
        queue.push([child.id, copy.id]);
      }
    }
    // Sub-page cards inside the copied tree point at the copied children.
    for (const copy of copies) remapSubPageIds(copy.content, idMap);
    await db.pages.bulkAdd(copies);
    return root;
  });
}

interface ContentBlock {
  type?: string;
  props?: { pageId?: string };
  children?: ContentBlock[];
}

/** Rewrites `subPage` blocks' pageId through `idMap`, in place. */
function remapSubPageIds(blocks: unknown, idMap: Map<string, string>) {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks as ContentBlock[]) {
    const target = block?.type === "subPage" ? block.props?.pageId : undefined;
    if (target && idMap.has(target)) block.props!.pageId = idMap.get(target);
    remapSubPageIds(block?.children, idMap);
  }
}
