"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface PopoverProps {
  trigger: (props: { onClick: (e: React.MouseEvent) => void; open: boolean }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}

interface Position {
  top: number;
  left: number;
}

const VIEWPORT_MARGIN = 8;

/**
 * Renders its dropdown in a portal to document.body, positioned via the
 * trigger's bounding rect, instead of as an absolutely-positioned sibling
 * in normal flow. Several triggers (e.g. the sidebar header's Settings
 * button) sit inside an `overflow-hidden` ancestor (the resizable sidebar
 * `<aside>`) that's much narrower than the dropdown itself — an in-flow
 * dropdown gets silently clipped by that ancestor on whichever side it
 * happens to overflow, and `align` alone can't fix that since the trigger
 * can be close to both edges of a narrow container at once. Portaling
 * escapes the clipping ancestor entirely; a second pass below (`clamp`)
 * then nudges the dropdown back inside the viewport using its real
 * rendered width, which isn't known until after the first paint.
 */
export function Popover({ trigger, children, align = "left" }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Pass 1: provisional position from the trigger alone, before the
  // dropdown's own width is known.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPosition(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      left: align === "right" ? rect.right : rect.left,
    });
  }, [open, align]);

  // Pass 2: once the dropdown has rendered, re-anchor "right"-aligned
  // menus by their actual width, then clamp into the viewport.
  useLayoutEffect(() => {
    if (!open || !position || !dropdownRef.current || !triggerRef.current) return;
    const dropdownWidth = dropdownRef.current.offsetWidth;
    const rect = triggerRef.current.getBoundingClientRect();
    const raw = align === "right" ? rect.right - dropdownWidth : rect.left;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(raw, window.innerWidth - dropdownWidth - VIEWPORT_MARGIN),
    );
    if (Math.abs(left - position.left) > 0.5) {
      setPosition((p) => (p ? { ...p, left } : p));
    }
  }, [open, position, align]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // The dropdown's position is computed once, on open — if the page
    // scrolls under it, close rather than let it drift out of alignment
    // with its trigger.
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={triggerRef}>
      {trigger({
        onClick: (e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        },
        open,
      })}
      {open &&
        position &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ position: "fixed", top: position.top, left: position.left }}
            className="z-50"
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}
