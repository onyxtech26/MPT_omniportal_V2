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
  const { savedReports, openSavedReport, removeSavedReport, fileName, hasData, clearData } = useData();
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

  // Shown whenever anything is stored, not just when the history has entries:
  // the current file can exist on its own (e.g. a history write that hit the
  // storage quota), and "Remove all" must stay reachable then too.
  if (savedReports.length === 0 && !hasData) return null;

  const handleRemoveAll = async () => {
    if (!window.confirm('Remove all sales data from this computer? Every saved report goes too. This cannot be undone.')) return;
    await clearData();
    setOpen(false);
  };

  const size = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Reports saved on this computer"
        aria-label="Saved reports"
        className="flex items-center justify-center w-9 h-9 max-sm:w-10 max-sm:h-10 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <History size={16} />
      </button>

      {/* On phones the button sits left of the avatar, so a right-aligned
          320px panel would run off the left edge; pin it under the header
          across the screen instead. */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] max-sm:fixed max-sm:top-16 max-sm:left-4 max-sm:right-4 max-sm:w-auto max-sm:max-w-none bg-white border border-slate-200 rounded-2xl shadow-lg p-2 z-50">
          <p className="px-2 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
            Saved on this machine
          </p>
          <ul className="max-h-80 max-sm:max-h-[60dvh] overflow-y-auto">
            {savedReports.map((r) => {
              const current = r.fileName === fileName;
              return (
                <li key={r.id} className="flex items-center gap-1.5 group">
                  <button
                    onClick={() => { openSavedReport(r.id); setOpen(false); }}
                    className="flex-1 min-w-0 text-left px-2 py-2 max-sm:py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      {current && <Check size={13} className="text-emerald-600 shrink-0" />}
                      <span className="text-xs font-bold text-slate-900 truncate min-w-0" title={r.fileName}>
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
                    className="p-2 max-sm:p-3 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            onClick={handleRemoveAll}
            className="mt-1 w-full flex items-center justify-center gap-1.5 min-h-10 max-sm:min-h-11 px-2 rounded-lg border-t border-slate-100 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <Trash2 size={14} /> Remove all sales data from this computer
          </button>
          <p className="px-2 pt-2 pb-1 text-[11px] text-slate-400 border-t border-slate-100 mt-1">
            Stored only in this browser. Never uploaded. Signing out removes it too.
          </p>
        </div>
      )}
    </div>
  );
}
