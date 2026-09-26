# Stock Market Game — real-time multiplayer server

Everyone opens the same link on their phone. The host creates a game, shares the
4-letter code, players join and submit trades live — no trade codes, no copy/paste.

## Run locally

```bash
node server.js
# open http://localhost:3000
```

No `npm install` needed — zero dependencies, works on Node 18+.

## Deploy (free)

**Render** — push this folder to GitHub, then "New Web Service" → point at the repo.
`render.yaml` is included; it just works.

**Railway** — `railway init` + `railway up`, or deploy from the GitHub repo.

**Fly.io** — `fly launch` (uses the Dockerfile).

**Any VPS** — copy the folder, run `node server.js` (set `PORT` env as needed),
put it behind Caddy/nginx for HTTPS.

Game state persists to `data/rooms.json` and survives restarts.

## How it works

- `server.js` — HTTP + Server-Sent Events, rooms, auth tokens, persistence.
- `game.js` — the full rules engine (same logic as the single-file tracker):
  Bull/Mixed/Bear movement tables, momentum −4…+4, bubble indicator with hidden
  random threshold, 15 random events, 3 bubble decks, margin/shorts/collateral,
  fire sales, persistent flow, market-maker tabs, warrants (exercise/decay),
  conversions, splits, bankruptcy, 13 toggleable house rules.
- `public/index.html` — the phone UI. Host runs the GM stepper; players enter
  trades and hit Submit; everything syncs live.

## Notes

- The exact bubble threshold is hidden from players' browsers until it triggers
  (the host sees it).
- Host actions require the host token; players can only submit their own trades.
- Up to 12 players per game.
