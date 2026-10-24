"use client";

import { useState } from "react";
import { AccountForm, SetupWizard } from "./setup-wizard";
import { activateAccount } from "@/lib/sync/account";
import { setSyncSettings, type SyncSettings } from "@/lib/sync-settings";

/**
 * Sync mode with nobody signed in (after sign-out, or an expired session).
 * No notes are shown here: the next person only sees their own after
 * signing in.
 */
export function SignInScreen({ settings }: { settings: SyncSettings }) {
  const [setup, setSetup] = useState(false);
  if (setup || !settings.config) return <SetupWizard startAt="project" onCancel={() => setSetup(false)} />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-popover p-6 shadow-2xl">
        <AccountForm
          config={settings.config}
          title="Sign in to sync"
          onSignedIn={(user) => activateAccount(user.uid, user.email)}
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
          <button type="button" onClick={() => setSyncSettings({ mode: "local" })} className="text-accent hover:underline">
            Use Local mode instead
          </button>
          <button type="button" onClick={() => setSetup(true)} className="text-accent hover:underline">
            Use a different Firebase project
          </button>
        </div>
      </div>
    </div>
  );
}
