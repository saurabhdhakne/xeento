import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "./db";
import type { PageRecord } from "./records";

export function useAllPages(): PageRecord[] | undefined {
  return useLiveQuery(() => getDb().pages.toArray(), []);
}

export function usePage(id: string | null): PageRecord | undefined {
  return useLiveQuery(() => (id ? getDb().pages.get(id) : undefined), [id]);
}

/** Number of stored Yjs updates for a page (0 while an account's page is still syncing in). */
export function usePageUpdateCount(id: string): number | undefined {
  return useLiveQuery(() => getDb().pageUpdates.where("pageId").equals(id).count(), [id]);
}

/** Like usePage, but `null` once the lookup finds no page (deleted or in Trash); `undefined` only while loading. */
export function usePageOrNull(id: string): PageRecord | null | undefined {
  return useLiveQuery(async () => (await getDb().pages.get(id)) ?? null, [id]);
}
