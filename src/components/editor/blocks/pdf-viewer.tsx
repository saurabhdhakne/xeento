"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { Download, Maximize2 } from "lucide-react";
import { loadPdfDocument } from "@/lib/pdf";

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 1200;

interface PdfViewerProps {
  url: string | undefined;
  name: string;
  height: number;
  /** Omit to render a fixed, non-resizable viewer (used by the print layout). */
  onHeightChange?: (height: number) => void;
}

export function PdfViewer({ url, name, height, onHeightChange }: PdfViewerProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    // Resetting to a fresh loading state for a new `url` — a reaction to
    // that prop changing, not state derived from this component's own render.
    /* eslint-disable react-hooks/set-state-in-effect */
    setDoc(null);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    loadPdfDocument(url)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this PDF.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  function handleResizeStart(e: React.MouseEvent) {
    if (!onHeightChange) return;
    const applyHeight = onHeightChange;
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    function onMove(moveEvent: MouseEvent) {
      const next = Math.min(
        MAX_HEIGHT,
        Math.max(MIN_HEIGHT, startHeight + (moveEvent.clientY - startY)),
      );
      applyHeight(next);
    }
    function onUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background" contentEditable={false}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="min-w-0 truncate text-xs font-medium text-muted">{name || "PDF"}</span>
        <div className="flex shrink-0 items-center gap-1 print:hidden">
          <button
            type="button"
            onClick={() => url && window.open(url, "_blank")}
            disabled={!url}
            title="Open full screen"
            className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-black/10 disabled:opacity-40 dark:hover:bg-white/10"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <a
            href={url}
            download={name || "document.pdf"}
            title="Download"
            className={`flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-black/10 dark:hover:bg-white/10 ${
              url ? "" : "pointer-events-none opacity-40"
            }`}
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div
        ref={containerRef}
        className="overflow-y-auto bg-black/5 dark:bg-black/20"
        style={{ height }}
      >
        {error ? (
          <p className="p-4 text-sm text-muted">{error}</p>
        ) : !doc ? (
          <p className="p-4 text-sm text-muted">Loading PDF…</p>
        ) : (
          <div className="flex flex-col items-center gap-3 p-3">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage key={i} doc={doc} pageNumber={i + 1} scrollRootRef={containerRef} />
            ))}
          </div>
        )}
      </div>

      {onHeightChange && (
        <div
          onMouseDown={handleResizeStart}
          title="Drag to resize"
          className="h-1.5 cursor-row-resize bg-border/60 transition-colors hover:bg-ring/60 print:hidden"
        />
      )}
    </div>
  );
}

function PdfPage({
  doc,
  pageNumber,
  scrollRootRef,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scrollRootRef: RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { root: scrollRootRef.current, rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scrollRootRef is a stable ref object
  }, []);

  useEffect(() => {
    if (!shouldRender) return;
    let cancelled = false;
    let renderTask: ReturnType<PDFPageProxy["render"]> | null = null;

    doc.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const container = scrollRootRef.current;
      if (!canvas || !container) return;

      const unscaled = page.getViewport({ scale: 1 });
      const targetWidth = Math.min(container.clientWidth - 24, 900);
      const scale = Math.max(0.5, Math.min(2.5, targetWidth / unscaled.width));
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      renderTask = page.render({ canvas, canvasContext: ctx, viewport });
      renderTask.promise.catch(() => {});
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [shouldRender, doc, pageNumber, scrollRootRef]);

  return (
    <div ref={wrapperRef} className="shadow-sm">
      <canvas ref={canvasRef} className="max-w-full break-inside-avoid" />
    </div>
  );
}
