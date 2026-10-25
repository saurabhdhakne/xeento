import { liveQuery } from "dexie";
import { getDb, markRemoteTransaction } from "../db";
import { emptyDocument } from "../pages";
import { applyRemoteUpdates, contentFromUpdates } from "../page-doc";
import type { FileRecord, FolderRecord, OutboxRecord, PageRecord, TrashRecord } from "../records";
import { SyncError, type SyncAdapter, type SyncChange, type SyncCursor, type SyncKind } from "../backend/sync";
import { FileStorageError, type FileStorageAdapter } from "../backend/file-storage";
import { markPulledThisSession, setSyncStatus } from "./status";
import { deleteUnusedFiles } from "../files";

// Moves changes between this account's Dexie database and the backend.
// Push: outbox entries (written by db.ts's middleware) → current records →
// adapter, debounced. Pull: changes since the stored cursor, on start, on
// window focus and live. Pulled changes are applied in transactions marked
// remote, so they're never queued back. Everything runs one step at a time.

const PUSH_DELAY_MS = 3000;
const PUSH_BATCH = 300;
const RETRY_OFFLINE_MS = 30_000;
const RETRY_QUOTA_MS = 10 * 60_000;

export async function getSyncState<T>(key: string): Promise<T | undefined> {
  return (await getDb().syncState.get(key))?.value as T | undefined;
}
async function setSyncState(key: string, value: unknown) {
  await getDb().syncState.put({ key, value });
}

let nudge: (() => void) | null = null;
/** Pushes and pulls now (e.g. right after Google Drive is connected). */
export function syncNow() {
  nudge?.();
}

/**
 * Starts syncing. `getStorage` returns where file bytes go (Google Drive),
 * or null while it isn't connected; file changes then wait in the outbox.
 * Returns stop.
 */
