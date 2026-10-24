import type { NextConfig } from "next";

// `npm run build:static` sets this: a static export (no server) that can be
// hosted anywhere, e.g. GitHub Pages under NEXT_PUBLIC_BASE_PATH=/<repo>.
const isStaticExport = process.env.XEENTO_STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  /* config options here */
  ...(isStaticExport ? { output: "export" as const } : {}),
  basePath,
  // Route handlers are named `route.server.ts`, so the export build (which
  // can't run them) leaves them out by not listing that extension.
  pageExtensions: isStaticExport ? ["tsx", "ts"] : ["server.ts", "tsx", "ts"],
  env: {
    // Static builds have no preview route; link previews stay off and
    // hidden unless a preview server is configured.
    NEXT_PUBLIC_LINK_PREVIEW_URL:
      process.env.NEXT_PUBLIC_LINK_PREVIEW_URL ?? (isStaticExport ? "" : `${basePath}/api/link-preview`),
  },
  // Export mode rejects PPR, and partialPrefetching requires cacheComponents,
  // so the static build drops both.
  cacheComponents: !isStaticExport,
  partialPrefetching: !isStaticExport,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
