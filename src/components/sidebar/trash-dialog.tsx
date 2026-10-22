"use client";

import { useEffect } from "react";
import { FileText, RotateCcw, X } from "lucide-react";
import { useTrash } from "@/lib/use-trash";
import { deleteFromTrash, emptyTrash, restoreFromTrash } from "@/lib/trash";

export function TrashDialog({ onClose }: { onClose: () => void }) {
  const entries = useTrash() ?? [];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-popover p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Trash</h2>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete everything in Trash forever? This can't be undone.")) {
                  void emptyTrash();
                }
              }}
              className="rounded-md px-2 py-1 text-sm text-red-600 transition-colors hover:bg-red-600/10 dark:text-red-400"
            >
              Empty trash
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">Pages in Trash are deleted for good after 30 days.</p>

        {entries.length === 0 ? (
          <p className="mt-6 mb-2 text-center text-sm text-muted">Trash is empty.</p>
        ) : (
          <ul className="mt-4 max-h-80 overflow-y-auto">
            {entries.map((entry) => {
              const page = entry.pages[0];
              const title = page.title || "Untitled";
              const subPages = entry.pages.length - 1;
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/8"
                >
                  <span className="flex w-5 shrink-0 justify-center">
                    {page.icon ?? <FileText className="h-4 w-4 text-muted" strokeWidth={1.75} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{title}</p>
                    <p className="truncate text-xs text-muted">
                      Deleted {new Date(entry.deletedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      {subPages > 0 && ` · ${subPages} sub-page${subPages === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void restoreFromTrash(entry.id)}
                    title="Restore"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete "${title}" forever? This can't be undone.`)) {
                        void deleteFromTrash(entry.id);
                      }
                    }}
                    title="Delete forever"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-red-600/10 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
