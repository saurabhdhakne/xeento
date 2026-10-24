import matter from "gray-matter";
import Papa from "papaparse";
import { ROOT_ID } from "@/lib/records";
import { createPage, movePageToPosition, setPageContent, setPageTags, getPage, emptyDocument } from "@/lib/pages";
import { createFolder } from "@/lib/folders";
import { storeFile } from "@/lib/files";
import { fileUrl } from "@/lib/use-files";
import { markdownToBlocks } from "@/lib/export/headless-editor";
import { loadZip, listFiles, baseName, extensionOf, resolveRelativePath } from "./zip-utils";
import type JSZip from "jszip";

export interface ImportDialect {
  /** Strip Notion's trailing " <32 hex chars>" suffix from display titles (not from the paths used to match files — those stay raw). */
  stripHexIds: boolean;
}

export type ImportProgressCallback = (processed: number, total: number, currentPath: string) => void;

export interface ImportSummary {
  pagesCreated: number;
  filesImported: number;
  skipped: { path: string; reason: string }[];
}

const PENDING_LINK_SCHEME = "xeento-pending-link://";
const SUPPORTED_ATTACHMENT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|mp4|webm|mp3|wav|pdf)$/i;

interface Context {
  zip: JSZip;
  allPaths: string[];
  dialect: ImportDialect;
  onProgress: ImportProgressCallback;
  pathToPageId: Map<string, string>;
  pendingLinkFixups: Set<string>;
  summary: ImportSummary;
  processed: number;
  total: number;
}

function displayTitle(rawNameNoExt: string, dialect: ImportDialect): string {
  if (!dialect.stripHexIds) return rawNameNoExt;
  const stripped = rawNameNoExt.replace(/ [0-9a-f]{32}$/i, "").trim();
  return stripped || rawNameNoExt;
}

function immediateChildren(allPaths: string[], dirPath: string): { files: string[]; dirs: string[] } {
  const prefix = dirPath ? `${dirPath}/` : "";
  const files = new Set<string>();
  const dirs = new Set<string>();
  for (const p of allPaths) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    if (slash === -1) files.add(p);
    else dirs.add(prefix + rest.slice(0, slash));
  }
  return { files: [...files], dirs: [...dirs] };
}

async function replaceAsync(
  str: string,
  regex: RegExp,
  asyncFn: (...args: string[]) => Promise<string>,
): Promise<string> {
  const promises: Promise<string>[] = [];
  str.replace(regex, (...args: string[]) => {
    promises.push(asyncFn(...args));
    return "";
  });
  const results = await Promise.all(promises);
  let i = 0;
  return str.replace(regex, () => results[i++]);
}

/**
 * Rewrites markdown-relative links within one file: image/attachment
 * links that resolve to a real zip entry get uploaded into the file store
 * and become `xeento-file://<id>`; links to another .md file in the zip
 * become a `xeento-pending-link://<raw path>` placeholder, fixed up in a
 * second pass once every page has been created (so forward references —
 * a page linking to one not created yet — still resolve).
 */
async function rewriteMarkdownLinks(
  ctx: Context,
  mdPath: string,
  markdown: string,
): Promise<{ markdown: string; assetCount: number }> {
  let assetCount = 0;
  const pathSet = new Set(ctx.allPaths);
  const regex = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  const rewritten = await replaceAsync(markdown, regex, async (match, bang, text, target) => {
    if (/^(https?:)?\/\//i.test(target) || target.startsWith("mailto:") || target.startsWith("#")) {
      return match;
    }
    const resolved = resolveRelativePath(mdPath, target.split("#")[0]);
    if (!pathSet.has(resolved)) return match;

    if (extensionOf(resolved) === "md") {
      return `${bang}[${text}](${PENDING_LINK_SCHEME}${encodeURIComponent(resolved)})`;
    }

    const entry = ctx.zip.file(resolved);
    if (!entry) return match;
    const blob = await entry.async("blob");
    const record = await storeFile(new File([blob], baseName(resolved)));
    assetCount++;
    return `${bang}[${text}](${fileUrl(record.id)})`;
  });

  return { markdown: rewritten, assetCount };
}

interface InlineNodeLike {
  type?: string;
  href?: string;
  content?: unknown;
  [key: string]: unknown;
}

