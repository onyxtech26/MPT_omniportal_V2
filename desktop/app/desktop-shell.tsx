'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Award, Trophy, Compass, GitCompareArrows, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { DataProvider, useData } from '@/app/dashboard/data-context';
import { Logo } from '@/components/logo';
import { PeriodFilter } from '@/components/period-filter';
import { SavedReports } from '@/components/saved-reports';
import { LoadDataButton } from '@/components/load-data-button';

// The offline app's top bar: the website's sales screens and the agenda, with
// no profile menu or sign-out because this app has no login. Styled like the
// website's AppHeader (components/app-header.tsx), which cannot be reused here
// because it is built around the signed-in profile.
const NAV_GROUPS = [
  [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Brands', href: '/brands', icon: Award },
    { name: 'Leaderboards', href: '/leaderboard', icon: Trophy },
    { name: 'Explorer', href: '/explorer', icon: Compass },
    { name: 'Compare', href: '/compare', icon: GitCompareArrows },
  ],
  [
    { name: 'Agenda', href: '/agenda', icon: FileSpreadsheet },
  ],
];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { systemStatus } = useData();
  const statusBad = Boolean(systemStatus?.includes('Error') || systemStatus?.includes('Offline'));
  const isActive = (href: string) => {
    const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
    return href === '/' ? path === '/' : path === href;
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50 px-4 flex items-center gap-4 shadow-sm">
        <Logo className="min-w-0 shrink-0" textClassName="text-xl truncate max-[1279px]:hidden" />

        {/* Icons only until there is room for labels, as on the website. */}
        <nav className="flex items-center gap-0.5 ml-2 xl:ml-4 min-w-0">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="flex items-center gap-0.5">
              {gi > 0 && <span aria-hidden className="w-px h-6 bg-slate-200 mx-1.5" />}
              {group.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    title={item.name}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm whitespace-nowrap transition-all duration-200 ${
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

        <div className="flex items-center gap-3 shrink-0 ml-auto pl-3">
          {statusBad && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 whitespace-nowrap">
              <AlertCircle size={14} />
              Data could not be read
            </span>
          )}
          <SavedReports signOutClears={false} />
          <LoadDataButton />
        </div>
      </header>

      <main className="pt-16 min-h-screen">
        {/* One period choice, shared by every screen, as on the website. */}
        <PeriodFilter />
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export function DesktopShell({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <Shell>{children}</Shell>
    </DataProvider>
  );
}
