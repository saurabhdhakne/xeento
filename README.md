# Xeento

A local-first, block-based notes and docs app. Your notes live on your
device (IndexedDB). No account, no server storing your data.

Features: nested pages and folders, a block editor with slash menu, code
blocks, PDFs, embeds and link previews, page mentions and backlinks,
search, Markdown/Notion import, Markdown/PDF export, Trash, and full
backup/restore. See [FEATURES.md](FEATURES.md) for the full list.

## Local or Sync

On first launch Xeento asks how you want to use it:

- **Use on this device** (Local mode): no account, notes stay in this
  browser. This is how Xeento has always worked.
- **Sync across devices**: notes sync through **your own** Firebase
  project (free plan). Xeento never sees them. Follow
  [docs/setup/firebase.md](docs/setup/firebase.md); the app walks you
  through it. Files in notes will sync through your own Google Drive
  (coming next, see [ROADMAP.md](ROADMAP.md)).

You can switch later in Settings → Account & sync.

## Run it locally

Requires Node 24 (Node 20+ should work).

```
npm install
npm run dev
```

Open http://localhost:3000.

## Build

There are two builds:

| Command | Output | Link previews |
|---|---|---|
| `npm run build` then `npm start` | Next.js server | On, via the built-in `/api/link-preview` route |
| `npm run build:static` | Static files in `out/`, host anywhere | Off and hidden, unless you set `NEXT_PUBLIC_LINK_PREVIEW_URL` |

`build:static` uses POSIX shell syntax for its env variable (macOS, Linux,
WSL, Git Bash).

To serve the static build locally:

```
npm run build:static
python3 -m http.server 8080 -d out
```

### Hosting under a sub-path (e.g. GitHub Pages)

Set the base path at build time:

```
NEXT_PUBLIC_BASE_PATH=/xeento npm run build:static
```

The contents of `out/` are then served from `https://<host>/xeento/`.

### Environment variables

All are read at build time.

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_BASE_PATH` | empty | Serve the app from a sub-path |
| `NEXT_PUBLIC_LINK_PREVIEW_URL` | `<basePath>/api/link-preview` on `npm run build`, empty on `build:static` | Where link metadata is fetched. Empty turns link previews off and hides the setting |
| `NEXT_PUBLIC_FIREBASE_EMULATORS` | unset | Development only: `1` points Sync mode at local Firebase emulators instead of a real project. Never set it for a real build |

## Testing the Firestore rules

`npm run test:rules` runs the security-rules tests in the Firebase
emulator. It needs Java 21 or newer on your `PATH` (for example
[Temurin](https://adoptium.net/)). To try Sync mode without a real
project:

```
npx firebase emulators:start --only firestore,auth --project demo-xeento
NEXT_PUBLIC_FIREBASE_EMULATORS=1 npm run dev
```

Then use any config with `"projectId": "demo-xeento"` in the setup.

## About link previews

Pasted links can show a title and image. Browsers can't read other sites'
pages directly, so the preview server fetches the link's page. It sees the
URLs you paste, never your notes, and stores nothing. Turn it off in
Settings → This device → Link previews.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Architecture notes are in
[CLAUDE.md](CLAUDE.md).

## License

[MIT](LICENSE)
