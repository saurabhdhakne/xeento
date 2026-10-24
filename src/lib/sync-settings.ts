"use client";

import { useSyncExternalStore } from "react";
import type { FirebaseWebConfig } from "./backend/firebase/config";

// Device-only settings for Local vs Sync mode, in localStorage. Never synced.
// Firebase keeps its own sign-in tokens in IndexedDB on this device.

export interface SyncSettings {
  /** null until the user picks a mode on the Welcome screen. */
  mode: "local" | "sync" | null;
  /** The user's own Firebase web app config (not secret). */
  config: FirebaseWebConfig | null;
  /** Signed-in account. Its notes live in the `xeento-<uid>` database. */
  uid: string | null;
  email: string | null;
}

const KEY = "xeento:sync";
const EMPTY: SyncSettings = { mode: null, config: null, uid: null, email: null };
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: SyncSettings } | null = null;

export function getSyncSettings(): SyncSettings {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(KEY);
  if (cached?.raw !== raw) {
    let value = EMPTY;
    try {
      if (raw) value = { ...EMPTY, ...JSON.parse(raw) };
    } catch {
      // unreadable: treat as first launch
    }
    cached = { raw, value };
  }
  return cached.value;
}

export function setSyncSettings(patch: Partial<SyncSettings>) {
  window.localStorage.setItem(KEY, JSON.stringify({ ...getSyncSettings(), ...patch }));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** null until hydrated (server and first client render), so a Local user never sees a flash of the Welcome screen. */
export function useSyncSettings(): SyncSettings | null {
  return useSyncExternalStore(subscribe, getSyncSettings, () => null);
}

/** The account whose database this page load uses, or null for the Local database. */
export function activeAccountUid(): string | null {
  const { mode, uid } = getSyncSettings();
  return mode === "sync" ? uid : null;
}
