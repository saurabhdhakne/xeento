import { BlockNoteEditor } from "@blocknote/core";
import { xeentoSchema } from "@/components/editor/schema";

/**
 * A BlockNoteEditor instance that's never mounted to the DOM — used purely
 * for its serialization/parsing methods (blocksToMarkdownLossy,
 * tryParseMarkdownToBlocks) so export/import can convert content for pages
 * that aren't the one currently open in the live editor. Same schema as
 * the live editor, so custom blocks (file/pdf/embed/code) round-trip too.
 */
export function createHeadlessEditor() {
  return BlockNoteEditor.create({ schema: xeentoSchema });
}

export function blocksToMarkdown(blocks: unknown) {
  const editor = createHeadlessEditor();
  return editor.blocksToMarkdownLossy(
    blocks as Parameters<typeof editor.blocksToMarkdownLossy>[0],
  );
}

export function markdownToBlocks(markdown: string) {
  const editor = createHeadlessEditor();
  return editor.tryParseMarkdownToBlocks(markdown);
}
