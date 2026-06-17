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
  FIFA_WORLD_CUP_2026_API,
  buildKnockoutRounds,
  getLiveMatches,
  getNextMatches,
  getTodayMatches,
  normalizeFifaMatches,
  summarizeTournament,
} from "./matchUtils.js";
import "./styles.css";

const REFRESH_INTERVAL_MS = 60_000;
const THIRD_PLACE_LABEL = "Play-off for third place";
const CARD_WIDTH = 214;
const CARD_HEIGHT = 166;
const LANE_WIDTH = 252;
const BRACKET_STEP = 178;
const BRACKET_TOP = 76;

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

function flagAlt(team) {
  return team.placeholder ? "" : `${team.name} flag`;
}

function useFifaMatches() {
  const [matches, setMatches] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [nextRefreshAt, setNextRefreshAt] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(FIFA_WORLD_CUP_2026_API, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`FIFA API returned ${response.status}`);
      }

      const payload = await response.json();
      const fetchedAt = new Date();
      const normalized = normalizeFifaMatches(payload, { now: fetchedAt });
      setMatches(normalized);
      setLastUpdated(fetchedAt);
      setNextRefreshAt(new Date(Date.now() + REFRESH_INTERVAL_MS));
      setError(null);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Could not load FIFA data");
      setNextRefreshAt(new Date(Date.now() + REFRESH_INTERVAL_MS));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { matches, lastUpdated, nextRefreshAt, error, loading, refreshing, refresh };
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
          <h1>BRNDN - Fifa Tracker</h1>
          <p>Live from FIFA API</p>
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

