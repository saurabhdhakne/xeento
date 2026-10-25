import {
  Bytes,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { SyncError, type PullResult, type SyncAdapter, type SyncChange, type SyncCursor, type SyncKind } from "../sync";

// Layout: users/{uid}/{kind}/{id}. Every document carries `changedAt`
// (device time of the change, for last-write-wins), `deviceId` (so a device
// skips its own echoes) and `syncedAt` (server time, the pull cursor; the
// rules require it). Records: `deleted` + `data`. Yjs updates: `pageId` +
// `update`, split into `id`, `id~1`, `id~2`… when bigger than CHUNK_BYTES,
// the first document holding `parts`. One update's parts always go in the
// same batch so they arrive together; a single save over ~8MB (the request
// limit) can't sync.

const KINDS: SyncKind[] = ["pages", "folders", "trash", "files", "pageUpdates"];
/** Comfortably under Firestore's 1MiB document limit. */
const CHUNK_BYTES = 900_000;
/** Firestore allows 500 writes per batch/transaction; requests must stay under 10MiB. */
const MAX_OPS = 400;
const MAX_BATCH_BYTES = 8_000_000;

type Cursors = Partial<Record<SyncKind, { s: number; n: number }>>;

export function firestoreSyncAdapter(firestore: Firestore, uid: string, deviceId: string): SyncAdapter {
  const col = (kind: SyncKind) => collection(firestore, "users", uid, kind);
  const epochRef = doc(firestore, "users", uid, "meta", "epoch");
  let epoch: string | null = null;
  const parseCursor = (cursor: SyncCursor): Cursors => (cursor ? JSON.parse(cursor) : {});
  const sinceQuery = (kind: SyncKind, cursors: Cursors) => {
    const at = cursors[kind];
    return at
      ? query(col(kind), where("syncedAt", ">", new Timestamp(at.s, at.n)), orderBy("syncedAt"))
      : query(col(kind), orderBy("syncedAt"));
  };

  /** Turns pulled documents into changes, advancing `cursors`. Own-device documents only move the cursor. */
  function toChanges(kind: SyncKind, docs: QueryDocumentSnapshot<DocumentData>[], cursors: Cursors): SyncChange[] {
    const changes: SyncChange[] = [];
    const chunks = new Map<string, Map<number, Uint8Array>>();
    const heads = new Map<string, DocumentData>();
    for (const snap of docs) {
      const d = snap.data();
      const at = d.syncedAt as Timestamp | null;
      if (!at) continue; // still pending on this device
      const prev = cursors[kind];
      if (!prev || at.seconds > prev.s || (at.seconds === prev.s && at.nanoseconds > prev.n)) {
        cursors[kind] = { s: at.seconds, n: at.nanoseconds };
      }
      if (d.deviceId === deviceId) continue;
      if (kind === "pageUpdates" && (d.epoch ?? null) !== epoch) continue; // from before/after a restore
      if (kind === "pageUpdates") {
        const [base, part] = snap.id.split("~");
        if (!chunks.has(base)) chunks.set(base, new Map());
        chunks.get(base)!.set(Number(part ?? 0), (d.update as Bytes).toUint8Array());
        if (!part) heads.set(base, d);
      } else {
        changes.push(
          d.deleted
            ? { kind, id: snap.id, changedAt: d.changedAt, deleted: true }
            : ({ kind, id: snap.id, changedAt: d.changedAt, deleted: false, data: d.data } as SyncChange),
        );
      }
    }
    for (const [id, head] of heads) {
      const parts = chunks.get(id)!;
      if (parts.size !== (head.parts ?? 1)) continue; // a batch is atomic, so this shouldn't happen
      const ordered = [...parts.entries()].sort((a, b) => a[0] - b[0]).map(([, bytes]) => bytes);
      const update = new Uint8Array(ordered.reduce((n, b) => n + b.length, 0));
      ordered.reduce((offset, b) => (update.set(b, offset), offset + b.length), 0);
      changes.push({ kind: "pageUpdates", id, changedAt: head.changedAt, deleted: false, data: { pageId: head.pageId, update } });
    }
    return changes;
  }

  return {
    async push(changes) {
      try {
        const newer: SyncChange[] = [];
        const records = changes.filter((c) => c.kind !== "pageUpdates");
        const updates = changes.filter((c) => c.kind === "pageUpdates");

        // Records: last-write-wins, checked against the stored version in a transaction.
        for (let i = 0; i < records.length; i += MAX_OPS / 2) {
          const group = records.slice(i, i + MAX_OPS / 2);
          const lost = await runTransaction(firestore, async (tx) => {
            const refs = group.map((c) => doc(col(c.kind), c.id));
            const current = await Promise.all(refs.map((ref) => tx.get(ref)));
            const lostHere: SyncChange[] = [];
            group.forEach((change, j) => {
              const remote = current[j].data();
              if (remote && remote.changedAt > change.changedAt) {
                lostHere.push(
                  remote.deleted
                    ? { kind: change.kind, id: change.id, changedAt: remote.changedAt, deleted: true }
                    : ({ kind: change.kind, id: change.id, changedAt: remote.changedAt, deleted: false, data: remote.data } as SyncChange),
                );
                return;
              }
              tx.set(refs[j], {
                deleted: change.deleted,
                data: change.deleted ? null : change.data,
                changedAt: change.changedAt,
                deviceId,
                syncedAt: serverTimestamp(),
              });
            });
            return lostHere;
          });
          newer.push(...lost);
        }

        // Yjs updates never conflict: plain batched writes. Deleting one
        // reads its head first to find any chunks.
        let batch = writeBatch(firestore);
        let ops = 0;
        let bytes = 0;
        const flush = async () => {
          if (ops > 0) await batch.commit();
          batch = writeBatch(firestore);
          ops = 0;
          bytes = 0;
        };
        for (const change of updates) {
          if (change.deleted) {
            const head = await getDoc(doc(col("pageUpdates"), change.id));
            const parts = head.exists() ? (head.data().parts ?? 1) : 0;
            if (ops + parts > MAX_OPS) await flush();
            for (let p = 0; p < parts; p++) {
              batch.delete(doc(col("pageUpdates"), p === 0 ? change.id : `${change.id}~${p}`));
              ops++;
            }
            continue;
          }
          if (change.kind !== "pageUpdates") continue;
          const { pageId, update } = change.data;
          const parts = Math.max(1, Math.ceil(update.length / CHUNK_BYTES));
          if (ops + parts > MAX_OPS || bytes + update.length > MAX_BATCH_BYTES) await flush();
          for (let p = 0; p < parts; p++) {
            const slice = update.subarray(p * CHUNK_BYTES, (p + 1) * CHUNK_BYTES);
            batch.set(doc(col("pageUpdates"), p === 0 ? change.id : `${change.id}~${p}`), {
              pageId,
              update: Bytes.fromUint8Array(slice),
              ...(p === 0 ? { parts } : {}),
              epoch,
              changedAt: change.changedAt,
              deviceId,
              syncedAt: serverTimestamp(),
            });
            ops++;
            bytes += slice.length;
          }
        }
        await flush();
        return { newer };
      } catch (error) {
        throw toSyncError(error);
      }
    },

    async pull(since) {
      try {
        const cursors = parseCursor(since);
        const changes: SyncChange[] = [];
        for (const kind of KINDS) {
          const snap = await getDocs(sinceQuery(kind, cursors));
          changes.push(...toChanges(kind, snap.docs, cursors));
        }
        return { changes, cursor: JSON.stringify(cursors) };
      } catch (error) {
        throw toSyncError(error);
      }
    },

    async getEpoch() {
      try {
        const snap = await getDoc(epochRef);
        return snap.exists() ? (snap.data().value as string) : null;
      } catch (error) {
        throw toSyncError(error);
      }
    },

    async setEpoch(value) {
      try {
        await setDoc(epochRef, { value, syncedAt: serverTimestamp() });
      } catch (error) {
        throw toSyncError(error);
      }
    },

    useEpoch(value) {
      epoch = value;
    },

    subscribe(since, onChanges, onError) {
      const cursors = parseCursor(since);
      const stops = KINDS.map((kind) =>
        onSnapshot(
          sinceQuery(kind, cursors),
          (snap) => {
            const docs = snap
              .docChanges()
              .filter((c) => c.type !== "removed" && !c.doc.metadata.hasPendingWrites)
              .map((c) => c.doc);
            if (docs.length === 0) return;
            const result: PullResult = { changes: toChanges(kind, docs, cursors), cursor: JSON.stringify(cursors) };
            onChanges(result);
          },
          (error) => onError(toSyncError(error)),
        ),
      );
      return () => stops.forEach((stop) => stop());
    },
  };
}

function toSyncError(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  const code = (error as { code?: string }).code ?? "";
  const message = String((error as { message?: string }).message ?? error);
  if (/Cloud Firestore API has not been used|SERVICE_DISABLED|database .* does not exist/i.test(message)) {
    return new SyncError("unknown", "This Firebase project has no Firestore database. Create one in the Firebase console.");
  }
  if (code === "permission-denied") return new SyncError("permission", message);
  if (code === "resource-exhausted") return new SyncError("quota", message);
  if (code === "unauthenticated") return new SyncError("auth", message);
  if (code === "unavailable" || code === "deadline-exceeded" || /offline/i.test(message)) return new SyncError("offline", message);
  return new SyncError("unknown", message);
}
