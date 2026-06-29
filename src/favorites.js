// Favorite teams / leagues / games + light preferences. Same seam pattern as
// consent.js/auth.js: storage helpers -> cached snapshot -> listener bus. It is
// user-aware: guests persist locally under a "guest" scope; on sign-in the guest
// set merges into the account scope. Swapping localStorage for a Supabase
// `favorites` table later touches only this file's storage helpers.

import { useSyncExternalStore } from "react";
import { getUser, onAuthChange } from "./auth.js";

const PREFIX = "brndn-favorites-";
const GUEST = "guest";
const VERSION = 1;

const changeListeners = new Set();

function emptyFavorites() {
  return {
    v: VERSION,
    leagues: [],
    teams: [],
    games: [],
    preferences: { defaultSportId: null, oddsFormat: "american" },
    updatedAt: null,
  };
}

function keyFor(userId) {
  return PREFIX + (userId || GUEST);
}

function read(userId) {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return emptyFavorites();
    return { ...emptyFavorites(), ...JSON.parse(raw) };
  } catch {
    return emptyFavorites();
  }
}

function write(userId, record) {
  const next = { ...record, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    /* storage blocked — favorites just won't persist */
  }
  return next;
}

function clearScope(userId) {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}

/**
 * Pure merge — union leagues/games, dedupe teams by id keeping the lower order,
 * prefer the signed-in user's preferences. Exported for testing and reused
 * verbatim by the future Supabase backend.
 */
export function mergeFavorites(guest, user) {
  const g = guest || emptyFavorites();
  const u = user || emptyFavorites();
  const byId = new Map();
  for (const t of [...(u.teams || []), ...(g.teams || [])]) {
    const existing = byId.get(t.id);
    if (!existing || (t.order ?? 0) < (existing.order ?? 0)) byId.set(t.id, t);
  }
  return {
    v: VERSION,
    leagues: [...new Set([...(u.leagues || []), ...(g.leagues || [])])],
    teams: [...byId.values()],
    games: [...new Set([...(u.games || []), ...(g.games || [])])],
    preferences: { ...(g.preferences || {}), ...(u.preferences || {}) },
    updatedAt: new Date().toISOString(),
  };
}

// --- Scope + cached snapshot (stable reference for useSyncExternalStore) ----
let scope = getUser()?.id || GUEST;
let snapshot = read(scope);

function refresh() {
  snapshot = read(scope);
  for (const fn of changeListeners) {
    try {
      fn(snapshot);
    } catch {
      /* ignore */
    }
  }
}

// On sign-in: merge the guest set into the account and drop the guest copy.
// On sign-out: fall back to the (retained) guest scope.
onAuthChange((user) => {
  if (user && user.id) {
    write(user.id, mergeFavorites(read(GUEST), read(user.id)));
    clearScope(GUEST);
    scope = user.id;
  } else {
    scope = GUEST;
  }
  refresh();
});

// --- Public read API -------------------------------------------------------
export function getFavorites() {
  return snapshot;
}
export function isFavoriteLeague(sportId) {
  return snapshot.leagues.includes(sportId);
}
export function isFavoriteTeam(teamId) {
  return snapshot.teams.some((t) => t.id === teamId);
}
export function isFollowingGame(gameId) {
  return snapshot.games.includes(gameId);
}
export function getPreferences() {
  return snapshot.preferences;
}

// --- Mutations -------------------------------------------------------------
function mutate(fn) {
  const record = read(scope);
  fn(record);
  write(scope, record);
  refresh();
}

export function toggleFavoriteLeague(sportId) {
  mutate((r) => {
    const i = r.leagues.indexOf(sportId);
    if (i >= 0) r.leagues.splice(i, 1);
    else r.leagues.push(sportId);
  });
}

export function toggleFavoriteTeam(team) {
  mutate((r) => {
    const i = r.teams.findIndex((t) => t.id === team.id);
    if (i >= 0) {
      r.teams.splice(i, 1);
    } else {
      r.teams.push({
        id: team.id,
        sportId: team.sportId,
        name: team.name,
        abbreviation: team.abbreviation,
        flagUrl: team.flagUrl ?? null,
        order: r.teams.length,
      });
    }
  });
}

export function toggleFollowGame(gameId) {
  mutate((r) => {
    const i = r.games.indexOf(gameId);
    if (i >= 0) r.games.splice(i, 1);
    else r.games.push(gameId);
  });
}

export function reorderTeams(orderedIds) {
  mutate((r) => {
    const pos = new Map(orderedIds.map((id, i) => [id, i]));
    r.teams.sort((a, b) => (pos.get(a.id) ?? 999) - (pos.get(b.id) ?? 999));
    r.teams.forEach((t, i) => {
      t.order = i;
    });
  });
}

export function setPreference(key, value) {
  mutate((r) => {
    r.preferences = { ...r.preferences, [key]: value };
  });
}

export function onFavoritesChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export function useFavorites() {
  const favs = useSyncExternalStore(onFavoritesChange, getFavorites, emptyFavorites);
  return {
    ...favs,
    isFavoriteLeague,
    isFavoriteTeam,
    isFollowingGame,
    toggleFavoriteLeague,
    toggleFavoriteTeam,
    toggleFollowGame,
    reorderTeams,
    setPreference,
  };
}
