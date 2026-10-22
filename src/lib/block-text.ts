interface InlineNode {
  type?: string;
  text?: string;
  props?: { title?: string };
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
