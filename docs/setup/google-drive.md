# Google Drive for files (Sync mode)

In Sync mode, images, PDFs and other files in your notes are stored in
**your own Google Drive**, in a folder named `Xeento`. Xeento asks only for
the `drive.file` permission: it can see the files it creates, and nothing
else in your Drive.

## Connecting (users)

During sync setup, or later in **Settings → Account & sync → Google Drive**,
click **Connect Google Drive** and approve in Google's window. Each person
using a Firebase project connects their own Drive; it doesn't have to be
the same Google account as the Firebase project.

- Google gives Xeento access for about an hour at a time. Xeento renews it
  quietly; if your browser blocks that, the sidebar says **Reconnect Google
  Drive**. One click fixes it, and nothing waiting to upload is lost.
- **Disconnect** (same place) revokes Xeento's access on this device. Files
  already in Drive stay there; new files wait until you reconnect.
- Files sync like this: added on one device → uploaded to Drive → another
  device downloads each file the first time it's shown, and keeps a copy
  so it works offline.

## Creating the OAuth client ID (whoever builds or hosts Xeento)

The hosted version of Xeento already has a client ID. If you build or host
Xeento yourself, create your own:

1. In the [Google Cloud console](https://console.cloud.google.com/), select
   a project. Your Firebase project works (it's a Google Cloud project).
2. **APIs & Services → Library**: enable **Google Drive API**.
3. **Google Auth Platform** (OAuth consent screen): set it up as
   **External**, with an app name and support email. Add the scope
   `.../auth/drive.file`. While the app is in **Testing**, only the test
   users you add can connect; **Publish** it to let anyone connect.
   `drive.file` is a non-sensitive scope, so publishing needs only Google's
   basic brand verification.
4. **Clients → Create client → Web application**. Under **Authorized
   JavaScript origins**, add every origin Xeento is served from, for
   example `http://localhost:3000` and `https://notes.example.com`. No
   redirect URIs are needed.
5. Copy the **Client ID** (`….apps.googleusercontent.com`) into
   `.env.local`:

   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```

   It's read at build time. The client ID is public by design (it ends up
   in the app's JavaScript).

**Never use the client secret.** Xeento runs entirely in the browser and
uses Google's browser token flow, which needs only the client ID. Don't
put the secret in `.env.local`, the code or anywhere it could be
published.

Without `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, Xeento hides the Google Drive
options and files simply stay on the device they were added on.

## Troubleshooting

| What you see | What to do |
|---|---|
| Google's window says "origin mismatch" / `redirect_uri_mismatch` | Add the exact origin (scheme, host and port) to Authorized JavaScript origins. |
| "Access blocked: app has not completed verification" | Add your Google account as a test user, or publish the consent screen. |
| "Xeento needs permission to see the files it creates…" | Connect again and leave the Drive permission ticked. |
| Sidebar: "Synced · files waiting for Drive" | Connect Google Drive in Settings → Account & sync. |
| Sidebar: "Reconnect Google Drive" | Click it, then Reconnect. |
| "Your Google Drive is full" | Free up Drive space; waiting files upload afterwards. |
