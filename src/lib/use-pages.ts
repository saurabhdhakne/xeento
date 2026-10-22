import { useLiveQuery } from "dexie-react-hooks";
import { db, type PageRecord } from "./db";

export function useAllPages(): PageRecord[] | undefined {
  return useLiveQuery(() => db.pages.toArray(), []);
}

export function usePage(id: string | null): PageRecord | undefined {
  return useLiveQuery(() => (id ? db.pages.get(id) : undefined), [id]);
}

/** Like usePage, but `null` once the lookup finds no page (deleted or in Trash); `undefined` only while loading. */
export function usePageOrNull(id: string): PageRecord | null | undefined {
  return useLiveQuery(async () => (await db.pages.get(id)) ?? null, [id]);
}
