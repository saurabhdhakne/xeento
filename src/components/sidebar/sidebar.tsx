"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { PanelLeftClose, Plus, Search, Trash2 } from "lucide-react";
import { isAfter, isNestGesture } from "@/lib/dnd-utils";
import { ROOT_ID, type FolderRecord, type PageRecord } from "@/lib/records";
import { useLocalStorageFlag } from "@/lib/use-local-storage-flag";
import { useLocalStorageNumber } from "@/lib/use-local-storage-number";
import { useTrash } from "@/lib/use-trash";
import { SyncStatusIndicator } from "./sync-status";
import { createFolder, reorderFolders } from "@/lib/folders";
import { movePageToPosition } from "@/lib/pages";
import { ThemeToggle } from "@/components/theme-toggle";
import { SettingsMenu } from "@/components/settings-menu";
import { FileDropZone } from "@/components/editor/file-drop-zone";
import { ImportProgressDialog } from "@/components/import/import-progress-dialog";
import { importMarkdownFiles } from "@/lib/import/markdown-import";
import { useImportFlow } from "@/lib/import/use-import-flow";
import { FavouritesSection } from "./favourites-section";
import { RecentSection } from "./recent-section";
import { FoldersSection } from "./folders-section";
import { PagesSection } from "./pages-section";
import { TrashDialog } from "./trash-dialog";

const DEFAULT_SIDEBAR_WIDTH = 256;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;

interface SidebarProps {
  pages: PageRecord[];
  folders: FolderRecord[];
  selectedId: string | null;
  expanded: Set<string>;
  open: boolean;
  onToggleOpen: () => void;
  onToggleExpand: (id: string) => void;
  onOpenPage: (id: string) => void;
  recentIds: string[];
  onCreateRoot: () => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onIconChange: (id: string, icon: string | null) => void;
  onToggleFavourite: (id: string) => void;
  onOpenSearch: () => void;
}

