'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import { BrandImage } from '@/components/BrandImage';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

const BRANCHES = ['AM','CS','GPL','HQ','JCI','JKL','KLT','KMT','MFW','MRT','SAT','TBT','TSB','WZ'];
const FORECAST_MONTHS = [
  { value: '2025-10', label: 'October 2025' },
  { value: '2025-11', label: 'November 2025' },
  { value: '2025-12', label: 'December 2025' },
];

const SEASON_CONFIG: Record<string, { label: string; level: 'Medium' | 'High'; note: string }> = {
  '2025-10': {
    label: 'Early Year-End Build-Up',
    level: 'Medium',
    note: 'Demand is starting to climb toward the year-end peak — a good month to build up stock.',
  },
  '2025-11': {
    label: 'Year-End Season',
    level: 'High',
    note: 'Expect noticeably higher demand than a normal month. Prioritise restocking top brands early.',
  },
  '2025-12': {
    label: 'Year-End / Christmas Peak',
    level: 'High',
    note: 'The busiest period of the year. Stock heavily, especially gift-friendly brands.',
  },
};

const TIER_COLORS = {
  High:   '#10b981', // emerald-500
  Medium: '#f59e0b', // amber-500
  Low:    '#94a3b8', // slate-400
};

function getTier(ratio: number): 'High' | 'Medium' | 'Low' {
  if (ratio >= 0.66) return 'High';
  if (ratio >= 0.33) return 'Medium';
  return 'Low';
}

interface ForecastRow {
  branch: string;
  brand: string;
  month: string;
  predicted_units: number;
  lower: number;
  upper: number;
}

interface ComparisonRow {
  Technique: string;
  'RMSE': number;
  'MAPE (%)': number;
  'Train Time (s)': number;
}


