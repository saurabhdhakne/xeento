import Dexie from "dexie";
import { accountDbName, getDb, openAccountDb, openLocalDb, type XeentoDb } from "../db";
import { downloadBackup } from "../backup";
import { getFirebase } from "../backend/firebase/app";
import { firebaseAuthProvider, waitForSession } from "../backend/firebase/auth";
import { checkAccountSchema } from "../backend/firebase/setup";
import { firestoreSyncAdapter } from "../backend/firebase/sync-adapter";
import { migrateAllPageDocs } from "../page-doc";
import { getSyncSettings, setSyncSettings } from "../sync-settings";
import { nanoid } from "nanoid";
import { startSyncEngine } from "./engine";
import { setSyncStatus } from "./status";

// Account-level actions for Sync mode. Anything that changes which
// database this page load uses ends in a reload (see db.ts getDb).

const TABLES = ["pages", "folders", "files", "trash", "pageUpdates"] as const;

/** Starts syncing the signed-in account's database. Returns stop. */
export async function startSync(): Promise<() => void> {
  const { config, uid } = getSyncSettings();
  if (!config || !uid) return () => {};
  setSyncStatus({ state: "connecting" });
  const { auth, firestore } = getFirebase(config);
  const user = await waitForSession(auth);
  if (!user || user.uid !== uid) {
    // Firebase's saved session is gone (signed out elsewhere, cleared data):
    // back to the sign-in screen. This account's notes stay on the device.
    setSyncSettings({ uid: null, email: null });
    window.location.reload();
    return () => {};
  }
  const schema = await checkAccountSchema(firestore, uid);
  if (!schema.ok) {
    setSyncStatus({ state: "error", message: schema.message });
    return () => {};
  }
  const db = getDb();
  let deviceId = (await db.syncState.get("deviceId"))?.value as string | undefined;
  if (!deviceId) {
    deviceId = nanoid();
    await db.syncState.put({ key: "deviceId", value: deviceId });
  }
  return startSyncEngine(firestoreSyncAdapter(firestore, uid, deviceId));
}

/** Number of pages (including Trash) in the Local database. */
export async function countLocalPages(): Promise<number> {
  const local = openLocalDb();
  try {
    return (await local.pages.count()) + (await local.trash.count());
  } finally {
    local.close();
  }
}

/**
 * Copies everything in the Local database into the account's database,
 * queued to upload. Ids are kept, so copying the same notes twice doesn't
 * duplicate them. Call before switching to the account (Local is active).
 */
export async function copyLocalNotesIntoAccount(uid: string, onProgress: (done: number, total: number) => void) {
  await migrateAllPageDocs(); // Local's own Yjs state, so it's created here once
  const local = openLocalDb();
  const account = openAccountDb(uid);
  try {
    const rows = await Promise.all(TABLES.map((t) => local.table(t).toArray()));
    const total = rows.reduce((n, r) => n + r.length, 0);
    let done = 0;
    for (let i = 0; i < TABLES.length; i++) {
      for (let j = 0; j < rows[i].length; j += 200) {
        const chunk = rows[i].slice(j, j + 200);
        await account.table(TABLES[i]).bulkPut(chunk);
        done += chunk.length;
        onProgress(done, total);
      }
    }
    return total;
  } finally {
    local.close();
    account.close();
  }
}

/**
 * Turns sync off (ROADMAP: Disconnect). First downloads a backup of the old
 * Local notes, then the account's notes become the Local notes, so nothing
 * on screen disappears. Signs out of Firebase. Reloads into Local mode.
 */
export async function disconnectToLocal() {
  const { config, uid } = getSyncSettings();
  if (!uid) return;
  const local = openLocalDb();
  const account = getDb();
  try {
    if ((await local.pages.count()) + (await local.trash.count()) > 0) {
      await downloadBackup(local, "xeento-local-before-disconnect");
    }
    await copyAll(account, local);
  } finally {
    local.close();
  }
  if (config) await firebaseAuthProvider(getFirebase(config).auth).signOut();
  setSyncSettings({ mode: "local", uid: null, email: null });
  window.location.reload();
}

async function copyAll(from: XeentoDb, to: XeentoDb) {
  const rows = await Promise.all(TABLES.map((t) => from.table(t).toArray()));
  await to.transaction("rw", TABLES.map((t) => to.table(t)), async () => {
    for (let i = 0; i < TABLES.length; i++) {
      await to.table(TABLES[i]).clear();
      await to.table(TABLES[i]).bulkAdd(rows[i]);
    }
  });
}

/** Signs out. `keepCopy: false` deletes this account's database from the device. Reloads to the sign-in screen. */
export async function signOutAccount(keepCopy: boolean) {
  const { config, uid } = getSyncSettings();
  if (config) await firebaseAuthProvider(getFirebase(config).auth).signOut();
  if (uid && !keepCopy) {
    getDb().close();
    await Dexie.delete(accountDbName(uid));
  }
  setSyncSettings({ uid: null, email: null });
  window.location.reload();
}

/** Switches this device to a signed-in account (after the wizard or the sign-in screen). */
export function activateAccount(uid: string, email: string | null) {
  setSyncSettings({ mode: "sync", uid, email });
  window.location.reload();
}
