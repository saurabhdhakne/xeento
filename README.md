# Xeento

A local-first, block-based notes and docs app. Your notes live on your
device (IndexedDB). No account, no server storing your data.

Features: nested pages and folders, a block editor with slash menu, code
blocks, PDFs, embeds and link previews, page mentions and backlinks,
search, Markdown/Notion import, Markdown/PDF export, Trash, and full
backup/restore. See [FEATURES.md](FEATURES.md) for the full list.

Optional sync across devices through your own Firebase project and Google
Drive is planned; see [ROADMAP.md](ROADMAP.md).

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
