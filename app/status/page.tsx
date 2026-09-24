'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Logo } from '@/components/logo';
import { supabase } from '@/lib/supabase';
import { STATUS_LABELS, type JobStatus } from '@/lib/repairs';

// The customer-facing page the QR code on the printed slip points to.
// Deliberately a SIBLING of /, /dashboard, /repairs — not nested under
// app/repairs/, and so NOT behind the login guard those layouts apply. A
// customer checking their own watch's status must not need an account.
//
// What makes this safe rather than a hole: the ONLY thing this page calls is
// get_job_status_by_token, a narrowly-scoped Postgres function that returns a
// small, fixed set of columns for exactly the one job matching an
// unguessable token — never the customer's phone number, the fee, or any
// free-text field. See the migration comment on that function before ever
// widening what it returns.
type PublicStatus = {
  job_no: string;
  status: JobStatus;
  brand: string | null;
  model_no: string | null;
  promised_ready_date: string | null;
  updated_at: string;
};

export default function StatusPage() {
  return (
    <Suspense fallback={null}>
      <StatusPageInner />
    </Suspense>
  );
}

function StatusPageInner() {
  const token = useSearchParams().get('token');
  const [result, setResult] = useState<PublicStatus | 'not_found' | 'loading'>('loading');

  useEffect(() => {
    if (!token) { setResult('not_found'); return; }
    supabase.rpc('get_job_status_by_token', { p_token: token }).then(({ data, error }) => {
      const row = Array.isArray(data) ? data[0] : null;
      setResult(error || !row ? 'not_found' : (row as PublicStatus));
    });
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      <div className="w-full max-w-sm bg-white rounded-[24px] shadow-xl shadow-slate-200/50 border border-slate-100 p-8 text-center">
        <div className="flex justify-center mb-6"><Logo textClassName="text-xl" /></div>

        {result === 'loading' && <p className="text-sm text-slate-400">Checking…</p>}

        {result === 'not_found' && (
          <p className="text-sm text-slate-500">
            We couldn't find a repair job for this link. Please check the QR
            code or contact the branch you left your watch at.
          </p>
        )}

        {result !== 'loading' && result !== 'not_found' && (
          <>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Job No.</p>
            <p className="font-mono text-lg font-bold text-slate-900 mb-4">{result.job_no}</p>
            <div className="inline-block px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold mb-4">
              {STATUS_LABELS[result.status]}
            </div>
            {(result.brand || result.model_no) && (
              <p className="text-sm text-slate-500 mb-1">{[result.brand, result.model_no].filter(Boolean).join(' ')}</p>
            )}
            {result.promised_ready_date && (
              <p className="text-xs text-slate-400">
                Promised by {new Date(result.promised_ready_date).toLocaleDateString()}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-4">
              Last updated {new Date(result.updated_at).toLocaleString()}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
