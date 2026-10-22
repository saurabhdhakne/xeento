interface InlineNode {
  type?: string;
  props?: { pageId?: string };
  [key: string]: unknown;
}

interface TableCell {
  type?: string;
  content?: InlineNode[];
}

interface GenericBlock {
  type?: string;
  props?: { pageId?: string };
  content?: InlineNode[] | { type?: string; rows?: { cells?: (InlineNode[] | TableCell)[] }[] };
  children?: GenericBlock[];
  [key: string]: unknown;
}

/**
 * Page mentions and sub-page cards render their target's live title, which
 * Markdown conversion can't look up. Before export, replace each with that
 * title as plain text: mentions inline, sub-page cards as a paragraph.
 * `titles` maps page id → title; a missing id (page in Trash) becomes
 * "Deleted page".
 */
export function resolvePageRefs(blocks: unknown, titles: Map<string, string>): unknown {
  const titleOf = (id: string | undefined) => titles.get(id ?? "") ?? "Deleted page";
  const text = (value: string) => ({ type: "text", text: value, styles: {} });

  const inline = (nodes: InlineNode[]) =>
    nodes.map((node) => (node?.type === "pageMention" ? text(titleOf(node.props?.pageId)) : node));

  function walk(block: GenericBlock): GenericBlock {
    const next: GenericBlock =
      block?.type === "subPage"
        ? { ...block, type: "paragraph", props: {}, content: [text(titleOf(block.props?.pageId))] }
        : { ...block };
    if (Array.isArray(next.content)) {
      next.content = inline(next.content);
    } else if (next.content?.type === "tableContent") {
      next.content = {
        ...next.content,
        rows: next.content.rows?.map((row) => ({
          ...row,
          cells: row.cells?.map((cell) =>
            Array.isArray(cell) ? inline(cell) : { ...cell, content: inline(cell.content ?? []) },
          ),
        })),
      };
    }
    if (Array.isArray(next.children)) next.children = next.children.map(walk);
    return next;
  }

  return Array.isArray(blocks) ? (blocks as GenericBlock[]).map(walk) : [];
}
