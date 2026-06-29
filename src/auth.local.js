// Dummy auth adapter backed by localStorage. Throwaway — only this file is
// discarded when Supabase lands; auth.js's public surface + the adapter contract
// stay. Not real security (the "hash" just avoids storing raw passwords); it
// exists so the login UI and flows are real and the data shapes match Supabase.

const SESSION_KEY = "brndn-auth-session-v1"; // { userId, ts }
const USERS_KEY = "brndn-auth-users-v1"; // { [id]: userRecord }

const listeners = new Set();
let readyResolve;
const readyPromise = new Promise((r) => (readyResolve = r));
let cached = null; // resolved session user (public shape)

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked — session just won't persist */
  }
}

function publicUser(record) {
  if (!record) return null;
  const { passwordHash, ...rest } = record;
  return rest;
}

function emit(user) {
  for (const fn of listeners) {
    try {
      fn(user);
    } catch {
      /* ignore */
    }
  }
}

// Dummy "hash" — NOT security; just so plaintext passwords aren't stored raw.
async function fakeHash(password) {
  const data = new TextEncoder().encode(String(password));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

(function restore() {
  const session = readJSON(SESSION_KEY, null);
  const users = readJSON(USERS_KEY, {});
  cached = session && session.userId ? publicUser(users[session.userId]) : null;
  readyResolve();
})();

export const localAuthAdapter = {
  getUser: () => cached,
  ready: () => readyPromise,
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async signUp({ email, password, displayName }) {
    const norm = String(email || "").trim().toLowerCase();
    if (!norm || !password) return { user: null, error: "Email and password are required." };
    const users = readJSON(USERS_KEY, {});
    if (Object.values(users).some((u) => u.email === norm)) {
      return { user: null, error: "An account with that email already exists." };
    }
    const id = crypto.randomUUID();
    const record = {
      id,
      email: norm,
      displayName: displayName?.trim() || norm.split("@")[0],
      avatarSeed: id.slice(0, 8),
      provider: "local",
      isGuest: false,
      createdAt: new Date().toISOString(),
      passwordHash: await fakeHash(password),
    };
    users[id] = record;
    writeJSON(USERS_KEY, users);
    writeJSON(SESSION_KEY, { userId: id, ts: Date.now() });
    cached = publicUser(record);
    emit(cached);
    return { user: cached, error: null };
  },

  async signIn({ email, password }) {
    const norm = String(email || "").trim().toLowerCase();
    const users = readJSON(USERS_KEY, {});
    const match = Object.values(users).find((u) => u.email === norm);
    if (!match || match.passwordHash !== (await fakeHash(password))) {
      return { user: null, error: "Incorrect email or password." };
    }
    writeJSON(SESSION_KEY, { userId: match.id, ts: Date.now() });
    cached = publicUser(match);
    emit(cached);
    return { user: cached, error: null };
  },

  async signOut() {
    writeJSON(SESSION_KEY, null);
    cached = null;
    emit(null);
  },
};
