"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ImportSummary } from "@/lib/import/import-core";

interface ImportProgressDialogProps {
  processed: number;
  total: number;
  currentPath: string;
  summary: ImportSummary | null;
  onClose: () => void;
}

export function ImportProgressDialog({
  processed,
  total,
  currentPath,
  summary,
  onClose,
}: ImportProgressDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
      <div className="w-full max-w-sm rounded-xl border border-border bg-popover p-5 shadow-2xl">
        {!summary ? (
          <>
            <h2 className="text-base font-semibold text-foreground">Importing…</h2>
            <p className="mt-1 truncate text-sm text-muted">{currentPath || "Reading files…"}</p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${total > 0 ? Math.min(100, (processed / total) * 100) : 0}%` }}
              />
            </div>
            <p className="mt-1.5 text-right text-xs text-muted">
              {processed} / {total || "?"}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              <h2 className="text-base font-semibold text-foreground">Import complete</h2>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              <li>{summary.pagesCreated} page{summary.pagesCreated === 1 ? "" : "s"} created</li>
              <li>{summary.filesImported} file{summary.filesImported === 1 ? "" : "s"} imported</li>
              <li>{summary.skipped.length} item{summary.skipped.length === 1 ? "" : "s"} skipped</li>
            </ul>
            {summary.skipped.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto rounded-md border border-border p-2">
                {summary.skipped.map((item, i) => (
                  <div key={i} className="flex items-start gap-1.5 py-0.5 text-xs text-muted">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {item.path} — {item.reason}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
