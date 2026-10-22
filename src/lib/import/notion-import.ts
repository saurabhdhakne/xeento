import { importZip, type ImportProgressCallback, type ImportSummary } from "./import-core";

/** Notion's "Export → Markdown & CSV" .zip: hex-id-suffixed names stripped for display, CSVs become table pages, everything lands in one fresh folder so it never mixes with existing pages. */
export async function importNotionExport(
  file: File,
  onProgress: ImportProgressCallback = () => {},
): Promise<ImportSummary> {
  const today = new Date().toISOString().slice(0, 10);
  return importZip(file, `Imported from Notion – ${today}`, { stripHexIds: true }, onProgress);
}
