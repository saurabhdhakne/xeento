"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AtSign, Bookmark, Link2, Loader2, MonitorPlay } from "lucide-react";
import { fetchLinkPreview, linkPreviewsEnabled } from "@/lib/link-preview";
import { directMediaBlockType } from "@/lib/embed-providers";
import type { xeentoSchema } from "./schema";

type XeentoEditor = typeof xeentoSchema.BlockNoteEditor;

/** A URL that was just pasted as a link, spanning ProseMirror positions [from, to). */
export interface PastedUrl {
  url: string;
  from: number;
  to: number;
  blockId: string;
}

type Option = "mention" | "bookmark" | "embed" | "url";

const OPTIONS: { id: Option; label: string; hint: string; icon: typeof AtSign }[] = [
  { id: "mention", label: "Mention", hint: "Inline chip with icon + title", icon: AtSign },
  { id: "bookmark", label: "Bookmark", hint: "Preview card with image", icon: Bookmark },
  { id: "embed", label: "Embed", hint: "Play video, audio or page inline", icon: MonitorPlay },
  { id: "url", label: "URL", hint: "Keep as a link", icon: Link2 },
];

const VIEWPORT_MARGIN = 8;

/**
 * The "paste as…" menu shown right after a bare URL is pasted. The URL is
 * already in the document as a normal clickable link by then (so "URL"
 * just dismisses); the other options replace that link text. Typing
 * anything else or clicking away dismisses it, leaving the link as-is —
 * and every option first re-checks that the link text is still exactly
 * where it was pasted, so a stale menu can never delete the wrong text.
 */
export function PasteUrlMenu({
  editor,
  pasted,
  onClose,
}: {
  editor: XeentoEditor;
  pasted: PastedUrl;
  onClose: () => void;
}) {
  // Mention and Bookmark need fetched metadata, so they're left out when
  // link previews are off. Read once, so the list can't change while open.
  const [options] = useState(() =>
    linkPreviewsEnabled() ? OPTIONS : OPTIONS.filter((o) => o.id === "embed" || o.id === "url"),
  );
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<Option | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    function place() {
      let coords: { bottom: number; left: number };
      try {
        coords = editor.prosemirrorView.coordsAtPos(pasted.to);
      } catch {
        onClose();
        return;
      }
      const width = menuRef.current?.offsetWidth ?? 260;
      const height = menuRef.current?.offsetHeight ?? 200;
      let top = coords.bottom + 6;
      if (top + height > window.innerHeight - VIEWPORT_MARGIN) top = coords.bottom - height - 28;
      const left = Math.min(
        Math.max(coords.left, VIEWPORT_MARGIN),
        window.innerWidth - width - VIEWPORT_MARGIN,
      );
      setPosition({ top, left });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [editor, pasted.to, onClose]);

  function linkStillInPlace() {
    try {
      return editor.prosemirrorState.doc.textBetween(pasted.from, pasted.to) === pasted.url;
    } catch {
      return false;
    }
  }

  async function choose(option: Option) {
    if (option === "url" || !linkStillInPlace()) {
      onClose();
      return;
    }

    if (option === "mention") {
      setBusy("mention");
      const preview = await fetchLinkPreview(pasted.url);
      if (!linkStillInPlace()) {
        onClose();
        return;
      }
      const { pmSchema } = editor;
      editor.transact((tr) => {
        tr.replaceWith(pasted.from, pasted.to, [
          pmSchema.nodes.linkMention.create({
            url: pasted.url,
            title: preview.title,
            favicon: preview.favicon,
          }),
          pmSchema.text(" "),
        ]);
      });
      editor.focus();
      onClose();
      return;
    }

    editor.transact((tr) => {
      tr.delete(pasted.from, pasted.to);
    });
    const mediaType = option === "embed" ? directMediaBlockType(pasted.url) : null;
    const newBlock =
      option === "bookmark"
        ? ({ type: "bookmark", props: { url: pasted.url } } as const)
        : mediaType
          ? ({ type: mediaType, props: { url: pasted.url } } as const)
          : ({ type: "embed", props: { url: pasted.url } } as const);
    const block = editor.getBlock(pasted.blockId);
    if (block) {
      const isEmpty =
        Array.isArray(block.content) &&
        block.content.every((node) => node.type === "text" && node.text.trim() === "");
      if (isEmpty) editor.replaceBlocks([block.id], [newBlock]);
      else editor.insertBlocks([newBlock], block.id, "after");
    }
    onClose();
  }

  // Latest `choose`/`active` for the once-registered key listener below.
  const chooseRef = useRef(choose);
  const activeRef = useRef(active);
  useEffect(() => {
    chooseRef.current = choose;
    activeRef.current = active;
  });

  useEffect(() => {
    // Capture phase on window, so arrow/Enter never reach ProseMirror
    // while the menu is open; any other key dismisses it and goes through.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((i) => (i + step + options.length) % options.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        void chooseRef.current(options[activeRef.current].id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) {
        onClose();
      }
    }
    function onMouseDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("mousedown", onMouseDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [onClose, options]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
      className="fixed z-50 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg"
    >
      <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted">Paste as</div>
      {options.map((option, index) => {
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            role="menuitem"
            onMouseEnter={() => setActive(index)}
            onClick={() => void choose(option.id)}
            disabled={busy !== null}
            className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-foreground ${
              index === active ? "bg-black/5 dark:bg-white/10" : ""
            }`}
          >
            {busy === option.id ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" />
            ) : (
              <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
            )}
            <span className="flex min-w-0 flex-col">
              <span>{option.label}</span>
              <span className="truncate text-xs text-muted">{option.hint}</span>
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
