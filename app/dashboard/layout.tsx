'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Award,
  Trophy,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Upload,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DataProvider, useData } from './data-context';

// Top-bar navigation. V2 removed Forecast, Seasonal, Ask-the-Data and the Meeting
// Agenda; nav moved from the old left sidebar into the header so every page stays
// one click away. (The Agenda needs a server, so it cannot run on the deployed
// site — the Manager continues to use the desktop build for it.)
const NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Brand Performance', href: '/dashboard/brands', icon: Award },
  { name: 'Leaderboards', href: '/dashboard/leaderboard', icon: Trophy },
];

import { Logo } from '@/components/logo';
import { canAccess, ROLE_LABELS, type Role } from '@/lib/roles';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [user, setUser] = useState<{ username: string; role?: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { systemStatus, loadFromFile } = useData();

  const statusBad = systemStatus?.includes('Error') || systemStatus?.includes('Offline');

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

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/');
      return;
    }
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try { setUser(JSON.parse(storedUser)); } catch {}
    }
  }, []);

  // Redirect if current route is not allowed for this role
  useEffect(() => {
    if (!user) return;
    if (!canAccess(user.role, pathname)) {
      router.replace('/dashboard');
    }
  }, [user, pathname]);

  // Close the mobile nav whenever the route changes (avoids it lingering open).
  useEffect(() => { setIsMobileNavOpen(false); }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    router.push('/');
  };

  const navItems = NAV_ITEMS.filter(item => canAccess(user?.role, item.href));

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

        <Logo className="min-w-0 shrink-0" textClassName="text-base sm:text-xl truncate" />

        {/* Desktop horizontal nav */}
        <nav className="hidden lg:flex items-center gap-1 ml-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-[#0f172a] text-white font-semibold shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                }`}
              >
                <item.icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
          {/* System status pill */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusBad ? 'bg-red-400' : 'bg-emerald-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${statusBad ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
            </span>
            <span className={`text-xs font-medium ${statusBad ? 'text-red-500' : 'text-emerald-600'}`}>
              {systemStatus || 'Operational'}
            </span>
          </div>

          {/* Upload sales data — managers/admins only */}
          {user && user.role !== 'demo' && (
            <div className="flex items-center gap-2">
              {uploadMsg && (
                <span className={`hidden sm:inline text-xs font-medium ${uploadMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
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
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                title="Load sales data (CSV) — stays on this computer"
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-60"
              >
                {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                <span className="hidden md:inline">{isUploading ? 'Loading…' : 'Load Data'}</span>
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
              {user?.username ? user.username.substring(0, 2).toUpperCase() : 'U'}
            </div>
            <div className="hidden md:block text-left mr-1">
              <p className="text-sm font-bold text-slate-900 leading-tight">{user?.username || 'User'}</p>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{ROLE_LABELS[user?.role as Role] ?? 'User'}</p>
            </div>
            <ChevronDown size={16} className="text-slate-400 hidden md:block" />
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
                <div className="px-4 py-3 border-b border-slate-50 md:hidden bg-slate-50/50">
                  <p className="text-sm font-bold text-slate-900">{user?.username || 'User'}</p>
                  <p className="text-xs text-slate-500">{ROLE_LABELS[user?.role as Role] ?? 'User'}</p>
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
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                        isActive
                          ? 'bg-[#0f172a] text-white font-semibold'
                          : 'text-slate-600 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <item.icon size={20} className={isActive ? 'text-white' : 'text-slate-400'} />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2 px-4 py-2">
                <span className={`relative inline-flex rounded-full h-2 w-2 ${statusBad ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                <span className={`text-xs font-medium ${statusBad ? 'text-red-500' : 'text-emerald-600'}`}>
                  {systemStatus || 'Systems Operational'}
                </span>
              </div>
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
