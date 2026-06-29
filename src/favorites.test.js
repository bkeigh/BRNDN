import { describe, expect, test } from "vitest";
import { mergeFavorites } from "./favorites.js";

describe("mergeFavorites", () => {
  test("unions leagues and games and prefers the user's preferences", () => {
    const guest = {
      leagues: ["nfl", "mlb"],
      teams: [],
      games: ["g1"],
      preferences: { defaultSportId: "nfl", oddsFormat: "decimal" },
    };
    const user = {
      leagues: ["mlb", "nba"],
      teams: [],
      games: ["g2"],
      preferences: { oddsFormat: "american" },
    };
    const merged = mergeFavorites(guest, user);

    expect(new Set(merged.leagues)).toEqual(new Set(["nfl", "mlb", "nba"]));
    expect(new Set(merged.games)).toEqual(new Set(["g1", "g2"]));
    expect(merged.preferences.oddsFormat).toBe("american");
    expect(merged.preferences.defaultSportId).toBe("nfl");
  });

  test("dedupes teams by id, keeping the lower order", () => {
    const guest = { teams: [{ id: "kc", name: "Chiefs", order: 3 }] };
    const user = { teams: [{ id: "kc", name: "Chiefs", order: 0 }, { id: "sf", name: "49ers", order: 1 }] };
    const merged = mergeFavorites(guest, user);

    expect(merged.teams).toHaveLength(2);
    expect(merged.teams.find((t) => t.id === "kc").order).toBe(0);
    expect(merged.teams.find((t) => t.id === "sf").order).toBe(1);
  });

  test("handles null/empty inputs", () => {
    expect(mergeFavorites(null, null)).toMatchObject({ leagues: [], teams: [], games: [] });
    const merged = mergeFavorites(undefined, { leagues: ["nhl"], teams: [], games: [] });
    expect(merged.leagues).toEqual(["nhl"]);
  });
});
