'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { AlertCircle, CalendarDays, Info, PackagePlus, Flame } from 'lucide-react';
import { BrandImage } from '@/components/BrandImage';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const OBSERVED_MONTHS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

const CONF_STYLES: Record<string, string> = {
  high:   'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
};
const CONF_LABELS: Record<string, string> = {
  high:   'Both years',
  medium: 'One year',
};

interface PeakEntry { brand: string; index: number; units_avg?: number; for_month?: number; confidence: string }
interface BrandRow {
  brand: string;
  total_units: number;
  peak_months: { month: number; index: number; confidence: string }[];
  peak_season: string | null;
  restock_months: number[];
}
interface SeasonalData {
  meta: {
    years: number[];
    n_brands_eligible: number;
    yoy_agreement: { same_top_month_pct: number; same_top_season_pct: number };
    limitations: string[];
  };
  seasons: Record<string, { label: string; months: number[]; observable: boolean }>;
  per_brand: BrandRow[];
  per_month: Record<string, { peaking: PeakEntry[]; restock_now: PeakEntry[] }>;
  season_totals: Record<string, { observable: boolean; index_all_brands?: number } & Record<string, number | boolean | undefined>>;
}

function authHeader() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function SeasonalPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<SeasonalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND}/api/insights/seasonal`, {
        headers: authHeader() as Record<string, string>,
      });
      if (!res.ok) throw new Error(res.status === 503 ? 'Seasonal analysis has not been generated yet.' : `Server error: ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load seasonal insights');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const monthData = data?.per_month?.[String(month)];
  const seasonKey = data ? Object.keys(data.seasons).find(k => data.seasons[k].months.includes(month)) : null;
  const season = seasonKey && data ? data.seasons[seasonKey] : null;

  const seasonChart = data
    ? Object.entries(data.season_totals)
        .filter(([, v]) => v.observable)
        .map(([k, v]) => ({
          season: data.seasons[k]?.label ?? k,
          ...Object.fromEntries(data.meta.years.map(y => [String(y), v[`units_${y}`] ?? 0])),
        }))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Seasonal Insights</h1>
        <p className="text-slate-600 text-sm mt-1">
          Which brands sell in which months — and what to stock up on before each peak.
        </p>
        <p className="text-slate-400 text-xs mt-0.5">
          From two years of sales history (Jan–Oct 2024 and 2025). Unit counts only.
        </p>
      </div>

      {/* Cross-link to Demand Forecast */}
      <div className="flex items-start gap-2 bg-sky-50 border border-sky-100 rounded-xl px-4 py-3">
        <Info size={14} className="text-sky-500 mt-0.5 shrink-0" />
        <p className="text-xs text-sky-800">
          This page shows <span className="font-semibold">recurring, historical</span> peak timing across all branches, cross-checked over two years.
          For a specific predicted number at <span className="font-semibold">one branch this month</span>, see{' '}
          <Link href="/dashboard/forecast" className="font-semibold underline underline-offset-2 hover:text-sky-900">Demand Forecast</Link>.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Month pills */}
      <div className="flex flex-wrap gap-2">
        {MONTH_NAMES.map((name, i) => {
          const m = i + 1;
          const active = m === month;
          const observed = OBSERVED_MONTHS.has(m);
          return (
            <button
              key={name}
              onClick={() => setMonth(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                active
                  ? 'bg-slate-900 text-white'
                  : observed
                    ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    : 'bg-slate-100 border border-slate-200 text-slate-400 hover:bg-slate-200'
              }`}
              title={observed ? undefined : 'No sales data for this month — restock advice only'}
            >
              {name}{!observed && ' *'}
            </button>
          );
        })}
      </div>

      {/* Season banner */}
      {season && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border bg-sky-50 border-sky-100">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-sky-100 text-sky-700">
            {season.label}
          </span>
          <span className="text-xs font-medium text-slate-600">
            {MONTH_NAMES[month - 1]} falls in the {season.label} period
            {!season.observable && ' — no sales history for this month, shown for restocking purposes only'}.
          </span>
        </div>
      )}

      {loading ? (
        <div className="h-60 flex items-center justify-center text-slate-400 text-sm">Loading seasonal insights…</div>
      ) : data && monthData && (
        <>
          {/* Restock now card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-1">
              <PackagePlus size={18} className="text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">
                Stock Up in {MONTH_NAMES[month - 1]}
              </h2>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              These brands historically peak the following month — order now so stock arrives in time.
            </p>
            {monthData.restock_now.length === 0 ? (
              <p className="text-sm text-slate-400">No brands flagged for restock this month.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {monthData.restock_now.map(r => (
                  <div key={`${r.brand}-${r.for_month}`} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 min-w-[200px]">
                    <BrandImage brand={r.brand} size={34} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{r.brand}</p>
                      <p className="text-xs text-slate-500">
                        peaks in {MONTH_NAMES[(r.for_month ?? month) - 1]} · {r.index.toFixed(2)}× avg month
                      </p>
                    </div>
                    <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${CONF_STYLES[r.confidence] ?? ''}`}>
                      {CONF_LABELS[r.confidence] ?? r.confidence}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Peaking now card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-1">
              <Flame size={18} className="text-amber-500" />
              <h2 className="text-base font-bold text-slate-900">
                Peaking in {MONTH_NAMES[month - 1]}
              </h2>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Brands that historically sell above their average in this month.
            </p>
            {monthData.peaking.length === 0 ? (
              <p className="text-sm text-slate-400">
                {OBSERVED_MONTHS.has(month)
                  ? 'No brands peak significantly in this month.'
                  : 'No sales history for this month (data covers January to October only).'}
              </p>
            ) : (
              <div className="space-y-2">
                {monthData.peaking.map(p => (
                  <div key={p.brand} className="flex items-center gap-3">
                    <BrandImage brand={p.brand} size={30} />
                    <span className="text-sm font-medium text-slate-900 flex-1 truncate">{p.brand}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CONF_STYLES[p.confidence] ?? ''}`}>
                      {CONF_LABELS[p.confidence] ?? p.confidence}
                    </span>
                    <span className="text-sm font-bold text-slate-900 w-20 text-right">{p.index.toFixed(2)}× avg</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Season comparison chart */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">Sales by Season, Year vs Year</h2>
            <p className="text-xs text-slate-400 mb-4">
              Units sold per Malaysian retail season — similar bars across years mean the pattern repeats.
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={seasonChart} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="season" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {data.meta.years.map((y, i) => (
                  <Bar key={y} dataKey={String(y)} fill={i === 0 ? '#94a3b8' : '#2b6cb0'} radius={[6, 6, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Brand seasonality table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">Brand Seasonality Overview</h2>
            <p className="text-xs text-slate-400 mb-4">
              All {data.meta.n_brands_eligible} brands with enough sales history for reliable analysis, ranked by volume.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Brand</th>
                    <th className="text-right py-2 pr-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Units (2 yrs)</th>
                    <th className="text-left py-2 pr-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Peak Months</th>
                    <th className="text-left py-2 pr-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Peak Season</th>
                    <th className="text-left py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Restock In</th>
                  </tr>
                </thead>
                <tbody>
                  {data.per_brand.map(b => (
                    <tr key={b.brand} className="border-b border-slate-50">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <BrandImage brand={b.brand} size={24} />
                          <span className="font-medium text-slate-900">{b.brand}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-slate-600">{b.total_units.toLocaleString()}</td>
                      <td className="py-2.5 pr-4 text-slate-600">
                        {b.peak_months.filter(p => p.confidence !== 'low').length === 0
                          ? <span className="text-slate-400">Steady all year</span>
                          : b.peak_months.filter(p => p.confidence !== 'low').map(p => (
                              <span key={p.month} className={`inline-block mr-1 mb-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CONF_STYLES[p.confidence]}`}>
                                {MONTH_NAMES[p.month - 1]} {p.index.toFixed(1)}×
                              </span>
                            ))}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-600">
                        {b.peak_season ? (data.seasons[b.peak_season]?.label ?? b.peak_season) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="py-2.5 text-slate-600">
                        {b.restock_months.length
                          ? b.restock_months.map(m => MONTH_NAMES[m - 1]).join(', ')
                          : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Limitations footer */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Info size={14} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">How to read this page</span>
            </div>
            <ul className="text-xs text-slate-500 space-y-0.5 list-disc pl-5">
              <li>
                &quot;Both years&quot; badges mean the peak appeared in 2024 <em>and</em> 2025 independently — the most reliable signals.
                &quot;One year&quot; peaks are suggestive but less certain.
              </li>
              {data.meta.limitations.map(l => <li key={l}>{l}</li>)}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
