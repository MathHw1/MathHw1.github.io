# Nebula Arcade lobby server

Passes game messages between the two players in a Classic Pool or Chess lobby. The games themselves stay on GitHub Pages. They connect through `games/shared/lobby-client.js`.

## Events

| Event | Direction | What it does |
|---|---|---|
| `join-room` | client to server | Creates a room (`{ create: true }`) or joins one (`{ room: 'ABCDE' }`). Also used to rejoin after a dropped connection. |
| `player-joined` | server to client | The other player arrived or came back (`rejoined: true`). |
| `game-state-update` | both ways | A game message. The server numbers them and keeps the last 1000, so a reconnecting player catches up. |
| `player-away` | server to client | The other player's connection dropped. They keep their seat for 2 minutes. |
| `player-left` | server to client | The other player has gone for good. |
| `leave-room` | client to server | Leaves on purpose. |

## Deploy on Render

1. Sign in at [render.com](https://render.com) and connect your GitHub account.
2. Choose **New > Blueprint**, pick the `MathHw1.github.io` repo, and apply it. It reads `render.yaml`.
3. Copy the service's address, such as `https://nebula-lobby-server.onrender.com`.
4. If the address is different, change `LOBBY_SERVER_URL` in `games/shared/lobby-client.js` to match.

Render handles HTTPS, so players connect with `wss://` on port 443.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://mathhw1.github.io` | Sites allowed to connect, separated by commas. |
| `PORT` | `3000` | Render sets this itself. |
| `TRANSPORTS` | `websocket,polling` | Set to `polling` to test a network that blocks WebSockets. |
| `ADMIN_PASSWORD` | none | Turns on the owner panel. Set it in Render only, never in the code. |
| `DATABASE_URL` | none | A Postgres connection string. Saves the boards, bans and perks so restarts don't wipe them. Without it, everything lives in memory. |

## Keep the boards forever

The free Render server forgets everything when it sleeps. To keep leaderboards, bans and perks:

1. Make a free Postgres database at [neon.tech](https://neon.tech) and copy its connection string (it starts with `postgresql://`).
2. In Render, open the lobby server, go to **Environment**, add `DATABASE_URL`, and paste the string as its value.
3. Save. Render restarts the server, and its log says `Database connected`.

The server makes its own table (`nebula_state`) and saves a few seconds after anything changes.

## Test on your computer

```bash
npm install
npm test
```

To play locally, run the server with the test site allowed, then serve the site from the folder above on port 8765. Pages on `localhost` connect to `http://localhost:3000` by themselves.

```bash
ALLOWED_ORIGINS=http://localhost:8765 npm start
```
