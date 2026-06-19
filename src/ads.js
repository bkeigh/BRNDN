// Consent-gated, geo-aware sportsbook ad / affiliate slots for BRNDN.
//
// DISABLED by default: every placement is inert in production until ALL of:
//   1. the visitor opts into the "advertising" consent category (consent.js),
//   2. a creative is configured for that placement below, and
//   3. geo-eligibility resolves (US sportsbook affiliates may only promote a
//      book in states where it is licensed).
//
// This is the drop-in point for Vault Network (https://www.vaultnetwork.io/)
// or any affiliate once the application is approved — paste tracked links or
// tag HTML into AD_CREATIVES; no layout/JSX changes are needed. Affiliate CTAs
// render with rel="sponsored nofollow" and an FTC + 21+ disclosure.

import { consentGranted } from "./consent.js";

// Placement ids referenced by <AdSlot placement="..." /> in the UI.
export const AD_PLACEMENTS = {
  vegasBoard: "vegas-board", // beside the cross-game Vegas lines (high intent)
  gameBetting: "game-betting", // inside a game's betting panel (highest intent)
};

// Per-placement creatives. Empty => the slot shows nothing in production.
// Shape (affiliate CTA): { book, headline, cta, href }
//   e.g. "vegas-board": {
//          book: "DraftKings",
//          headline: "Bet $5, get $150 in bonus bets",
//          cta: "Claim offer",
//          href: "https://track.vaultnetwork.io/...",
//        }
const AD_CREATIVES = {
  // Fill from the Vault Network dashboard once approved.
};

// Flip to true only once a real state-resolution source exists (e.g. a
// serverless geo lookup). Until then affiliate CTAs stay hidden (fail-closed)
// so we never promote a sportsbook to an ineligible/unverified jurisdiction.
const GEO_READY = false;

/** True if the visitor has consented to advertising cookies. */
export function adsConsented() {
  return consentGranted("advertising");
}

/** The configured creative for a placement, or null. */
export function creativeFor(placement) {
  return AD_CREATIVES[placement] || null;
}

/**
 * Whether a creative may be shown to this visitor's location. Placeholder:
 * fail-closed until geo resolution is wired up. Later: check the book's
 * allowed states against the resolved region.
 */
export function geoAllows(/* creative, region */) {
  return GEO_READY;
}
