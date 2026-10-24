"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import {
  checkConnection,
  checkSecurityRules,
  parseBackendConfig,
  securityRulesText as rulesText,
  signInToBackend,
  signOutOfBackend,
  type BackendConfig as FirebaseWebConfig,
  type CheckResult,
} from "@/lib/sync/setup";
import { activateAccount, copyLocalNotesIntoAccount, countLocalPages } from "@/lib/sync/account";
import { linkPreviewsAvailable } from "@/lib/link-preview";
import { setSyncSettings } from "@/lib/sync-settings";

const GUIDE_URL = "https://github.com/saurabhdhakne/xeento/blob/main/docs/setup/firebase.md";

type Step = "welcome" | "project" | "config" | "rules" | "account" | "notes" | "done";
const ORDER: Step[] = ["welcome", "project", "config", "rules", "account", "notes", "done"];

/**
 * First-launch Welcome (Local or Sync), and the Sync setup: Firebase
 * project → config → rules → account → existing notes → done. Nothing is
 * saved until Finish; Cancel leaves the device as it was.
 */
export function SetupWizard({ startAt = "welcome", onCancel }: { startAt?: Step; onCancel?: () => void }) {
  const [step, setStep] = useState<Step>(startAt);
  const [configText, setConfigText] = useState("");
  const [config, setConfig] = useState<FirebaseWebConfig | null>(null);
  const [account, setAccount] = useState<{ uid: string; email: string | null } | null>(null);
  const [localPages, setLocalPages] = useState<number | null>(null);

  useEffect(() => {
    void countLocalPages().then(setLocalPages);
  }, []);

  const go = (to: Step) => setStep(to);
  const back = () => {
    const prev = ORDER[ORDER.indexOf(step) - 1];
    if (step === "done" && localPages === 0) setStep("account");
    else if (prev && !(prev === "welcome" && startAt !== "welcome")) setStep(prev);
  };
  const cancel = () => {
    if (!window.confirm("Stop setting up sync? Nothing will change on this device.")) return;
    if (config && account) void signOutOfBackend(config);
    if (onCancel) onCancel();
    else {
      setAccount(null);
      setStep("welcome");
    }
  };
  const canGoBack = step !== "welcome" && !(step === "project" && startAt !== "welcome");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-popover p-6 shadow-2xl">
        {step === "welcome" && <WelcomeStep onSync={() => go("project")} />}
        {step === "project" && <ProjectStep />}
        {step === "config" && (
          <ConfigStep
            text={configText}
            onText={setConfigText}
            onConfig={setConfig}
          />
        )}
        {step === "rules" && config && <RulesStep config={config} onPassed={() => go("account")} />}
        {step === "account" && config && (
          <AccountForm
            config={config}
            onSignedIn={(user) => {
              setAccount(user);
              go(localPages ? "notes" : "done");
            }}
          />
        )}
        {step === "notes" && account && localPages !== null && (
          <NotesStep uid={account.uid} count={localPages} onDone={() => go("done")} />
        )}
        {step === "done" && account && config && (
          <Section title="You're set up">
            <p>
              Signed in as <strong>{account.email}</strong>. Your notes are saved on this device and sync to your Firebase
              project. The sidebar shows the sync status.
            </p>
            <p className="text-muted">Files in notes (images, PDFs) will sync once Google Drive is connected (coming next).</p>
          </Section>
        )}

        {step !== "welcome" && (
          <div className="mt-6 flex items-center gap-2">
            {canGoBack && step !== "done" && (
              <button type="button" onClick={back} className={secondaryButton}>
                Back
              </button>
            )}
            <button type="button" onClick={cancel} className={`${secondaryButton} mr-auto`}>
              Cancel
            </button>
            {step === "project" && (
              <button type="button" onClick={() => go("config")} className={primaryButton}>
                Next
              </button>
            )}
            {step === "config" && (
              <button type="button" disabled={!config} onClick={() => go("rules")} className={primaryButton}>
                Next
              </button>
            )}
            {step === "done" && account && config && (
              <button
                type="button"
                onClick={() => {
                  setSyncSettings({ config });
                  activateAccount(account.uid, account.email);
                }}
                className={primaryButton}
              >
                Finish
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WelcomeStep({ onSync }: { onSync: () => void }) {
  return (
    <Section title="Welcome to Xeento">
      <p>
        Your notes live on your device or in your own accounts. Xeento never sees or stores your notes.
      </p>
      {linkPreviewsAvailable && (
        <p className="text-muted">
          Link previews are fetched by Xeento&apos;s preview server, which sees the links you paste (never your notes) and
          doesn&apos;t store them. You can turn link previews off in Settings.
        </p>
      )}
      <div className="mt-2 grid gap-2">
        <button
          type="button"
          onClick={() => setSyncSettings({ mode: "local" })}
          className="rounded-lg border border-border p-3 text-left hover:bg-black/5 dark:hover:bg-white/8"
        >
          <div className="font-medium">Use on this device</div>
          <div className="text-sm text-muted">No account. Your notes stay in this browser. You can turn on sync later.</div>
        </button>
        <button
          type="button"
          onClick={onSync}
          className="rounded-lg border border-border p-3 text-left hover:bg-black/5 dark:hover:bg-white/8"
        >
          <div className="font-medium">Sync across devices</div>
          <div className="text-sm text-muted">Uses your own free Firebase project. Takes about 10 minutes to set up.</div>
        </button>
      </div>
    </Section>
  );
}

function ProjectStep() {
  return (
    <Section title="1. Create your Firebase project">
      <p>Sync uses a Firebase project that you own. Your notes go there, not to Xeento. The free plan is enough.</p>
      <p>Follow the guide to:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>create a Firebase project,</li>
        <li>add a Web app to it,</li>
        <li>turn on Email/Password sign-in,</li>
        <li>create a Firestore database.</li>
      </ol>
      <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
        Open the setup guide <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </Section>
  );
}

function ConfigStep({
  text,
  onText,
  onConfig,
}: {
  text: string;
  onText: (text: string) => void;
  onConfig: (config: FirebaseWebConfig | null) => void;
}) {
  const parsed = text.trim() ? parseBackendConfig(text) : null;
  const [check, setCheck] = useState<{ for: string; result: CheckResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const tested = parsed?.ok && check?.for === JSON.stringify(parsed.config) ? check.result : null;

  useEffect(() => {
    onConfig(parsed?.ok && tested?.ok ? parsed.config : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `parsed` is derived from `text`
  }, [text, tested]);

  return (
    <Section title="2. Paste your web app config">
      <p>
        In the Firebase console, open Project settings → Your apps, and copy the <code>firebaseConfig</code> object.
        Paste it here.
      </p>
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  projectId: "…",\n  appId: "…",\n};'}
        className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
      />
      {parsed && !parsed.ok && (
        <ul className="space-y-0.5 text-red-600 dark:text-red-400" role="alert">
          {parsed.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {parsed?.ok && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await checkConnection(parsed.config);
              setCheck({ for: JSON.stringify(parsed.config), result });
              setBusy(false);
            }}
            className={secondaryButton}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test connection"}
          </button>
          <CheckMessage result={tested} okText={`Connected to ${parsed.config.projectId}.`} />
        </div>
      )}
    </Section>
  );
}

function RulesStep({ config, onPassed }: { config: FirebaseWebConfig; onPassed: () => void }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const consoleUrl = `https://console.firebase.google.com/project/${config.projectId}/firestore/rules`;

  return (
    <Section title="3. Add Xeento's security rules">
      <p>
        These rules let each person read and write only their own notes. Copy them, replace everything in{" "}
        <a href={consoleUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Firestore → Rules
        </a>
        , and click Publish.
      </p>
      <pre className="max-h-40 overflow-auto rounded-md border border-border bg-background p-2 text-[11px] leading-snug">
        {rulesText}
      </pre>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(rulesText).then(() => setCopied(true));
          }}
          className={secondaryButton}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy rules"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setResult(await checkSecurityRules(config));
            setBusy(false);
          }}
          className={secondaryButton}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check rules"}
        </button>
        {result?.ok && (
          <button type="button" onClick={onPassed} className={`${primaryButton} ml-auto`}>
            Next
          </button>
        )}
      </div>
      <CheckMessage result={result} okText="Rules are installed." />
    </Section>
  );
}

/** Create an account or sign in, in the user's own Firebase project. Also used by the sign-in screen. */
export function AccountForm({
  config,
  onSignedIn,
  title = "4. Create your account",
}: {
  config: FirebaseWebConfig;
  onSignedIn: (user: { uid: string; email: string | null }) => void;
  title?: string;
}) {
  const [mode, setMode] = useState<"signUp" | "signIn">("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await signInToBackend(config, mode, email, password));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={mode === "signUp" ? title : "Sign in"}>
      <p className="text-muted">
        This account lives in your Firebase project ({config.projectId}). Each person using the project has their own
        account and sees only their own notes.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="grid gap-2"
      >
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="password"
          required
          autoComplete={mode === "signUp" ? "new-password" : "current-password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-ring"
        />
        {error && (
          <p className="text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signUp" ? "Create account" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signUp" ? "signIn" : "signUp");
              setError(null);
            }}
            className="text-sm text-accent hover:underline"
          >
            {mode === "signUp" ? "I already have an account" : "Create a new account"}
          </button>
        </div>
      </form>
    </Section>
  );
}

function NotesStep({ uid, count, onDone }: { uid: string; count: number; onDone: () => void }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Section title="5. Bring your existing notes">
      <p>
        This device has {count} {count === 1 ? "page" : "pages"} (including Trash) from before sync. Copy them into your
        account so they sync too? They also stay in Local mode on this device.
      </p>
      {progress && copied === null && (
        <p className="text-muted">
          Copying… {progress.done} of {progress.total} items
        </p>
      )}
      {copied !== null && <p>Copied {copied} items. They upload when you finish.</p>}
      {error && (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {copied === null ? (
          <>
            <button
              type="button"
              disabled={progress !== null}
              onClick={async () => {
                setProgress({ done: 0, total: 0 });
                try {
                  setCopied(await copyLocalNotesIntoAccount(uid, (done, total) => setProgress({ done, total })));
                } catch (e) {
                  setError(`Couldn't copy your notes: ${(e as Error).message}`);
                  setProgress(null);
                }
              }}
              className={primaryButton}
            >
              Copy my notes
            </button>
            <button type="button" disabled={progress !== null} onClick={onDone} className={secondaryButton}>
              Skip
            </button>
          </>
        ) : (
          <button type="button" onClick={onDone} className={primaryButton}>
            Next
          </button>
        )}
      </div>
    </Section>
  );
}

function CheckMessage({ result, okText }: { result: CheckResult | null; okText: string }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <p className="text-red-600 dark:text-red-400" role="alert">
        {result.message}
      </p>
    );
  }
  return (
    <div>
      <p className="text-green-700 dark:text-green-400">{okText}</p>
      {result.warning && <p className="text-amber-700 dark:text-amber-400">{result.warning}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 text-sm text-foreground">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

const primaryButton =
  "inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50";
const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/8";
