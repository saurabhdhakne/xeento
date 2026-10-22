import { storeFile } from "./files";
import { fileUrl } from "./use-files";

/**
 * Xeento has no backend, so "uploading" a file means storing its bytes in
 * the `files` IndexedDB table (via storeFile — which enforces the 25/100MB
 * warn/reject limits) and handing BlockNote back a `xeento-file://<id>`
 * reference instead of a real URL. Every asset-bearing block resolves that
 * reference back to a usable URL at render time via useResolvedAssetUrl.
 */
export async function uploadFileToFileStore(file: File): Promise<string> {
  const record = await storeFile(file);
  return fileUrl(record.id);
}
