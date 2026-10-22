"use client";

import { useEffect, useState } from "react";
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from "@blocknote/react";
import { FileText, Upload } from "lucide-react";
import { uploadFileToFileStore } from "@/lib/upload-file";
import { PdfViewer } from "./pdf-viewer";

const pdfBlockConfig = {
  type: "pdf" as const,
  propSchema: {
    url: { default: "" },
    name: { default: "" },
    height: { default: 480 },
  },
  content: "none" as const,
};

function PdfBlockRender({
  block,
  editor,
}: ReactCustomBlockRenderProps<typeof pdfBlockConfig>) {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(undefined);
  const [embedDraft, setEmbedDraft] = useState("");
  const { url, name, height } = block.props;

  useEffect(() => {
    if (!url) {
      // Reacting to `url` clearing — not state derived from this render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolvedUrl(undefined);
      return;
    }
    let cancelled = false;
    const resolve = editor.resolveFileUrl ?? ((raw: string) => Promise.resolve(raw));
    resolve(url).then((resolved) => {
      if (!cancelled) setResolvedUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [url, editor]);

  if (!url) {
    return (
      <div
        contentEditable={false}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-background p-4"
      >
        <FileText className="h-5 w-5 shrink-0 text-muted" />
        <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm text-muted hover:text-foreground">
          <Upload className="h-3.5 w-3.5" />
          Upload PDF
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const uploadedUrl = await uploadFileToFileStore(file);
              editor.updateBlock(block.id, { props: { url: uploadedUrl, name: file.name } });
            }}
          />
        </label>
        <span className="text-xs text-muted">or</span>
        <input
          value={embedDraft}
          onChange={(e) => setEmbedDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && embedDraft.trim()) {
              const trimmed = embedDraft.trim();
              editor.updateBlock(block.id, {
                props: { url: trimmed, name: trimmed.split("/").pop() ?? "" },
              });
            }
          }}
          placeholder="Paste a PDF URL and press Enter"
          className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted"
        />
      </div>
    );
  }

  return (
    <PdfViewer
      url={resolvedUrl}
      name={name}
      height={height}
      onHeightChange={(next) => editor.updateBlock(block.id, { props: { height: next } })}
    />
  );
}

export const pdfBlockSpec = createReactBlockSpec(pdfBlockConfig, {
  render: PdfBlockRender,
});
