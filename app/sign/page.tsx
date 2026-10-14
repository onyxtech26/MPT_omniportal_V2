'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/logo';
import { supabase } from '@/lib/supabase';
import { REMOTE_SIGN_DECLARATION } from '@/lib/repairs';
import { SignaturePadCanvas, type SignaturePadHandle } from '@/components/signature-pad';

// Where a customer signs for collection on their OWN phone, when they come
// without the repair chit. Like /status, a public sibling of the app, outside
// every login guard: the customer has no account.
//
// The link carries a one-time token from a sign_requests row that staff
// started at the counter. This page only ever calls the two narrow functions
// from supabase/migrations/repair_remote_signing.sql: get_sign_request (repair
// no., item, collector name, nothing else) and submit_sign_request (once,
// within 15 minutes). The counter screen then finishes the collection.
type SignInfo = {
  job_no: string;
  brand: string | null;
  model_no: string | null;
  collector_name: string;
  collector_relationship: string | null;
  state: 'PENDING' | 'SIGNED' | 'EXPIRED' | 'CANCELLED' | 'CLOSED';
  expires_at: string;
};

export default function SignPage() {
  return (
    <Suspense fallback={null}>
      <SignPageInner />
    </Suspense>
  );
}

function SignPageInner() {
  const token = useSearchParams().get('t');
  const [info, setInfo] = useState<SignInfo | 'not_found' | 'loading'>('loading');
  const [padWidth, setPadWidth] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    if (!token) return;
    supabase.rpc('get_sign_request', { p_token: token }).then(({ data, error: err }) => {
      const row = Array.isArray(data) ? data[0] : null;
      // The pad is sized once (resizing would wipe it), so fit it to the phone first.
      setPadWidth(Math.min(360, window.innerWidth - 64));
      setInfo(err || !row ? 'not_found' : (row as SignInfo));
    });
  }, [token]);

  const submit = async () => {
    setError(null);
    if (!padRef.current || padRef.current.isEmpty()) {
      setError('Please sign in the box above.');
      return;
    }
    setSubmitting(true);
    const { error: err } = await supabase.rpc('submit_sign_request', { p_token: token, p_svg: padRef.current.toSVG() });
    setSubmitting(false);
    if (err) setError(err.message || 'Could not send your signature. Please ask the staff for a new link.');
    else setDone(true);
  };

  let body: React.ReactNode;
  if (!token || info === 'not_found') {
    body = <p className="text-sm text-slate-500 text-center">This signing link is not valid. Please ask the staff at the counter for a new one.</p>;
  } else if (info === 'loading') {
    body = <p className="text-sm text-slate-400 text-center">Loading…</p>;
  } else if (done || info.state === 'SIGNED') {
    body = (
      <div className="text-center">
        <CheckCircle2 size={40} className="mx-auto text-emerald-600 mb-3" />
        <p className="font-semibold text-slate-900">Thank you, signed.</p>
        <p className="text-sm text-slate-500 mt-1">The staff at the counter will now hand over your watch.</p>
      </div>
    );
  } else if (info.state !== 'PENDING') {
    const why = info.state === 'EXPIRED' ? 'has expired' : info.state === 'CANCELLED' ? 'was cancelled' : 'is no longer needed';
    body = <p className="text-sm text-slate-500 text-center">This signing link {why}. Please ask the staff at the counter for a new one.</p>;
  } else {
    body = (
      <>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center mb-1">Repair No.</p>
        <p className="font-mono text-lg font-bold text-slate-900 text-center mb-4">{info.job_no}</p>
        <dl className="text-sm space-y-2 mb-4">
          {(info.brand || info.model_no) && (
            <div><dt className="text-[11px] font-semibold text-slate-400">Item</dt><dd className="text-slate-700">{[info.brand, info.model_no].filter(Boolean).join(' ')}</dd></div>
          )}
          <div>
            <dt className="text-[11px] font-semibold text-slate-400">Collected by</dt>
            <dd className="text-slate-700">{info.collector_name}{info.collector_relationship && ` (${info.collector_relationship})`}</dd>
          </div>
        </dl>
        <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4">{REMOTE_SIGN_DECLARATION}</p>
        <p className="text-[11px] font-semibold text-slate-500 mb-1">Sign below</p>
        {padWidth > 0 && <SignaturePadCanvas ref={padRef} width={padWidth} height={160} />}
        <button type="button" onClick={() => padRef.current?.clear()} className="text-[11px] font-semibold text-slate-500 underline mt-1">
          Clear
        </button>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <button onClick={submit} disabled={submitting}
          className="w-full mt-4 px-4 py-3 rounded-xl text-sm font-semibold bg-slate-900 text-white disabled:opacity-50">
          {submitting ? 'Sending…' : 'Sign and confirm'}
        </button>
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      <div className="w-full max-w-sm bg-white rounded-[24px] shadow-xl shadow-slate-200/50 border border-slate-100 p-6">
        <div className="flex justify-center mb-6"><Logo textClassName="text-xl" /></div>
        {body}
      </div>
    </div>
  );
}
