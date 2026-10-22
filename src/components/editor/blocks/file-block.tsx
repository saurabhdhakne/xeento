"use client";

import { defaultBlockSpecs } from "@blocknote/core";
import {
  createReactBlockSpec,
  FileBlockWrapper,
  FileNameWithIcon,
  type ReactCustomBlockRenderProps,
} from "@blocknote/react";
import { useFile, parseFileUrl } from "@/lib/use-files";
import { formatBytes } from "@/lib/files";

function FileBlockRender({
  block,
  editor,
}: ReactCustomBlockRenderProps<typeof defaultBlockSpecs.file.config>) {
  const fileId = parseFileUrl(block.props.url);
  const file = useFile(fileId);
  return (
    <FileBlockWrapper block={block} editor={editor}>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <FileNameWithIcon block={block} />
        {file && <span className="shrink-0 text-xs text-muted">{formatBytes(file.size)}</span>}
      </div>
    </FileBlockWrapper>
  );
}

/**
 * Reuses BlockNote's own file-block config, empty-state (Upload/Embed
 * tabs via FileBlockWrapper), icon+name rendering, and selected-state
 * toolbar (rename/caption/replace/delete/download — all already wired to
 * resolveFileUrl) — the only thing added here is a file-size label, since
 * BlockNote's default file block has no size prop to show one.
 */
export const fileBlockSpec = createReactBlockSpec(defaultBlockSpecs.file.config, {
  render: FileBlockRender,
});
