import { parseFileUrl } from "@/lib/use-files";
import { getFile } from "@/lib/files";
import { sanitizeFileName } from "@/lib/download";

export interface CollectedAsset {
  fileId: string;
  /** Root-relative, e.g. "assets/<fileId>-<name>" — not yet adjusted for any page's folder depth. */
  canonicalPath: string;
  name: string;
}

interface GenericBlock {
  type?: string;
  props?: Record<string, unknown>;
  children?: GenericBlock[];
  [key: string]: unknown;
}

/**
 * Walks a page's content tree (same shape every asset-bearing block shares:
 * a `props.url` that may be a `xeento-file://<id>` reference), rewriting
 * each one to a relative `assets/...` path and collecting what it pointed
 * to. `pathPrefix` (e.g. "../../") lets the caller adjust for how deep the
 * page serializing this content sits within the exported folder tree —
 * the returned paths are otherwise zip-root-relative.
 */
export async function rewriteFileRefs(
  blocks: unknown,
  pathPrefix: string,
): Promise<{ blocks: unknown; assets: CollectedAsset[] }> {
  const assets: CollectedAsset[] = [];
  const seen = new Map<string, string>();

  async function resolvePath(fileId: string): Promise<string | null> {
    const cached = seen.get(fileId);
    if (cached) return cached;
    const file = await getFile(fileId);
    if (!file) return null;
    const canonicalPath = `assets/${fileId}-${sanitizeFileName(file.name)}`;
    seen.set(fileId, canonicalPath);
    assets.push({ fileId, canonicalPath, name: file.name });
    return canonicalPath;
  }

  async function walkBlock(block: GenericBlock): Promise<GenericBlock> {
    const next: GenericBlock = { ...block };
    const url = next.props && (next.props as Record<string, unknown>).url;
    if (typeof url === "string") {
      const fileId = parseFileUrl(url);
      if (fileId) {
        const canonicalPath = await resolvePath(fileId);
        if (canonicalPath) {
          next.props = { ...next.props, url: `${pathPrefix}${canonicalPath}` };
        }
      } else if (url.startsWith("data:")) {
        // A pasted image whose src was never routed through the file store
        // (e.g. HTML paste carrying an inline base64 <img>). Embedding it
        // verbatim would dump megabytes of base64 into the markdown, so
        // drop the reference instead of inlining it.
        next.props = { ...next.props, url: "" };
      }
    }
    if (Array.isArray(next.children)) {
      next.children = await Promise.all(next.children.map(walkBlock));
    }
    return next;
  }

  const rewritten = Array.isArray(blocks)
    ? await Promise.all((blocks as GenericBlock[]).map(walkBlock))
    : [];
  return { blocks: rewritten, assets };
}
