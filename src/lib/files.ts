import { nanoid } from "nanoid";
import { getDb } from "./db";
import { activeAccountUid } from "./sync-settings";
import { hasPulledThisSession } from "./sync/status";
import type { FileRecord } from "./records";
import { toast } from "@/components/ui/toast";

const WARN_BYTES = 25 * 1024 * 1024;
const REJECT_BYTES = 100 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

/**
 * Stores a file's bytes in IndexedDB. Rejects anything over 100MB outright
 * (IndexedDB + base-tab-memory isn't a great place for huge files); warns
 * but still proceeds between 25–100MB. Deleting a block doesn't delete its
 * file right away; deleteUnusedFiles cleans up later.
 */
export async function storeFile(file: File): Promise<FileRecord> {
  const db = getDb();
  if (file.size > REJECT_BYTES) {
    toast.error(`"${file.name}" is ${formatBytes(file.size)} — files over 100 MB aren't supported.`);
    throw new Error(`File too large: ${file.name} (${file.size} bytes)`);
  }
  if (file.size > WARN_BYTES) {
    toast.warn(`"${file.name}" is ${formatBytes(file.size)} — large files may slow things down.`);
  }

  const record: FileRecord = {
    id: nanoid(),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    blob: file,
    createdAt: Date.now(),
  };
  await db.files.add(record);
  return record;
}

export async function getFile(id: string): Promise<FileRecord | undefined> {
  const db = getDb();
  return db.files.get(id);
}

export async function deleteFile(id: string): Promise<void> {
  const db = getDb();
  await db.files.delete(id);
}

const FILE_REF = /xeento-file:\/\/([\w-]+)/g;
// New files may not be referenced yet: an upload waits on the editor's
// autosave debounce, an import stores files before writing its pages.
const UNUSED_GRACE_MS = 24 * 60 * 60 * 1000;

/** Ids of every stored file the notes reference, Trash included. */
export async function referencedFileIds(): Promise<Set<string>> {
  const db = getDb();
  const used = new Set<string>();
  const collect = (content: unknown) => {
    for (const match of JSON.stringify(content ?? null).matchAll(FILE_REF)) used.add(match[1]);
  };
  await db.pages.each((page) => collect(page.content));
  await db.trash.each((entry) => entry.pages.forEach((page) => collect(page.content)));
  return used;
}

/**
 * Deletes stored files that no page references, counting pages in Trash
 * (a restore must bring their files back). Skips files under a day old.
 */
export async function deleteUnusedFiles(): Promise<void> {
  const db = getDb();
  // Sync mode: only once this device has everything and has sent everything,
  // so a file another device still references isn't deleted.
  if (activeAccountUid() && (!hasPulledThisSession() || (await db.outbox.count()) > 0)) return;
  await db.transaction("rw", db.files, db.pages, db.trash, async () => {
    const used = await referencedFileIds();
    const oldIds = await db.files.where("createdAt").below(Date.now() - UNUSED_GRACE_MS).primaryKeys();
    await db.files.bulkDelete(oldIds.filter((id) => !used.has(id)));
  });
}

export { formatBytes };
