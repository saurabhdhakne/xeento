"use client";

import { useState, type ReactNode } from "react";
import { Cloud, CloudOff, Loader2, TriangleAlert } from "lucide-react";
import { useSyncSettings } from "@/lib/sync-settings";
import { useSyncStatus, type SyncStatus } from "@/lib/sync/status";
import { AccountSyncDialog } from "../setup/account-sync-dialog";

/** Sidebar footer: sync state in Sync mode (hidden in Local mode). Opens Account & sync. */
export function SyncStatusIndicator() {
  const settings = useSyncSettings();
  const status = useSyncStatus();
  const [open, setOpen] = useState(false);
  if (settings?.mode !== "sync") return null;

  const { icon, label } = indicator(status);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={status.message ?? status.driveProblem ?? (status.lastSyncedAt ? `Last synced ${new Date(status.lastSyncedAt).toLocaleTimeString()}` : label)}
        data-sync-state={status.state}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
      >
        {icon}
        <span className="flex-1 truncate">{label}</span>
      </button>
      {open && <AccountSyncDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function indicator(status: SyncStatus): { icon: ReactNode; label: string } {
  const warn = <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />;
  const cloud = <Cloud className="h-3.5 w-3.5 shrink-0" />;
  if (status.state === "error") return { icon: warn, label: "Not syncing" };
  if (status.driveProblem) return { icon: warn, label: "Reconnect Google Drive" };
  if (status.state === "offline") return { icon: <CloudOff className="h-3.5 w-3.5 shrink-0" />, label: "Offline" };
  if (status.state === "synced") {
    return { icon: cloud, label: (status.filesWaiting ?? 0) > 0 ? "Synced · files waiting for Drive" : "Synced" };
  }
  return { icon: <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />, label: "Syncing…" };
}
