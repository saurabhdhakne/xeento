import JSZip from "jszip";
import { getDb } from "./db";
import type { FileRecord, FolderRecord, PageRecord, TrashRecord } from "./records";
import { downloadBlob } from "./download";
import { formatBytes } from "./files";
import { toast } from "@/components/ui/toast";

const BACKUP_VERSION = 1;
const SLOW_BACKUP_MS = 30_000;

/** backup.json. File bytes live beside it in the zip as files/<id>. */
interface BackupManifest {
  app: "xeento";
  version: number;
  exportedAt: number;
  pages: PageRecord[];
  folders: FolderRecord[];
  trash: TrashRecord[];
  files: Omit<FileRecord, "blob">[];
}

/**
 * Downloads the whole workspace exactly as stored: pages, folders, Trash
 * and every file. Unlike Markdown export, restoring it loses nothing.
 */
export async function downloadBackup(): Promise<void> {
  // The zip is built in memory before the download can start, so a large
  // workspace can look like nothing happened. Warn if it's taking too long.
  let sizeLabel = "";
  const slowWarning = setTimeout(() => {
    toast.warn(
      `The backup still hasn't started after ${SLOW_BACKUP_MS / 1000} seconds. Your workspace${sizeLabel ? ` (${sizeLabel})` : ""} may be too large to back up in one file.`,
    );
  }, SLOW_BACKUP_MS);
  try {
    await buildAndDownloadBackup((totalBytes) => {
      sizeLabel = formatBytes(totalBytes);
      toast.info(`Preparing backup (${sizeLabel})… the download starts when it's ready.`);
    });
  } finally {
    clearTimeout(slowWarning);
  }
}

async function buildAndDownloadBackup(onSizeKnown: (totalBytes: number) => void): Promise<void> {
  const db = getDb();
  const zip = new JSZip();
  const files = await db.files.toArray();
  onSizeKnown(files.reduce((sum, file) => sum + file.size, 0));
  const manifest: BackupManifest = {
    app: "xeento",
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    pages: await db.pages.toArray(),
    folders: await db.folders.toArray(),
    trash: await db.trash.toArray(),
    files: files.map(({ id, name, mimeType, size, createdAt }) => ({ id, name, mimeType, size, createdAt })),
  };
  zip.file("backup.json", JSON.stringify(manifest));
  for (const file of files) zip.file(`files/${file.id}`, file.blob);

  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(await zip.generateAsync({ type: "blob" }), `xeento-backup-${date}.zip`);
}

/**
 * Replaces everything in the workspace with a backup's contents. Throws,
 * leaving the workspace untouched, if the zip isn't a Xeento backup.
 */
export async function restoreBackup(zipFile: File): Promise<void> {
  const db = getDb();
  const zip = await JSZip.loadAsync(zipFile);
  const json = await zip.file("backup.json")?.async("string");
  if (!json) throw new Error("Not a Xeento backup: backup.json is missing");
  const manifest = JSON.parse(json) as BackupManifest;
  if (manifest.app !== "xeento" || manifest.version !== BACKUP_VERSION) {
    throw new Error("Not a supported Xeento backup");
  }

  // Read every blob before opening the transaction: IndexedDB commits a
  // transaction as soon as it awaits anything that isn't a database call.
  const files: FileRecord[] = [];
  for (const meta of manifest.files) {
    const bytes = await zip.file(`files/${meta.id}`)?.async("blob");
    if (bytes) files.push({ ...meta, blob: new Blob([bytes], { type: meta.mimeType }) });
  }

  await db.transaction("rw", db.pages, db.folders, db.files, db.trash, async () => {
    await Promise.all([db.pages.clear(), db.folders.clear(), db.files.clear(), db.trash.clear()]);
    await db.pages.bulkAdd(manifest.pages);
    await db.folders.bulkAdd(manifest.folders);
    await db.files.bulkAdd(files);
    await db.trash.bulkAdd(manifest.trash);
  });
}
