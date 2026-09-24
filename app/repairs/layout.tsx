'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Logo } from '@/components/logo';
import { useAuth } from '@/lib/auth-context';
import { canAccess, ROLE_LABELS, defaultRouteFor } from '@/lib/roles';

// Deliberately its own layout, a sibling of app/dashboard/layout.tsx rather
// than nested under it — this is the whole point of the route arrangement in
// docs/REPAIR_MODULE_SPEC.md §3.3: /repairs must NOT be wrapped in the sales
// dashboard's <DataProvider>, so that adding a server for repair data can
// never come anywhere near the CSV path. Same auth guard, no DataProvider,
// no sales nav.
export default function RepairsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, profile, loading, signOut, isPasswordRecovery } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session || !profile) {
      router.replace('/');
      return;
    }
    if (profile.must_change_password || isPasswordRecovery) {
      router.replace('/change-password');
      return;
    }
    if (!canAccess(profile.role, pathname)) {
      router.replace(defaultRouteFor(profile.role));
    }
  }, [loading, session, profile, isPasswordRecovery, pathname, router]);

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  if (loading || !session || !profile) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* no-print: hidden when printing the customer slip (app/repairs/slip) so
          only the slip itself, not the app chrome, comes out of the printer. */}
      <header className="no-print h-16 bg-white border-b border-slate-200 px-4 flex items-center gap-4 shadow-sm">
        <Logo textClassName="text-base sm:text-xl" />
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-900 leading-tight">{profile.display_name}</p>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
              {ROLE_LABELS[profile.role]}
              {profile.branch_code ? ` · ${profile.branch_code}` : ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>
      <main className="p-4 md:p-8 max-w-[1600px] mx-auto">{children}</main>
    </div>
  );
}
