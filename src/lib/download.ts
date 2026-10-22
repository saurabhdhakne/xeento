export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Strips characters invalid in filenames across OSes and trims to a sane length. */
export function sanitizeFileName(name: string): string {
  const cleaned = (name || "Untitled").replace(/[\\/:*?"<>|]+/g, "_").trim();
  return cleaned.slice(0, 80) || "Untitled";
}

/** Appends a numeric suffix if `name` collides with something already in `used` (case-insensitive), then records it. */
export function dedupeName(name: string, used: Set<string>): string {
  let candidate = name;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${name} (${i})`;
    i++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
