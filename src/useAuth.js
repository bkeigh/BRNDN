// React binding for the auth seam. useSyncExternalStore maps 1:1 onto the
// listener bus (onAuthChange = subscribe, getUser = snapshot), so the bus drives
// re-renders with zero glue and works identically once Supabase is swapped in.

import { useSyncExternalStore } from "react";
import { getUser, onAuthChange, signIn, signOut, signUp } from "./auth.js";

export function useAuth() {
  const user = useSyncExternalStore(onAuthChange, getUser, () => null);
  return { user, isAuthed: Boolean(user), signIn, signUp, signOut };
}
