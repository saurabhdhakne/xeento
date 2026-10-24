"use client";

import { useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { syntaxHighlighter } from "@blocknote/code-block";
import type { PartialBlock } from "@blocknote/core";
import type { PageRecord } from "@/lib/records";
import { createFileUrlResolver } from "@/lib/use-files";
import { xeentoSchema } from "./schema";

/** A read-only render of one page, used only inside the hidden print:block subtree PageView mounts for PDF export. */
export function PrintablePage({ page }: { page: PageRecord }) {
  const [fileResolver] = useState(() => createFileUrlResolver());
  const content = page.content as PartialBlock[];
  const editor = useCreateBlockNote({
    schema: xeentoSchema,
    initialContent: content?.length ? content : undefined,
    resolveFileUrl: fileResolver.resolve,
    extensions: [syntaxHighlighter],
  });

  return (
    <div className="break-after-page">
      <div className="mb-6 flex items-center gap-3">
        {page.icon && <span className="text-3xl leading-none">{page.icon}</span>}
        <h1 className="text-3xl font-bold">{page.title || "Untitled"}</h1>
      </div>
      <BlockNoteView editor={editor} editable={false} theme="light" className="bn-xeento" />
    </div>
  );
}
