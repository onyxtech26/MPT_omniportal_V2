'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Award,
  Trophy,
  Compass,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Upload,
  Loader2,
  Wrench,
  ClipboardList,
  FileSpreadsheet,
  FileCheck2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DataProvider, useData } from './data-context';

// Top-bar navigation. V2 removed Forecast, Seasonal and Ask-the-Data; nav moved
// from the old left sidebar into the header so every page stays one click away.
// The Meeting Agenda came back once it was rebuilt to run in the browser (it
// used to need the desktop build's Python server); only the Manager sees it.
//
// IT Admin no longer reaches this layout at all (see ROUTE_ACCESS) — it has its
// own console under /admin, so there is no Admin item here.
// Grouped so the bar reads as three sections: the sales screens, the
// Manager's monthly agenda, and the branch modules. Labels are kept short so
// the bar stays on one line; each page's own title gives the full name.
const NAV_GROUPS = [
  [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Brands', href: '/dashboard/brands', icon: Award },
    { name: 'Leaderboards', href: '/dashboard/leaderboard', icon: Trophy },
    { name: 'Explorer', href: '/dashboard/explorer', icon: Compass },
  ],
  [
    { name: 'Agenda', href: '/dashboard/agenda', icon: FileSpreadsheet },
  ],
  // Links out to the branch modules. Filtered by canAccess like everything here,
  // so only the Manager sees them — the Director has no access to either.
  [
    { name: 'Repairs', href: '/repairs', icon: Wrench },
    { name: 'Daily Report', href: '/daily-report', icon: ClipboardList },
  ],
];

import { Logo } from '@/components/logo';
import { PeriodFilter } from '@/components/period-filter';
import { SavedReports } from '@/components/saved-reports';
import { canAccess, ROLE_LABELS, defaultRouteFor } from '@/lib/roles';
import { useAuth } from '@/lib/auth-context';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { session, profile, loading: authLoading, signOut, isPasswordRecovery } = useAuth();
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

  // Close the mobile nav whenever the route changes (avoids it lingering open).
  useEffect(() => { setIsMobileNavOpen(false); }, [pathname]);

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  const navGroups = NAV_GROUPS
    .map((group) => group.filter((item) => canAccess(profile?.role, item.href)))
    .filter((group) => group.length > 0);
  const isActive = (href: string) =>
    pathname === href || pathname === `${href}/`;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50 px-4 flex items-center gap-4 shadow-sm">
        {/* Mobile menu toggle */}
        <button
          onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          className="p-2 hover:bg-slate-100 rounded-lg lg:hidden text-slate-600 shrink-0"
          aria-label="Toggle navigation"
        >
          {isMobileNavOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* The wordmark steps aside on mid-size screens so the nav labels fit on one line. */}
        <Logo className="min-w-0 shrink-0" textClassName="text-base sm:text-xl truncate lg:max-[1439px]:hidden" />

        {/* Desktop horizontal nav: icons only until there is room for labels. */}
        <nav className="hidden lg:flex items-center gap-0.5 ml-2 xl:ml-4 min-w-0">
          {navGroups.map((group, gi) => (
            <div key={gi} className="flex items-center gap-0.5">
              {gi > 0 && <span aria-hidden className="w-px h-6 bg-slate-200 mx-1.5" />}
              {group.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    title={item.name}
                    className={`flex items-center gap-2 px-3 xl:max-[1439px]:px-2.5 py-2 rounded-xl text-sm whitespace-nowrap transition-all duration-200 ${
                      active
                        ? 'bg-[#0f172a] text-white font-semibold shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <item.icon size={18} className={`shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                    <span className="hidden xl:inline">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
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
              passed canAccess (boss/manager/admin only — see ROUTE_ACCESS),
              so no further check is needed here. (This replaces a check
              against a 'demo' role that no longer exists and never actually
              restricted anyone.) */}
          {profile && (
            <div className="flex items-center gap-2">
              {uploadMsg && (
                <span className={`hidden 2xl:inline text-xs font-medium whitespace-nowrap ${uploadMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
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

          {/* User Profile Dropdown */}
          <div className="relative">
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-3 p-1.5 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100"
          >
            <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-medium text-sm shadow-sm">
              {profile?.display_name ? profile.display_name.substring(0, 2).toUpperCase() : 'U'}
            </div>
            <div className="hidden md:block lg:hidden 2xl:block text-left mr-1">
              <p className="text-sm font-bold text-slate-900 leading-tight">{profile?.display_name || 'User'}</p>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{profile ? ROLE_LABELS[profile.role] : 'User'}</p>
            </div>
            <ChevronDown size={16} className="text-slate-400 hidden md:block lg:hidden 2xl:block" />
          </button>

          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-slate-50 md:hidden lg:block 2xl:hidden bg-slate-50/50">
                  <p className="text-sm font-bold text-slate-900">{profile?.display_name || 'User'}</p>
                  <p className="text-xs text-slate-500">{profile ? ROLE_LABELS[profile.role] : 'User'}</p>
                </div>

                <div className="p-1">
                  <button
                    onClick={handleLogout}
                    className="w-full px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2.5 transition-colors font-medium"
                  >
                    <LogOut size={16} />
                    Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Mobile nav dropdown */}
      <AnimatePresence>
        {isMobileNavOpen && (
          <>
            <motion.nav
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="fixed top-16 left-0 right-0 z-40 bg-white border-b border-slate-200 shadow-lg p-3 lg:hidden"
            >
              <div className="space-y-1">
                {navGroups.map((group, gi) => (
                  <div key={gi} className={gi > 0 ? 'pt-1 mt-1 border-t border-slate-100' : ''}>
                    {group.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                            active
                              ? 'bg-[#0f172a] text-white font-semibold'
                              : 'text-slate-600 hover:bg-slate-100 font-medium'
                          }`}
                        >
                          <item.icon size={20} className={active ? 'text-white' : 'text-slate-400'} />
                          <span>{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className={`mt-2 pt-3 border-t border-slate-100 px-4 pb-1 text-xs font-medium truncate ${statusBad ? 'text-red-600' : 'text-slate-500'}`}>
                {statusBad ? 'Stored data could not be read' : hasData && fileName ? `Report: ${fileName}` : 'No sales report loaded yet'}
              </p>
            </motion.nav>
            <div
              className="fixed inset-0 top-16 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden"
              onClick={() => setIsMobileNavOpen(false)}
            />
          </>
        )}
      </AnimatePresence>

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
