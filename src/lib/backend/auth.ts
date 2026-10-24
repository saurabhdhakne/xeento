// Sign-in for Sync mode (ROADMAP.md). Local mode has no AuthProvider.
// Backend-neutral: Firebase Auth implements it first; Supabase could later.

export interface AuthUser {
  uid: string;
  email: string | null;
}

export interface AuthProvider {
  signUp(email: string, password: string): Promise<AuthUser>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  /** The signed-in user, or null. */
  currentUser(): AuthUser | null;
  /** Called on every sign-in, sign-out and restored session. Returns an unsubscribe function. */
  onSessionChange(listener: (user: AuthUser | null) => void): () => void;
}
