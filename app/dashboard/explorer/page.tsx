'use client';

import { useMemo, useState } from 'react';
import { Compass, Upload, SlidersHorizontal } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { useData } from '../data-context';
import { ExplorerFilters } from '@/components/explorer-filters';
import {
  applyFilters, facetValues, listYears, DIMENSION_VALUE, customerLabel,
  type Row, type Dimension, type Selection, type RowFilters,
} from '@/lib/salesData';

/**
 * Explorer — slice the loaded report by anything.
 *
 * This is the OmniPortal answer to the Director's own `sales-pulse` tool: pick any
 * combination of outlet, sales category, salesperson, brand, vendor, customer and
 * model, and every figure on the page follows. The three other pages stay curated
 * and unfiltered; this is the one that answers ad-hoc questions.
 *
 * The counting is the shared engine's — PS/NI sales, credit notes only when they
 * match a real sale, returns forced negative, `cost_amt` used as the line total it
 * already is. Nothing here re-implements money.
 */

type Granularity = 'monthly' | 'weekly' | 'daily' | 'weekdays' | 'weekend';

const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'weekly',  label: 'Weekly' },
  { id: 'daily',   label: 'Daily' },
  { id: 'weekdays',label: 'Weekdays only' },
  { id: 'weekend', label: 'Weekends only' },
];

const BREAKDOWNS: { dim: Dimension; label: string }[] = [
  { dim: 'salesman', label: 'Top salespeople' },
  { dim: 'brand',    label: 'Top brands' },
  { dim: 'vendor',   label: 'Top vendors' },
  { dim: 'outlet',   label: 'Top outlets' },
];

