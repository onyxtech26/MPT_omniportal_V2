'use client';

import { useState } from 'react';
import { CalendarRange, X } from 'lucide-react';
import { useData } from '@/app/dashboard/data-context';

/**
 * Period picker for the loaded report.
 *
 * Lives in the dashboard layout so one choice applies to every page — the
 * overview, Brand Performance and the Leaderboards all read the same window
 * from the data context, so the figures can never disagree between screens.
 *
 * Month shortcuts are built from the months actually present in the file rather
 * than a generic calendar, so you cannot pick a period the report has no data for.
 */
export function PeriodFilter() {
  const { availableMonths, dateFrom, dateTo, setDateRange, hasData } = useData();
  const [open, setOpen] = useState(false);

  if (!hasData || availableMonths.length === 0) return null;

  const monthLabel = (m: string) =>
    new Date(`${m}-01`).toLocaleString('default', { month: 'short', year: '2-digit' });

  /** Whole calendar month, e.g. 2025-03 → 2025-03-01 … 2025-03-31. */
  const pickMonth = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    const lastDay = new Date(y, mo, 0).getDate();   // day 0 of next month = last of this
    setDateRange(`${m}-01`, `${m}-${String(lastDay).padStart(2, '0')}`);
  };

  const activeMonth =
    dateFrom && dateTo && dateFrom.slice(0, 7) === dateTo.slice(0, 7) && dateFrom.endsWith('-01')
      ? dateFrom.slice(0, 7)
      : null;

  const summary = !dateFrom && !dateTo
    ? 'All data'
    : activeMonth
      ? new Date(`${activeMonth}-01`).toLocaleString('default', { month: 'long', year: 'numeric' })
      : `${dateFrom || 'start'} → ${dateTo || 'end'}`;

  const filtered = Boolean(dateFrom || dateTo);

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
            filtered ? 'bg-[#0f172a] text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CalendarRange size={16} />
          <span>Period: {summary}</span>
        </button>

        {filtered && (
          <button
            onClick={() => setDateRange(null, null)}
            className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
          >
            <X size={14} /> Clear
          </button>
        )}

        {open && (
          <div className="w-full flex flex-wrap items-center gap-x-4 gap-y-3 pt-3 mt-1 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide mr-1">Month</span>
              <button
                onClick={() => setDateRange(null, null)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                  !filtered ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >All</button>
              {availableMonths.map((m) => (
                <button
                  key={m}
                  onClick={() => pickMonth(m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                    activeMonth === m ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >{monthLabel(m)}</button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Range</span>
              <input
                type="date"
                value={dateFrom ?? ''}
                onChange={(e) => setDateRange(e.target.value || null, dateTo)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20 cursor-pointer"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={dateTo ?? ''}
                onChange={(e) => setDateRange(dateFrom, e.target.value || null)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
