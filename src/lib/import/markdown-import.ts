import { importSingleMarkdownFile, importZip, type ImportProgressCallback, type ImportSummary } from "./import-core";
import { createFolder } from "@/lib/folders";

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Accepts whatever the Import button / sidebar drop zone hands it: one
 * .md file, several loose .md files, or a single .zip of folders.
 */
export async function importMarkdownFiles(
  files: File[],
  onProgress: ImportProgressCallback = () => {},
): Promise<ImportSummary> {
  const zipFile = files.find((f) => f.name.toLowerCase().endsWith(".zip"));
  if (zipFile) {
    return importZip(zipFile, `Imported – ${todayStamp()}`, { stripHexIds: false }, onProgress);
  }

  const mdFiles = files.filter((f) => f.name.toLowerCase().endsWith(".md"));
  if (mdFiles.length === 0) {
    return { pagesCreated: 0, filesImported: 0, skipped: files.map((f) => ({ path: f.name, reason: "Not a .md or .zip file" })) };
  }

  const summary: ImportSummary = { pagesCreated: 0, filesImported: 0, skipped: [] };

  // A single loose file goes straight to the root; several at once get
  // grouped into one folder so they don't scatter across the sidebar.
  const destinationFolderId =
    mdFiles.length > 1 ? (await createFolder(`Imported – ${todayStamp()}`)).id : null;

  for (let i = 0; i < mdFiles.length; i++) {
    onProgress(i + 1, mdFiles.length, mdFiles[i].name);
    try {
      const { summary: single } = await importSingleMarkdownFile(mdFiles[i], destinationFolderId);
      summary.pagesCreated += single.pagesCreated;
    } catch {
      summary.skipped.push({ path: mdFiles[i].name, reason: "Failed to import" });
    }
  }

  return summary;
}
