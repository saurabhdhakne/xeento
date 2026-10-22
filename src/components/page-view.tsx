"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { Star } from "lucide-react";
import { IconPicker } from "@/components/icon-picker";
import { BlockEditor } from "@/components/editor/block-editor";
import { PrintableDocument } from "@/components/editor/printable-document";
import { TagEditor } from "@/components/tag-editor";
import { ExportMenu } from "@/components/export-menu";
import { Backlinks } from "@/components/backlinks";
import { usePage } from "@/lib/use-pages";
import { renamePage, setPageIcon, setPageTags, toggleFavourite, getDescendantIds } from "@/lib/pages";

export function PageView({ pageId, onMoveTo }: { pageId: string; onMoveTo: () => void }) {
  const page = usePage(pageId);
  const [titleDraft, setTitleDraft] = useState(page?.title ?? "");
  const [printPageIds, setPrintPageIds] = useState<string[] | null>(null);
  const isEditingTitle = useRef(false);
  const titleSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `page` resolves asynchronously from IndexedDB, so once it arrives we
  // sync the draft — but only while the title field isn't focused, so we
  // never clobber in-progress typing with a stale re-render.
  useEffect(() => {
    if (!isEditingTitle.current && page) {
      setTitleDraft(page.title);
    }
  }, [page]);

  if (!page) {
    return null;
  }

  function handleTitleChange(value: string) {
    setTitleDraft(value);
    if (titleSaveTimeout.current) clearTimeout(titleSaveTimeout.current);
    titleSaveTimeout.current = setTimeout(() => {
      void renamePage(pageId, value.trim() || "Untitled");
    }, 250);
  }

  function handleTitleBlur() {
    isEditingTitle.current = false;
    if (titleSaveTimeout.current) clearTimeout(titleSaveTimeout.current);
    void renamePage(pageId, titleDraft.trim() || "Untitled");
  }

  async function handlePrint(includeSubpages: boolean) {
    const ids = [pageId];
    if (includeSubpages) ids.push(...(await getDescendantIds(pageId)));
    setPrintPageIds(ids);
  }

  return (
    <>
      {/* Sticky to the top of <main> (the scroll container), so the star and
          export menu stay reachable however far down the page you are. */}
      <div className="sticky top-0 z-20 flex w-full items-center justify-end gap-1 bg-background px-6 pt-4 pb-2 print:hidden">
        <button
          type="button"
          onClick={() => void toggleFavourite(pageId)}
          title={page.favourite ? "Remove from favourites" : "Add to favourites"}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Star
            className="h-5 w-5"
            fill={page.favourite ? "#FACC15" : "none"}
            stroke={page.favourite ? "#FACC15" : "currentColor"}
            strokeWidth={1.75}
          />
        </button>
        <ExportMenu
          pageId={pageId}
          onPrint={(includeSubpages) => void handlePrint(includeSubpages)}
          onMoveTo={onMoveTo}
        />
      </div>
      <div className="mx-auto w-full max-w-3xl px-10 pb-16 print:hidden">
        <IconPicker icon={page.icon} onChange={(icon) => void setPageIcon(pageId, icon)} size="lg" />
        <TitleField
          value={titleDraft}
          onChange={handleTitleChange}
          onFocus={() => {
            isEditingTitle.current = true;
          }}
          onBlur={handleTitleBlur}
        />

        <div className="mt-3">
          <TagEditor tags={page.tags ?? []} onChange={(tags) => void setPageTags(pageId, tags)} />
        </div>

        <div className="mt-6">
          <BlockEditor
            key={pageId}
            pageId={pageId}
            initialContent={(page.content as PartialBlock[]) ?? []}
          />
        </div>

        <Backlinks pageId={pageId} />
      </div>

      {printPageIds && (
        <PrintableDocument pageIds={printPageIds} onDone={() => setPrintPageIds(null)} />
      )}
    </>
  );
}

/**
 * The page title wraps onto as many lines as it needs (a single-line
 * `<input>` clipped long titles). It's a textarea sized to its content —
 * re-measured on every change and whenever its width changes (window or
 * sidebar resize re-wraps the text) — but still a one-line value: Enter
 * doesn't insert a newline and pasted newlines become spaces.
 */
function TitleField({
  value,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function fitHeight() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useLayoutEffect(fitHeight, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(fitHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder="Untitled"
      className="mt-4 block w-full resize-none overflow-hidden break-words bg-transparent text-4xl font-bold tracking-tight text-foreground outline-none placeholder:text-muted"
    />
  );
}
