"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type FileRecord } from "./db";
import { getFile } from "./files";

export const FILE_URL_SCHEME = "xeento-file://";

export function fileUrl(id: string): string {
  return `${FILE_URL_SCHEME}${id}`;
}

export function parseFileUrl(url: string): string | null {
  return url.startsWith(FILE_URL_SCHEME) ? url.slice(FILE_URL_SCHEME.length) : null;
}

export function useFile(id: string | null): FileRecord | undefined {
  return useLiveQuery(() => (id ? db.files.get(id) : undefined), [id]);
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
    const file = await getFile(fileId);
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
