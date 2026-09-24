'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Role } from './roles';

// The row from public.profiles for whoever is signed in. Supabase's own
// session tells us WHO (an email, a user id); it says nothing about role or
// branch — that lives in our own table, one query away.
export type Profile = {
  id: string;
  role: Role;
  branch_code: string | null;
  display_name: string;
  is_active: boolean;
  must_change_password: boolean;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  // True until the very first check of "is anyone signed in" finishes. Every
  // guard below must wait for this instead of assuming "no session yet" means
  // "signed out" — on first load those look identical for a moment while
  // Supabase reads the session out of storage.
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  // Re-fetches the profile row for the current session. Needed whenever code
  // writes to `profiles` directly (not through a Supabase Auth call) and then
  // immediately relies on the NEW value — a plain database UPDATE fires no
  // auth event, so the context has no other way to learn about it. Found by
  // the change-password flow bouncing straight back to itself: the write
  // succeeded, but the in-memory `profile` object still held the old
  // must_change_password until something explicitly asked for a fresh copy.
  refreshProfile: () => Promise<void>;
  // True the moment a password-recovery link lands, whatever page it lands
  // on — Supabase fires PASSWORD_RECOVERY as its own distinct event, separate
  // from an ordinary sign-in, and it was going completely unhandled: every
  // guard treated it as "someone signed in normally" and sent them straight
  // to their usual page instead of asking for a new password. An existing,
  // already-active account (must_change_password already false) had no path
  // to actually complete "I forgot my password" at all.
  isPasswordRecovery: boolean;
  // Called once the new password has actually been set, so the app stops
  // insisting on it afterward.
  clearPasswordRecovery: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  // Look up the profile for whichever session we currently hold. RLS already
  // guarantees this can only ever return the caller's own row (see
  // profiles_read_self in the repair-module migrations) — we are not trusting
  // the client here, the database would refuse a different row regardless.
  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, branch_code, display_name, is_active, must_change_password')
      .eq('id', activeSession.user.id)
      .maybeSingle();

    // A session can exist with no matching profile (an auth account created
    // without one, or one deactivated by IT Admin). Treat that as signed out
    // rather than half-signed-in with an undefined role.
    if (error || !data || !data.is_active) {
      setProfile(null);
      return;
    }
    setProfile(data as Profile);
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data: { session: initial } }) => {
      if (cancelled) return;
      setSession(initial);
      await loadProfile(initial);
      if (!cancelled) setLoading(false);
    });

    // Fires on sign-in, sign-out, and token refresh — keeps the profile in
    // sync with the session for the whole life of the tab, not just on load.
    // PASSWORD_RECOVERY is its own event, distinct from a normal sign-in —
    // Supabase's client detects the recovery link's token in the URL on
    // whichever page it lands on and fires this automatically. Recorded here,
    // once, centrally, so every guarded layout can act on it the same way
    // rather than each needing its own copy of this check.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      loadProfile(next);
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session);
  }, [loadProfile, session]);

  const clearPasswordRecovery = useCallback(() => setIsPasswordRecovery(false), []);

  return (
    <AuthContext.Provider value={{
      session, profile, loading, signIn, signOut, refreshProfile,
      isPasswordRecovery, clearPasswordRecovery,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