function rewritePendingLinks(
  blocks: unknown,
  pathToPageId: Map<string, string>,
): { changed: boolean; blocks: unknown } {
  let changed = false;

  function walkInline(nodes: unknown): unknown {
    if (!Array.isArray(nodes)) return nodes;
    const out: InlineNodeLike[] = [];
    for (const raw of nodes as InlineNodeLike[]) {
      if (raw?.type === "link" && typeof raw.href === "string" && raw.href.startsWith(PENDING_LINK_SCHEME)) {
        changed = true;
        const originalPath = decodeURIComponent(raw.href.slice(PENDING_LINK_SCHEME.length));
        const targetId = pathToPageId.get(originalPath);
        if (targetId) {
          out.push({ ...raw, href: `xeento-page://${targetId}` });
        } else if (Array.isArray(raw.content)) {
          out.push(...(raw.content as InlineNodeLike[]));
        }
        continue;
      }
      if (Array.isArray(raw?.content)) {
        out.push({ ...raw, content: walkInline(raw.content) });
      } else {
        out.push(raw);
      }
    }
    return out;
  }

  function walkBlock(block: InlineNodeLike): InlineNodeLike {
    const next = { ...block };
    if (Array.isArray(next.content)) next.content = walkInline(next.content);
    if (Array.isArray(next.children)) {
      next.children = (next.children as InlineNodeLike[]).map(walkBlock);
    }
    return next;
  }

  const result = Array.isArray(blocks) ? (blocks as InlineNodeLike[]).map(walkBlock) : blocks;
  return { changed, blocks: result };
}

async function placeNewPage(pageId: string, parentId: string, folderId: string | null) {
  if (parentId === ROOT_ID && folderId) {
    await movePageToPosition(pageId, ROOT_ID, Number.MAX_SAFE_INTEGER, folderId);
  }
}

async function importMarkdownFile(
  ctx: Context,
  filePath: string,
  title: string,
  parentId: string,
  folderId: string | null,
): Promise<string> {
  const entry = ctx.zip.file(filePath);
  if (!entry) throw new Error("missing entry");
  const raw = await entry.async("string");
  const parsed = matter(raw);
  const frontmatterTitle = typeof parsed.data?.title === "string" ? parsed.data.title : null;
  const frontmatterTags: string[] = Array.isArray(parsed.data?.tags)
    ? parsed.data.tags.filter((t: unknown): t is string => typeof t === "string")
    : [];

  const { markdown, assetCount } = await rewriteMarkdownLinks(ctx, filePath, parsed.content);
  const blocks = markdownToBlocks(markdown);

  const page = await createPage(parentId, frontmatterTitle ?? title);
  await placeNewPage(page.id, parentId, folderId);
  await setPageContent(page.id, blocks);
  if (frontmatterTags.length > 0) await setPageTags(page.id, frontmatterTags);

  ctx.pathToPageId.set(filePath, page.id);
  ctx.pendingLinkFixups.add(page.id);
  ctx.summary.pagesCreated++;
  ctx.summary.filesImported += assetCount;
  return page.id;
}

async function importCsvFile(
  ctx: Context,
  filePath: string,
  title: string,
  parentId: string,
  folderId: string | null,
): Promise<string | null> {
  const entry = ctx.zip.file(filePath);
  if (!entry) return null;
  const text = await entry.async("string");
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const rows = result.data.filter((r) => r.length > 0);
  if (rows.length === 0) {
    ctx.summary.skipped.push({ path: filePath, reason: "Empty CSV" });
    return null;
  }

  const page = await createPage(parentId, title);
  await placeNewPage(page.id, parentId, folderId);
  await setPageContent(page.id, [
    {
      type: "paragraph",
      content:
        "⚠️ Imported from a Notion database as a plain table — database views, filters, and properties aren't preserved. TODO: map to Xeento's own database feature once that milestone exists.",
    },
    {
      type: "table",
      content: {
        type: "tableContent",
        headerRows: 1,
        rows: rows.map((row) => ({ cells: row })),
      },
    },
  ]);

  ctx.pathToPageId.set(filePath, page.id);
  ctx.summary.pagesCreated++;
  return page.id;
}

