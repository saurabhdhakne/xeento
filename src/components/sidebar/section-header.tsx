"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface SectionHeaderProps {
  label: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  action?: ReactNode;
}

export function SectionHeader({ label, collapsed, onToggleCollapsed, action }: SectionHeaderProps) {
  return (
    <div className="group flex items-center gap-1 px-2 py-1">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex min-w-0 flex-1 items-center gap-1 rounded py-0.5 text-left text-xs font-semibold uppercase tracking-wide text-muted hover:text-foreground"
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform ${collapsed ? "" : "rotate-90"}`}
        />
        <span className="truncate">{label}</span>
      </button>
      {action && (
        <div className="opacity-0 transition-opacity group-hover:opacity-100">{action}</div>
      )}
    </div>
  );
}
