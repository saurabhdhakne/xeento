"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagEditor({ tags, onChange }: TagEditorProps) {
  const [draft, setDraft] = useState("");

  function addTag() {
    const next = draft.trim();
    setDraft("");
    if (!next) return;
    if (tags.some((t) => t.toLowerCase() === next.toLowerCase())) return;
    onChange([...tags, next]);
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="opacity-60 transition-opacity hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag();
          }
        }}
        onBlur={addTag}
        placeholder="Add tag…"
        className="min-w-20 flex-1 bg-transparent px-1 py-0.5 text-xs text-muted outline-none placeholder:text-muted"
      />
    </div>
  );
}
