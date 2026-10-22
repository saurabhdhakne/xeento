"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { buildPageTree } from "@/lib/build-page-tree";
import type { FolderRecord, PageRecord } from "@/lib/db";
import { deleteFolder, renameFolder, setFolderCollapsed } from "@/lib/folders";
import { DeleteFolderDialog } from "./delete-folder-dialog";
import { DropSentinel } from "./drop-sentinel";
import { FolderRow } from "./folder-row";
import { PagesTree } from "./pages-tree";
import { SectionHeader } from "./section-header";

interface FoldersSectionProps {
  folders: FolderRecord[];
  pages: PageRecord[];
  expanded: Set<string>;
  selectedId: string | null;
  activeId: string | null;
  overId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCreateFolder: () => void;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onIconChange: (id: string, icon: string | null) => void;
  onToggleFavourite: (id: string) => void;
}

export function FoldersSection({
  folders,
  pages,
  expanded,
  selectedId,
  activeId,
  overId,
  collapsed,
  onToggleCollapsed,
  onCreateFolder,
  onToggleExpand,
  onSelect,
  onCreateChild,
  onDelete,
  onRename,
  onIconChange,
  onToggleFavourite,
}: FoldersSectionProps) {
  const [deleteTarget, setDeleteTarget] = useState<FolderRecord | null>(null);
  const sortedFolders = [...folders].sort((a, b) => a.order - b.order);
  const dragActive = activeId !== null;

  return (
    <div>
      <SectionHeader
        label="Folders"
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        action={
          <button
            type="button"
            onClick={onCreateFolder}
            title="New folder"
            className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-black/10 dark:hover:bg-white/10"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        }
      />
      {!collapsed && (
        <div className="px-2">
          {sortedFolders.map((folder) => {
            const tree = buildPageTree(pages, (p) => p.folderId === folder.id);
            return (
              <div key={folder.id}>
                <FolderRow
                  id={folder.id}
                  name={folder.name}
                  collapsed={folder.collapsed}
                  isDropTarget={overId === folder.id && activeId !== folder.id}
                  isDragging={activeId === folder.id}
                  onToggleCollapsed={() => void setFolderCollapsed(folder.id, !folder.collapsed)}
                  onRename={(name) => void renameFolder(folder.id, name)}
                  onDelete={() => setDeleteTarget(folder)}
                />
                {!folder.collapsed && (
                  <div className="pl-3">
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
                    <DropSentinel
                      id={`folder-end:${folder.id}`}
                      data={{ type: "folder-end", folderId: folder.id }}
                      active={dragActive}
                      isOver={overId === `folder-end:${folder.id}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
          <DropSentinel
            id="folders-list-end"
            data={{ type: "folders-end" }}
            active={dragActive}
            isOver={overId === "folders-list-end"}
          />
        </div>
      )}

      {deleteTarget && (
        <DeleteFolderDialog
          folder={deleteTarget}
          pageCount={pages.filter((p) => p.folderId === deleteTarget.id).length}
          onCancel={() => setDeleteTarget(null)}
          onMoveToRoot={() => {
            void deleteFolder(deleteTarget.id, "moveToRoot");
            setDeleteTarget(null);
          }}
          onDeleteContents={() => {
            void deleteFolder(deleteTarget.id, "deleteContents");
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
