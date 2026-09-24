'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Users, Building2, ScrollText } from 'lucide-react';
import { Logo } from '@/components/logo';
import { useAuth } from '@/lib/auth-context';
import { canAccess, defaultRouteFor } from '@/lib/roles';

const NAV = [
  { name: 'Accounts', href: '/admin/users', icon: Users },
  { name: 'Branches', href: '/admin/branches', icon: Building2 },
  { name: 'Audit Log', href: '/admin/audit', icon: ScrollText },
];

// Its own layout, sibling of /dashboard and /repairs, for the same reason
// those two are siblings of each other: never nested inside a layout whose
// guard rules don't apply to it. Admin-only, per the owner's decision that
// IT Admin administers accounts rather than the other way round.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, profile, loading, signOut, isPasswordRecovery } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session || !profile) { router.replace('/'); return; }
    if (profile.must_change_password || isPasswordRecovery) { router.replace('/change-password'); return; }
    if (!canAccess(profile.role, pathname)) { router.replace(defaultRouteFor(profile.role)); }
  }, [loading, session, profile, isPasswordRecovery, pathname, router]);

  const handleLogout = async () => { await signOut(); router.push('/'); };

  if (loading || !session || !profile) return <div className="min-h-screen bg-slate-50" />;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="h-16 bg-white border-b border-slate-200 px-4 flex items-center gap-4 shadow-sm">
        <Logo textClassName="text-base sm:text-xl" />
        <nav className="hidden sm:flex items-center gap-1 ml-6">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname === item.href + '/';
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-colors ${active ? 'bg-slate-900 text-white font-semibold' : 'text-slate-600 hover:bg-slate-100 font-medium'}`}>
                <item.icon size={16} /> {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide hidden sm:block">IT Admin Console</p>
          <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
            <LogOut size={16} /> <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>
      {/* Mobile nav — same links, stacked */}
      <nav className="sm:hidden flex items-center gap-1 px-4 py-2 bg-white border-b border-slate-100 overflow-x-auto">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 whitespace-nowrap">
            <item.icon size={14} /> {item.name}
          </Link>
        ))}
      </nav>
      <main className="p-4 md:p-8 max-w-[1200px] mx-auto">{children}</main>
    </div>
  );
}
