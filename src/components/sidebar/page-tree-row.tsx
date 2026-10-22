"use client";

import { useState, type CSSProperties } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { ChevronRight, Copy, Plus, Star, Trash2 } from "lucide-react";
import { IconPicker } from "@/components/icon-picker";
import { ContextMenu, ContextMenuItem } from "@/components/ui/context-menu";
import { rowDragListeners } from "@/lib/dnd-utils";

interface PageTreeRowProps {
  title: string;
  icon: string | null;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  isSelected: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  favourite: boolean;
  rowRef: (node: HTMLDivElement | null) => void;
  /** Spread on the whole row (it's the drag handle). Omitted for rows that can't be dragged (Recent). */
  dragProps?: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners };
  style?: CSSProperties;
  onToggleExpand: () => void;
  onSelect: () => void;
  onRename: (title: string) => void;
  onIconChange: (icon: string | null) => void;
  onCreateChild: () => void;
  onDelete: () => void;
  onToggleFavourite: () => void;
  onDuplicate: () => void;
}

/**
 * Pure presentation — doesn't call useDraggable/useDroppable/useSortable
 * itself. Different sections feed it drag wiring from different dnd-kit
 * APIs (the shared Folders+Pages DndContext uses useDraggable+useDroppable;
 * Favourites uses useSortable), so the row just applies whatever ref/
 * attributes/listeners/style it's given — on the whole row, so a drag can
 * start anywhere on it (dnd-kit's 4px activation distance keeps plain
 * clicks/double-clicks working). Recent passes none at all (it's ordered
 * by last-opened, not draggable).
 */
export function PageTreeRow({
  title,
  icon,
  depth,
  hasChildren,
  expanded,
  isSelected,
  isDropTarget,
  isDragging,
  favourite,
  rowRef,
  dragProps,
  style,
  onToggleExpand,
  onSelect,
  onRename,
  onIconChange,
  onCreateChild,
  onDelete,
  onToggleFavourite,
  onDuplicate,
}: PageTreeRowProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [titleDraft, setTitleDraft] = useState(title);

  function commitTitle() {
    setEditingTitle(false);
    const next = titleDraft.trim() || "Untitled";
    if (next !== title) onRename(next);
  }

  return (
    <div
      ref={rowRef}
      {...dragProps?.attributes}
      {...rowDragListeners(dragProps?.listeners)}
      style={{ paddingLeft: depth * 16 + 4, ...style }}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuAt({ x: e.clientX, y: e.clientY });
      }}
      className={`group flex items-center gap-1 rounded-md py-1 pr-1.5 cursor-pointer select-none transition-colors
        ${isSelected ? "bg-accent-soft" : "hover:bg-black/5 dark:hover:bg-white/8"}
        ${isDropTarget ? "ring-2 ring-ring ring-inset" : ""}
        ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-black/10 dark:hover:bg-white/10 ${
          hasChildren ? "" : "invisible"
        }`}
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      <IconPicker icon={icon} onChange={onIconChange} />

      {editingTitle ? (
        <input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTitle();
            }
            if (e.key === "Escape") {
              setTitleDraft(title);
              setEditingTitle(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setTitleDraft(title);
            setEditingTitle(true);
          }}
          className={`min-w-0 flex-1 truncate text-sm ${title ? "" : "text-muted"}`}
        >
          {title || "Untitled"}
        </span>
      )}

      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavourite();
          }}
          title={favourite ? "Remove from favourites" : "Add to favourites"}
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-black/10 dark:hover:bg-white/10"
        >
          <Star
            className="h-3.5 w-3.5"
            fill={favourite ? "#FACC15" : "none"}
            stroke={favourite ? "#FACC15" : "currentColor"}
          />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCreateChild();
          }}
          title="Add a page inside"
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-black/10 dark:hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-black/10 dark:hover:bg-white/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <ContextMenu position={menuAt} onClose={() => setMenuAt(null)}>
        <ContextMenuItem
          icon={<Copy className="h-3.5 w-3.5" />}
          label="Duplicate"
          onSelect={() => {
            setMenuAt(null);
            onDuplicate();
          }}
        />
      </ContextMenu>
    </div>
  );
}
