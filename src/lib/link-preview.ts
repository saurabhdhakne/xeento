import type { LinkPreviewResponse } from "@/app/api/link-preview/route.server";

export type LinkPreview = LinkPreviewResponse;

// Set in next.config.ts: the app's own `/api/link-preview` route on a server
// build, empty on a static export (no server) unless configured.
const PREVIEW_URL = process.env.NEXT_PUBLIC_LINK_PREVIEW_URL ?? "";

/** True when this build has a preview server; otherwise the setting is hidden. */
export const linkPreviewsAvailable = PREVIEW_URL !== "";

/** Device-only setting (Settings → Link previews), on by default. */
export const LINK_PREVIEWS_SETTING_KEY = "xeento:link-previews";

/** Whether link metadata may be fetched. When false, nothing is sent to the preview server. */
export function linkPreviewsEnabled(): boolean {
  return linkPreviewsAvailable && window.localStorage.getItem(LINK_PREVIEWS_SETTING_KEY) !== "0";
}

// One request per URL per session — the paste menu prefetches as soon as a
// URL is pasted, so by the time Mention/Bookmark is picked it's usually ready.
const cache = new Map<string, Promise<LinkPreview>>();

/** Title/description/og:image/favicon for a URL, via the link-preview server. Never rejects. */
export function fetchLinkPreview(url: string): Promise<LinkPreview> {
  if (!linkPreviewsEnabled()) return Promise.resolve(fallbackLinkPreview(url));
  let pending = cache.get(url);
  if (!pending) {
    pending = fetch(`${PREVIEW_URL}?url=${encodeURIComponent(url)}`)
      .then((res) => res.json())
      .then((data: Partial<LinkPreview>) => ({ ...fallbackLinkPreview(url), ...stripEmpty(data) }))
      .catch(() => fallbackLinkPreview(url));
    cache.set(url, pending);
  }
  return pending;
}

export function fallbackLinkPreview(url: string): LinkPreview {
  let host = url;
  let origin = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./, "");
    origin = parsed.origin;
  } catch {
    // keep the raw string as the title
  }
  return {
    url,
    title: host,
    description: "",
    image: "",
    favicon: origin ? `${origin}/favicon.ico` : "",
    siteName: host,
  };
}

function stripEmpty(data: Partial<LinkPreview>): Partial<LinkPreview> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => typeof value === "string" && value !== ""),
  );
}

/** True when the pasted text is exactly one http(s) URL (no surrounding prose). */
export function parsePastedUrl(text: string | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}
