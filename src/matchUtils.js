export const FIFA_WORLD_CUP_2026_API =
  "https://api.fifa.com/api/v3/calendar/matches?from=2026-06-11T00:00:00Z&to=2026-07-20T00:00:00Z&language=en&count=500&idCompetition=17&idSeason=285023";

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

function inferStatus(match, now) {
  if (match.MatchStatus === 0) return "completed";
  if (LIVE_STATUS_CODES.has(Number(match.MatchStatus))) return "live";
  if (matchMinute(match.MatchTime) > 0 && (hasScore(match.HomeTeamScore) || hasScore(match.AwayTeamScore))) return "live";
  if (Number(match.MatchStatus) === 1 && isInsideFallbackLiveWindow(match, now)) return "live";
  return "upcoming";
}

function statusLabel(match, status) {
  if (status === "completed") return "FT";
  if (status === "live") return matchMinute(match.MatchTime) > 0 ? match.MatchTime : "LIVE";
  return "Scheduled";
}

function clockLabel(match, status) {
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
      const status = inferStatus(match, now);

      return {
        id: String(match.IdMatch),
        matchNumber: Number(match.MatchNumber),
        stage: localizedText(match.StageName, "Match"),
        group: localizedText(match.GroupName, ""),
        competition: localizedText(match.CompetitionName, "FIFA World Cup"),
        season: localizedText(match.SeasonName, "FIFA World Cup 2026"),
        date: match.Date,
        localDate: match.LocalDate,
        status,
        statusLabel: statusLabel(match, status),
        clockLabel: clockLabel(match, status),
        home,
        away,
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

export function summarizeTournament(matches, now = new Date()) {
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
  };
}
