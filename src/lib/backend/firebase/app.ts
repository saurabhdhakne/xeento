import { initializeApp, type FirebaseApp } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, initializeAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, type Firestore } from "firebase/firestore";
import type { FirebaseWebConfig } from "./config";

// One Firebase app per config, on the device only. Firestore keeps no
// offline cache of its own (memory only): Dexie is the one offline layer.

// Development only: point at `firebase emulators:start` instead of the
// user's project (see CLAUDE.md). Never set in a real build.
const USE_EMULATORS = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1";

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

const apps = new Map<string, FirebaseHandles>();

export function getFirebase(config: FirebaseWebConfig): FirebaseHandles {
  // A stable name per project + app: Firebase stores the signed-in session
  // under the app's name, so it must be the same on every page load.
  const name = `xeento:${config.projectId}:${config.appId}`;
  const existing = apps.get(name);
  if (existing) return existing;
  const app = initializeApp(config, name);
  const auth = initializeAuth(app, { persistence: browserLocalPersistence });
  const firestore = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });
  if (USE_EMULATORS) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(firestore, "127.0.0.1", 8085);
  }
  const handles = { app, auth, firestore };
  apps.set(name, handles);
  return handles;
}
