"use client";

import { useEffect, useState } from "react";
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from "@blocknote/react";
import { Bookmark, Globe } from "lucide-react";
import { fetchLinkPreview } from "@/lib/link-preview";

const bookmarkBlockConfig = {
  type: "bookmark" as const,
  propSchema: {
    url: { default: "" },
    title: { default: "" },
    description: { default: "" },
    image: { default: "" },
    favicon: { default: "" },
    // Set once metadata has been fetched (successfully or not), so a
    // bookmark never re-fetches on every page open.
    loaded: { default: false },
  },
  content: "none" as const,
};

/**
 * A link-preview card — the same shape a social network shows when a link
 * is shared: title, description, favicon + URL, og:image on the side. The
 * whole card opens the URL in a new tab.
 */
function BookmarkBlockRender({
  block,
  editor,
}: ReactCustomBlockRenderProps<typeof bookmarkBlockConfig>) {
  const [draft, setDraft] = useState("");
  const { url, title, description, image, favicon, loaded } = block.props;

  useEffect(() => {
    if (!url || loaded) return;
    let cancelled = false;
    void fetchLinkPreview(url).then((preview) => {
      if (cancelled || !editor.getBlock(block.id)) return;
      editor.updateBlock(block.id, {
        props: {
          title: preview.title,
          description: preview.description,
          image: preview.image,
          favicon: preview.favicon,
          loaded: true,
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [url, loaded, editor, block.id]);

  if (!url) {
    return (
      <div
        contentEditable={false}
        className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-background p-4"
      >
        <Bookmark className="h-5 w-5 shrink-0 text-muted" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !draft.trim()) return;
            editor.updateBlock(block.id, { props: { url: draft.trim(), loaded: false } });
          }}
          placeholder="Paste a link to create a bookmark and press Enter"
          className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted"
        />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      contentEditable={false}
      // Inside the editable editor a plain anchor click isn't reliably
      // followed, so open it explicitly.
      onClick={(e) => {
        e.preventDefault();
        window.open(url, "_blank", "noopener,noreferrer");
      }}
      className="flex w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-background text-foreground no-underline transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3">
        {loaded ? (
          <>
            <div className="truncate text-sm font-medium">{title || url}</div>
            {description && <div className="line-clamp-2 text-xs text-muted">{description}</div>}
          </>
        ) : (
          <>
            <div className="h-4 w-2/3 animate-pulse rounded bg-black/10 dark:bg-white/10" />
            <div className="h-3 w-full animate-pulse rounded bg-black/5 dark:bg-white/5" />
          </>
        )}
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <Favicon src={favicon} />
          <span className="truncate">{url}</span>
        </div>
      </div>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary third-party og:image, not a Next-optimizable asset
        <img
          src={image}
          alt=""
          className="hidden w-[30%] max-w-60 shrink-0 object-cover sm:block"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </a>
  );
}

export function Favicon({ src, className = "h-3.5 w-3.5" }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <Globe className={`${className} shrink-0`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- third-party favicon
    <img src={src} alt="" className={`${className} shrink-0 rounded-sm`} onError={() => setFailed(true)} />
  );
}

export const bookmarkBlockSpec = createReactBlockSpec(bookmarkBlockConfig, {
  render: BookmarkBlockRender,
  // Markdown export: a plain `[title](url)` link.
  toExternalHTML: ({ block }) => (
    <p>
      <a href={block.props.url}>{block.props.title || block.props.url}</a>
    </p>
  ),
});
