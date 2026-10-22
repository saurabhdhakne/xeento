interface InlineNode {
  type?: string;
  text?: string;
  href?: string;
  props?: { title?: string; pageId?: string };
  content?: InlineNode[];
}

interface BlockNode {
  content?: InlineNode[];
  children?: BlockNode[];
}

function walkInline(nodes: InlineNode[] | undefined, out: string[]) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (typeof node?.text === "string") out.push(node.text);
    // Link mentions are atoms with no text of their own — their title is what's visible.
    if (node?.type === "linkMention" && node.props?.title) out.push(node.props.title);
    if (Array.isArray(node?.content)) walkInline(node.content, out);
  }
}

function walkBlock(block: BlockNode, out: string[]) {
  walkInline(block?.content, out);
  if (Array.isArray(block?.children)) {
    for (const child of block.children) walkBlock(child, out);
  }
}

/** Flattens a BlockNote `content` JSON document into plain text, for search matching and snippets. */
export function blockNoteToPlainText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  const out: string[] = [];
  for (const block of blocks as BlockNode[]) walkBlock(block, out);
  return out.join(" ");
}

const PAGE_LINK_PREFIX = "xeento-page://";

function walkInlineLinks(nodes: InlineNode[] | undefined, out: Set<string>) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (node?.type === "pageMention" && node.props?.pageId) out.add(node.props.pageId);
    if (node?.type === "link" && node.href?.startsWith(PAGE_LINK_PREFIX)) {
      out.add(node.href.slice(PAGE_LINK_PREFIX.length));
    }
    if (Array.isArray(node?.content)) walkInlineLinks(node.content, out);
  }
}

function walkBlockLinks(block: BlockNode, out: Set<string>) {
  walkInlineLinks(block?.content, out);
  if (Array.isArray(block?.children)) {
    for (const child of block.children) walkBlockLinks(child, out);
  }
}

/**
 * Ids of the pages a BlockNote `content` JSON document links to: page
 * mentions and `xeento-page://` links (sub-page cards don't count). Used
 * for backlinks, the same way blockNoteToPlainText feeds search.
 */
export function pageLinkIds(blocks: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(blocks)) return out;
  for (const block of blocks as BlockNode[]) walkBlockLinks(block, out);
  return out;
}
