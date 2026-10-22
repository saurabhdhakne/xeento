import { getYouTubeVideoId, youTubeEmbedUrl } from "./youtube";

export interface IframeEmbed {
  src: string;
  provider: string;
  /** CSS aspect-ratio for video-like players; null means a fixed `height` instead. */
  aspectRatio: string | null;
  height: number;
}

/**
 * Maps a pasted page URL to something an `<iframe>` can show: a known
 * provider's player URL where one exists (YouTube/Vimeo/Loom/Spotify/
 * SoundCloud/Figma), otherwise the page itself. Plenty of sites
 * refuse to be framed (X-Frame-Options / CSP frame-ancestors) — the embed
 * block always shows an "open" link underneath for that case.
 */
export function getIframeEmbed(rawUrl: string): IframeEmbed | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");
  const video = (provider: string, src: string): IframeEmbed => ({
    src,
    provider,
    aspectRatio: "16 / 9",
    height: 0,
  });

  const youTubeId = getYouTubeVideoId(rawUrl);
  if (youTubeId) return video("YouTube", youTubeEmbedUrl(youTubeId));

  if (host === "vimeo.com") {
    const id = url.pathname.match(/^\/(\d+)/)?.[1];
    if (id) return video("Vimeo", `https://player.vimeo.com/video/${id}`);
  }
  if (host === "loom.com") {
    const id = url.pathname.match(/^\/(?:share|embed)\/([\w-]+)/)?.[1];
    if (id) return video("Loom", `https://www.loom.com/embed/${id}`);
  }
  if (host === "open.spotify.com") {
    const match = url.pathname.match(/^\/(?:intl-[\w-]+\/)?(track|album|playlist|episode|show|artist)\/(\w+)/);
    if (match) {
      const [, kind, id] = match;
      const compact = kind === "track" || kind === "episode";
      return {
        src: `https://open.spotify.com/embed/${kind}/${id}`,
        provider: "Spotify",
        aspectRatio: null,
        height: compact ? 152 : 352,
      };
    }
  }
  if (host === "soundcloud.com") {
    return {
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(rawUrl)}`,
      provider: "SoundCloud",
      aspectRatio: null,
      height: 166,
    };
  }
  if (host === "figma.com" && /^\/(file|design|proto|board)\//.test(url.pathname)) {
    return video("Figma", `https://www.figma.com/embed?embed_host=xeento&url=${encodeURIComponent(rawUrl)}`);
  }

  return { src: url.href, provider: host, aspectRatio: null, height: 480 };
}

const MEDIA_EXTENSIONS: Record<string, "image" | "video" | "audio" | "pdf"> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  svg: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  m4v: "video",
  ogv: "video",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  m4a: "audio",
  aac: "audio",
  flac: "audio",
  pdf: "pdf",
};

/** For a URL pointing straight at a media file, the native block type that plays/shows it. */
export function directMediaBlockType(rawUrl: string): "image" | "video" | "audio" | "pdf" | null {
  try {
    const ext = new URL(rawUrl).pathname.split(".").pop()?.toLowerCase() ?? "";
    return MEDIA_EXTENSIONS[ext] ?? null;
  } catch {
    return null;
  }
}
