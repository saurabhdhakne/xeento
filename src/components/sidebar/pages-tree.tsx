"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { PageTreeNode } from "@/lib/build-page-tree";
import { duplicatePage } from "@/lib/pages";
import { PageTreeRow } from "./page-tree-row";

interface PagesTreeProps {
  nodes: PageTreeNode[];
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  activeId: string | null;
  overId: string | null;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onIconChange: (id: string, icon: string | null) => void;
  onToggleFavourite: (id: string) => void;
}

/**
 * Presentational tree renderer, reused for both the unfoldered "Pages"
 * section and the contents of each expanded folder. It doesn't own a
 * DndContext — rows register against whichever DndContext is the nearest
 * React ancestor (the shared one owned by sidebar.tsx).
 */
export function PagesTree({
  nodes,
  depth,
  expanded,
  selectedId,
  activeId,
  overId,
  onToggleExpand,
  onSelect,
  onCreateChild,
  onDelete,
  onRename,
  onIconChange,
  onToggleFavourite,
}: PagesTreeProps) {
  return (
    <>
      {nodes.map((node) => (
        <PagesTreeRow
          key={node.id}
          node={node}
          depth={depth}
          expanded={expanded}
          selectedId={selectedId}
          activeId={activeId}
          overId={overId}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
          onCreateChild={onCreateChild}
          onDelete={onDelete}
          onRename={onRename}
          onIconChange={onIconChange}
          onToggleFavourite={onToggleFavourite}
        />
      ))}
    </>
  );
}

function PagesTreeRow({
  node,
  depth,
  expanded,
  selectedId,
  activeId,
  overId,
  onToggleExpand,
  onSelect,
  onCreateChild,
  onDelete,
  onRename,
  onIconChange,
  onToggleFavourite,
}: {
  node: PageTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  activeId: string | null;
  overId: string | null;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onIconChange: (id: string, icon: string | null) => void;
  onToggleFavourite: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: node.id,
    data: { type: "page" },
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: node.id, data: { type: "page" } });
  const isExpanded = expanded.has(node.id);

  return (
    <div>
      <PageTreeRow
        title={node.title}
        icon={node.icon}
        depth={depth}
        hasChildren={node.children.length > 0}
        expanded={isExpanded}
        isSelected={selectedId === node.id}
        isDropTarget={overId === node.id && activeId !== node.id}
        isDragging={isDragging}
        favourite={node.favourite}
        rowRef={(el) => {
          setDragRef(el);
          setDropRef(el);
        }}
        dragProps={{ attributes, listeners }}
        onToggleExpand={() => onToggleExpand(node.id)}
        onSelect={() => onSelect(node.id)}
        onRename={(title) => onRename(node.id, title)}
        onIconChange={(icon) => onIconChange(node.id, icon)}
        onCreateChild={() => onCreateChild(node.id)}
        onDelete={() => onDelete(node.id)}
        onToggleFavourite={() => onToggleFavourite(node.id)}
        onDuplicate={() => void duplicatePage(node.id)}
      />
      {isExpanded && node.children.length > 0 && (
        <PagesTree
          nodes={node.children}
          depth={depth + 1}
          expanded={expanded}
          selectedId={selectedId}
          activeId={activeId}
          overId={overId}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
          onCreateChild={onCreateChild}
          onDelete={onDelete}
          onRename={onRename}
          onIconChange={onIconChange}
          onToggleFavourite={onToggleFavourite}
        />
      )}
    </div>
  );
}
