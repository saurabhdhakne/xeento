# Xeento — Roadmap

Xeento is free and open source (MIT). It works fully **local** (on one
device) with no setup. To sync across devices, a user connects their own
**Firebase** project (sign-in + database) and their own **Google Drive**
(files). The project never runs a server that stores anyone's data, and
nothing personal is shared with the project. The one server the project
runs is the optional link-preview fetcher on the hosted version: it sees
the URLs users paste (not their notes), stores nothing, and can be turned
off.

Work through the phases in order. Each phase must leave the app working
(`npm run lint`, `npm run build`, FEATURES.md smoke test). Start each phase
in Claude Code plan mode (see "Starting a phase" at the bottom). Tick a
phase's `[ ]` to `[x]` when its "Done when" passes.

---

## Decisions

| Decision | Choice |
|---|---|
| License | **MIT** |
| Modes | **Local** (default, today's behavior, no account) or **Sync** (user's own Firebase + Google Drive). Local works exactly as it does now |
| Local store | **Dexie (IndexedDB) is the only local store, in every mode.** The UI keeps reading it through the `use-*.ts` hooks. Sync copies changes between Dexie and the user's backend; it never replaces Dexie. Local mode = no sync adapter |
| Sign-in + database (Sync mode) | The user's own **Firebase** project (Auth + Firestore) on the free Spark plan |
| File storage | The user's own **Google Drive**, `drive.file` scope (Xeento sees only files it created). Dexie's `files` table stays as the local cache |
| Not used for now | Firebase Storage (needs the Blaze plan + card). Supabase (moved to Later; free projects pause after 7 days of inactivity) |
| Where integrations run | **On the user's device**, behind adapters. Never in Next.js route handlers |
| Server routes | Optional extras only (link preview). The app must work as a static export |
| Link preview | Optional. A device setting turns it off; with no preview URL configured (static builds), it's off and hidden |
| Page content | **Yjs** documents (BlockNote's built-in collaboration support), so edits from several devices merge instead of overwriting. Yjs state lives in a **Dexie table**, not `y-indexeddb`, so backup, Trash, file cleanup and per-account databases keep working. `content` JSON stays as a snapshot derived from the Yjs state, for search, export, backlinks and Trash |
| Other data (tree, titles, tags, favourites) | Plain Firestore documents, last write wins by `updatedAt` |
| Deletions | **Tombstones** (`deleted: true` + timestamp), never silent removal, so other devices learn about them |
| Sync cursor | A separate `syncedAt` field set by Firestore's `serverTimestamp()`. Device clocks can be wrong, so `updatedAt` is only used for last-write-wins, never as the cursor |
| Device-only data (never synced) | `lastOpenedAt` (syncing it costs a write per page open), folder `collapsed`, selected page, sidebar width/collapse, link-preview setting, AI keys |
| Offline | Dexie plus a queue of pending changes. **Firestore's own offline cache is off**, so there's one offline layer, not two |
| Credentials | Firebase web config (not secret) and tokens stored only on the device. Never a service-account key or a password for Google |
| Desktop / mobile | PWA → **Tauri v2** (desktop and mobile), all from the static export |
| Tests | No general test framework. One approved exception for Phase 4: Firestore rules tests with the Firebase emulator (`firebase-tools`, MIT) and `@firebase/rules-unit-testing` (Apache-2.0), as dev dependencies |

### Firestore limits to design around (Spark plan)

- **1GiB stored, 50,000 reads/day, 20,000 writes/day, 20,000
  deletes/day.**
  - Pull only what changed since the last sync (`syncedAt > cursor`),
    never all pages on every start.
  - Batch content pushes (every few seconds while typing), not one write
    per keystroke.
  - Yjs compaction deletes the updates it replaces; those count toward
    the 20,000 deletes. Compact in batches, not after every update.
- **1MB per document.** Store each page's Yjs updates as separate small
  documents and compact them into a snapshot periodically. A huge page's
  snapshot may need splitting into chunks. Trash entries hold page
  metadata, not content.
- **No full-text search.** Search stays on the device, as today.
- Spark projects don't pause from inactivity.

### Two separate Google sign-ins

1. **Xeento sign-in** = Firebase Auth in the user's own project. Default:
   **email + password** (works the same on web, desktop and mobile, no
   extra setup). Google sign-in via Firebase is optional and requires the
   user to add Xeento's domain to their project's authorized domains.
2. **Connect Google Drive** = Xeento's official Google OAuth client
   (Google Identity Services), used only for file storage.

### Multiple users

- **One Firebase project can have many users** (a family, a team, a
  class). Each signs in with their own email + password and sees only
  their own notes: all data lives under `users/{uid}/…`, enforced by the
  Firestore rules, not just by the app.
- **The project owner controls who can join.** Firebase Auth's "allow
  sign-up" setting: on = anyone with the project config can create an
  account; off = the owner adds users in the Firebase console. Setup and
  `docs/setup/firebase.md` explain both.
- **Each user connects their own Google Drive.** Files go to that user's
  Drive, linked to their Xeento account.
- **Several accounts on one device** (shared computer): a separate Dexie
  database per account (`xeento-<uid>`). Local mode keeps today's `xeento`
  database, so existing users lose nothing. Signing out never shows the
  previous user's notes to the next one. Sign-out offers "keep offline
  copy on this device" or "remove from this device" (deletes that
  account's database).
- **Not in this milestone:** sharing pages between users or editing
  together. Data model choices now should not block it later (see Later).

---

## Setup flow (first launch)

1. **Welcome:** a one-screen explanation: "Your notes live on your device
   or in your own accounts. Xeento never sees or stores your notes." On
   the hosted version, add: "Link previews are fetched by Xeento's preview
   server, which sees the links you paste (never your notes) and doesn't
   store them. You can turn link previews off in Settings." Two choices:
   **Use on this device** (Local mode, done, no more steps) or **Sync
   across devices** (continue). Sync can also be turned on later from
   Settings.
2. **Create your Firebase project:** a link to the step-by-step guide in
   `docs/setup/firebase.md` (create project → add web app → enable
   Email/Password sign-in → create Firestore database).
3. **Paste config:** the Firebase web app config object. Validate the
   format, then **Test connection**.
4. **Add security rules:** a button copies `firebase/firestore.rules`; the
   user pastes them in the Firebase console. The app does a test write/read
   and checks a `meta/schema` version document, blocking until it matches.
5. **Create account / sign in:** email + password in *their own* project.
6. **Connect Google Drive:** Google's own sign-in page; Xeento creates a
   `Xeento` folder in the user's Drive.
7. **Bring existing notes:** if the Local database has pages, offer to
   copy them into this account's database and upload them. Show progress
   and a summary, like the import dialog.
8. **Done:** the sidebar shows a sync status indicator.

Later: **Settings → Account & sync** shows the mode, Firebase project,
Drive connection, sync status and last sync time, with Turn on sync,
Disconnect (back to Local, keeping a local copy), Reconnect Drive and
Export all. Config and tokens are stored locally; signing out clears them.

---

## Phases

### [x] Phase 0 — Prepare the project

- Update CLAUDE.md: replace "Dexie is a placeholder; Supabase sync will
  replace it" with the design above (Dexie stays the local store; sync
  adapters replicate it), and add the rule: *"Integrations run
  client-side behind adapters. Route handlers are only for optional
  extras; the app must still work as a static export."*
