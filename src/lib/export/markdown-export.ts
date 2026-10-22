import JSZip from "jszip";
import { downloadBlob, sanitizeFileName, dedupeName } from "@/lib/download";
import { ROOT_ID, type PageRecord } from "@/lib/db";
import { getChildren, getPage } from "@/lib/pages";
import { getFile } from "@/lib/files";
import { getAllFolders } from "@/lib/folders";
import { rewriteFileRefs, type CollectedAsset } from "./rewrite-file-refs";
import { blocksToMarkdown } from "./headless-editor";

function pageHeading(page: PageRecord): string {
  return `# ${page.icon ? `${page.icon} ` : ""}${page.title || "Untitled"}`;
}

async function pageMarkdown(
  page: PageRecord,
  pathPrefix: string,
): Promise<{ markdown: string; assets: CollectedAsset[] }> {
  const { blocks, assets } = await rewriteFileRefs(page.content, pathPrefix);
  const body = blocksToMarkdown(blocks);
  return { markdown: `${pageHeading(page)}\n\n${body}`, assets };
}

/**
 * Adds `page` as its own subfolder of `parentZipFolder` (containing
 * "<Title>.md"), recursing into children when `includeChildren` is set.
 * Shared by single-page export and workspace export so the folder/zip
 * convention — and the asset-path depth math — only exists once.
 */
async function addPageFolder(
  parentZipFolder: JSZip,
  page: PageRecord,
  depth: number,
  includeChildren: boolean,
  assetsOut: Map<string, CollectedAsset>,
  siblingNames: Set<string>,
): Promise<void> {
  const title = dedupeName(sanitizeFileName(page.title), siblingNames);
  const pageFolder = parentZipFolder.folder(title);
  if (!pageFolder) return;

  const { markdown, assets } = await pageMarkdown(page, "../".repeat(depth + 1));
  pageFolder.file(`${title}.md`, markdown);
  for (const asset of assets) assetsOut.set(asset.fileId, asset);

  if (includeChildren) {
    const children = await getChildren(page.id);
    const childNames = new Set<string>();
    for (const child of children) {
      await addPageFolder(pageFolder, child, depth + 1, true, assetsOut, childNames);
    }
  }
}

async function writeAssets(zip: JSZip, assets: Map<string, CollectedAsset>) {
  for (const asset of assets.values()) {
    const file = await getFile(asset.fileId);
    if (file) zip.file(asset.canonicalPath, file.blob);
  }
}

/**
 * Single page, no sub-pages, no attachments → a plain .md download.
 * Otherwise → a .zip with one folder per page (mirroring the page tree)
 * and a shared assets/ folder at the zip root.
 */
export async function exportPageAsMarkdown(pageId: string, includeSubpages: boolean): Promise<void> {
  const page = await getPage(pageId);
  if (!page) throw new Error("Page not found");

  const children = includeSubpages ? await getChildren(page.id) : [];
  const probe = await pageMarkdown(page, "");

  if (children.length === 0 && probe.assets.length === 0) {
    downloadBlob(
      new Blob([probe.markdown], { type: "text/markdown;charset=utf-8" }),
      `${sanitizeFileName(page.title)}.md`,
    );
    return;
  }

  const zip = new JSZip();
  const assetsOut = new Map<string, CollectedAsset>();
  await addPageFolder(zip, page, 0, includeSubpages, assetsOut, new Set());
  await writeAssets(zip, assetsOut);

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${sanitizeFileName(page.title)}.zip`);
}

/** Every folder's direct pages (each in its own top-level zip folder), plus every unfoldered root page, plus every referenced asset. */
export async function exportWorkspaceAsZip(): Promise<void> {
  const zip = new JSZip();
  const assetsOut = new Map<string, CollectedAsset>();
  const topLevelNames = new Set<string>();

  const folders = await getAllFolders();
  for (const folder of folders) {
    const folderName = dedupeName(sanitizeFileName(folder.name), topLevelNames);
    const folderZip = zip.folder(folderName);
    if (!folderZip) continue;
    const pages = await getChildren(ROOT_ID, folder.id);
    const siblingNames = new Set<string>();
    for (const page of pages) {
      await addPageFolder(folderZip, page, 1, true, assetsOut, siblingNames);
    }
  }

  const unfolderedPages = await getChildren(ROOT_ID, null);
  for (const page of unfolderedPages) {
    await addPageFolder(zip, page, 0, true, assetsOut, topLevelNames);
  }

  await writeAssets(zip, assetsOut);
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `xeento-workspace-${new Date().toISOString().slice(0, 10)}.zip`);
}
