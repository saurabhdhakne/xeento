"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/sidebar/sidebar";
import { PageView } from "@/components/page-view";
import { EmptyState } from "@/components/empty-state";
import { CommandPalette } from "@/components/search/command-palette";
import { MoveToDialog } from "@/components/move-to-dialog";
import { ROOT_ID } from "@/lib/records";
import { useAllPages } from "@/lib/use-pages";
import { useAllFolders } from "@/lib/use-folders";
import { useLocalStorageFlag } from "@/lib/use-local-storage-flag";
import { setFolderCollapsed } from "@/lib/folders";
import {
  createPage,
  duplicatePage,
  getDescendantIds,
  renamePage,
  setPageIcon,
  toggleFavourite,
  touchLastOpened,
} from "@/lib/pages";
import { purgeExpiredTrash, trashPage } from "@/lib/trash";
import { deleteUnusedFiles } from "@/lib/files";
import { toast } from "@/components/ui/toast";
import { PanelLeftOpen } from "lucide-react";

const STORAGE_KEY = "xeento:last-page-id";

export function AppShell() {
  const pages = useAllPages();
  const folders = useAllFolders();
  const loading = pages === undefined || folders === undefined;
  const allPages = useMemo(() => pages ?? [], [pages]);
  const allFolders = useMemo(() => folders ?? [], [folders]);
  const pagesById = useMemo(() => new Map(allPages.map((p) => [p.id, p])), [allPages]);
  const foldersById = useMemo(() => new Map(allFolders.map((f) => [f.id, f])), [allFolders]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useLocalStorageFlag("xeento:sidebar-open", true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  // Recent's order+membership snapshot, taken once per load (see below) —
  // kept out of the live-reactive render path on purpose so opening pages
  // during a session doesn't reshuffle the Recent list underneath the user.
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const didInitSelection = useRef(false);

  // Pick an initial page once the IndexedDB load resolves: whichever page
  // was open last time (if it still exists), otherwise the first root page.
  // Deliberately a bare setSelectedId, not openPage() — restoring on reload
  // isn't a user navigation event, so it shouldn't touch lastOpenedAt.
  //
  // Also snapshot Recent's order here, once, from the same freshly-loaded
  // data: lastOpenedAt bookkeeping still happens live as the user navigates
  // (openPage below), but the sidebar's Recent list itself only re-reads it
  // on this load effect — i.e. on refresh/restart — so the page that was
  // open last (and is therefore the most-recently-touched one) reliably
  // lands first, and doesn't get visibly bumped around mid-session.
  useEffect(() => {
    if (didInitSelection.current || loading) return;
    didInitSelection.current = true;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const storedExists = stored !== null && allPages.some((p) => p.id === stored);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time selection derived from the async IndexedDB load */
    if (storedExists) {
      setSelectedId(stored);
    } else {
      const firstRoot = allPages
        .filter((p) => p.parentId === ROOT_ID)
        .sort((a, b) => a.order - b.order)[0];
      setSelectedId(firstRoot ? firstRoot.id : null);
    }
    setRecentIds(
      allPages
        .filter((p) => p.lastOpenedAt !== null)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
        .map((p) => p.id),
    );
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loading, allPages]);

  // Once per load: ask the browser not to evict our IndexedDB data when
  // disk runs low, drop Trash entries past 30 days, then delete stored
  // files that nothing references any more.
  useEffect(() => {
    void navigator.storage?.persist?.();
    void purgeExpiredTrash().then(deleteUnusedFiles);
  }, []);

  useEffect(() => {
    if (selectedId) {
      window.localStorage.setItem(STORAGE_KEY, selectedId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [selectedId]);

  // Keep the selected page visible in the tree regardless of how it was
  // selected: expand nested-page ancestors, and open its containing folder
  // if collapsed. This is separate from openPage()'s lastOpenedAt bookkeeping
  // on purpose — visibility should always follow selection, including the
  // initial restore-on-reload, but "last opened" should only reflect real clicks.
  useEffect(() => {
    if (!selectedId) return;
    const page = pagesById.get(selectedId);
    if (page?.folderId) {
      const folder = foldersById.get(page.folderId);
      if (folder?.collapsed) void setFolderCollapsed(folder.id, false);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from pagesById, which only changes when the page list itself changes
    setExpanded((prev) => {
      const toAdd: string[] = [];
      let current = page;
      while (current && current.parentId !== ROOT_ID) {
        if (!prev.has(current.parentId)) toAdd.push(current.parentId);
        current = pagesById.get(current.parentId);
      }
      if (toAdd.length === 0) return prev;
      const next = new Set(prev);
      toAdd.forEach((id) => next.add(id));
      return next;
    });
  }, [selectedId, pagesById, foldersById]);

  // Global shortcuts: Cmd/Ctrl+K for search, Cmd/Ctrl+\ for the sidebar,
  // Cmd/Ctrl+Shift+M to move the open page.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setMoveOpen(true);
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (e.key === "\\") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setSidebarOpen]);

  // Always holds the latest openPage (synced every render, not read during
  // render) so the click listener below — set up once — never calls a
  // stale closure once allPages has changed since mount.
  const openPageRef = useRef(openPage);
  useEffect(() => {
    openPageRef.current = openPage;
  });

  // Page copy/paste: Cmd+C / Cmd+V on macOS, Ctrl+C / Ctrl+V elsewhere.
  // Only when nothing is being typed or text-selected — inside the editor,
  // an input, or with a text selection, the keys keep their normal
  // clipboard meaning. Copy remembers the open page (an in-app clipboard,
  // not the system one); paste duplicates it, with its sub-pages, right
  // after whichever page is open at that point, then opens the copy.
  const copiedPageIdRef = useRef<string | null>(null);
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    function onKeyDown(e: KeyboardEvent) {
      if (!(isMac ? e.metaKey : e.ctrlKey) || e.shiftKey || e.altKey || e.repeat) return;
      const key = e.key.toLowerCase();
      if (key !== "c" && key !== "v") return;
      if (isTypingContext()) return;

      if (key === "c") {
        if (!selectedId) return;
        e.preventDefault();
        copiedPageIdRef.current = selectedId;
        toast.info(`Page copied — press ${isMac ? "⌘V" : "Ctrl+V"} to paste a copy`);
        return;
      }

      const sourceId = copiedPageIdRef.current;
      if (!sourceId) return;
      e.preventDefault();
      void duplicatePage(sourceId, selectedId ?? sourceId).then((copy) => {
        if (copy) openPageRef.current(copy.id);
        else toast.error("The copied page no longer exists");
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  // Intercepts clicks on internal page links (created by Notion import,
  // rewriting cross-page markdown links to `xeento-page://<id>` hrefs —
  // a normal BlockNote link mark, just with a scheme no browser can
  // navigate to on its own) and routes them through openPage instead.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement)?.closest?.("a[href^='xeento-page://']");
      if (!anchor) return;
      e.preventDefault();
      const id = anchor.getAttribute("href")?.slice("xeento-page://".length);
      if (id) openPageRef.current(id);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  function handleToggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** The one path for genuine user-initiated page selection (sidebar/search/recent/favourites clicks). */
  function openPage(id: string) {
    setSelectedId(id);
    const mostRecentId = allPages.reduce<{ id: string; ts: number } | null>((best, p) => {
      if (p.lastOpenedAt === null) return best;
      if (!best || p.lastOpenedAt > best.ts) return { id: p.id, ts: p.lastOpenedAt };
      return best;
    }, null)?.id;
    if (mostRecentId !== id) void touchLastOpened(id);
  }

  async function handleCreateRoot() {
    const page = await createPage(ROOT_ID);
    openPage(page.id);
  }

  async function handleCreateChild(parentId: string) {
    const page = await createPage(parentId);
    setExpanded((prev) => new Set(prev).add(parentId));
    openPage(page.id);
  }

  async function handleDelete(id: string) {
    const target = pagesById.get(id);
    const descendants = await getDescendantIds(id);
    const deletedIds = new Set([id, ...descendants]);
    await trashPage(id);
    toast.info("Moved to Trash");

    if (selectedId && deletedIds.has(selectedId)) {
      const fallback = target && target.parentId !== ROOT_ID ? target.parentId : null;
      setSelectedId(fallback);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background print:h-auto print:overflow-visible">
      <Sidebar
        pages={allPages}
        folders={allFolders}
        selectedId={selectedId}
        expanded={expanded}
        open={sidebarOpen}
        onToggleOpen={() => setSidebarOpen((v) => !v)}
        onToggleExpand={handleToggleExpand}
        onOpenPage={openPage}
        recentIds={recentIds}
        onCreateRoot={handleCreateRoot}
        onCreateChild={handleCreateChild}
        onDelete={handleDelete}
        onRename={(id, title) => void renamePage(id, title)}
        onIconChange={(id, icon) => void setPageIcon(id, icon)}
        onToggleFavourite={(id) => void toggleFavourite(id)}
        onOpenSearch={() => setSearchOpen(true)}
      />
      <main className="relative flex-1 overflow-y-auto print:h-auto print:overflow-visible">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            title="Open sidebar"
            className="fixed top-4 left-3 z-30 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-popover text-muted shadow-sm hover:text-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
        {loading ? null : selectedId ? (
          <PageView key={selectedId} pageId={selectedId} onMoveTo={() => setMoveOpen(true)} />
        ) : (
          <EmptyState onCreate={handleCreateRoot} />
        )}
      </main>
      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        pages={allPages}
        folders={allFolders}
        onOpenPage={openPage}
      />
      {moveOpen && selectedId && (
        <MoveToDialog
          pageId={selectedId}
          pages={allPages}
          folders={allFolders}
          onClose={() => setMoveOpen(false)}
        />
      )}
    </div>
  );
}

function isTypingContext(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (active && (active.isContentEditable || active.closest("input, textarea, select"))) {
    return true;
  }
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed;
}
