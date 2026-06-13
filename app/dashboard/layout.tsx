'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileSpreadsheet,
  TrendingUp,
  Award,
  LogOut,
  Menu,
  X,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DataProvider, useData } from './data-context';

const SIDEBAR_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Meeting Agenda', href: '/dashboard/agenda', icon: FileSpreadsheet },
  { name: 'Demand Forecast', href: '/dashboard/forecast', icon: TrendingUp },
  { name: 'Brand Performance', href: '/dashboard/brands', icon: Award },
];

import { Logo } from '@/components/logo';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [user, setUser] = useState<{ username: string; role?: string } | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { systemStatus } = useData();

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

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50 px-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-slate-100 rounded-lg lg:hidden text-slate-600"
          >
            <Menu size={24} />
          </button>
          
          <Logo textClassName="text-xl" />
        </div>

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
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Administrator</p>
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
                  <p className="text-xs text-slate-500">Administrator</p>
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
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed top-16 left-0 bottom-0 z-40 w-64 bg-[#0f172a] text-white transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex-1 flex flex-col p-4 overflow-y-auto">
          <div className="flex items-center justify-end mb-1 mt-1 lg:hidden">
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <p className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 mt-4">Main Menu</p>
          <div className="space-y-1">
            {SIDEBAR_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-white text-[#0f172a] font-bold shadow-md'
                      : 'text-slate-400 hover:bg-white/10 hover:text-white font-medium'
                  }`}
                >
                  <item.icon size={20} className={isActive ? 'text-[#0f172a]' : 'text-slate-400 group-hover:text-white'} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-auto pt-8 px-4">
            {/* Sidebar Footer Actions could go here */}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-[#0f172a] shrink-0">
          <div className="px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-bold">System Status</p>
            <div className="flex items-center gap-2">
              <div className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${systemStatus?.includes('Error') || systemStatus?.includes('Offline') ? 'bg-red-400' : 'bg-emerald-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${systemStatus?.includes('Error') || systemStatus?.includes('Offline') ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
              </div>
              <span className={`text-xs font-medium ${systemStatus?.includes('Error') || systemStatus?.includes('Offline') ? 'text-red-400' : 'text-emerald-400'}`}>
                {systemStatus || 'Systems Operational'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Demo Mode Banner */}
      {user?.role === 'demo' && (
        <div className="fixed top-16 left-0 right-0 z-40 bg-orange-500 text-white text-center text-xs font-bold py-1.5 tracking-wide uppercase">
          Demo Mode — Data shown is for demonstration purposes only
        </div>
      )}

      {/* Main Content */}
      <main className={`${user?.role === 'demo' ? 'pt-24' : 'pt-16'} lg:pl-64 min-h-screen transition-all duration-300`}>
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
