"use client";

import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronRight, Folder, Trash2 } from "lucide-react";
import { rowDragListeners } from "@/lib/dnd-utils";

interface FolderRowProps {
  id: string;
  name: string;
  collapsed: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  onToggleCollapsed: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export function FolderRow({
  id,
  name,
  collapsed,
  isDropTarget,
  isDragging,
  onToggleCollapsed,
  onRename,
  onDelete,
}: FolderRowProps) {
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id,
    data: { type: "folder" },
  });
  const { setNodeRef: setDropRef } = useDroppable({ id, data: { type: "folder" } });
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);

  function commit() {
    setEditing(false);
    const next = nameDraft.trim() || "Untitled folder";
    if (next !== name) onRename(next);
  }

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      {...attributes}
      {...rowDragListeners(listeners)}
      onClick={onToggleCollapsed}
      className={`group flex items-center gap-1 rounded-md py-1 pl-1 pr-1.5 cursor-pointer select-none transition-colors
        ${isDropTarget ? "ring-2 ring-ring ring-inset" : "hover:bg-black/5 dark:hover:bg-white/8"}
        ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCollapsed();
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-black/10 dark:hover:bg-white/10"
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`} />
      </button>

      <Folder className="h-4 w-4 shrink-0 text-muted" />

      {editing ? (
        <input
          autoFocus
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setNameDraft(name);
              setEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setNameDraft(name);
            setEditing(true);
          }}
          className="min-w-0 flex-1 truncate text-sm font-medium"
        >
          {name}
        </span>
      )}

      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete folder"
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-black/10 dark:hover:bg-white/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
