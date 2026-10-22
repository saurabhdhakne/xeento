import type { DraggableSyntheticListeners } from "@dnd-kit/core";

export const NEST_THRESHOLD_PX = 28;

/** Dragged noticeably right of the drop target => interpreted as "nest inside," not "reorder near." */
export function isNestGesture(activeRect: { left: number }, overRect: { left: number }): boolean {
  return activeRect.left - overRect.left > NEST_THRESHOLD_PX;
}

/** Whether the dragged item's center is below the drop target's midpoint. */
export function isAfter(
  activeRect: { top: number; height: number },
  overRect: { top: number; height: number },
): boolean {
  const overMid = overRect.top + overRect.height / 2;
  const activeCenter = activeRect.top + activeRect.height / 2;
  return activeCenter > overMid;
}

/**
 * Wraps dnd-kit's listeners for use on a whole sidebar row (rather than a
 * small grip button). Two kinds of events must not start a drag:
 * - ones from a text input inside the row (renaming) — otherwise selecting
 *   text by dragging, or pressing Space in Favourites (KeyboardSensor),
 *   would pick the row up;
 * - ones that only *bubble through React* from a portal (the icon picker,
 *   the right-click menu) — React propagates portal events to the row even
 *   though the DOM target isn't inside it.
 */
export function rowDragListeners(
  listeners: DraggableSyntheticListeners,
): DraggableSyntheticListeners {
  if (!listeners) return undefined;
  return Object.fromEntries(
    Object.entries(listeners).map(([name, handler]) => [
      name,
      (event: React.SyntheticEvent) => {
        const target = event.target as HTMLElement;
        if (!(event.currentTarget as HTMLElement).contains(target)) return;
        if (target.closest("input, textarea")) return;
        (handler as (event: React.SyntheticEvent) => void)(event);
      },
    ]),
  );
}