export function startSyncEngine(adapter: SyncAdapter, getStorage: () => Promise<FileStorageAdapter | null>): () => void {
  let stopped = false;
  let chain: Promise<unknown> = Promise.resolve();
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribeRemote: (() => void) | null = null;

  /** Runs steps one at a time, in order. */
  const serial = (step: () => Promise<void>) => {
    chain = chain.then(() => (stopped ? undefined : step())).catch(handleError);
    return chain;
  };

  function handleError(error: unknown) {
    const kind = error instanceof SyncError ? error.kind : "unknown";
    const retry = (ms: number) => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void serial(pullAndPush), ms);
    };
    if (kind === "offline") {
      setSyncStatus({ state: "offline", message: "Offline. Changes are saved on this device and will sync when you're back online." });
      retry(RETRY_OFFLINE_MS);
    } else if (kind === "quota") {
      setSyncStatus({ state: "error", message: "Your Firebase project hit its free daily limit. Changes are saved on this device and will sync after it resets (midnight Pacific time)." });
      retry(RETRY_QUOTA_MS);
    } else if (kind === "permission") {
      setSyncStatus({ state: "error", message: "Firebase refused access. Check that Xeento's current rules are published in your project (Settings → Account & sync)." });
    } else if (kind === "auth") {
      setSyncStatus({ state: "error", message: "Your sign-in expired. Sign out and sign in again." });
    } else {
      setSyncStatus({ state: "error", message: `Sync failed: ${(error as Error)?.message ?? error}` });
      retry(RETRY_OFFLINE_MS);
    }
  }

  async function pull() {
    setSyncStatus({ state: "syncing" });
    const result = await adapter.pull((await getSyncState<SyncCursor>("cursor")) ?? null);
    await applyChanges(result.changes);
    await setSyncState("cursor", result.cursor);
  }

  async function push() {
    const db = getDb();
    const storage = await getStorage();
    let holdFiles = !storage;
    let driveProblem: string | null = null;
    for (;;) {
      const queued = await db.outbox.orderBy("key").toArray();
      const entries = (holdFiles ? queued.filter((e) => e.table !== "files") : queued).slice(0, PUSH_BATCH);
      if (entries.length === 0) break;
      setSyncStatus({ state: "syncing" });
      let changes = await changesFor(entries);
      let pushed = entries;

      // File bytes go to Drive first, so a device that sees the metadata can download them.
      for (const change of storage ? changes.filter((c) => c.kind === "files") : []) {
        try {
          if (change.deleted) await storage!.delete(change.id);
          else {
            const record = await db.files.get(change.id);
            if (record) await storage!.upload(change.id, record.blob, { name: record.name, mimeType: record.mimeType });
          }
        } catch (error) {
          if (!(error instanceof FileStorageError)) throw error;
          if (error.kind === "offline") throw new SyncError("offline", error.message);
          if (error.kind !== "auth" && error.kind !== "quota") throw new SyncError("unknown", error.message);
          // Drive needs reconnecting, or is full: files wait, everything else syncs.
          driveProblem = error.message;
          holdFiles = true;
          changes = changes.filter((c) => c.kind !== "files");
          pushed = entries.filter((e) => e.table !== "files");
          break;
        }
      }

      if (changes.length > 0) {
        const { newer } = await adapter.push(changes);
        await applyChanges(newer);
      }
      // Drop what was pushed, unless it changed again meanwhile.
      await db.transaction("rw", db.outbox, async () => {
        for (const entry of pushed) {
          const now = await db.outbox.get(entry.key);
          if (now && now.queuedAt === entry.queuedAt) await db.outbox.delete(entry.key);
        }
      });
    }
    setSyncStatus({ filesWaiting: await db.outbox.where("key").startsWith("files:").count(), driveProblem });
  }

  async function pullAndPush() {
    await pull();
    await push();
    setSyncStatus({ state: "synced", lastSyncedAt: Date.now() });
  }

  async function startUp() {
    await pullAndPush();
    // A full pull has every collection consistent, so rows of pages that
    // are in neither the workspace nor Trash were deleted for good elsewhere.
    await deleteOrphanPageDocs();
    markPulledThisSession();
    await deleteUnusedFiles();
  }

  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(
      () =>
        void serial(async () => {
          await push();
          setSyncStatus({ state: "synced", lastSyncedAt: Date.now() });
        }),
      PUSH_DELAY_MS,
    );
  }

  function subscribeRemote() {
    unsubscribeRemote?.();
    void getSyncState<SyncCursor>("cursor").then((cursor) => {
      if (stopped) return;
      unsubscribeRemote = adapter.subscribe(
        cursor ?? null,
        (result) =>
          void serial(async () => {
            await applyChanges(result.changes);
            await setSyncState("cursor", result.cursor);
            setSyncStatus({ state: "synced", lastSyncedAt: Date.now() });
          }),
        handleError,
      );
    });
  }

  const outboxWatch = liveQuery(() => getDb().outbox.count()).subscribe((count) => {
    if (count > 0) schedulePush();
  });
  const onFocus = () => void serial(pullAndPush).then(subscribeRemote);
  nudge = onFocus;
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onFocus);

  setSyncStatus({ state: "connecting" });
  void serial(startUp).then(() => {
    if (!stopped) subscribeRemote();
  });

  return () => {
    stopped = true;
    nudge = null;
    outboxWatch.unsubscribe();
    unsubscribeRemote?.();
    if (pushTimer) clearTimeout(pushTimer);
    if (retryTimer) clearTimeout(retryTimer);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onFocus);
    setSyncStatus({ state: "off" });
  };
}

/** The current state of each queued record, as changes (missing = tombstone). */
async function changesFor(entries: OutboxRecord[]): Promise<SyncChange[]> {
  const db = getDb();
  const byTable = new Map<string, OutboxRecord[]>();
  for (const e of entries) byTable.set(e.table, [...(byTable.get(e.table) ?? []), e]);
  const changes: SyncChange[] = [];
  for (const [table, group] of byTable) {
    const kind = table as SyncKind;
    const records = await db.table(table).bulkGet(group.map((e) => e.id));
    group.forEach((entry, i) => {
      const record = records[i];
      const base = { id: entry.id, changedAt: entry.queuedAt };
      if (!record) {
        changes.push({ kind, ...base, deleted: true });
        return;
      }
      switch (kind) {
        case "pages":
          changes.push({ kind, ...base, deleted: false, data: omit(record as PageRecord, "content", "lastOpenedAt") });
          break;
        case "folders":
          changes.push({ kind, ...base, deleted: false, data: omit(record as FolderRecord, "collapsed") });
          break;
        case "trash": {
          const entryRecord = record as TrashRecord;
          const pages = entryRecord.pages.map((p) => omit(p, "content", "lastOpenedAt"));
          changes.push({ kind, ...base, deleted: false, data: { ...entryRecord, pages } });
          break;
        }
        case "files":
          changes.push({ kind, ...base, deleted: false, data: omit(record as FileRecord, "blob") });
          break;
        case "pageUpdates":
          changes.push({ kind, ...base, deleted: false, data: { pageId: record.pageId, update: record.update } });
          break;
      }
    });
  }
  return changes;
}

