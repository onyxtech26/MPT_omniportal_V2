'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Award, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { BrandImage } from '@/components/BrandImage';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const BRANCHES = ['AM','CS','GPL','HQ','JCI','JKL','KLT','KMT','MFW','MRT','SAT','TBT','TSB','WZ'];
const FORECAST_MONTHS = ['2025-10','2025-11','2025-12'];

const TIER_COLORS = { High: '#10b981', Medium: '#f59e0b', Low: '#94a3b8' };

function getTier(ratio: number): 'High' | 'Medium' | 'Low' {
  if (ratio >= 0.66) return 'High';
  if (ratio >= 0.33) return 'Medium';
  return 'Low';
}

function authHeader() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface BrandRow { brand: string; units: number; reach?: number; }
interface ModelRow  { model: string; units: number; revenue: number; list_price: number; }

export default function BrandsPage() {
  const [viewMode, setViewMode]         = useState<'all' | 'branch'>('all');
  const [branch, setBranch]             = useState(BRANCHES[0]);
  const [leaderboard, setLeaderboard]   = useState<BrandRow[]>([]);
  const [ranking, setRanking]           = useState<BrandRow[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [models, setModels]             = useState<ModelRow[]>([]);
  const [loading, setLoading]           = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [error, setError]               = useState('');

  const rankingsRef = useRef<HTMLDivElement>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND}/api/forecast/top-brands`, {
        headers: authHeader() as Record<string, string>,
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data: Record<string, { brand: string; predicted_units: number }[]> = await res.json();

      const agg = new Map<string, { units: number; branches: Set<string> }>();
      for (const [br, rows] of Object.entries(data)) {
        for (const { brand, predicted_units } of rows) {
          if (predicted_units <= 0) continue;
          const e = agg.get(brand) ?? { units: 0, branches: new Set<string>() };
          e.units += predicted_units;
          e.branches.add(br);
          agg.set(brand, e);
        }
      }
      setLeaderboard(
        [...agg.entries()]
          .map(([brand, e]) => ({ brand, units: Math.round(e.units), reach: e.branches.size }))
          .sort((a, b) => b.units - a.units)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBranchRanking = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(
        FORECAST_MONTHS.map(m =>
          fetch(`${BACKEND}/api/forecast?branch=${branch}&month=${m}`, {
            headers: authHeader() as Record<string, string>,
          }).then(r => r.json())
        )
      );
      const byBrand = new Map<string, number>();
      for (const { forecasts } of results)
        for (const r of (forecasts ?? []))
          byBrand.set(r.brand, (byBrand.get(r.brand) ?? 0) + r.predicted_units);

      setRanking(
        [...byBrand.entries()]
          .map(([brand, u]) => ({ brand, units: Math.round(u) }))
          .filter(r => r.units > 0)
          .sort((a, b) => b.units - a.units)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load branch data');
    } finally {
      setLoading(false);
    }
  }, [branch]);

  const fetchModels = useCallback(async (brand: string) => {
    setModelsLoading(true);
    setModels([]);
    try {
      const params = new URLSearchParams({ brand });
      if (viewMode === 'branch') params.set('branch', branch);
      const res = await fetch(`${BACKEND}/api/brands/models?${params}`, {
        headers: authHeader() as Record<string, string>,
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setModels(data.models ?? []);
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [viewMode, branch]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  useEffect(() => {
    if (viewMode === 'branch') fetchBranchRanking();
  }, [fetchBranchRanking, viewMode]);

  const handleBrandClick = (brand: string, scrollToList = false) => {
    if (selectedBrand === brand) {
      setSelectedBrand(null);
      setModels([]);
    } else {
      setSelectedBrand(brand);
      fetchModels(brand);
      if (scrollToList) {
        setTimeout(() => rankingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      }
    }
  };

  const refresh = () => {
    setSelectedBrand(null);
    setModels([]);
    if (viewMode === 'all') fetchLeaderboard();
    else fetchBranchRanking();
  };

  const displayList  = viewMode === 'all' ? leaderboard : ranking;
  const topBrand     = displayList[0];
  const top3         = displayList.slice(0, 3);
  const totalUnits   = displayList.reduce((s, r) => s + r.units, 0);
  const top3Units    = top3.reduce((s, r) => s + r.units, 0);
  const top3Share    = totalUnits > 0 ? Math.round((top3Units / totalUnits) * 100) : 0;
  const galleryList  = displayList.slice(0, 12);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Brand Performance</h1>
        <p className="text-slate-600 text-sm mt-1">
          Which watch brands and models sell best — across every outlet and inside each one.
        </p>
        <p className="text-slate-400 text-xs mt-0.5">
          Brand rankings from AI forecast (Oct–Dec 2025). Model breakdowns from actual 2025 sales.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">View</label>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
            <button
              onClick={() => { setViewMode('all'); setSelectedBrand(null); setModels([]); }}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${viewMode === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              All Outlets
            </button>
            <button
              onClick={() => { setViewMode('branch'); setSelectedBrand(null); setModels([]); }}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${viewMode === 'branch' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              By Outlet
            </button>
          </div>
        </div>

        {viewMode === 'branch' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Branch</label>
            <select
              value={branch}
              onChange={e => { setBranch(e.target.value); setSelectedBrand(null); setModels([]); }}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        )}

        <div className="flex items-end">
          <button
            onClick={refresh}
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

      {/* Summary card */}
      {!loading && top3.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-1">
            {viewMode === 'all' ? 'Push Company-Wide' : `Best Sellers — ${branch}`}
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            {viewMode === 'all' ? 'Across all 14 outlets, ' : `At ${branch}, `}
            <span className="font-semibold text-slate-900">{top3.map(r => r.brand).join(', ')}</span>
            {' '}make up about{' '}
            <span className="font-semibold text-slate-900">{top3Share}%</span> of total expected demand
            {viewMode === 'all' && topBrand?.reach
              ? ` — ${topBrand.brand} alone sells in ${topBrand.reach}/14 outlets.`
              : '.'}
          </p>
          <div className="flex flex-wrap gap-3 mb-4">
            {top3.map((row, i) => (
              <button
                key={row.brand}
                onClick={() => handleBrandClick(row.brand, true)}
                className="flex items-center gap-3 bg-slate-50 hover:bg-slate-100 rounded-xl px-4 py-3 min-w-[160px] transition-colors text-left"
              >
                <span className="text-lg font-black text-slate-300">#{i + 1}</span>
                <BrandImage brand={row.brand} size={36} />
                <div>
                  <p className="text-sm font-bold text-slate-900">{row.brand}</p>
                  <p className="text-xs text-slate-500">{row.units} units expected</p>
                  {viewMode === 'all' && row.reach && (
                    <p className="text-[10px] text-slate-400">{row.reach}/14 outlets</p>
                  )}
                </div>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide shrink-0">Action</span>
            <span className="text-xs text-emerald-800">
              {viewMode === 'all'
                ? 'These brands are strong across all outlets — safe to run company-wide promotions or bulk orders.'
                : `Ensure these brands are well-stocked at ${branch} before the year-end season.`}
            </span>
          </div>
          {viewMode === 'all' && (
            <p className="text-[10px] text-slate-400 mt-2">
              Ranking based on each outlet's top 10 brands (Oct–Dec 2025 forecast).
            </p>
          )}
        </div>
      )}

      {/* Brand Rankings with inline model drill-down */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 flex items-center justify-center text-slate-400 text-sm">
          Loading brand data…
        </div>
      ) : displayList.length === 0 && !error ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 flex items-center justify-center text-slate-400 text-sm">
          No forecast data available for this selection.
        </div>
      ) : displayList.length > 0 ? (
        <div ref={rankingsRef} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-1">
            {viewMode === 'all' ? 'Company-Wide Brand Rankings' : `Brand Rankings — ${branch} (Oct–Dec 2025)`}
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Click any brand to see its top-selling models (Jan–Sep 2025 actual sales).
          </p>
          <div className="space-y-2">
            {displayList.slice(0, 20).map((row, i) => {
              const ratio    = topBrand ? row.units / topBrand.units : 0;
              const tier     = getTier(ratio);
              const tierStyle = {
                High:   'bg-emerald-100 text-emerald-700',
                Medium: 'bg-amber-100 text-amber-700',
                Low:    'bg-slate-100 text-slate-500',
              }[tier];
              const isOpen = selectedBrand === row.brand;

              return (
                <div key={row.brand} className="rounded-xl border border-slate-100 overflow-hidden">
                  <button
                    onClick={() => handleBrandClick(row.brand)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <span className="w-6 text-right text-xs font-bold text-slate-400 shrink-0">{i + 1}</span>
                    <BrandImage brand={row.brand} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-900 truncate">{row.brand}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${tierStyle}`}>
                          {tier}
                        </span>
                        {viewMode === 'all' && row.reach && (
                          <span className="text-[10px] text-slate-400 shrink-0">{row.reach}/14 outlets</span>
                        )}
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: TIER_COLORS[tier] }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-bold text-slate-900 ml-2 shrink-0">{row.units} units</span>
                    {isOpen
                      ? <ChevronUp size={16} className="text-slate-400 shrink-0" />
                      : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                  </button>

                  {/* Model drill-down */}
                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                        Model Breakdown — {row.brand}
                        {viewMode === 'branch' ? ` at ${branch}` : ' (All Outlets)'}
                        {' '}· Jan–Sep 2025 actual sales
                      </p>
                      {modelsLoading ? (
                        <p className="text-xs text-slate-400">Loading models…</p>
                      ) : models.length === 0 ? (
                        <p className="text-xs text-slate-400">No model-level sales data found for this brand.</p>
                      ) : (
                        <>
                          <div className="space-y-2">
                            {models.slice(0, 15).map((m, mi) => (
                              <div key={m.model} className="flex items-center gap-3">
                                <span className="w-5 text-right text-[10px] font-bold text-slate-300 shrink-0">{mi + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-xs font-mono font-medium text-slate-700 truncate">{m.model}</span>
                                    <div className="flex items-center gap-3 ml-2 shrink-0">
                                      {m.list_price > 0 && (
                                        <span className="text-[10px] text-slate-400">RM {m.list_price.toFixed(0)}</span>
                                      )}
                                      <span className="text-xs font-bold text-slate-900">{m.units} units</span>
                                    </div>
                                  </div>
                                  <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-slate-500 rounded-full"
                                      style={{ width: `${Math.min(100, (m.units / models[0].units) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          {models.length > 15 && (
                            <p className="text-[10px] text-slate-400 pt-2">+{models.length - 15} more models not shown</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Brand Gallery */}
      {galleryList.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-1">Brand Gallery</h2>
          <p className="text-xs text-slate-400 mb-4">
            Top brands at a glance. Click any to see its model breakdown in the rankings above.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {galleryList.map((row, i) => {
              const ratio     = topBrand ? row.units / topBrand.units : 0;
              const tier      = getTier(ratio);
              const tierStyle = {
                High:   'bg-emerald-100 text-emerald-700',
                Medium: 'bg-amber-100 text-amber-700',
                Low:    'bg-slate-100 text-slate-500',
              }[tier];
              const isSelected = selectedBrand === row.brand;

              return (
                <button
                  key={row.brand}
                  onClick={() => handleBrandClick(row.brand, true)}
                  className={`relative rounded-2xl border p-4 flex flex-col items-center text-center gap-2 transition-all hover:shadow-md ${
                    isSelected
                      ? 'border-slate-900 bg-slate-50 shadow-md'
                      : 'border-slate-100 bg-white hover:border-slate-200'
                  }`}
                >
                  <span className="absolute top-2 left-2 text-xs font-black text-slate-300">#{i + 1}</span>
                  <BrandImage brand={row.brand} size={48} />
                  <p className="text-sm font-bold text-slate-900 truncate w-full">{row.brand}</p>
                  <p className="text-xs text-slate-500">{row.units} units</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tierStyle}`}>{tier}</span>
                  {viewMode === 'all' && row.reach && (
                    <p className="text-[10px] text-slate-400">{row.reach}/14 outlets</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
