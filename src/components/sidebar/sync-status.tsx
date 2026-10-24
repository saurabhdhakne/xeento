"use client";

import { useState } from "react";
import { Cloud, CloudOff, Loader2, TriangleAlert } from "lucide-react";
import { useSyncSettings } from "@/lib/sync-settings";
import { useSyncStatus } from "@/lib/sync/status";
import { AccountSyncDialog } from "../setup/account-sync-dialog";

/** Sidebar footer: sync state in Sync mode (hidden in Local mode). Opens Account & sync. */
export function SyncStatusIndicator() {
  const settings = useSyncSettings();
  const status = useSyncStatus();
  const [open, setOpen] = useState(false);
  if (settings?.mode !== "sync") return null;

  const { icon, label } =
    status.state === "synced"
      ? { icon: <Cloud className="h-3.5 w-3.5 shrink-0" />, label: "Synced" }
      : status.state === "offline"
        ? { icon: <CloudOff className="h-3.5 w-3.5 shrink-0" />, label: "Offline" }
        : status.state === "error"
          ? { icon: <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />, label: "Not syncing" }
          : { icon: <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />, label: "Syncing…" };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={status.message ?? (status.lastSyncedAt ? `Last synced ${new Date(status.lastSyncedAt).toLocaleTimeString()}` : label)}
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
