"use client";

import { useRef } from "react";
import { Archive, ArchiveRestore, FolderDown, Settings as SettingsIcon, Upload } from "lucide-react";
import { Popover } from "./ui/popover";
import { toast } from "./ui/toast";
import { importMarkdownFiles } from "@/lib/import/markdown-import";
import { importNotionExport } from "@/lib/import/notion-import";
import { exportWorkspaceAsZip } from "@/lib/export/markdown-export";
import { downloadBackup, restoreBackup } from "@/lib/backup";
import { useImportFlow } from "@/lib/import/use-import-flow";
import { ImportProgressDialog } from "./import/import-progress-dialog";

export function SettingsMenu() {
  const { progress, summary, run, close: closeImportDialog } = useImportFlow();
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const notionInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Popover
        align="right"
        trigger={({ onClick }) => (
          <button
            type="button"
            onClick={onClick}
            title="Settings"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-black/5 dark:hover:bg-white/10"
          >
            <SettingsIcon className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
      >
        {(close) => (
          <div className="w-60 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">Import</p>
            <button
              type="button"
              onClick={() => {
                close();
                markdownInputRef.current?.click();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/8"
            >
              <Upload className="h-3.5 w-3.5" />
              Markdown files
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                notionInputRef.current?.click();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/8"
            >
              <Upload className="h-3.5 w-3.5" />
              Notion export (.zip)
            </button>
            <p className="mt-1 border-t border-border px-2 py-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Backup
            </p>
            <button
              type="button"
              onClick={() => {
                close();
                void exportWorkspaceAsZip().catch(() => toast.error("Couldn't export the workspace."));
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/8"
            >
              <FolderDown className="h-3.5 w-3.5" />
              Export entire workspace
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                void downloadBackup().catch(() => toast.error("Couldn't create the backup. The workspace may be too large to back up in one file."));
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/8"
            >
              <Archive className="h-3.5 w-3.5" />
              Download full backup
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                backupInputRef.current?.click();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/8"
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
              Restore from backup…
            </button>
          </div>
        )}
      </Popover>

      <input
        ref={markdownInputRef}
        type="file"
        accept=".md,.zip"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) void run((onProgress) => importMarkdownFiles(Array.from(files), onProgress));
          e.target.value = "";
        }}
      />
      <input
        ref={notionInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void run((onProgress) => importNotionExport(file, onProgress));
          e.target.value = "";
        }}
      />
      <input
        ref={backupInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const confirmed = window.confirm(
            "Restoring replaces everything in this workspace (pages, folders, files and Trash) with the backup. Continue?",
          );
          if (!confirmed) return;
          void restoreBackup(file)
            .then(() => window.location.reload())
            .catch(() => toast.error("Couldn't restore: this isn't a valid Xeento backup."));
        }}
      />

      {progress && (
        <ImportProgressDialog
          processed={progress.processed}
          total={progress.total}
          currentPath={progress.currentPath}
          summary={summary}
          onClose={closeImportDialog}
        />
      )}
    </>
  );
}
