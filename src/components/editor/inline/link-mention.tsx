"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { Favicon } from "../blocks/bookmark-block";

/**
 * An inline chip for a pasted URL: the site's favicon + page title,
 * opening the URL in a new tab on click. An atom (no editable text) —
 * title/favicon are fetched once, when the mention is created.
 */
export const linkMentionSpec = createReactInlineContentSpec(
  {
    type: "linkMention",
    propSchema: {
      url: { default: "" },
      title: { default: "" },
      favicon: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => {
      const { url, title, favicon } = inlineContent.props;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          contentEditable={false}
          title={url}
          onClick={(e) => {
            e.preventDefault();
            window.open(url, "_blank", "noopener,noreferrer");
          }}
          className="xeento-link-mention"
        >
          <Favicon src={favicon} className="h-[1em] w-[1em]" />
          <span>{title || url}</span>
        </a>
      );
    },
    toExternalHTML: ({ inlineContent }) => (
      <a href={inlineContent.props.url}>{inlineContent.props.title || inlineContent.props.url}</a>
    ),
  },
);
