"use client";

import { useEffect } from "react";
import type { FolderRecord } from "@/lib/db";

interface DeleteFolderDialogProps {
  folder: FolderRecord;
  pageCount: number;
  onCancel: () => void;
  onMoveToRoot: () => void;
  onDeleteContents: () => void;
}

export function DeleteFolderDialog({
  folder,
  pageCount,
  onCancel,
  onMoveToRoot,
  onDeleteContents,
}: DeleteFolderDialogProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-popover p-5 shadow-2xl"
      >
        <h2 className="text-base font-semibold text-foreground">Delete &ldquo;{folder.name}&rdquo;?</h2>
        <p className="mt-2 text-sm text-muted">
          {pageCount === 0
            ? "This folder is empty."
            : `This folder contains ${pageCount} page${pageCount === 1 ? "" : "s"}. Choose what happens to them.`}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onMoveToRoot}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Move pages to Pages
          </button>
          <button
            type="button"
            onClick={onDeleteContents}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-600/10 dark:text-red-400"
          >
            Delete pages too
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-black/5 dark:hover:bg-white/8"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
