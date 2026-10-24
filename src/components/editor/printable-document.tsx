"use client";

import { useEffect, useState } from "react";
import type { PageRecord } from "@/lib/records";
import { getPage } from "@/lib/pages";
import { PrintablePage } from "./printable-page";

interface PrintableDocumentProps {
  pageIds: string[];
  onDone: () => void;
}

/**
 * Mounted only while printing: fetches the requested pages, renders each
 * as a read-only BlockNote view inside a `hidden print:block` subtree (the
 * live editable view gets `print:hidden`), then calls window.print() once
 * everything has actually committed to the DOM — print-to-PDF via the
 * browser's own dialog, reusing the real renderers (including custom
 * blocks) instead of a second rendering implementation.
 */
export function PrintableDocument({ pageIds, onDone }: PrintableDocumentProps) {
  const [pages, setPages] = useState<PageRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(pageIds.map((id) => getPage(id))).then((results) => {
      if (cancelled) return;
      const found = results.filter((p): p is PageRecord => !!p);
      setPages(found);
    });
    return () => {
      cancelled = true;
    };
  }, [pageIds]);

  useEffect(() => {
    if (!pages) return;
    const frame = requestAnimationFrame(() => {
      window.print();
      onDone();
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  if (!pages) return null;

  return (
    <div className="hidden print:block">
      {pages.map((page) => (
        <PrintablePage key={page.id} page={page} />
      ))}
    </div>
  );
}
