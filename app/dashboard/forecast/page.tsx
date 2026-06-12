'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import { getBrandImageUrl } from '@/lib/brandImages';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

const BRANCHES = ['AM','CS','GPL','HQ','JCI','JKL','KLT','KMT','MFW','MRT','SAT','TBT','TSB','WZ'];
const FORECAST_MONTHS = [
  { value: '2025-10', label: 'October 2025' },
  { value: '2025-11', label: 'November 2025' },
  { value: '2025-12', label: 'December 2025' },
];

const SEASON_LABELS: Record<string, string> = {
  '2025-10': 'Q4 (Pre Year-End)',
  '2025-11': 'Year-End Season',
  '2025-12': 'Year-End / Christmas',
};

const BAR_COLORS = [
  '#0f172a','#1e3a5f','#1d4ed8','#2563eb','#3b82f6',
  '#60a5fa','#93c5fd','#bfdbfe','#dbeafe','#eff6ff',
];

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

// Generic watch SVG shown when no brand logo is available
function WatchIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <rect x="12" y="2" width="8" height="5" rx="2" fill="#cbd5e1" />
      <rect x="12" y="25" width="8" height="5" rx="2" fill="#cbd5e1" />
      <circle cx="16" cy="16" r="11" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="9" fill="white" stroke="#94a3b8" strokeWidth="1" />
      <line x1="16" y1="10" x2="16" y2="16" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="16" x2="20" y2="18" stroke="#475569" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1" fill="#1e293b" />
    </svg>
  );
}

function BrandImage({ brand, size = 32 }: { brand: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(() => getBrandImageUrl(brand));
  if (!src) return <WatchIcon size={size} />;
  return (
    <img
      src={src}
      alt={brand}
      width={size}
      height={size}
      className="rounded-md object-contain bg-white border border-slate-100 shrink-0"
      style={{ minWidth: size, minHeight: size }}
      onError={() => setSrc(null)}
    />
  );
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

  const chartData = forecasts.slice(0, 12).map(r => ({
    brand: r.brand.length > 14 ? r.brand.substring(0, 13) + '…' : r.brand,
    fullBrand: r.brand,
    units: r.predicted_units,
    lower: r.lower,
    upper: r.upper,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Demand Forecast</h1>
        <p className="text-slate-500 text-sm mt-1">
          AI-predicted brand demand by branch — trained on Jan–Sep 2024 &amp; 2025 POS data
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

      {/* Season badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-full">
        <span className="text-xs font-semibold text-blue-700">{SEASON_LABELS[month]}</span>
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-900 mb-1">
          Top Brands — {branch} · {FORECAST_MONTHS.find(m => m.value === month)?.label}
        </h2>
        <p className="text-xs text-slate-400 mb-6">Predicted units sold (net, D-minus-C)</p>

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
                      <p className="text-slate-600">Predicted: <span className="font-semibold text-slate-900">{d.units} units</span></p>
                      <p className="text-slate-400">Range: {d.lower} – {d.upper}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="units" radius={[6, 6, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
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
            {forecasts.slice(0, 20).map((row, i) => (
              <div key={row.brand} className="flex items-center gap-3">
                <span className="w-6 text-right text-xs font-bold text-slate-400 shrink-0">{i + 1}</span>
                <BrandImage brand={row.brand} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-900 truncate">{row.brand}</span>
                    <span className="text-sm font-bold text-slate-900 ml-2 shrink-0">{row.predicted_units} units</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-900 rounded-full"
                      style={{ width: `${Math.min(100, (row.predicted_units / forecasts[0].predicted_units) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model comparison card */}
      {comparison && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-1">Model Selection</h2>
          <p className="text-xs text-slate-400 mb-4">{comparison.winner_reason}</p>
          <div className="overflow-x-auto">
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
        </div>
      )}
    </div>
  );
}
