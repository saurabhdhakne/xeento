import { ROOT_ID, type PageRecord } from "./records";

export interface PageTreeNode extends PageRecord {
  children: PageTreeNode[];
}

function byOrder(a: PageRecord, b: PageRecord) {
  return a.order - b.order;
}

function buildChildren(allPages: PageRecord[], parentId: string): PageTreeNode[] {
  return allPages
    .filter((p) => p.parentId === parentId)
    .sort(byOrder)
    .map((p) => ({ ...p, children: buildChildren(allPages, p.id) }));
}

/**
 * Builds a forest from the FULL, unfiltered page list plus a predicate for
 * which root-level pages belong to this tree. Only the top level is
 * filtered by folder membership — every recursive call below it matches
 * purely on parentId, since nested pages always have folderId: null
 * regardless of which folder their top-level ancestor sits in. Filtering
 * the input array by folderId before recursing would silently drop (or
 * misplace) nested descendants of foldered pages.
 */
export function buildPageTree(
  allPages: PageRecord[],
  isRoot: (page: PageRecord) => boolean,
): PageTreeNode[] {
  return allPages
    .filter((p) => p.parentId === ROOT_ID && isRoot(p))
    .sort(byOrder)
    .map((p) => ({ ...p, children: buildChildren(allPages, p.id) }));
}
