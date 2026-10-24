import Dexie, {
  type DBCore,
  type DBCoreMutateRequest,
  type DBCoreMutateResponse,
  type DBCoreTransaction,
  type EntityTable,
} from "dexie";
import type { FileRecord, FolderRecord, OutboxRecord, PageRecord, PageUpdateRecord, SyncStateRecord, TrashRecord } from "./records";
import { activeAccountUid } from "./sync-settings";

export type XeentoDb = Dexie & {
  pages: EntityTable<PageRecord, "id">;
  folders: EntityTable<FolderRecord, "id">;
  files: EntityTable<FileRecord, "id">;
  trash: EntityTable<TrashRecord, "id">;
  pageUpdates: EntityTable<PageUpdateRecord, "id">;
  outbox: EntityTable<OutboxRecord, "key">;
  syncState: EntityTable<SyncStateRecord, "key">;
};

/** Local mode's database. Each Sync account gets its own: `xeento-<uid>`. */
const LOCAL_DB_NAME = "xeento";

export function accountDbName(uid: string) {
  return `${LOCAL_DB_NAME}-${uid}`;
}

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

  // Yjs page content (page-doc.ts). Existing pages get rows lazily from
  // their `content`, so no upgrade function is needed.
  db.version(5).stores({
    pages: "id, parentId, folderId, order, updatedAt",
    folders: "id, order",
    files: "id, mimeType, createdAt",
    trash: "id, deletedAt",
    pageUpdates: "id, pageId",
  });

  // Sync mode: the pending-change queue and device-only sync bookkeeping.
  // Present in every database; only account databases use them.
  db.version(6).stores({
    pages: "id, parentId, folderId, order, updatedAt",
    folders: "id, order",
    files: "id, mimeType, createdAt",
    trash: "id, deletedAt",
    pageUpdates: "id, pageId",
    outbox: "key",
    syncState: "key",
  });

  return db;
}

// Tables that sync, and their fields that never do (device-only, or
// derived locally). A write touching only those fields isn't queued.
const SYNCED_TABLES: Record<string, string[]> = {
  pages: ["lastOpenedAt", "content", "updatedAt"],
  folders: ["collapsed"],
  trash: [],
  files: [],
  pageUpdates: [],
};

/** Marks a transaction as applying pulled changes, so they aren't queued to push back. */
export function markRemoteTransaction() {
  (Dexie.currentTransaction?.idbtrans as unknown as { xeentoRemote?: boolean }).xeentoRemote = true;
}

/**
 * Account databases record every synced change in `outbox`, in the same
 * transaction as the change, so nothing in pages.ts / folders.ts / trash.ts
 * / files.ts / page-doc.ts needs to know about sync. Local mode's database
 * doesn't get this middleware.
 */
function outboxMiddleware(down: DBCore): Partial<DBCore> {
  return {
    ...down,
    transaction(stores, mode, options) {
      const touchesSynced = stores.some((name) => name in SYNCED_TABLES);
      return down.transaction(mode === "readwrite" && touchesSynced ? [...new Set([...stores, "outbox"])] : stores, mode, options);
    },
    table(name) {
      const table = down.table(name);
      const ignored = SYNCED_TABLES[name];
      if (!ignored) return table;
      const extract = table.schema.primaryKey.extractKey!;
      // Promise chains, not async/await: Dexie's lower layers need its
      // transaction zone, which native await drops.
      const queue = (req: DBCoreMutateRequest, ids: string[]) => (result: DBCoreMutateResponse) => {
        if (ids.length === 0 || (req.trans as DBCoreTransaction & { xeentoRemote?: boolean }).xeentoRemote) return result;
        const queuedAt = Date.now();
        return down
          .table("outbox")
          .mutate({
            type: "put",
            trans: req.trans,
            values: ids.map((id) => ({ key: `${name}:${id}`, table: name, id, queuedAt })),
          })
          .then(() => result);
      };
      return {
        ...table,
        mutate(req: DBCoreMutateRequest) {
          if (req.type === "deleteRange") {
            // Find the keys first: a range delete doesn't list them.
            return table
              .query({ trans: req.trans, values: true, query: { index: table.schema.primaryKey, range: req.range } })
              .then((found) => table.mutate(req).then(queue(req, found.result.map(extract))));
          }
          return table.mutate(req).then(queue(req, changedIds(extract, req, ignored)));
        },
      };
    },
  };
}

function changedIds(
  extract: (value: unknown) => string,
  req: Exclude<DBCoreMutateRequest, { type: "deleteRange" }>,
  ignored: string[],
): string[] {
  const onlyIgnored = (spec: Record<string, unknown>) => Object.keys(spec).every((path) => ignored.includes(path.split(".")[0]));
  switch (req.type) {
    case "add":
      return req.values.map(extract);
    case "put":
      if (req.updates) return req.updates.keys.filter((_, i) => !onlyIgnored(req.updates!.changeSpecs[i]));
      if (req.changeSpec && onlyIgnored(req.changeSpec)) return [];
      return req.values.map(extract);
    case "delete":
      return req.keys;
  }
}

function withOutbox(db: XeentoDb) {
  // Level 1.5: below Dexie's hooks layer (2), which only accepts tables in
  // the Dexie transaction's scope, and above observability/cache (0–1), so
  // liveQuery still sees outbox writes.
  db.use({ stack: "dbcore", name: "outbox", level: 1.5, create: outboxMiddleware });
  return db;
}

let current: XeentoDb | null = null;

/**
 * The database in use, opened on first call: the signed-in account's in
 * Sync mode, otherwise Local's. Fixed for the page load; switching
 * accounts reloads the page.
 */
export function getDb(): XeentoDb {
  if (!current) {
    const uid = activeAccountUid();
    current = uid ? withOutbox(createDb(accountDbName(uid))) : createDb(LOCAL_DB_NAME);
  }
  return current;
}

/** Opens Local's database while another is active (copying notes in or out). Close it when done. */
export function openLocalDb(): XeentoDb {
  return createDb(LOCAL_DB_NAME);
}

/** Opens an account's database while another is active; writes are queued to push. Close it when done. */
export function openAccountDb(uid: string): XeentoDb {
  return withOutbox(createDb(accountDbName(uid)));
}
