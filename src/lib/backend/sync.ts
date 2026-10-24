import type { FileRecord, FolderRecord, PageRecord, TrashRecord } from "../records";

// Replicates the local Dexie database to the user's own backend in Sync mode
// (ROADMAP.md). Local mode has no SyncAdapter. Adapters only move changes;
// the sync engine (src/lib/sync/) applies pulled changes to Dexie, and the
// UI picks them up through the existing use-*.ts hooks.

// What syncs: each record minus its device-only fields (ROADMAP.md
// Decisions). Page content syncs as Yjs updates only; each device derives
// its own `content` snapshot. Trash entries carry page metadata only.
export type SyncedPage = Omit<PageRecord, "lastOpenedAt" | "content">;
export type SyncedFolder = Omit<FolderRecord, "collapsed">;
export type SyncedFileMeta = Omit<FileRecord, "blob">;
export type SyncedTrashEntry = Omit<TrashRecord, "pages"> & {
  pages: SyncedPage[];
};

/**
 * One change to push or pull. `deleted: true` is a tombstone: the record is
 * gone and `data` is omitted. `changedAt` is the device time the change was
 * made and decides last-write-wins; it is never the sync cursor.
 */
export type SyncChange =
  | { kind: "pages"; id: string; changedAt: number; deleted: false; data: SyncedPage }
  | { kind: "folders"; id: string; changedAt: number; deleted: false; data: SyncedFolder }
  | { kind: "trash"; id: string; changedAt: number; deleted: false; data: SyncedTrashEntry }
  | { kind: "files"; id: string; changedAt: number; deleted: false; data: SyncedFileMeta }
  | {
      // One Yjs update for a page's content; `id` is the update's own id.
      // Updates never conflict, and a deleted one is simply gone (devices
      // drop a page's updates when its Trash entry is deleted for good).
      kind: "pageUpdates";
      id: string;
      changedAt: number;
      deleted: false;
      data: { pageId: string; update: Uint8Array };
    }
  | {
      kind: SyncKind;
      id: string;
      changedAt: number;
      deleted: true;
    };

export type SyncKind = "pages" | "folders" | "trash" | "files" | "pageUpdates";

/** Opaque position in the backend's change feed. null = from the start. */
export type SyncCursor = string | null;

export interface PullResult {
  changes: SyncChange[];
  /** Pass to the next pull to get only newer changes. */
  cursor: SyncCursor;
}

export interface PushResult {
  /**
   * Remote versions that were newer than the pushed change (last-write-wins
   * lost). The pushed change was not written; apply these locally instead.
   */
  newer: SyncChange[];
}

export interface SyncAdapter {
  /** Sends a batch of local changes, skipping any the backend has a newer version of. */
  push(changes: SyncChange[]): Promise<PushResult>;
  /** Changes made since `since` by other devices (this device's own writes are left out). */
  pull(since: SyncCursor): Promise<PullResult>;
  /** Live remote changes after `since`. Returns an unsubscribe function. */
  subscribe(since: SyncCursor, onChanges: (result: PullResult) => void, onError: (error: unknown) => void): () => void;
}

/** A failed push/pull, by cause, so the UI can explain it without knowing the backend. */
export class SyncError extends Error {
  constructor(
    readonly kind: "permission" | "quota" | "auth" | "offline" | "unknown",
    message: string,
  ) {
    super(message);
  }
}
