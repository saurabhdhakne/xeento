"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { blockNoteToPlainText } from "@/lib/block-text";
import { ROOT_ID, type FolderRecord, type PageRecord } from "@/lib/db";
import {
  RECENCY_ORDER,
  matchesDateFilter,
  recencyBucket,
  type CustomRange,
  type DateFilter,
} from "@/lib/recency";
import { SearchFilters } from "./search-filters";
import { SearchResultRow } from "./search-result-row";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  pages: PageRecord[];
  folders: FolderRecord[];
  onOpenPage: (id: string) => void;
}

interface ResultItem {
  page: PageRecord;
  path: string | null;
  snippet: string;
}

function getPagePath(
  page: PageRecord,
  pagesById: Map<string, PageRecord>,
  foldersById: Map<string, FolderRecord>,
): string | null {
  if (page.parentId !== ROOT_ID) {
    const names: string[] = [];
    let current = pagesById.get(page.parentId);
    while (current) {
      names.unshift(current.title || "Untitled");
      current = current.parentId !== ROOT_ID ? pagesById.get(current.parentId) : undefined;
    }
    return names.join(" / ");
  }
  if (page.folderId) {
    return foldersById.get(page.folderId)?.name ?? null;
  }
  return null;
}

function buildSnippet(text: string, query: string, radius = 60): string {
  const trimmed = text.trim();
  if (!query) return trimmed.slice(0, 140);
  const idx = trimmed.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return trimmed.slice(0, 140);
  const start = Math.max(0, idx - radius);
  const end = Math.min(trimmed.length, idx + query.length + radius);
  return (start > 0 ? "…" : "") + trimmed.slice(start, end) + (end < trimmed.length ? "…" : "");
}

export function CommandPalette({ open, onClose, pages, folders, onOpenPage }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [customRange, setCustomRange] = useState<CustomRange>({ from: null, to: null });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [titleOnly, setTitleOnly] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resets to a fresh search and autofocuses whenever the palette is opened
  // — a one-time reaction to the `open` transition (an external signal from
  // the parent), not state React derives from its own render.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setQuery("");
    setDateFilter("any");
    setCustomRange({ from: null, to: null });
    setSelectedTags([]);
    setTitleOnly(false);
    setSelectedIndex(0);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Autofocus needs to happen after the input mounts.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const pagesById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const allTags = useMemo(
    () => Array.from(new Set(pages.flatMap((p) => p.tags ?? []))).sort(),
    [pages],
  );

  const plainTextById = useMemo(() => {
    const map = new Map<string, string>();
    for (const page of pages) map.set(page.id, blockNoteToPlainText(page.content));
    return map;
  }, [pages]);

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = pages.filter((page) => {
      if (!matchesDateFilter(page.updatedAt, dateFilter, customRange)) return false;
      if (selectedTags.length > 0 && !selectedTags.some((t) => page.tags?.includes(t))) return false;
      if (!normalizedQuery) return true;
      const haystack = titleOnly
        ? page.title
        : `${page.title} ${plainTextById.get(page.id) ?? ""}`;
      return haystack.toLowerCase().includes(normalizedQuery);
    });

    const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);

    const buckets = new Map<string, ResultItem[]>();
    for (const page of sorted) {
      const bucket = recencyBucket(page.updatedAt);
      const content = plainTextById.get(page.id) ?? "";
      const item: ResultItem = {
        page,
        path: getPagePath(page, pagesById, foldersById),
        snippet: buildSnippet(content, normalizedQuery),
      };
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket)!.push(item);
    }

    return RECENCY_ORDER.filter((b) => buckets.has(b)).map((bucket) => ({
      bucket,
      items: buckets.get(bucket)!,
    }));
  }, [pages, dateFilter, customRange, selectedTags, titleOnly, query, pagesById, foldersById, plainTextById]);

  const flatResults = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  // Clamped at render time rather than reset via an effect: when filters
  // narrow the result set, this keeps the highlighted row in range without
  // a derived-state effect.
  const activeIndex = Math.min(selectedIndex, Math.max(flatResults.length - 1, 0));

  function handleOpen(id: string) {
    onOpenPage(id);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flatResults[activeIndex];
      if (target) handleOpen(target.page.id);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] dark:bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
      >
        <div className="flex items-center gap-2.5 px-4 py-3.5">
          <Search className="h-5 w-5 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Xeento…"
            className="flex-1 bg-transparent text-lg outline-none placeholder:text-muted"
          />
        </div>

        <SearchFilters
          dateFilter={dateFilter}
          customRange={customRange}
          onDateFilterChange={(filter, range) => {
            setDateFilter(filter);
            if (range) setCustomRange(range);
          }}
          allTags={allTags}
          selectedTags={selectedTags}
          onToggleTag={(tag) =>
            setSelectedTags((prev) =>
              prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
            )
          }
          titleOnly={titleOnly}
          onToggleTitleOnly={() => setTitleOnly((v) => !v)}
        />

        <div className="flex-1 overflow-y-auto p-2">
          {flatResults.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted">No results</p>
          ) : (
            groups.map((group) => (
              <div key={group.bucket} className="mb-1">
                <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  {group.bucket}
                </p>
                {group.items.map((item) => {
                  const index = flatResults.indexOf(item);
                  return (
                    <SearchResultRow
                      key={item.page.id}
                      page={item.page}
                      path={item.path}
                      snippet={item.snippet}
                      query={query.trim()}
                      isActive={index === activeIndex}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => handleOpen(item.page.id)}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
