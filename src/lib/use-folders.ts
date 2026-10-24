import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "./db";
import type { FolderRecord } from "./records";

export function useAllFolders(): FolderRecord[] | undefined {
  return useLiveQuery(() => getDb().folders.toArray(), []);
}
