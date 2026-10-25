import { FileStorageError } from "../file-storage";

// Google Identity Services (the browser token flow): an access token for the
// drive.file scope, so Xeento sees only the files it created. Uses only the
// OAuth client ID; there is no client secret in a browser app. Tokens last
// about an hour and are kept on this device only, per account.

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
/** False when the build has no client ID: Drive options are hidden and files stay on the device. */
export const driveAvailable = GOOGLE_CLIENT_ID !== "";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const SCRIPT_URL = "https://accounts.google.com/gsi/client";
const EARLY_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type: string }) => void;
      }): { requestAccessToken(options: { prompt: string }): void };
      hasGrantedAllScopes(response: TokenResponse, scope: string): boolean;
      revoke(token: string, done?: () => void): void;
    };
  };
}
declare global {
  interface Window {
    google?: Gis;
  }
}

let scriptLoad: Promise<Gis> | null = null;

/** Loads Google's script. Call early (e.g. when a Connect button renders) so a click can open the popup at once. */
export function loadGoogleIdentity(): Promise<Gis> {
  scriptLoad ??= new Promise<Gis>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google);
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error("Google sign-in didn't load")));
    script.onerror = () => {
      scriptLoad = null;
      reject(new FileStorageError("offline", "Couldn't load Google sign-in. Check your connection."));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

const cacheKey = (account: string) => `xeento:drive-token:${account}`;

function cachedToken(account: string): string | null {
  try {
    const { token, expiresAt } = JSON.parse(window.localStorage.getItem(cacheKey(account)) ?? "null") ?? {};
    return token && expiresAt - EARLY_MS > Date.now() ? token : null;
  } catch {
    return null;
  }
}

/**
 * An access token for `account` (Xeento's uid). Uses the saved one while it's
 * valid. Otherwise asks Google: `interactive` (from a click) may show the
 * account chooser and consent screen; non-interactive is the quiet
 * re-approval, which fails with kind "auth" if the browser blocks the popup.
 */
export async function getDriveToken(account: string, interactive: boolean): Promise<string> {
  const saved = interactive ? null : cachedToken(account);
  if (saved) return saved;
  const gis = await loadGoogleIdentity();
  return new Promise((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new FileStorageError("auth", "Google didn't give access to Drive."));
        } else if (!gis.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) {
          reject(new FileStorageError("auth", "Xeento needs permission to see the files it creates in your Drive. Connect again and allow it."));
        } else {
          const expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
          window.localStorage.setItem(cacheKey(account), JSON.stringify({ token: response.access_token, expiresAt }));
          resolve(response.access_token);
        }
      },
      error_callback: (error) =>
        reject(
          new FileStorageError(
            "auth",
            error.type === "popup_closed" ? "The Google window was closed before connecting." : "Google Drive needs you to reconnect.",
          ),
        ),
    });
    client.requestAccessToken({ prompt: interactive ? "select_account" : "" });
  });
}

/** Forgets the saved token so the next call asks Google again (e.g. after a 401). */
export function forgetDriveToken(account: string) {
  window.localStorage.removeItem(cacheKey(account));
}

/** Revokes Xeento's access and forgets the token. */
export async function revokeDriveAccess(account: string) {
  const token = cachedToken(account);
  forgetDriveToken(account);
  if (!token) return;
  const gis = await loadGoogleIdentity().catch(() => null);
  await new Promise<void>((resolve) => (gis ? gis.accounts.oauth2.revoke(token, resolve) : resolve()));
}
