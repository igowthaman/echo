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

## Settings

| Variable       | Default                          | What it does |
| -------------- | -------------------------------- | ------------ |
| `PORT`         | `3000`                           | Port for pages, API and signalling. |
| `ECHO_DB_PATH` | `data/echo.db`                   | SQLite file for users, sessions and contacts. |
| `APP_ORIGIN`   | the request's own host           | Public URL when Echo runs behind a proxy, e.g. `https://echo.example.com`. Signalling sockets from other origins are refused. |
| `STUN_URLS`    | `stun:stun.l.google.com:19302`   | Comma-separated STUN servers. |
| `TURN_URLS`    | none                             | Comma-separated TURN servers, e.g. `turn:turn.example.com:3478`. |
| `TURN_SECRET`  | none                             | coturn `static-auth-secret`. With `TURN_URLS`, Echo hands out 12-hour credentials. |

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
(user lookup, ICE servers), `app/actions` (Server Actions).