- Add `LICENSE` (MIT) and `CONTRIBUTING.md`; update the existing README
  with setup instructions.
- GitHub Actions: run `lint` and `build` on every pull request.
- Static export (`output: 'export'`):
  - A dynamic route handler fails an export build, so link preview needs
    a **build-time switch**: the export build leaves out
    `/api/link-preview`, and the client reads the preview URL from config
    (e.g. a `NEXT_PUBLIC_` variable). Check Next 16's static-export docs
    in `node_modules/next/dist/docs/` for the supported way.
  - Check `cacheComponents` and `partialPrefetching` in `next.config.ts`
    work with export; drop them from the export build if not.
  - The pdf.js worker is loaded from the absolute path
    `/pdf.worker.min.mjs` (`src/lib/pdf.ts`); it must also work under a
    `basePath` (GitHub Pages serves from `/<repo>/`).
- **Settings → "Link previews" toggle** (device-only, on by default).
  When off, or when no preview URL is configured, nothing is sent to the
  preview server: the "Paste as" menu (ED-08) hides Mention and Bookmark,
  and `/bookmark` is hidden. Existing mentions and bookmarks keep their
  stored title and image. New FEATURES.md entry (ST-02).

**Done when:** static export builds and runs; link preview works on the
`next build` version and hides cleanly in the static version and when
turned off; the PDF viewer works under a `basePath`.

