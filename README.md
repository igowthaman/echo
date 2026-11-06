# Echo

Chat and call the people you know, browser to browser. Echo's server handles
accounts and introductions; messages, voice and video go directly between the
two browsers over WebRTC and never pass through it.

## Run it

Needs Node 26 (see `.nvmrc`).

```bash
npm install
npm run dev
```

Open http://localhost:3000, create an account, and add someone by their
username. `npm run dev` starts `server.ts` (Next.js plus the PeerJS signalling
server) through nodemon and tsx, and restarts it when `server.ts` or `lib/`
changes.

To try two people on one computer, use two separate logins: a private window,
or `alice.localhost:3000` and `bob.localhost:3000` (each hostname keeps its own
login and chat history).

Don't run `npm run build` while `npm run dev` is running. The build rewrites
files the dev server uses, and open pages start reloading in a loop. Stop the
dev server first, or restart it after the build.

## Production

```bash
npm run build   # Next.js build + compiles server.ts to dist/
npm start       # node dist/server.js
```

Calls need a secure origin: serve Echo over https (localhost is fine for testing).

## On phones

Echo is an installable web app (PWA): a manifest, app icons, and a small
service worker that only shows an offline page (it never stores messages or
pages). Installed, it opens full screen like a native app: chats fill the
screen, an open conversation hides the app header, and the message box stays
above the keyboard.

### Test on a phone over Wi-Fi

Calls, the camera and installing all need https, even on your own network.

1. Make a local certificate (once, or again when your Wi-Fi address changes):

   ```bash
   npm run cert:dev
   ```

2. Copy `.certs/echo-dev-ca.crt` to the phone and install it. On Android:
   Settings → Security → Encryption & credentials → Install a certificate →
   CA certificate. Keep `.certs/echo-dev-ca.key` private, and remove the CA from
   the phone when you're done testing.
3. Start Echo with HTTPS (stop `npm run dev` first; only one dev server can run):

   ```bash
   npm run dev:https
   ```

4. On the phone (same Wi-Fi), open the `https://` address the server prints
   under "Phones on the same network". In Chrome's menu, choose
   **Add to Home screen** → **Install**.

If your router isolates Wi-Fi devices from each other, the phone can't reach
the computer; try another network or a phone hotspot.

### Android app (APK)

The APK is a Trusted Web Activity: a small Android app that opens Echo in
Chrome, full screen with no browser bar, so calls and the camera work exactly
as on the web. It needs Echo running at a public **https** domain (a Wi-Fi
address can't be verified by Android).

1. Deploy Echo to its domain (see Production) and check
   `https://<your-domain>/manifest.webmanifest` loads.
2. Build the APK with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
   (it downloads the JDK and Android SDK on first run), or upload the URL to
   [PWABuilder](https://www.pwabuilder.com) and download its Android package:

   ```bash
   npm install -g @bubblewrap/cli
   bubblewrap init --manifest https://<your-domain>/manifest.webmanifest
   bubblewrap build
   ```

3. Get the signing key's SHA-256 fingerprint (`bubblewrap fingerprint list`, or
   from Play Console → App integrity), then set `ANDROID_PACKAGE_NAME` and
   `ANDROID_CERT_SHA256` on the server and restart it.
   `https://<your-domain>/.well-known/assetlinks.json` should now list them.
4. Install `app-release-signed.apk` on a phone, or upload the `.aab` to Google
   Play.

Without step 3 the app still works but shows a browser bar at the top.

## Settings

| Variable       | Default                          | What it does |
| -------------- | -------------------------------- | ------------ |
| `PORT`         | `3000`                           | Port for pages, API and signalling. |
| `ECHO_DB_PATH` | `data/echo.db`                   | SQLite file for users, sessions and contacts. |
| `APP_ORIGIN`   | the request's own host           | Public URL when Echo runs behind a proxy, e.g. `https://echo.example.com`. Signalling sockets from other origins are refused. |
| `STUN_URLS`    | `stun:stun.l.google.com:19302`   | Comma-separated STUN servers. |
| `TURN_URLS`    | none                             | Comma-separated TURN servers, e.g. `turn:turn.example.com:3478`. |
| `TURN_SECRET`  | none                             | coturn `static-auth-secret`. With `TURN_URLS`, Echo hands out 12-hour credentials. |
| `HTTPS_KEY_FILE`, `HTTPS_CERT_FILE` | none        | Serve over HTTPS with this key and certificate (`npm run dev:https` sets them to the `npm run cert:dev` files). |
| `ANDROID_PACKAGE_NAME` | none                     | The APK's package name, e.g. `com.example.echo`, for `/.well-known/assetlinks.json`. |
| `ANDROID_CERT_SHA256`  | none                     | Comma-separated SHA-256 fingerprints of the APK signing keys. |

Without TURN, chat and calls fail on networks that block direct connections
(many mobile and office networks). Run coturn with `use-auth-secret` and set
both TURN variables for those.

## How it fits together

- **Accounts:** usernames and passwords (scrypt) in SQLite through Node's
  built-in `node:sqlite`. Sessions are HttpOnly cookies; the database stores
  only a SHA-256 of each token. Five failed logins lock a username for 15
  minutes per IP.
- **Signalling:** `server.ts` refuses a PeerJS socket unless its session cookie
  is valid, its Origin matches, and the peer ID it asks for is that user's ID.
- **Contacts and presence:** adding someone or accepting their request makes
  them a contact. Contacts connect and call without a prompt; anyone else
  appears as a request. Who is online comes from the signalling server.
- **Chat history:** kept in each browser's IndexedDB, per user. A new browser
  starts empty.
- **Theme:** five watercolor palettes in `app/theme/palettes.ts`, picked per
  user in Settings. Components use the color tokens in `app/globals.css`
  through Tailwind (`bg-paper`, `bg-wash`, `text-ink` …), never raw hex values.

Code map: `server.ts` (HTTP, signalling, socket checks), `lib/` (database,
auth, contacts, presence), `app/(auth)` (login and register),
`app/(app)/_chat` (connection, chat and call logic and UI), `app/api`
(user lookup, ICE servers, photos), `app/actions` (Server Actions),
`app/manifest.ts` and `public/sw.js` (installable app), `scripts/` (app icons,
local HTTPS certificates). Run `npm run icons` after changing the icon design in
`scripts/make-icons.mjs`.
