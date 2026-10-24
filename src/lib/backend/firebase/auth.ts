import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import type { AuthProvider, AuthUser } from "../auth";

const toUser = (user: User | null): AuthUser | null => (user ? { uid: user.uid, email: user.email } : null);

/** Email + password sign-in in the user's own Firebase project. Errors are plain-language Errors. */
export function firebaseAuthProvider(auth: Auth): AuthProvider {
  return {
    async signUp(email, password) {
      try {
        return toUser((await createUserWithEmailAndPassword(auth, email, password)).user)!;
      } catch (error) {
        throw new Error(authMessage(error));
      }
    },
    async signIn(email, password) {
      try {
        return toUser((await signInWithEmailAndPassword(auth, email, password)).user)!;
      } catch (error) {
        throw new Error(authMessage(error));
      }
    },
    signOut: () => signOut(auth),
    currentUser: () => toUser(auth.currentUser),
    onSessionChange: (listener) => onAuthStateChanged(auth, (user) => listener(toUser(user))),
  };
}

/** Resolves once Firebase has restored (or failed to restore) the saved session. */
export function waitForSession(auth: Auth): Promise<AuthUser | null> {
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (user) => {
      stop();
      resolve(toUser(user));
    });
  });
}

function authMessage(error: unknown): string {
  const code = (error as { code?: string }).code ?? "";
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists in this project. Sign in instead.";
    case "auth/operation-not-allowed":
    case "auth/admin-restricted-operation":
      return "Creating accounts is turned off in this Firebase project. Ask the project owner to add you, or to turn on sign-up (see the setup guide).";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "Wrong email or password.";
    case "auth/invalid-email":
      return "That doesn't look like an email address.";
    case "auth/weak-password":
      return "Choose a password with at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Can't reach Firebase. Check your connection.";
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
    case "auth/invalid-api-key":
      return "Firebase rejected the apiKey. Check the config you pasted.";
    case "auth/configuration-not-found":
      return "Email/Password sign-in isn't enabled in this Firebase project (Authentication → Sign-in method).";
    default:
      return `Sign-in failed (${code || "unknown error"}).`;
  }
}
