import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Crown,
  DollarSign,
  ExternalLink,
  HeartPulse,
  Home,
  LayoutGrid,
  Link2,
  ListOrdered,
  MapPin,
  Newspaper,
  Percent,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  SPORTS,
  STATS_REFERENCE_LINKS,
  buildKnockoutRounds,
  compareEventsForDisplay,
  getLiveMatches,
  getNextMatches,
  getTodayMatches,
  leadersUrlForSport,
  newsUrlForSport,
  normalizeEspnScoreboard,
  normalizeFifaMatches,
  normalizeLeaders,
  normalizeNews,
  normalizeStandings,
  normalizeSummary,
  recordLabel,
  sportById,
  sportHasLeaders,
  sportHasOddsBoard,
  sportHasStandings,
  standingsUrlForSport,
  summarizeEvents,
  summaryUrlForEvent,
} from "./matchUtils.js";
import {
  hasConsentDecision,
  onConsentReopen,
  requestConsentReopen,
  setConsent,
} from "./consent.js";
import { initAnalytics, track } from "./analytics.js";
import "./styles.css";

const REFRESH_INTERVAL_MS = 60_000;
const DEFAULT_SPORT_ID = "fifa";
const POPULAR_SPORTS = ["nfl", "nba", "mlb", "nhl", "fifa", "mls"];
const THIRD_PLACE_LABEL = "Play-off for third place";
const CARD_WIDTH = 216;
const CARD_HEIGHT = 158;
const LANE_WIDTH = 296;
const BRACKET_STEP = 220;
const BRACKET_TOP = 100;
const THIRD_PLACE_GAP = 76;
const THIRD_PLACE_LABEL_HEIGHT = 26;

// --- Client-side routing: /<sportId> <-> app state (no router dependency) -----
const SITE_URL = "https://brndn.app";
const SPORT_IDS = new Set(SPORTS.map((sport) => sport.id));

// Map a pathname to route state. "/" (or anything unknown) => landing.
function parseRoute(pathname) {
  const slug = String(pathname || "/").replace(/^\/+|\/+$/g, "").toLowerCase();
  if (slug && SPORT_IDS.has(slug)) return { entered: true, sportId: slug };
  return { entered: false, sportId: null };
}

function pushPath(path) {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
}

