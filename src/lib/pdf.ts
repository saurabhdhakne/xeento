import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";

// The worker is copied to public/ at install time (scripts/copy-pdf-worker.mjs)
// rather than bundled, since pdf.js workers resolve more reliably as a
// stable static-asset URL than through bundler worker imports.
GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export function loadPdfDocument(url: string): Promise<PDFDocumentProxy> {
  return getDocument({ url }).promise;
}
