'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Loader2, LogIn } from 'lucide-react';
import { Logo } from '@/components/logo';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { defaultRouteFor } from '@/lib/roles';

// Real login, replacing the old role picker. The role picker set a value in
// the browser and called that "logged in" — its own comment used to say so
// plainly: "view switching, not security". That was an honest design while
// the app only ever showed the Director his own sales CSV. It stopped being
// honest the moment repair jobs — other people's data, shared across
// branches — needed a login that actually decides who may see what. That
// decision now lives in Supabase (auth.users) and in Postgres Row Level
// Security on the other end; this page only asks for a password and hands
// the answer to that system. See docs/REPAIR_MODULE_SPEC.md §3.
export default function LoginPage() {
  const router = useRouter();
  const { session, profile, loading, signIn, signOut, isPasswordRecovery } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Forgot password?" — until this was added, the only way anyone had ever
  // triggered a password-reset email was directly from the Supabase
  // dashboard, which meant nobody had a real, in-app path for it at all.
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const handleForgotPassword = async () => {
    setForgotError(null);
    if (!email.trim()) {
      setForgotError('Type your email above first, then press "Forgot password?" again.');
      return;
    }
    setForgotBusy(true);
    // redirectTo is set explicitly to wherever THIS page is actually running
    // (window.location.origin), rather than relying on the project's Site
    // URL default — but Supabase only honours it if that exact URL (or a
    // matching wildcard) is on the project's Redirect URLs allow-list; if
    // it isn't, Supabase silently falls back to the Site URL instead. That
    // allow-list can only be changed from the Supabase dashboard — no tool
    // here can set it — so if the email link still doesn't work, check
    // Authentication → URL Configuration there first.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/change-password`,
    });
    setForgotBusy(false);
    // Deliberately shown on success AND on failure alike (aside from a truly
    // empty email, caught above) — confirming whether an email exists would
    // let anyone probe which addresses have accounts.
    if (resetError) setForgotError(resetError.message);
    else setForgotSent(true);
  };

  // Already signed in (e.g. reopened the tab)? Skip the form entirely and go
  // straight to wherever this role belongs. Each role has its own landing
  // page — see lib/roles.ts — rather than one hardcoded destination, because
  // Retail Staff cannot reach /dashboard at all. A forced password change
  // (a brand new or just-reset account) takes priority over that — it is
  // checked BEFORE the normal per-role landing page.
  useEffect(() => {
    if (loading || !session || !profile) return;
    // A password-recovery link takes priority over everything else, even for
    // an account that was already fully set up — "I forgot my password" must
    // always lead here, not to whatever page the role normally lands on.
    if (profile.must_change_password || isPasswordRecovery) {
      router.replace('/change-password');
      return;
    }
    router.replace(defaultRouteFor(profile.role));
  }, [loading, session, profile, isPasswordRecovery, router]);

  // Signed in, but no active profile row matched — an account IT Admin
  // disabled, or one created without a role assigned yet. Say so plainly
  // rather than silently sitting on a blank page.
  const signedInWithoutAccess = !loading && !!session && !profile;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email, password);
    setSubmitting(false);
    if (signInError) {
      // Supabase's own message ("Invalid login credentials") is accurate and
      // safe to show as-is — it does not reveal whether the account exists.
      setError(signInError);
    }
    // On success, the useEffect above fires once the profile has loaded and
    // does the redirect — there is nothing further to do here.
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-[24px] shadow-xl shadow-slate-200/50 border border-slate-100 p-8 md:p-10">
          <div className="text-center mb-8 flex flex-col items-center">
            <Logo className="mb-4" textClassName="text-2xl" />
            <p className="text-slate-500 text-sm font-medium">Sign in to continue</p>
          </div>

          {signedInWithoutAccess ? (
            // Found live, not by reading the code: this branch had no way out
            // — a disabled account (or one with no profile yet) landed here
            // with the session still held, and nothing on screen could clear
            // it. Someone at a shared counter device, signed in as a
            // deactivated account, would have been stuck until they knew to
            // clear browser storage by hand.
            <div className="space-y-4">
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-4">
                Your account is signed in but has no active access assigned.
                Contact IT Admin.
              </p>
              <button onClick={() => signOut()}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors">
                Sign out and try another account
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm"
                  placeholder="you@mptwatches.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-60"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>

              {forgotSent ? (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-center">
                  If an account exists for that email, a reset link is on its way.
                </p>
              ) : (
                <div className="text-center">
                  <button type="button" onClick={handleForgotPassword} disabled={forgotBusy}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline disabled:opacity-60">
                    {forgotBusy ? 'Sending…' : 'Forgot password?'}
                  </button>
                  {forgotError && <p className="text-xs text-red-600 mt-1">{forgotError}</p>}
                </div>
              )}
            </form>
          )}
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs font-medium text-slate-400 tracking-wide">
            Powered by <span className="text-slate-600 font-semibold">Onyxx Tech Hub</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
