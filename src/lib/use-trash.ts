import { useLiveQuery } from "dexie-react-hooks";
import { db, type TrashRecord } from "./db";

/** Newest deletions first. */
export function useTrash(): TrashRecord[] | undefined {
  return useLiveQuery(() => db.trash.orderBy("deletedAt").reverse().toArray(), []);
}
