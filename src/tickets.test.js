import { describe, expect, test } from "vitest";
import { rankSeats } from "./tickets.js";

describe("rankSeats", () => {
  test("orders better tiers first, cheapest first within a tier", () => {
    const ranked = rankSeats([
      { tier: "upper", priceUsd: 40 },
      { tier: "premium", priceUsd: 500 },
      { tier: "lower", priceUsd: 180 },
      { tier: "premium", priceUsd: 350 },
    ]);

    expect(ranked.map((seat) => [seat.tier, seat.priceUsd])).toEqual([
      ["premium", 350],
      ["premium", 500],
      ["lower", 180],
      ["upper", 40],
    ]);
  });

  test("treats unknown tiers as worst and missing prices as most expensive", () => {
    const ranked = rankSeats([
      { tier: "mystery", priceUsd: 10 },
      { tier: "club", priceUsd: 200 },
      { tier: "club" },
    ]);

    expect(ranked.map((seat) => seat.tier)).toEqual(["club", "club", "mystery"]);
    expect(ranked[0].priceUsd).toBe(200);
  });

  test("does not mutate the input array", () => {
    const input = [
      { tier: "upper", priceUsd: 40 },
      { tier: "premium", priceUsd: 500 },
    ];
    rankSeats(input);
    expect(input[0].tier).toBe("upper");
  });
});
