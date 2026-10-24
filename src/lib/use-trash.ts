import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "./db";
import type { TrashRecord } from "./records";

/** Newest deletions first. */
export function useTrash(): TrashRecord[] | undefined {
  return useLiveQuery(() => getDb().trash.orderBy("deletedAt").reverse().toArray(), []);
}
