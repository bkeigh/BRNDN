import { describe, expect, test } from "vitest";
import {
  buildKnockoutRounds,
  getLiveMatches,
  getNextMatches,
  getTodayMatches,
  normalizeFifaMatches,
  summarizeTournament,
} from "./matchUtils.js";

const response = {
  Results: [
    {
      IdMatch: "group-1",
      MatchNumber: 23,
      Date: "2026-06-17T17:00:00Z",
      MatchStatus: 0,
      MatchTime: "95'",
      StageName: [{ Locale: "en-GB", Description: "First Stage" }],
      GroupName: [{ Locale: "en-GB", Description: "Group K" }],
      Home: {
        IdTeam: "POR",
        TeamName: [{ Locale: "en-GB", Description: "Portugal" }],
        ShortClubName: "Portugal",
        Abbreviation: "POR",
        PictureUrl: "https://api.fifa.com/api/v3/picture/flags-{format}-{size}/POR",
      },
      Away: {
        IdTeam: "COD",
        TeamName: [{ Locale: "en-GB", Description: "Congo DR" }],
        ShortClubName: "Congo DR",
        Abbreviation: "COD",
        PictureUrl: "https://api.fifa.com/api/v3/picture/flags-{format}-{size}/COD",
      },
      HomeTeamScore: 1,
      AwayTeamScore: 1,
      Winner: null,
      Stadium: {
        Name: [{ Locale: "en-GB", Description: "Miami Stadium" }],
        CityName: [{ Locale: "en-GB", Description: "Miami" }],
      },
    },
    {
      IdMatch: "r32-1",
      MatchNumber: 73,
      Date: "2026-06-28T19:00:00Z",
      MatchStatus: 1,
      StageName: [{ Locale: "en-GB", Description: "Round of 32" }],
      Home: null,
      Away: null,
      HomeTeamScore: null,
      AwayTeamScore: null,
      PlaceHolderA: "2A",
      PlaceHolderB: "2B",
      Stadium: {
        Name: [{ Locale: "en-GB", Description: "Los Angeles Stadium" }],
        CityName: [{ Locale: "en-GB", Description: "Los Angeles" }],
      },
    },
    {
      IdMatch: "final",
      MatchNumber: 104,
      Date: "2026-07-19T19:00:00Z",
      MatchStatus: 1,
      StageName: [{ Locale: "en-GB", Description: "Final" }],
      Home: null,
      Away: null,
      PlaceHolderA: "W101",
      PlaceHolderB: "W102",
    },
  ],
};

describe("normalizeFifaMatches", () => {
  test("normalizes completed teams, scores, flags, venue and result state from FIFA match data", () => {
    const [match] = normalizeFifaMatches(response);

    expect(match).toMatchObject({
      id: "group-1",
      matchNumber: 23,
      stage: "First Stage",
      group: "Group K",
      status: "completed",
      statusLabel: "FT",
      homeScore: 1,
      awayScore: 1,
      winnerSide: "draw",
      venue: "Miami Stadium",
      city: "Miami",
    });
    expect(match.home).toMatchObject({
      name: "Portugal",
      abbreviation: "POR",
      flagUrl: "https://api.fifa.com/api/v3/picture/flags-sq-4/POR",
    });
  });

  test("keeps future knockout placeholders when FIFA has not filled teams yet", () => {
    const matches = normalizeFifaMatches(response);
    const r32 = matches.find((match) => match.matchNumber === 73);

    expect(r32.status).toBe("upcoming");
    expect(r32.home).toMatchObject({ name: "2A", abbreviation: "2A", placeholder: true });
    expect(r32.away).toMatchObject({ name: "2B", abbreviation: "2B", placeholder: true });
  });

  test("infers a live match when kickoff has passed but FIFA still reports scheduled", () => {
    const matches = normalizeFifaMatches(
      {
        Results: [
          {
            IdMatch: "scheduled-at-kickoff",
            MatchNumber: 22,
            Date: "2026-06-17T20:00:00Z",
            MatchStatus: 1,
            MatchTime: "0'",
            StageName: [{ Locale: "en-GB", Description: "First Stage" }],
            Home: {
              IdTeam: "ENG",
              TeamName: [{ Locale: "en-GB", Description: "England" }],
              ShortClubName: "England",
              Abbreviation: "ENG",
            },
            Away: {
              IdTeam: "CRO",
              TeamName: [{ Locale: "en-GB", Description: "Croatia" }],
              ShortClubName: "Croatia",
              Abbreviation: "CRO",
            },
          },
        ],
      },
      { now: new Date("2026-06-17T20:08:00Z") },
    );

    expect(matches[0]).toMatchObject({
      status: "live",
      statusLabel: "LIVE",
      clockLabel: "Kickoff",
    });
  });

  test("keeps a scheduled zero-minute match upcoming before kickoff", () => {
    const matches = normalizeFifaMatches(
      {
        Results: [
          {
            IdMatch: "future-zero",
            MatchNumber: 22,
            Date: "2026-06-17T20:00:00Z",
            MatchStatus: 1,
            MatchTime: "0'",
            StageName: [{ Locale: "en-GB", Description: "First Stage" }],
            Home: { IdTeam: "ENG", ShortClubName: "England", Abbreviation: "ENG" },
            Away: { IdTeam: "CRO", ShortClubName: "Croatia", Abbreviation: "CRO" },
          },
        ],
      },
      { now: new Date("2026-06-17T19:50:00Z") },
    );

    expect(matches[0].status).toBe("upcoming");
  });
});

