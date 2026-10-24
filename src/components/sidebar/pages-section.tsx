"use client";

import { buildPageTree } from "@/lib/build-page-tree";
import type { PageRecord } from "@/lib/records";
import { DropSentinel } from "./drop-sentinel";
import { PagesTree } from "./pages-tree";
import { SectionHeader } from "./section-header";

interface PagesSectionProps {
  pages: PageRecord[];
  expanded: Set<string>;
  selectedId: string | null;
  activeId: string | null;
  overId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onIconChange: (id: string, icon: string | null) => void;
  onToggleFavourite: (id: string) => void;
}

export function PagesSection({
  pages,
  expanded,
  selectedId,
  activeId,
  overId,
  collapsed,
  onToggleCollapsed,
  onToggleExpand,
  onSelect,
  onCreateChild,
  onDelete,
  onRename,
  onIconChange,
  onToggleFavourite,
}: PagesSectionProps) {
  const tree = buildPageTree(pages, (p) => (p.folderId ?? null) === null);

  return (
    <div>
      <SectionHeader label="Pages" collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      {!collapsed && (
        <div className="px-2">
          {tree.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted">No pages yet</p>
          ) : (
            <PagesTree
              nodes={tree}
              depth={0}
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
          <DropSentinel
            id="pages-root-end"
            data={{ type: "pages-root-end" }}
            active={activeId !== null}
            isOver={overId === "pages-root-end"}
          />
        </div>
      )}
    </div>
  );
}