function authHeader() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ForecastPage() {
  const [branch, setBranch]         = useState(BRANCHES[0]);
  const [month, setMonth]           = useState(FORECAST_MONTHS[0].value);
  const [forecasts, setForecasts]   = useState<ForecastRow[]>([]);
  const [comparison, setComparison] = useState<{ comparison: ComparisonRow[]; winner: string; winner_reason: string } | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [isDemo, setIsDemo]         = useState(false);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      try { setIsDemo(JSON.parse(user).role === 'demo'); } catch {}
    }
  }, []);

  const fetchForecasts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ branch, month });
      const res = await fetch(`${BACKEND}/api/forecast?${params}`, {
        headers: authHeader() as Record<string, string>,
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setForecasts(data.forecasts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load forecast data');
    } finally {
      setLoading(false);
    }
  }, [branch, month]);

  const fetchComparison = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/forecast/comparison`, {
        headers: authHeader() as Record<string, string>,
      });
      if (!res.ok) return;
      const data = await res.json();
      setComparison(data);
    } catch {}
  }, []);

  useEffect(() => {
    if (!isDemo) {
      fetchForecasts();
      fetchComparison();
    }
  }, [fetchForecasts, fetchComparison, isDemo]);

  if (isDemo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
          <TrendingUp size={32} className="text-slate-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Demand Forecast</h2>
        <p className="text-slate-500 max-w-sm">
          Sign in with a real account to access AI-generated sales forecasts.
        </p>
      </div>
    );
  }

  const topBrand = forecasts[0];
  const top3 = forecasts.slice(0, 3);
  const totalUnits = forecasts.reduce((sum, r) => sum + r.predicted_units, 0);
  const top3Units = top3.reduce((sum, r) => sum + r.predicted_units, 0);
  const top3Share = totalUnits > 0 ? Math.round((top3Units / totalUnits) * 100) : 0;
  const monthLabel = FORECAST_MONTHS.find(m => m.value === month)?.label ?? month;
  const season = SEASON_CONFIG[month];

  const chartData = forecasts.slice(0, 12).map(r => ({
    brand: r.brand.length > 14 ? r.brand.substring(0, 13) + '…' : r.brand,
    fullBrand: r.brand,
    units: r.predicted_units,
    lower: r.lower,
    upper: r.upper,
    tier: topBrand ? getTier(r.predicted_units / topBrand.predicted_units) : 'Low' as 'High' | 'Medium' | 'Low',
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Demand Forecast</h1>
        <p className="text-slate-600 text-sm mt-1">
          What your customers are likely to buy next month — so you can stock the right brands before they sell out.
        </p>
        <p className="text-slate-400 text-xs mt-0.5">
          Predictions from AI trained on 2024–2025 sales (POS) data.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Branch</label>
          <select
            value={branch}
            onChange={e => setBranch(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Month</label>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {FORECAST_MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={fetchForecasts}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Season demand level */}
      {season && (
        <div className={`flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border ${
          season.level === 'High'
            ? 'bg-emerald-50 border-emerald-100'
            : 'bg-amber-50 border-amber-100'
        }`}>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            season.level === 'High'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-700'
          }`}>
            {season.level === 'High' ? 'High Demand Period' : 'Rising Demand Period'}
          </span>
          <span className="text-xs font-medium text-slate-600">
            {season.label} — {season.note}
          </span>
        </div>
      )}

      {/* Restock priority card */}
      {!loading && top3.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-1">Restock Priority This Month</h2>
          <p className="text-sm text-slate-500 mb-4">
            Focus your restock on{' '}
            <span className="font-semibold text-slate-900">
              {top3.map(r => r.brand).join(', ')}
            </span>
            {' '}— together they make up about{' '}
            <span className="font-semibold text-slate-900">{top3Share}%</span> of expected sales at{' '}
            <span className="font-semibold text-slate-900">{branch}</span> in{' '}
            <span className="font-semibold text-slate-900">{monthLabel}</span>.
          </p>
          <div className="flex flex-wrap gap-4 mb-4">
            {top3.map((row, i) => (
              <div key={row.brand} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 min-w-[160px]">
                <span className="text-lg font-black text-slate-300">#{i + 1}</span>
                <BrandImage brand={row.brand} size={36} />
                <div>
                  <p className="text-sm font-bold text-slate-900">{row.brand}</p>
                  <p className="text-xs text-slate-500">{row.predicted_units} units expected</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Action</span>
            <span className="text-xs text-emerald-800">
              Make sure these brands are well-stocked before {monthLabel} starts.
            </span>
          </div>
        </div>
      )}

      {/* Bar chart */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-900 mb-1">
          Top Brands — {branch} · {monthLabel}
        </h2>
        <p className="text-xs text-slate-400 mb-4">Predicted items sold this month</p>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-6">
          {(['High', 'Medium', 'Low'] as const).map(tier => (
            <div key={tier} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: TIER_COLORS[tier] }}
              />
              <span className="text-xs text-slate-500">{tier} demand</span>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="h-72 flex items-center justify-center text-slate-400 text-sm">Loading forecasts…</div>
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-slate-400 text-sm">No non-zero forecasts for this selection.</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 60, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="brand"
                tick={{ fontSize: 11, fill: '#64748b' }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                content={({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof chartData[0] }> }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
                      <div className="flex items-center gap-2 mb-2">
                        <BrandImage brand={d.fullBrand} size={24} />
                        <p className="font-bold text-slate-900">{d.fullBrand}</p>
                      </div>
                      <p className="text-slate-600">
                        Predicted: <span className="font-semibold text-slate-900">{d.units} units</span>
                      </p>
                      <p className="text-slate-400 mt-1">Likely between {d.lower} and {d.upper} units</p>
                      <p className="text-slate-300 mt-0.5">Best- and worst-case estimate</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="units" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={TIER_COLORS[entry.tier]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Ranked list */}
      {!loading && forecasts.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">Full Brand Rankings</h2>
          <div className="space-y-3">
            {forecasts.slice(0, 20).map((row, i) => {
              const ratio = topBrand ? row.predicted_units / topBrand.predicted_units : 0;
              const tier = getTier(ratio);
              const tierStyle = {
                High:   'bg-emerald-100 text-emerald-700',
                Medium: 'bg-amber-100 text-amber-700',
                Low:    'bg-slate-100 text-slate-500',
              }[tier];
              return (
                <div key={row.brand} className="flex items-center gap-3">
                  <span className="w-6 text-right text-xs font-bold text-slate-400 shrink-0">{i + 1}</span>
                  <BrandImage brand={row.brand} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-slate-900 truncate">{row.brand}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${tierStyle}`}>
                          {tier}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-slate-900 ml-2 shrink-0">{row.predicted_units} units</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, ratio * 100)}%`,
                          backgroundColor: TIER_COLORS[tier],
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Model comparison — collapsed by default for analysts */}
      {comparison && (
        <details className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 group">
          <summary className="cursor-pointer list-none flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">How We Pick the Forecast Model</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                We tested several AI methods and automatically use the most accurate one —{' '}
                <span className="font-semibold text-slate-600">{comparison.winner}</span>.
              </p>
            </div>
            <span className="text-xs text-slate-400 group-open:hidden">Show details</span>
            <span className="text-xs text-slate-400 hidden group-open:inline">Hide</span>
          </summary>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 pr-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Technique</th>
                  <th className="text-right py-2 pr-4 text-xs font-bold text-slate-500 uppercase tracking-wide">RMSE</th>
                  <th className="text-right py-2 pr-4 text-xs font-bold text-slate-500 uppercase tracking-wide">MAPE %</th>
                  <th className="text-right py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Train Time</th>
                </tr>
              </thead>
              <tbody>
                {comparison.comparison.map((row) => (
                  <tr
                    key={row.Technique}
                    className={`border-b border-slate-50 ${row.Technique === comparison.winner ? 'bg-emerald-50' : ''}`}
                  >
                    <td className="py-2.5 pr-4 font-medium text-slate-900">
                      {row.Technique}
                      {row.Technique === comparison.winner && (
                        <span className="ml-2 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-md">Selected</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-slate-600">{Number(row['RMSE']).toFixed(4)}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-600">{Number(row['MAPE (%)']).toFixed(2)}%</td>
                    <td className="py-2.5 text-right text-slate-600">{Number(row['Train Time (s)']).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Evaluated on held-out data: months Aug–Sep 2025. MAPE computed on non-zero demand months only.
          </p>
        </details>
      )}
    </div>
  );
}
