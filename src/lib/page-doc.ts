import * as Y from "yjs";
import { nanoid } from "nanoid";
import { blocksToYDoc, yDocToBlocks } from "@blocknote/core/yjs";
import { getDb } from "./db";
import type { PageRecord, PageUpdateRecord } from "./records";
import { createHeadlessEditor } from "./export/headless-editor";
import { activeAccountUid } from "./sync-settings";

// A page's content is a Yjs document, stored as update rows in the
// `pageUpdates` table (merged on read). `PageRecord.content` stays as a
// JSON snapshot of it for search, backlinks, export, Trash and file cleanup.
//
// A page's Yjs state is created once, where the page is created (createPage,
// duplicate, import). Pages from before Yjs, and older backups, have none:
// in Local mode it's built from their `content` when first needed. Account
// databases never do that, because two devices building state from the same
// content would duplicate it when merged; they wait for the rows to sync.

/** The Y.XmlFragment the editor binds to. Never rename: stored docs use it. */
const FRAGMENT = "document-store";
/** Opening a page with more rows than this merges them into one. */
const COMPACT_AFTER = 20;

let headless: ReturnType<typeof createHeadlessEditor> | null = null;
function getHeadless() {
  headless ??= createHeadlessEditor();
  return headless;
}

function newRow(pageId: string, update: Uint8Array): PageUpdateRecord {
  return { id: nanoid(), pageId, update, createdAt: Date.now() };
}

/** A fresh Yjs state for `content`, as one row. Synchronous, so it's safe inside a Dexie transaction. */
export function pageDocRowFromContent(pageId: string, content: unknown): PageUpdateRecord {
  const editor = getHeadless();
  const blocks = Array.isArray(content) && content.length > 0 ? content : [{ type: "paragraph" }];
  const doc = blocksToYDoc(editor, blocks as typeof editor.document, FRAGMENT);
  return newRow(pageId, Y.encodeStateAsUpdate(doc));
}

/** The `content` snapshot for a page's merged Yjs updates. */
export function contentFromUpdates(updates: Uint8Array[]): unknown {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.mergeUpdates(updates));
  return yDocToBlocks(getHeadless(), doc, FRAGMENT);
}

/** Drops pages' Yjs state (Delete forever / Trash purge). */
export async function deletePageDocs(pageIds: string[]) {
  await getDb().pageUpdates.where("pageId").anyOf(pageIds).delete();
}

/**
 * Creates Yjs state for every page, in the workspace or Trash, that has
 * none: Local workspaces from before Yjs, and restored older backups.
 */
export async function migrateAllPageDocs() {
  const db = getDb();
  await db.transaction("rw", db.pages, db.trash, db.pageUpdates, async () => {
    const withState = new Set(await db.pageUpdates.orderBy("pageId").uniqueKeys());
    const pages: PageRecord[] = [...(await db.pages.toArray()), ...(await db.trash.toArray()).flatMap((e) => e.pages)];
    const missing = pages.filter((p) => !withState.has(p.id));
    if (missing.length > 0) await db.pageUpdates.bulkAdd(missing.map((p) => pageDocRowFromContent(p.id, p.content)));
  });
}

export interface PageDocSession {
  /** Bind the editor to this (BlockNote collaboration `fragment`). */
  fragment: Y.XmlFragment;
  /**
   * Stores the edits made since the last save plus the matching `content`
   * snapshot. Writes nothing if neither this editor nor a sync changed the
   * document, so opening a page never counts as editing it.
   */
  save(content: unknown): Promise<void>;
  /** Receive remote updates while the editor is mounted. Returns detach. */
  attach(): () => void;
}

const LOADED = Symbol("loaded");
const REMOTE = Symbol("remote");

/** Open editors' documents by page, for applying pulled updates live. */
const attached = new Map<string, Set<(updates: Uint8Array[]) => void>>();

/**
 * Applies pulled updates to the page's open editor, if any. Returns false
 * when it isn't open (the caller then refreshes `content` itself).
 */
export function applyRemoteUpdates(pageId: string, updates: Uint8Array[]): boolean {
  const receivers = attached.get(pageId);
  if (!receivers?.size) return false;
  for (const receive of receivers) receive(updates);
  return true;
}

/**
 * Loads a page's Yjs document for editing. Returns null when an account
 * database has no rows for the page yet (they're still syncing).
 */
export async function openPageDoc(pageId: string): Promise<PageDocSession | null> {
  const db = getDb();
  const inAccount = activeAccountUid() !== null;
  const rows = await db.transaction("rw", db.pages, db.pageUpdates, async () => {
    const existing = await db.pageUpdates.where("pageId").equals(pageId).toArray();
    if (existing.length === 0) {
      const page = await db.pages.get(pageId);
      if (!page || inAccount) return [];
      const row = pageDocRowFromContent(pageId, page.content);
      await db.pageUpdates.add(row);
      return [row];
    }
    if (existing.length > COMPACT_AFTER) {
      const merged = newRow(pageId, Y.mergeUpdates(existing.map((r) => r.update)));
      await db.pageUpdates.bulkDelete(existing.map((r) => r.id));
      await db.pageUpdates.add(merged);
      return [merged];
    }
    return existing;
  });
  if (rows.length === 0 && inAccount) return null;

  const doc = new Y.Doc();
  if (rows.length > 0) Y.applyUpdate(doc, Y.mergeUpdates(rows.map((r) => r.update)), LOADED);
  let pending: Uint8Array[] = [];
  let contentStale = false;
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    // Pulled updates are already stored; they only make `content` stale.
    if (origin === REMOTE) contentStale = true;
    else if (origin !== LOADED) pending.push(update);
  });

  return {
    fragment: doc.getXmlFragment(FRAGMENT),
    async save(content) {
      if (pending.length === 0 && !contentStale) return;
      const update = pending.length > 0 ? Y.mergeUpdates(pending) : null;
      pending = [];
      contentStale = false;
      await db.transaction("rw", db.pages, db.pageUpdates, async () => {
        if (update) await db.pageUpdates.add(newRow(pageId, update));
        await db.pages.update(pageId, { content, updatedAt: Date.now() });
      });
    },
    attach() {
      const receive = (updates: Uint8Array[]) => Y.applyUpdate(doc, Y.mergeUpdates(updates), REMOTE);
      if (!attached.has(pageId)) attached.set(pageId, new Set());
      attached.get(pageId)!.add(receive);
      return () => attached.get(pageId)?.delete(receive);
    },
  };
}