### [x] Phase 1 — Adapter interfaces (no behavior change)

- Move `PageRecord`, `FolderRecord`, `FileRecord`, `TrashRecord` and
  `ROOT_ID` out of `db.ts` into a module with no Dexie import. Today 12
  components and the import/export code import them from `@/lib/db`.
- Open the Dexie database on demand instead of the module-level
  `new Dexie("xeento")` singleton, so Phase 4 can open one per account.
  Local mode keeps the name `xeento`.
- Define three interfaces in `src/lib/backend/`:
  - `AuthProvider`: sign up, sign in, sign out, current user, session
    changes.
  - `SyncAdapter`: push a batch of pending changes (pages, folders, trash,
    file metadata, Yjs updates); pull changes since a cursor; subscribe to
    remote changes. Results are written into Dexie, and the UI picks them
    up through the existing hooks.
  - `FileStorageAdapter`: upload, download, delete remote copies by file
    id. Dexie's `files` table stays the local cache.
- Local mode has no `SyncAdapter` and no `FileStorageAdapter`; its
  behavior is exactly today's.
- Keep the interfaces backend-neutral so a Supabase adapter can be added
  later without changing them.

**Done when:** the full FEATURES.md regression passes with zero visible
change. No component imports a backend SDK or Dexie directly.

### [x] Phase 2 — Yjs page content (still local)

- BlockNote's collaboration mode with a Yjs document per page. Yjs
  updates are stored in a new Dexie table (new schema version in `db.ts`),
  not `y-indexeddb`.
- `content` JSON stays on `PageRecord`, refreshed from the Yjs document
  on the autosave debounce, so search, backlinks, export, Trash and file
  cleanup keep reading it.
- One-time migration: existing `content` JSON → Yjs document.
- Duplicate, page copy/paste and import create Yjs documents for the
  pages they make. Trash keeps a page's Yjs state until Delete forever.
- Backup/restore includes the Yjs state; older backups (no Yjs state)
  still restore by migrating their `content`.

**Done when:** existing pages open unchanged after migration; search
(SR-01), backlinks (PG-06), duplicate and paste (SB-06, PG-05), Markdown
and PDF export (IO-01–IO-03), import (IO-04, IO-05), Trash (DS-02), file
cleanup (DS-03) and backup/restore (DS-04) still pass their FEATURES.md
tests.

### [x] Phase 3 — Setup wizard (UI)

*Merged into Phase 4 (decided while planning it): the wizard was built
directly on Firebase and tested against the Firebase emulators instead of
a mock adapter. `docs/setup/firebase.md` has screenshot placeholders still
to fill.*

- Build the setup flow screens (including the Welcome text about link
  previews) and Settings → Account & sync, with config validation,
  against a mock adapter.
- Write `docs/setup/firebase.md` (with screenshots) and
  `firebase/firestore.rules`.

**Done when:** every wizard path (valid/invalid config, failed rules
check, back/cancel, skip existing-notes upload) can be walked through with
the mock.

### [x] Phase 4 — Firebase backend

- Firebase Auth (email + password) through the user's own project.
- Firestore data under `users/{uid}/…`: pages, folders, trash entries,
  file metadata, page Yjs updates, `meta/schema`. Rules restrict each user
  to their own `uid`.
- Pending-change queue: a new Dexie table, written by `pages.ts`,
  `folders.ts`, `trash.ts` and `files.ts` alongside each change.
- Sync: push the queue (batched), pull changes where `syncedAt > cursor`,
  on start, on window focus and via Firestore live listeners. Deletions
  are tombstones. Device-only fields (see Decisions) are never pushed.
  Firestore's offline cache stays off.
- Trash: trashing tombstones the pages and writes a trash entry
  (metadata only). Delete forever and the 30-day purge remove the pages'
  Yjs documents too.
- File cleanup (`deleteUnusedFiles`) also deletes the Drive copy, and
  only runs when the queue is empty and a pull has finished, so a file
  another device still references isn't removed.
- Yjs: store updates as small documents, merge on read, compact
  periodically within the delete quota; keep every document under 1MB.
- Clear errors for a wrong config, missing rules, outdated schema version
  and hitting the daily quota.
- Multiple users (see "Multiple users"): per-`uid` Dexie databases,
  account switching, sign-out with keep/remove local copy, and an
  "account already exists / sign-up disabled" message.
