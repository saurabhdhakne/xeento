"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ContextMenuProps {
  /** Viewport coordinates of the right-click, or null when closed. */
  position: { x: number; y: number } | null;
  onClose: () => void;
  children: ReactNode;
}

const VIEWPORT_MARGIN = 8;

/**
 * Cursor-anchored menu for right-click actions. Same portal-to-body
 * reasoning as Popover (the sidebar `<aside>` is overflow-hidden), but
 * positioned at the click point rather than under a trigger element, then
 * clamped into the viewport once its real size is known.
 */
export function ContextMenu({ position, onClose, children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!position || !menuRef.current) {
      setClamped(null);
      return;
    }
    const { offsetWidth: w, offsetHeight: h } = menuRef.current;
    setClamped({
      x: Math.max(VIEWPORT_MARGIN, Math.min(position.x, window.innerWidth - w - VIEWPORT_MARGIN)),
      y: Math.max(VIEWPORT_MARGIN, Math.min(position.y, window.innerHeight - h - VIEWPORT_MARGIN)),
    });
  }, [position]);

  useEffect(() => {
    if (!position) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [position, onClose]);

  if (!position) return null;

  const at = clamped ?? position;
  return createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", top: at.y, left: at.x, visibility: clamped ? "visible" : "hidden" }}
      className="z-50 w-48 rounded-lg border border-border bg-popover p-1.5 shadow-lg"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function ContextMenuItem({
  icon,
  label,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/8"
    >
      {icon}
      {label}
    </button>
  );
}
