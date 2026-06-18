export const FIFA_WORLD_CUP_2026_API =
  "https://api.fifa.com/api/v3/calendar/matches?from=2026-06-11T00:00:00Z&to=2026-07-20T00:00:00Z&language=en&count=500&idCompetition=17&idSeason=285023";

export const SPORTS = [
  {
    id: "nfl",
    label: "NFL",
    name: "National Football League",
    source: "ESPN NFL API",
    type: "espn",
    apiUrls: ["https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"],
  },
  {
    id: "mlb",
    label: "MLB",
    name: "Major League Baseball",
    source: "ESPN MLB API",
    type: "espn",
    apiUrls: ["https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard"],
  },
  {
    id: "nhl",
    label: "NHL",
    name: "National Hockey League",
    source: "ESPN NHL API",
    type: "espn",
    apiUrls: ["https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard"],
  },
  {
    id: "nba",
    label: "NBA",
    name: "National Basketball Association",
    source: "ESPN NBA API",
    type: "espn",
    apiUrls: ["https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"],
  },
  {
    id: "fifa",
    label: "FIFA",
    name: "FIFA World Cup",
    source: "FIFA API",
    type: "fifa",
    apiUrls: [FIFA_WORLD_CUP_2026_API],
  },
  {
    id: "mls",
    label: "MLS",
    name: "Major League Soccer",
    source: "ESPN MLS API",
    type: "espn",
    apiUrls: ["https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard"],
  },
  {
    id: "tennis",
    label: "Tennis",
    name: "ATP + WTA Tennis",
    source: "ESPN Tennis APIs",
    type: "espn",
    apiUrls: [
      "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard",
      "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard",
    ],
  },
  {
    id: "golf",
    label: "Golf",
    name: "PGA Tour",
    source: "ESPN Golf API",
    type: "espn",
    apiUrls: ["https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard"],
  },
];

export const ROUND_ORDER = [
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Play-off for third place",
  "Final",
];

const LIVE_STATUS_CODES = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const FALLBACK_LIVE_WINDOW_MS = 2.75 * 60 * 60 * 1000;

export function sportById(id) {
  return SPORTS.find((sport) => sport.id === id) || SPORTS[0];
}

function localizedText(value, fallback = "") {
  if (typeof value === "string") return value;
  if (!Array.isArray(value) || value.length === 0) return fallback;

  const english = value.find((item) => item?.Locale?.toLowerCase().startsWith("en"));
  return english?.Description ?? value[0]?.Description ?? fallback;
}

function flagUrl(team) {
  if (!team) return null;

  if (team.PictureUrl) {
    return team.PictureUrl.replace("{format}", "sq").replace("{size}", "4");
  }

  if (team.IdCountry) {
    return `https://api.fifa.com/api/v3/picture/flags-sq-4/${team.IdCountry}`;
  }

  return null;
}

function normalizeTeam(team, placeholder) {
  if (!team) {
    const label = placeholder || "TBD";
    return {
      id: label,
      name: label,
      shortName: label,
      abbreviation: label,
      flagUrl: null,
      placeholder: true,
    };
  }

  const name = team.ShortClubName || localizedText(team.TeamName, team.Abbreviation || "TBD");
  const abbreviation = team.Abbreviation || team.IdCountry || name.slice(0, 3).toUpperCase();

  return {
    id: team.IdTeam || abbreviation,
    name,
    shortName: team.ShortClubName || name,
    abbreviation,
    flagUrl: flagUrl(team),
    placeholder: false,
  };
}

function placeholderTeam(label) {
  return {
    id: label,
    name: label,
    shortName: label,
    abbreviation: label.slice(0, 3).toUpperCase(),
    flagUrl: null,
    placeholder: true,
  };
}

function hasScore(value) {
  return value !== null && value !== undefined && value !== "";
}

function matchMinute(matchTime) {
  if (!matchTime) return null;
  const minute = Number(String(matchTime).replace(/[^\d]/g, ""));
  return Number.isFinite(minute) ? minute : null;
}

function hasKnownTeams(match) {
  return Boolean(match.Home && match.Away);
}

function isInsideFallbackLiveWindow(match, now) {
  if (!now || !hasKnownTeams(match)) return false;
  const kickoff = new Date(match.Date).getTime();
  const current = new Date(now).getTime();
  return current >= kickoff && current <= kickoff + FALLBACK_LIVE_WINDOW_MS;
}

