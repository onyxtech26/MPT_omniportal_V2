'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

/**
 * One collapsible group of filter chips.
 *
 * Modelled on the pivot panels in the Director's `sales-pulse` tool: the values
 * on offer are cross-filtered (the caller passes only what the *other* filters
 * still allow), each group has its own search box, and clicking a chip toggles it.
 *
 * Two things the raw data forces:
 *  - Search is not optional. There are ~4,500 distinct model codes in one export;
 *    an unsearchable chip list is unusable at that size.
 *  - Long lists render capped, with a "show all" escape. Painting 4,500 buttons on
 *    every keystroke is what makes his version stutter.
 */

/** Below this many values a group carries no information, so it hides itself. */
const MIN_USEFUL_VALUES = 2;

/** How many chips to paint before requiring an explicit "show all". */
const CHIP_CAP = 60;

interface FilterChipGroupProps {
  title: string;
  /** Values still reachable given every OTHER group's selection. */
  values: string[];
  /** Currently selected values in this group. */
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  /** Display-only relabelling, e.g. customer '0' → 'Walk-in'. */
  formatValue?: (value: string) => string;
}

export function FilterChipGroup({
  title, values, selected, onToggle, onClear, formatValue,
}: FilterChipGroupProps) {
  const [term, setTerm] = useState('');
  const [showAll, setShowAll] = useState(false);
  // Memoised so the fallback identity function doesn't change on every render and
  // defeat the search memo below — which is the expensive one on 4,500 models.
  const label = useMemo(() => formatValue ?? ((v: string) => v), [formatValue]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const matches = useMemo(() => {
    const t = term.trim().toLowerCase();
    const hits = t ? values.filter((v) => label(v).toLowerCase().includes(t)) : values;
    // A selected value must stay visible even if it falls outside the cap or the
    // search term — otherwise a filter is active with no way to switch it off.
    const pinned = selected.filter((v) => !hits.includes(v));
    return [...pinned, ...hits];
  }, [values, term, selected, label]);

  // A group with one value (or none) can't narrow anything — don't show a dead
  // control. `cust_no` is '0' on every row of every export we have, so the
  // Customer group hides itself until a file with real customer numbers arrives.
  if (values.length < MIN_USEFUL_VALUES && selected.length === 0) return null;

  const visible = showAll ? matches : matches.slice(0, CHIP_CAP);
  const hidden = matches.length - visible.length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
          {title}
          {selected.length > 0 && (
            <span className="ml-1.5 text-[#0f172a]">({selected.length})</span>
          )}
        </h3>
        {selected.length > 0 && (
          <button
            onClick={onClear}
            aria-label={`Clear ${title} filter`}
            className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {values.length > 12 && (
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={`Search ${title.toLowerCase()}…`}
          className="w-full mb-2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20"
        />
      )}

      <div className="flex flex-wrap gap-1.5">
        {visible.map((v) => (
          <button
            key={v}
            onClick={() => onToggle(v)}
            title={label(v)}
            className={`px-2.5 py-1 rounded-full text-xs font-bold max-w-full truncate transition-colors cursor-pointer ${
              selectedSet.has(v)
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label(v)}
          </button>
        ))}
        {visible.length === 0 && (
          <span className="text-xs text-slate-400">No matching values</span>
        )}
      </div>

      {hidden > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
        >
          Show all {matches.length.toLocaleString()}
        </button>
      )}
    </div>
  );
}