describe("buildKnockoutRounds", () => {
  test("groups knockout matches by World Cup stage order", () => {
    const rounds = buildKnockoutRounds(normalizeFifaMatches(response));

    expect(rounds.map((round) => round.label)).toEqual(["Round of 32", "Final"]);
    expect(rounds[0].matches.map((match) => match.matchNumber)).toEqual([73]);
    expect(rounds[1].matches.map((match) => match.matchNumber)).toEqual([104]);
  });
});

describe("getTodayMatches", () => {
  test("returns matches on the supplied local date", () => {
    const matches = getTodayMatches(normalizeFifaMatches(response), new Date("2026-06-17T12:00:00-04:00"));

    expect(matches.map((match) => match.matchNumber)).toEqual([23]);
  });
});

describe("live and next match helpers", () => {
  test("returns live matches and next upcoming matches in time order", () => {
    const matches = normalizeFifaMatches(
      {
        Results: [
          {
            IdMatch: "live",
            MatchNumber: 22,
            Date: "2026-06-17T20:00:00Z",
            MatchStatus: 1,
            MatchTime: "0'",
            StageName: [{ Locale: "en-GB", Description: "First Stage" }],
            Home: { IdTeam: "ENG", ShortClubName: "England", Abbreviation: "ENG" },
            Away: { IdTeam: "CRO", ShortClubName: "Croatia", Abbreviation: "CRO" },
          },
          {
            IdMatch: "next",
            MatchNumber: 21,
            Date: "2026-06-17T23:00:00Z",
            MatchStatus: 1,
            StageName: [{ Locale: "en-GB", Description: "First Stage" }],
            Home: { IdTeam: "GHA", ShortClubName: "Ghana", Abbreviation: "GHA" },
            Away: { IdTeam: "PAN", ShortClubName: "Panama", Abbreviation: "PAN" },
          },
        ],
      },
      { now: new Date("2026-06-17T20:08:00Z") },
    );

    expect(getLiveMatches(matches).map((match) => match.matchNumber)).toEqual([22]);
    expect(getNextMatches(matches, new Date("2026-06-17T20:08:00Z")).map((match) => match.matchNumber)).toEqual([21]);
  });
});

describe("summarizeTournament", () => {
  test("counts total, completed, live, upcoming, and next match", () => {
    const summary = summarizeTournament(normalizeFifaMatches(response), new Date("2026-06-17T12:00:00-04:00"));

    expect(summary).toMatchObject({
      total: 3,
      completed: 1,
      live: 0,
      upcoming: 2,
      nextMatchNumber: 73,
    });
  });
});
