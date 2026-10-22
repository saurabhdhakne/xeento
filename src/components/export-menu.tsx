"use client";

import { useState } from "react";
import { FileDown, MoreHorizontal, Printer } from "lucide-react";
import { Popover } from "./ui/popover";
import { toast } from "./ui/toast";
import { exportPageAsMarkdown } from "@/lib/export/markdown-export";

interface ExportMenuProps {
  pageId: string;
  onPrint: (includeSubpages: boolean) => void;
}

export function ExportMenu({ pageId, onPrint }: ExportMenuProps) {
  const [includeSubpages, setIncludeSubpages] = useState(false);

  return (
    <Popover
      align="right"
      trigger={({ onClick }) => (
        <button
          type="button"
          onClick={onClick}
          title="Export"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-black/5 dark:hover:bg-white/10"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    >
      {(close) => (
        <div className="w-56 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">Export</p>
          <button
            type="button"
            onClick={() => {
              close();
              void exportPageAsMarkdown(pageId, includeSubpages).catch(() => {
                toast.error("Couldn't export this page.");
              });
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/8"
          >
            <FileDown className="h-3.5 w-3.5" />
            Markdown (.md)
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              onPrint(includeSubpages);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/8"
          >
            <Printer className="h-3.5 w-3.5" />
            PDF
          </button>
          <label className="mt-1 flex items-center gap-2 border-t border-border px-2 py-1.5 pt-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={includeSubpages}
              onChange={(e) => setIncludeSubpages(e.target.checked)}
            />
            Include sub-pages
          </label>
        </div>
      )}
    </Popover>
  );
}