const money = (n: number) =>
  `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const compact = (n: number) =>
  `RM ${Math.round(n).toLocaleString('en-MY')}`;

/** Monday of the week a 'YYYY-MM-DD' day falls in. */
function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function trendSeries(rows: Row[], mode: Granularity) {
  // Weekdays/weekends narrow which days count, then fall back to a daily bucket —
  // the question there is "how do Saturdays compare", not "what shape is the month".
  const scoped = mode === 'weekdays' || mode === 'weekend'
    ? rows.filter((r) => {
        if (!r.day) return false;
        const dow = new Date(`${r.day}T00:00:00`).getDay();
        const isWeekend = dow === 0 || dow === 6;
        return mode === 'weekend' ? isWeekend : !isWeekend;
      })
    : rows;

  const bucketOf = (r: Row): string | null => {
    if (mode === 'monthly') return r.month;
    if (!r.day) return null;
    return mode === 'weekly' ? weekStart(r.day) : r.day;
  };

  const buckets = new Map<string, { sales: number; units: number }>();
  for (const r of scoped) {
    const k = bucketOf(r);
    if (!k) continue;
    const b = buckets.get(k) ?? { sales: 0, units: 0 };
    b.sales += r.trx_amt;
    b.units += r.trx_qty;
    buckets.set(k, b);
  }

  const labelOf = (k: string) =>
    mode === 'monthly'
      ? new Date(`${k}-01T00:00:00`).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' })
      : mode === 'weekly'
        ? `w/c ${new Date(`${k}T00:00:00`).toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })}`
        : new Date(`${k}T00:00:00`).toLocaleDateString('en-MY', { day: '2-digit', month: 'short' });

  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))   // 'YYYY-MM(-DD)' sorts lexically
    .map(([k, v]) => ({ label: labelOf(k), sales: v.sales, units: v.units }));
}

export default function ExplorerPage() {
  const { rows, isLoading, hasData } = useData();

  const [selected, setSelected] = useState<Selection>({});
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('monthly');
  const [showFilters, setShowFilters] = useState(false);   // mobile only

  const filters: RowFilters = useMemo(
    () => ({ dateFrom, dateTo, years, months, selected }),
    [dateFrom, dateTo, years, months, selected],
  );

  const availableYears = useMemo(() => listYears(rows), [rows]);
  const facets = useMemo(() => facetValues(rows, filters), [rows, filters]);
  const visible = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  const kpis = useMemo(() => {
    let sales = 0, units = 0, cost = 0;
    const txns = new Set<string>();
    for (const r of visible) {
      sales += r.trx_amt;
      units += r.trx_qty;
      cost += r.cost_amt;
      if (r.trx_no) txns.add(r.trx_no);
    }
    return {
      sales, units, cost,
      transactions: txns.size,
      // Average selling price: what a single unit went out at, on average.
      asp: units ? sales / units : 0,
      profit: sales - cost,
      margin: sales ? (sales - cost) / sales : 0,
    };
  }, [visible]);

  const chart = useMemo(() => trendSeries(visible, granularity), [visible, granularity]);

  const breakdowns = useMemo(() => BREAKDOWNS.map(({ dim, label }) => {
    const totals = new Map<string, { sales: number; units: number; cost: number }>();
    for (const r of visible) {
      const key = DIMENSION_VALUE[dim](r).trim() || 'Unspecified';
      const t = totals.get(key) ?? { sales: 0, units: 0, cost: 0 };
      t.sales += r.trx_amt; t.units += r.trx_qty; t.cost += r.cost_amt;
      totals.set(key, t);
    }
    const list = [...totals.entries()]
      .map(([name, t]) => ({
        name: dim === 'customer' ? customerLabel(name) : name,
        ...t,
        margin: t.sales ? (t.sales - t.cost) / t.sales : 0,
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);
    const max = Math.max(1, ...list.map((x) => Math.abs(x.sales)));
    return { dim, label, list, max };
  }), [visible]);

  const activeCount =
    Object.values(selected).reduce((n, v) => n + (v?.length ?? 0), 0)
    + years.length + months.length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  // --- filter handlers -------------------------------------------------------

  const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const onToggle = (dim: Dimension, value: string) =>
    setSelected((s) => ({ ...s, [dim]: toggleIn(s[dim] ?? [], value) }));

  const onClearDimension = (dim: Dimension) =>
    setSelected((s) => ({ ...s, [dim]: [] }));

  // Picking a year or month clears any exact range, so the two date rules never
  // fight — the range would otherwise silently win and the chip would look broken.
  const onToggleYear = (y: string) => {
    setDateFrom(null); setDateTo(null);
    setYears((v) => toggleIn(v, y));
  };
  const onToggleMonth = (m: string) => {
    setDateFrom(null); setDateTo(null);
    setMonths((v) => toggleIn(v, m));
  };
  const onDateRange = (from: string | null, to: string | null) => {
    setDateFrom(from); setDateTo(to);
  };
  const onClearAll = () => {
    setSelected({}); setYears([]); setMonths([]); setDateFrom(null); setDateTo(null);
  };

  // --- render ----------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="p-8 text-slate-500 text-sm font-semibold">Reading report…</div>
    );
  }

  if (!hasData) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Upload size={22} className="text-slate-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No report loaded</h2>
        <p className="text-slate-500 text-sm">
          Use <strong>Load Data</strong> in the header to open a sales CSV. It is read in
          this browser and never leaves your machine.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
          <Compass className="text-[#0f172a]" size={30} />
          Explorer
        </h1>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold cursor-pointer"
        >
          <SlidersHorizontal size={16} />
          Filters{activeCount > 0 && ` (${activeCount})`}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className={showFilters ? 'block' : 'hidden lg:block'}>
          <ExplorerFilters
            facets={facets}
            selected={selected}
            filters={filters}
            years={availableYears}
            onToggle={onToggle}
            onClearDimension={onClearDimension}
            onToggleYear={onToggleYear}
            onToggleMonth={onToggleMonth}
            onDateRange={onDateRange}
            onClearAll={onClearAll}
            activeCount={activeCount}
          />
        </div>

        <div className="flex-1 min-w-0 space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total sales', value: money(kpis.sales), hint: 'Completed sales, returns deducted' },
              { label: 'Units sold', value: kpis.units.toLocaleString('en-MY'), hint: 'Quantity, returns netted' },
              { label: 'Transactions', value: kpis.transactions.toLocaleString('en-MY'), hint: 'Distinct transaction numbers' },
              { label: 'Avg selling price', value: money(kpis.asp), hint: 'Sales ÷ units' },
            ].map((k) => (
              <div key={k.label} className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{k.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1 break-words">{k.value}</p>
                <p className="text-[11px] text-slate-400 mt-1">{k.hint}</p>
              </div>
            ))}
          </div>

          {/* Scope line — stops a filtered figure being read as a company total. */}
          <p className="text-xs text-slate-500">
            Showing <strong className="text-slate-900">{visible.length.toLocaleString()}</strong> of{' '}
            {rows.length.toLocaleString()} sale rows
            {activeCount === 0 ? ' — no filters applied.' : `, narrowed by ${activeCount} filter${activeCount === 1 ? '' : 's'}.`}
            {' '}Profit {money(kpis.profit)} · margin {(kpis.margin * 100).toFixed(1)}%.
          </p>

          {/* Trend */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-bold text-slate-900">Sales trend</h2>
              <select
                value={granularity}
                onChange={(e) => setGranularity(e.target.value as Granularity)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20 cursor-pointer"
              >
                {GRANULARITIES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </div>
            {chart.length === 0 ? (
              <p className="text-sm text-slate-400 py-12 text-center">
                Nothing matches the current filters.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chart} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  {/* Do NOT add `interval` here. In Recharts 3.x `interval="preserveStartEnd"`
                      on this axis silently collapses the Line's x positions into a few
                      pixels while the Bars stay correct — no error, just a broken chart.
                      `minTickGap` thins the labels on the 200-bucket daily view safely. */}
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={28} />
                  <YAxis yAxisId="sales" tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <YAxis yAxisId="units" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(v, name) => {
                      const n = Number(v);
                      return name === 'Units'
                        ? [`${n.toLocaleString('en-MY')} units`, 'Units']
                        : [money(n), 'Sales'];
                    }}
                    labelStyle={{ color: '#0f172a', fontWeight: 700 }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="sales" dataKey="sales" name="Sales" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="units" dataKey="units" name="Units" stroke="#10b981"
                    strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Breakdowns */}
          <div className="grid md:grid-cols-2 gap-4">
            {breakdowns.map(({ dim, label, list, max }) => (
              <div key={dim} className="bg-white border border-slate-200 rounded-2xl p-5">
                <h2 className="text-base font-bold text-slate-900 mb-4">{label}</h2>
                {list.length === 0 && (
                  <p className="text-sm text-slate-400">Nothing matches the current filters.</p>
                )}
                <div className="space-y-2.5">
                  {list.map((x, i) => (
                    <div key={x.name} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate" title={x.name}>{x.name}</p>
                        <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-[#0f172a] rounded-full"
                            style={{ width: `${Math.max(2, (Math.abs(x.sales) / max) * 100)}%` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-slate-900 tabular-nums">{compact(x.sales)}</p>
                        <p className="text-[10px] text-slate-400 tabular-nums">
                          {x.units.toLocaleString('en-MY')} units · {(x.margin * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
