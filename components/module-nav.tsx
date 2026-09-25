'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wrench, ClipboardList } from 'lucide-react';

// The two day-to-day sections a branch works in. Shared by the /repairs and
// /daily-report layouts, which are deliberately separate layouts (neither is
// wrapped in the sales dashboard's DataProvider) — this small component is what
// lets a staff member move between them without either layout importing the other.
const SECTIONS = [
  { name: 'Repairs', href: '/repairs', icon: Wrench },
  { name: 'Daily Report', href: '/daily-report', icon: ClipboardList },
];

export function ModuleNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 ml-2 sm:ml-6">
      {SECTIONS.map((s) => {
        const active = pathname === s.href || pathname.startsWith(s.href + '/');
        return (
          <Link key={s.href} href={s.href}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl text-sm transition-colors ${active ? 'bg-slate-900 text-white font-semibold' : 'text-slate-600 hover:bg-slate-100 font-medium'}`}>
            <s.icon size={16} /> <span className="hidden sm:inline">{s.name}</span>
            <span className="sm:hidden text-xs">{s.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
