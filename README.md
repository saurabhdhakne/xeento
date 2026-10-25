# Xeento

A local-first, block-based notes and docs app. Your notes live on your
device. No account, and no server keeps your data.

[![CI](https://github.com/saurabhdhakne/xeento/actions/workflows/ci.yml/badge.svg)](https://github.com/saurabhdhakne/xeento/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Contents

- [Why Xeento](#why-xeento)
- [Features](#features)
- [Quick start](#quick-start)
- [How to use](#how-to-use)
  - [Local mode](#local-mode-one-device-no-setup)
  - [Sync mode with Firebase](#sync-mode-with-your-own-firebase-project)
  - [Files with Google Drive](#files-with-your-own-google-drive)
- [Privacy: what leaves your device](#privacy-what-leaves-your-device)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Build and deploy](#build-and-deploy)
- [Configuration](#configuration)
- [Development](#development)
- [Documentation](#documentation)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Why Xeento

- **Local-first.** Notes are stored in your browser (IndexedDB) and work
  offline. Out of the box there's nothing to sign up for.
- **Your accounts, not ours.** Sync is optional and runs through your own
  Firebase project and your own Google Drive, on their free plans. Xeento
  never sees your notes.
- **Yours to take with you.** Full lossless backup, Markdown export and
  Notion/Markdown import.
- **Free and open source**, MIT-licensed. Runs as a static site you can
  host anywhere.

## Features

The full list, with test steps for each feature, is in
[FEATURES.md](FEATURES.md). Feature IDs are in brackets.

- **Pages and sidebar:** nested pages, folders, Favourites, Recent,
  drag-and-drop, duplicate, a resizable sidebar you can collapse
  [SB-01–07]. Titles, emoji icons, tags, autosave, Move to…, copy and
  paste a page [PG-01–07].
- **Editor and blocks:** block editor with a slash menu and Markdown
  shortcuts [ED-01]. Files, inline PDFs, video and audio [ED-02–05].
  Highlighted code blocks with line numbers and copy [ED-06]. Embeds
  [ED-07]. Paste a URL as a mention, bookmark, embed or link [ED-08].
- **Linking:** page mentions with `@` or `[[` [ED-09], sub-page cards
  [ED-10], backlinks ("Linked from") [PG-06].
- **Search:** command palette (Cmd/Ctrl+K) across titles and content
  [SR-01].
- **Import and export:** Markdown and PDF export, whole-workspace export,
  Markdown and Notion import [IO-01–06].
- **Data safety:** persistent storage, Trash (30 days), unused-file
  cleanup, full backup and restore [DS-01–06].
- **Sync (optional):** across devices through your own Firebase, with page
  edits merged rather than overwritten; files through your own Google Drive;
  several accounts on one device [SY-01–03].
- **Settings:** light and dark mode, link-preview switch, static build
  with sub-path hosting [ST-01–05].

## Quick start

Requires Node 24, which CI uses. Node 20+ should also work.

```
git clone https://github.com/saurabhdhakne/xeento.git
cd xeento
npm install      # also copies the pdf.js worker into public/
npm run dev
```

Open http://localhost:3000.

## How to use

On first launch Xeento shows a Welcome screen with two choices. You can
switch later in **Settings → Account & sync**. Settings is the gear icon
at the top of the sidebar.

### Local mode (one device, no setup)

1. On the Welcome screen, choose **Use on this device**.
2. Create a page from the sidebar and start typing. Type `/` for the block
   menu (headings, lists, code, files, `/page` for a sub-page).
3. Drop images, PDFs, video or audio onto a page to add them.
4. Use the sidebar to organise: drag pages to nest or reorder them, create
   folders, star pages to pin them in Favourites.
5. Press **Cmd/Ctrl+K** to search.
6. Back up from time to time: **Settings → Download full backup**. Your
   notes live only in this browser, so clearing the site's data deletes
   them. **Restore from backup…** brings everything back.

To bring notes in: **Settings → Markdown files** or **Notion export
(.zip)**, or drag `.md` and `.zip` files onto the sidebar.

### Sync mode with your own Firebase project

Use this to get the same notes on several devices. It takes about 10
minutes and a Google account. The free Spark plan is enough, with no
credit card. Full walkthrough with troubleshooting:
[docs/setup/firebase.md](docs/setup/firebase.md).

**In the Firebase console:**

1. Create a project at
   [console.firebase.google.com](https://console.firebase.google.com/).
   Google Analytics isn't needed.
2. Add a **Web** app (`</>`) and copy its `firebaseConfig` snippet.
3. **Build → Authentication**: turn on **Email/Password** sign-in.
4. **Build → Firestore Database**: create a database in production mode.

**In Xeento:**

5. On the Welcome screen choose **Sync across devices**. If you're
   already using Local mode, go to **Settings → Account & sync → Turn on
   sync**.
6. Paste the config and click **Test connection**.
7. Click **Copy rules**, paste them into **Firestore Database → Rules** in
   the console, click **Publish**, then **Check rules** in Xeento.
   Publishing can take a minute.
8. Create an account with your email and a password. The account lives
   in your Firebase project.
9. Connect Google Drive, or skip it (next section).
10. If you already have Local notes, choose **Copy my notes** or
    **Skip**. Then **Finish**.

**On another device:** choose **Sync across devices**, paste the same
config and sign in with the same email and password.

The sidebar footer shows the sync state (Synced / Syncing… / Offline).
Changes are saved on the device first and pushed a few seconds later.
Edits made offline merge when you're back online.

### Files with your own Google Drive

In Sync mode, notes sync through Firebase, but images, PDFs and other
files sync through your Google Drive, in a folder called `Xeento`. Xeento
only asks for the `drive.file` permission, so it sees only the files it
created. Details: [docs/setup/google-drive.md](docs/setup/google-drive.md).

**Using it:**

1. During sync setup, or later in **Settings → Account & sync → Google
   Drive**, click **Connect Google Drive**.
2. Approve in Google's window. Each person connects their own Drive; it
   doesn't need to be the Google account that owns the Firebase project.
3. Files added on one device upload to Drive. Other devices download each
   file the first time it's shown and keep a copy for offline use.

If the sidebar says **Reconnect Google Drive**, click it. Nothing waiting
to upload is lost. Until Drive is connected, files stay on the device
where you added them.

**If you build or host Xeento yourself,** Drive needs your own OAuth client
ID:

1. In the [Google Cloud console](https://console.cloud.google.com/)
   (your Firebase project works), enable the **Google Drive API**.
2. Set up the OAuth consent screen as **External** with the
   `.../auth/drive.file` scope. While it's in Testing, add yourself as a
   test user.
3. Create a **Web application** client. Add every origin you serve
   Xeento from (for example `http://localhost:3000`) under Authorized
   JavaScript origins.
4. Put the client ID in `.env.local` as `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and
   rebuild. Use the client ID only, **never the client secret**.

Without a client ID, the Drive options are hidden.

## Privacy: what leaves your device

| Mode | What is sent, and where |
|---|---|
| Local | Nothing, except the URLs you paste, if link previews are on (below) |
| Sync | Your notes go to **your** Firebase project, your files to **your** Google Drive. Nothing goes to the Xeento project |

**Link previews:** browsers can't read other sites' pages directly, so a
small preview server fetches a pasted link's title and image. It sees the
URLs you paste, never your notes, and stores nothing. Turn it off in
**Settings → This device → Link previews**. Static builds have it off
unless you configure a preview URL.

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
|---|---|---|
| Search | Cmd+K | Ctrl+K |
| Toggle sidebar | Cmd+\\ | Ctrl+\\ |
| Move open page to… | Cmd+Shift+M | Ctrl+Shift+M |
| Block menu | / | / |
| Mention a page | @ or [[ | @ or [[ |
| Copy / paste the open page | Cmd+C / Cmd+V | Ctrl+C / Ctrl+V |

The full table is in [FEATURES.md](FEATURES.md#keyboard-shortcuts).

## Build and deploy

| Command | Output | Link previews |
|---|---|---|
| `npm run build`, then `npm start` | Next.js server | On, through the built-in `/api/link-preview` route |
| `npm run build:static` | Static files in `out/`, host anywhere | Off and hidden, unless `NEXT_PUBLIC_LINK_PREVIEW_URL` is set |

`build:static` sets its env variable with POSIX shell syntax (macOS,
Linux, WSL, Git Bash; not Windows `cmd`).

Serve the static build locally:

```
npm run build:static
python3 -m http.server 8080 -d out
```

**Hosting under a sub-path** (for example GitHub Pages): set the base path
at build time, then serve `out/` from `https://<host>/xeento/`.

```
NEXT_PUBLIC_BASE_PATH=/xeento npm run build:static
```

## Configuration

All variables are read at build time. Copy `.env.example` to `.env.local`
(git ignores it).

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_BASE_PATH` | empty | Serve the app from a sub-path |
| `NEXT_PUBLIC_LINK_PREVIEW_URL` | `<basePath>/api/link-preview` on `npm run build`, empty on `build:static` | Where link metadata is fetched. Empty turns link previews off and hides the setting |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | unset | Google OAuth client ID for Drive file storage in Sync mode. Client ID only, never the secret. Unset hides Drive |
| `NEXT_PUBLIC_FIREBASE_EMULATORS` | unset | Development only: `1` points Sync mode at local Firebase emulators. Never set it for a real build |

## Development

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (Turbopack) at http://localhost:3000 |
| `npm run build` | Production build; also type-checks |
| `npm run build:static` | Static export to `out/` |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test:rules` | Firestore security-rules tests in the emulator (needs Java 21+) |

### Project structure

```
src/
  app/                 Next.js App Router: layout, page, globals.css,
                       api/link-preview (optional server route)
  components/          React UI: app shell, sidebar, page view, editor,
                       search, import, setup wizard, ui primitives
    editor/            BlockNote wrapper, the single block schema,
                       custom blocks and inline content
  lib/                 Data layer: pages, folders, files, trash, backup,
                       Yjs page documents, live-query hooks
    backend/           Sync adapter interfaces + Firebase and Google
                       Drive implementations
    sync/              Sync engine, accounts, setup, status
    export/ import/    Markdown/PDF export, Markdown/Notion import
firebase/              Firestore security rules
tests/                 Firestore rules tests (node:test)
scripts/               pdf.js worker copy (postinstall), Notion fixture
test-fixtures/         Sample Notion export for import tests
docs/                  Setup guides and the build guide
```

Components never import the database directly. They call `src/lib/`
modules and read through the `use-*.ts` hooks (ESLint enforces this).
The architecture is described in [CLAUDE.md](CLAUDE.md).

### Tech stack

| Library | Used for | License |
|---|---|---|
| Next.js 16, React 19, Tailwind v4 | App framework and styling | MIT |
| TypeScript | Types | Apache-2.0 |
| BlockNote (`core`, `react`, `mantine`) | Block editor, Markdown conversion | MPL-2.0 |
| `@blocknote/code-block` | Shiki-highlighted code blocks | MPL-2.0 |
| Dexie, `dexie-react-hooks` | IndexedDB storage and live queries | Apache-2.0 |
| Yjs, y-prosemirror, y-protocols | Page content as mergeable documents | MIT |
| firebase | Sync mode: Auth + Firestore (client-side) | Apache-2.0 |
| Google Identity Services + Drive REST | Sync mode file storage (loaded at runtime) | n/a |
| pdfjs-dist | Inline PDF viewer | Apache-2.0 |
| jszip, gray-matter, papaparse | Zip, front-matter and CSV for import/export | MIT (jszip used under MIT of its MIT/GPL-3.0 dual license) |
| @dnd-kit, emoji-picker-react, next-themes, lucide-react, nanoid | Drag-and-drop, icons, theming, ids | MIT / ISC |

The `@blocknote/xl-*` packages are deliberately not used because of their
GPL-or-proprietary license. PDF export uses the browser's print dialog
instead.

### Testing

There's no automated test suite. Before a pull request:

1. `npm run lint` passes.
2. `npm run build` and `npm run build:static` pass. CI runs all three on
   every pull request.
3. The relevant test steps in [FEATURES.md](FEATURES.md) pass in the
   browser. Start with its 5-minute **Quick smoke test**.

**Firestore rules tests:** `npm run test:rules` needs Java 21 or newer on
your `PATH` (for example [Temurin](https://adoptium.net/)).

**Trying Sync mode without a real Firebase project:**

```
npx firebase emulators:start --only firestore,auth --project demo-xeento
NEXT_PUBLIC_FIREBASE_EMULATORS=1 npm run dev
```

Then paste any config with `"projectId": "demo-xeento"` during setup.

## Documentation

| File | What's in it | For |
|---|---|---|
| [FEATURES.md](FEATURES.md) | Every feature, its behavior and test steps; shortcuts; known limitations; changelog | Users, testers, contributors |
| [ROADMAP.md](ROADMAP.md) | Design decisions and phases, done and planned | Contributors |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to send a change | Contributors |
| [CLAUDE.md](CLAUDE.md) | Architecture, data model, project rules, gotchas | Contributors and AI coding agents |
| [docs/setup/firebase.md](docs/setup/firebase.md) | Setting up your own Firebase project for sync | Users |
| [docs/setup/google-drive.md](docs/setup/google-drive.md) | Connecting Drive; creating an OAuth client ID | Users, self-hosters |
| [docs/build-guide/](docs/build-guide/README.md) | How Xeento was built, chapter by chapter | Learners |

## Known limitations

- Restore from backup replaces the workspace; it can't merge.
- In Sync mode, files sync only on devices with Google Drive connected.
- A single save bigger than about 8MB of page content can't sync
  (Firestore's request limit).
- Markdown export is lossy for media blocks; use the full backup for a
  lossless copy.
- Very large PDFs may be slow.

The full list is in [FEATURES.md](FEATURES.md#known-limitations).

## Roadmap

Done: adapter interfaces, Yjs page content, setup wizard, Firebase sync,
Google Drive files, data portability. Next: hosting, a databases feature,
desktop and mobile apps (Tauri), and bring-your-own-key AI. See
[ROADMAP.md](ROADMAP.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first,
and open an issue before starting on a roadmap item.

## License

[MIT](LICENSE) © 2026 Saurabh Dhakne
