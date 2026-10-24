import Dexie, { type EntityTable } from "dexie";
import type { FileRecord, FolderRecord, PageRecord, TrashRecord } from "./records";

type XeentoDb = Dexie & {
  pages: EntityTable<PageRecord, "id">;
  folders: EntityTable<FolderRecord, "id">;
  files: EntityTable<FileRecord, "id">;
  trash: EntityTable<TrashRecord, "id">;
};

/** Local mode's database. Sync mode (ROADMAP.md Phase 4) opens one per account. */
const LOCAL_DB_NAME = "xeento";

/** Opens a database with Xeento's schema under any name. */
function createDb(name: string): XeentoDb {
  const db = new Dexie(name) as XeentoDb;

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

  return db;
}

let current: XeentoDb | null = null;

/** The database in use, opened on first call. */
export function getDb(): XeentoDb {
  current ??= createDb(LOCAL_DB_NAME);
  return current;
}
