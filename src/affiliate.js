// Sportsbook affiliate config + US state eligibility.
//
// ▶ TO ACTIVATE: once you're approved by an affiliate network (Income Access /
//   Better Collective / Catena) or a direct operator program, paste your real
//   tracking link into each operator's `url` below. Until then these are
//   PLACEHOLDERS and the buttons go to example.com.
//
// CTAs only render for operators live in the visitor's selected/declared state,
// so promos are never shown where online sports betting is illegal.

export const OPERATORS = [
  { id: "draftkings", name: "DraftKings", offer: "Bet $5, get $200 in bonus bets", url: "https://example.com/aff/draftkings", color: "#53d337" },
  { id: "fanduel", name: "FanDuel", offer: "Bet $5, get $150 in bonus bets", url: "https://example.com/aff/fanduel", color: "#1493ff" },
  { id: "betmgm", name: "BetMGM", offer: "First bet offer up to $1,500", url: "https://example.com/aff/betmgm", color: "#c8a04e" },
  { id: "caesars", name: "Caesars", offer: "First bet up to $1,000 back", url: "https://example.com/aff/caesars", color: "#0a7d4f" },
  { id: "espnbet", name: "ESPN BET", offer: "Bet $10, get $100 in bonus", url: "https://example.com/aff/espnbet", color: "#ff5b35" },
];

// US states/territories with legal online sportsbooks. ⚠ VERIFY & MAINTAIN before
// launch — sports-betting legality changes frequently and is state-specific.
// Set a per-operator `states: [...]` above to override for books not live everywhere.
export const LEGAL_STATES = new Set([
  "AZ", "CO", "CT", "DC", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA",
  "MI", "NH", "NJ", "NY", "NC", "OH", "OR", "PA", "RI", "TN", "VT", "VA", "WV", "WY",
]);

export const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
  ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

const STATE_KEY = "brndn-state";
const stateListeners = new Set();

export function getUserState() {
  try {
    return localStorage.getItem(STATE_KEY) || "";
  } catch {
    return "";
  }
}

export function setUserState(code) {
  try {
    localStorage.setItem(STATE_KEY, code || "");
  } catch {
    /* storage blocked */
  }
  for (const fn of stateListeners) {
    try {
      fn(code || "");
    } catch {
      /* ignore */
    }
  }
}

export function onUserStateChange(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

export function bettingLegalIn(stateCode) {
  return Boolean(stateCode) && LEGAL_STATES.has(stateCode);
}

/** Operators available to show in a given state (empty if state is unset or illegal). */
export function eligibleOperators(stateCode) {
  if (!bettingLegalIn(stateCode)) return [];
  return OPERATORS.filter((op) => !op.states || op.states.includes(stateCode));
}

/** Best-effort IP→state lookup (user-initiated). Returns a 2-letter US code or null. */
export async function detectState() {
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (!res.ok) return null;
    const data = await res.json();
    return data.country_code === "US" && data.region_code ? data.region_code : null;
  } catch {
    return null;
  }
}
