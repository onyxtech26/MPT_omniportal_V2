'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, WifiOff, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import {
  createRepairJob, generateJobNo, normalisePhone,
  type CreateJobInput, type JobType, type ServiceRoute, type WarrantyDeclaration,
} from '@/lib/repairs';
import { queueJob } from '@/lib/repairs-outbox';

type Branch = { code: string; name: string | null };
type Staff = { id: string; full_name: string };

// A request failed for one of two very different reasons, and the intake
// screen must not treat them the same way. "The network is down" should
// queue the job and let the counter carry on — the customer's watch still
// gets a slip. "The server rejected this" (a real validation problem, a
// permission bug) should be shown, not silently queued to fail the same way
// forever. This is a best-effort heuristic, not a certainty — see
// docs/REPAIR_MODULE_SPEC.md §9 on why the outbox's scope stops here.
function looksLikeNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch');
}

export default function NewRepairJobPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [branchCode, setBranchCode] = useState<string>('');
  const [servedBy, setServedBy] = useState<string>('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [brand, setBrand] = useState('');
  const [modelNo, setModelNo] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [jobType, setJobType] = useState<JobType>('REPAIR_SERVICE');
  const [serviceRoute, setServiceRoute] = useState<ServiceRoute>('IN_HOUSE');
  const [servicesRequired, setServicesRequired] = useState('');
  const [staffObservations, setStaffObservations] = useState('');
  const [warrantyDeclaration, setWarrantyDeclaration] = useState<WarrantyDeclaration | ''>('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [warrantyNote, setWarrantyNote] = useState('');
  const [fee, setFee] = useState('');
  const [declaredItemValue, setDeclaredItemValue] = useState('');
  const [promisedReadyDate, setPromisedReadyDate] = useState('');
  const [preprintedChitNo, setPreprintedChitNo] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [createdJobNo, setCreatedJobNo] = useState<string | null>(null);

  // Staff have exactly one branch — their own — and it is not a choice on
  // this screen; it comes from the signed-in account, the same way the paper
  // chit is only ever filled in at the branch that has it. A manager has no
  // home branch (see profiles_branch_matches_role), so a manager creating a
  // job on someone else's behalf picks one.
  const isStaff = profile?.role === 'staff';
  const canCreate = profile?.role === 'staff' || profile?.role === 'manager';

  useEffect(() => {
    if (isStaff && profile?.branch_code) setBranchCode(profile.branch_code);
  }, [isStaff, profile?.branch_code]);

  useEffect(() => {
    if (!isStaff) {
      supabase.from('branches').select('code, name').eq('is_active', true).order('code')
        .then(({ data }) => setBranches((data as Branch[]) ?? []));
    }
  }, [isStaff]);

  useEffect(() => {
    if (!branchCode) { setStaff([]); return; }
    supabase.from('staff_members').select('id, full_name').eq('branch_code', branchCode).eq('is_active', true)
      .order('full_name').then(({ data }) => setStaff((data as Staff[]) ?? []));
  }, [branchCode]);

  if (!canCreate) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <p className="text-slate-500 text-sm">
          Only Retail Staff and Managers create repair jobs — intake happens at a
          counter with the watch in hand.
        </p>
        <button onClick={() => router.push('/repairs')} className="mt-4 text-sm font-semibold text-slate-900 underline">
          Back to Repairs
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!branchCode) { setError('Branch is required.'); return; }
    if (!servedBy) { setError('Select who is handling this job — this is the record of who took it in.'); return; }
    if (!customerName.trim()) { setError('Customer name is required.'); return; }
    if (!customerPhone.trim()) { setError('Customer phone is required.'); return; }
    if (!servicesRequired.trim()) { setError('Describe what the customer wants fixed.'); return; }
    if (warrantyDeclaration === 'VALID_AND_RECEIVED' && !purchaseDate) {
      setError('Purchase date is required when warranty is valid and received.');
      return;
    }

    const input: CreateJobInput = {
      jobNo: generateJobNo(branchCode), // generated ONCE, here — see lib/repairs.ts
      branchCode,
      servedBy,
      customerName: customerName.trim(),
      customerPhone: normalisePhone(customerPhone),
      customerPhoneRaw: customerPhone,
      brand: brand.trim() || undefined,
      modelNo: modelNo.trim() || undefined,
      serialNo: serialNo.trim() || undefined,
      jobType,
      serviceRoute,
      servicesRequired: servicesRequired.trim(),
      staffObservations: staffObservations.trim() || undefined,
      warrantyDeclaration: warrantyDeclaration || undefined,
      purchaseDate: purchaseDate || undefined,
      inWarrantyAtIntake: warrantyDeclaration ? warrantyDeclaration === 'VALID_AND_RECEIVED' : undefined,
      warrantyNote: warrantyNote.trim() || undefined,
      fee: fee ? Number(fee) : undefined,
      declaredItemValue: declaredItemValue ? Number(declaredItemValue) : undefined,
      promisedReadyDate: promisedReadyDate || undefined,
      preprintedChitNo: preprintedChitNo.trim() || undefined,
    };

    setSubmitting(true);
    try {
      await createRepairJob(input);
      setCreatedJobNo(input.jobNo);
    } catch (err) {
      if (looksLikeNetworkFailure(err)) {
        // The watch is in hand and the customer is waiting — do not make
        // that their problem. Queue it; the job number is already final and
        // already printable, and the outbox will sync it the moment the
        // connection returns (see /repairs' banner).
        await queueJob(input);
        setCreatedJobNo(input.jobNo);
        setQueuedOffline(true);
      } else {
        setError(err instanceof Error ? err.message : 'Could not save this job.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (createdJobNo) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className={`w-14 h-14 rounded-2xl text-white flex items-center justify-center mx-auto mb-6 ${queuedOffline ? 'bg-amber-500' : 'bg-emerald-600'}`}>
          {queuedOffline ? <WifiOff size={24} /> : <Save size={24} />}
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Job No. {createdJobNo}</h1>
        {queuedOffline ? (
          <p className="text-amber-700 text-sm mb-6 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            No connection right now — this job is saved on this device and will
            sync automatically. The job number above is final; it's safe to give
            to the customer.
          </p>
        ) : (
          <p className="text-slate-500 text-sm mb-6">Saved. Give the customer this number for collection.</p>
        )}
        <div className="flex gap-2 justify-center">
          <button onClick={() => router.push('/repairs')} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white">
            Back to list
          </button>
          <button
            onClick={() => { setCreatedJobNo(null); setQueuedOffline(false); setCustomerName(''); setCustomerPhone(''); setServicesRequired(''); }}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700"
          >
            New job
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-16">
      <button onClick={() => router.push('/repairs')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft size={16} /> Repairs
      </button>
      <h1 className="text-xl font-bold text-slate-900 mb-1">New Repair Job</h1>
      <p className="text-sm text-slate-500 mb-6">The digital chit — customer copy prints after saving.</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Intake</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Branch">
              {isStaff ? (
                <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 text-sm font-semibold text-slate-700 border border-slate-200">
                  {branchCode}
                </div>
              ) : (
                <select value={branchCode} onChange={(e) => setBranchCode(e.target.value)} className={inputClass} required>
                  <option value="">Select branch…</option>
                  {branches.map((b) => <option key={b.code} value={b.code}>{b.name ?? b.code}</option>)}
                </select>
              )}
            </Field>
            <Field label="Served by *">
              <select value={servedBy} onChange={(e) => setServedBy(e.target.value)} className={inputClass} disabled={!branchCode}>
                <option value="">Select staff…</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </Field>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Customer</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name *"><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} /></Field>
            <Field label="Phone *"><input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="012-345 6789" className={inputClass} /></Field>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Item</h2>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Brand"><input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} /></Field>
            <Field label="Model No."><input value={modelNo} onChange={(e) => setModelNo(e.target.value)} className={inputClass} /></Field>
            <Field label="Serial No."><input value={serialNo} onChange={(e) => setSerialNo(e.target.value)} className={inputClass} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <select value={jobType} onChange={(e) => setJobType(e.target.value as JobType)} className={inputClass}>
                <option value="REPAIR_SERVICE">Repair / Service</option>
                <option value="PARTS_ORDER">Spare Parts / Accessories Order</option>
              </select>
            </Field>
            <Field label="Route">
              <select value={serviceRoute} onChange={(e) => setServiceRoute(e.target.value as ServiceRoute)} className={inputClass}>
                <option value="IN_HOUSE">In-house Technician</option>
                <option value="VENDOR_FACTORY">Original Vendor Factory</option>
              </select>
            </Field>
          </div>
          <Field label="Services required *">
            <textarea value={servicesRequired} onChange={(e) => setServicesRequired(e.target.value)} rows={2}
              placeholder="In the customer's own words — what do they say is wrong?" className={inputClass} />
          </Field>
          <Field label="Staff observations">
            <textarea value={staffObservations} onChange={(e) => setStaffObservations(e.target.value)} rows={2}
              placeholder="What you noticed — kept separate from the customer's complaint on purpose" className={inputClass} />
          </Field>
        </section>

        <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Warranty</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Declaration">
              <select value={warrantyDeclaration} onChange={(e) => setWarrantyDeclaration(e.target.value as WarrantyDeclaration)} className={inputClass}>
                <option value="">— Not stated —</option>
                <option value="VALID_AND_RECEIVED">Valid &amp; Received</option>
                <option value="NOT_VALID">Not Valid</option>
                <option value="OTHERS">Others</option>
              </select>
            </Field>
            {warrantyDeclaration === 'VALID_AND_RECEIVED' && (
              <Field label="Purchase date *"><input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputClass} /></Field>
            )}
            {warrantyDeclaration === 'OTHERS' && (
              <Field label="Please specify"><input value={warrantyNote} onChange={(e) => setWarrantyNote(e.target.value)} placeholder="e.g. bought overseas, no card" className={inputClass} /></Field>
            )}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Fee &amp; Timing</h2>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Fee (RM)"><input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} className={inputClass} /></Field>
            <Field label="Declared value (RM)"><input type="number" min="0" step="0.01" value={declaredItemValue} onChange={(e) => setDeclaredItemValue(e.target.value)} className={inputClass} /></Field>
            <Field label="Promised ready date"><input type="date" value={promisedReadyDate} onChange={(e) => setPromisedReadyDate(e.target.value)} className={inputClass} /></Field>
          </div>
          <Field label="Pre-printed chit no. (if used)">
            <input value={preprintedChitNo} onChange={(e) => setPreprintedChitNo(e.target.value)} placeholder="e.g. 54279" className={inputClass} />
          </Field>
        </section>

        {/* PDPA notice, in both languages, at intake — before collection, as
            required (docs/REPAIR_MODULE_SPEC.md §10). The same short notice
            is printed on the customer's slip. Not a consent checkbox: this is
            processing necessary to carry out the repair the customer is
            asking for, not marketing use, which is a separate consent this
            build does not collect yet. */}
        <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-3 leading-relaxed">
          The customer's name and phone number are collected to process this
          repair, including sharing with the vendor factory where the job is
          sent out-of-house, and are kept only as long as needed. / Nama dan
          nombor telefon pelanggan dikumpul untuk memproses pembaikan ini,
          termasuk perkongsian dengan kilang vendor jika kerja dihantar ke
          luar, dan disimpan hanya selama yang diperlukan.
        </p>

        {error && <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

        <button type="submit" disabled={submitting}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-60">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {submitting ? 'Saving…' : 'Save Job'}
        </button>
      </form>
    </div>
  );
}

const inputClass = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-400';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
