import { doc, getDoc, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";

// Setup checks for the wizard. The rules can't be read from the client, so
// firebase/firestore.rules allows reading one probe document per rules
// version: readable means those rules are installed.

/** Bump with the `xeento-rules/vN` probe in firebase/firestore.rules. */
export const RULES_VERSION = 1;
/** The data format in users/{uid}. Bump on breaking changes to synced documents. */
export const SCHEMA_VERSION = 1;

const TIMEOUT_MS = 15_000;

export type CheckResult = { ok: true; warning?: string } | { ok: false; message: string };

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "timeout" })), TIMEOUT_MS)),
  ]);
}

const code = (error: unknown) => (error as { code?: string }).code ?? "";
const text = (error: unknown) => String((error as { message?: string }).message ?? "");

/**
 * A project with no Firestore database also answers "permission-denied"
 * (the Firestore API isn't enabled until a database is created), so check
 * the message before reading that code as "reachable, rules refused".
 */
const noDatabase = (error: unknown) =>
  /Cloud Firestore API has not been used|SERVICE_DISABLED|database .* does not exist/i.test(text(error));
const refusedByRules = (error: unknown) => code(error) === "permission-denied" && !noDatabase(error);

/** Can we reach this project's Firestore at all? (Permission errors still mean yes.) */
export async function testConnection(firestore: Firestore): Promise<CheckResult> {
  try {
    await withTimeout(getDoc(doc(firestore, "xeento-rules", "connection-test")));
    return { ok: true };
  } catch (error) {
    if (refusedByRules(error)) return { ok: true };
    return { ok: false, message: connectionMessage(error) };
  }
}

/** Are Xeento's rules (this version) installed? Warns about open "test mode" rules. */
export async function checkRules(firestore: Firestore): Promise<CheckResult> {
  try {
    await withTimeout(getDoc(doc(firestore, "xeento-rules", `v${RULES_VERSION}`)));
  } catch (error) {
    if (!refusedByRules(error)) return { ok: false, message: connectionMessage(error) };
    for (let older = RULES_VERSION - 1; older >= 1; older--) {
      const readable = await getDoc(doc(firestore, "xeento-rules", `v${older}`)).then(() => true, () => false);
      if (readable) return { ok: false, message: "Your project has an older version of Xeento's rules. Copy the rules again and publish them." };
    }
    return { ok: false, message: "Xeento's rules aren't installed yet. Copy them, paste them in Firestore → Rules, and click Publish. Publishing can take a minute." };
  }
  // These rules deny every other top-level path. If this read works, the
  // project still has open rules (Firebase's "test mode").
  const open = await getDoc(doc(firestore, "xeento-rules", "should-be-denied")).then(() => true, () => false);
  return open
    ? { ok: true, warning: "Your rules also allow other access (Firebase's test mode). Replace all of them with Xeento's rules so only you can read your notes." }
    : { ok: true };
}

/** After sign-in: write/read the account's schema document. Fails if a newer Xeento wrote this data. */
export async function checkAccountSchema(firestore: Firestore, uid: string): Promise<CheckResult> {
  const ref = doc(firestore, "users", uid, "meta", "schema");
  try {
    const snap = await withTimeout(getDoc(ref));
    const version = snap.exists() ? Number(snap.data().version) : 0;
    if (version > SCHEMA_VERSION) {
      return { ok: false, message: "This account was used with a newer version of Xeento. Update Xeento on this device." };
    }
    if (version < SCHEMA_VERSION) await withTimeout(setDoc(ref, { version: SCHEMA_VERSION, syncedAt: serverTimestamp() }));
    return { ok: true };
  } catch (error) {
    if (refusedByRules(error)) {
      return { ok: false, message: "Firestore refused access to your account's data. Check that Xeento's rules are published." };
    }
    return { ok: false, message: connectionMessage(error) };
  }
}

function connectionMessage(error: unknown): string {
  const c = code(error);
  const m = text(error);
  if (/API key not valid/i.test(m)) return "Firebase rejected the apiKey. Check the config you pasted.";
  if (noDatabase(error) || c === "not-found" || /NOT_FOUND/i.test(m)) {
    return "This project has no Firestore database yet. Create one in the Firebase console (Firestore Database → Create database).";
  }
  if (c === "timeout" || c === "unavailable" || /offline/i.test(m)) {
    return "Couldn't reach Firebase. Check your connection and the projectId, then try again.";
  }
  if (c === "resource-exhausted") return "This Firebase project hit its free daily limit. It resets at midnight Pacific time.";
  return `Firebase returned an error: ${c || m || "unknown"}.`;
}
