'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  listReportBranches, listBrands, listBrandFigures, listSalesmanFigures, listAllSalesmen,
  todayMY, monthOf,
  type ReportBranch, type ReportBrand, type BrandFigure, type SalesmanFigure,
} from '@/lib/daily-report';
import { EntryTab } from './_components/EntryTab';
import { MonthlyTab } from './_components/MonthlyTab';
import { SetupTab } from './_components/SetupTab';

export type Salesman = { id: string; full_name: string; is_active: boolean };
type Tab = 'entry' | 'monthly' | 'setup';
const TABS: { id: Tab; label: string }[] = [
  { id: 'entry', label: 'Daily entry' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'setup', label: 'Setup' },
];

// Who may do what is decided by Postgres RLS (supabase/migrations/daily_report.sql);
// these flags only decide what to SHOW, so nobody is offered a button that the
// database would then refuse.
export default function DailyReportPage() {
  const { profile } = useAuth();
  const role = profile?.role;
  const isStaff = role === 'staff';
  const canEnter = role === 'staff' || role === 'manager';
  const canEditBrands = true;                     // management anywhere, staff for their own branch
  const canManageSalesmen = role !== 'staff';     // staff_members is management-only

  const [branches, setBranches] = useState<ReportBranch[]>([]);
  const [branch, setBranch] = useState('');
  const [date, setDate] = useState(todayMY());
  const [tab, setTab] = useState<Tab>('entry');

  const [brands, setBrands] = useState<ReportBrand[]>([]);
  const [salesmen, setSalesmen] = useState<Salesman[]>([]);
  const [brandFigures, setBrandFigures] = useState<BrandFigure[]>([]);
  const [salesmanFigures, setSalesmanFigures] = useState<SalesmanFigure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Staff are fixed to their own branch; management picks one.
  useEffect(() => {
    if (!profile) return;
    if (isStaff) { setBranch(profile.branch_code ?? ''); return; }
    listReportBranches().then((b) => {
      setBranches(b);
      setBranch((cur) => cur || b[0]?.code || '');
    }).catch((e) => setError(e.message));
  }, [profile, isStaff]);

  const month = monthOf(date);

  const reload = useCallback(async () => {
    if (!branch) return;
    setLoading(true);
    setError(null);
    try {
      const [b, s, bf, sf] = await Promise.all([
        listBrands(branch), listAllSalesmen(branch),
        listBrandFigures(branch, month), listSalesmanFigures(branch, month),
      ]);
      setBrands(b); setSalesmen(s); setBrandFigures(bf); setSalesmanFigures(sf);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the report.');
    } finally {
      setLoading(false);
    }
  }, [branch, month]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4 mb-5">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-slate-900">Daily Report</h1>
          <p className="text-sm text-slate-500">
            {branch ? `Branch ${branch}` : 'Loading…'}
            {!canEnter && ' · view only'}
          </p>
        </div>
        {!isStaff && (
          <label className="block">
            <span className="block text-xs font-semibold text-slate-500 mb-1">Branch</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
              {branches.map((b) => <option key={b.code} value={b.code}>{b.name ?? b.code}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="block text-xs font-semibold text-slate-500 mb-1">Date</span>
          <input type="date" value={date} max={todayMY()} required
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
        </label>
      </div>

      <div className="flex gap-1 mb-5 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

      {!branch ? (
        <p className="text-sm text-slate-500 bg-white border border-slate-100 rounded-2xl p-6">
          This account has no branch assigned. Ask IT Admin to set one.
        </p>
      ) : loading && brands.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">Loading…</p>
      ) : tab === 'entry' ? (
        <EntryTab branch={branch} date={date} canEnter={canEnter}
          brands={brands} salesmen={salesmen} brandFigures={brandFigures}
          salesmanFigures={salesmanFigures} onSaved={reload} />
      ) : tab === 'monthly' ? (
        <MonthlyTab month={month} brands={brands} salesmen={salesmen}
          brandFigures={brandFigures} salesmanFigures={salesmanFigures}
          onPickDate={(d) => { setDate(d); setTab('entry'); }} />
      ) : (
        <SetupTab branch={branch} brands={brands} salesmen={salesmen}
          canEditBrands={canEditBrands} canManageSalesmen={canManageSalesmen} onChanged={reload} />
      )}
    </div>
  );
}
