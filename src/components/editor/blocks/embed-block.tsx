"use client";

import { useState } from "react";
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from "@blocknote/react";
import { ExternalLink, Video } from "lucide-react";
import { getIframeEmbed } from "@/lib/embed-providers";

const embedBlockConfig = {
  type: "embed" as const,
  propSchema: {
    url: { default: "" },
  },
  content: "none" as const,
};

function EmbedBlockRender({
  block,
  editor,
}: ReactCustomBlockRenderProps<typeof embedBlockConfig>) {
  const [draft, setDraft] = useState("");
  const embed = block.props.url ? getIframeEmbed(block.props.url) : null;

  if (block.props.url && embed) {
    return (
      <div contentEditable={false} className="w-full">
        <div
          className="w-full overflow-hidden rounded-lg border border-border"
          style={embed.aspectRatio ? { aspectRatio: embed.aspectRatio } : { height: embed.height }}
        >
          <iframe
            src={embed.src}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            title={`${embed.provider} embed`}
          />
        </div>
        <a
          href={block.props.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-muted hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{block.props.url}</span>
        </a>
      </div>
    );
  }

  return (
    <div
      contentEditable={false}
      className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-background p-4"
    >
      <Video className="h-5 w-5 shrink-0 text-muted" />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !draft.trim()) return;
          editor.updateBlock(block.id, { props: { url: draft.trim() } });
        }}
        placeholder="Paste a link (YouTube, Vimeo, Loom, Spotify, any page…) and press Enter"
        className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted"
      />
      {block.props.url && !embed && <span className="shrink-0 text-xs text-muted">Not a valid link</span>}
    </div>
  );
}

export const embedBlockSpec = createReactBlockSpec(embedBlockConfig, {
  render: EmbedBlockRender,
  // So Markdown export keeps the link rather than dropping the block.
  toExternalHTML: ({ block }) => (
    <p>
      <a href={block.props.url}>{block.props.url}</a>
    </p>
  ),
});
