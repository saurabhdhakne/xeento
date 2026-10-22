"use client";

import { FileText, Plus } from "lucide-react";

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <FileText className="h-7 w-7" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Nothing open yet</h1>
        <p className="text-sm text-muted">Create a page to start writing in Xeento.</p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        Create a page
      </button>
    </div>
  );
}
