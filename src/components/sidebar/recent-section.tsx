"use client";

import { useMemo } from "react";
import type { PageRecord } from "@/lib/records";
import { SectionHeader } from "./section-header";
import { duplicatePage } from "@/lib/pages";
import { PageTreeRow } from "./page-tree-row";

const RECENT_LIMIT = 8;

interface RecentSectionProps {
  pages: PageRecord[];
  /** Ordered page ids, snapshotted once per load/refresh — see app-shell.tsx. */
  recentIds: string[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onIconChange: (id: string, icon: string | null) => void;
  onToggleFavourite: (id: string) => void;
}

export function RecentSection({
  pages,
  recentIds,
  collapsed,
  onToggleCollapsed,
  selectedId,
  onSelect,
  onCreateChild,
  onDelete,
  onRename,
  onIconChange,
  onToggleFavourite,
}: RecentSectionProps) {
  const pagesById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  // Order and membership come from the frozen snapshot (so navigating around
  // doesn't reshuffle this list mid-session); each row's own data (title,
  // icon, favourite) is still read live so edits show up immediately.
  const recent = recentIds
    .map((id) => pagesById.get(id))
    .filter((p): p is PageRecord => p !== undefined)
    .slice(0, RECENT_LIMIT);

  if (recent.length === 0) return null;

  return (
    <div>
      <SectionHeader label="Recent" collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      {!collapsed && (
        <div className="px-2">
          {recent.map((page) => (
            // Same row (and actions) as Pages/Favourites, flat and without a
            // drag handle — Recent's order is last-opened, not user-arranged.
            <PageTreeRow
              key={page.id}
              title={page.title}
              icon={page.icon}
              depth={0}
              hasChildren={false}
              expanded={false}
              isSelected={selectedId === page.id}
              isDropTarget={false}
              isDragging={false}
              favourite={page.favourite}
              rowRef={() => {}}
              onToggleExpand={() => {}}
              onSelect={() => onSelect(page.id)}
              onRename={(title) => onRename(page.id, title)}
              onIconChange={(icon) => onIconChange(page.id, icon)}
              onCreateChild={() => onCreateChild(page.id)}
              onDelete={() => onDelete(page.id)}
              onToggleFavourite={() => onToggleFavourite(page.id)}
              onDuplicate={() => void duplicatePage(page.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
