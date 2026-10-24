"use client";

import { useEffect } from "react";
import { AppShell } from "./app-shell";
import { SetupWizard } from "./setup/setup-wizard";
import { SignInScreen } from "./setup/sign-in-screen";
import { useSyncSettings } from "@/lib/sync-settings";
import { startSync } from "@/lib/sync/account";

/**
 * Picks what to show before the workspace: Welcome on first launch, the
 * sign-in screen in Sync mode with nobody signed in (no notes are opened),
 * otherwise the workspace, syncing in Sync mode.
 */
export function AppRoot() {
  const settings = useSyncSettings();
  const syncing = settings?.mode === "sync" && settings.uid !== null;

  useEffect(() => {
    if (!syncing) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void startSync().then((s) => {
      if (cancelled) s();
      else stop = s;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [syncing]);

  if (!settings) return null;
  if (settings.mode === null) return <SetupWizard />;
  if (settings.mode === "sync" && !settings.uid) return <SignInScreen settings={settings} />;
  return <AppShell />;
}