function LiveCommandCenter({ liveMatches, nextMatches, summary }) {
  const featured = liveMatches[0] || nextMatches[0] || null;
  const isLive = featured?.status === "live";
  const queuedMatches = nextMatches.filter((match) => match.id !== featured?.id).slice(0, 2);

  return (
    <section className={`live-command ${isLive ? "is-live" : ""}`} aria-label="Live match command center">
      <div className="live-copy">
        <div className="live-eyeline">
          {isLive ? <Radio aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
          <span>{isLive ? "Live Now" : "Next Up"}</span>
        </div>
        <h2 className="live-title">{featured ? `${featured.home.shortName} vs ${featured.away.shortName}` : "No match window active"}</h2>
        <p>
          {featured
            ? `${featured.stage} - ${formatKickoff(featured.date)}${featured.city ? ` - ${featured.city}` : ""}`
            : "FIFA has no active or upcoming match in the current feed window."}
        </p>
      </div>

      {featured ? (
        <div className="live-scoreboard" aria-label={`${featured.home.name} versus ${featured.away.name}`}>
          <CommandTeam team={featured.home} score={featured.homeScore} />
          <div className="command-clock">
            <span className={isLive ? "pulse-dot live" : "pulse-dot"} />
            <strong>{isLive ? featured.clockLabel : formatShortKickoff(featured.date)}</strong>
            <small>{isLive ? "FIFA live window" : "kickoff"}</small>
          </div>
          <CommandTeam team={featured.away} score={featured.awayScore} />
        </div>
      ) : null}

      <div className="live-queue" aria-label="Upcoming match queue">
        <div>
          <Sparkles aria-hidden="true" />
          <span>{summary.live ? `${summary.live} live` : "No active live match"}</span>
        </div>
        {queuedMatches.map((match) => (
          <article key={match.id}>
            <strong>#{match.matchNumber}</strong>
            <span>{match.home.shortName} / {match.away.shortName}</span>
            <small>{formatShortKickoff(match.date)}</small>
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

function MatchCard({ match, roundIndex, isLastRound, variant = "" }) {
  const isLive = match.status === "live";
  const isDone = match.status === "completed";

  return (
    <article
      className={`match-card ${variant} ${match.status} round-${roundIndex} ${isLastRound ? "last-round" : ""} ${match.stage === "Final" ? "final-card" : ""}`}
      aria-label={`Match ${match.matchNumber}, ${match.home.name} versus ${match.away.name}`}
    >
      <div className="match-meta">
        <span>#{match.matchNumber}</span>
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
        <span><MapPin aria-hidden="true" /> {match.city || match.venue || "Venue TBD"}</span>
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
    mainRounds,
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
        <h2>Knockout bracket is loading</h2>
        <p>FIFA has not returned knockout matches yet. The board will fill automatically.</p>
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
          <h2 id="bracket-title">Pyramid Bracket</h2>
          <p>Knockout paths now converge into the Final instead of reading as columns.</p>
        </div>
        <span className="accent-rule" aria-hidden="true" />
      </div>

      <div className="bracket-scroll" role="region" aria-label="Scrollable World Cup pyramid bracket">
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

function TodayPanel({ matches, summary, liveMatches, nextMatches }) {
  return (
    <aside className="side-panel" aria-label="Today and feed status">
      <section className={`panel-section live-panel ${liveMatches.length ? "has-live" : ""}`}>
        <div className="panel-heading">
          <Radio aria-hidden="true" />
          <h2>Live Matches</h2>
        </div>
        {liveMatches.length ? (
          <div className="today-list">
            {liveMatches.map((match) => (
              <article className="today-match live-row" key={match.id}>
                <div>
                  <span className="dot live" />
                  <strong>{match.clockLabel}</strong>
                </div>
                <p>
                  {match.home.shortName} <span>{match.homeScore ?? ""}</span>
                  <em>vs</em>
                  <span>{match.awayScore ?? ""}</span> {match.away.shortName}
                </p>
                <small>{match.city || match.venue || "FIFA API live window"}</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="next-up-list">
            <p className="panel-empty">No active live match from FIFA right now.</p>
            {nextMatches.slice(0, 2).map((match) => (
              <article key={match.id}>
                <span>#{match.matchNumber}</span>
                <strong>{match.home.shortName} vs {match.away.shortName}</strong>
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
          {matches.length === 0 ? (
            <p className="panel-empty">No FIFA World Cup matches listed for today.</p>
          ) : (
            matches.map((match) => (
              <article className="today-match" key={match.id}>
                <div>
                  <span className={`dot ${match.status}`} />
                  <strong>{formatShortKickoff(match.date)}</strong>
                </div>
                <p>
                  {match.home.shortName} <span>{match.homeScore ?? ""}</span>
                  <em>vs</em>
                  <span>{match.awayScore ?? ""}</span> {match.away.shortName}
                </p>
                <small>{match.status === "completed" ? "FT" : match.status === "live" ? "Live now" : match.city || "Scheduled"}</small>
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
            <dd>api.fifa.com</dd>
          </div>
          <div>
            <dt>Total matches</dt>
            <dd>{summary.total}</dd>
          </div>
          <div>
            <dt>Next match</dt>
            <dd>{summary.nextMatchNumber ? `#${summary.nextMatchNumber}` : "TBD"}</dd>
          </div>
        </dl>
      </section>

      <section className="panel-section pitch-card">
        <Shield aria-hidden="true" />
        <h2>World Cup Mode</h2>
        <p>Live scores, empty knockout slots, and future kickoff times update automatically from FIFA's 2026 match calendar.</p>
      </section>
    </aside>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="loading-ball" aria-hidden="true" />
      <h1>Loading FIFA match center</h1>
      <p>Building the live World Cup bracket from FIFA's public API.</p>
    </main>
  );
}

function App() {
  const { matches, lastUpdated, nextRefreshAt, error, loading, refreshing, refresh } = useFifaMatches();
  const now = useMemo(() => new Date(), [lastUpdated]);
  const rounds = useMemo(() => buildKnockoutRounds(matches), [matches]);
  const todayMatches = useMemo(() => getTodayMatches(matches, now), [matches, now]);
  const liveMatches = useMemo(() => getLiveMatches(matches), [matches]);
  const nextMatches = useMemo(() => getNextMatches(matches, now, 4), [matches, now]);
  const summary = useMemo(() => summarizeTournament(matches, now), [matches, now]);

  if (loading && matches.length === 0) return <LoadingScreen />;

  return (
    <div className="app">
      <Header
        refreshing={refreshing}
        lastUpdated={lastUpdated}
        nextRefreshAt={nextRefreshAt}
        onRefresh={refresh}
      />

      {error ? (
        <div className="error-banner" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>{error}. Showing the last successful bracket if available.</span>
        </div>
      ) : null}

      <main className="dashboard-layout">
        <LiveCommandCenter liveMatches={liveMatches} nextMatches={nextMatches} summary={summary} />

        <section className="scoreboard-strip" aria-label="Tournament summary">
          <StatCard icon={Trophy} label="Matches" value={summary.total} tone="gold" />
          <StatCard icon={CheckCircle2} label="Completed" value={summary.completed} tone="emerald" />
          <StatCard icon={Zap} label="Live" value={summary.live} tone="red" />
          <StatCard icon={Clock3} label="Upcoming" value={summary.upcoming} tone="blue" />
        </section>

        <div className="main-grid">
          <BracketBoard rounds={rounds} />
          <TodayPanel matches={todayMatches} summary={summary} liveMatches={liveMatches} nextMatches={nextMatches} />
        </div>
      </main>
    </div>
  );
}

const rootElement = document.getElementById("root");
const root = rootElement.__worldCupRoot || createRoot(rootElement);
rootElement.__worldCupRoot = root;
root.render(<App />);
