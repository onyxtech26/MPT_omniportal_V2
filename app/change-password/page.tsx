'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, KeyRound } from 'lucide-react';
import { Logo } from '@/components/logo';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { defaultRouteFor } from '@/lib/roles';

// Reachable by every role, and NOT gated by canAccess/ROUTE_ACCESS — see
// lib/roles.ts's PASSWORD_CHANGE_ROUTE comment. A new or reset account's
// must_change_password flag forces every guarded layout to redirect here
// before anything else, so this page must always be reachable regardless
// of role.
export default function ChangePasswordPage() {
  const router = useRouter();
  const { session, profile, loading, refreshProfile, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace('/');
  }, [loading, session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }

    setSubmitting(true);
    try {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) throw pwError;

      // Clearing this flag is the ONLY column a non-admin may ever update on
      // their own profile row — enforced by a column-level GRANT, not just
      // convention. See the migration that added must_change_password.
      if (session?.user.id) {
        const { error: flagError } = await supabase
          .from('profiles').update({ must_change_password: false }).eq('id', session.user.id);
        if (flagError) throw flagError;
      }

      // A plain table UPDATE fires no auth event, so the in-memory `profile`
      // this component (and every guarded layout) reads from would still show
      // the OLD must_change_password without this — and the very next layout
      // would see that stale value and bounce straight back here. Found by
      // actually completing this flow, not by reading the code: the database
      // was correct, the redirect target's own guard just didn't know yet.
      await refreshProfile();
      // Same idea for a "forgot password" visit: the flag that got them here
      // was in-memory only (nothing in the database to refresh), so it has
      // to be cleared explicitly or every guard would keep sending them
      // straight back here forever.
      clearPasswordRecovery();

      router.replace(defaultRouteFor(profile?.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-[24px] shadow-xl shadow-slate-200/50 border border-slate-100 p-8 md:p-10">
          <div className="text-center mb-6 flex flex-col items-center">
            <Logo className="mb-4" textClassName="text-2xl" />
            <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-3">
              <KeyRound size={20} />
            </div>
            <p className="text-slate-900 font-bold">Set a new password</p>
            <p className="text-slate-500 text-sm mt-1">
              {isPasswordRecovery
                ? 'You asked to reset your password — choose a new one to continue.'
                : 'This account was just created or reset — choose a password only you know before continuing.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">New password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Confirm password</label>
              <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm" />
            </div>
            {error && <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
            <button type="submit" disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-60">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {submitting ? 'Saving…' : 'Set password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
