'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Copy, Loader2, MessageCircle, Pencil, Save, Search, X } from 'lucide-react';
import {
  saveDailyReport, buildWhatsappSummary, rm,
  type ReportBrand, type BrandFigure, type SalesmanFigure,
} from '@/lib/daily-report';
import type { Salesman } from '../page';

type BrandDraft = Record<string, { rm: string; qty: string }>;
type SalesmanDraft = Record<string, string>;

const cell = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500';

// An empty box counts as 0; anything else must parse as a number >= 0.
const parse = (v: string) => (v.trim() === '' ? 0 : Number(v));
const badAmount = (v: string) => v.trim() !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0);
const badQty = (v: string) => badAmount(v) || (v.trim() !== '' && !Number.isInteger(Number(v)));

export function EntryTab(props: {
  branch: string; date: string; canEnter: boolean;
  brands: ReportBrand[]; salesmen: Salesman[];
  brandFigures: BrandFigure[]; salesmanFigures: SalesmanFigure[];
  onSaved: () => Promise<void>;
}) {
  const { branch, date, canEnter, brands, salesmen, brandFigures, salesmanFigures, onSaved } = props;

  const dayBrand = useMemo(() => brandFigures.filter((f) => f.sale_date === date), [brandFigures, date]);
  const daySalesman = useMemo(() => salesmanFigures.filter((f) => f.sale_date === date), [salesmanFigures, date]);

  const [brandDraft, setBrandDraft] = useState<BrandDraft>({});
  const [salesmanDraft, setSalesmanDraft] = useState<SalesmanDraft>({});
  // The flow is two steps: first tick the brands that sold, then key in RM and
  // quantity for only those. `selected` is the ticked brands, `step` the screen.
  const [selected, setSelected] = useState<string[]>([]);
  const [step, setStep] = useState<'pick' | 'enter'>('pick');
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Start every day's form from what is already saved for it, so re-opening a
  // day to correct it shows the real figures rather than a blank sheet. A day
  // that already has figures opens straight on the entry step, with its brands
  // ticked; an empty day opens on the brand picker.
  useEffect(() => {
    const b: BrandDraft = {};
    for (const f of dayBrand) {
      b[f.brand_id] = { rm: f.sales_amount ? String(f.sales_amount) : '', qty: f.quantity ? String(f.quantity) : '' };
    }
    const s: SalesmanDraft = {};
    for (const f of daySalesman) s[f.staff_id] = f.sales_amount ? String(f.sales_amount) : '';
    const ids = dayBrand.filter((f) => f.sales_amount > 0 || f.quantity > 0).map((f) => f.brand_id);
    setBrandDraft(b);
    setSalesmanDraft(s);
    setSelected(ids);
    setStep(ids.length > 0 || !canEnter ? 'enter' : 'pick');
    setFilter('');
    setMessage(null);
  }, [dayBrand, daySalesman, canEnter]);

  const toggleBrand = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // Un-ticking a brand clears its figures, so saving zeroes out anything that
  // was saved for it earlier (a correction, never a delete).
  const removeBrand = (id: string) => {
    setSelected((cur) => cur.filter((x) => x !== id));
    setBrandDraft((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  // Deactivated brands and salesmen stay visible on a day where they have
  // figures, so history is never hidden, but cannot be picked for new days.
  const pickable = brands.filter((b) =>
    (b.is_active || dayBrand.some((f) => f.brand_id === b.id)) &&
    b.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const selectedBrands = brands.filter((b) => selected.includes(b.id));
  const shownSalesmen = salesmen.filter((s) => s.is_active || daySalesman.some((f) => f.staff_id === s.id));

  const brandTotal = brands.reduce((sum, b) => sum + parse(brandDraft[b.id]?.rm ?? ''), 0);
  const brandQty = brands.reduce((sum, b) => sum + parse(brandDraft[b.id]?.qty ?? ''), 0);
  const salesmanTotal = salesmen.reduce((sum, s) => sum + parse(salesmanDraft[s.id] ?? ''), 0);
  const mismatch = brandTotal > 0 && salesmanTotal > 0 && Math.abs(brandTotal - salesmanTotal) > 0.005;

  const anyInvalid =
    Object.values(brandDraft).some((d) => badAmount(d.rm) || badQty(d.qty)) ||
    Object.values(salesmanDraft).some(badAmount);

  const handleSave = async () => {
    setMessage(null);
    if (anyInvalid) {
      setMessage({ ok: false, text: 'Fix the highlighted figures first: amounts must be 0 or more, and quantity a whole number.' });
      return;
    }
    // Send only what changed against what is saved: cheaper, and it keeps the
    // change history to real edits rather than one entry per untouched brand.
    const savedB = new Map(dayBrand.map((f) => [f.brand_id, f]));
    const savedS = new Map(daySalesman.map((f) => [f.staff_id, f]));
    const brandRows = brands.flatMap((b) => {
      const d = brandDraft[b.id];
      const old = savedB.get(b.id);
      const amount = parse(d?.rm ?? '');
      const qty = parse(d?.qty ?? '');
      if (!old && amount === 0 && qty === 0) return [];
      if (old && old.sales_amount === amount && old.quantity === qty) return [];
      return [{ brand_id: b.id, sales_amount: amount, quantity: qty }];
    });
    const salesmanRows = salesmen.flatMap((s) => {
      const old = savedS.get(s.id);
      const amount = parse(salesmanDraft[s.id] ?? '');
      if (!old && amount === 0) return [];
      if (old && old.sales_amount === amount) return [];
      return [{ staff_id: s.id, sales_amount: amount }];
    });
    if (brandRows.length === 0 && salesmanRows.length === 0) {
      setMessage({ ok: true, text: 'Nothing has changed.' });
      return;
    }

    setSaving(true);
    try {
      await saveDailyReport(branch, date, brandRows, salesmanRows);
      await onSaved();
      setMessage({ ok: true, text: 'Saved.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  // Built from the SAVED figures, not the draft, so what gets sent to the group
  // is exactly what the database holds.
  const summary = useMemo(() => buildWhatsappSummary({
    branchCode: branch, date,
    brands: brands.filter((b) => b.is_active || brandFigures.some((f) => f.brand_id === b.id && f.sale_date <= date && f.sales_amount > 0)),
    brandFigures, salesmen, salesmanFigures,
  }), [branch, date, brands, brandFigures, salesmen, salesmanFigures]);

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ ok: false, text: 'Could not copy. Select the text and copy it by hand.' });
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
      <div className="space-y-6">
        <section className="bg-white rounded-2xl border border-slate-100 p-5">
          {brands.length === 0 ? (
            <>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Sales by brand</h2>
              <p className="text-sm text-slate-500 py-2">No brands set up for this branch yet. Add them on the Setup tab.</p>
            </>
          ) : step === 'pick' ? (
            <>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mr-auto">1 · Which brands sold?</h2>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find brand"
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-sm w-40" />
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4">Tap every brand that sold on this day, then continue.</p>
              <div className="flex flex-wrap gap-2">
                {pickable.map((b) => {
                  const on = selected.includes(b.id);
                  return (
                    <button key={b.id} type="button" onClick={() => (on ? removeBrand(b.id) : toggleBrand(b.id))}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                      {on && <Check size={14} />}{b.name}
                      {!b.is_active && <span className="text-[10px] font-bold uppercase opacity-60">inactive</span>}
                    </button>
                  );
                })}
                {pickable.length === 0 && <p className="text-sm text-slate-400 py-2">No brand matches that search.</p>}
              </div>
              <button type="button" onClick={() => { setFilter(''); setStep('enter'); }} disabled={selected.length === 0}
                className="mt-5 w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors">
                Continue with {selected.length} brand{selected.length === 1 ? '' : 's'} <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mr-auto">
                  {canEnter ? '2 · RM and quantity' : 'Sales by brand'}
                </h2>
                {canEnter && (
                  <button type="button" onClick={() => setStep('pick')}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 underline">
                    <Pencil size={13} /> Change brands
                  </button>
                )}
              </div>
              {selectedBrands.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">No brand sales recorded for this day.</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  <div className={`grid gap-2 pb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wide ${canEnter ? 'grid-cols-[1fr_110px_70px_28px]' : 'grid-cols-[1fr_110px_70px]'}`}>
                    <span>Brand</span><span className="text-right">RM</span><span className="text-right">Qty</span>{canEnter && <span />}
                  </div>
                  {selectedBrands.map((b) => {
                    const d = brandDraft[b.id] ?? { rm: '', qty: '' };
                    const set = (patch: Partial<{ rm: string; qty: string }>) =>
                      setBrandDraft((prev) => ({ ...prev, [b.id]: { ...d, ...patch } }));
                    return (
                      <div key={b.id} className={`grid gap-2 py-1.5 items-center ${canEnter ? 'grid-cols-[1fr_110px_70px_28px]' : 'grid-cols-[1fr_110px_70px]'}`}>
                        <span className="text-sm font-medium text-slate-700 truncate">
                          {b.name}{!b.is_active && <span className="ml-1.5 text-[10px] font-bold text-slate-400 uppercase">inactive</span>}
                        </span>
                        <input inputMode="decimal" value={d.rm} disabled={!canEnter} placeholder="0.00"
                          onChange={(e) => set({ rm: e.target.value })}
                          className={`${cell} ${badAmount(d.rm) ? 'border-red-400 bg-red-50' : ''}`} />
                        <input inputMode="numeric" value={d.qty} disabled={!canEnter} placeholder="0"
                          onChange={(e) => set({ qty: e.target.value })}
                          className={`${cell} ${badQty(d.qty) ? 'border-red-400 bg-red-50' : ''}`} />
                        {canEnter && (
                          <button type="button" aria-label={`Remove ${b.name}`} onClick={() => removeBrand(b.id)}
                            className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"><X size={16} /></button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-100 p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">{canEnter ? "3 · " : ""}Who sold (each salesman&apos;s total for the day)</h2>
          <p className="text-xs text-slate-400 mb-4">Enter the RM each salesman sold in total. This is checked against the brand total.</p>
          {shownSalesmen.length === 0 ? (
            <p className="text-sm text-slate-500">No salesmen are set up for this branch yet. A manager can add them on the Setup tab.</p>
          ) : (
            <div className="space-y-2">
              {shownSalesmen.map((s) => (
                <div key={s.id} className="grid grid-cols-[1fr_110px] gap-2 items-center">
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {s.full_name}{!s.is_active && <span className="ml-1.5 text-[10px] font-bold text-slate-400 uppercase">inactive</span>}
                  </span>
                  <input inputMode="decimal" value={salesmanDraft[s.id] ?? ''} disabled={!canEnter} placeholder="0.00"
                    onChange={(e) => setSalesmanDraft((prev) => ({ ...prev, [s.id]: e.target.value }))}
                    className={`${cell} ${badAmount(salesmanDraft[s.id] ?? '') ? 'border-red-400 bg-red-50' : ''}`} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6">
        <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide">This day</h2>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between"><dt className="text-slate-500">Brands total</dt><dd className="font-bold tabular-nums">RM {rm(brandTotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Items sold</dt><dd className="font-bold tabular-nums">{brandQty}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Salesmen total</dt><dd className="font-bold tabular-nums">RM {rm(salesmanTotal)}</dd></div>
          </dl>
          {mismatch && (
            <p className="flex gap-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Brands and salesmen differ by RM {rm(Math.abs(brandTotal - salesmanTotal))}. You can still save, but check both.
            </p>
          )}
          {message && (
            <p className={`text-xs font-medium rounded-xl px-3 py-2 border ${message.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
              {message.text}
            </p>
          )}
          {canEnter && (
            <button onClick={handleSave} disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-60 transition-colors">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Saving…' : 'Save day'}
            </button>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide">WhatsApp summary</h2>
          <pre className="text-xs text-slate-700 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap max-h-72 overflow-auto font-mono">{summary}</pre>
          <div className="flex gap-2">
            <button onClick={copySummary}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
              {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(summary)}`} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
              <MessageCircle size={15} /> WhatsApp
            </a>
          </div>
          <p className="text-[11px] text-slate-400">Built from the saved figures. Save first if you have just changed something.</p>
        </section>
      </aside>
    </div>
  );
}