function setMetaTag(selector, attr, value) {
  if (typeof document === "undefined") return;
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

// Per-route <title> + canonical/social meta. NOTE: this runs client-side, so
// JS-rendering crawlers (Googlebot) see it, but non-rendering social scrapers
// (Facebook/Slack/X) still read the static index.html OG tags. True per-route
// social cards would require build-time prerendering of each /sport route.
function updateRouteSeo(sport) {
  if (typeof document === "undefined") return;
  const title = sport
    ? `${sport.label} Live Scores, Odds & Stats · BRNDN`
    : "BRNDN Sports Tracker — Live Scores, Odds & Stats";
  const description = sport
    ? `Live ${sport.name} scores, Vegas betting lines, win probability, standings and player stats — auto-refreshing in real time on BRNDN.`
    : "Live scores, Vegas betting lines, win probability and deep stats across NFL, MLB, NHL, NBA, FIFA, MLS, Tennis and Golf — all on one screen.";
  const url = sport ? `${SITE_URL}/${sport.id}` : `${SITE_URL}/`;
  document.title = title;
  setMetaTag('link[rel="canonical"]', "href", url);
  setMetaTag('meta[name="description"]', "content", description);
  setMetaTag('meta[property="og:title"]', "content", title);
  setMetaTag('meta[property="og:description"]', "content", description);
  setMetaTag('meta[property="og:url"]', "content", url);
  setMetaTag('meta[name="twitter:title"]', "content", title);
  setMetaTag('meta[name="twitter:description"]', "content", description);
}

// Visual metadata per sport: glyph + accent color drives the live theme.
// Accents are spread around the hue wheel so no two sports read as the same color.
const SPORT_THEME = {
  nfl: { icon: "🏈", accent: "#ff4d4d", accent2: "#ff8a6b" }, // red
  nba: { icon: "🏀", accent: "#ff8a3d", accent2: "#ffc06b" }, // basketball orange
  golf: { icon: "⛳", accent: "#f5b62e", accent2: "#ffd877" }, // fairway gold
  tennis: { icon: "🎾", accent: "#c9f24a", accent2: "#e4ff86" }, // ball lime
  fifa: { icon: "⚽", accent: "#2fe28b", accent2: "#7af0bb" }, // pitch green
  mls: { icon: "🥅", accent: "#16d6c1", accent2: "#69f0e2" }, // teal
  nhl: { icon: "🏒", accent: "#58c7ef", accent2: "#a5e7ff" }, // ice cyan
  mlb: { icon: "⚾", accent: "#5a8dff", accent2: "#8fb6ff" }, // royal blue
};

const LANDING_ACCENT = { accent: "#5ad9ff", accent2: "#ffd15f" };

// --- Compliance: 21+ age gate (the app surfaces sports-betting odds) ---------
const AGE_ACK_KEY = "brndn-age-ack-v1";
const LEGAL_AGE = 21;

function hasAgeAck() {
  try {
    return localStorage.getItem(AGE_ACK_KEY) === "yes";
  } catch {
    return false;
  }
}

function rememberAgeAck() {
  try {
    localStorage.setItem(AGE_ACK_KEY, "yes");
  } catch {
    /* private mode / storage blocked — the gate simply re-shows next visit */
  }
}

const summaryCache = new Map();
const summaryCacheTs = new Map(); // event.id -> last fetch time (live-summary TTL)
const newsCache = new Map();
const standingsCache = new Map();
const leadersCache = new Map();

// A live game's summary (scores/odds/win prob/injuries) goes stale every cycle,
// while a completed game never changes. Re-fetch live/upcoming summaries past
// this TTL; keep completed ones cached for the session.
const SUMMARY_TTL_MS = 45_000;

function summaryFresh(event) {
  if (!summaryCache.has(event.id)) return false;
  if (event.status === "completed") return true;
  return Date.now() - (summaryCacheTs.get(event.id) || 0) < SUMMARY_TTL_MS;
}

function storeSummary(event, data) {
  summaryCache.set(event.id, data);
  summaryCacheTs.set(event.id, Date.now());
}

function themeFor(sportId) {
  return SPORT_THEME[sportId] || SPORT_THEME.fifa;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const value = parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function accentVarsFrom(accent, accent2) {
  return {
    "--accent": accent,
    "--accent-2": accent2,
    "--accent-soft": rgba(accent, 0.16),
    "--accent-glow": rgba(accent, 0.4),
  };
}

function accentVars(sportId) {
  const theme = themeFor(sportId);
  return accentVarsFrom(theme.accent, theme.accent2);
}

function emptyFeed(sport) {
  return {
    sport,
    events: [],
    summary: summarizeEvents([]),
    loading: true,
    error: null,
    lastUpdated: null,
  };
}

function formatKickoff(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatShortKickoff(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatRelative(date) {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatSeconds(ms) {
  return Math.max(0, Math.ceil(ms / 1000));
}

function formatSourceCount(sport) {
  return sport.apiUrls.length === 1 ? "1 feed" : `${sport.apiUrls.length} feeds`;
}

function formatMoneyline(value) {
  if (value === null || value === undefined) return "—";
  return value > 0 ? `+${value}` : `${value}`;
}

function flagAlt(team) {
  return team.placeholder ? "" : `${team.name} logo`;
}

// Animated integer that eases from its previous value to the new one.
function useCountUp(value, duration = 700) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    const to = Number(value) || 0;
    if (from === to) return undefined;

    if (typeof window === "undefined" || !window.requestAnimationFrame) {
      prev.current = to;
      setDisplay(to);
      return undefined;
    }

    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = Math.round(from + (to - from) * eased);
      // Track the live value so an interrupted animation resumes from where it stopped.
      prev.current = current;
      setDisplay(current);
      if (p < 1) {
        raf = window.requestAnimationFrame(tick);
      } else {
        prev.current = to;
      }
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function loadSportFeed(sport, now) {
  const payloads = await Promise.all(sport.apiUrls.map(fetchJson));
  const events =
    sport.type === "fifa"
      ? normalizeFifaMatches(payloads[0], { now })
      : payloads
          .flatMap((payload) => normalizeEspnScoreboard(payload, sport, { now }))
          .sort(compareEventsForDisplay(now));

  return {
    sport,
    events,
    summary: summarizeEvents(events, now),
    loading: false,
    error: null,
    lastUpdated: now,
  };
}

function useSportsFeeds() {
  const [feeds, setFeeds] = useState(() => Object.fromEntries(SPORTS.map((sport) => [sport.id, emptyFeed(sport)])));
  const [lastUpdated, setLastUpdated] = useState(null);
  const [nextRefreshAt, setNextRefreshAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return; // ignore overlapping manual + interval refreshes
    inFlight.current = true;
    const fetchedAt = new Date();
    setRefreshing(true);
    try {
      const results = await Promise.all(
        SPORTS.map(async (sport) => {
          try {
            return { sportId: sport.id, feed: await loadSportFeed(sport, fetchedAt) };
          } catch (error) {
            return {
              sportId: sport.id,
              error: error instanceof Error ? error.message : `Could not load ${sport.label}`,
            };
          }
        }),
      );

      setFeeds((currentFeeds) => {
        const nextFeeds = { ...currentFeeds };
        results.forEach((result) => {
          if (result.feed) {
            nextFeeds[result.sportId] = result.feed;
            return;
          }

          nextFeeds[result.sportId] = {
            ...currentFeeds[result.sportId],
            loading: false,
            error: result.error,
            lastUpdated: fetchedAt,
          };
        });
        return nextFeeds;
      });
      setLastUpdated(fetchedAt);
      setNextRefreshAt(new Date(Date.now() + REFRESH_INTERVAL_MS));
    } finally {
      setRefreshing(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { feeds, lastUpdated, nextRefreshAt, refreshing, refresh };
}

// Generic lazy + cached JSON fetcher keyed by sport, with a normalizer.
function useCachedSportData(sport, urlFor, normalize, cache, emptyValue) {
  const [state, setState] = useState({ loading: true, data: emptyValue });

  useEffect(() => {
    let cancelled = false;
    const url = urlFor(sport);
    if (!url) {
      setState({ loading: false, data: emptyValue });
      return undefined;
    }
    if (cache.has(sport.id)) {
      setState({ loading: false, data: cache.get(sport.id) });
      return undefined;
    }
    setState({ loading: true, data: emptyValue });
    fetchJson(url)
      .then((payload) => {
        if (cancelled) return;
        const data = normalize(payload, sport.id);
        cache.set(sport.id, data);
        setState({ loading: false, data });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, data: emptyValue });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport.id]);

  return state;
}

// Lazy, cached deep stats for a single game (ESPN summary endpoint).
function useGameDetail(event) {
  const [state, setState] = useState({ loading: false, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    if (!event) {
      setState({ loading: false, data: null, error: null });
      return undefined;
    }
    const sport = sportById(event.sportId);
    const url = summaryUrlForEvent(sport, event.eventRefId);
    if (!url) {
      setState({ loading: false, data: null, error: "unsupported" });
      return undefined;
    }
    if (summaryFresh(event)) {
      setState({ loading: false, data: summaryCache.get(event.id), error: null });
      return undefined;
    }
    // Stale (live game) or never fetched: show any prior snapshot while we refresh
    // in the background so the modal doesn't flash a skeleton every cycle.
    const cached = summaryCache.get(event.id);
    setState(cached
      ? { loading: false, data: cached, error: null }
      : { loading: true, data: null, error: null });
    fetchJson(url)
      .then((payload) => {
        if (cancelled) return;
        const data = normalizeSummary(payload, event);
        storeSummary(event, data);
        setState({ loading: false, data, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState(cached
          ? { loading: false, data: cached, error: null }
          : { loading: false, data: null, error: error.message || "Failed to load" });
      });
    return () => {
      cancelled = true;
    };
  }, [event]);

  return state;
}

// Fetch odds for a small set of games (cross-game Vegas board), cached via summaryCache.
function useOddsBoard(events) {
  const ids = events.map((event) => event.id).join(",");
  const [state, setState] = useState({ loading: true, rows: [] });

  useEffect(() => {
    let cancelled = false;
    if (!events.length) {
      setState({ loading: false, rows: [] });
      return undefined;
    }
    setState({ loading: true, rows: [] });
    Promise.all(
      events.map(async (event) => {
        const sport = sportById(event.sportId);
        const url = summaryUrlForEvent(sport, event.eventRefId);
        if (!url) return null;
        try {
          let data;
          if (summaryFresh(event)) {
            data = summaryCache.get(event.id);
          } else {
            const payload = await fetchJson(url);
            data = normalizeSummary(payload, event);
            storeSummary(event, data);
          }
          return data.odds ? { event, odds: data.odds } : null;
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      setState({ loading: false, rows: rows.filter(Boolean) });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return state;
}

function StatCard({ icon: Icon, label, value, tone, hasLive }) {
  const animated = useCountUp(value);
  return (
    <div className={`stat-card ${tone} ${hasLive ? "has-live" : ""}`}>
      <span className="stat-icon">
        <Icon aria-hidden="true" />
      </span>
      <span>{label}</span>
      <strong>{animated}</strong>
    </div>
  );
}

function Header({ refreshing, lastUpdated, nextRefreshAt, onRefresh, liveCount, onHome }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const seconds = nextRefreshAt ? formatSeconds(nextRefreshAt.getTime() - now) : 60;

  return (
    <header className="app-header">
      <button className="brand-lockup brand-button" type="button" onClick={onHome} aria-label="Back to home">
        <div className="brand-mark" aria-hidden="true">
          <Trophy />
        </div>
        <div className="brand-text">
          <h1>BRNDN</h1>
          <span className="brand-sub">Sports Tracker</span>
        </div>
      </button>

      <div className="feed-controls" aria-label="Data refresh controls">
        <div className="feed-chip live-dot-chip">
          <span className="mini-dot" aria-hidden="true" />
          <span>{liveCount ? `${liveCount} live now` : lastUpdated ? "All quiet" : "Connecting"}</span>
        </div>
        <div className="feed-chip muted refresh-meta">
          <Clock3 aria-hidden="true" />
          <span>Refresh in {seconds}s</span>
        </div>
        <button className="refresh-button" onClick={onRefresh} type="button" disabled={refreshing}>
          <RefreshCw aria-hidden="true" className={refreshing ? "spin" : ""} />
          <span className="refresh-label">{refreshing ? "Refreshing" : "Refresh"}</span>
        </button>
      </div>
    </header>
  );
}

function LiveTicker({ feeds, onSelect }) {
  const now = new Date();
  const live = SPORTS.flatMap((sport) => getLiveMatches(feeds[sport.id]?.events || []));
  const upcoming = SPORTS.flatMap((sport) => getNextMatches(feeds[sport.id]?.events || [], now, 2));
  const items = [...live, ...upcoming].slice(0, 20);

  if (!items.length) return null;
  const fewItems = items.length < 6;

  const renderItem = (event, key, decorative) => {
    const isLive = event.status === "live";
    const theme = themeFor(event.sportId);
    const showScore =
      event.homeScore !== null && event.homeScore !== undefined && event.homeScore !== "";

    return (
      <button
        className="ticker-item"
        key={key}
        type="button"
        onClick={() => onSelect(event)}
        aria-hidden={decorative ? "true" : undefined}
        tabIndex={decorative ? -1 : undefined}
      >
        <span className="tk-sport" aria-hidden="true">{theme.icon}</span>
        <span className="tk-name">
          {event.home.shortName} v {event.away.shortName}
        </span>
        {showScore ? (
          <span className="tk-score">
            {event.homeScore}–{event.awayScore}
          </span>
        ) : null}
        <span className={`tk-state ${isLive ? "" : "upcoming"}`}>
          {isLive ? event.clockLabel : formatShortKickoff(event.date)}
        </span>
        <span className="tk-divider" aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className="ticker" aria-label="Live and upcoming scores across all sports">
      <span className="ticker-label">
        <Radio aria-hidden="true" />
        {live.length ? "Live" : "Up Next"}
      </span>
      <div className="ticker-track-wrap">
        <div className={`ticker-track ${fewItems ? "few" : ""}`}>
          {items.map((event, index) => renderItem(event, `a-${event.id}-${index}`, false))}
          {!fewItems && items.map((event, index) => renderItem(event, `b-${event.id}-${index}`, true))}
        </div>
      </div>
    </div>
  );
}

function SportsTabs({ activeSportId, feeds, onSelect }) {
  return (
    <nav className="sport-switcher" aria-label="Sports categories">
      {SPORTS.map((sport) => {
        const feed = feeds[sport.id] || emptyFeed(sport);
        const isActive = activeSportId === sport.id;
        const theme = themeFor(sport.id);

        return (
          <button
            className={`sport-tab ${isActive ? "active" : ""} ${feed.error ? "has-error" : ""}`}
            data-sport-id={sport.id}
            key={sport.id}
            onClick={() => onSelect(sport.id)}
            type="button"
            aria-pressed={isActive}
            style={{ "--tab-accent": theme.accent }}
          >
            <span className="tab-top">
              <span className="tab-icon" aria-hidden="true">{theme.icon}</span>
              {feed.summary.live ? (
                <span className="tab-live">
                  <span className="mini-dot" aria-hidden="true" />
                  {feed.summary.live}
                </span>
              ) : null}
            </span>
            <strong>{sport.label}</strong>
            <small>{feed.error ? "Feed issue" : `${feed.summary.total} events`}</small>
          </button>
        );
      })}
    </nav>
  );
}

function SportsSheet({ open, activeSportId, feeds, onSelect, onClose }) {
  return (
    <div className={`nav-drawer-root ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="nav-scrim" onClick={onClose} />
      <aside className="nav-drawer" aria-label="Sports menu">
        <div className="nav-grip" aria-hidden="true" />
        <div className="nav-drawer-head">
          <strong>Choose a sport</strong>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close menu">
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="nav-drawer-list">
          {SPORTS.map((sport) => {
            const feed = feeds[sport.id] || emptyFeed(sport);
            const theme = themeFor(sport.id);
            const isActive = activeSportId === sport.id;
            return (
              <button
                className={`nav-drawer-item ${isActive ? "active" : ""}`}
                key={sport.id}
                type="button"
                style={{ "--tab-accent": theme.accent }}
                onClick={() => {
                  onSelect(sport.id);
                  onClose();
                }}
              >
                <span className="nav-icon" aria-hidden="true">{theme.icon}</span>
                <span className="nav-label">
                  <strong>{sport.label}</strong>
                  <small>{feed.error ? "Feed issue" : `${feed.summary.total} events`}</small>
                </span>
                {feed.summary.live ? (
                  <span className="tab-live">
                    <span className="mini-dot" aria-hidden="true" />
                    {feed.summary.live}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function BottomNav({ onHome, onTop, onMenu, onRefresh, refreshing }) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <button type="button" onClick={onHome}>
        <Home aria-hidden="true" />
        <span>Home</span>
      </button>
      <button type="button" onClick={onTop}>
        <Radio aria-hidden="true" />
        <span>Live</span>
      </button>
      <button type="button" className="bn-primary" onClick={onMenu}>
        <LayoutGrid aria-hidden="true" />
        <span>Sports</span>
      </button>
      <button type="button" onClick={onRefresh}>
        <RefreshCw aria-hidden="true" className={refreshing ? "spin" : ""} />
        <span>Refresh</span>
      </button>
    </nav>
  );
}

function CommandTeam({ team, score, side, winner }) {
  return (
    <div className={`command-team ${side} ${winner ? "winner" : ""} ${team.placeholder ? "placeholder" : ""}`}>
      {team.flagUrl ? (
        <img src={team.flagUrl} alt={flagAlt(team)} loading="lazy" />
      ) : (
        <span className="flag-placeholder" aria-hidden="true">
          {team.abbreviation.slice(0, 2)}
        </span>
      )}
      <strong>{team.shortName}</strong>
      <span className="cmd-score">{score ?? "-"}</span>
    </div>
  );
}

function LiveCommandCenter({ feed, onSelect }) {
  const activeLive = getLiveMatches(feed.events);
  const activeNext = getNextMatches(feed.events, new Date(), 5);
  const featured = activeLive[0] || activeNext[0] || feed.events[0] || null;
  const isLive = featured?.status === "live";
  // Sport-specific queue: this sport's other live games, then its upcoming games.
  const queue = [...activeLive, ...activeNext]
    .filter((event) => event.id !== featured?.id)
    .filter((event, index, arr) => arr.findIndex((e) => e.id === event.id) === index)
    .slice(0, 3);
  const queueHasLive = queue.some((event) => event.status === "live");

  return (
    <section className={`live-command ${isLive ? "is-live" : ""}`} aria-label="Live sports command center">
      <div className="live-copy">
        <span className="live-eyeline">
          {isLive ? <Radio aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
          {isLive ? "Live Now" : "Next Up"} · {feed.sport.label}
        </span>
        <h2>{featured ? featured.title : `${feed.sport.label} feed loading`}</h2>
        <p>
          {featured
            ? `${featured.stage} · ${formatKickoff(featured.date)}${featured.city ? ` · ${featured.city}` : ""}`
            : `${feed.sport.source} has not returned events yet.`}
        </p>
        {featured ? (
          <button className="command-cta" type="button" onClick={() => onSelect(featured)}>
            <BarChart3 aria-hidden="true" />
            {isLive ? "Live stats & odds" : "Preview & odds"}
          </button>
        ) : null}
      </div>

      {featured ? (
        <button className="live-scoreboard" type="button" onClick={() => onSelect(featured)} aria-label={`Open ${featured.title} details`}>
          <CommandTeam team={featured.home} score={featured.homeScore} side="home" winner={featured.winnerSide === "home"} />
          <div className="command-clock">
            {isLive ? (
              <>
                <span className="pulse-dot live" aria-hidden="true" />
                <strong>{featured.clockLabel}</strong>
                <small>{featured.statusLabel}</small>
              </>
            ) : (
              <>
                <span className="vs-mark">VS</span>
                <strong>{formatShortKickoff(featured.date)}</strong>
                <small>Kickoff</small>
              </>
            )}
          </div>
          <CommandTeam team={featured.away} score={featured.awayScore} side="away" winner={featured.winnerSide === "away"} />
        </button>
      ) : null}

      {queue.length ? (
        <div className="live-queue" aria-label={`More ${feed.sport.label} games`}>
          <span className="queue-head">
            <Sparkles aria-hidden="true" />
            {queueHasLive ? `More ${feed.sport.label} live` : `Up next in ${feed.sport.label}`}
          </span>
          {queue.map((event) => (
            <button className="queue-item" key={event.id} type="button" onClick={() => onSelect(event)}>
              <span className="q-sport" aria-hidden="true">{themeFor(event.sportId).icon}</span>
              <span className="q-title">{event.title}</span>
              <span className={`q-state ${event.status === "live" ? "live" : ""}`}>
                {event.status === "live" ? event.clockLabel : formatShortKickoff(event.date)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TeamRow({ team, score, penaltyScore, winner }) {
  return (
    <div className={`team-row ${winner ? "winner" : ""} ${team.placeholder ? "placeholder" : ""}`}>
      <div className="team-identity">
        {team.flagUrl ? (
          <img src={team.flagUrl} alt={flagAlt(team)} loading="lazy" />
        ) : (
          <span className="flag-placeholder" aria-hidden="true">
            {team.abbreviation.slice(0, 2)}
          </span>
        )}
        <div>
          <span className="team-name">{team.name}</span>
          <span className="team-code">{team.placeholder ? "Slot" : team.record || team.abbreviation}</span>
        </div>
      </div>
      <div className="score-lockup">
        <strong>{score ?? "-"}</strong>
        {penaltyScore !== null && penaltyScore !== undefined ? <span>({penaltyScore})</span> : null}
      </div>
    </div>
  );
}

function MatchCard({ match, roundIndex = 0, isLastRound = false, variant = "", onSelect }) {
  const isLive = match.status === "live";
  const isDone = match.status === "completed";
  const metaLabel = match.matchNumber ? `#${match.matchNumber}` : match.sportLabel;
  const clickable = Boolean(onSelect);

  const handleKey = (event) => {
    if (!clickable) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(match);
    }
  };

  return (
    <article
      className={`match-card ${variant} ${match.status} round-${roundIndex} ${isLastRound ? "last-round" : ""} ${match.stage === "Final" ? "final-card" : ""} ${clickable ? "clickable" : ""}`}
      aria-label={match.title}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onSelect(match) : undefined}
      onKeyDown={handleKey}
    >
      <div className="match-meta">
        <span>{metaLabel}</span>
        <span className={`status-pill ${match.status}`}>
          {isLive ? <Zap aria-hidden="true" /> : isDone ? <CheckCircle2 aria-hidden="true" /> : <CalendarDays aria-hidden="true" />}
          {match.statusLabel}
        </span>
      </div>

      <TeamRow
        team={match.home}
        score={match.homeScore}
        penaltyScore={match.homePenaltyScore}
        winner={match.winnerSide === "home"}
      />
      <TeamRow
        team={match.away}
        score={match.awayScore}
        penaltyScore={match.awayPenaltyScore}
        winner={match.winnerSide === "away"}
      />

      <div className="match-footer">
        <span>{formatKickoff(match.date)}</span>
        <span><MapPin aria-hidden="true" /> {match.city || match.venue || match.broadcast || "Venue TBD"}</span>
      </div>
    </article>
  );
}

function buildPyramidGeometry(rounds) {
  const mainRounds = rounds.filter((round) => round.label !== THIRD_PLACE_LABEL);
  const placementRound = rounds.find((round) => round.label === THIRD_PLACE_LABEL);
  // Guard: if only a third-place round exists, there are no lanes to lay out.
  if (!mainRounds.length) {
    return {
      placementMatch: placementRound?.matches?.[0] || null,
      lanes: [],
      connectorPaths: [],
      height: BRACKET_TOP * 2 + CARD_HEIGHT,
      width: CARD_WIDTH + 46,
      finalCard: null,
      thirdPlaceTop: null,
    };
  }
  const maxMatches = Math.max(...mainRounds.map((round) => round.matches.length), 1);
  let height = BRACKET_TOP * 2 + (maxMatches - 1) * BRACKET_STEP + CARD_HEIGHT;
  // Buffer on the right so the Final card's glow has room and isn't clipped at the board edge.
  const width = (mainRounds.length - 1) * LANE_WIDTH + CARD_WIDTH + 46;
  const lanes = mainRounds.map((round, roundIndex) => {
    const multiplier = 2 ** roundIndex;
    return {
      ...round,
      roundIndex,
      x: roundIndex * LANE_WIDTH,
      cards: round.matches.map((match, matchIndex) => ({
        match,
        x: roundIndex * LANE_WIDTH,
        y: BRACKET_TOP + matchIndex * BRACKET_STEP * multiplier + ((multiplier - 1) * BRACKET_STEP) / 2,
      })),
    };
  });

  const connectorPaths = lanes.slice(0, -1).flatMap((lane, roundIndex) => {
    const nextLane = lanes[roundIndex + 1];
    return lane.cards.map((card, matchIndex) => {
      const target = nextLane.cards[Math.floor(matchIndex / 2)];
      if (!target) return null;

      const startX = card.x + CARD_WIDTH;
      const startY = card.y + CARD_HEIGHT / 2;
      const endX = target.x;
      const endY = target.y + CARD_HEIGHT / 2;
      const midX = startX + (endX - startX) / 2;
      const dirY = endY >= startY ? 1 : -1;
      const r = Math.max(0, Math.min(14, Math.abs(endY - startY) / 2, Math.abs(midX - startX)));

      // Clean orthogonal elbow with rounded corners (classic bracket routing).
      const d =
        r < 1
          ? `M ${startX} ${startY} H ${endX}`
          : `M ${startX} ${startY} H ${midX - r} ` +
            `Q ${midX} ${startY} ${midX} ${startY + dirY * r} ` +
            `V ${endY - dirY * r} ` +
            `Q ${midX} ${endY} ${midX + r} ${endY} ` +
            `H ${endX}`;

      return {
        key: `${lane.label}-${card.match.id}`,
        d,
      };
    }).filter(Boolean);
  });

  const finalLane = lanes[lanes.length - 1];
  const finalCard = finalLane?.cards?.[0];
  let thirdPlaceTop = null;
  if (placementRound?.matches?.[0] && finalCard) {
    thirdPlaceTop = finalCard.y + CARD_HEIGHT + THIRD_PLACE_GAP;
    // Reserve for the "Third Place" label + the card + a comfortable bottom pad.
    height = Math.max(height, thirdPlaceTop + THIRD_PLACE_LABEL_HEIGHT + CARD_HEIGHT + 32);
  }

  return {
    placementMatch: placementRound?.matches?.[0] || null,
    lanes,
    connectorPaths,
    height,
    width,
    finalCard,
    thirdPlaceTop,
  };
}

function BracketBoard({ rounds, open, onToggle, onSelect }) {
  const hasRounds = rounds.length > 0;
  const geometry = hasRounds ? buildPyramidGeometry(rounds) : null;
  const totalMatches = rounds.reduce((sum, round) => sum + round.matches.length, 0);

  return (
    <section className="bracket-shell" aria-labelledby="bracket-title">
      <div className="section-heading">
        <div>
          <h2 id="bracket-title">FIFA World Cup Pyramid</h2>
          <p>Knockout paths converge into the Final. Collapse the bracket to focus on live scores.</p>
        </div>
        <button className="collapse-toggle" type="button" onClick={onToggle} aria-expanded={open}>
          <ChevronDown aria-hidden="true" className={open ? "rot-open" : "rot-closed"} />
          {open ? "Hide" : "Show"} bracket
        </button>
      </div>

      {!hasRounds ? (
        <div className="empty-state compact-empty">
          <Trophy aria-hidden="true" />
          <h2>FIFA bracket is loading</h2>
          <p>The World Cup knockout board will fill when FIFA returns those matches.</p>
        </div>
      ) : open ? (
        <>
        <p className="bracket-hint">Swipe to explore the full bracket →</p>
        <div className="bracket-scroll" role="region" aria-label="Scrollable FIFA World Cup pyramid bracket">
          <div
            className="pyramid-board"
            style={{
              "--board-width": `${geometry.width}px`,
              "--board-height": `${geometry.height}px`,
              "--card-width": `${CARD_WIDTH}px`,
              "--card-height": `${CARD_HEIGHT}px`,
            }}
          >
            <svg className="connector-layer" viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true">
              {geometry.connectorPaths.map((path) => (
                <path key={path.key} d={path.d} />
              ))}
            </svg>

            {geometry.lanes.map((lane) => (
              <section
                className={`bracket-lane lane-${lane.roundIndex} ${lane.roundIndex === geometry.lanes.length - 1 ? "final-lane" : ""}`}
                key={lane.label}
                style={{ left: lane.x }}
                aria-labelledby={`round-${lane.roundIndex}`}
              >
                <div className="round-title">
                  <h3 className="round-label" id={`round-${lane.roundIndex}`}>{lane.label}</h3>
                  <span>{lane.matches.length} matches</span>
                </div>
                {lane.cards.map((card) => (
                  <div className="pyramid-card-slot" key={card.match.id} style={{ top: card.y }}>
                    <MatchCard
                      match={card.match}
                      roundIndex={lane.roundIndex}
                      isLastRound={lane.roundIndex === geometry.lanes.length - 1}
                      variant="pyramid-card"
                      onSelect={onSelect}
                    />
                  </div>
                ))}
              </section>
            ))}

            {geometry.placementMatch && geometry.finalCard ? (
              <aside
                className="third-place-card"
                style={{ left: geometry.finalCard.x, top: geometry.thirdPlaceTop }}
              >
                <span>Third Place</span>
                <MatchCard
                  match={geometry.placementMatch}
                  roundIndex={geometry.lanes.length}
                  isLastRound
                  variant="pyramid-card compact-card"
                  onSelect={onSelect}
                />
              </aside>
            ) : null}
          </div>
        </div>
        </>
      ) : (
        <div className="bracket-collapsed-note">Bracket hidden — {totalMatches} knockout matches tracked.</div>
      )}
    </section>
  );
}

const EVENT_GRID_CAP = 12;

function EventGrid({ feed, onSelect }) {
  const [showAll, setShowAll] = useState(false);
  const total = feed.events.length;
  const visibleEvents = showAll ? feed.events : feed.events.slice(0, EVENT_GRID_CAP);

  return (
    <section className="event-board" aria-labelledby="events-title">
      <div className="section-heading">
        <div>
          <h2 id="events-title">{feed.sport.label} Live Board</h2>
          <p>Tap any matchup for team & player stats, injuries, odds and win probability.</p>
        </div>
        <span className="source-pill">{formatSourceCount(feed.sport)}</span>
      </div>
      {visibleEvents.length ? (
        <>
          <div className="event-grid">
            {visibleEvents.map((event, index) => (
              <div key={event.id} style={{ animationDelay: `${Math.min(index * 45, 540)}ms` }}>
                <MatchCard match={event} variant="event-card" onSelect={onSelect} />
              </div>
            ))}
          </div>
          {total > EVENT_GRID_CAP ? (
            <div className="event-grid-more">
              <button className="show-more" type="button" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${total} games`}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state compact-empty">
          <Activity aria-hidden="true" />
          <h2>No events in this feed yet</h2>
          <p>{feed.error || `${feed.sport.source} returned an empty scoreboard.`}</p>
        </div>
      )}
    </section>
  );
}

function InfoPanel({ feed, onSelect }) {
  const liveMatches = getLiveMatches(feed.events);
  const todayMatches = getTodayMatches(feed.events);
  const nextMatches = getNextMatches(feed.events, new Date(), 4);
  const coverage = feed.error ? 0 : feed.summary.total ? 100 : 60;

  return (
    <aside className="side-panel" aria-label={`${feed.sport.label} status`}>
      <section className={`panel-section live-panel ${liveMatches.length ? "has-live" : ""}`}>
        <div className="panel-heading">
          <Radio aria-hidden="true" />
          <h2>Live Matches</h2>
        </div>
        {liveMatches.length ? (
          <div className="today-list">
            {liveMatches.slice(0, 4).map((match) => (
              <button className="today-match live-row" key={match.id} type="button" onClick={() => onSelect(match)}>
                <div>
                  <span className="dot live" />
                  <strong>{match.clockLabel}</strong>
                </div>
                <p>{match.title}</p>
                <small>{match.city || match.venue || match.source}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="next-up-list">
            <p className="panel-empty">No active live event in {feed.sport.label} right now.</p>
            {nextMatches.slice(0, 3).map((match) => (
              <button key={match.id} type="button" onClick={() => onSelect(match)}>
                <span>{match.sportLabel}</span>
                <strong>{match.title}</strong>
                <small>{formatKickoff(match.date)}</small>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel-section">
        <div className="panel-heading">
          <CalendarDays aria-hidden="true" />
          <h2>Today</h2>
        </div>
        <div className="today-list">
          {todayMatches.length === 0 ? (
            <p className="panel-empty">No {feed.sport.label} events listed for today.</p>
          ) : (
            todayMatches.slice(0, 5).map((match) => (
              <button className="today-match" key={match.id} type="button" onClick={() => onSelect(match)}>
                <div>
                  <span className={`dot ${match.status}`} />
                  <strong>{match.status === "live" ? match.clockLabel : formatShortKickoff(match.date)}</strong>
                </div>
                <p>{match.title}</p>
                <small>{match.status === "completed" ? match.statusLabel : match.city || "Scheduled"}</small>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="panel-section">
        <div className="panel-heading">
          <Activity aria-hidden="true" />
          <h2>Feed Health</h2>
        </div>
        <dl className="feed-list">
          <div>
            <dt>Source</dt>
            <dd>{feed.sport.source}</dd>
          </div>
          <div>
            <dt>Total events</dt>
            <dd>{feed.summary.total}</dd>
          </div>
          <div>
            <dt>Next</dt>
            <dd>{feed.summary.nextTitle || "TBD"}</dd>
          </div>
        </dl>
        <div className="feed-health-bar">
          <div className="fhb-track">
            <div className="fhb-fill" style={{ width: `${coverage}%` }} />
          </div>
          <div className="fhb-label">
            <span>Data coverage</span>
            <span className={feed.error ? "" : "fhb-ok"}>{feed.error ? "Degraded" : "Healthy"}</span>
          </div>
        </div>
      </section>

      <section className="panel-section pitch-card">
        <Shield aria-hidden="true" />
        <h2>{feed.sport.label} Mode</h2>
        <p>{feed.error || `${feed.sport.name} refreshes automatically every minute from ${feed.sport.source}.`}</p>
      </section>
    </aside>
  );
}

function NewsSection({ sport }) {
  const { loading, data: items } = useCachedSportData(sport, newsUrlForSport, (p) => normalizeNews(p, 8), newsCache, []);

  return (
    <section className="news-board" aria-labelledby="news-title">
      <div className="section-heading">
        <div>
          <h2 id="news-title">
            <Newspaper aria-hidden="true" /> {sport.label} Headlines
          </h2>
          <p>Latest stories and breaking news for {sport.name}.</p>
        </div>
        <span className="accent-rule" aria-hidden="true" />
      </div>
      {loading ? (
        <div className="news-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="sk news-skeleton" key={index} />
          ))}
        </div>
      ) : items.length ? (
        <div className="news-grid">
          {items.map((article) => (
            <a
              className="news-card"
              key={article.id}
              href={article.link || "#"}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${article.headline} (opens in a new tab)`}
            >
              {article.image ? (
                <div className="news-thumb" style={{ backgroundImage: `url(${article.image})` }} />
              ) : (
                <div className="news-thumb placeholder" aria-hidden="true">
                  <Newspaper />
                </div>
              )}
              <div className="news-body">
                <h3>{article.headline}</h3>
                {article.description ? <p>{article.description}</p> : null}
                <div className="news-meta">
                  <span>{formatRelative(article.published)}</span>
                  <ExternalLink aria-hidden="true" />
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="empty-state compact-empty">
          <Newspaper aria-hidden="true" />
          <h2>No headlines right now</h2>
          <p>News for {sport.label} will appear here when the feed publishes stories.</p>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── Stats Lab ───────────────────────── */

function Collapsible({ title, icon: Icon, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);

  const toggle = () => {
    setOpen((value) => {
      const next = !value;
      if (next) setMounted(true);
      return next;
    });
  };

  return (
    <section className={`lab-section ${open ? "open" : ""}`}>
      <button className="lab-head" type="button" onClick={toggle} aria-expanded={open}>
        <span className="lab-title">
          {Icon ? <Icon aria-hidden="true" /> : null}
          {title}
          {badge ? <span className="lab-badge">{badge}</span> : null}
        </span>
        <ChevronDown aria-hidden="true" className={`lab-chevron ${open ? "rot-open" : "rot-closed"}`} />
      </button>
      <div className={`lab-body ${open ? "open" : ""}`}>
        <div className="lab-body-inner">{mounted ? children : null}</div>
      </div>
    </section>
  );
}

function LabSkeleton({ rows = 4 }) {
  return (
    <div className="lab-loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="sk lab-skel-row" key={index} />
      ))}
    </div>
  );
}

function StandingsGroup({ group }) {
  const [showAll, setShowAll] = useState(false);
  const teams = showAll ? group.teams : group.teams.slice(0, 5);

  return (
    <div className="standings-group">
      <h4>{group.groupName}</h4>
      <div className="standings-table">
        <div className="st-row st-head">
          <span>#</span>
          <span>Team</span>
          <span>{group.isSoccer ? "Pts" : "W-L"}</span>
          <span>{group.isSoccer ? "W-L-D" : "Strk"}</span>
        </div>
        {teams.map((team, index) => (
          <div className="st-row" key={`${team.abbr}-${index}`}>
            <span className="st-rank">{index + 1}</span>
            <span className="st-team">
              {team.logo ? <img src={team.logo} alt="" loading="lazy" /> : null}
              <span>{team.name}</span>
            </span>
            <span className="st-rec">{group.isSoccer ? (team.points ?? "—") : recordLabel(team, false)}</span>
            <span className="st-extra">
              {group.isSoccer
                ? [team.wins, team.losses, team.ties].every((v) => v !== null)
                  ? `${team.wins}-${team.losses}-${team.ties}`
                  : "—"
                : team.streak || (team.winPct != null ? team.winPct.toFixed(3).replace(/^0/, "") : "—")}
            </span>
          </div>
        ))}
      </div>
      {group.teams.length > 5 ? (
        <button className="show-more" type="button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show less" : `Show all ${group.teams.length}`}
        </button>
      ) : null}
    </div>
  );
}

function StandingsPanel({ sport, defaultOpen = false }) {
  const { loading, data: groups } = useCachedSportData(
    sport,
    standingsUrlForSport,
    normalizeStandings,
    standingsCache,
    [],
  );

  return (
    <Collapsible title="Standings" icon={ListOrdered} defaultOpen={defaultOpen}>
      {loading ? (
        <LabSkeleton rows={5} />
      ) : groups.length ? (
        <div className="standings-groups">
          {groups.map((group) => (
            <StandingsGroup key={group.groupName} group={group} />
          ))}
        </div>
      ) : (
        <p className="detail-empty">Standings aren't available for {sport.label} right now.</p>
      )}
    </Collapsible>
  );
}

function LeadersPanel({ sport, defaultOpen = false }) {
  const { loading, data: categories } = useCachedSportData(
    sport,
    leadersUrlForSport,
    (p) => normalizeLeaders(p, 12, 3),
    leadersCache,
    [],
  );
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? categories : categories.slice(0, 6);

  return (
    <Collapsible title="League Leaders" icon={Crown} defaultOpen={defaultOpen}>
      {loading ? (
        <LabSkeleton rows={4} />
      ) : categories.length ? (
        <>
          <div className="leaders-grid-lab">
            {visible.map((category) => (
              <div className="leader-card" key={category.category}>
                <h4>{category.category}</h4>
                {category.leaders.map((leader, index) => (
                  <div className="leader-line" key={`${leader.athlete}-${index}`}>
                    <span className="ll-rank">{index + 1}</span>
                    <span className="ll-name">
                      {leader.athlete}
                      {leader.team ? <em> · {leader.team}</em> : null}
                    </span>
                    <span className="ll-val">{leader.value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {categories.length > 6 ? (
            <button className="show-more" type="button" onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Show fewer categories" : `Show all ${categories.length} categories`}
            </button>
          ) : null}
        </>
      ) : (
        <p className="detail-empty">League leaders aren't available for {sport.label} right now.</p>
      )}
    </Collapsible>
  );
}

function VegasPanel({ feed, onSelect }) {
  const candidates = useMemo(() => {
    const now = new Date();
    const live = getLiveMatches(feed.events);
    const next = getNextMatches(feed.events, now, 8);
    return [...live, ...next].slice(0, 6);
  }, [feed.events]);
  const { loading, rows } = useOddsBoard(candidates);

  return (
    <Collapsible title="Vegas Lines" icon={DollarSign} badge="O/U" defaultOpen>
      {loading ? (
        <LabSkeleton rows={4} />
      ) : rows.length ? (
        <div className="vegas-board">
          <div className="vegas-row vegas-head">
            <span>Matchup</span>
            <span>O/U</span>
            <span>Spread</span>
            <span>ML H/A</span>
          </div>
          {rows.map(({ event, odds }) => (
            <button className="vegas-row" key={event.id} type="button" onClick={() => onSelect(event)}>
              <span className="vg-match">
                <span aria-hidden="true">{themeFor(event.sportId).icon}</span>
                {event.home.abbreviation} v {event.away.abbreviation}
              </span>
              <span className="vg-ou">{odds.overUnder ?? "—"}</span>
              <span className="vg-spread">{odds.details || (odds.spread !== null ? odds.spread : "—")}</span>
              <span className="vg-ml">{formatMoneyline(odds.homeMoneyLine)} / {formatMoneyline(odds.awayMoneyLine)}</span>
            </button>
          ))}
          <small className="vegas-note">Odds via ESPN · for entertainment only · 21+ · Gambling problem? Call 1-800-GAMBLER.</small>
        </div>
      ) : (
        <p className="detail-empty">No betting lines posted for upcoming {feed.sport.label} games yet.</p>
      )}
    </Collapsible>
  );
}

function ReferencesPanel({ sport }) {
  const links = STATS_REFERENCE_LINKS[sport.id] || [];
  if (!links.length) return null;

  return (
    <Collapsible title="Stats References" icon={Link2} badge="External" defaultOpen={false}>
      <div className="ref-links">
        {links.map((link) => (
          <a
            className="ref-link"
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${link.siteName} — ${link.note} (opens in a new tab)`}
          >
            <span className="rl-name">
              {link.siteName}
              <ExternalLink aria-hidden="true" />
            </span>
            <small>{link.note}</small>
          </a>
        ))}
      </div>
    </Collapsible>
  );
}

/* ───────────────────────── Game detail modal ───────────────────────── */

function WinProbability({ event, prob }) {
  if (!prob) {
    return <p className="detail-empty">Win probability isn't available for this matchup yet.</p>;
  }
  return (
    <div className="winprob">
      <div className="winprob-bar">
        <div className="winprob-fill home" style={{ width: `${prob.homePct}%` }}>
          {prob.homePct >= 16 ? `${prob.homePct}%` : ""}
        </div>
        <div className="winprob-fill away" style={{ width: `${prob.awayPct}%` }}>
          {prob.awayPct >= 16 ? `${prob.awayPct}%` : ""}
        </div>
      </div>
      <div className="winprob-legend">
        <span><span className="swatch home" /> {event.home.shortName} {prob.homePct}%</span>
        <span>{event.away.shortName} {prob.awayPct}% <span className="swatch away" /></span>
      </div>
      <small className="winprob-source">{prob.source}</small>
    </div>
  );
}

function BettingPanel({ event, odds }) {
  if (!odds) {
    return <p className="detail-empty">Betting lines haven't been posted for this matchup yet.</p>;
  }
  return (
    <div className="betting">
      <div className="betting-grid">
        <div className="betting-cell highlight">
          <span className="bc-label">Over / Under</span>
          <strong>{odds.overUnder ?? "—"}</strong>
          <small>O {formatMoneyline(odds.overOdds)} · U {formatMoneyline(odds.underOdds)}</small>
        </div>
        <div className="betting-cell">
          <span className="bc-label">Spread</span>
          <strong>{odds.details || (odds.spread !== null ? odds.spread : "—")}</strong>
          <small>{odds.favorite ? `${odds.favorite === "home" ? event.home.shortName : event.away.shortName} favored` : "Pick 'em"}</small>
        </div>
        <div className="betting-cell">
          <span className="bc-label">{event.home.shortName} ML</span>
          <strong>{formatMoneyline(odds.homeMoneyLine)}</strong>
        </div>
        <div className="betting-cell">
          <span className="bc-label">{event.away.shortName} ML</span>
          <strong>{formatMoneyline(odds.awayMoneyLine)}</strong>
        </div>
      </div>
      <small className="betting-source">Lines via {odds.provider} · entertainment only · 21+ · 1-800-GAMBLER.</small>
    </div>
  );
}

function TeamStatsTable({ event, rows }) {
  if (!rows.length) {
    return <p className="detail-empty">Team stats will appear once the game is underway.</p>;
  }
  return (
    <div className="stats-table">
      <div className="stats-head">
        <span>{event.home.abbreviation}</span>
        <span className="stats-metric">Stat</span>
        <span>{event.away.abbreviation}</span>
      </div>
      {rows.map((row) => (
        <div className="stats-row" key={row.label}>
          <span className="stats-home">{row.home}</span>
          <span className="stats-metric">{row.label}</span>
          <span className="stats-away">{row.away}</span>
        </div>
      ))}
    </div>
  );
}

function LeadersColumn({ team }) {
  const leaders = team.leaders || [];
  if (!leaders.length) return null;
  return (
    <div className="leaders-col">
      <div className="leaders-team">
        {team.flagUrl ? <img src={team.flagUrl} alt="" /> : <span className="flag-placeholder">{team.abbreviation.slice(0, 2)}</span>}
        <strong>{team.shortName}</strong>
      </div>
      {leaders.map((leader) => (
        <div className="leader-row" key={`${team.id}-${leader.category}`}>
          <span className="leader-cat">{leader.category}</span>
          <span className="leader-name">{leader.athlete}</span>
          <span className="leader-val">{leader.value}</span>
        </div>
      ))}
    </div>
  );
}

function InjuriesPanel({ groups }) {
  if (!groups.length) {
    return <p className="detail-empty">No reported injuries for either side.</p>;
  }
  return (
    <div className="injuries">
      {groups.map((group) => (
        <div className="injury-team" key={group.teamAbbr}>
          <strong>{group.teamAbbr || group.teamName}</strong>
          <ul>
            {group.players.map((player) => (
              <li key={`${group.teamAbbr}-${player.name}`}>
                <span className="inj-name">{player.name}{player.position ? ` · ${player.position}` : ""}</span>
                <span className="inj-status">{player.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function GameDetailModal({ event, onClose }) {
  const { loading, data, error } = useGameDetail(event);
  const sheetRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    sheetRef.current?.focus();

    const handler = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [onClose]);

  if (!event) return null;
  const theme = themeFor(event.sportId);
  const isLive = event.status === "live";
  const hasLeaders = (event.home.leaders?.length || 0) + (event.away.leaders?.length || 0) > 0;
  const unsupported = error === "unsupported";

  return (
    <div className="modal-overlay" style={accentVars(event.sportId)} onClick={onClose}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label={event.title} ref={sheetRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close details">
          <X aria-hidden="true" />
        </button>

        <header className="detail-header">
          <span className="detail-eyeline">
            <span className="detail-sport" aria-hidden="true">{theme.icon}</span>
            {event.sportLabel} · {event.stage}
          </span>
          <div className="detail-score">
            <div className="detail-team">
              {event.home.flagUrl ? <img src={event.home.flagUrl} alt="" /> : <span className="flag-placeholder">{event.home.abbreviation.slice(0, 2)}</span>}
              <div>
                <strong>{event.home.shortName}</strong>
                {event.home.record ? <small>{event.home.record}</small> : null}
              </div>
            </div>
            <div className="detail-center">
              <span className="detail-nums">
                {event.homeScore ?? "-"} <span className="detail-dash">:</span> {event.awayScore ?? "-"}
              </span>
              <span className={`detail-state ${isLive ? "live" : ""}`}>
                {isLive ? event.clockLabel : event.status === "completed" ? "Final" : formatShortKickoff(event.date)}
              </span>
            </div>
            <div className="detail-team away">
              {event.away.flagUrl ? <img src={event.away.flagUrl} alt="" /> : <span className="flag-placeholder">{event.away.abbreviation.slice(0, 2)}</span>}
              <div>
                <strong>{event.away.shortName}</strong>
                {event.away.record ? <small>{event.away.record}</small> : null}
              </div>
            </div>
          </div>
          <p className="detail-sub">{formatKickoff(event.date)}{event.city ? ` · ${event.city}` : event.venue ? ` · ${event.venue}` : ""}</p>
        </header>

        <div className="detail-body">
          {unsupported ? (
            <div className="detail-block">
              <p className="detail-empty">
                Deep stats, odds and injuries aren't available for {event.sportLabel} matches. Check the headlines below for the latest.
              </p>
            </div>
          ) : loading ? (
            <div className="detail-loading">
              {Array.from({ length: 4 }).map((_, index) => (
                <div className="sk detail-skeleton" key={index} />
              ))}
            </div>
          ) : error ? (
            <div className="detail-block">
              <p className="detail-empty">Couldn't load detailed stats for this game. {error}</p>
            </div>
          ) : data ? (
            <>
              <div className="detail-block">
                <h3 className="detail-title"><Percent aria-hidden="true" /> Who's winning it</h3>
                <WinProbability event={event} prob={data.winProbability} />
              </div>

              <div className="detail-block">
                <h3 className="detail-title"><DollarSign aria-hidden="true" /> Key over/unders & lines</h3>
                <BettingPanel event={event} odds={data.odds} />
              </div>

              <div className="detail-block">
                <h3 className="detail-title"><BarChart3 aria-hidden="true" /> Team stats</h3>
                <TeamStatsTable event={event} rows={data.teamStats} />
              </div>

              {hasLeaders ? (
                <div className="detail-block">
                  <h3 className="detail-title"><Users aria-hidden="true" /> Player leaders</h3>
                  <div className="leaders">
                    <LeadersColumn team={event.home} />
                    <LeadersColumn team={event.away} />
                  </div>
                </div>
              ) : null}

              <div className="detail-block">
                <h3 className="detail-title"><HeartPulse aria-hidden="true" /> Injury report</h3>
                <InjuriesPanel groups={data.injuries} />
              </div>

              {data.news.length ? (
                <div className="detail-block">
                  <h3 className="detail-title"><Newspaper aria-hidden="true" /> Game news</h3>
                  <div className="detail-news">
                    {data.news.map((article) => (
                      <a
                        key={article.id}
                        href={article.link || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${article.headline} (opens in a new tab)`}
                      >
                        <span>{article.headline}</span>
                        <small>{formatRelative(article.published)}</small>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Landing ───────────────────────── */

// Simple night soccer stadium with floodlights — pure SVG, no network dependency.
function HeroStadium() {
  const towers = [
    { x: 150, y: 150 },
    { x: 405, y: 120 },
    { x: 1035, y: 120 },
    { x: 1290, y: 150 },
  ];
  return (
    <svg className="hero-stadium" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="bg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060b18" />
          <stop offset="0.5" stopColor="#0a1830" />
          <stop offset="1" stopColor="#103358" />
        </linearGradient>
        <radialGradient id="bg-lamp" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff8da" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ffe9a6" stopOpacity="0.4" />
          <stop offset="1" stopColor="#ffe9a6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bg-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" stopOpacity="0.16" />
          <stop offset="1" stopColor="#fff3c4" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bg-pitch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e7a44" />
          <stop offset="1" stopColor="#0a4527" />
        </linearGradient>
      </defs>

      <rect width="1440" height="900" fill="url(#bg-sky)" />

      <g fill="#cfe0ff" opacity="0.5">
        <circle cx="220" cy="70" r="1.5" />
        <circle cx="540" cy="48" r="1.2" />
        <circle cx="760" cy="80" r="1.6" />
        <circle cx="980" cy="54" r="1.3" />
        <circle cx="1180" cy="86" r="1.5" />
        <circle cx="120" cy="120" r="1.1" />
        <circle cx="1320" cy="70" r="1.4" />
      </g>

      {/* stadium bowl silhouette */}
      <ellipse cx="720" cy="760" rx="980" ry="330" fill="#0a1528" />
      <ellipse cx="720" cy="735" rx="820" ry="262" fill="#0d1d34" />

      {/* light cones + floodlight towers */}
      {towers.map((t) => {
        const lean = t.x < 720 ? 70 : -70;
        return (
          <g key={t.x}>
            <polygon
              points={`${t.x},${t.y + 26} ${t.x + 150 + lean},560 ${t.x - 150 + lean},560`}
              fill="url(#bg-cone)"
            />
            <circle cx={t.x} cy={t.y} r="150" fill="url(#bg-lamp)" className="stadium-lamp" />
            <rect x={t.x - 5} y={t.y} width="10" height="600" fill="#0c1726" />
            <rect x={t.x - 34} y={t.y - 26} width="68" height="40" rx="7" fill="#16263c" stroke="#33506f" strokeWidth="1.5" />
            <g fill="#fff7d6">
              <circle cx={t.x - 21} cy={t.y - 12} r="3.4" />
              <circle cx={t.x - 7} cy={t.y - 12} r="3.4" />
              <circle cx={t.x + 7} cy={t.y - 12} r="3.4" />
              <circle cx={t.x + 21} cy={t.y - 12} r="3.4" />
              <circle cx={t.x - 21} cy={t.y + 2} r="3.4" />
              <circle cx={t.x - 7} cy={t.y + 2} r="3.4" />
              <circle cx={t.x + 7} cy={t.y + 2} r="3.4" />
              <circle cx={t.x + 21} cy={t.y + 2} r="3.4" />
            </g>
          </g>
        );
      })}

      {/* pitch */}
      <path d="M 300 900 L 1140 900 L 1010 620 L 430 620 Z" fill="url(#bg-pitch)" />
      <g opacity="0.16" fill="#ffffff">
        <path d="M 430 620 L 470 620 L 388 900 L 300 900 Z" />
        <path d="M 540 620 L 580 620 L 560 900 L 476 900 Z" />
        <path d="M 650 620 L 690 620 L 732 900 L 652 900 Z" />
        <path d="M 760 620 L 800 620 L 904 900 L 828 900 Z" />
        <path d="M 870 620 L 910 620 L 1076 900 L 1004 900 Z" />
      </g>
      <g fill="none" stroke="#dff0e6" strokeWidth="2.5" opacity="0.55">
        <path d="M 430 620 L 1010 620 L 1140 900 L 300 900 Z" />
        <line x1="365" y1="760" x2="1075" y2="760" />
        <ellipse cx="720" cy="760" rx="86" ry="30" />
        <path d="M 600 900 L 620 818 L 820 818 L 840 900" />
      </g>
    </svg>
  );
}

function Landing({ feeds, onEnter, totalLive }) {
  return (
    <div className="landing" style={accentVarsFrom(LANDING_ACCENT.accent, LANDING_ACCENT.accent2)}>
      <HeroStadium />
      <div className="landing-veil" aria-hidden="true" />
      <LiveTicker feeds={feeds} onSelect={(event) => onEnter(event.sportId)} />

      <div className="landing-body">
        <header className="landing-hero">
          <div className="hero-mark" aria-hidden="true">
            <Trophy />
          </div>
          <h1 className="hero-title">BRNDN</h1>
          <p className="hero-subtitle">Sports Tracker</p>
          <p className="hero-tagline">
            Live scores, Vegas lines, win probability and deep stats across every major sport — all on one screen.
          </p>
          <button className="hero-cta" type="button" onClick={() => onEnter()}>
            Enter Live Tracker
            <ArrowRight aria-hidden="true" />
          </button>
          <p className="hero-meta">
            <span className="hero-live-dot" aria-hidden="true" />
            {totalLive ? `${totalLive} games live right now` : "Auto-refreshing live feeds"} · 8 sports · free & real-time
          </p>
        </header>

        <section className="hero-sports" aria-label="Popular sports">
          {POPULAR_SPORTS.map((sportId) => {
            const sport = sportById(sportId);
            const feed = feeds[sportId] || emptyFeed(sport);
            const theme = themeFor(sportId);
            return (
              <button
                className="hero-sport-card"
                key={sportId}
                type="button"
                style={accentVarsFrom(theme.accent, theme.accent2)}
                onClick={() => onEnter(sportId)}
              >
                <span className="hsc-icon" aria-hidden="true">{theme.icon}</span>
                <span className="hsc-label">{sport.label}</span>
                <span className="hsc-meta">
                  {feed.summary.live ? (
                    <span className="hsc-live">
                      <span className="mini-dot" aria-hidden="true" /> {feed.summary.live} live
                    </span>
                  ) : (
                    <span className="hsc-count">{feed.summary.total} events</span>
                  )}
                </span>
                <ArrowRight className="hsc-arrow" aria-hidden="true" />
              </button>
            );
          })}
        </section>
      </div>

      <footer className="landing-foot">
        Tap any score above or a sport to jump straight into live tracking.
      </footer>

      <SiteFooter />
    </div>
  );
}

function SkeletonScreen() {
  return (
    <main className="skeleton-screen" aria-busy="true" aria-label="Loading sports data">
      <div className="sk sk-header">
        <div className="skeleton-brand" style={{ padding: 16 }}>
          <div className="sk sk-mark" />
          <div className="sk-lines">
            <div className="sk sk-line" />
            <div className="sk sk-line short" />
          </div>
        </div>
      </div>
      <div className="sk-tabs">
        {Array.from({ length: 8 }).map((_, index) => (
          <div className="sk sk-tab" key={index} />
        ))}
      </div>
      <div className="sk sk-command" />
      <div className="sk-stats">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="sk sk-stat" key={index} />
        ))}
      </div>
      <div className="sk sk-board" />
    </main>
  );
}

function AgeGate({ onConfirm }) {
  const [declined, setDeclined] = useState(false);
  const accent = accentVarsFrom(LANDING_ACCENT.accent, LANDING_ACCENT.accent2);

  if (declined) {
    return (
      <div className="age-gate" style={accent}>
        <div className="age-gate-card" role="alertdialog" aria-label="Age restriction">
          <div className="age-gate-mark" aria-hidden="true"><Shield /></div>
          <h1 className="age-gate-title">You must be {LEGAL_AGE}+</h1>
          <p className="age-gate-copy">
            BRNDN displays sports betting odds and is intended for adults of legal age. Please
            come back when you’re {LEGAL_AGE} or older.
          </p>
          <p className="age-gate-help">
            Gambling problem? Call <a href="tel:18004262537">1-800-GAMBLER</a> or visit{" "}
            <a href="https://www.ncpgambling.org" target="_blank" rel="noopener noreferrer">
              ncpgambling.org
            </a>
            .
          </p>
          <button className="age-gate-secondary" type="button" onClick={() => setDeclined(false)}>
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="age-gate" style={accent}>
      <div className="age-gate-card" role="dialog" aria-modal="true" aria-label="Age verification">
        <div className="age-gate-mark" aria-hidden="true"><Trophy /></div>
        <p className="age-gate-eyeline">BRNDN Sports Tracker</p>
        <h1 className="age-gate-title">Are you {LEGAL_AGE} or older?</h1>
        <p className="age-gate-copy">
          This site shows live sports betting odds — over/unders, spreads and moneylines — for news
          and entertainment. You must be {LEGAL_AGE}+ to enter.
        </p>
        <div className="age-gate-actions">
          <button
            className="age-gate-primary"
            type="button"
            onClick={() => {
              rememberAgeAck();
              onConfirm();
            }}
          >
            Yes, I’m {LEGAL_AGE}+ <ArrowRight aria-hidden="true" />
          </button>
          <button className="age-gate-secondary" type="button" onClick={() => setDeclined(true)}>
            No, I’m under {LEGAL_AGE}
          </button>
        </div>
        <p className="age-gate-help">
          21+ · Odds are for entertainment only · Gambling problem? Call{" "}
          <a href="tel:18004262537">1-800-GAMBLER</a>.
        </p>
        <p className="age-gate-legal">
          By entering you agree to our <a href="/terms.html">Terms</a> and{" "}
          <a href="/privacy.html">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="site-footer-rg">
        <Shield aria-hidden="true" />
        21+ · Odds shown are for news and entertainment only — BRNDN does not accept wagers.
        Gambling problem? Call <a href="tel:18004262537">1-800-GAMBLER</a>.
      </p>
      <nav className="site-footer-links" aria-label="Legal">
        <a href="/privacy.html">Privacy Policy</a>
        <a href="/terms.html">Terms of Use</a>
        <a href="/responsible-gaming.html">Responsible Gaming</a>
        <button className="footer-link-btn" type="button" onClick={requestConsentReopen}>
          Cookie settings
        </button>
      </nav>
      <p className="site-footer-disclosure">
        BRNDN may earn a commission from links to sportsbooks. Scores and odds are sourced from
        public data feeds for informational purposes; BRNDN is not affiliated with, endorsed by, or
        sponsored by any league, team, or sportsbook.
      </p>
    </footer>
  );
}

function ConsentBanner({ open, onChoose }) {
  if (!open) return null;
  return (
    <div
      className="consent-banner"
      role="dialog"
      aria-label="Cookie consent"
      style={accentVarsFrom(LANDING_ACCENT.accent, LANDING_ACCENT.accent2)}
    >
      <div className="consent-inner">
        <p className="consent-text">
          We use essential cookies to run BRNDN. With your permission we’ll also use analytics and
          advertising cookies to improve and support the site. See our{" "}
          <a href="/privacy.html">Privacy Policy</a>.
        </p>
        <div className="consent-actions">
          <button className="consent-btn consent-decline" type="button" onClick={() => onChoose(false)}>
            Decline
          </button>
          <button className="consent-btn consent-accept" type="button" onClick={() => onChoose(true)}>
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { feeds, lastUpdated, nextRefreshAt, refreshing, refresh } = useSportsFeeds();
  const initialRoute = parseRoute(typeof window === "undefined" ? "/" : window.location.pathname);
  const [entered, setEntered] = useState(initialRoute.entered);
  const [ageOk, setAgeOk] = useState(hasAgeAck);
  const [consentOpen, setConsentOpen] = useState(() => !hasConsentDecision());
  const [activeSportId, setActiveSportId] = useState(initialRoute.sportId || DEFAULT_SPORT_ID);
  const [selectedRef, setSelectedRef] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  // Bracket takes a lot of space — start collapsed on phones, open on desktop.
  const [bracketOpen, setBracketOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth > 840,
  );
  const activeSport = sportById(activeSportId);
  const activeFeed = feeds[activeSportId] || emptyFeed(activeSport);
  const rounds = useMemo(() => buildKnockoutRounds(activeFeed.events), [activeFeed.events]);
  const loading = Object.values(feeds).every((feed) => feed.loading);
  const errorCount = Object.values(feeds).filter((feed) => feed.error).length;
  const totalLive = useMemo(
    () => Object.values(feeds).reduce((sum, feed) => sum + (feed.summary?.live || 0), 0),
    [feeds],
  );

  // Keep the open modal in sync with refreshes by re-resolving the event by id each render.
  const selectEvent = useCallback((event) => {
    if (event) {
      setSelectedRef({ id: event.id, sportId: event.sportId, snapshot: event });
      track("game_opened", { sport: event.sportId, status: event.status });
    }
  }, []);
  const closeEvent = useCallback(() => setSelectedRef(null), []);
  const selectedEvent = useMemo(() => {
    if (!selectedRef) return null;
    const list = feeds[selectedRef.sportId]?.events || [];
    return list.find((evt) => evt.id === selectedRef.id) || selectedRef.snapshot;
  }, [selectedRef, feeds]);

  // Lock body scroll (and hide the bottom nav) while the modal or drawer is open.
  useEffect(() => {
    const locked = Boolean(selectedRef) || navOpen;
    document.body.style.overflow = locked ? "hidden" : "";
    document.body.classList.toggle("is-locked", locked);
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("is-locked");
    };
  }, [selectedRef, navOpen]);

  // Let the footer "Cookie settings" link re-open the consent banner.
  useEffect(() => onConsentReopen(() => setConsentOpen(true)), []);

  // Start consent-gated analytics once, and record the initial open.
  useEffect(() => {
    initAnalytics();
    track("app_open");
  }, []);

  // Sync browser back/forward with the active route (/sportId <-> state).
  useEffect(() => {
    const onPop = () => {
      const route = parseRoute(window.location.pathname);
      setEntered(route.entered);
      if (route.sportId) setActiveSportId(route.sportId);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Normalize an unknown deep link (e.g. /foo) back to the landing URL once.
  useEffect(() => {
    if (typeof window !== "undefined" && !initialRoute.entered && window.location.pathname !== "/") {
      window.history.replaceState({}, "", "/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep document <title> + canonical/social meta in sync with the route.
  useEffect(() => {
    updateRouteSeo(entered ? activeSport : null);
  }, [entered, activeSportId, activeSport]);

  // Switch sports from inside the tracker (tabs/drawer): update state + URL.
  const selectSport = useCallback((sportId) => {
    setActiveSportId(sportId);
    setEntered(true);
    pushPath(`/${sportId}`);
    track("select_sport", { sport: sportId });
  }, []);

  const enterApp = useCallback(
    (sportId) => {
      const target = sportId || activeSportId;
      setActiveSportId(target);
      setEntered(true);
      pushPath(`/${target}`);
      track("enter_tracker", sportId ? { sport: sportId } : undefined);
      window.scrollTo({ top: 0, behavior: "auto" });
    },
    [activeSportId],
  );

  const goHome = useCallback(() => {
    setEntered(false);
    pushPath("/");
  }, []);

  const chooseConsent = useCallback((granted) => {
    setConsent(granted);
    setConsentOpen(false);
    track("consent", { granted: granted ? "accept" : "decline" });
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (!ageOk) return <AgeGate onConfirm={() => setAgeOk(true)} />;

  if (loading) return <SkeletonScreen />;

  if (!entered) {
    return (
      <>
        <Landing feeds={feeds} onEnter={enterApp} totalLive={totalLive} />
        <ConsentBanner open={consentOpen} onChoose={chooseConsent} />
      </>
    );
  }

  return (
    <div className="app" style={accentVars(activeSportId)}>
      <div className="ambient-horizon" aria-hidden="true" />

      <Header
        refreshing={refreshing}
        lastUpdated={lastUpdated}
        nextRefreshAt={nextRefreshAt}
        onRefresh={refresh}
        liveCount={totalLive}
        onHome={goHome}
      />

      <LiveTicker feeds={feeds} onSelect={selectEvent} />

      {errorCount ? (
        <div className="error-banner" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>{errorCount} sports feed{errorCount === 1 ? "" : "s"} failed to refresh. Last successful data remains visible where available.</span>
        </div>
      ) : null}

      <main className="dashboard-layout">
        <SportsTabs activeSportId={activeSportId} feeds={feeds} onSelect={selectSport} />

        <div className="sport-content" key={activeSportId}>
          <LiveCommandCenter feed={activeFeed} onSelect={selectEvent} />

          <section className="scoreboard-strip" aria-label={`${activeFeed.sport.label} summary`}>
            <StatCard icon={Trophy} label="Events" value={activeFeed.summary.total} tone="gold" />
            <StatCard icon={Zap} label="Live" value={activeFeed.summary.live} tone="red" hasLive={activeFeed.summary.live > 0} />
            <StatCard icon={CheckCircle2} label="Completed" value={activeFeed.summary.completed} tone="emerald" />
            <StatCard icon={Clock3} label="Upcoming" value={activeFeed.summary.upcoming} tone="blue" />
          </section>

          {/* Promoted team & player stats: surfaced right under the live score
              (previously buried at the bottom of the collapsed Stats Lab). Each
              panel is gated so sports without the data don't render an empty
              tile — e.g. Tennis has neither, Golf has leaders but no standings. */}
          {sportHasStandings(activeFeed.sport) ? (
            <StandingsPanel sport={activeFeed.sport} defaultOpen />
          ) : null}
          {sportHasLeaders(activeFeed.sport) ? (
            <LeadersPanel sport={activeFeed.sport} defaultOpen />
          ) : null}

          <div className="main-grid">
            {activeFeed.sport.id === "fifa" ? (
              <BracketBoard rounds={rounds} open={bracketOpen} onToggle={() => setBracketOpen((v) => !v)} onSelect={selectEvent} />
            ) : (
              <EventGrid feed={activeFeed} onSelect={selectEvent} />
            )}
            <InfoPanel feed={activeFeed} onSelect={selectEvent} />
          </div>

          {/* Odds, then headlines, then external references at the foot. */}
          {sportHasOddsBoard(activeFeed.sport) ? (
            <VegasPanel feed={activeFeed} onSelect={selectEvent} />
          ) : null}

          <NewsSection sport={activeFeed.sport} />

          <ReferencesPanel sport={activeFeed.sport} />
        </div>
      </main>

      <SiteFooter />

      <BottomNav
        onHome={goHome}
        onTop={scrollToTop}
        onMenu={() => setNavOpen(true)}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      <SportsSheet
        open={navOpen}
        activeSportId={activeSportId}
        feeds={feeds}
        onSelect={selectSport}
        onClose={() => setNavOpen(false)}
      />

      {selectedEvent ? <GameDetailModal event={selectedEvent} onClose={closeEvent} /> : null}

      <ConsentBanner open={consentOpen} onChoose={chooseConsent} />
    </div>
  );
}

const rootElement = document.getElementById("root");
const root = rootElement.__sportsRoot || createRoot(rootElement);
rootElement.__sportsRoot = root;
root.render(<App />);
