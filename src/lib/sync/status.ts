"use client";

import { useSyncExternalStore } from "react";

export interface SyncStatus {
  state: "off" | "connecting" | "syncing" | "synced" | "offline" | "error";
  /** Plain-language explanation for "error" (and "offline"). */
  message?: string;
  lastSyncedAt: number | null;
}

let pulledThisSession = false;
/** True once this page load has finished a full pull (file cleanup waits for it). */
export function hasPulledThisSession() {
  return pulledThisSession;
}
export function markPulledThisSession() {
  pulledThisSession = true;
}

const OFF: SyncStatus = { state: "off", lastSyncedAt: null };
let status = OFF;
const listeners = new Set<() => void>();

export function getSyncStatus() {
  return status;
}

export function setSyncStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  if (patch.state && patch.state !== "error" && patch.state !== "offline" && !("message" in patch)) status.message = undefined;
  for (const listener of listeners) listener();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
    () => OFF,
  );
}
