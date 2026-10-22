"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  blockTypeSelectItems,
  FormattingToolbar,
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { syntaxHighlighter } from "@blocknote/code-block";
import { useTheme } from "next-themes";
import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
  type PartialBlock,
} from "@blocknote/core";
import { Bookmark, Code, FileText, Video } from "lucide-react";
import { setPageContent } from "@/lib/pages";
import { uploadFileToFileStore } from "@/lib/upload-file";
import { createFileUrlResolver } from "@/lib/use-files";
import { blockTypeForFile } from "@/lib/block-type-for-file";
import { fetchLinkPreview, parsePastedUrl } from "@/lib/link-preview";
import { xeentoSchema } from "./schema";
import { FileDropZone } from "./file-drop-zone";
import { PasteUrlMenu, type PastedUrl } from "./paste-url-menu";
import "@blocknote/mantine/style.css";

type XeentoEditor = typeof xeentoSchema.BlockNoteEditor;

// `pdf` and `embed` are custom block types — BlockNote's default slash menu
// generator only knows about its own built-in block types (confirmed by
// reading its source: a fixed key list, nothing derived from the schema), so
// without these entries "/pdf" and "/embed" never had a menu item at all.
function getCustomSlashMenuItems(editor: XeentoEditor): DefaultReactSuggestionItem[] {
  return [
    {
      title: "PDF",
      subtext: "Embed a PDF file",
      aliases: ["pdf"],
      group: "Media",
      icon: <FileText size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "pdf" }),
    },
    {
      title: "Embed",
      subtext: "Embed a video, audio player or web page",
      aliases: ["embed", "youtube", "vimeo", "loom", "spotify", "iframe"],
      group: "Media",
      icon: <Video size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "embed" }),
    },
    {
      title: "Bookmark",
      subtext: "Link preview card with title, description and image",
      aliases: ["bookmark", "link", "preview", "url"],
      group: "Media",
      icon: <Bookmark size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "bookmark" }),
    },
  ];
}

// BlockNote's formatting-toolbar block-type dropdown lists only its built-in
// text block types (paragraph, headings, quote, lists) — not the code block.
// Besides making "turn selection into code" impossible, that also hid the
// dropdown entirely on a code block, since it only renders when the current
// block matches one of its items. No `props` here, so any language matches.
function getBlockTypeSelectItems(editor: XeentoEditor) {
  return [
    ...blockTypeSelectItems(editor),
    { name: "Code block", type: "codeBlock", icon: Code },
  ];
}

interface BlockEditorProps {
  pageId: string;
  initialContent: PartialBlock[];
}

export function BlockEditor({ pageId, initialContent }: BlockEditorProps) {
  const { resolvedTheme } = useTheme();
  // Lazy-initialized once and referentially stable for this component's
  // lifetime (a plain value, not a ref — safe to read during render).
  const [fileResolver] = useState(() => createFileUrlResolver());
  const [pastedUrl, setPastedUrl] = useState<PastedUrl | null>(null);
  const closePasteMenu = useCallback(() => setPastedUrl(null), []);
  const editor = useCreateBlockNote({
    schema: xeentoSchema,
    initialContent: initialContent.length > 0 ? initialContent : undefined,
    // Without uploadFile, BlockNote disables file uploads entirely (every
    // file-type block falls back to URL-embed only). resolveFileUrl is
    // what turns a stored `xeento-file://<id>` reference back into
    // something the browser can actually display/download — used
    // internally by every file-type block's render *and* its toolbar's
    // download button, not just the ones we render ourselves.
    uploadFile: uploadFileToFileStore,
    resolveFileUrl: fileResolver.resolve,
    extensions: [syntaxHighlighter],
    // A bare URL pasted into text becomes a clickable link straight away,
    // then the "paste as" menu offers Mention / Bookmark / Embed instead.
    // Anything else (and URLs pasted over a selection, which BlockNote
    // turns into a link on the selected text) uses the default handling.
    pasteHandler: ({ event, editor, defaultPasteHandler }) => {
      const url = parsePastedUrl(event.clipboardData?.getData("text/plain"));
      const { selection } = editor.prosemirrorState;
      const block = editor.getTextCursorPosition().block;
      if (!url || !selection.empty || block.type === "codeBlock" || !Array.isArray(block.content)) {
        return defaultPasteHandler();
      }
      const from = selection.from;
      editor.insertInlineContent([{ type: "link", href: url, content: url }], { updateSelection: true });
      const to = editor.prosemirrorState.selection.from;
      void fetchLinkPreview(url);
      setPastedUrl({ url, from, to, blockId: block.id });
      return true;
    },
  });
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        void setPageContent(pageId, editor.document);
      }
      // This editor instance is remounted via `key={pageId}` whenever the
      // selected page changes, so this is "revoke on unmount" scoped to
      // the page no longer being shown.
      fileResolver.revokeAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      void setPageContent(pageId, editor.document);
    }, 400);
  }

  async function handleDropFiles(files: File[]) {
    let referenceBlockId = editor.getTextCursorPosition().block.id;
    for (const file of files) {
      const url = await uploadFileToFileStore(file);
      const [inserted] = editor.insertBlocks(
        [{ type: blockTypeForFile(file), props: { url, name: file.name } }],
        referenceBlockId,
        "after",
      );
      referenceBlockId = inserted.id;
    }
  }

  return (
    <FileDropZone onDropFiles={(files) => void handleDropFiles(files)}>
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        className="bn-xeento"
        slashMenu={false}
        formattingToolbar={false}
      >
        <FormattingToolbarController
          formattingToolbar={(props) => (
            <FormattingToolbar {...props} blockTypeSelectItems={getBlockTypeSelectItems(editor)} />
          )}
        />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [...getDefaultReactSlashMenuItems(editor), ...getCustomSlashMenuItems(editor)],
              query,
            )
          }
        />
      </BlockNoteView>
      {pastedUrl && <PasteUrlMenu editor={editor} pasted={pastedUrl} onClose={closePasteMenu} />}
    </FileDropZone>
  );
}
