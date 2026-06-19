// Privacy-friendly, consent-gated analytics for BRNDN.
//
// DISABLED by default: set ANALYTICS.domain to your Plausible/Umami site to
// activate. The provider script loads ONLY after the visitor opts into the
// "analytics" consent category (see consent.js); events fired before then are
// queued and flushed on consent. Swapping providers is a one-file change — call
// sites only use track().

import { consentGranted, whenConsented } from "./consent.js";

const ANALYTICS = {
  provider: "plausible", // "plausible" | "umami" | "none"
  domain: "", // e.g. "brndn.netlify.app" — leave empty to keep analytics OFF
  src: "https://plausible.io/js/script.js",
};

let loaded = false;
let initialized = false;
const queue = [];

function enabled() {
  return ANALYTICS.provider !== "none" && Boolean(ANALYTICS.domain) && typeof document !== "undefined";
}

function send(event, props) {
  if (ANALYTICS.provider === "plausible" && typeof window.plausible === "function") {
    window.plausible(event, props ? { props } : undefined);
  }
}

function loadScript() {
  if (loaded || !enabled()) return;
  loaded = true;
  if (ANALYTICS.provider === "plausible") {
    // Queue shim so events fired before the script downloads aren't lost.
    window.plausible =
      window.plausible ||
      function () {
        (window.plausible.q = window.plausible.q || []).push(arguments);
      };
    const s = document.createElement("script");
    s.defer = true;
    s.setAttribute("data-domain", ANALYTICS.domain);
    s.src = ANALYTICS.src;
    document.head.appendChild(s);
  }
  while (queue.length) {
    const [event, props] = queue.shift();
    send(event, props);
  }
}

/** Call once at startup. Loads the provider only after analytics consent. */
export function initAnalytics() {
  if (initialized) return;
  initialized = true;
  if (!enabled()) return;
  whenConsented("analytics", loadScript);
}

/** Track an event. Queues until consent; no-ops entirely if analytics is disabled. */
export function track(event, props) {
  if (!enabled()) return;
  if (consentGranted("analytics")) send(event, props);
  else queue.push([event, props]);
}