function omit<T extends object, K extends keyof T>(record: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...record };
  for (const key of keys) delete copy[key];
  return copy;
}

/** Applies pulled changes to Dexie. A newer local change still waiting to push wins. */
export async function applyChanges(changes: SyncChange[]) {
  if (changes.length === 0) return;
  const db = getDb();
  const needContent = new Set<string>();
  const updatesByPage = new Map<string, Uint8Array[]>();

  await db.transaction("rw", [db.pages, db.folders, db.trash, db.pageUpdates, db.outbox], async () => {
    markRemoteTransaction();
    for (const change of changes) {
      const key = `${change.kind}:${change.id}`;
      const pending = await db.outbox.get(key);
      if (pending && pending.queuedAt > change.changedAt) continue;
      if (pending) await db.outbox.delete(key);

      if (change.deleted) {
        // A Trash tombstone means restored or deleted for good; its pages'
        // Yjs rows are left for deleteOrphanPageDocs to sort out.
        if (change.kind !== "files") await db.table(change.kind).delete(change.id);
        continue;
      }
      switch (change.kind) {
        case "pages": {
          const local = await db.pages.get(change.id);
          await db.pages.put({
            ...change.data,
            content: local?.content ?? emptyDocument(),
            lastOpenedAt: local?.lastOpenedAt ?? null,
          });
          if (!local) needContent.add(change.id);
          break;
        }
        case "folders": {
          const local = await db.folders.get(change.id);
          await db.folders.put({ ...change.data, collapsed: local?.collapsed ?? false });
          break;
        }
        case "trash": {
          const local = await db.trash.get(change.id);
          const pages = change.data.pages.map((p) => ({
            ...p,
            content: local?.pages.find((lp) => lp.id === p.id)?.content ?? emptyDocument(),
            lastOpenedAt: null,
          }));
          await db.trash.put({ ...change.data, pages });
          pages.forEach((p) => needContent.add(p.id));
          break;
        }
        case "files":
          // File blobs sync through the file storage adapter (ROADMAP Phase 5).
          break;
        case "pageUpdates": {
          const { pageId, update } = change.data;
          await db.pageUpdates.put({ id: change.id, pageId, update, createdAt: change.changedAt });
          updatesByPage.set(pageId, [...(updatesByPage.get(pageId) ?? []), update]);
          break;
        }
      }
    }
  });

  for (const [pageId, updates] of updatesByPage) {
    if (!applyRemoteUpdates(pageId, updates)) needContent.add(pageId);
  }
  if (needContent.size > 0) await refreshContent([...needContent]);
}

/** Drops Yjs rows whose page is in neither the workspace nor Trash (the deleting device removes the remote copies). */
async function deleteOrphanPageDocs() {
  const db = getDb();
  await db.transaction("rw", [db.pages, db.trash, db.pageUpdates], async () => {
    markRemoteTransaction();
    const live = new Set<string>([
      ...((await db.pages.toCollection().primaryKeys()) as string[]),
      ...(await db.trash.toArray()).flatMap((e) => e.pages.map((p) => p.id)),
    ]);
    const orphanRows = await db.pageUpdates.filter((row) => !live.has(row.pageId)).primaryKeys();
    await db.pageUpdates.bulkDelete(orphanRows);
  });
}

/** Rebuilds `content` snapshots (workspace and Trash) from the pages' Yjs rows. */
async function refreshContent(pageIds: string[]) {
  const db = getDb();
  await db.transaction("rw", [db.pages, db.trash, db.pageUpdates], async () => {
    markRemoteTransaction();
    const rows = await db.pageUpdates.where("pageId").anyOf(pageIds).toArray();
    const byPage = new Map<string, typeof rows>();
    for (const row of rows) byPage.set(row.pageId, [...(byPage.get(row.pageId) ?? []), row]);
    for (const [pageId, pageRows] of byPage) {
      const content = contentFromUpdates(pageRows.map((r) => r.update));
      const editedAt = Math.max(...pageRows.map((r) => r.createdAt));
      const page = await db.pages.get(pageId);
      if (page) {
        await db.pages.update(pageId, { content, updatedAt: Math.max(page.updatedAt, editedAt) });
        continue;
      }
      const entry = (await db.trash.toArray()).find((e) => e.pages.some((p) => p.id === pageId));
      if (entry) {
        await db.trash.put({ ...entry, pages: entry.pages.map((p) => (p.id === pageId ? { ...p, content } : p)) });
      }
    }
  });
}
