"use client";

import { useState } from "react";
import { ChevronDown, Tag as TagIcon } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import type { CustomRange, DateFilter } from "@/lib/recency";

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

function dateFilterLabel(filter: DateFilter) {
  return DATE_OPTIONS.find((o) => o.value === filter)?.label ?? "Any time";
}

function toInputDate(ts: number | null): string {
  if (ts === null) return "";
  return new Date(ts).toISOString().slice(0, 10);
}

function fromInputDate(value: string): number | null {
  if (!value) return null;
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface SearchFiltersProps {
  dateFilter: DateFilter;
  customRange: CustomRange;
  onDateFilterChange: (filter: DateFilter, customRange?: CustomRange) => void;
  allTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  titleOnly: boolean;
  onToggleTitleOnly: () => void;
}

export function SearchFilters({
  dateFilter,
  customRange,
  onDateFilterChange,
  allTags,
  selectedTags,
  onToggleTag,
  titleOnly,
  onToggleTitleOnly,
}: SearchFiltersProps) {
  const [fromDraft, setFromDraft] = useState(toInputDate(customRange.from));
  const [toDraft, setToDraft] = useState(toInputDate(customRange.to));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-sm">
      <Popover
        trigger={({ onClick }) => (
          <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted hover:text-foreground"
          >
            {dateFilterLabel(dateFilter)}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      >
        {(close) => (
          <div className="w-52 rounded-lg border border-border bg-popover p-1 shadow-lg">
            {DATE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  if (option.value !== "custom") {
                    onDateFilterChange(option.value);
                    close();
                  } else {
                    onDateFilterChange("custom", customRange);
                  }
                }}
                className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/8 ${
                  dateFilter === option.value ? "text-accent" : "text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
            {dateFilter === "custom" && (
              <div className="mt-1 space-y-1.5 border-t border-border p-2">
                <input
                  type="date"
                  value={fromDraft}
                  onChange={(e) => setFromDraft(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                />
                <input
                  type="date"
                  value={toDraft}
                  onChange={(e) => setToDraft(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    onDateFilterChange("custom", {
                      from: fromInputDate(fromDraft),
                      to: fromInputDate(toDraft),
                    });
                    close();
                  }}
                  className="w-full rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground hover:opacity-90"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        )}
      </Popover>

      <Popover
        trigger={({ onClick }) => (
          <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted hover:text-foreground"
          >
            <TagIcon className="h-3.5 w-3.5" />
            {selectedTags.length > 0 ? `Tags (${selectedTags.length})` : "Tags"}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      >
        {() =>
          allTags.length === 0 ? (
            <div className="w-44 rounded-lg border border-border bg-popover p-3 text-xs text-muted shadow-lg">
              No tags yet
            </div>
          ) : (
            <div className="max-h-56 w-44 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onToggleTag(tag)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/8"
                >
                  <span className="truncate">{tag}</span>
                  {selectedTags.includes(tag) && <span className="text-accent">✓</span>}
                </button>
              ))}
            </div>
          )
        }
      </Popover>

      <button
        type="button"
        onClick={onToggleTitleOnly}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted hover:text-foreground"
      >
        <span
          className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
            titleOnly ? "bg-accent" : "bg-black/15 dark:bg-white/15"
          }`}
        >
          <span
            className={`h-3 w-3 rounded-full bg-white transition-transform ${
              titleOnly ? "translate-x-3" : "translate-x-0"
            }`}
          />
        </span>
        Title only
      </button>
    </div>
  );
}