export function Sidebar({
  pages,
  folders,
  selectedId,
  expanded,
  open,
  onToggleOpen,
  onToggleExpand,
  onOpenPage,
  recentIds,
  onCreateRoot,
  onCreateChild,
  onDelete,
  onRename,
  onIconChange,
  onToggleFavourite,
  onOpenSearch,
}: SidebarProps) {
  const pagesById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const [favouritesCollapsed, setFavouritesCollapsed] = useLocalStorageFlag(
    "xeento:section-favourites-collapsed",
    false,
  );
  const [recentCollapsed, setRecentCollapsed] = useLocalStorageFlag(
    "xeento:section-recent-collapsed",
    false,
  );
  const [foldersCollapsed, setFoldersCollapsed] = useLocalStorageFlag(
    "xeento:section-folders-collapsed",
    false,
  );
  const [pagesCollapsed, setPagesCollapsed] = useLocalStorageFlag(
    "xeento:section-pages-collapsed",
    false,
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const { progress: importProgress, summary: importSummary, run: runImport, close: closeImportDialog } = useImportFlow();

  const trashCount = useTrash()?.length ?? 0;
  const [trashOpen, setTrashOpen] = useState(false);

  const [width, setWidth] = useLocalStorageNumber("xeento:sidebar-width", DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  // Imperative window listeners (attached/detached within this one handler)
  // rather than React state driving a useEffect — the drag only needs to
  // live for the duration of this mousedown-to-mouseup gesture.
  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handleMouseMove(moveEvent: MouseEvent) {
      // The sidebar's left edge sits flush against the viewport edge, so
      // clientX is already the sidebar's width.
      const next = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, moveEvent.clientX),
      );
      setWidth(next);
    }

    function handleMouseUp() {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over ? String(event.over.id) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);
    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type as string | undefined;
    const overType = over.data.current?.type as string | undefined;
    const activeIdStr = String(active.id);
    const activeRect = active.rect.current.translated;
    const overRect = over.rect;

    if (activeType === "folder") {
      const sortedIds = [...folders]
        .sort((a, b) => a.order - b.order)
        .map((f) => f.id)
        .filter((id) => id !== activeIdStr);

      if (overType === "folder" && activeRect) {
        const overIndex = sortedIds.indexOf(String(over.id));
        const targetIndex = isAfter(activeRect, overRect) ? overIndex + 1 : overIndex;
        sortedIds.splice(targetIndex, 0, activeIdStr);
        void reorderFolders(sortedIds);
      } else if (overType === "folders-end") {
        sortedIds.push(activeIdStr);
        void reorderFolders(sortedIds);
      }
      return;
    }

    // activeType === "page"
    if (overType === "pages-root-end") {
      const count = pages.filter(
        (p) => p.parentId === ROOT_ID && (p.folderId ?? null) === null && p.id !== activeIdStr,
      ).length;
      void movePageToPosition(activeIdStr, ROOT_ID, count, null);
      return;
    }

    if (overType === "folder-end" || overType === "folder") {
      const folderId =
        overType === "folder-end" ? (over.data.current?.folderId as string) : String(over.id);
      const count = pages.filter(
        (p) => p.parentId === ROOT_ID && p.folderId === folderId && p.id !== activeIdStr,
      ).length;
      void movePageToPosition(activeIdStr, ROOT_ID, count, folderId);
      return;
    }

    if (overType === "folders-end") return;

    if (overType === "page" && activeRect) {
      const overPage = pagesById.get(String(over.id));
      if (!overPage) return;

      if (isNestGesture(activeRect, overRect)) {
        const childCount = pages.filter(
          (p) => p.parentId === overPage.id && p.id !== activeIdStr,
        ).length;
        void movePageToPosition(activeIdStr, overPage.id, childCount, null);
        return;
      }

      const newFolderId = overPage.parentId === ROOT_ID ? overPage.folderId : null;
      const siblings = pages
        .filter((p) => p.parentId === overPage.parentId && p.id !== activeIdStr)
        .filter((p) => overPage.parentId !== ROOT_ID || (p.folderId ?? null) === newFolderId)
        .sort((a, b) => a.order - b.order);
      const overIndex = siblings.findIndex((p) => p.id === overPage.id);
      const targetIndex = isAfter(activeRect, overRect) ? overIndex + 1 : overIndex;
      void movePageToPosition(activeIdStr, overPage.parentId, targetIndex, newFolderId);
    }
  }

  function handleImportDrop(files: File[]) {
    const importable = files.filter((f) => /\.(md|zip)$/i.test(f.name));
    if (importable.length === 0) return;
    void runImport((onProgress) => importMarkdownFiles(importable, onProgress));
  }

  const activePage = activeId ? pagesById.get(activeId) : undefined;
  const activeFolder = activeId && !activePage ? foldersById.get(activeId) : undefined;

  return (
    <FileDropZone
      onDropFiles={handleImportDrop}
      message="Drop .md files or a .zip to import"
      overlayClassName="absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-ring bg-accent-soft/90"
    >
    <aside
      style={{ width: open ? width : 0 }}
      className={`relative h-full shrink-0 overflow-hidden border-r border-border bg-sidebar ${
        isResizing ? "" : "transition-[width] duration-200 ease-in-out"
      }`}
      aria-hidden={!open}
    >
      <div
        style={{ width }}
        className={`flex h-full flex-col ${open ? "" : "pointer-events-none"}`}
      >
        <div className="flex items-center gap-1 px-2 pt-3 pb-2">
          <button
            type="button"
            onClick={onToggleOpen}
            title="Collapse sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-black/5 dark:hover:bg-white/10"
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <span className="flex-1 text-sm font-semibold tracking-tight text-foreground">
            Xeento
          </span>
          <SettingsMenu />
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-1.5 px-2 pb-2">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-sm text-muted transition-colors hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">Search</span>
            <kbd className="shrink-0 rounded border border-border px-1 text-[10px] text-muted">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={onCreateRoot}
            title="New page"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-black/5 dark:hover:bg-white/10"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-2">
          <FavouritesSection
            pages={pages}
            collapsed={favouritesCollapsed}
            onToggleCollapsed={() => setFavouritesCollapsed((v) => !v)}
            selectedId={selectedId}
            onSelect={onOpenPage}
            onCreateChild={onCreateChild}
            onDelete={onDelete}
            onRename={onRename}
            onIconChange={onIconChange}
            onToggleFavourite={onToggleFavourite}
          />

          <RecentSection
            pages={pages}
            recentIds={recentIds}
            collapsed={recentCollapsed}
            onToggleCollapsed={() => setRecentCollapsed((v) => !v)}
            selectedId={selectedId}
            onSelect={onOpenPage}
            onCreateChild={onCreateChild}
            onDelete={onDelete}
            onRename={onRename}
            onIconChange={onIconChange}
            onToggleFavourite={onToggleFavourite}
          />

          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              setActiveId(null);
              setOverId(null);
            }}
          >
            <FoldersSection
              folders={folders}
              pages={pages}
              expanded={expanded}
              selectedId={selectedId}
              activeId={activeId}
              overId={overId}
              collapsed={foldersCollapsed}
              onToggleCollapsed={() => setFoldersCollapsed((v) => !v)}
              onCreateFolder={() => void createFolder()}
              onToggleExpand={onToggleExpand}
              onSelect={onOpenPage}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
              onRename={onRename}
              onIconChange={onIconChange}
              onToggleFavourite={onToggleFavourite}
            />

            <PagesSection
              pages={pages}
              expanded={expanded}
              selectedId={selectedId}
              activeId={activeId}
              overId={overId}
              collapsed={pagesCollapsed}
              onToggleCollapsed={() => setPagesCollapsed((v) => !v)}
              onToggleExpand={onToggleExpand}
              onSelect={onOpenPage}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
              onRename={onRename}
              onIconChange={onIconChange}
              onToggleFavourite={onToggleFavourite}
            />

            <DragOverlay>
              {activePage ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-popover px-2 py-1 text-sm shadow-lg">
                  <span>{activePage.icon ?? "📄"}</span>
                  <span>{activePage.title || "Untitled"}</span>
                </div>
              ) : activeFolder ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-popover px-2 py-1 text-sm font-medium shadow-lg">
                  <span>📁</span>
                  <span>{activeFolder.name}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        <div className="border-t border-border px-2 py-2">
          <SyncStatusIndicator />
          <button
            type="button"
            onClick={() => setTrashOpen(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">Trash</span>
            {trashCount > 0 && <span className="text-xs">{trashCount}</span>}
          </button>
        </div>
      </div>

      {open && (
        <div
          onMouseDown={handleResizeStart}
          title="Drag to resize"
          className="absolute top-0 right-0 z-30 h-full w-1.5 cursor-col-resize select-none hover:bg-ring/40 active:bg-ring/60"
        />
      )}
    </aside>

    {trashOpen && <TrashDialog onClose={() => setTrashOpen(false)} />}

    {importProgress && (
      <ImportProgressDialog
        processed={importProgress.processed}
        total={importProgress.total}
        currentPath={importProgress.currentPath}
        summary={importSummary}
        onClose={closeImportDialog}
      />
    )}
    </FileDropZone>
  );
}
