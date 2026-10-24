"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FileText, Folder, Layers, Search } from "lucide-react";
import { ROOT_ID, type FolderRecord, type PageRecord } from "@/lib/records";
import { movePageToPosition } from "@/lib/pages";
import { getPagePath } from "@/components/search/command-palette";
import { toast } from "@/components/ui/toast";

interface MoveToDialogProps {
  pageId: string;
  pages: PageRecord[];
  folders: FolderRecord[];
  onClose: () => void;
}

interface Target {
  key: string;
  label: string;
  path: string | null;
  icon: ReactNode;
  parentId: string;
  folderId: string | null;
}

/**
 * The keyboard alternative to dragging a page in the sidebar: type to
 * filter, arrows to pick, Enter to move. The page goes to the end of the
 * chosen location (Pages root, a folder, or inside another page). Its own
 * subtree and its current location aren't offered.
 */
export function MoveToDialog({ pageId, pages, folders, onClose }: MoveToDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const page = pages.find((p) => p.id === pageId);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const targets = useMemo(() => {
    if (!page) return [];
    const pagesById = new Map(pages.map((p) => [p.id, p]));
    const foldersById = new Map(folders.map((f) => [f.id, f]));
    const excluded = new Set([pageId]);
    const queue = [pageId];
    while (queue.length) {
      const id = queue.shift()!;
      for (const p of pages) {
        if (p.parentId === id && !excluded.has(p.id)) {
          excluded.add(p.id);
          queue.push(p.id);
        }
      }
    }
    const atRoot = page.parentId === ROOT_ID;
    const all: Target[] = [];
    if (!atRoot || page.folderId) {
      all.push({ key: "root", label: "Pages", path: null, icon: <Layers className="h-4 w-4 text-muted" />, parentId: ROOT_ID, folderId: null });
    }
    for (const f of [...folders].sort((a, b) => a.order - b.order)) {
      if (atRoot && page.folderId === f.id) continue;
      all.push({ key: f.id, label: f.name, path: "Folder", icon: <Folder className="h-4 w-4 text-muted" />, parentId: ROOT_ID, folderId: f.id });
    }
    for (const p of [...pages].sort((a, b) => (a.title || "Untitled").localeCompare(b.title || "Untitled"))) {
      if (excluded.has(p.id) || p.id === page.parentId) continue;
      all.push({
        key: p.id,
        label: p.title || "Untitled",
        path: getPagePath(p, pagesById, foldersById),
        icon: p.icon ?? <FileText className="h-4 w-4 text-muted" strokeWidth={1.75} />,
        parentId: p.id,
        folderId: null,
      });
    }
    return all;
  }, [page, pageId, pages, folders]);

  const q = query.trim().toLowerCase();
  const results = q ? targets.filter((t) => t.label.toLowerCase().includes(q)) : targets;
  const activeIndex = Math.min(selectedIndex, Math.max(results.length - 1, 0));

  function handleMove(target: Target) {
    onClose();
    void movePageToPosition(pageId, target.parentId, Number.MAX_SAFE_INTEGER, target.folderId).then(() =>
      toast.info(`Moved to ${target.label}`),
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(Math.min(activeIndex + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) handleMove(target);
    }
  }

  if (!page) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] dark:bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={`Move "${page.title || "Untitled"}" to…`}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">No matching locations</p>
          ) : (
            results.map((target, index) => (
              <button
                key={target.key}
                type="button"
                ref={index === activeIndex ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => handleMove(target)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                  index === activeIndex ? "bg-accent-soft" : ""
                }`}
              >
                <span className="flex w-5 shrink-0 justify-center">{target.icon}</span>
                <span className="truncate text-foreground">{target.label}</span>
                {target.path && <span className="ml-auto shrink-0 truncate pl-2 text-xs text-muted">{target.path}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
