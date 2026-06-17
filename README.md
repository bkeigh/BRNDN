# BRNDN - Fifa Tracker

A React + Vite dashboard for the FIFA World Cup 2026 knockout bracket.

## What It Does

- Fetches live match data from FIFA's public API:
  `https://api.fifa.com/api/v3/calendar/matches?...idCompetition=17&idSeason=285023`
- Normalizes FIFA match JSON into team, score, status, venue, placeholder, and round data.
- Shows the Round of 32 through the Final as a sports-broadcast bracket.
- Shows today's matches, feed health, completed/live/upcoming totals, and manual refresh.
- Auto-refreshes every 60 seconds.

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
