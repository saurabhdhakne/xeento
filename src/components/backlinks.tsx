"use client";

import { useMemo } from "react";
import { FileText } from "lucide-react";
import { useAllPages } from "@/lib/use-pages";
import { pageLinkIds } from "@/lib/block-text";

/** "Linked from": every page that mentions or links to this one. Hidden when there are none. */
export function Backlinks({ pageId }: { pageId: string }) {
  const pages = useAllPages();
  const sources = useMemo(
    () =>
      (pages ?? [])
        .filter((p) => p.id !== pageId && pageLinkIds(p.content).has(pageId))
        .sort((a, b) => (a.title || "Untitled").localeCompare(b.title || "Untitled")),
    [pages, pageId],
  );

  if (sources.length === 0) return null;

  return (
    <section className="mt-12 border-t border-border pt-4">
      <h2 className="px-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        Linked from · {sources.length}
      </h2>
      <ul className="mt-2">
        {sources.map((p) => (
          <li key={p.id}>
            {/* Opened by AppShell's xeento-page:// click listener. */}
            <a
              href={`xeento-page://${p.id}`}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-foreground hover:bg-black/5 dark:hover:bg-white/8"
            >
              <span className="flex w-5 shrink-0 justify-center">
                {p.icon ?? <FileText className="h-4 w-4 text-muted" strokeWidth={1.75} />}
              </span>
              <span className="truncate">{p.title || "Untitled"}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
