import { nanoid } from "nanoid";
import { db, type FileRecord } from "./db";
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
 * but still proceeds between 25–100MB.
 *
 * Note: there's no reference-counting/garbage-collection here — deleting a
 * block that referenced a file doesn't delete the file. Tracking references
 * across arbitrary page content is a feature of its own, out of scope here.
 */
export async function storeFile(file: File): Promise<FileRecord> {
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
  return db.files.get(id);
}

export async function deleteFile(id: string): Promise<void> {
  await db.files.delete(id);
}

export { formatBytes };
