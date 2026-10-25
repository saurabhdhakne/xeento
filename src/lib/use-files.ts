"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "./db";
import type { FileRecord } from "./records";
import { getFile } from "./files";
import { downloadMissingFile } from "./sync/files";
import { FileStorageError } from "./backend/file-storage";

export const FILE_URL_SCHEME = "xeento-file://";

export function fileUrl(id: string): string {
  return `${FILE_URL_SCHEME}${id}`;
}

export function parseFileUrl(url: string): string | null {
  return url.startsWith(FILE_URL_SCHEME) ? url.slice(FILE_URL_SCHEME.length) : null;
}

export function useFile(id: string | null): FileRecord | undefined {
  return useLiveQuery(() => (id ? getDb().files.get(id) : undefined), [id]);
}

const RETRY_MS = 5000;
const RETRY_FOR_MS = 2 * 60 * 1000;

/**
 * The page can arrive before its files: another device may still be
 * uploading (or waiting for Drive). Keep asking for a while, so the block
 * shows the file once it's there instead of staying broken.
 */
async function downloadWhenUploaded(fileId: string) {
  const giveUpAt = Date.now() + RETRY_FOR_MS;
  for (;;) {
    try {
      return await downloadMissingFile(fileId);
    } catch (error) {
      if (!(error instanceof FileStorageError && error.kind === "notFound") || Date.now() > giveUpAt) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      const arrived = await getFile(fileId);
      if (arrived) return arrived;
    }
  }
}

/**
 * Creates an isolated object-URL cache + resolver for one BlockNote editor
 * instance, meant to be passed straight to useCreateBlockNote's
 * `resolveFileUrl` option (BlockNote's own, officially-supported extension
 * point for "turn this block's stored url into something displayable" —
 * used internally by every file-type block's rendering *and* its
 * toolbar's download button, so image/video/audio/file all get local +
 * hosted URL support for free without overriding their renderers).
 *
 * Call `revokeAll()` when that editor unmounts. Xeento remounts one editor
 * per page (`key={pageId}` in page-view.tsx), so this gives "revoke on
 * unmount" scoped to "the page stops being shown" — resolveFileUrl's API
 * has no finer-grained per-asset lifecycle hook than that.
 */
export function createFileUrlResolver() {
  const cache = new Map<string, string>();

  async function resolve(rawUrl: string): Promise<string> {
    const fileId = parseFileUrl(rawUrl);
    if (!fileId) return rawUrl;
    const cached = cache.get(fileId);
    if (cached) return cached;
    // Sync mode: a file added on another device is fetched from Google Drive once.
    const file = (await getFile(fileId)) ?? (await downloadWhenUploaded(fileId));
    if (!file) throw new Error(`File not found: ${fileId}`);
    const objectUrl = URL.createObjectURL(file.blob);
    cache.set(fileId, objectUrl);
    return objectUrl;
  }

  function revokeAll() {
    for (const url of cache.values()) URL.revokeObjectURL(url);
    cache.clear();
  }

  return { resolve, revokeAll };
}