function inferFifaStatus(match, now) {
  if (match.MatchStatus === 0) return "completed";
  if (LIVE_STATUS_CODES.has(Number(match.MatchStatus))) return "live";
  if (matchMinute(match.MatchTime) > 0 && (hasScore(match.HomeTeamScore) || hasScore(match.AwayTeamScore))) return "live";
  if (Number(match.MatchStatus) === 1 && isInsideFallbackLiveWindow(match, now)) return "live";
  return "upcoming";
}

function fifaStatusLabel(match, status) {
  if (status === "completed") return "FT";
  if (status === "live") return matchMinute(match.MatchTime) > 0 ? match.MatchTime : "LIVE";
  return "Scheduled";
}

function fifaClockLabel(match, status) {
  if (status === "completed") return "Full time";
  if (status === "live") return matchMinute(match.MatchTime) > 0 ? match.MatchTime : "Kickoff";
  return "Kickoff";
}

function winnerSide(match, home, away, status) {
  if (status !== "completed") return null;
  if (match.Winner && home.id === match.Winner) return "home";
  if (match.Winner && away.id === match.Winner) return "away";
  if (hasScore(match.HomeTeamPenaltyScore) && hasScore(match.AwayTeamPenaltyScore)) {
    if (match.HomeTeamPenaltyScore > match.AwayTeamPenaltyScore) return "home";
    if (match.AwayTeamPenaltyScore > match.HomeTeamPenaltyScore) return "away";
  }
  if (hasScore(match.HomeTeamScore) && hasScore(match.AwayTeamScore)) {
    if (match.HomeTeamScore > match.AwayTeamScore) return "home";
    if (match.AwayTeamScore > match.HomeTeamScore) return "away";
    return "draw";
  }
  return null;
}

export function normalizeFifaMatches(response, options = {}) {
  const rows = Array.isArray(response) ? response : response?.Results || [];
  const now = options.now || null;

  return rows
    .map((match) => {
      const home = normalizeTeam(match.Home, match.PlaceHolderA);
      const away = normalizeTeam(match.Away, match.PlaceHolderB);
      const status = inferFifaStatus(match, now);
      const stage = localizedText(match.StageName, "Match");

      return {
        id: `fifa-${match.IdMatch}`,
        sportId: "fifa",
        sportLabel: "FIFA",
        source: "FIFA API",
        league: localizedText(match.CompetitionName, "FIFA World Cup"),
        matchNumber: Number(match.MatchNumber),
        title: `${home.shortName} vs ${away.shortName}`,
        stage,
        group: localizedText(match.GroupName, ""),
        competition: localizedText(match.CompetitionName, "FIFA World Cup"),
        season: localizedText(match.SeasonName, "FIFA World Cup 2026"),
        date: match.Date,
        localDate: match.LocalDate,
        status,
        statusLabel: fifaStatusLabel(match, status),
        clockLabel: fifaClockLabel(match, status),
        home,
        away,
        participants: [home, away],
        homeScore: match.HomeTeamScore,
        awayScore: match.AwayTeamScore,
        homePenaltyScore: match.HomeTeamPenaltyScore,
        awayPenaltyScore: match.AwayTeamPenaltyScore,
        winnerSide: winnerSide(match, home, away, status),
        venue: localizedText(match.Stadium?.Name, ""),
        city: localizedText(match.Stadium?.CityName, ""),
        resultType: match.ResultType,
        rawStatus: match.MatchStatus,
      };
    })
    .filter((match) => Number.isFinite(match.matchNumber) && match.date)
    .sort((a, b) => a.matchNumber - b.matchNumber);
}

function statusFromEspn(status) {
  const type = status?.type || {};
  const state = type.state;

  if (state === "post" || type.completed) {
    return {
      status: "completed",
      statusLabel: type.shortDetail || type.description || "Final",
      clockLabel: "Final",
    };
  }

  if (state === "in") {
    return {
      status: "live",
      statusLabel: type.shortDetail || status?.displayClock || "LIVE",
      clockLabel: status?.displayClock || type.detail || "Live",
    };
  }

  return {
    status: "upcoming",
    statusLabel: type.shortDetail || type.description || "Scheduled",
    clockLabel: type.shortDetail || "Kickoff",
  };
}

