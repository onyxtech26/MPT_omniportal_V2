'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Upload, Loader2, FileCheck2, AlertCircle } from 'lucide-react';
import { DataProvider, useData } from './data-context';
import { AppHeader } from '@/components/app-header';
import { PeriodFilter } from '@/components/period-filter';
import { SavedReports } from '@/components/saved-reports';
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { systemStatus, loadFromFile, hasData, fileName } = useData();

  // Only a real problem is worth a word in the header. "No data loaded" used
  // to sit there as a green status pill; the Load Data button says the same
  // thing, and says what to do about it.
  const statusBad = Boolean(systemStatus?.includes('Error') || systemStatus?.includes('Offline'));

  const handleUploadData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploading(true);
    setUploadMsg(null);
    try {
      // Parsed in the browser — the file never leaves this machine.
      await loadFromFile(file);
      setUploadMsg({ ok: true, text: 'Data loaded.' });
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Could not read file.';
      setUploadMsg({ ok: false, text });
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadMsg(null), 5000);
    }
  };

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
            {profile && (
              <div className="flex items-center gap-2">
                {uploadMsg && (
                  <span className={`hidden min-[1700px]:inline text-xs font-medium whitespace-nowrap ${uploadMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                    {uploadMsg.text}
                  </span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleUploadData}
                  className="hidden"
                />
                {/* Dark "Load Data" until a report is in; then a quiet button
                    naming the loaded file, which still swaps it for another. */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  title={hasData && fileName
                    ? `Loaded: ${fileName}. Click to load a different report (stays on this computer).`
                    : 'Load sales data (CSV) — stays on this computer'}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-60 ${
                    hasData
                      ? 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                      : 'bg-slate-900 text-white hover:bg-slate-700'
                  }`}
                >
                  {isUploading
                    ? <Loader2 size={16} className="animate-spin" />
                    : hasData ? <FileCheck2 size={16} className="text-emerald-600" /> : <Upload size={16} />}
                  <span className="hidden md:inline lg:hidden xl:inline">
                    {isUploading ? 'Loading…' : hasData ? 'Change Data' : 'Load Data'}
                  </span>
                </button>
              </div>
            )}
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
        <PeriodFilter />
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
