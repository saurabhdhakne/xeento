// Remote copies of uploaded files in Sync mode (ROADMAP.md: the user's own
// Google Drive first). Local mode has no FileStorageAdapter. Dexie's `files`
// table stays the local cache; blocks keep `xeento-file://<id>` URLs.

export interface FileStorageAdapter {
  /** Stores the remote copy of a file under Xeento's file id. */
  upload(fileId: string, blob: Blob, meta: { name: string; mimeType: string }): Promise<void>;
  /** Fetches the remote copy, e.g. on a local cache miss. */
  download(fileId: string): Promise<Blob>;
  /** Removes the remote copy. Succeeds if it's already gone. */
  delete(fileId: string): Promise<void>;
}
