import { getFirebase } from "../backend/firebase/app";
import { firebaseAuthProvider } from "../backend/firebase/auth";
import { parseFirebaseConfig, type FirebaseWebConfig } from "../backend/firebase/config";
import { checkAccountSchema, checkRules, testConnection, type CheckResult } from "../backend/firebase/setup";
import type { AuthUser } from "../backend/auth";

// What the setup screens call, so components never import a backend
// directly. Firebase is the only backend for now.

export type BackendConfig = FirebaseWebConfig;

/** The security rules the user pastes into their project (firebase/firestore.rules). */
export { default as securityRulesText } from "../../../firebase/firestore.rules";
export type { CheckResult };

export const parseBackendConfig = parseFirebaseConfig;

export function checkConnection(config: BackendConfig) {
  return testConnection(getFirebase(config).firestore);
}

export function checkSecurityRules(config: BackendConfig) {
  return checkRules(getFirebase(config).firestore);
}

/** Creates an account or signs in, then checks the account's data format. Throws a plain-language Error. */
export async function signInToBackend(config: BackendConfig, mode: "signUp" | "signIn", email: string, password: string): Promise<AuthUser> {
  const { auth, firestore } = getFirebase(config);
  const provider = firebaseAuthProvider(auth);
  const user = mode === "signUp" ? await provider.signUp(email, password) : await provider.signIn(email, password);
  const schema = await checkAccountSchema(firestore, user.uid);
  if (!schema.ok) {
    await provider.signOut();
    throw new Error(schema.message);
  }
  return user;
}

export async function signOutOfBackend(config: BackendConfig) {
  await firebaseAuthProvider(getFirebase(config).auth).signOut();
}
