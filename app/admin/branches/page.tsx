'use client';

import { useEffect, useState, useCallback } from 'react';
import { Check, X, Pencil } from 'lucide-react';
import { listBranchesAdmin, setBranchActive, setBranchName, type Branch } from '@/lib/admin';

// All 14 codes from the POS export are already seeded (see
// docs/REPAIR_MODULE_SPEC.md §6) — 12 active, CS and HQ inactive. This page
// lets IT Admin add a real display name and reactivate/retire a branch;
// it does not add or remove codes, since those come from the POS system,
// not from this app.
export default function AdminBranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setBranches(await listBranchesAdmin()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const toggleActive = async (b: Branch) => {
    setError(null);
    try { await setBranchActive(b.code, !b.is_active); await reload(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update.'); }
  };

  const saveName = async (code: string) => {
    setError(null);
    try { await setBranchName(code, nameDraft.trim()); setEditing(null); await reload(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update.'); }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Branches</h1>
        <p className="text-sm text-slate-500">{branches.filter((b) => b.is_active).length} active of {branches.length}</p>
      </div>

      {error && <p className="mb-4 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400 py-12 text-center">Loading…</p>
      ) : (
        <>
        {/* Phones: one card per branch, with the rename and activate controls
            as full-size buttons instead of a four-column table. */}
        <ul className="sm:hidden space-y-2">
          {branches.map((b) => (
            <li key={b.code} className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-slate-700">{b.code}</span>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${b.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {b.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {editing === b.code ? (
                <div className="mt-2 flex items-center gap-2">
                  <input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} aria-label="Branch name"
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                  <button onClick={() => saveName(b.code)} aria-label="Save name" className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 text-emerald-600"><Check size={18} /></button>
                  <button onClick={() => setEditing(null)} aria-label="Cancel" className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400"><X size={18} /></button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-600 break-words">{b.name ?? <span className="text-slate-400 italic">no name set</span>}</p>
              )}
              {editing !== b.code && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => { setEditing(b.code); setNameDraft(b.name ?? ''); }}
                    className="flex items-center justify-center gap-1.5 min-h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-600">
                    <Pencil size={14} /> Rename
                  </button>
                  <button onClick={() => toggleActive(b)}
                    className="min-h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-600">
                    {b.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="hidden sm:block bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.code} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-700">{b.code}</td>
                  <td className="px-4 py-3">
                    {editing === b.code ? (
                      <div className="flex items-center gap-1.5">
                        <input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
                          className="px-2 py-1 rounded-lg border border-slate-200 text-sm w-40" />
                        <button onClick={() => saveName(b.code)} className="p-1.5 hover:bg-slate-100 rounded-lg text-emerald-600"><Check size={14} /></button>
                        <button onClick={() => setEditing(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><X size={14} /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditing(b.code); setNameDraft(b.name ?? ''); }}
                        className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 group">
                        {b.name ?? <span className="text-slate-400 italic">no name set</span>}
                        <Pencil size={12} className="opacity-0 group-hover:opacity-100" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${b.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {b.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => toggleActive(b)} className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline">
                      {b.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
