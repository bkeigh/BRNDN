// First-party cookie/consent gate for BRNDN.
//
// Non-essential categories (analytics, advertising) stay OFF until the visitor
// opts in through the consent banner. Future analytics/ad code must load only
// inside whenConsented("analytics", ...) / whenConsented("advertising", ...) so
// nothing that sets non-essential cookies runs before consent. This is the
// code-level foundation a certified CMP (Cookiebot/Osano/etc.) can replace later
// without changing the call sites.

export const CONSENT_KEY = "brndn-consent-v1";
export const CONSENT_CATEGORIES = ["analytics", "advertising"];

function readRaw() {
  try {
    return JSON.parse(localStorage.getItem(CONSENT_KEY) || "null");
  } catch {
    return null;
  }
}

/** The stored consent record, or null if the visitor hasn't decided yet. */
export function getConsent() {
  const raw = readRaw();
  if (!raw || typeof raw !== "object" || typeof raw.choices !== "object") return null;
  return raw;
}

export function hasConsentDecision() {
  return getConsent() !== null;
}

/** True if the visitor opted into a category. Unknown/essential categories are always allowed. */
export function consentGranted(category) {
  if (!CONSENT_CATEGORIES.includes(category)) return true;
  const record = getConsent();
  return Boolean(record && record.choices[category]);
}

const changeListeners = new Set();
const reopenListeners = new Set();

/**
 * Persist a decision. `granted` is either a boolean applied to every
 * non-essential category, or an object of per-category booleans.
 */
export function setConsent(granted) {
  const choices = {};
  for (const category of CONSENT_CATEGORIES) {
    choices[category] =
      typeof granted === "object" && granted !== null
        ? Boolean(granted[category])
        : Boolean(granted);
  }
  const record = { v: 1, ts: Date.now(), choices };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    /* storage blocked — consent just won't be remembered next visit */
  }
  for (const fn of changeListeners) {
    try {
      fn(record);
    } catch {
      /* ignore listener errors */
    }
  }
  return record;
}

/** Subscribe to consent changes. Returns an unsubscribe function. */
export function onConsentChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/**
 * Run `cb` once the visitor has consented to `category` — immediately if already
 * granted, otherwise when consent is later given. Returns an unsubscribe fn.
 */
export function whenConsented(category, cb) {
  if (consentGranted(category)) {
    cb();
    return () => {};
  }
  return onConsentChange(() => {
    if (consentGranted(category)) cb();
  });
}

/** Ask any mounted consent banner to re-open (the footer "Cookie settings" link). */
export function requestConsentReopen() {
  for (const fn of reopenListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function onConsentReopen(fn) {
  reopenListeners.add(fn);
  return () => reopenListeners.delete(fn);
}
