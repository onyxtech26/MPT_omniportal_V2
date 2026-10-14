'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { useAuth } from '@/lib/auth-context';
import { canAccess, defaultRouteFor } from '@/lib/roles';

// Its own layout, a sibling of /repairs and /dashboard, for the same reason
// they are siblings of each other: never nested under the sales dashboard's
// <DataProvider>. Same auth guard as /repairs. See docs/REPAIR_MODULE_SPEC.md §3.3.
export default function DailyReportLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, profile, loading, isPasswordRecovery } = useAuth();

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

  if (loading || !session || !profile) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <AppHeader />
      <main className="pt-16 print:pt-0">
        <div className="p-4 md:p-8 max-w-[1200px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
