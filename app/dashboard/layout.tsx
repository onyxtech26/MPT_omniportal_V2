'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { DataProvider, useData } from './data-context';
import { AppHeader } from '@/components/app-header';
import { PeriodFilter } from '@/components/period-filter';
import { SavedReports } from '@/components/saved-reports';
import { LoadDataButton } from '@/components/load-data-button';
import { canAccess, defaultRouteFor } from '@/lib/roles';
import { useAuth } from '@/lib/auth-context';

// The top bar itself (navigation, profile menu) is the shared AppHeader, also
// used by Repairs and Daily Report. What stays here is what only the sales
// dashboard has: loading a sales report and the report history.
//
// IT Admin never reaches this layout (see ROUTE_ACCESS) — it has its own
// console under /admin.

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { session, profile, loading: authLoading, isPasswordRecovery } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { systemStatus, hasData, fileName } = useData();

  // Only a real problem is worth a word in the header. "No data loaded" used
  // to sit there as a green status pill; the Load Data button says the same
  // thing, and says what to do about it.
  const statusBad = Boolean(systemStatus?.includes('Error') || systemStatus?.includes('Offline'));

  // Wait for the very first "is anyone signed in" check before deciding
  // anything — on load, "no session yet" and "signed out" look identical for
  // a moment, and redirecting on that first false read would bounce a
  // perfectly signed-in Director back to the login page.
  useEffect(() => {
    if (authLoading) return;
    if (!session || !profile) {
      router.replace('/');
      return;
    }
    // A new or reset account (or one that clicked "forgot password") must
    // set its own password before it can do anything else — checked before
    // the normal per-role access check.
    if (profile.must_change_password || isPasswordRecovery) {
      router.replace('/change-password');
      return;
    }
    // Signed in, but this role cannot reach this particular page (e.g. a
    // stale bookmark, or a role that changed). Send them to somewhere they
    // CAN reach rather than looping on the page that just rejected them.
    if (!canAccess(profile.role, pathname)) {
      router.replace(defaultRouteFor(profile.role));
    }
  }, [authLoading, session, profile, isPasswordRecovery, pathname, router]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <AppHeader
        actions={
          <>
            {/* Shown only when stored data could not be read. */}
            {statusBad && (
              <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-red-600 whitespace-nowrap">
                <AlertCircle size={14} />
                Data could not be read
              </span>
            )}

            {/* Reports already remembered on this machine */}
            <SavedReports />

            {/* Upload sales data. Every role that reaches this layout already
                passed canAccess (boss/manager only, see ROUTE_ACCESS), so no
                further check is needed here. */}
            {profile && <LoadDataButton />}
          </>
        }
        mobileNote={
          <p className={`mt-2 pt-3 border-t border-slate-100 px-4 pb-1 text-xs font-medium truncate ${statusBad ? 'text-red-600' : 'text-slate-500'}`}>
            {statusBad ? 'Stored data could not be read' : hasData && fileName ? `Report: ${fileName}` : 'No sales report loaded yet'}
          </p>
        }
      />

      {/* Main Content */}
      <main className="pt-16 min-h-screen">
        {/* One period choice, shared by every page via the data context. */}
        {/* Compare takes its own two reports, so the loaded report's period does not apply. */}
        {!pathname.startsWith('/dashboard/compare') && <PeriodFilter />}
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <DashboardContent>{children}</DashboardContent>
    </DataProvider>
  );
}
