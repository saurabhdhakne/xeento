"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PageRecord } from "@/lib/records";
import { duplicatePage, reorderFavourites } from "@/lib/pages";
import { PageTreeRow } from "./page-tree-row";
import { SectionHeader } from "./section-header";

interface FavouritesSectionProps {
  pages: PageRecord[];
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

export function FavouritesSection({
  pages,
  collapsed,
  onToggleCollapsed,
  selectedId,
  onSelect,
  onCreateChild,
  onDelete,
  onRename,
  onIconChange,
  onToggleFavourite,
}: FavouritesSectionProps) {
  const favourites = pages
    .filter((p) => p.favourite)
    .sort((a, b) => (a.favouriteOrder ?? 0) - (b.favouriteOrder ?? 0));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = favourites.map((p) => p.id);
    const fromIndex = ids.indexOf(String(active.id));
    const toIndex = ids.indexOf(String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;
    void reorderFavourites(arrayMove(ids, fromIndex, toIndex));
  }

  return (
    <div>
      <SectionHeader label="Favourites" collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      {!collapsed && (
        <div className="px-2">
          {favourites.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted">No favourites yet</p>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext items={favourites.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {favourites.map((page) => (
                  <FavouriteRow
                    key={page.id}
                    page={page}
                    isSelected={selectedId === page.id}
                    onSelect={() => onSelect(page.id)}
                    onCreateChild={() => onCreateChild(page.id)}
                    onDelete={() => onDelete(page.id)}
                    onRename={(title) => onRename(page.id, title)}
                    onIconChange={(icon) => onIconChange(page.id, icon)}
                    onToggleFavourite={() => onToggleFavourite(page.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  );
}

function FavouriteRow({
  page,
  isSelected,
  onSelect,
  onCreateChild,
  onDelete,
  onRename,
  onIconChange,
  onToggleFavourite,
}: {
  page: PageRecord;
  isSelected: boolean;
  onSelect: () => void;
  onCreateChild: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onIconChange: (icon: string | null) => void;
  onToggleFavourite: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });

  return (
    <PageTreeRow
      title={page.title}
      icon={page.icon}
      depth={0}
      hasChildren={false}
      expanded={false}
      isSelected={isSelected}
      isDropTarget={false}
      isDragging={isDragging}
      favourite={page.favourite}
      rowRef={setNodeRef}
      dragProps={{ attributes, listeners }}
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
      onToggleExpand={() => {}}
      onSelect={onSelect}
      onRename={onRename}
      onIconChange={onIconChange}
      onCreateChild={onCreateChild}
      onDelete={onDelete}
      onToggleFavourite={onToggleFavourite}
      onDuplicate={() => void duplicatePage(page.id)}
    />
  );
}
