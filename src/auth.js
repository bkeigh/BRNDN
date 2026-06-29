// User auth — dummy now, Supabase later.
//
// Mirrors the consent.js/analytics.js discipline: call sites only ever touch
// this module's public surface (or the useAuth hook). Internally everything
// delegates to a swappable `adapter`, so a SupabaseAuthAdapter drops in by
// changing the one import below — no UI or call-site changes.

import { localAuthAdapter } from "./auth.local.js";
// Later: import { supabaseAuthAdapter } from "./auth.supabase.js";

// The single swap point. Today: local/dummy. Later: supabaseAuthAdapter.
const adapter = localAuthAdapter;

// ---- Adapter contract every implementation must satisfy ----
//   getUser(): User | null                       sync read of the cached session
//   signUp({ email, password, displayName }): Promise<{ user, error }>
//   signIn({ email, password }): Promise<{ user, error }>
//   signOut(): Promise<void>
//   onChange(cb: (user|null) => void): () => void   the adapter's own bus
//   ready(): Promise<void>                        resolves once session restored
//
// User shape (stable across adapters):
//   { id, email, displayName, avatarSeed, createdAt, provider, isGuest:false }

const changeListeners = new Set();
let current = adapter.getUser(); // may be null until ready() resolves

// Bridge the adapter's bus onto our public bus so listeners stay adapter-agnostic.
adapter.onChange((user) => {
  current = user;
  for (const fn of changeListeners) {
    try {
      fn(user);
    } catch {
      /* ignore listener errors */
    }
  }
});

/** Sync snapshot of the current user (or null). Mirrors getConsent(). */
export function getUser() {
  return current;
}

export function isAuthed() {
  return Boolean(current);
}

export async function signUp(input) {
  return adapter.signUp(input);
}

export async function signIn(input) {
  return adapter.signIn(input);
}

export async function signOut() {
  return adapter.signOut();
}

/** Subscribe to auth changes. Returns an unsubscribe fn. Mirrors onConsentChange. */
export function onAuthChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/** Run cb now if authed, else when the user next signs in. Mirrors whenConsented. */
export function whenAuthed(cb) {
  if (current) {
    cb(current);
    return () => {};
  }
  return onAuthChange((u) => {
    if (u) cb(u);
  });
}

/** Resolves once the initial session has been restored from storage. */
export function ready() {
  return adapter.ready();
}
