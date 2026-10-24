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

/** One Yjs update for a page's content (see page-doc.ts). Rows for a page merge into its document. */
export interface PageUpdateRecord {
  id: string;
  pageId: string;
  update: Uint8Array;
  createdAt: number;
}

/** Sync mode: one pending change to push (a reference; push reads the current record). */
export interface OutboxRecord {
  key: string; // `${table}:${id}`, so repeated changes to a record coalesce
  table: string;
  id: string;
  queuedAt: number;
}

/** Sync mode: device-only bookkeeping (cursor, device id, first pull done). */
export interface SyncStateRecord {
  key: string;
  value: unknown;
}
