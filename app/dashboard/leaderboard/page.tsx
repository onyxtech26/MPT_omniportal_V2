'use client';

import { useState, useMemo } from 'react';
import { Trophy, Upload } from 'lucide-react';
import { useData } from '../data-context';
import type { OutletSummary } from '@/lib/salesData';

/**
 * Leaderboards — who and what sells most.
 *
 * Modelled on the ranking boards in the Director's own `sales-pulse` tool
 * (Salesman / Brand / Store / Vendor, with margin views), so both applications
 * answer the same questions the same way. Everything is computed in the browser
 * from the loaded sales report.
 *
 * One deliberate difference: margin here divides profit by revenue using
 * `cost_amt` as-is. `cost_amt` is already a line total in the POS export — it
 * scales with quantity — so multiplying it by quantity, as sales-pulse does,
 * double-counts cost on multi-unit lines.
 */
type BoardId = 'vendor' | 'salesman' | 'brand' | 'outlet';
type Metric = 'sales' | 'units' | 'margin';

const BOARDS: { id: BoardId; label: string; hint: string }[] = [
  { id: 'vendor',   label: 'Vendor',      hint: 'Supplier code on each transaction' },
  { id: 'salesman', label: 'Salesperson', hint: 'Counter-code variants merged into one person' },
  { id: 'brand',    label: 'Brand',       hint: 'Product line; after-sales items grouped as Service' },
  { id: 'outlet',   label: 'Outlet',      hint: 'Branch performance' },
];

interface Totals { sales: number; units: number; cost: number }

