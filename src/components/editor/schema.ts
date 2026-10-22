import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { fileBlockSpec } from "./blocks/file-block";
import { pdfBlockSpec } from "./blocks/pdf-block";
import { embedBlockSpec } from "./blocks/embed-block";
import { bookmarkBlockSpec } from "./blocks/bookmark-block";
import { codeBlockSpec } from "./blocks/code-block";
import { linkMentionSpec } from "./inline/link-mention";

/**
 * The one editor schema used everywhere BlockNote content is rendered —
 * live editing, headless export, and the print layout — so a page's
 * content always serializes/renders the same way regardless of where
 * it's opened.
 */
export const xeentoSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    file: fileBlockSpec(),
    pdf: pdfBlockSpec(),
    embed: embedBlockSpec(),
    bookmark: bookmarkBlockSpec(),
    codeBlock: codeBlockSpec,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    linkMention: linkMentionSpec,
  },
});
