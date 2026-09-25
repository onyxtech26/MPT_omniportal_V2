'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, X } from 'lucide-react';
import {
  addBrand, renameBrand, setBrandActive, deleteBrand, reorderBrands, addSalesman, setSalesmanActive,
  type ReportBrand,
} from '@/lib/daily-report';
import type { Salesman } from '../page';

const input = 'px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400';

// A brand can be deleted only if it has never been used: the database refuses to
// delete one with sales recorded, so history is never erased (that case offers
// Deactivate instead). Salesmen are only ever deactivated, never deleted, so a
// leaver's name still resolves on the past days it appears in.
export function SetupTab(props: {
  branch: string; brands: ReportBrand[]; salesmen: Salesman[];
  canEditBrands: boolean; canManageSalesmen: boolean;
  onChanged: () => Promise<void>;
}) {
  const { branch, brands, salesmen, canEditBrands, canManageSalesmen, onChanged } = props;
  const [error, setError] = useState<string | null>(null);
  const [newBrand, setNewBrand] = useState('');
  const [newSalesman, setNewSalesman] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); await onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save that change.'); }
  };

  // A brand that already has sales cannot be deleted (that would erase history),
  // so the screen offers to deactivate it instead.
  const [inUse, setInUse] = useState<ReportBrand | null>(null);
  const handleDelete = async (b: ReportBrand) => {
    if (!window.confirm(`Delete "${b.name}"? This cannot be undone.`)) return;
    setError(null);
    setInUse(null);
    try {
      const result = await deleteBrand(b.id);
      if (result === 'in_use') setInUse(b);
      else await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that brand.');
    }
  };

  const nextOrder = brands.reduce((m, b) => Math.max(m, b.sort_order), 0) + 1;

  // Moves one brand a step up or down. The whole list is renumbered in one go
  // (see reorderBrands), and `moving` blocks a second tap until the first has
  // landed, so two quick taps cannot race each other into a wrong order.
  const [moving, setMoving] = useState(false);
  const move = async (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= brands.length) return;
    const ids = brands.map((b) => b.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setMoving(true);
    await run(() => reorderBrands(branch, ids));
    setMoving(false);
  };

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      {error && <p className="md:col-span-2 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

      <section className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Brands · {branch}</h2>
        {canEditBrands && (
          <form className="flex gap-2 mb-4" onSubmit={(e) => {
            e.preventDefault();
            if (!newBrand.trim()) return;
            run(async () => { await addBrand(branch, newBrand, nextOrder); setNewBrand(''); });
          }}>
            <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="New brand" maxLength={60} className={`${input} flex-1`} />
            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700"><Plus size={15} /> Add</button>
          </form>
        )}
        {inUse && (
          <div className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
            <p><strong>{inUse.name}</strong> already has sales recorded, so it can&apos;t be deleted without erasing that history.</p>
            <div className="flex gap-3 mt-1.5">
              <button className="font-semibold underline" onClick={() => { const b = inUse; setInUse(null); run(() => setBrandActive(b.id, false)); }}>
                Deactivate it instead
              </button>
              <button className="font-semibold underline text-slate-500" onClick={() => setInUse(null)}>Cancel</button>
            </div>
          </div>
        )}
        <ul className="divide-y divide-slate-50">
          {brands.map((b, i) => (
            <li key={b.id} className="flex items-center gap-2 py-2">
              {canEditBrands && editing !== b.id && (
                <span className="flex flex-col -my-1">
                  <button aria-label={`Move ${b.name} up`} disabled={moving || i === 0} onClick={() => move(i, -1)}
                    className="p-0.5 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-25 disabled:hover:bg-transparent"><ArrowUp size={14} /></button>
                  <button aria-label={`Move ${b.name} down`} disabled={moving || i === brands.length - 1} onClick={() => move(i, 1)}
                    className="p-0.5 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-25 disabled:hover:bg-transparent"><ArrowDown size={14} /></button>
                </span>
              )}
              {editing === b.id ? (
                <>
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} className={`${input} flex-1 py-1.5`} autoFocus />
                  <button aria-label="Save name" onClick={() => run(async () => { await renameBrand(b.id, draft); setEditing(null); })}
                    className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50"><Check size={16} /></button>
                  <button aria-label="Cancel" onClick={() => setEditing(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X size={16} /></button>
                </>
              ) : (
                <>
                  <span className={`flex-1 text-sm ${b.is_active ? 'text-slate-800 font-medium' : 'text-slate-400 line-through'}`}>{b.name}</span>
                  {canEditBrands && (
                    <>
                      <button aria-label={`Rename ${b.name}`} onClick={() => { setEditing(b.id); setDraft(b.name); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={14} /></button>
                      {!b.is_active && (
                        <button onClick={() => run(() => setBrandActive(b.id, true))}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline">Reactivate</button>
                      )}
                      <button onClick={() => handleDelete(b)}
                        className="text-xs font-semibold text-red-600 hover:text-red-800 underline">Delete</button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
          {brands.length === 0 && <li className="text-sm text-slate-400 py-3">No brands yet.</li>}
        </ul>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Salesmen · {branch}</h2>
        {canManageSalesmen ? (
          <form className="flex gap-2 mb-4" onSubmit={(e) => {
            e.preventDefault();
            if (!newSalesman.trim()) return;
            run(async () => { await addSalesman(branch, newSalesman); setNewSalesman(''); });
          }}>
            <input value={newSalesman} onChange={(e) => setNewSalesman(e.target.value)} placeholder="Full name" className={`${input} flex-1`} />
            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700"><Plus size={15} /> Add</button>
          </form>
        ) : (
          <p className="text-xs text-slate-400 mb-3">Only a manager can add or remove salesmen. Ask yours if someone is missing.</p>
        )}
        <ul className="divide-y divide-slate-50">
          {salesmen.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2">
              <span className={`flex-1 text-sm ${s.is_active ? 'text-slate-800 font-medium' : 'text-slate-400 line-through'}`}>{s.full_name}</span>
              {canManageSalesmen && (
                <button onClick={() => run(() => setSalesmanActive(s.id, !s.is_active))}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline">{s.is_active ? 'Deactivate' : 'Reactivate'}</button>
              )}
            </li>
          ))}
          {salesmen.length === 0 && <li className="text-sm text-slate-400 py-3">No salesmen yet.</li>}
        </ul>
      </section>
    </div>
  );
}
