"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb, markRemoteTransaction, openAccountDb, type XeentoDb } from "../db";
import { referencedFileIds } from "../files";
import { activeAccountUid } from "../sync-settings";
import { FileStorageError } from "../backend/file-storage";
import { googleDriveAdapter, type DriveAdapter } from "../backend/google-drive/drive-adapter";
import { driveAvailable, forgetDriveToken, getDriveToken, loadGoogleIdentity, revokeDriveAccess } from "../backend/google-drive/token";

// File storage for Sync mode: each account connects its own Google Drive.
// The connection (which Google account) is device-only, kept in that
// account's syncState; the access token is cached by token.ts.

export { driveAvailable, loadGoogleIdentity };

export interface DriveConnection {
  email: string | null;
}

const DRIVE_KEY = "drive";

function accountDb(uid: string): { db: XeentoDb; done: () => void } {
  if (activeAccountUid() === uid) return { db: getDb(), done: () => {} };
  const db = openAccountDb(uid);
  return { db, done: () => db.close() };
}

function adapterFor(uid: string, interactive = false): DriveAdapter {
  let first = interactive;
  return googleDriveAdapter(
    () => {
      const token = getDriveToken(uid, first);
      first = false;
      return token;
    },
    () => forgetDriveToken(uid),
  );
}

/** The active account's Drive connection, live. undefined while loading. */
export function useDriveConnection(): DriveConnection | null | undefined {
  return useLiveQuery(async () => ((await getDb().syncState.get(DRIVE_KEY))?.value as DriveConnection | undefined) ?? null, []);
}

async function getConnection(uid: string): Promise<DriveConnection | null> {
  const { db, done } = accountDb(uid);
  try {
    return ((await db.syncState.get(DRIVE_KEY))?.value as DriveConnection | undefined) ?? null;
  } finally {
    done();
  }
}

/**
 * Connects the account to the user's Google Drive. Call from a click: it
 * may open Google's account chooser and consent screen.
 */
export async function connectDrive(uid: string): Promise<DriveConnection> {
  const adapter = adapterFor(uid, true);
  const email = await adapter.accountEmail();
  const connection: DriveConnection = { email };
  const { db, done } = accountDb(uid);
  try {
    await db.syncState.put({ key: DRIVE_KEY, value: connection });
  } finally {
    done();
  }
  return connection;
}

/** Disconnects Drive on this device and revokes Xeento's access. Files already in Drive stay there. */
export async function disconnectDrive(uid: string) {
  await revokeDriveAccess(uid);
  const { db, done } = accountDb(uid);
  try {
    await db.syncState.delete(DRIVE_KEY);
  } finally {
    done();
  }
}

/** The file storage the sync engine uses, or null while Drive isn't connected (files then wait). */
export async function fileStorageFor(uid: string): Promise<DriveAdapter | null> {
  if (!driveAvailable || !(await getConnection(uid))) return null;
  return adapterFor(uid);
}

/**
 * A file this device doesn't have yet (added on another device), fetched
 * from Drive and kept locally. Stored as a pulled change, so it isn't
 * uploaded back.
 */
export async function downloadMissingFile(fileId: string) {
  const uid = activeAccountUid();
  if (!uid) return undefined;
  const storage = await fileStorageFor(uid);
  if (!storage) {
    throw new FileStorageError("auth", "This file was added on another device. Connect Google Drive (Settings → Account & sync) to see it here.");
  }
  const file = await storage.download(fileId);
  const db = getDb();
  const record = { id: fileId, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, blob: file, createdAt: Date.now() };
  await db.transaction("rw", db.files, async () => {
    markRemoteTransaction();
    await db.files.put(record);
  });
  return record;
}

/**
 * Before a backup or Disconnect: downloads every file the notes reference
 * that this device hasn't fetched yet. Returns how many couldn't be fetched.
 */
export async function fetchMissingReferencedFiles(): Promise<number> {
  if (!activeAccountUid()) return 0;
  const db = getDb();
  const have = new Set((await db.files.toCollection().primaryKeys()) as string[]);
  const missing = [...(await referencedFileIds())].filter((id) => !have.has(id));
  let failed = 0;
  for (const id of missing) {
    await downloadMissingFile(id).catch(() => failed++);
  }
  return failed;
}
