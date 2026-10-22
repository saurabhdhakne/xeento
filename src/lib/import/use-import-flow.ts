"use client";

import { useState } from "react";
import { toast } from "@/components/ui/toast";
import type { ImportProgressCallback, ImportSummary } from "./import-core";

interface ImportProgress {
  processed: number;
  total: number;
  currentPath: string;
}

/** Shared progress/summary state for any import entry point (Settings menu buttons, sidebar drop zone) — each just calls `run` with its own importer function. */
export function useImportFlow() {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function run(importFn: (onProgress: ImportProgressCallback) => Promise<ImportSummary>) {
    setProgress({ processed: 0, total: 0, currentPath: "" });
    setSummary(null);
    try {
      const result = await importFn((processed, total, currentPath) => setProgress({ processed, total, currentPath }));
      setSummary(result);
    } catch {
      toast.error("Import failed — the file may be corrupt or in an unexpected format.");
      setProgress(null);
    }
  }

  function close() {
    setProgress(null);
    setSummary(null);
  }

  return { progress, summary, run, close };
}
