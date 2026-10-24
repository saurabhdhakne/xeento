import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Fetches a URL's title / description / og:image / favicon for link
 * mentions and bookmark blocks. This has to run server-side: a browser
 * can't read another site's HTML cross-origin (CORS), so the editor asks
 * this route instead.
 *
 * Because it fetches arbitrary user-supplied URLs, it refuses anything
 * that resolves to a loopback/private/link-local address (checked again
 * on every redirect hop), only reads up to `</head>` (at most MAX_BYTES), and
 * gives up after TIMEOUT_MS.
 */

// Some pages (YouTube) put their OG tags ~800KB in, after inline scripts.
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 4;

export interface LinkPreviewResponse {
  url: string;
  title: string;
  description: string;
  image: string;
  favicon: string;
  siteName: string;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  let target: URL;
  try {
    target = new URL(raw ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) urls are supported" }, { status: 400 });
  }

  try {
    const { response, finalUrl } = await safeFetch(target);
    const contentType = response.headers.get("content-type") ?? "";
    const fallback = fallbackPreview(finalUrl);
    if (!contentType.includes("html")) {
      void response.body?.cancel();
      const fileName = decodeURIComponent(finalUrl.pathname.split("/").pop() ?? "");
      return NextResponse.json({ ...fallback, title: fileName || fallback.title }, { headers: cacheHeaders });
    }
    const html = await readCapped(response);
    return NextResponse.json(parseHtml(html, finalUrl, fallback), { headers: cacheHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return NextResponse.json({ error: message, ...fallbackPreview(target) }, { status: 502 });
  }
}

const cacheHeaders = { "Cache-Control": "public, max-age=3600" };

async function safeFetch(start: URL): Promise<{ response: Response; finalUrl: URL }> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(current.hostname);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Some sites only serve OG tags to things that look like a link-preview bot.
        "User-Agent": "Mozilla/5.0 (compatible; XeentoLinkPreview/1.0; +https://xeento.app)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      void response.body?.cancel();
      current = new URL(location, current);
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw new Error("Redirected to a non-http url");
      }
      continue;
    }
    if (!response.ok) throw new Error(`Upstream responded ${response.status}`);
    return { response, finalUrl: current };
  }
  throw new Error("Too many redirects");
}

async function assertPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error("Refusing to fetch a private or local address");
  }
}

function isPrivateAddress(address: string): boolean {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const ip = mapped ? mapped[1] : address.toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  return (
    ip === "::" ||
    ip === "::1" ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80") ||
    ip.startsWith("ff")
  );
}

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    const chunk = decoder.decode(value, { stream: true });
    // Search only the new chunk plus a small overlap, not the whole buffer again.
    const searchFrom = Math.max(0, html.length - 7);
    html += chunk;
    if (/<\/head>/i.test(html.slice(searchFrom))) break;
  }
  void reader.cancel();
  return html;
}

function fallbackPreview(url: URL): LinkPreviewResponse {
  return {
    url: url.href,
    title: url.hostname.replace(/^www\./, ""),
    description: "",
    image: "",
    favicon: `${url.origin}/favicon.ico`,
    siteName: url.hostname.replace(/^www\./, ""),
  };
}

function parseHtml(html: string, baseUrl: URL, fallback: LinkPreviewResponse): LinkPreviewResponse {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html;
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = parseAttributes(tag);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop)?.toLowerCase();
    if (key && attrs.content && !meta.has(key)) meta.set(key, decodeEntities(attrs.content.trim()));
  }

  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title =
    meta.get("og:title") ?? meta.get("twitter:title") ?? (titleTag ? decodeEntities(titleTag.trim()) : "");
  const description =
    meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description") ?? "";
  const image = meta.get("og:image") ?? meta.get("og:image:url") ?? meta.get("twitter:image") ?? "";

  let favicon = "";
  let bestIconScore = -1;
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const attrs = parseAttributes(tag);
    const rel = attrs.rel?.toLowerCase() ?? "";
    if (!attrs.href || !/\bicon\b/.test(rel)) continue;
    // Prefer a plain `icon` (sized for tabs) over apple-touch-icon; prefer svg/png over ico.
    const score = (rel.includes("apple") ? 0 : 2) + (/\.(svg|png)(\?|$)/i.test(attrs.href) ? 1 : 0);
    if (score > bestIconScore) {
      bestIconScore = score;
      favicon = decodeEntities(attrs.href);
    }
  }

  return {
    url: baseUrl.href,
    title: title || fallback.title,
    description,
    image: absolutize(image, baseUrl),
    favicon: absolutize(favicon, baseUrl) || fallback.favicon,
    siteName: meta.get("og:site_name") ?? fallback.siteName,
  };
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function absolutize(href: string, base: URL): string {
  if (!href) return "";
  try {
    const url = new URL(href, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}
