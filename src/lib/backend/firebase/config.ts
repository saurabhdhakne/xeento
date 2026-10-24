// The Firebase web app config the user pastes in setup. It identifies their
// project; it isn't a secret (Firestore rules protect the data).

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export type ConfigParseResult = { ok: true; config: FirebaseWebConfig } | { ok: false; errors: string[] };

const CHECKS: { key: keyof FirebaseWebConfig; pattern: RegExp; hint: string }[] = [
  { key: "apiKey", pattern: /^AIza[\w-]{35}$/, hint: 'apiKey should start with "AIza" and be 39 characters long.' },
  { key: "authDomain", pattern: /^[a-z0-9.-]+\.[a-z]{2,}$/i, hint: 'authDomain should look like "your-project.firebaseapp.com".' },
  { key: "projectId", pattern: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, hint: "projectId should be your project's ID: lowercase letters, digits and dashes." },
  { key: "appId", pattern: /^1:\d+:web:[0-9a-f]+$/, hint: 'appId should look like "1:1234567890:web:abc123…". Make sure you added a Web app.' },
];

/**
 * Accepts what the Firebase console shows under Project settings → Your apps
 * (`const firebaseConfig = { apiKey: "…", … };`, possibly with imports and
 * comments around it) or plain JSON. Never evaluates the text as code.
 */
export function parseFirebaseConfig(text: string): ConfigParseResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) {
    return { ok: false, errors: ["Paste the whole config object, including the { and } braces."] };
  }
  const values: Record<string, string> = {};
  // key: "value" or "key": 'value', in any order, ignoring everything else.
  for (const match of text.slice(start, end + 1).matchAll(/["']?(\w+)["']?\s*:\s*(["'`])(.*?)\2/g)) {
    values[match[1]] = match[3];
  }
  const errors: string[] = [];
  for (const { key, pattern, hint } of CHECKS) {
    const value = values[key]?.trim();
    if (!value) errors.push(`${key} is missing.`);
    else if (!pattern.test(value)) errors.push(hint);
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: {
      apiKey: values.apiKey.trim(),
      authDomain: values.authDomain.trim(),
      projectId: values.projectId.trim(),
      appId: values.appId.trim(),
      ...(values.storageBucket ? { storageBucket: values.storageBucket.trim() } : {}),
      ...(values.messagingSenderId ? { messagingSenderId: values.messagingSenderId.trim() } : {}),
    },
  };
}
