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

- `server.js` — HTTP + Server-Sent Events, rooms, auth tokens, persistence,
  server-side tab/auction timers (auto-lock, restart recovery).
- `game.js` — the full rules engine (same logic as the single-file tracker):
  Bull/Mixed/Bear movement tables, momentum −4…+4, bubble indicator with hidden
  random threshold, 15 random events, 3 bubble decks, margin/shorts/collateral,
  fire sales, persistent flow, market-maker tabs, warrants (exercise/decay),
  conversions, splits, bankruptcy, 14 toggleable house rules.
- `index.html` — the phone UI. Host runs the GM stepper; players place tabs
  and announce quantities; everything syncs live.

## Trading flow (original rules)

1. **Tabs** — the broker (host) starts a timed tab placement (default 60s,
   adjustable 5–600s) from the GM tab. During the timer, players tap
   Buy/Sell/Short/Cover/M.Buy tabs per asset — direction only, no quantities.
   Tabs can be changed until the timer expires, then they lock and become
   irrevocable. A player may not buy and sell the same asset in one round.
   Other players' tabs are hidden from each browser until the lock.
2. **Execute** — quantities are announced player by player (stocks/warrants in
   lots of 10, bonds singly). If a player can't fund their buys, the host runs
   a 60-second **funding auction**: the short player auctions assets to the
   highest bidder, and/or the host records a private loan. A player who still
   can't pay goes **bankrupt** (out of the game).
3. Sales execute before buys. If the bank runs short of shares, smaller buy
   orders fill first (ties broken randomly). All tab demand — filled or not —
   still counts toward market movement.

## Notes

- The exact bubble threshold is hidden from players' browsers until it triggers
  (the host sees it).
- Host actions require the host token; players can only submit their own trades.
- Up to 12 players per game.
- **Percent movements** (house rule, off by default): Trend Card moves are
  applied as a percentage of the current price, where each % = card value ÷
  that asset's starting price (e.g. Bull Blue Chip "Buy 1" = +8 on a 40 start
  → 20%). Momentum modifiers scale the same way; event adjustments stay in
  points.
- **Dynamic card columns**: the movement table grows with player count.
  4–6 players use the classic card (Buy 3+ … Sell 2+); larger games extend it
  (10 players → Buy 5+ … Sell 4+, 12 → Buy 6+ … Sell 5+), extrapolating values
  from the original tables. The Market phase shows the card for the current
  player count.