export default function LeaderboardPage() {
  const { outlets, isLoading } = useData();
  const [board, setBoard] = useState<BoardId>('vendor');
  const [metric, setMetric] = useState<Metric>('sales');
  const [scope, setScope] = useState<string>('ALL');

  const money = (n: number) =>
    `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rows = useMemo(() => {
    const inScope = scope === 'ALL' || board === 'outlet'
      ? outlets
      : outlets.filter((o) => o.code === scope);

    const totals: Record<string, Totals> = {};
    const bump = (key: string, sales: number, units: number, cost: number) => {
      const t = (totals[key] ??= { sales: 0, units: 0, cost: 0 });
      t.sales += sales; t.units += units; t.cost += cost;
    };

    const pick = (o: OutletSummary): [Record<string, number>, Record<string, number>, Record<string, number>] => {
      if (board === 'vendor')   return [o.vendors, o.vendorUnits, o.vendorCost];
      if (board === 'salesman') return [o.salesmen, o.salesmenUnits, o.salesmenCost];
      return [o.brands, o.brandUnits, o.brandCost];
    };

    for (const o of inScope) {
      if (board === 'outlet') {
        const units = Object.values(o.salesmenUnits ?? {}).reduce((a, b) => a + b, 0);
        bump(o.code, o.totalRevenue, units, o.totalInvestment);
        continue;
      }
      const [sales, units, cost] = pick(o);
      for (const [k, v] of Object.entries(sales ?? {})) bump(k || 'Unspecified', v, 0, 0);
      for (const [k, v] of Object.entries(units ?? {})) bump(k || 'Unspecified', 0, v, 0);
      for (const [k, v] of Object.entries(cost ?? {}))  bump(k || 'Unspecified', 0, 0, v);
    }

    const value = (t: Totals) =>
      metric === 'sales' ? t.sales
      : metric === 'units' ? t.units
      : t.sales - t.cost;                       // margin ranks by profit in RM

    return Object.entries(totals)
      .map(([name, t]) => ({
        name,
        ...t,
        units: Math.round(t.units),
        profit: t.sales - t.cost,
        marginPct: t.sales ? ((t.sales - t.cost) / t.sales) * 100 : 0,
        value: value(t),
      }))
      .filter((r) => r.sales !== 0 || r.units !== 0)
      .sort((a, b) => b.value - a.value);
  }, [outlets, board, metric, scope]);

  const top = rows.length ? Math.max(...rows.map((r) => Math.abs(r.value))) : 0;
  const grand = rows.reduce((s, r) => s + r.value, 0);

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
          Load a sales report from the Dashboard first — the leaderboards are calculated from it.
        </p>
      </div>
    );
  }

  const activeBoard = BOARDS.find((b) => b.id === board)!;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <header>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
          <Trophy className="text-slate-400" size={36} />
          Leaderboards
        </h1>
        <p className="text-slate-500 font-medium mt-1">
          Who and what sells most — ranked largest first, from your loaded sales report.
        </p>
      </header>

      {/* Board tabs */}
      <div className="flex flex-wrap gap-2">
        {BOARDS.map((b) => (
          <button
            key={b.id}
            onClick={() => setBoard(b.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              board === b.id
                ? 'bg-[#0f172a] text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >{b.label}</button>
        ))}
      </div>

      {/* Metric + scope */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Outlet</label>
          <select
            value={board === 'outlet' ? 'ALL' : scope}
            disabled={board === 'outlet'}
            onChange={(e) => setScope(e.target.value)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="ALL">All outlets</option>
            {outlets.map((o) => <option key={o.code} value={o.code}>{o.code}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
          {(['sales', 'units', 'margin'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors capitalize cursor-pointer ${
                metric === m ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
              }`}
            >{m}</button>
          ))}
        </div>
      </div>

      {/* Scope summary */}
      <div className="bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 rounded-[24px] text-white">
        <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-1">
          {activeBoard.label} board — {metric === 'margin' ? 'total profit' : `total ${metric}`}
          {board !== 'outlet' && scope !== 'ALL' ? ` · ${scope}` : ''}
        </p>
        <p className="text-3xl md:text-4xl font-bold tracking-tight">
          {metric === 'units' ? `${grand.toLocaleString()} units` : money(grand)}
        </p>
        <p className="text-slate-400 text-sm font-medium mt-1">
          {rows.length} {activeBoard.label.toLowerCase()}
          {rows.length === 1 ? '' : 's'} · {activeBoard.hint}
        </p>
      </div>

      {/* Ranking */}
      <div className="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden">
        {rows.map((r, i) => {
          const width = top ? (Math.abs(r.value) / top) * 100 : 0;
          const negative = r.value < 0;
          return (
            <div key={r.name} className={`flex items-center gap-4 p-4 ${i ? 'border-t border-slate-50' : ''}`}>
              <span className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                i < 3 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
              }`}>{i + 1}</span>

              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900 text-sm truncate">{r.name}</p>
                <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden max-w-sm">
                  <div
                    className={`h-full rounded-full ${negative ? 'bg-rose-500' : 'bg-slate-900'}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>

              <div className="text-right shrink-0">
                {metric === 'units' ? (
                  <>
                    <p className="font-bold text-slate-900 text-sm whitespace-nowrap">{r.units.toLocaleString()} units</p>
                    <p className="text-xs text-slate-400 font-medium">{money(r.sales)}</p>
                  </>
                ) : metric === 'margin' ? (
                  <>
                    <p className={`font-bold text-sm whitespace-nowrap ${negative ? 'text-rose-600' : 'text-slate-900'}`}>
                      {money(r.profit)}
                    </p>
                    <p className="text-xs text-slate-400 font-medium">{r.marginPct.toFixed(1)}% margin</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-slate-900 text-sm whitespace-nowrap">{money(r.sales)}</p>
                    <p className="text-xs text-slate-400 font-medium">{r.units.toLocaleString()} units</p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {board === 'vendor' && (
        <p className="text-xs text-slate-400 font-medium px-1">
          Vendor codes are shown as they appear in the POS export (e.g. SW = Swatch Group,
          MPT SB = in-house service). A code-to-name list can be added if one exists.
        </p>
      )}
    </div>
  );
}
