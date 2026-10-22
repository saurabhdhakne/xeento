"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { FileText, X } from "lucide-react";
import { Popover } from "./ui/popover";
import { Theme as EmojiTheme } from "emoji-picker-react";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface IconPickerProps {
  icon: string | null;
  onChange: (icon: string | null) => void;
  size?: "sm" | "lg";
}

export function IconPicker({ icon, onChange, size = "sm" }: IconPickerProps) {
  const { resolvedTheme } = useTheme();
  const dimension = size === "lg" ? "h-16 w-16 text-4xl" : "h-6 w-6 text-base";

  return (
    <Popover
      trigger={({ onClick }) => (
        <button
          type="button"
          onClick={onClick}
          title="Change icon"
          className={`flex items-center justify-center rounded-md ${dimension} shrink-0 text-muted hover:bg-black/5 dark:hover:bg-white/10 transition-colors`}
        >
          {icon ? (
            <span className={size === "lg" ? "text-4xl leading-none" : "text-base leading-none"}>
              {icon}
            </span>
          ) : (
            <FileText className={size === "lg" ? "h-7 w-7" : "h-4 w-4"} strokeWidth={1.75} />
          )}
        </button>
      )}
    >
      {(close) => (
        <div className="rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
          <EmojiPicker
            theme={resolvedTheme === "dark" ? EmojiTheme.DARK : EmojiTheme.LIGHT}
            onEmojiClick={(data) => {
              onChange(data.emoji);
              close();
            }}
            width={300}
            height={360}
            searchDisabled={false}
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
          />
          {icon && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                close();
              }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-sm text-muted hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5" />
              Remove icon
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}
