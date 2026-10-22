"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { FilePlus2 } from "lucide-react";

interface FileDropZoneProps {
  onDropFiles: (files: File[]) => void;
  children: ReactNode;
  message?: string;
  overlayClassName?: string;
}

function isFileDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

/**
 * Wraps the editor with a visible "drop files here" overlay for OS file
 * drags of any type (images, videos, audio, PDFs, generic files — the
 * caller decides what block type each one becomes). Uses capture-phase
 * handlers so this intercepts file drags before they reach BlockNote's own
 * contentEditable area (which would otherwise try to handle the same drop
 * itself, inserting the file twice) — while non-file drags, like
 * BlockNote's internal drag-handle block reordering, are left completely
 * untouched and fall through to the editor as normal.
 */
export function FileDropZone({
  onDropFiles,
  children,
  message = "Drop files to add them to this page",
  overlayClassName = "absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-ring bg-accent-soft/90",
}: FileDropZoneProps) {
  const [dragDepth, setDragDepth] = useState(0);

  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => d + 1);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => Math.max(0, d - 1));
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragDepth(0);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onDropFiles(files);
  }

  return (
    <div
      className="relative"
      onDragEnterCapture={handleDragEnter}
      onDragOverCapture={handleDragOver}
      onDragLeaveCapture={handleDragLeave}
      onDropCapture={handleDrop}
    >
      {children}
      {dragDepth > 0 && (
        <div className={`pointer-events-none ${overlayClassName}`}>
          <div className="flex flex-col items-center gap-2 text-accent">
            <FilePlus2 className="h-8 w-8" strokeWidth={1.5} />
            <p className="text-sm font-medium">{message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
