'use client';

import { useState, useMemo } from 'react';
import { Award, Upload, ChevronDown, Package } from 'lucide-react';
import { BrandImage } from '@/components/BrandImage';
import { useData } from '../data-context';

/**
 * Brand Performance — which brands and models actually sold best.
 *
 * Rebuilt for V2: every figure here comes from the sales report loaded in the
 * browser. The previous version ranked brands by an AI *forecast* for Oct–Dec
 * 2025 (a prediction of a period that has since passed) while showing real
 * figures underneath — two different kinds of number on one screen. This shows
 * actual sales only, and needs no backend.
 */
export default function BrandsPage() {
  const { outlets, isLoading } = useData();
  const [outletCode, setOutletCode] = useState<string>('ALL');
  const [metric, setMetric] = useState<'sales' | 'units'>('sales');
  const [openBrand, setOpenBrand] = useState<string | null>(null);

  const money = (n: number) =>
    `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const compact = (n: number) =>
    n >= 1_000_000 ? `RM ${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `RM ${(n / 1_000).toFixed(0)}k`
    : `RM ${n.toFixed(0)}`;

  // Roll the loaded report up to the chosen scope: one outlet, or all of them.
  const { rows, grandTotal, models } = useMemo(() => {
    const scope = outletCode === 'ALL' ? outlets : outlets.filter((o) => o.code === outletCode);

    const totals: Record<string, { sales: number; units: number }> = {};
    const modelMap: Record<string, Record<string, { units: number; revenue: number }>> = {};

    for (const o of scope) {
      for (const [brand, sales] of Object.entries(o.brands ?? {})) {
        (totals[brand] ??= { sales: 0, units: 0 }).sales += sales;
      }
      for (const [brand, units] of Object.entries(o.brandUnits ?? {})) {
        (totals[brand] ??= { sales: 0, units: 0 }).units += units;
      }
      for (const [brand, ms] of Object.entries(o.brandModels ?? {})) {
        const target = (modelMap[brand] ??= {});
        for (const [code, m] of Object.entries(ms)) {
          const entry = (target[code] ??= { units: 0, revenue: 0 });
          entry.units += m.units;
          entry.revenue += m.revenue;
        }
      }
    }

    const list = Object.entries(totals)
      .map(([brand, v]) => ({ brand, sales: v.sales, units: Math.round(v.units) }))
      .filter((r) => r.sales !== 0 || r.units !== 0)
      .sort((a, b) => (metric === 'sales' ? b.sales - a.sales : b.units - a.units));

    const total = list.reduce((s, r) => s + (metric === 'sales' ? r.sales : r.units), 0);
    return { rows: list, grandTotal: total, models: modelMap };
  }, [outlets, outletCode, metric]);

  const valueOf = (r: { sales: number; units: number }) => (metric === 'sales' ? r.sales : r.units);
  const label = (v: number) => (metric === 'sales' ? money(v) : `${v.toLocaleString()} units`);
  const top = rows.length ? valueOf(rows[0]) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
      </div>
    );
  }

  if (!outlets.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="bg-slate-100 p-6 rounded-full mb-4"><Upload size={48} className="text-slate-400" /></div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No sales data loaded</h2>
        <p className="text-slate-500 max-w-md">
          Load a sales report from the Dashboard first — brand performance is calculated from it.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <header>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
          <Award className="text-slate-400" size={36} />
          Brand Performance
        </h1>
        <p className="text-slate-500 font-medium mt-1">
          Which brands and models actually sold best — from your loaded sales report.
        </p>
      </header>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Outlet</label>
          <select
            value={outletCode}
            onChange={(e) => { setOutletCode(e.target.value); setOpenBrand(null); }}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20 cursor-pointer"
          >
            <option value="ALL">All outlets</option>
            {outlets.map((o) => <option key={o.code} value={o.code}>{o.code}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
          {(['sales', 'units'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors capitalize cursor-pointer ${
                metric === k ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
              }`}
            >{k}</button>
          ))}
        </div>
      </div>

      {/* Scope total */}
      <div className="bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 rounded-[24px] text-white">
        <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-1">
          {outletCode === 'ALL' ? 'All outlets' : `Outlet ${outletCode}`} — total {metric}
        </p>
        <p className="text-3xl md:text-4xl font-bold tracking-tight">
          {metric === 'sales' ? money(grandTotal) : `${grandTotal.toLocaleString()} units`}
        </p>
        <p className="text-slate-400 text-sm font-medium mt-1">
          across {rows.length} product line{rows.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Ranking, biggest first */}
      <div className="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden">
        {rows.map((r, i) => {
          const open = openBrand === r.brand;
          const v = valueOf(r);
          const share = grandTotal ? (v / grandTotal) * 100 : 0;
          const brandModels = Object.entries(models[r.brand] ?? {})
            .map(([code, m]) => ({ code, units: Math.round(m.units), revenue: m.revenue }))
            .sort((a, b) => (metric === 'sales' ? b.revenue - a.revenue : b.units - a.units));

          return (
            <div key={r.brand} className={i ? 'border-t border-slate-50' : ''}>
              <button
                onClick={() => setOpenBrand(open ? null : r.brand)}
                className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors text-left cursor-pointer"
              >
                <span className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                  i < 3 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
                }`}>{i + 1}</span>
                <BrandImage brand={r.brand} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 text-sm truncate">{r.brand}</p>
                  <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden max-w-xs">
                    <div className="h-full bg-slate-900 rounded-full" style={{ width: `${top ? (v / top) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-slate-900 text-sm whitespace-nowrap">{label(v)}</p>
                  <p className="text-xs text-slate-400 font-medium">{share.toFixed(1)}%</p>
                </div>
                <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>

              {open && (
                <div className="px-4 pb-4 bg-slate-50/40">
                  {brandModels.length === 0 ? (
                    <p className="text-sm text-slate-500 py-3 flex items-center gap-2">
                      <Package size={16} /> No individual model codes recorded for this line.
                    </p>
                  ) : (
                    <div className="rounded-[16px] border border-slate-100 bg-white overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                            <th className="text-left font-bold px-4 py-2.5">Model</th>
                            <th className="text-right font-bold px-4 py-2.5">Sales</th>
                            <th className="text-right font-bold px-4 py-2.5">Units</th>
                          </tr>
                        </thead>
                        <tbody>
                          {brandModels.slice(0, 25).map((m) => (
                            <tr key={m.code} className="border-t border-slate-50">
                              <td className="px-4 py-2.5 font-medium text-slate-700">{m.code}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">{compact(m.revenue)}</td>
                              <td className="px-4 py-2.5 text-right font-medium text-slate-600">{m.units.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {brandModels.length > 25 && (
                        <p className="text-xs text-slate-400 font-medium px-4 py-2 border-t border-slate-50">
                          Showing top 25 of {brandModels.length} models.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
