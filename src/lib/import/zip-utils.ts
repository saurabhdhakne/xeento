import JSZip from "jszip";

export interface ZipEntry {
  path: string;
  file: JSZip.JSZipObject;
}

/**
 * Loads a zip, transparently unwrapping one level of "a zip containing
 * only another zip" — Notion sometimes wraps its own export zip inside an
 * outer one.
 */
export async function loadZip(file: File | Blob): Promise<JSZip> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  const zipEntries = entries.filter((e) => e.name.toLowerCase().endsWith(".zip"));
  if (entries.length === 1 && zipEntries.length === 1) {
    const inner = await zipEntries[0].async("blob");
    return JSZip.loadAsync(inner);
  }
  return zip;
}

export function listFiles(zip: JSZip): ZipEntry[] {
  return Object.entries(zip.files)
    .filter(([, f]) => !f.dir)
    .map(([path, file]) => ({ path, file }));
}

/** The folder path a zip entry lives in ("" for top-level files). */
export function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

export function baseName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

export function extensionOf(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx === -1 ? "" : path.slice(idx + 1).toLowerCase();
}

/** Resolves a markdown-relative link ("../assets/foo.png") against the linking file's own path. */
export function resolveRelativePath(fromPath: string, relative: string): string {
  if (relative.startsWith("http://") || relative.startsWith("https://") || relative.startsWith("#")) {
    return relative;
  }
  const decoded = decodeURIComponent(relative);
  const parts = dirOf(fromPath).split("/").filter(Boolean);
  for (const segment of decoded.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}
