'use client';

import { useMemo } from 'react';
import { rm, type ReportBrand, type BrandFigure, type SalesmanFigure } from '@/lib/daily-report';
import type { Salesman } from '../page';

// Read-only roll-up of the month. To CORRECT a figure, tap its day: that opens
// the Daily entry tab on that date. There is deliberately no second place to
// edit numbers, so a total can never disagree with the days that make it up.
export function MonthlyTab(props: {
  month: string;
  brands: ReportBrand[]; salesmen: Salesman[];
  brandFigures: BrandFigure[]; salesmanFigures: SalesmanFigure[];
  onPickDate: (date: string) => void;
}) {
  const { month, brands, salesmen, brandFigures, salesmanFigures, onPickDate } = props;

  const days = useMemo(() => {
    const byDate = new Map<string, { rm: number; qty: number; salesmen: number }>();
    const row = (d: string) => byDate.get(d) ?? { rm: 0, qty: 0, salesmen: 0 };
    for (const f of brandFigures) {
      const r = row(f.sale_date);
      byDate.set(f.sale_date, { ...r, rm: r.rm + f.sales_amount, qty: r.qty + f.quantity });
    }
    for (const f of salesmanFigures) {
      const r = row(f.sale_date);
      byDate.set(f.sale_date, { ...r, salesmen: r.salesmen + f.sales_amount });
    }
    return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [brandFigures, salesmanFigures]);

  const totalRM = brandFigures.reduce((s, f) => s + f.sales_amount, 0);
  const totalQty = brandFigures.reduce((s, f) => s + f.quantity, 0);

  const brandTotals = brands
    .map((b) => {
      const mine = brandFigures.filter((f) => f.brand_id === b.id);
      return { name: b.name, rm: mine.reduce((s, f) => s + f.sales_amount, 0), qty: mine.reduce((s, f) => s + f.quantity, 0) };
    })
    .filter((b) => b.rm > 0 || b.qty > 0)
    .sort((a, b) => b.rm - a.rm);

  const salesmanTotals = salesmen
    .map((s) => ({ name: s.full_name, rm: salesmanFigures.filter((f) => f.staff_id === s.id).reduce((sum, f) => sum + f.sales_amount, 0) }))
    .filter((s) => s.rm > 0)
    .sort((a, b) => b.rm - a.rm);

  const monthLabel = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1)
    .toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Sales', `RM ${rm(totalRM)}`],
          ['Items sold', String(totalQty)],
          ['Days reported', String(days.length)],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums mt-1">{value}</p>
            {label === 'Sales' && <p className="text-xs text-slate-400">{monthLabel}</p>}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <section className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide px-5 pt-5 pb-3">By day</h2>
          {days.length === 0 ? (
            <p className="text-sm text-slate-500 px-5 pb-5">Nothing has been reported this month yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                  <th className="px-5 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Brands RM</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-5 py-2 text-right">Salesmen RM</th>
                </tr>
              </thead>
              <tbody>
                {days.map(([d, r]) => {
                  const off = r.rm > 0 && r.salesmen > 0 && Math.abs(r.rm - r.salesmen) > 0.005;
                  return (
                    <tr key={d} onClick={() => onPickDate(d)} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer">
                      <td className="px-5 py-2.5 font-medium text-slate-700">{d.slice(8)}/{d.slice(5, 7)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rm(r.rm)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.qty}</td>
                      <td className={`px-5 py-2.5 text-right tabular-nums ${off ? 'text-amber-700 font-semibold' : ''}`}>
                        {r.salesmen ? rm(r.salesmen) : '-'}{off && ' ⚠'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <div className="space-y-6">
          <section className="bg-white rounded-2xl border border-slate-100 p-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">By brand</h2>
            {brandTotals.length === 0 ? <p className="text-sm text-slate-400">No figures yet.</p> : (
              <ul className="space-y-1.5 text-sm">
                {brandTotals.map((b) => (
                  <li key={b.name} className="flex justify-between gap-3">
                    <span className="text-slate-700 truncate">{b.name}</span>
                    <span className="tabular-nums text-slate-900 font-semibold shrink-0">RM {rm(b.rm)} <span className="text-slate-400 font-normal">· {b.qty}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="bg-white rounded-2xl border border-slate-100 p-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">By salesman</h2>
            {salesmanTotals.length === 0 ? <p className="text-sm text-slate-400">No figures yet.</p> : (
              <ul className="space-y-1.5 text-sm">
                {salesmanTotals.map((s) => (
                  <li key={s.name} className="flex justify-between gap-3">
                    <span className="text-slate-700 truncate">{s.name}</span>
                    <span className="tabular-nums text-slate-900 font-semibold shrink-0">RM {rm(s.rm)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <p className="text-xs text-slate-400">Tap a day to open and correct it. A ⚠ means that day&apos;s brand total and salesman total differ.</p>
    </div>
  );
}
