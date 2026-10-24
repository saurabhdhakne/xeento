import type { FileRecord, FolderRecord, PageRecord, TrashRecord } from "../records";

// Replicates the local Dexie database to the user's own backend in Sync mode
// (ROADMAP.md). Local mode has no SyncAdapter. Adapters only move changes;
// the sync engine applies pulled changes to Dexie, and the UI picks them up
// through the existing use-*.ts hooks.

// What syncs: each record minus its device-only fields (ROADMAP.md
// Decisions). Trash entries carry page metadata only, not content.
export type SyncedPage = Omit<PageRecord, "lastOpenedAt">;
export type SyncedFolder = Omit<FolderRecord, "collapsed">;
export type SyncedFileMeta = Omit<FileRecord, "blob">;
export type SyncedTrashEntry = Omit<TrashRecord, "pages"> & {
  pages: Omit<SyncedPage, "content">[];
};

/**
 * One change to push or pull. `deleted: true` is a tombstone: the record is
 * gone and `data` is omitted. `updatedAt` (device clock) only decides
 * last-write-wins; it is never the sync cursor.
 */
export type SyncChange =
  | { kind: "page"; id: string; updatedAt: number; deleted: false; data: SyncedPage }
  | { kind: "folder"; id: string; updatedAt: number; deleted: false; data: SyncedFolder }
  | { kind: "trash"; id: string; updatedAt: number; deleted: false; data: SyncedTrashEntry }
  | { kind: "file"; id: string; updatedAt: number; deleted: false; data: SyncedFileMeta }
  | {
      // A Yjs update for one page's content; `id` is the update's own id.
      kind: "pageUpdate";
      id: string;
      updatedAt: number;
      deleted: false;
      data: { pageId: string; update: Uint8Array };
    }
  | {
      kind: "page" | "folder" | "trash" | "file" | "pageUpdate";
      id: string;
      updatedAt: number;
      deleted: true;
    };

/** Opaque position in the backend's change feed (e.g. a server timestamp). null = from the start. */
export type SyncCursor = string | null;

export interface PullResult {
  changes: SyncChange[];
  /** Pass to the next pull to get only newer changes. */
  cursor: SyncCursor;
}

export interface SyncAdapter {
  /** Sends a batch of local changes. Resolves once the backend has them all. */
  push(changes: SyncChange[]): Promise<void>;
  /** Changes made since `since`, from any device. */
  pull(since: SyncCursor): Promise<PullResult>;
  /** Live remote changes after `since`. Returns an unsubscribe function. */
  subscribe(since: SyncCursor, onChanges: (result: PullResult) => void): () => void;
}
