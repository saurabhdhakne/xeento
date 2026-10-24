// The data model, with no storage import, so components, import/export and
// sync adapters can share it without depending on Dexie.

export const ROOT_ID = "root";

export interface PageRecord {
  id: string;
  parentId: string;
  /** Non-null only when parentId === ROOT_ID — folder membership is a root-level-only concept. */
  folderId: string | null;
  title: string;
  icon: string | null;
  order: number;
  content: unknown;
  tags: string[];
  favourite: boolean;
  favouriteOrder: number | null;
  lastOpenedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface FolderRecord {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
}

export interface FileRecord {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

/** One deleted page with its whole sub-page tree, as it was when deleted. */
export interface TrashRecord {
  id: string; // the deleted (top) page's id
  deletedAt: number;
  pages: PageRecord[]; // the top page first, then its descendants
}
