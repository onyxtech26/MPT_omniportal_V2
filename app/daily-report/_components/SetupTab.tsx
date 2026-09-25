'use client';

import { useState } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
import {
  addBrand, renameBrand, setBrandActive, addSalesman, setSalesmanActive,
  type ReportBrand,
} from '@/lib/daily-report';
import type { Salesman } from '../page';

const input = 'px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400';

// Brands and salesmen are only ever deactivated, never deleted (the database
// grants no DELETE at all), so a brand or a leaver's name still resolves on the
// past days it appears in.
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

  const nextOrder = brands.reduce((m, b) => Math.max(m, b.sort_order), 0) + 1;

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
        <ul className="divide-y divide-slate-50">
          {brands.map((b) => (
            <li key={b.id} className="flex items-center gap-2 py-2">
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
                      <button onClick={() => run(() => setBrandActive(b.id, !b.is_active))}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline">{b.is_active ? 'Deactivate' : 'Reactivate'}</button>
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
