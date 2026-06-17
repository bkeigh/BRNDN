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
