"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { FileText } from "lucide-react";
import { usePageOrNull } from "@/lib/use-pages";

/**
 * An inline chip linking to another Xeento page, inserted from the `@` /
 * `[[` menu. Stores only the page id, so the chip always shows the target's
 * current title and icon. It's a `xeento-page://` link, so the click
 * listener in AppShell opens it like any other internal link.
 */
export const pageMentionSpec = createReactInlineContentSpec(
  {
    type: "pageMention",
    propSchema: {
      pageId: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => <PageMentionChip pageId={inlineContent.props.pageId} />,
  },
);

function PageMentionChip({ pageId }: { pageId: string }) {
  const page = usePageOrNull(pageId);
  return (
    <a
      href={`xeento-page://${pageId}`}
      contentEditable={false}
      className={`xeento-link-mention ${page === null ? "text-muted line-through" : ""}`}
    >
      {page?.icon ? (
        <span className="leading-none">{page.icon}</span>
      ) : (
        <FileText className="h-[1em] w-[1em] shrink-0" strokeWidth={1.75} />
      )}
      <span>{page ? page.title || "Untitled" : page === null ? "Deleted page" : "…"}</span>
    </a>
  );
}
