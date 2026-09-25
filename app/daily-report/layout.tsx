'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/logo';
import { ModuleNav } from '@/components/module-nav';
import { useAuth } from '@/lib/auth-context';
import { canAccess, ROLE_LABELS, defaultRouteFor } from '@/lib/roles';

// Its own layout, a sibling of /repairs and /dashboard, for the same reason
// they are siblings of each other: never nested under the sales dashboard's
// <DataProvider>. Same auth guard as /repairs. See docs/REPAIR_MODULE_SPEC.md §3.3.
export default function DailyReportLayout({ children }: { children: React.ReactNode }) {
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
      <header className="h-16 bg-white border-b border-slate-200 px-4 flex items-center gap-4 shadow-sm">
        {/* Staff live in these two sections, so they need no way out. Everyone
            else arrives from somewhere (the admin console, the sales dashboard)
            and needs a way back to it. */}
        {profile.role !== 'staff' && (
          <Link href={profile.role === 'admin' ? '/admin/users' : '/dashboard'}
            aria-label={profile.role === 'admin' ? 'Back to admin console' : 'Back to dashboard'}
            className="flex items-center gap-1.5 px-2.5 py-2 -ml-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
            <ArrowLeft size={16} /> <span className="hidden sm:inline">{profile.role === 'admin' ? 'Console' : 'Dashboard'}</span>
          </Link>
        )}
        <Logo textClassName="text-base sm:text-xl" />
        <ModuleNav />
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
      <main className="p-4 md:p-8 max-w-[1200px] mx-auto">{children}</main>
    </div>
  );
}
