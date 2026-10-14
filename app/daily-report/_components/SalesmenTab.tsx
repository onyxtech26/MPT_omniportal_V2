'use client';

import { useState } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { addSalesman, renameSalesman, setSalesmanActive } from '@/lib/daily-report';
import type { Salesman } from '../page';

// Phones get >= 40px tap targets on the small icon and text buttons; desktop keeps its compact sizes.
const tap = 'max-sm:inline-flex max-sm:items-center max-sm:justify-center max-sm:h-10 max-sm:min-w-10';
const input = 'px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400';

// The branch's salesmen. They are only ever deactivated, never deleted, so a
// leaver's name still shows on the past days it appears in. The same list feeds
// the Repairs intake form, so a deactivated salesman disappears there too.
export function SalesmenTab(props: {
  branch: string; salesmen: Salesman[]; canManage: boolean; onChanged: () => Promise<void>;
}) {
  const { branch, salesmen, canManage, onChanged } = props;
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); await onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save that change.'); }
  };

  return (
    <section className="max-w-xl bg-white rounded-2xl border border-slate-100 p-5">
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Salesmen · {branch}</h2>
      <p className="text-xs text-slate-400 mb-4">
        Removing a salesman hides them from new entries and from Repairs, but their name stays on past days.
      </p>
      {error && <p className="mb-3 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}
      {canManage ? (
        <form className="flex gap-2 mb-4" onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(async () => { await addSalesman(branch, name); setName(''); });
        }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" maxLength={80} className={`${input} flex-1 min-w-0`} />
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700"><Plus size={15} /> Add</button>
        </form>
      ) : (
        <p className="text-xs text-slate-400 mb-3">View only. Outlet staff and IT Admin manage this list.</p>
      )}
      <ul className="divide-y divide-slate-50">
        {salesmen.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2">
            {editing === s.id ? (
              <>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} className={`${input} flex-1 min-w-0 py-1.5`} autoFocus />
                <button aria-label="Save name" onClick={() => draft.trim() && run(async () => { await renameSalesman(s.id, draft); setEditing(null); })}
                  className={`p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 ${tap}`}><Check size={16} /></button>
                <button aria-label="Cancel" onClick={() => setEditing(null)} className={`p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 ${tap}`}><X size={16} /></button>
              </>
            ) : (
              <>
                <span className={`flex-1 min-w-0 break-words text-sm ${s.is_active ? 'text-slate-800 font-medium' : 'text-slate-400 line-through'}`}>{s.full_name}</span>
                {canManage && (
                  <>
                    <button aria-label={`Rename ${s.full_name}`} onClick={() => { setEditing(s.id); setDraft(s.full_name); }}
                      className={`p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0 ${tap}`}><Pencil size={14} /></button>
                    <button onClick={() => run(() => setSalesmanActive(s.id, !s.is_active))}
                      className={`text-xs font-semibold underline shrink-0 ${tap} ${s.is_active ? 'text-red-600 hover:text-red-800' : 'text-slate-500 hover:text-slate-900'}`}>
                      {s.is_active ? 'Remove' : 'Reactivate'}
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
        {salesmen.length === 0 && <li className="text-sm text-slate-400 py-3">No salesmen yet.</li>}
      </ul>
    </section>
  );
}