async function importDirectory(
  ctx: Context,
  dirPath: string,
  parentId: string,
  folderId: string | null,
): Promise<void> {
  const { files, dirs } = immediateChildren(ctx.allPaths, dirPath);
  const ownedDirs = new Set<string>();

  for (const filePath of files) {
    const ext = extensionOf(filePath);
    if (ext !== "md" && ext !== "csv") {
      if (!SUPPORTED_ATTACHMENT_RE.test(filePath)) {
        ctx.summary.skipped.push({ path: filePath, reason: "Unsupported file type" });
      }
      continue;
    }

    const withoutExt = filePath.slice(0, filePath.length - ext.length - 1);
    const ownedDir = dirs.find((d) => d === withoutExt);
    const rawName = baseName(withoutExt);
    const title = displayTitle(rawName, ctx.dialect);

    ctx.processed++;
    ctx.onProgress(ctx.processed, ctx.total, filePath);

    try {
      const newPageId =
        ext === "csv"
          ? await importCsvFile(ctx, filePath, title, parentId, folderId)
          : await importMarkdownFile(ctx, filePath, title, parentId, folderId);

      if (ownedDir && newPageId) {
        ownedDirs.add(ownedDir);
        await importDirectory(ctx, ownedDir, newPageId, null);
      }
    } catch {
      ctx.summary.skipped.push({ path: filePath, reason: "Failed to import" });
    }
  }

  for (const dir of dirs) {
    if (ownedDirs.has(dir)) continue;
    // A standalone folder with no owning .md/.csv sibling becomes a parent
    // page (Xeento folders can't nest, so anything below the top-level
    // import folder has to use page nesting instead).
    const groupTitle = displayTitle(baseName(dir), ctx.dialect);
    const groupPage = await createPage(parentId, groupTitle);
    await placeNewPage(groupPage.id, parentId, folderId);
    await setPageContent(groupPage.id, emptyDocument());
    ctx.summary.pagesCreated++;
    await importDirectory(ctx, dir, groupPage.id, null);
  }
}

function countImportableFiles(allPaths: string[]): number {
  return allPaths.filter((p) => {
    const ext = extensionOf(p);
    return ext === "md" || ext === "csv";
  }).length;
}

/**
 * Imports a zip's contents into a brand-new top-level folder, mapping the
 * zip's directory structure onto Xeento's page tree (see importDirectory
 * for the folder/page-nesting rules). Shared by both plain markdown-zip
 * import and Notion import — they differ only in `dialect` and the
 * destination folder's name.
 */
export async function importZip(
  file: File,
  destinationFolderName: string,
  dialect: ImportDialect,
  onProgress: ImportProgressCallback = () => {},
): Promise<ImportSummary> {
  const zip = await loadZip(file);
  const allPaths = listFiles(zip).map((e) => e.path);

  const ctx: Context = {
    zip,
    allPaths,
    dialect,
    onProgress,
    pathToPageId: new Map(),
    pendingLinkFixups: new Set(),
    summary: { pagesCreated: 0, filesImported: 0, skipped: [] },
    processed: 0,
    total: countImportableFiles(allPaths),
  };

  const folder = await createFolder(destinationFolderName);
  await importDirectory(ctx, "", ROOT_ID, folder.id);

  for (const pageId of ctx.pendingLinkFixups) {
    const page = await getPage(pageId);
    if (!page) continue;
    const { changed, blocks } = rewritePendingLinks(page.content, ctx.pathToPageId);
    if (changed) await setPageContent(pageId, blocks);
  }

  return ctx.summary;
}

/** A single loose .md file (not a zip) — one page, dropped at root or into a destination folder if given. */
export async function importSingleMarkdownFile(
  file: File,
  destinationFolderId: string | null,
): Promise<{ pageId: string; summary: ImportSummary }> {
  const raw = await file.text();
  const parsed = matter(raw);
  const title =
    (typeof parsed.data?.title === "string" ? parsed.data.title : null) ??
    file.name.replace(/\.md$/i, "");
  const tags: string[] = Array.isArray(parsed.data?.tags)
    ? parsed.data.tags.filter((t: unknown): t is string => typeof t === "string")
    : [];

  const blocks = markdownToBlocks(parsed.content);
  const page = await createPage(ROOT_ID, title);
  await placeNewPage(page.id, ROOT_ID, destinationFolderId);
  await setPageContent(page.id, blocks);
  if (tags.length > 0) await setPageTags(page.id, tags);

  return {
    pageId: page.id,
    summary: { pagesCreated: 1, filesImported: 0, skipped: [] },
  };
}
