// Ticketmaster ticket-discovery scaffold for BRNDN (UI + ranking logic only).
//
// The live integration needs a Ticketmaster Discovery API key, which CANNOT be
// exposed in this static client. The flow once a backend exists:
//
//   GET /api/tickets?sport=nba&event=<id>        (serverless proxy on Vercel)
//     -> Ticketmaster Discovery API (event search + price ranges / offers)
//     -> rankSeats() -> best->worst seat listings returned to the client
//
// Until that proxy is live, TICKETS_ENABLED stays false and the UI shows a
// "coming soon" state (plus sample ranked rows in dev so the layout is
// reviewable). The proxy is the only place the apikey should ever live.

export const TICKETS_ENABLED = false; // flip true once /api/tickets is deployed

// Seat-quality tiers, best to worst — drives the ranking.
const TIER_RANK = { premium: 0, club: 1, lower: 2, upper: 3, ga: 4 };

export const TIER_LABEL = {
  premium: "Premium / Courtside",
  club: "Club",
  lower: "Lower bowl",
  upper: "Upper deck",
  ga: "General admission",
};

/**
 * Rank seat listings best -> worst: better tier first, then cheaper within a
 * tier (best seat for the money floats up). Pure and non-mutating.
 */
export function rankSeats(listings) {
  return [...listings].sort((a, b) => {
    const ta = TIER_RANK[a.tier] ?? 9;
    const tb = TIER_RANK[b.tier] ?? 9;
    if (ta !== tb) return ta - tb;
    return (a.priceUsd ?? Infinity) - (b.priceUsd ?? Infinity);
  });
}

// Placeholder listings for the dev preview only — NOT real pricing.
export const SAMPLE_SEATS = [
  { tier: "upper", section: "315", priceUsd: 38 },
  { tier: "premium", section: "Courtside A", priceUsd: 720 },
  { tier: "lower", section: "104", priceUsd: 165 },
  { tier: "club", section: "Club 12", priceUsd: 240 },
  { tier: "upper", section: "320", priceUsd: 32 },
];

/**
 * The Discovery API event-search URL the FUTURE serverless proxy would call.
 * NEVER call this from the client — the apikey must stay server-side; this
 * exists to document the contract for the proxy implementation.
 */
export function ticketmasterSearchUrl({ keyword, classificationName, apikey } = {}) {
  const params = new URLSearchParams({
    apikey: apikey || "SERVER_SIDE_ONLY",
    keyword: keyword || "",
    classificationName: classificationName || "",
    sort: "date,asc",
  });
  return `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;
}
