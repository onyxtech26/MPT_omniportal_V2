'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { listAuditLog, type AuditEntry } from '@/lib/admin';

const ACTION_LABELS: Record<string, string> = {
  account_created: 'Account created',
  password_reset: 'Password reset',
  profile_updated: 'Account changed',
};

// Read-only, on purpose — there is no edit or delete anywhere in this UI
// because there is no UPDATE/DELETE grant on admin_audit_log for ANY role,
// admin included (see the migration). A log an administrator can rewrite
// is not a log; this page cannot even offer the button.
export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAuditLog().then(setEntries).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
          <ShieldAlert size={18} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500">
            Account administration only — read-only, append-only, nobody can edit or remove an entry.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-12 text-center">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">No account-administration actions recorded yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50">
          {entries.map((e) => (
            <div key={e.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{ACTION_LABELS[e.action] ?? e.action}</span>
                <span className="text-xs text-slate-400">{new Date(e.at).toLocaleString()}</span>
              </div>
              {e.details && Object.keys(e.details).length > 0 && (
                <pre className="mt-1 text-xs text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5 overflow-x-auto">
                  {JSON.stringify(e.details, null, 0)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
