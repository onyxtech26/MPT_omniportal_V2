'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, KeyRound, Power, Copy, Check, X } from 'lucide-react';
import {
  listProfiles, setProfileActive, listBranchesAdmin, createAccount, resetAccountPassword,
  type Profile, type Branch,
} from '@/lib/admin';
import { ROLE_LABELS, type Role } from '@/lib/roles';

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [p, b] = await Promise.all([listProfiles(), listBranchesAdmin()]);
      setProfiles(p);
      setBranches(b);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleToggleActive = async (p: Profile) => {
    setBusyId(p.id);
    setError(null);
    try {
      await setProfileActive(p.id, !p.is_active);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReset = async (p: Profile) => {
    setBusyId(p.id);
    setError(null);
    try {
      const { temporary_password } = await resetAccountPassword(p.id);
      setRevealed({ email: p.email ?? p.display_name, password: temporary_password });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Accounts</h1>
          <p className="text-sm text-slate-500">{profiles.length} account{profiles.length === 1 ? '' : 's'}</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors">
          <Plus size={16} /> New Account
        </button>
      </div>

      {error && <p className="mb-4 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400 py-12 text-center">Loading…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-semibold text-slate-900">{p.display_name}</td>
                    <td className="px-4 py-3 text-slate-500">{p.email ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{ROLE_LABELS[p.role]}</td>
                    <td className="px-4 py-3 text-slate-600">{p.branch_code ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {p.is_active ? 'Active' : 'Disabled'}
                        </span>
                        {p.must_change_password && (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                            Password pending
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleReset(p)} disabled={busyId === p.id}
                          title="Reset password" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-50">
                          <KeyRound size={15} />
                        </button>
                        <button onClick={() => handleToggleActive(p)} disabled={busyId === p.id}
                          title={p.is_active ? 'Disable account' : 'Re-enable account'}
                          className={`p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50 ${p.is_active ? 'text-red-500' : 'text-emerald-600'}`}>
                          <Power size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateAccountModal branches={branches} onClose={() => setShowCreate(false)}
          onCreated={(result) => { setShowCreate(false); setRevealed({ email: result.email, password: result.temporary_password }); reload(); }} />
      )}

      {revealed && <RevealPasswordModal email={revealed.email} password={revealed.password} onClose={() => setRevealed(null)} />}
    </div>
  );
}

function CreateAccountModal({ branches, onClose, onCreated }: {
  branches: Branch[]; onClose: () => void;
  onCreated: (result: { email: string; temporary_password: string }) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [branchCode, setBranchCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await createAccount({
        email: email.trim(), role, displayName: displayName.trim(),
        branchCode: role === 'staff' ? branchCode : undefined,
      });
      onCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-900">New Account</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Display name">
            <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. branch code, or role name" className={inputClass} />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => { setRole(e.target.value as Role); setBranchCode(''); }} className={inputClass}>
              <option value="staff">Retail Staff</option>
              <option value="manager">Manager</option>
              <option value="boss">Boss / Director</option>
              <option value="admin">IT Admin</option>
            </select>
          </Field>
          {role === 'staff' && (
            <Field label="Branch">
              <select required value={branchCode} onChange={(e) => setBranchCode(e.target.value)} className={inputClass}>
                <option value="">Select branch…</option>
                {branches.filter((b) => b.is_active).map((b) => <option key={b.code} value={b.code}>{b.name ?? b.code}</option>)}
              </select>
            </Field>
          )}
          {error && <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={submitting}
            className="w-full mt-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white disabled:opacity-50">
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

function RevealPasswordModal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
        <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-2">Shown once — will not be shown again</p>
        <p className="text-sm text-slate-500 mb-1">Temporary password for</p>
        <p className="font-semibold text-slate-900 mb-4">{email}</p>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4">
          <code className="flex-1 font-mono text-sm text-slate-900 text-left">{password}</code>
          <button onClick={copy} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500">
            {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Relay this to the account holder out of band (in person, or by phone — not written down anywhere permanent).
          They'll be asked to set their own password the moment they sign in.
        </p>
        <button onClick={onClose} className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white">Done</button>
      </div>
    </div>
  );
}

const inputClass = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</span>{children}</label>;
}
