"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useSyncSettings } from "@/lib/sync-settings";
import { useSyncStatus } from "@/lib/sync/status";
import { disconnectToLocal, signOutAccount } from "@/lib/sync/account";
import { connectDrive, disconnectDrive, driveAvailable, loadGoogleIdentity, useDriveConnection } from "@/lib/sync/files";
import { syncNow } from "@/lib/sync/engine";
import { downloadBackup } from "@/lib/backup";
import { toast } from "../ui/toast";
import { SetupWizard } from "./setup-wizard";

/** Settings → Account & sync. */
export function AccountSyncDialog({ onClose }: { onClose: () => void }) {
  const settings = useSyncSettings();
  const status = useSyncStatus();
  const [wizard, setWizard] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (wizard) return <SetupWizard startAt="project" onCancel={() => setWizard(false)} />;
  const syncing = settings?.mode === "sync" && settings.uid;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-xl border border-border bg-popover p-5 text-sm shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Account & sync</h2>
          <button type="button" onClick={onClose} title="Close" className="rounded p-1 text-muted hover:bg-black/5 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        {syncing ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted">Mode</dt>
            <dd>Sync across devices</dd>
            <dt className="text-muted">Firebase project</dt>
            <dd>{settings.config?.projectId}</dd>
            <dt className="text-muted">Account</dt>
            <dd>{settings.email}</dd>
            <dt className="text-muted">Google Drive</dt>
            <dd>
              <DriveRow uid={settings.uid!} problem={status.driveProblem ?? null} waiting={status.filesWaiting ?? 0} />
            </dd>
            <dt className="text-muted">Status</dt>
            <dd>
              {statusLabel(status.state)}
              {status.message && <p className="text-muted">{status.message}</p>}
            </dd>
            <dt className="text-muted">Last sync</dt>
            <dd>{status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : "Not yet"}</dd>
          </dl>
        ) : (
          <p>
            <strong>Local mode.</strong> Your notes are only in this browser. Turn on sync to use them on other devices,
            with your own Firebase project.
          </p>
        )}

        {confirmSignOut ? (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p>Sign out of {settings?.email}? Keep a copy of this account&apos;s notes on this device?</p>
            <p className="text-muted">Either way, the next person to sign in sees only their own notes.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => (setBusy(true), void signOutAccount(true))} className={secondaryButton}>
                Keep offline copy
              </button>
              <button type="button" disabled={busy} onClick={() => (setBusy(true), void signOutAccount(false))} className={dangerButton}>
                Remove from this device
              </button>
              <button type="button" onClick={() => setConfirmSignOut(false)} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {syncing ? (
              <>
                <button type="button" onClick={() => setConfirmSignOut(true)} className={secondaryButton}>
                  Sign out
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Turn sync off? This account's notes become your Local notes on this device. If this device has older Local notes, they're downloaded as a backup file first. You'll be signed out.",
                      )
                    ) {
                      setBusy(true);
                      void (async () => {
                        const missing = await disconnectToLocal();
                        if (
                          typeof missing === "number" &&
                          window.confirm(
                            `${missing} ${missing === 1 ? "file" : "files"} added on other devices couldn't be fetched from Google Drive and will be missing in Local mode. Turn sync off anyway?`,
                          )
                        ) {
                          await disconnectToLocal(true);
                        }
                        setBusy(false);
                      })().catch(() => {
                        setBusy(false);
                        toast.error("Couldn't turn sync off. Nothing was changed.");
                      });
                    }
                  }}
                  className={secondaryButton}
                >
                  Disconnect (back to Local)
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setWizard(true)} className={primaryButton}>
                Turn on sync
              </button>
            )}
            <button
              type="button"
              onClick={() => void downloadBackup().catch(() => toast.error("Couldn't create the backup."))}
              className={secondaryButton}
            >
              Export all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DriveRow({ uid, problem, waiting }: { uid: string; problem: string | null; waiting: number }) {
  const connection = useDriveConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (driveAvailable) void loadGoogleIdentity().catch(() => {});
  }, []);

  if (!driveAvailable) return <span className="text-muted">Not available in this version of Xeento. Files stay on each device.</span>;
  if (connection === undefined) return null;

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectDrive(uid);
      syncNow();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const link = "text-accent hover:underline disabled:opacity-50";

  return (
    <div className="space-y-1">
      {connection ? (
        <p>Connected{connection.email ? ` as ${connection.email}` : ""}.</p>
      ) : (
        <p className="text-muted">Not connected. Files stay on this device until you connect.</p>
      )}
      {problem && <p className="text-amber-700 dark:text-amber-400">{problem}</p>}
      {waiting > 0 && (
        <p className="text-muted">
          {waiting} {waiting === 1 ? "file is" : "files are"} waiting to upload.
        </p>
      )}
      {error && (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        {!connection && (
          <button type="button" disabled={busy} onClick={connect} className={link}>
            Connect Google Drive
          </button>
        )}
        {connection && (
          <button type="button" disabled={busy} onClick={connect} className={link}>
            Reconnect
          </button>
        )}
        {connection && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Disconnect Google Drive on this device? Files already in Drive stay there; new files wait until you reconnect.")) {
                setBusy(true);
                void disconnectDrive(uid).finally(() => setBusy(false));
              }
            }}
            className={link}
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function statusLabel(state: string) {
  return (
    {
      connecting: "Connecting…",
      syncing: "Syncing…",
      synced: "Up to date",
      offline: "Offline",
      error: "Not syncing",
      off: "Starting…",
    } as Record<string, string>
  )[state];
}

const primaryButton =
  "inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50";
const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/8";
const dangerButton =
  "inline-flex items-center gap-1.5 rounded-md border border-red-600/40 px-3 py-1.5 text-sm text-red-600 hover:bg-red-600/10 disabled:opacity-50 dark:text-red-400";
