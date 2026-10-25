import { FileStorageError, type FileStorageAdapter } from "../file-storage";

// Files in the user's own Google Drive, in a "Xeento" folder. Each Drive file
// is tagged with an appProperty holding Xeento's file id, so any device
// signed in to the same Google account (and this OAuth client) finds it;
// drive.file only shows Xeento its own files anyway.

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
/** Up to this size a single multipart request; above it, a resumable upload. */
const SIMPLE_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface DriveAdapter extends FileStorageAdapter {
  /** The connected Google account's email. */
  accountEmail(): Promise<string | null>;
}

/** `getToken` returns a valid access token, or throws FileStorageError("auth"). `onUnauthorized` drops a rejected one. */
export function googleDriveAdapter(getToken: () => Promise<string>, onUnauthorized: () => void): DriveAdapter {
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await getToken();
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    } catch {
      throw new FileStorageError("offline", "Couldn't reach Google Drive.");
    }
    if (response.ok) return response;
    const body = await response.text().catch(() => "");
    if (response.status === 401) {
      onUnauthorized();
      throw new FileStorageError("auth", "Google Drive needs you to reconnect.");
    }
    if (response.status === 404) throw new FileStorageError("notFound", "Not found in Google Drive.");
    if (/storageQuotaExceeded/.test(body)) throw new FileStorageError("quota", "Your Google Drive is full.");
    if (response.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(body)) {
      throw new FileStorageError("offline", "Google Drive is busy. Trying again shortly.");
    }
    throw new FileStorageError("unknown", `Google Drive error ${response.status}`);
  }

  const list = async (q: string, fields = "files(id)") =>
    ((await (await call(`${API}/files?${new URLSearchParams({ q, fields, spaces: "drive", pageSize: "10" })}`)).json()) as {
      files: { id: string; name?: string; mimeType?: string }[];
    }).files;

  let folder: Promise<string> | null = null;
  function folderId(): Promise<string> {
    folder ??= (async () => {
      const found = await list(`appProperties has { key='xeento' and value='folder' } and mimeType='${FOLDER_MIME}' and trashed=false`);
      if (found[0]) return found[0].id;
      const created = await call(`${API}/files?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Xeento", mimeType: FOLDER_MIME, appProperties: { xeento: "folder" } }),
      });
      return ((await created.json()) as { id: string }).id;
    })().catch((error) => {
      folder = null;
      throw error;
    });
    return folder;
  }

  const findFile = async (fileId: string) =>
    (await list(`appProperties has { key='xeentoFileId' and value='${fileId.replace(/'/g, "")}' } and trashed=false`, "files(id,name,mimeType)"))[0] ??
    null;

  return {
    async upload(fileId, blob, { name, mimeType }) {
      if (await findFile(fileId)) return;
      const metadata = JSON.stringify({ name, mimeType, parents: [await folderId()], appProperties: { xeentoFileId: fileId } });
      if (blob.size <= SIMPLE_UPLOAD_BYTES) {
        const boundary = `xeento-${crypto.randomUUID()}`;
        const body = new Blob([
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
          `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
          blob,
          `\r\n--${boundary}--`,
        ]);
        await call(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
          method: "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        });
        return;
      }
      const session = await call(`${UPLOAD_API}/files?uploadType=resumable&fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mimeType, "X-Upload-Content-Length": String(blob.size) },
        body: metadata,
      });
      const location = session.headers.get("Location");
      if (!location) throw new FileStorageError("unknown", "Google Drive didn't start the upload.");
      await call(location, { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
    },

    async download(fileId) {
      const found = await findFile(fileId);
      if (!found) throw new FileStorageError("notFound", "This file isn't in Google Drive yet. It may still be uploading from another device.");
      const blob = await (await call(`${API}/files/${found.id}?alt=media`)).blob();
      return new File([blob], found.name ?? fileId, { type: found.mimeType ?? blob.type });
    },

    async delete(fileId) {
      const found = await findFile(fileId);
      if (found) await call(`${API}/files/${found.id}`, { method: "DELETE" }).catch((e) => {
        if (!(e instanceof FileStorageError && e.kind === "notFound")) throw e;
      });
    },

    async accountEmail() {
      const about = (await (await call(`${API}/about?fields=user(emailAddress)`)).json()) as { user?: { emailAddress?: string } };
      return about.user?.emailAddress ?? null;
    },
  };
}
