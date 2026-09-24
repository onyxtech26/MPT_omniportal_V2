'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { Printer } from 'lucide-react';
import { getRepairJob, type RepairJob } from '@/lib/repairs';
import { supabase } from '@/lib/supabase';

// The record itself is digital, but the customer still walks away with
// something physical — that decision and why are in
// docs/REPAIR_MODULE_SPEC.md §6.3. This page IS that physical slip: what
// prints is exactly what's on screen here, nothing more, via the @media
// print rules in app/globals.css (80mm width, app chrome hidden).
//
// Reachable only inside the authenticated app (it's still under
// app/repairs/, so the normal login guard applies) — the QR code is what a
// signed-OUT customer actually uses afterwards, at /status, which is a
// separate, deliberately public page (see docs/REPAIR_MODULE_SPEC.md §7-8).
export default function SlipPage() {
  return (
    <Suspense fallback={null}>
      <SlipPageInner />
    </Suspense>
  );
}

function SlipPageInner() {
  const jobId = useSearchParams().get('job');
  const [job, setJob] = useState<RepairJob | null>(null);
  const [servedByName, setServedByName] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    getRepairJob(jobId).then(setJob);
  }, [jobId]);

  useEffect(() => {
    if (!job) return;
    if (job.served_by) {
      supabase.from('staff_members').select('full_name').eq('id', job.served_by).maybeSingle()
        .then(({ data }) => setServedByName((data as { full_name: string } | null)?.full_name ?? null));
    }
    const statusUrl = `${window.location.origin}/status?token=${job.status_token}`;
    QRCode.toDataURL(statusUrl, { margin: 1, width: 160 }).then(setQrDataUrl);
  }, [job]);

  if (!job) return <p className="text-sm text-slate-400 p-8">Loading…</p>;

  return (
    <div>
      <div className="no-print flex items-center justify-between mb-4 max-w-[320px] mx-auto">
        <p className="text-xs text-slate-400">80mm slip preview</p>
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white">
          <Printer size={14} /> Print
        </button>
      </div>

      {/* Everything below is what actually comes out of the printer. */}
      <div className="mx-auto bg-white border border-slate-200 p-4 text-black" style={{ width: '80mm', fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.4 }}>
        <p className="text-center font-bold" style={{ fontSize: '14px' }}>MPT WATCHES</p>
        <p className="text-center">www.mptwatches.com</p>
        <hr className="my-2 border-dashed" />

        <p className="text-center font-bold" style={{ fontSize: '16px' }}>{job.job_no}</p>
        {job.preprinted_chit_no && <p className="text-center">Chit No. {job.preprinted_chit_no}</p>}
        <p className="text-center">{job.branch_code} · {new Date(job.intake_at).toLocaleString()}</p>

        <hr className="my-2 border-dashed" />
        <p><b>Customer:</b> {job.customer_name}</p>
        <p><b>Phone:</b> {job.customer_phone}</p>
        {job.brand && <p><b>Item:</b> {[job.brand, job.model_no].filter(Boolean).join(' ')}</p>}
        <p><b>Services:</b> {job.services_required}</p>
        {job.promised_ready_date && <p><b>Promised:</b> {new Date(job.promised_ready_date).toLocaleDateString()}</p>}
        {job.fee != null && <p><b>Fee:</b> RM {Number(job.fee).toFixed(2)}</p>}
        {servedByName && <p><b>Attended by:</b> {servedByName}</p>}

        {qrDataUrl && (
          <div className="flex flex-col items-center my-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a plain
                <img> prints far more reliably across browsers than canvas */}
            <img src={qrDataUrl} alt="Scan to check status" width={100} height={100} />
            <p className="text-center mt-1">Scan to check status</p>
          </div>
        )}

        <hr className="my-2 border-dashed" />
        <p style={{ fontSize: '9px' }}>
          Kindly retain this receipt for collection. Full payment due on
          collection. Articles unclaimed after 6 months may be disposed of.
          Full terms available in-store.
        </p>
        <p style={{ fontSize: '9px' }} className="mt-1">
          Data Notice / Notis Data: Your name and phone number are collected
          to process this repair, including sharing with the vendor factory
          where relevant, and are kept only as long as needed. /
          Nama dan nombor telefon anda dikumpul untuk memproses pembaikan
          ini, termasuk perkongsian dengan kilang vendor jika berkaitan, dan
          disimpan hanya selama yang diperlukan.
        </p>
      </div>
    </div>
  );
}
