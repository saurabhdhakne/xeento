# Set up sync with your own Firebase project

Xeento syncs your notes through a Firebase project that **you** own. Your
notes go to your project, never to Xeento. The free Spark plan is enough,
and you don't need a credit card.

It takes about 10 minutes. You'll need a Google account.

> Screenshots marked **[screenshot]** are placeholders still to be added.

---

## 1. Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com/) and
   click **Create a project** (or **Add project**).
2. Give it a name, for example `my-xeento`. The project ID is shown under
   the name; you'll see it again in step 2.
3. Google Analytics isn't needed. You can turn it off.
4. Click **Create project** and wait for it to finish.

**[screenshot: Create a project]**

## 2. Add a web app and copy its config

1. On the project's home page, click the **Web** icon (`</>`) to add an
   app.
2. Give it any nickname, for example `Xeento`. Leave **Firebase Hosting**
   unticked.
3. Click **Register app**. Firebase shows a code snippet containing
   `const firebaseConfig = { … }`.
4. Copy the whole snippet (or just the `{ … }` part). Xeento's setup asks
   you to paste it.

You can find it again any time under **Project settings → General → Your
apps**.

The config identifies your project; it isn't a password. Your data is
protected by the security rules in step 5.

**[screenshot: firebaseConfig snippet]**

## 3. Turn on Email/Password sign-in

1. In the left menu, open **Build → Authentication** and click **Get
   started**.
2. Under **Sign-in method**, choose **Email/Password**, switch it on, and
   click **Save**. (Leave "Email link" off.)

**[screenshot: Email/Password enabled]**

### Who can create accounts?

Anyone who has your project's config can create an account in it, unless
you turn that off. Each account only ever sees its own notes, but you may
want to control who joins:

- **Let people sign up themselves** (default): fine for just you, or a
  family or team you share the config with.
- **Only people you add**: open **Authentication → Settings → User
  actions** and untick **Enable create (sign-up)**. Then add each person
  under **Authentication → Users → Add user**. Xeento shows "Creating
  accounts is turned off in this Firebase project" if someone tries to
  sign up.

## 4. Create the Firestore database

1. In the left menu, open **Build → Firestore Database** and click
   **Create database**.
2. Choose a location close to you. This can't be changed later.
3. When asked about security rules, choose **Start in production mode**.
   You'll replace the rules in the next step.

**[screenshot: Create database]**

## 5. Add Xeento's security rules

Xeento's setup shows the rules and a **Copy rules** button. They are also
in this repository at [`firebase/firestore.rules`](../../firebase/firestore.rules).

1. In **Firestore Database → Rules**, delete everything in the editor.
2. Paste Xeento's rules and click **Publish**.
3. Back in Xeento, click **Check rules**. Publishing can take a minute; if
   the check fails straight away, wait and try again.

These rules let each signed-in person read and write only their own data
(`users/{their id}/…`), and deny everything else. If Xeento warns about
"test mode", your project still has Firebase's open starter rules: make
sure you replaced **all** of them.

**[screenshot: Rules published]**

## 6. Create your account in Xeento

In Xeento's setup, create an account with your email and a password. This
account lives in **your** Firebase project. On another device, choose
**Sync across devices**, paste the same config, and sign in with the same
email and password.

---

## Limits of the free plan

The free Spark plan allows, per day: 50,000 reads, 20,000 writes and
20,000 deletes, and 1 GiB stored. Normal note-taking stays far below this
(an hour of typing is a few hundred writes). If you ever hit a limit,
Xeento keeps your changes on the device and syncs them after the limit
resets at midnight Pacific time.

## Files

Images, PDFs and other files in your notes sync through your own Google
Drive, which you connect separately: see
[google-drive.md](google-drive.md). Until you connect it, they stay on the
device where you added them.

## Moving to a different project

Settings → Account & sync → **Export all** downloads a full backup. Set up
the new project, then use **Restore from backup** while signed in to it.

## Troubleshooting

| Message in Xeento | What to do |
|---|---|
| "Couldn't reach Firebase" | Check your internet connection and that you pasted the right config. |
| "This project has no Firestore database yet" | Do step 4. |
| "Xeento's rules aren't installed yet" | Do step 5, click Publish, wait a minute, check again. |
| "older version of Xeento's rules" | Copy the rules again from Xeento and publish them. |
| "Email/Password sign-in isn't enabled" | Do step 3. |
| "Creating accounts is turned off" | Ask the project owner to add you, or turn sign-up back on (step 3). |
| "Firebase rejected the apiKey" | Copy the config again from Project settings. |
