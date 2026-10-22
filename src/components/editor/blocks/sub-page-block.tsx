"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { FileText } from "lucide-react";
import { usePageOrNull } from "@/lib/use-pages";

/**
 * A card for a sub-page, inserted by `/page` (which creates the child page
 * first). Only a link: deleting the card leaves the page in the sidebar,
 * and children created from the sidebar don't get a card. Opens through
 * the same `xeento-page://` click listener as page mentions.
 */
export const subPageBlockSpec = createReactBlockSpec(
  {
    type: "subPage",
    propSchema: {
      pageId: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block }) => <SubPageCard pageId={block.props.pageId} />,
  },
);

function SubPageCard({ pageId }: { pageId: string }) {
  const page = usePageOrNull(pageId);
  return (
    <a
      href={`xeento-page://${pageId}`}
      contentEditable={false}
      className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 font-medium no-underline hover:bg-black/5 dark:hover:bg-white/8 ${
        page === null ? "text-muted line-through" : "text-foreground"
      }`}
    >
      <span className="flex w-5 shrink-0 justify-center">
        {page?.icon ?? <FileText className="h-4 w-4 text-muted" strokeWidth={1.75} />}
      </span>
      <span className="truncate underline decoration-border underline-offset-4">
        {page ? page.title || "Untitled" : page === null ? "Deleted page" : "…"}
      </span>
    </a>
  );
}