function firstLogo(entity) {
  if (!entity) return null;
  if (entity.logo) return entity.logo;
  if (entity.flag?.href) return entity.flag.href;
  if (Array.isArray(entity.logos)) return entity.logos[0]?.href || null;
  if (entity.headshot) return entity.headshot;
  return null;
}

function scoreFromLinescores(linescores) {
  if (!Array.isArray(linescores)) return null;
  const values = linescores
    .map((line) => line?.value ?? line?.displayValue)
    .filter((value) => value !== null && value !== undefined && value !== "");
  return values.length ? values.join(" ") : null;
}

function teamRecord(competitor) {
  const records = competitor?.records || competitor?.record;
  if (!Array.isArray(records)) return null;
  const overall = records.find((entry) => entry?.type === "total" || entry?.name === "overall") || records[0];
  return overall?.summary || null;
}

function simplifyLeaders(competitor) {
  const groups = Array.isArray(competitor?.leaders) ? competitor.leaders : [];
  return groups
    .map((group) => {
      const top = group?.leaders?.[0];
      if (!top) return null;
      const athlete = top.athlete || {};
      return {
        category: group.shortDisplayName || group.abbreviation || group.displayName || group.name || "Leader",
        athlete: athlete.shortName || athlete.displayName || athlete.fullName || "—",
        value: top.displayValue ?? "",
        headshot: athlete.headshot?.href || athlete.headshot || null,
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeEspnCompetitor(competitor, fallbackLabel) {
  const entity = competitor?.team || competitor?.athlete || competitor?.roster || {};
  const displayName =
    entity.displayName ||
    entity.fullName ||
    entity.name ||
    competitor?.displayName ||
    competitor?.name ||
    fallbackLabel ||
    "TBD";
  const shortName =
    entity.shortDisplayName ||
    entity.shortName ||
    entity.abbreviation ||
    competitor?.abbreviation ||
    displayName;
  const score = competitor?.score ?? scoreFromLinescores(competitor?.linescores);
  const abbreviation = entity.abbreviation || shortName.slice(0, 3).toUpperCase();

  return {
    id: competitor?.id || displayName,
    name: displayName,
    shortName,
    abbreviation,
    flagUrl: firstLogo(entity),
    score,
    record: teamRecord(competitor),
    leaders: simplifyLeaders(competitor),
    homeAway: competitor?.homeAway || null,
    winner: Boolean(competitor?.winner),
    order: Number.isFinite(Number(competitor?.order)) ? Number(competitor.order) : 99,
    placeholder: displayName === "TBD" || String(competitor?.id || "").startsWith("-"),
  };
}

function espnCompetitions(event) {
  const direct = Array.isArray(event.competitions)
    ? event.competitions.map((competition) => ({ event, competition, grouping: null }))
    : [];
  const grouped = Array.isArray(event.groupings)
    ? event.groupings.flatMap((grouping) =>
        (grouping.competitions || []).map((competition) => ({ event, competition, grouping })),
      )
    : [];

  return direct.length || grouped.length ? [...direct, ...grouped] : [{ event, competition: null, grouping: null }];
}

function espnVenue(event, competition) {
  const venue = competition?.venue || event?.venue || {};
  const city = venue.address?.city || venue.displayName || venue.fullName || "";
  return {
    venue: venue.fullName || venue.displayName || "",
    city,
  };
}

function orderParticipants(participants) {
  if (!participants.length) return [];
  const home = participants.find((participant) => participant.homeAway === "home");
  const away = participants.find((participant) => participant.homeAway === "away");
  if (home || away) return [home, away].filter(Boolean);
  return [...participants].sort((a, b) => a.order - b.order);
}

function espnEventTitle(event, competition, participants) {
  if (participants.length >= 2 && competition) {
    return `${participants[0].shortName} vs ${participants[1].shortName}`;
  }
  return event.shortName || event.name || competition?.type?.text || "Event";
}

function espnStage(event, competition, grouping, sport) {
  const details = [...new Set([
    competition?.round?.displayName,
    competition?.type?.text,
    grouping?.grouping?.displayName,
  ].filter(Boolean))];
  return details.length ? details.join(" - ") : event.shortName || sport.name;
}

function eventId(sport, event, competition, index) {
  const league = event?.uid?.split("~l:")[1]?.split("~")[0] || sport.id;
  return `${sport.id}-${league}-${competition?.id || event?.id || index}`;
}

export function normalizeEspnScoreboard(response, sport, options = {}) {
  const rows = Array.isArray(response?.events) ? response.events : [];

  return rows
    .flatMap((event) => espnCompetitions(event))
    .map(({ event, competition, grouping }, index) => {
      const statusInfo = statusFromEspn(competition?.status || event.status);
      const participants = orderParticipants(
        (competition?.competitors || []).map((competitor, competitorIndex) =>
          normalizeEspnCompetitor(competitor, `Slot ${competitorIndex + 1}`),
        ),
      );
      const home = participants[0] || placeholderTeam(event.shortName || event.name || "Event");
      const away = participants[1] || placeholderTeam(sport.label);
      const { venue, city } = espnVenue(event, competition);
      const date = competition?.date || competition?.startDate || event.date || event.startDate;

      return {
        id: eventId(sport, event, competition, index),
        eventRefId: event?.id || competition?.id || null,
        sportId: sport.id,
        sportLabel: sport.label,
        source: sport.source,
        league: response?.leagues?.[0]?.name || sport.name,
        matchNumber: null,
        title: espnEventTitle(event, competition, participants),
        stage: espnStage(event, competition, grouping, sport),
        group: grouping?.grouping?.displayName || "",
        competition: event.name || sport.name,
        season: String(event.season?.year || ""),
        date,
        status: statusInfo.status,
        statusLabel: statusInfo.statusLabel,
        clockLabel: statusInfo.clockLabel,
        home,
        away,
        participants,
        homeScore: home.score,
        awayScore: away.score,
        homePenaltyScore: null,
        awayPenaltyScore: null,
        winnerSide: home.winner ? "home" : away.winner ? "away" : null,
        venue,
        city,
        broadcast: competition?.broadcast || competition?.broadcasts?.[0]?.names?.join(", ") || "",
        rawStatus: competition?.status?.type?.name || event.status?.type?.name || "",
      };
    })
    .filter((event) => event.date)
    .sort(compareEventsForDisplay(options.now || new Date()));
}

function eventSortBucket(event, now) {
  if (event.status === "live") return 0;
  if (event.status === "upcoming" && new Date(event.date) >= now) return 1;
  if (event.status === "upcoming") return 2;
  return 3;
}

export function compareEventsForDisplay(now = new Date()) {
  return (a, b) => {
    const bucket = eventSortBucket(a, now) - eventSortBucket(b, now);
    if (bucket !== 0) return bucket;
    return new Date(a.date) - new Date(b.date);
  };
}

export function getLiveMatches(matches) {
  return matches
    .filter((match) => match.status === "live")
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function getNextMatches(matches, now = new Date(), limit = 3) {
  return matches
    .filter((match) => match.status === "upcoming" && new Date(match.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, limit);
}

export function buildKnockoutRounds(matches) {
  return ROUND_ORDER.map((label) => ({
    label,
    matches: matches
      .filter((match) => match.stage === label)
      .sort((a, b) => a.matchNumber - b.matchNumber),
  })).filter((round) => round.matches.length > 0);
}

export function getTodayMatches(matches, now = new Date()) {
  const localDay = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return matches
    .filter((match) => {
      const matchDay = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(match.date));
      return matchDay === localDay;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function summarizeEvents(matches, now = new Date()) {
  const completed = matches.filter((match) => match.status === "completed").length;
  const live = matches.filter((match) => match.status === "live").length;
  const upcoming = matches.filter((match) => match.status === "upcoming").length;
  const next = matches
    .filter((match) => match.status !== "completed" && new Date(match.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  return {
    total: matches.length,
    completed,
    live,
    upcoming,
    nextMatchNumber: next?.matchNumber ?? null,
    nextTitle: next?.title ?? null,
  };
}

export const summarizeTournament = summarizeEvents;

/* ─────────────────────────── Deep data (news + game detail) ─────────────────────────── */

// Derive the ESPN base path (sport/league) from a sport's scoreboard URL.
function espnBasePath(sport) {
  const url = sport?.apiUrls?.find((u) => u.includes("site.api.espn.com"));
  if (!url) return null;
  const match = url.match(/\/sports\/([^/]+)\/([^/]+)\/scoreboard/);
  return match ? `${match[1]}/${match[2]}` : null;
}

export function newsUrlForSport(sport) {
  if (sport?.id === "fifa") {
    return "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/news";
  }
  const base = espnBasePath(sport);
  return base ? `https://site.api.espn.com/apis/site/v2/sports/${base}/news` : null;
}

export function summaryUrlForEvent(sport, eventRefId) {
  if (!eventRefId || sport?.type !== "espn") return null;
  const base = espnBasePath(sport);
  return base
    ? `https://site.api.espn.com/apis/site/v2/sports/${base}/summary?event=${eventRefId}`
    : null;
}

export function normalizeNews(payload, limit = 8) {
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  return articles
    .map((article) => {
      const image = Array.isArray(article.images) ? article.images.find((img) => img?.url) : null;
      return {
        id: article.id || article.headline,
        headline: article.headline || "Untitled",
        description: article.description || "",
        published: article.published || article.lastModified || null,
        link: article.links?.web?.href || article.links?.mobile?.href || null,
        image: image?.url || null,
      };
    })
    .filter((article) => article.headline)
    .slice(0, limit);
}

// American moneyline → implied probability (0..1).
function impliedProbFromMoneyline(moneyLine) {
  const ml = Number(moneyLine);
  if (!Number.isFinite(ml) || ml === 0) return null;
  return ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
}

function recordWinPct(record) {
  if (!record) return null;
  const parts = String(record).split("-").map((n) => Number(n));
  const [wins, losses] = parts;
  if (!Number.isFinite(wins) || !Number.isFinite(losses) || wins + losses === 0) return null;
  return wins / (wins + losses);
}

function pickWinProbability(summary, event) {
  const predictor = summary?.predictor;
  if (predictor?.homeTeam?.gameProjection && predictor?.awayTeam?.gameProjection) {
    return {
      source: predictor.header || "Matchup Predictor",
      homePct: Math.round(Number(predictor.homeTeam.gameProjection)),
      awayPct: Math.round(Number(predictor.awayTeam.gameProjection)),
    };
  }

  const odds = summary?.pickcenter?.[0] || summary?.odds?.[0];
  const homeMl = impliedProbFromMoneyline(odds?.homeTeamOdds?.moneyLine);
  const awayMl = impliedProbFromMoneyline(odds?.awayTeamOdds?.moneyLine);
  if (homeMl !== null && awayMl !== null) {
    const total = homeMl + awayMl;
    return {
      source: "Implied from odds",
      homePct: Math.round((homeMl / total) * 100),
      awayPct: Math.round((awayMl / total) * 100),
    };
  }

  const homePct = recordWinPct(event?.home?.record);
  const awayPct = recordWinPct(event?.away?.record);
  if (homePct !== null && awayPct !== null) {
    const total = homePct + awayPct || 1;
    return {
      source: "Based on season record",
      homePct: Math.round((homePct / total) * 100),
      awayPct: Math.round((awayPct / total) * 100),
    };
  }

  return null;
}

// Prioritize widely-understood stats first, then fill with whatever remains.
const PRIORITY_STATS = new Set([
  "totalYards", "yardsPerPlay", "possessionTime", "turnovers", "firstDowns", "totalPenaltiesYards",
  "thirdDownEff", "completionAttempts", "sacksYardsLost", "rushingYards", "netPassingYards",
  "points", "fieldGoalPct", "threePointFieldGoalPct", "freeThrowPct", "rebounds", "assists",
  "steals", "blocks", "fastBreakPoints", "pointsInPaint", "fieldGoalsMade-fieldGoalsAttempted",
  "hits", "runs", "errors", "RBIs", "homeRuns", "battingAvg", "strikeouts", "walks",
  "shotsTotal", "shotsOnTarget", "possessionPct", "foulsCommitted", "wonCorners", "saves",
  "goals", "powerPlayPct", "penaltyMinutes", "faceoffsWon",
]);

function flattenTeamStats(team) {
  const out = {};
  (team?.statistics || []).forEach((stat) => {
    if (Array.isArray(stat.stats)) {
      stat.stats.forEach((entry) => {
        out[entry.name] = {
          label: entry.shortDisplayName || entry.abbreviation || entry.displayName || entry.name,
          value: entry.displayValue,
        };
      });
    } else {
      out[stat.name] = {
        label: stat.label || stat.shortDisplayName || stat.abbreviation || stat.displayName || stat.name,
        value: stat.displayValue,
      };
    }
  });
  return out;
}

function buildTeamStats(summary) {
  const teams = summary?.boxscore?.teams;
  if (!Array.isArray(teams) || teams.length < 2) return [];
  const homeTeam = teams.find((t) => t.homeAway === "home") || teams[1];
  const awayTeam = teams.find((t) => t.homeAway === "away") || teams[0];
  const home = flattenTeamStats(homeTeam);
  const away = flattenTeamStats(awayTeam);

  const shared = Object.keys(home).filter((name) => name in away);
  shared.sort((a, b) => Number(PRIORITY_STATS.has(b)) - Number(PRIORITY_STATS.has(a)));

  return shared
    .map((name) => ({ label: home[name].label, home: home[name].value, away: away[name].value }))
    .filter((row) => row.home !== undefined && row.away !== undefined && row.home !== "" && row.away !== "")
    .slice(0, 9);
}

function buildInjuries(summary) {
  const groups = Array.isArray(summary?.injuries) ? summary.injuries : [];
  return groups
    .map((group) => ({
      teamAbbr: group.team?.abbreviation || group.team?.displayName || "",
      teamName: group.team?.displayName || "",
      players: (group.injuries || [])
        .map((injury) => ({
          name: injury.athlete?.displayName || injury.athlete?.shortName || "Unknown",
          position: injury.athlete?.position?.abbreviation || "",
          status: injury.status || injury.type?.description || "Out",
        }))
        .slice(0, 8),
    }))
    .filter((group) => group.players.length);
}

function buildOdds(summary) {
  const odds = summary?.pickcenter?.[0] || summary?.odds?.[0];
  if (!odds) return null;
  return {
    provider: odds.provider?.name || "Sportsbook",
    details: odds.details || "",
    spread: odds.spread ?? null,
    overUnder: odds.overUnder ?? null,
    overOdds: odds.overOdds ?? null,
    underOdds: odds.underOdds ?? null,
    homeMoneyLine: odds.homeTeamOdds?.moneyLine ?? null,
    awayMoneyLine: odds.awayTeamOdds?.moneyLine ?? null,
    favorite: odds.homeTeamOdds?.favorite ? "home" : odds.awayTeamOdds?.favorite ? "away" : null,
  };
}

export function normalizeSummary(payload, event) {
  return {
    teamStats: buildTeamStats(payload),
    injuries: buildInjuries(payload),
    odds: buildOdds(payload),
    winProbability: pickWinProbability(payload, event),
    news: normalizeNews(payload?.news, 5),
  };
}

// Just the odds slice — used by the cross-game Vegas board.
export function extractOdds(payload, event) {
  return buildOdds(payload);
}

/* ─────────────────────────── Standings + leaders (Stats Lab) ─────────────────────────── */

const STANDINGS_SPORTS = new Set(["nfl", "mlb", "nhl", "nba", "mls", "fifa"]);
const LEADERS_SPORTS = new Set(["nfl", "mlb", "nhl", "nba", "golf"]);
const ODDS_SPORTS = new Set(["nfl", "mlb", "nhl", "nba", "mls"]);

// ESPN sport/league path, including FIFA which has no scoreboard on site.api.
function dataPath(sport) {
  if (sport?.id === "fifa") return "soccer/fifa.world";
  return espnBasePath(sport);
}

export function sportHasStandings(sport) {
  return STANDINGS_SPORTS.has(sport?.id) && Boolean(dataPath(sport));
}

export function sportHasLeaders(sport) {
  return LEADERS_SPORTS.has(sport?.id) && Boolean(dataPath(sport));
}

export function sportHasOddsBoard(sport) {
  return ODDS_SPORTS.has(sport?.id);
}

export function standingsUrlForSport(sport) {
  if (!sportHasStandings(sport)) return null;
  return `https://site.api.espn.com/apis/v2/sports/${dataPath(sport)}/standings`;
}

export function leadersUrlForSport(sport) {
  if (!sportHasLeaders(sport)) return null;
  return `https://site.web.api.espn.com/apis/site/v3/sports/${dataPath(sport)}/leaders`;
}

function statByType(entry, type) {
  const stat = (entry?.stats || []).find((item) => item?.type === type);
  return stat || null;
}

export function normalizeStandings(payload, sportId) {
  const isSoccer = sportId === "mls" || sportId === "fifa";
  const children = Array.isArray(payload?.children) ? payload.children : [];

  return children
    .map((child) => {
      const entries = child?.standings?.entries || [];
      const teams = entries
        .map((entry) => {
          const wins = statByType(entry, "wins");
          const losses = statByType(entry, "losses");
          const ties = statByType(entry, "ties");
          const winPct = statByType(entry, "winpercent");
          const points = statByType(entry, "points");
          const streak = statByType(entry, "streak");
          const gamesPlayed = statByType(entry, "gamesplayed");
          return {
            name: entry.team?.shortDisplayName || entry.team?.displayName || entry.team?.name || "—",
            abbr: entry.team?.abbreviation || "",
            logo: entry.team?.logos?.[0]?.href || null,
            wins: wins ? Math.round(wins.value) : null,
            losses: losses ? Math.round(losses.value) : null,
            ties: ties ? Math.round(ties.value) : null,
            winPct: winPct ? winPct.value : null,
            points: points ? Math.round(points.value) : null,
            streak: streak ? streak.displayValue : null,
            gamesPlayed: gamesPlayed ? Math.round(gamesPlayed.value) : null,
          };
        })
        .sort((a, b) =>
          isSoccer ? (b.points ?? -1) - (a.points ?? -1) : (b.winPct ?? -1) - (a.winPct ?? -1),
        );

      return {
        groupName: child.name || child.shortName || child.abbreviation || "Standings",
        isSoccer,
        teams,
      };
    })
    .filter((group) => group.teams.length);
}

export function recordLabel(team, isSoccer) {
  if (isSoccer) {
    const wlt = [team.wins, team.losses, team.ties].every((v) => v !== null)
      ? `${team.wins}-${team.losses}-${team.ties}`
      : "—";
    return team.points !== null ? `${team.points} pts · ${wlt}` : wlt;
  }
  if (team.wins === null || team.losses === null) return "—";
  return team.ties ? `${team.wins}-${team.losses}-${team.ties}` : `${team.wins}-${team.losses}`;
}

export function normalizeLeaders(payload, maxCategories = 10, perCategory = 3) {
  const categories = payload?.leaders?.categories;
  if (!Array.isArray(categories)) return [];

  return categories
    .filter((category) => Array.isArray(category.leaders) && category.leaders.length)
    .slice(0, maxCategories)
    .map((category) => ({
      category: category.displayName || category.name || "Leaders",
      leaders: category.leaders.slice(0, perCategory).map((leader) => ({
        athlete: leader.athlete?.displayName || leader.athlete?.fullName || "—",
        team: leader.team?.abbreviation || "",
        value: leader.displayValue ?? "",
        headshot: leader.athlete?.headshot?.href || leader.athlete?.headshot || null,
      })),
    }));
}

// External "stats nerd" reference sites per sport (verified canonical URLs).
export const STATS_REFERENCE_LINKS = {
  nfl: [
    { siteName: "Pro Football Reference", url: "https://www.pro-football-reference.com/", note: "WAR-adjacent metrics, air yards, EPA" },
    { siteName: "PFR Advanced Stats", url: "https://www.pro-football-reference.com/years/2025/advanced.htm", note: "Charting & advanced splits" },
  ],
  mlb: [
    { siteName: "Baseball Reference", url: "https://www.baseball-reference.com/", note: "WAR, OPS+, FIP, full splits" },
  ],
  nhl: [
    { siteName: "Hockey Reference", url: "https://www.hockey-reference.com/", note: "Corsi, xG, on-ice metrics" },
  ],
  nba: [
    { siteName: "Basketball Reference", url: "https://www.basketball-reference.com/", note: "PER, BPM, VORP, four factors" },
    { siteName: "NBA.com Stats", url: "https://www.nba.com/stats", note: "Tracking & hustle data" },
  ],
  mls: [
    { siteName: "FBref — MLS", url: "https://fbref.com/en/comps/22/Major-League-Soccer-Stats", note: "xG, xA, progressive actions" },
  ],
  tennis: [
    { siteName: "Tennis Abstract", url: "https://www.tennisabstract.com/", note: "Elo, serve/return splits, H2H" },
    { siteName: "ATP Leaderboards", url: "https://www.atptour.com/en/stats/leaderboard", note: "Official serve/return ratings" },
  ],
  golf: [
    { siteName: "PGA TOUR Stats", url: "https://www.pgatour.com/stats", note: "Strokes Gained categories" },
    { siteName: "Data Golf", url: "https://datagolf.com/", note: "Predictive SG models & skill ratings" },
  ],
  fifa: [
    { siteName: "FBref — World Cup", url: "https://fbref.com/en/comps/1/World-Cup-Stats", note: "xG, xA, tournament history" },
  ],
};
