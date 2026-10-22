import { useLiveQuery } from "dexie-react-hooks";
import { db, type FolderRecord } from "./db";

export function useAllFolders(): FolderRecord[] | undefined {
  return useLiveQuery(() => db.folders.toArray(), []);
}
