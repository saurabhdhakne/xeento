// pdfjs-dist's worker needs to be a static asset at a stable URL rather
// than bundled — this copies it into public/ so it survives npm installs
// and pdfjs-dist version bumps without a manual step.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const destDir = join(root, "public");
const dest = join(destDir, "pdf.worker.min.mjs");

if (!existsSync(src)) {
  console.warn("[copy-pdf-worker] pdfjs-dist worker not found, skipping");
  process.exit(0);
}

if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("[copy-pdf-worker] copied pdf.worker.min.mjs to public/");