- Rules tests: add `firebase-tools` and `@firebase/rules-unit-testing` as
  dev dependencies and an `npm run test:rules` script that runs the tests
  inside `firebase emulators:exec --only firestore`. The Firestore
  emulator needs a Java runtime (check `firebase-tools` docs for the
  version). Add the command and its prerequisites to CLAUDE.md's Commands
  section.

**Done when:** two browsers signed in to the same project as the same user
see each other's changes, including deletes; editing the same page offline
in both and reconnecting keeps both edits; a normal day of use stays well
under the daily read/write/delete limits. And: `npm run test:rules` proves
user B in the same project can't read or write user A's data; signing out
of A and into B on one browser shows only B's notes.

### [ ] Phase 5 — Google Drive storage

- Google Drive adapter: Google Identity Services, `drive.file` scope, files
  in a `Xeento` folder. On the web, tokens are short-lived; handle quiet
  re-approval when one expires.
- File blocks keep `xeento-file://<id>` URLs. The resolver reads Dexie's
  `files` cache first and downloads through the adapter on a miss.
- Register the official Google OAuth client for the hosted domain and
  complete Google's basic verification. Document how self-hosters create
  their own client ID.

**Done when:** uploading on one device shows the file on another; the
25MB/100MB limits still apply; disconnecting and reconnecting Drive keeps
existing files working.

### [ ] Phase 6 — Data portability

- Upload existing local notes during setup (wizard step 7).
- "Export all" is the full backup (DS-04, lossless, includes Yjs state)
  and always works, even offline, so users are never locked in. Markdown
  export (IO-03) stays for reading notes elsewhere.
- Moving to a different Firebase project: Export all → set up new project
  → Restore.

**Done when:** a user can move to a new Firebase project without losing
pages, files, Trash or history.

### [ ] Phase 7 — Hosting

- Official hosted version: Vercel (full `next build`, with link preview).
- Static version on Cloudflare Pages or GitHub Pages, as a fallback and
  for self-hosters (no link preview unless they configure their own).
- Self-hosting guide in the README.

### [ ] Phase 8 — Databases feature

- Design first: database as a page type with properties, rows and views
  (table first, then board and calendar). Fit it to Firestore's document
  model and limits before writing code.
- Convert Notion CSV imports into real databases (replacing the TODO note).

### [ ] Phase 9 — Apps

- **PWA:** installable on desktop and Android, with offline support.
- **Tauri v2 desktop:** loads the static export. Google Drive sign-in
  through the system browser with a loopback redirect (desktop OAuth
  client, PKCE).
- **Tauri v2 mobile (iOS, Android):** iOS can wipe webview storage, so the
  local store needs to move to SQLite. Design question for this phase:
  how to keep the `use-*.ts` live-query hooks working over SQLite. Deep-link
  sign-in.
- Budget: Apple Developer $99/year, Google Play $25 one-time, and code
  signing for desktop installers.

### [ ] Phase 10 — AI (bring your own key)

- One provider interface; keys stored only on the device and never synced.
- Call providers directly from the app where they allow it.

### Later

- **Supabase backend** as an alternative to Firebase (same adapter
  interfaces; handle the paused-project case).
- **Firebase Storage** as an alternative to Drive, for users on Blaze.
- **Sharing and collaboration** between users of the same project: share a
  page (view/edit), live co-editing via Yjs. Needs a decision on files:
  attachments in one user's Drive aren't readable by another under the
  `drive.file` scope.
- Optional end-to-end encryption (passphrase; warn that losing it means
  losing data).
- Richer HTML paste (formatting and structure from web pages and other
  apps).
- Community adapters: Dropbox, OneDrive, WebDAV/Nextcloud, local folder
  for desktop.

---

## Starting a phase

Paste this into Claude Code, in plan mode, replacing `N`:

```
Read ROADMAP.md and start Phase N. Read CLAUDE.md's rules first.

Before writing any code:
1. List the files you'll create or change and why.
2. List new dependencies with their licenses and ask me to approve them.
3. Write the FEATURES.md test steps that will prove this phase is done.
4. Flag anything in ROADMAP.md that conflicts with the current code.

Wait for my approval, then implement. At the end, run lint and build,
update FEATURES.md and CLAUDE.md, and tick off the phase in ROADMAP.md
(change its [ ] to [x]).
```
