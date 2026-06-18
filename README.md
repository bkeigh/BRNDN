# BRNDN Sports Tracker

A React + Vite live sports dashboard for NFL, MLB, NHL, NBA, FIFA, MLS, Tennis and Golf.

## What It Does

- **Live data** from public APIs (no key required):
  - ESPN scoreboard, summary, standings, leaders and news APIs for NFL, MLB, NHL, NBA, MLS, Tennis and Golf
  - FIFA API for the 2026 World Cup feed and knockout bracket
- **Hero landing page** with popular sports and a one-click CTA into the live tracker; the live ticker bar is clickable too.
- **Per-sport theming** — each sport has a distinct accent color that re-themes the whole UI.
- **Live command center** with the featured game, count-up summary stats, and a cross-sport live ticker.
- **Game detail modal** (tap any matchup) — win probability, Vegas over/unders + spreads + moneylines, team stats, player leaders, injury report and game news.
- **Stats Lab** for the stats nerds: Vegas lines board, league standings, statistical leaders, and external reference links (Pro-Football-Reference, Baseball-Reference, Basketball-Reference, FBref, Data Golf, Tennis Abstract, etc.).
- **Collapsible** World Cup bracket plus show-more toggles throughout.
- **Mobile-first**: a thumb-friendly bottom navigation bar (safe-area aware for iOS/Android), bottom-sheet sports menu and game detail.
- Auto-refreshes every 60 seconds and supports manual refresh; lazy-loads and caches deep stats on demand.

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
