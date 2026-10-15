'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Logo } from '@/components/logo';
import { supabase } from '@/lib/supabase';
import { STATUS_LABELS, type JobStatus, type WarrantyDeclaration } from '@/lib/repairs';

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
//
// The page is also the customer's copy of their intake record. That comes
// from a second, separate function, get_intake_record_by_token
// (supabase/migrations/repair_customer_copy.sql): still never the phone
// number or the money. If that migration has not been run yet, the page falls
// back to the status-only function, so the QR keeps working either way.
type PublicStatus = {
  job_no: string;
  status: JobStatus;
  brand: string | null;
  model_no: string | null;
  promised_ready_date: string | null;
  updated_at: string;
  // Present only when get_intake_record_by_token answered.
  branch_name?: string;
  intake_at?: string;
  serial_no?: string | null;
  services_required?: string;
  staff_observations?: string | null;
  warranty_declaration?: WarrantyDeclaration | null;
  purchase_date?: string | null;
};

const WARRANTY_LABELS: Record<WarrantyDeclaration, string> = {
  VALID_AND_RECEIVED: 'Valid, warranty card received',
  NOT_VALID: 'Not valid',
  OTHERS: 'Others',
};

async function fetchByToken(token: string): Promise<PublicStatus | null> {
  const full = await supabase.rpc('get_intake_record_by_token', { p_token: token });
  if (!full.error) return Array.isArray(full.data) && full.data[0] ? (full.data[0] as PublicStatus) : null;
  const basic = await supabase.rpc('get_job_status_by_token', { p_token: token });
  return !basic.error && Array.isArray(basic.data) && basic.data[0] ? (basic.data[0] as PublicStatus) : null;
}

export default function StatusPage() {
  return (
    <Suspense fallback={null}>
      <StatusPageInner />
    </Suspense>
  );
}

function StatusPageInner() {
  const token = useSearchParams().get('token');
  const [fetched, setResult] = useState<PublicStatus | 'not_found' | 'loading'>('loading');
  // No token means nothing to look up: decided while rendering, not in the effect.
  const result = token ? fetched : 'not_found';

  useEffect(() => {
    if (!token) return;
    fetchByToken(token).then((row) => setResult(row ?? 'not_found'), () => setResult('not_found'));
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      <div className="w-full max-w-sm bg-white rounded-[24px] shadow-xl shadow-slate-200/50 border border-slate-100 p-6 sm:p-8 text-center break-words">
        <div className="flex justify-center mb-6"><Logo textClassName="text-xl" /></div>

        {result === 'loading' && <p className="text-sm text-slate-400">Checking…</p>}

        {result === 'not_found' && (
          <p className="text-sm text-slate-500">
            We couldn&apos;t find a repair for this link. Please check the QR
            code or contact the branch you left your watch at.
          </p>
        )}

        {result !== 'loading' && result !== 'not_found' && (
          <>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Repair No.</p>
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
            {result.intake_at && <IntakeRecord r={result} />}
          </>
        )}
      </div>
    </div>
  );
}

// The customer's copy of what was recorded at the counter.
function IntakeRecord({ r }: { r: PublicStatus }) {
  const rows: [string, string | null | undefined][] = [
    ['Received', r.intake_at && `${new Date(r.intake_at).toLocaleString()}${r.branch_name ? ` · ${r.branch_name}` : ''}`],
    ['Item', [r.brand, r.model_no].filter(Boolean).join(' ') || null],
    ['Serial No.', r.serial_no],
    ['Services requested', r.services_required],
    ['Condition noted', r.staff_observations],
    ['Warranty', r.warranty_declaration
      && `${WARRANTY_LABELS[r.warranty_declaration]}${r.purchase_date ? ` · purchased ${new Date(r.purchase_date).toLocaleDateString()}` : ''}`],
  ];
  return (
    <div className="mt-6 pt-6 border-t border-slate-100 text-left">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 text-center">Intake record</p>
      <dl className="space-y-3">
        {rows.filter(([, v]) => v).map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] font-semibold text-slate-400">{label}</dt>
            <dd className="text-sm text-slate-700 whitespace-pre-wrap">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-slate-400 mt-5">
        Please keep your repair receipt for collection. This page is your record of
        what was noted when you left your watch with us.
      </p>
    </div>
  );
}
