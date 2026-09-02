'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Eye, ClipboardList, Settings, ChevronRight } from 'lucide-react';
import { Logo } from '@/components/logo';
import type { Role } from '@/lib/roles';

// V2 is server-less: there is no password to check and no backend to call. "Roles"
// are just which view you land on, chosen here and remembered in the browser. This
// is view-switching, not security — anyone at this machine can pick any role.
const ROLE_OPTIONS: { role: Role; label: string; blurb: string; icon: typeof Eye }[] = [
  { role: 'boss',    label: 'Director',  blurb: 'Company-wide sales overview across all outlets', icon: Eye },
  { role: 'manager', label: 'Manager',   blurb: 'Meeting agenda plus the full sales dashboard',   icon: ClipboardList },
  { role: 'admin',   label: 'IT Admin',  blurb: 'Everything, for setup and maintenance',          icon: Settings },
];

export default function RolePicker() {
  const router = useRouter();

  const pick = (role: Role, label: string) => {
    // A sentinel token keeps the dashboard's "has someone entered?" guards working;
    // it authenticates nothing.
    localStorage.setItem('token', 'local');
    localStorage.setItem('user', JSON.stringify({ username: label, role }));
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-[24px] shadow-xl shadow-slate-200/50 border border-slate-100 p-8 md:p-10">
          <div className="text-center mb-8 flex flex-col items-center">
            <Logo className="mb-4" textClassName="text-2xl" />
            <p className="text-slate-500 text-sm font-medium">Choose your role to continue</p>
          </div>

          <div className="space-y-3">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.role}
                onClick={() => pick(opt.role, opt.label)}
                className="w-full flex items-center gap-4 p-4 rounded-[20px] border border-slate-200 hover:border-[#0f172a] hover:bg-slate-50 transition-all text-left group active:scale-[0.99]"
              >
                <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                  <opt.icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{opt.label}</p>
                  <p className="text-xs text-slate-500 font-medium truncate">{opt.blurb}</p>
                </div>
                <ChevronRight size={18} className="text-slate-300 group-hover:text-[#0f172a] transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs font-medium text-slate-400 tracking-wide">
            Powered by <span className="text-slate-600 font-semibold">Onyxx Tech Hub</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
