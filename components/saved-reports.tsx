'use client';

import { useEffect, useRef, useState } from 'react';
import { History, Trash2, Check } from 'lucide-react';
import { useData } from '@/app/dashboard/data-context';

/**
 * Reports remembered on this machine.
 *
 * The app previously kept exactly one CSV, so opening last month's file meant
 * finding it on disk again. This keeps the newest few and lets you switch between
 * them. Everything stays in this browser's IndexedDB — nothing is uploaded, which
 * is the same guarantee the rest of the app makes.
 */
export function SavedReports() {
  const { savedReports, openSavedReport, removeSavedReport, fileName } = useData();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-away close, matching the profile menu in the header.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (savedReports.length === 0) return null;

  const size = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Reports saved on this machine"
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
      >
        <History size={16} />
        <span className="hidden sm:inline">History</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-slate-200 rounded-2xl shadow-lg p-2 z-50">
          <p className="px-2 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
            Saved on this machine
          </p>
          <ul className="max-h-80 overflow-y-auto">
            {savedReports.map((r) => {
              const current = r.fileName === fileName;
              return (
                <li key={r.id} className="flex items-center gap-1.5 group">
                  <button
                    onClick={() => { openSavedReport(r.id); setOpen(false); }}
                    className="flex-1 min-w-0 text-left px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      {current && <Check size={13} className="text-emerald-600 shrink-0" />}
                      <span className="text-xs font-bold text-slate-900 truncate" title={r.fileName}>
                        {r.fileName}
                      </span>
                    </span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">
                      {new Date(r.savedAt).toLocaleString('en-MY')} · {size(r.byteSize)}
                    </span>
                  </button>
                  <button
                    onClick={() => removeSavedReport(r.id)}
                    aria-label={`Forget ${r.fileName}`}
                    className="p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-2 pt-2 pb-1 text-[11px] text-slate-400 border-t border-slate-100 mt-1">
            Stored only in this browser. Never uploaded.
          </p>
        </div>
      )}
    </div>
  );
}
