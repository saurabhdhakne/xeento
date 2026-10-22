import Dexie, { type EntityTable } from "dexie";

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

export const db = new Dexie("xeento") as Dexie & {
  pages: EntityTable<PageRecord, "id">;
  folders: EntityTable<FolderRecord, "id">;
  files: EntityTable<FileRecord, "id">;
  trash: EntityTable<TrashRecord, "id">;
};

db.version(1).stores({
  pages: "id, parentId, order, updatedAt",
});

db.version(2)
  .stores({
    pages: "id, parentId, folderId, order, updatedAt",
    folders: "id, order",
  })
  .upgrade((tx) =>
    tx
      .table("pages")
      .toCollection()
      .modify((page) => {
        if (page.folderId === undefined) page.folderId = null;
        if (page.tags === undefined) page.tags = [];
        if (page.favourite === undefined) page.favourite = false;
        if (page.favouriteOrder === undefined) page.favouriteOrder = null;
        if (page.lastOpenedAt === undefined) page.lastOpenedAt = null;
      }),
  );

db.version(3).stores({
  pages: "id, parentId, folderId, order, updatedAt",
  folders: "id, order",
  files: "id, mimeType, createdAt",
});

db.version(4).stores({
  pages: "id, parentId, folderId, order, updatedAt",
  folders: "id, order",
  files: "id, mimeType, createdAt",
  trash: "id, deletedAt",
});
