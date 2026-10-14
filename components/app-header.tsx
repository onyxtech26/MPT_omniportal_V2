'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Award, Trophy, Compass, FileSpreadsheet, Wrench, ClipboardList,
  LogOut, Menu, X, ChevronDown, ArrowLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Logo } from '@/components/logo';
import { useAuth } from '@/lib/auth-context';
import { canAccess, ROLE_LABELS } from '@/lib/roles';

// The one top bar every signed-in screen shares: the sales dashboard, Repairs
// and Daily Report. Each of those keeps its own layout (Repairs and Daily
// Report are deliberately NOT wrapped in the sales dashboard's DataProvider, so
// repair data can never come near the sales CSV; see docs/REPAIR_MODULE_SPEC.md
// §3.3), but they all draw this same header so moving between them feels like
// one app. Anything that needs the sales data (Load Data, History) is passed in
// by the dashboard layout through `actions`, so this file never touches it.
//
// Grouped so the bar reads as three sections: the sales screens, the Manager's
// monthly agenda, and the branch modules. Labels are short so the bar stays on
// one line. Filtered by canAccess, so each role sees only what it can open:
// the Director no Repairs or Daily Report, staff only those two, the Manager
// everything, IT Admin only those two plus a way back to its console.
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
  [
    { name: 'Repairs', href: '/repairs', icon: Wrench },
    { name: 'Daily Report', href: '/daily-report', icon: ClipboardList },
  ],
];

interface AppHeaderProps {
  /** Extra controls shown before the profile menu (the dashboard's Load Data, History). */
  actions?: React.ReactNode;
  /** One quiet line at the foot of the mobile menu (the dashboard's report status). */
  mobileNote?: React.ReactNode;
}

export function AppHeader({ actions, mobileNote }: AppHeaderProps) {
  // The mobile menu is open for one specific path, so it closes by itself the
  // moment the route changes, without an effect to reset it.
  const [mobileNavPath, setMobileNavPath] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isMobileNavOpen = mobileNavPath === pathname;
  const setIsMobileNavOpen = (open: boolean) => setMobileNavPath(open ? pathname : null);

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  const navGroups = NAV_GROUPS
    .map((group) => group.filter((item) => canAccess(profile?.role, item.href)))
    .filter((group) => group.length > 0);
  // Nested pages (e.g. /repairs/new) keep their section lit. /dashboard is the
  // exception: it is the parent of the other sales screens, so only an exact match.
  const isActive = (href: string) => {
    const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
    return path === href || (href !== '/dashboard' && path.startsWith(`${href}/`));
  };
  const roleLine = profile
    ? `${ROLE_LABELS[profile.role]}${profile.branch_code ? ` · ${profile.branch_code}` : ''}`
    : 'User';

  return (
    <>
      {/* no-print: keeps the app's chrome off the printed repair slip. */}
      <header className="no-print fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50 px-4 flex items-center gap-4 shadow-sm">
        <button
          onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          className="p-2 hover:bg-slate-100 rounded-lg lg:hidden text-slate-600 shrink-0"
          aria-label="Toggle navigation"
        >
          {isMobileNavOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* The wordmark steps aside on mid-size screens so the nav labels fit on one line. */}
        <Logo className="min-w-0 shrink-0" textClassName="text-base sm:text-xl truncate lg:max-[1439px]:hidden" />

        {/* IT Admin has no sales screens; it arrives from its own console. */}
        {profile?.role === 'admin' && (
          <Link
            href="/admin/users"
            aria-label="Back to admin console"
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
          >
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Console</span>
          </Link>
        )}

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

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto pl-3">
          {actions}
          {actions && <span aria-hidden className="hidden sm:block w-px h-6 bg-slate-200" />}

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
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{roleLine}</p>
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
                    <p className="text-xs text-slate-500">{roleLine}</p>
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

      <AnimatePresence>
        {isMobileNavOpen && (
          <>
            <motion.nav
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="no-print fixed top-16 left-0 right-0 z-40 bg-white border-b border-slate-200 shadow-lg p-3 lg:hidden"
            >
              <div className="space-y-1">
                {profile?.role === 'admin' && (
                  <Link href="/admin/users" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">
                    <ArrowLeft size={20} className="text-slate-400" />
                    <span>Admin console</span>
                  </Link>
                )}
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
              {mobileNote}
            </motion.nav>
            <div
              className="no-print fixed inset-0 top-16 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden"
              onClick={() => setIsMobileNavOpen(false)}
            />
          </>
        )}
      </AnimatePresence>
    </>
  );
}
