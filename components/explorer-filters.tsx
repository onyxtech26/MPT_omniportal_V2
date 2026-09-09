'use client';

import { FilterChipGroup } from './filter-chip-group';
import {
  DIMENSION_LABELS, customerLabel,
  type Dimension, type Selection, type RowFilters,
} from '@/lib/salesData';

/**
 * The Explorer's filter sidebar.
 *
 * Order matters: the dimensions people reach for first (where, who, what) sit at
 * the top, and Model — 4,500 values and search-only in practice — sits last.
 * The Director's tool lets you drag these panels around; that exists because his
 * layout grew by patching, and reordering is not something anyone asked for.
 */

// Widest to narrowest question: which shop, which category, who sold it, what was it.
const GROUP_ORDER: Dimension[] = [
  'outlet', 'category', 'salesman', 'brand', 'vendor', 'customer', 'model',
];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface ExplorerFiltersProps {
  facets: Record<Dimension, string[]>;
  selected: Selection;
  filters: RowFilters;
  /** Years present in the loaded report, newest first. */
  years: string[];
  onToggle: (dim: Dimension, value: string) => void;
  onClearDimension: (dim: Dimension) => void;
  onToggleYear: (year: string) => void;
  onToggleMonth: (monthIndex: string) => void;
  onDateRange: (from: string | null, to: string | null) => void;
  onClearAll: () => void;
  activeCount: number;
}

export function ExplorerFilters({
  facets, selected, filters, years,
  onToggle, onClearDimension, onToggleYear, onToggleMonth, onDateRange, onClearAll,
  activeCount,
}: ExplorerFiltersProps) {
  const selectedYears = filters.years ?? [];
  const selectedMonths = filters.months ?? [];
  const rangeActive = Boolean(filters.dateFrom || filters.dateTo);

  const chipClass = (on: boolean, dimmed = false) =>
    `px-2.5 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
      on ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }${dimmed ? ' opacity-40' : ''}`;

  return (
    <aside className="w-full lg:w-72 lg:shrink-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">Filters</h2>
        {activeCount > 0 && (
          <button
            onClick={onClearAll}
            className="text-xs font-bold text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
          >
            Clear all ({activeCount})
          </button>
        )}
      </div>

      {/* Dates. Year and month chips are the everyday control; an explicit range
          overrides them, which is how the Director's tool behaves — worth saying
          on screen, because it is the one date rule that surprises people. */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Period</h3>

        {years.length > 1 && (
          <>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Year</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {years.map((y) => (
                <button key={y} onClick={() => onToggleYear(y)}
                  className={chipClass(selectedYears.includes(y), rangeActive)}>{y}</button>
              ))}
            </div>
          </>
        )}

        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Month</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {MONTH_NAMES.map((m, i) => (
            <button key={m} onClick={() => onToggleMonth(String(i))}
              className={chipClass(selectedMonths.includes(String(i)), rangeActive)}>{m}</button>
          ))}
        </div>

        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">
          Exact range {rangeActive && <span className="text-amber-600">— overrides year/month</span>}
        </p>
        <div className="flex items-center gap-1.5">
          <input
            type="date" value={filters.dateFrom ?? ''}
            onChange={(e) => onDateRange(e.target.value || null, filters.dateTo ?? null)}
            className="flex-1 min-w-0 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20 cursor-pointer"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="date" value={filters.dateTo ?? ''}
            onChange={(e) => onDateRange(filters.dateFrom ?? null, e.target.value || null)}
            className="flex-1 min-w-0 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20 cursor-pointer"
          />
        </div>
      </div>

      {GROUP_ORDER.map((dim) => (
        <FilterChipGroup
          key={dim}
          title={DIMENSION_LABELS[dim]}
          values={facets[dim] ?? []}
          selected={selected[dim] ?? []}
          onToggle={(v) => onToggle(dim, v)}
          onClear={() => onClearDimension(dim)}
          formatValue={dim === 'customer' ? customerLabel : undefined}
        />
      ))}
    </aside>
  );
}
