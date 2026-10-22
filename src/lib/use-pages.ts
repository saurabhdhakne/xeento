import { useLiveQuery } from "dexie-react-hooks";
import { db, type PageRecord } from "./db";

export function useAllPages(): PageRecord[] | undefined {
  return useLiveQuery(() => db.pages.toArray(), []);
}

export function usePage(id: string | null): PageRecord | undefined {
  return useLiveQuery(() => (id ? db.pages.get(id) : undefined), [id]);
}
