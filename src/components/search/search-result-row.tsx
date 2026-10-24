"use client";

import type { PageRecord } from "@/lib/records";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="rounded bg-accent-soft px-0.5 text-accent">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

interface SearchResultRowProps {
  page: PageRecord;
  path: string | null;
  snippet: string;
  query: string;
  isActive: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}

export function SearchResultRow({
  page,
  path,
  snippet,
  query,
  isActive,
  onMouseEnter,
  onClick,
}: SearchResultRowProps) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
        isActive ? "bg-accent-soft" : "hover:bg-black/5 dark:hover:bg-white/8"
      }`}
    >
      <span className="mt-0.5 text-base leading-none">{page.icon ?? "📄"}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            <Highlighted text={page.title || "Untitled"} query={query} />
          </span>
          {path && <span className="shrink-0 truncate text-xs text-muted">{path}</span>}
        </span>
        {snippet && (
          <span className="mt-0.5 block truncate text-xs text-muted">
            <Highlighted text={snippet} query={query} />
          </span>
        )}
      </span>
    </button>
  );
}
