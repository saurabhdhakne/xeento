"use client";

import { useDroppable } from "@dnd-kit/core";

interface DropSentinelProps {
  id: string;
  data: Record<string, unknown>;
  active: boolean;
  isOver: boolean;
}

/** An "append at the end of this list" drop target, invisible until a drag is in progress. */
export function DropSentinel({ id, data, active, isOver }: DropSentinelProps) {
  const { setNodeRef } = useDroppable({ id, data });
  if (!active) return <div className="h-1" />;
  return (
    <div
      ref={setNodeRef}
      className={`mx-1 h-6 rounded-md border-2 border-dashed transition-colors ${
        isOver ? "border-ring bg-accent-soft" : "border-transparent"
      }`}
    />
  );
}
