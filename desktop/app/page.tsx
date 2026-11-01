'use client';

// The website's own Meeting Agenda screen, unchanged — so a fix there ships
// here on the next desktop build.
import MeetingAgenda from '@/app/dashboard/agenda/page';

export default function DesktopAgenda() {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-3">
          <span className="bg-black text-white font-bold text-sm px-2.5 py-1 rounded-md tracking-wide">MPT</span>
          <span className="font-semibold text-slate-900 tracking-tight">OmniPortal</span>
          <span className="ml-auto text-xs font-medium text-slate-400">Offline · nothing leaves this computer</span>
        </div>
      </header>
      <main className="px-6 pt-8">
        <MeetingAgenda />
      </main>
    </div>
  );
}
