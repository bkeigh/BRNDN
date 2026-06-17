# BRNDN Sports Tracker

A React + Vite live sports dashboard for NFL, MLB, NHL, NBA, FIFA, MLS, Tennis and Golf.

## What It Does

- Fetches live data from public scoreboard APIs:
  - ESPN APIs for NFL, MLB, NHL, NBA, MLS, Tennis and Golf
  - FIFA API for the 2026 FIFA World Cup feed and knockout bracket
- Normalizes every feed into one event model with status, scores, competitors, venue, and kickoff time.
- Shows category tabs, live/next-up command center, summary totals, event cards, and feed health.
- Keeps the FIFA category's pyramid World Cup bracket.
- Auto-refreshes every 60 seconds and supports manual refresh.

## Run It

```bash
npm install
npm run dev -- --port 5174 --strictPort
```

Open `http://127.0.0.1:5174`.

## Verify

```bash
npm test
npm run build
```
