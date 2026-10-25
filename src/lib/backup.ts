import JSZip from "jszip";
import * as Y from "yjs";
import { nanoid } from "nanoid";
import { getDb, type XeentoDb } from "./db";
import type { FileRecord, FolderRecord, PageRecord, PageUpdateRecord, TrashRecord } from "./records";
import { downloadBlob } from "./download";
import { formatBytes } from "./files";
import { migrateAllPageDocs } from "./page-doc";
import { fetchMissingReferencedFiles } from "./sync/files";
import { toast } from "@/components/ui/toast";

const BACKUP_VERSION = 1;
const SLOW_BACKUP_MS = 30_000;

/**
 * backup.json. File bytes live beside it in the zip as files/<id>, and each
 * page's Yjs state (page-doc.ts) as yjs/<pageId>, merged into one update.
 * yjs/ is optional, so the version stays 1: backups without it (older ones)
 * restore with Yjs state rebuilt from `content`, and older app versions
 * restore newer backups by ignoring it.
 */
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
export async function downloadBackup(db: XeentoDb = getDb(), fileName = "xeento-backup"): Promise<void> {
  // Sync mode: include files that so far are only in Google Drive.
  if (db === getDb()) {
    const missing = await fetchMissingReferencedFiles();
    if (missing > 0) {
      toast.warn(`${missing} ${missing === 1 ? "file is" : "files are"} only on other devices and couldn't be fetched from Google Drive, so the backup won't include them.`);
    }
  }
  // The zip is built in memory before the download can start, so a large
  // workspace can look like nothing happened. Warn if it's taking too long.
  let sizeLabel = "";
  const slowWarning = setTimeout(() => {
    toast.warn(
      `The backup still hasn't started after ${SLOW_BACKUP_MS / 1000} seconds. Your workspace${sizeLabel ? ` (${sizeLabel})` : ""} may be too large to back up in one file.`,
    );
  }, SLOW_BACKUP_MS);
  try {
    await buildAndDownloadBackup(db, fileName, (totalBytes) => {
      sizeLabel = formatBytes(totalBytes);
      toast.info(`Preparing backup (${sizeLabel})… the download starts when it's ready.`);
    });
  } finally {
    clearTimeout(slowWarning);
  }
}

async function buildAndDownloadBackup(
  db: XeentoDb,
  fileName: string,
  onSizeKnown: (totalBytes: number) => void,
): Promise<void> {
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
  const updatesByPage = new Map<string, Uint8Array[]>();
  for (const row of await db.pageUpdates.toArray()) {
    updatesByPage.set(row.pageId, [...(updatesByPage.get(row.pageId) ?? []), row.update]);
  }
  for (const [pageId, updates] of updatesByPage) zip.file(`yjs/${pageId}`, Y.mergeUpdates(updates));

  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(await zip.generateAsync({ type: "blob" }), `${fileName}-${date}.zip`);
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
  const pageUpdates: PageUpdateRecord[] = [];
  for (const entry of zip.file(/^yjs\/[^/]+$/)) {
    const pageId = entry.name.slice("yjs/".length);
    pageUpdates.push({ id: nanoid(), pageId, update: await entry.async("uint8array"), createdAt: Date.now() });
  }

  await db.transaction("rw", [db.pages, db.folders, db.files, db.trash, db.pageUpdates], async () => {
    await Promise.all([db.pages.clear(), db.folders.clear(), db.files.clear(), db.trash.clear(), db.pageUpdates.clear()]);
    await db.pages.bulkAdd(manifest.pages);
    await db.folders.bulkAdd(manifest.folders);
    await db.files.bulkAdd(files);
    await db.trash.bulkAdd(manifest.trash);
    await db.pageUpdates.bulkAdd(pageUpdates);
  });
  // Older backups have no yjs/: build it from `content`. The restore is
  // this device's own change, so this is safe in an account database too.
  await migrateAllPageDocs();
}
