export type DroppableBlockType = "image" | "video" | "audio" | "pdf" | "file";

/** Picks which block type a dropped/uploaded file should become. */
export function blockTypeForFile(file: File): DroppableBlockType {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  return "file";
}
