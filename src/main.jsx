import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  Trophy,
  Wifi,
  Zap,
} from "lucide-react";
import {
  SPORTS,
  buildKnockoutRounds,
  compareEventsForDisplay,
  getLiveMatches,
  getNextMatches,
  getTodayMatches,
  normalizeEspnScoreboard,
  normalizeFifaMatches,
  sportById,
  summarizeEvents,
} from "./matchUtils.js";
import "./styles.css";

const REFRESH_INTERVAL_MS = 60_000;
const DEFAULT_SPORT_ID = "fifa";
const THIRD_PLACE_LABEL = "Play-off for third place";
const CARD_WIDTH = 214;
const CARD_HEIGHT = 166;
const LANE_WIDTH = 252;
const BRACKET_STEP = 178;
const BRACKET_TOP = 76;

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

function formatSeconds(ms) {
  return Math.max(0, Math.ceil(ms / 1000));
}

function formatSourceCount(sport) {
  return sport.apiUrls.length === 1 ? "1 feed" : `${sport.apiUrls.length} feeds`;
}

function flagAlt(team) {
  return team.placeholder ? "" : `${team.name} logo`;
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

  const refresh = useCallback(async () => {
    const fetchedAt = new Date();
    setRefreshing(true);
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
    setRefreshing(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { feeds, lastUpdated, nextRefreshAt, refreshing, refresh };
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className={`stat-card ${tone}`}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Header({ refreshing, lastUpdated, nextRefreshAt, onRefresh }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const seconds = nextRefreshAt ? formatSeconds(nextRefreshAt.getTime() - now) : 60;

  return (
    <header className="app-header">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <Trophy />
        </div>
        <div>
          <h1>BRNDN Sports Tracker</h1>
          <p>NFL, MLB, NHL, NBA, FIFA, MLS, Tennis & Golf live data</p>
        </div>
      </div>

      <div className="feed-controls" aria-label="Data refresh controls">
        <div className="feed-chip">
          <Wifi aria-hidden="true" />
          <span>{lastUpdated ? "Updated just now" : "Connecting"}</span>
        </div>
        <div className="feed-chip muted">
          <Clock3 aria-hidden="true" />
          <span>Auto refresh in {seconds}s</span>
        </div>
        <button className="refresh-button" onClick={onRefresh} type="button" disabled={refreshing}>
          <RefreshCw aria-hidden="true" className={refreshing ? "spin" : ""} />
          <span>{refreshing ? "Refreshing" : "Refresh"}</span>
        </button>
      </div>
    </header>
  );
}

function SportsTabs({ activeSportId, feeds, onSelect }) {
  return (
    <nav className="sport-switcher" aria-label="Sports categories">
      {SPORTS.map((sport) => {
        const feed = feeds[sport.id] || emptyFeed(sport);
        const isActive = activeSportId === sport.id;

        return (
          <button
            className={`sport-tab ${isActive ? "active" : ""} ${feed.error ? "has-error" : ""}`}
            data-sport-id={sport.id}
            key={sport.id}
            onClick={() => onSelect(sport.id)}
            type="button"
            aria-pressed={isActive}
          >
            <strong>{sport.label}</strong>
            <span>{feed.error ? "Feed issue" : `${feed.summary.live} live`}</span>
            <small>{feed.summary.total} events</small>
          </button>
        );
      })}
    </nav>
  );
}

function CommandTeam({ team, score }) {
  return (
    <div className={`command-team ${team.placeholder ? "placeholder" : ""}`}>
      {team.flagUrl ? (
        <img src={team.flagUrl} alt={flagAlt(team)} loading="lazy" />
      ) : (
        <span className="flag-placeholder" aria-hidden="true">
          {team.abbreviation.slice(0, 2)}
        </span>
      )}
      <strong>{team.shortName}</strong>
      <span>{score ?? "-"}</span>
    </div>
  );
}

function LiveCommandCenter({ feed, allFeeds }) {
  const activeLive = getLiveMatches(feed.events);
  const activeNext = getNextMatches(feed.events, new Date(), 3);
  const featured = activeLive[0] || activeNext[0] || feed.events[0] || null;
  const isLive = featured?.status === "live";
  const globalQueue = SPORTS.flatMap((sport) => getLiveMatches(allFeeds[sport.id]?.events || []).slice(0, 2))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 3);
  const fallbackQueue = activeNext.filter((event) => event.id !== featured?.id).slice(0, 3);
  const queue = globalQueue.length ? globalQueue : fallbackQueue;

  return (
    <section className={`live-command ${isLive ? "is-live" : ""}`} aria-label="Live sports command center">
      <div className="live-copy">
        <div className="live-eyeline">
          {isLive ? <Radio aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
          <span>{isLive ? "Live Now" : "Next Up"} / {feed.sport.label}</span>
        </div>
        <h2 className="live-title">{featured ? featured.title : `${feed.sport.label} feed loading`}</h2>
        <p>
          {featured
            ? `${featured.stage} - ${formatKickoff(featured.date)}${featured.city ? ` - ${featured.city}` : ""}`
            : `${feed.sport.source} has not returned events yet.`}
        </p>
      </div>

      {featured ? (
        <div className="live-scoreboard" aria-label={featured.title}>
          <CommandTeam team={featured.home} score={featured.homeScore} />
          <div className="command-clock">
            <span className={isLive ? "pulse-dot live" : "pulse-dot"} />
            <strong>{isLive ? featured.clockLabel : formatShortKickoff(featured.date)}</strong>
            <small>{isLive ? featured.statusLabel : "kickoff"}</small>
          </div>
          <CommandTeam team={featured.away} score={featured.awayScore} />
        </div>
      ) : null}

      <div className="live-queue" aria-label="Cross-sport live queue">
        <div>
          <Sparkles aria-hidden="true" />
          <span>{globalQueue.length ? "Live across sports" : "Upcoming in this sport"}</span>
        </div>
        {queue.map((event) => (
          <article key={event.id}>
            <strong>{event.sportLabel}</strong>
            <span>{event.title}</span>
            <small>{event.status === "live" ? event.clockLabel : formatShortKickoff(event.date)}</small>
          </article>
        ))}
      </div>
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
          <span className="team-code">{team.placeholder ? "Slot" : team.abbreviation}</span>
        </div>
      </div>
      <div className="score-lockup">
        <strong>{score ?? "-"}</strong>
        {penaltyScore !== null && penaltyScore !== undefined ? <span>({penaltyScore})</span> : null}
      </div>
    </div>
  );
}

function MatchCard({ match, roundIndex = 0, isLastRound = false, variant = "" }) {
  const isLive = match.status === "live";
  const isDone = match.status === "completed";
  const metaLabel = match.matchNumber ? `#${match.matchNumber}` : match.sportLabel;

  return (
    <article
      className={`match-card ${variant} ${match.status} round-${roundIndex} ${isLastRound ? "last-round" : ""} ${match.stage === "Final" ? "final-card" : ""}`}
      aria-label={match.title}
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
  const maxMatches = Math.max(...mainRounds.map((round) => round.matches.length), 1);
  const height = BRACKET_TOP * 2 + (maxMatches - 1) * BRACKET_STEP + CARD_HEIGHT;
  const width = (mainRounds.length - 1) * LANE_WIDTH + CARD_WIDTH;
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
      const control = Math.max(34, (endX - startX) / 2);

      return {
        key: `${lane.label}-${card.match.id}`,
        d: `M ${startX} ${startY} C ${startX + control} ${startY}, ${endX - control} ${endY}, ${endX} ${endY}`,
      };
    }).filter(Boolean);
  });

  return {
    placementMatch: placementRound?.matches?.[0] || null,
    lanes,
    connectorPaths,
    height,
    width,
  };
}

function BracketBoard({ rounds }) {
  if (rounds.length === 0) {
    return (
      <section className="empty-state">
        <Trophy aria-hidden="true" />
        <h2>FIFA bracket is loading</h2>
        <p>The World Cup knockout board will fill when FIFA returns those matches.</p>
      </section>
    );
  }

  const geometry = buildPyramidGeometry(rounds);
  const finalLane = geometry.lanes[geometry.lanes.length - 1];
  const finalCard = finalLane?.cards?.[0];

  return (
    <section className="bracket-shell" aria-labelledby="bracket-title">
      <div className="section-heading">
        <div>
          <h2 id="bracket-title">FIFA World Cup Pyramid</h2>
          <p>Knockout paths converge into the Final while the live tracker keeps every sport available above.</p>
        </div>
        <span className="accent-rule" aria-hidden="true" />
      </div>

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
                  />
                </div>
              ))}
            </section>
          ))}

          {geometry.placementMatch && finalCard ? (
            <aside
              className="third-place-card"
              style={{ left: finalCard.x, top: Math.min(finalCard.y + CARD_HEIGHT + 18, geometry.height - CARD_HEIGHT) }}
            >
              <span>Third Place</span>
              <MatchCard
                match={geometry.placementMatch}
                roundIndex={geometry.lanes.length}
                isLastRound
                variant="pyramid-card compact-card"
              />
            </aside>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function EventGrid({ feed }) {
  const visibleEvents = feed.events.slice(0, 18);

  return (
    <section className="event-board" aria-labelledby="events-title">
      <div className="section-heading">
        <div>
          <h2 id="events-title">{feed.sport.label} Live Board</h2>
          <p>{feed.sport.name} data from {feed.sport.source}. Showing live, next, then recent events.</p>
        </div>
        <span className="source-pill">{formatSourceCount(feed.sport)}</span>
      </div>
      {visibleEvents.length ? (
        <div className="event-grid">
          {visibleEvents.map((event) => (
            <MatchCard key={event.id} match={event} variant="event-card" />
          ))}
        </div>
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

function InfoPanel({ feed }) {
  const liveMatches = getLiveMatches(feed.events);
  const todayMatches = getTodayMatches(feed.events);
  const nextMatches = getNextMatches(feed.events, new Date(), 4);

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
              <article className="today-match live-row" key={match.id}>
                <div>
                  <span className="dot live" />
                  <strong>{match.clockLabel}</strong>
                </div>
                <p>{match.title}</p>
                <small>{match.city || match.venue || match.source}</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="next-up-list">
            <p className="panel-empty">No active live event in {feed.sport.label} right now.</p>
            {nextMatches.slice(0, 3).map((match) => (
              <article key={match.id}>
                <span>{match.sportLabel}</span>
                <strong>{match.title}</strong>
                <small>{formatKickoff(match.date)}</small>
              </article>
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
              <article className="today-match" key={match.id}>
                <div>
                  <span className={`dot ${match.status}`} />
                  <strong>{match.status === "live" ? match.clockLabel : formatShortKickoff(match.date)}</strong>
                </div>
                <p>{match.title}</p>
                <small>{match.status === "completed" ? match.statusLabel : match.city || "Scheduled"}</small>
              </article>
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
      </section>

      <section className="panel-section pitch-card">
        <Shield aria-hidden="true" />
        <h2>{feed.sport.label} Mode</h2>
        <p>{feed.error || `${feed.sport.name} refreshes automatically every minute from ${feed.sport.source}.`}</p>
      </section>
    </aside>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="loading-ball" aria-hidden="true" />
      <h1>Loading BRNDN Sports Tracker</h1>
      <p>Checking NFL, MLB, NHL, NBA, FIFA, MLS, Tennis and Golf feeds.</p>
    </main>
  );
}

function App() {
  const { feeds, lastUpdated, nextRefreshAt, refreshing, refresh } = useSportsFeeds();
  const [activeSportId, setActiveSportId] = useState(DEFAULT_SPORT_ID);
  const activeSport = sportById(activeSportId);
  const activeFeed = feeds[activeSportId] || emptyFeed(activeSport);
  const rounds = useMemo(() => buildKnockoutRounds(activeFeed.events), [activeFeed.events]);
  const loading = Object.values(feeds).every((feed) => feed.loading);
  const errorCount = Object.values(feeds).filter((feed) => feed.error).length;

  if (loading) return <LoadingScreen />;

  return (
    <div className="app">
      <Header
        refreshing={refreshing}
        lastUpdated={lastUpdated}
        nextRefreshAt={nextRefreshAt}
        onRefresh={refresh}
      />

      {errorCount ? (
        <div className="error-banner" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>{errorCount} sports feed{errorCount === 1 ? "" : "s"} failed to refresh. Last successful data remains visible where available.</span>
        </div>
      ) : null}

      <main className="dashboard-layout">
        <SportsTabs activeSportId={activeSportId} feeds={feeds} onSelect={setActiveSportId} />
        <LiveCommandCenter feed={activeFeed} allFeeds={feeds} />

        <section className="scoreboard-strip" aria-label={`${activeFeed.sport.label} summary`}>
          <StatCard icon={Trophy} label="Events" value={activeFeed.summary.total} tone="gold" />
          <StatCard icon={Zap} label="Live" value={activeFeed.summary.live} tone="red" />
          <StatCard icon={CheckCircle2} label="Completed" value={activeFeed.summary.completed} tone="emerald" />
          <StatCard icon={Clock3} label="Upcoming" value={activeFeed.summary.upcoming} tone="blue" />
        </section>

        <div className="main-grid">
          {activeFeed.sport.id === "fifa" ? <BracketBoard rounds={rounds} /> : <EventGrid feed={activeFeed} />}
          <InfoPanel feed={activeFeed} />
        </div>
      </main>
    </div>
  );
}

const rootElement = document.getElementById("root");
const root = rootElement.__sportsRoot || createRoot(rootElement);
rootElement.__sportsRoot = root;
root.render(<App />);
