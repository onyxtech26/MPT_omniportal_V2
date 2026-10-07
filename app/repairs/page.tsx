'use client';

import { Suspense, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Search, X, Phone, MessageCircle, ArrowRight, Ban, PackageX,
  ShieldAlert, Clock, WifiOff, RefreshCw, CheckCircle2, Printer, Pencil, Trash2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  listRepairJobs, getRepairJob, listJobEvents, listJobContacts, listStaffForBranch,
  transitionJob, collectJob, logContact, uploadSignature, getJobCollection, signatureUrl,
  updateRepairDetails, deleteRepairJob, normalisePhone, type RepairDetailsPatch, waLink, nextStatus, CUSTODY_FOR_STATUS, balanceDue,
  STATUS_LABELS, STATUS_COLORS, CUSTODY_LABELS, FORWARD_PATH, PRE_READY_STATUSES, STEP_ACTION_LABELS,
  type RepairJob, type RepairEvent, type ContactLogEntry, type StaffMember, type CollectionRecord,
  type ContactChannel, type ContactPurpose, type ContactOutcome, type CollectionProof, type JobStatus,
} from '@/lib/repairs';
import { flushOutbox, listQueued } from '@/lib/repairs-outbox';
import { SignaturePadCanvas, type SignaturePadHandle } from '@/components/signature-pad';

// useSearchParams() (used for the ?job=<id> detail panel — see
// docs/REPAIR_MODULE_SPEC.md §11's note on why job detail is a query
// param rather than a dynamic /repairs/[id] route under a static export)
// requires a Suspense boundary in the App Router, or the build fails.
export default function RepairsListPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400 py-12 text-center">Loading…</p>}>
      <RepairsListPageInner />
    </Suspense>
  );
}

function RepairsListPageInner() {
  const { profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openJobId = searchParams.get('job');

  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>('ALL');
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Intake happens at the outlet counter, so only Retail Staff create jobs. The
  // Manager watches job status across branches but does not key anything in.
  const canCreate = profile?.role === 'staff';

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setJobs(await listRepairJobs());
    } finally {
      setLoading(false);
    }
  }, []);

  const trySync = useCallback(async () => {
    const queued = await listQueued();
    setQueuedCount(queued.length);
    if (queued.length === 0 || typeof navigator !== 'undefined' && !navigator.onLine) return;
    setSyncing(true);
    const { stillQueued } = await flushOutbox();
    setQueuedCount(stillQueued);
    setSyncing(false);
    await reload();
  }, [reload]);

  useEffect(() => { reload(); trySync(); }, [reload, trySync]);

  useEffect(() => {
    window.addEventListener('online', trySync);
    return () => window.removeEventListener('online', trySync);
  }, [trySync]);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (statusFilter !== 'ALL' && j.status !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        j.job_no.toLowerCase().includes(q) ||
        j.customer_name.toLowerCase().includes(q) ||
        j.customer_phone.includes(q) ||
        (j.brand?.toLowerCase().includes(q) ?? false) ||
        (j.preprinted_chit_no?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [jobs, query, statusFilter]);

  const setOpenJob = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set('job', id); else params.delete('job');
    router.push(`/repairs?${params.toString()}`);
  };

  return (
    <div>
      {queuedCount > 0 && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm font-medium">
          {syncing ? <RefreshCw size={16} className="animate-spin" /> : <WifiOff size={16} />}
          {queuedCount} repair{queuedCount > 1 ? 's' : ''} saved on this device, not yet synced.
          <button onClick={trySync} className="ml-auto underline font-semibold">Retry now</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Repairs</h1>
          <p className="text-sm text-slate-500">
            {profile?.role === 'staff' ? `${profile.branch_code} branch` : 'All branches'} · {filtered.length} repair{filtered.length === 1 ? '' : 's'}
          </p>
        </div>
        {canCreate && (
          <button onClick={() => router.push('/repairs/new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors">
            <Plus size={16} /> New Repair
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search repair no., name, phone, brand…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as JobStatus | 'ALL')}
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm">
          <option value="ALL">All statuses</option>
          {FORWARD_PATH.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-12 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">No repairs match.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Repair No.</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Promised</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => (
                  <tr key={j.id} onClick={() => setOpenJob(j.id)}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">{j.job_no}</td>
                    <td className="px-4 py-3 text-slate-600">{j.branch_code}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{j.customer_name}</div>
                      <div className="text-xs text-slate-400">{j.customer_phone}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{j.brand || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[j.status]}`}>
                        {STATUS_LABELS[j.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {j.promised_ready_date ? new Date(j.promised_ready_date).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {openJobId && (
          <JobDetailPanel jobId={openJobId} onClose={() => setOpenJob(null)} onChanged={reload} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------

function JobDetailPanel({ jobId, onClose, onChanged }: { jobId: string; onClose: () => void; onChanged: () => void }) {
  const { profile } = useAuth();
  const [job, setJob] = useState<RepairJob | null>(null);
  const [events, setEvents] = useState<RepairEvent[]>([]);
  const [contacts, setContacts] = useState<ContactLogEntry[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCollect, setShowCollect] = useState(false);
  const [showVoid, setShowVoid] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [collection, setCollection] = useState<CollectionRecord | null>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);

  // Staff move their own jobs along; IT Admin keeps support access. The Manager
  // only views status (owner's decision) — the database enforces the same split,
  // see supabase/migrations/manager_view_only.sql.
  const canAct = profile?.role === 'staff' || profile?.role === 'admin';
  const canVoid = profile?.role === 'admin';

  const load = useCallback(async () => {
    const [j, ev, ct] = await Promise.all([getRepairJob(jobId), listJobEvents(jobId), listJobContacts(jobId)]);
    setJob(j);
    setEvents(ev);
    setContacts(ct);
    if (j) setStaff(await listStaffForBranch(j.branch_code));
    // The customer's signature at collection, for staff and the manager to
    // check later. A failure here (e.g. the file is missing) must not break
    // the rest of the panel, so it only hides the image.
    const c = j?.status === 'COLLECTED' ? await getJobCollection(jobId).catch(() => null) : null;
    setCollection(c);
    setSigUrl(c?.signature_path ? await signatureUrl(c.signature_path).catch(() => null) : null);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!job) return null;

  const next = nextStatus(job.status);
  const isTerminal = ['COLLECTED', 'CANCELLED', 'VOID', 'RETURN_UNREPAIRED', 'UNCLAIMED'].includes(job.status);
  // Fixing a typo: staff (own outlet) and IT Admin, until the watch has left.
  const canEdit = canAct && !['COLLECTED', 'CANCELLED', 'VOID'].includes(job.status);
  // Removing a repair keyed in by mistake: staff only while it is still
  // Received; IT Admin any time. Mirrors the repair_jobs_delete policy.
  const canDelete = (profile?.role === 'staff' && job.status === 'RECEIVED') || profile?.role === 'admin';

  const handleDelete = async () => {
    if (!window.confirm(`Delete repair ${job.job_no} for ${job.customer_name}? This cannot be undone.`)) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteRepairJob(job.id);
      onChanged();
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete this repair.');
      setBusy(false);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-white shadow-2xl z-50 overflow-y-auto"
      >
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="font-mono text-sm font-bold text-slate-900">{job.job_no}</p>
            {job.preprinted_chit_no && <p className="text-xs text-slate-400">Chit No. {job.preprinted_chit_no}</p>}
          </div>
          <div className="flex items-center gap-1">
            <a href={`/repairs/slip?job=${job.id}`} target="_blank" rel="noopener noreferrer"
              title="Print customer slip" className="p-2 hover:bg-slate-100 rounded-xl text-slate-500">
              <Printer size={17} />
            </a>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[job.status]}`}>{STATUS_LABELS[job.status]}</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">{CUSTODY_LABELS[job.custody_state]}</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">{job.branch_code}</span>
          </div>

          <Section title="Customer">
            <p className="font-semibold text-slate-900">{job.customer_name}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-slate-500">{job.customer_phone}</span>
              <a href={`tel:${job.customer_phone}`} className="text-slate-400 hover:text-slate-900"><Phone size={14} /></a>
              <a href={waLink(job.customer_phone, `Hi ${job.customer_name}, this is MPT Watches regarding your repair ${job.job_no}.`)}
                target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-emerald-600"><MessageCircle size={14} /></a>
            </div>
          </Section>

          <Section title="Item">
            <p className="text-sm text-slate-700">{[job.brand, job.model_no].filter(Boolean).join(' · ') || '—'}</p>
            {job.serial_no && <p className="text-xs text-slate-400">S/N {job.serial_no}</p>}
          </Section>

          <Section title="Services Required">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.services_required}</p>
          </Section>

          {job.staff_observations && (
            <Section title="Staff Observations"><p className="text-sm text-slate-700 whitespace-pre-wrap">{job.staff_observations}</p></Section>
          )}

          {job.warranty_declaration && (
            <Section title="Warranty">
              <p className="text-sm text-slate-700">
                {job.warranty_declaration === 'VALID_AND_RECEIVED' ? 'Valid & Received' : job.warranty_declaration === 'NOT_VALID' ? 'Not Valid' : 'Others'}
                {job.purchase_date && ` · purchased ${new Date(job.purchase_date).toLocaleDateString()}`}
              </p>
            </Section>
          )}

          <div className="grid grid-cols-2 gap-4">
            {job.fee != null && <Section title="Fee"><p className="text-sm font-semibold text-slate-900">RM {Number(job.fee).toFixed(2)}</p></Section>}
            {job.fee != null && job.deposit != null && (
              <>
                <Section title="Deposit paid"><p className="text-sm text-slate-700">RM {Number(job.deposit).toFixed(2)}</p></Section>
                <Section title="Balance to pay"><p className="text-sm font-semibold text-slate-900">RM {balanceDue(job.fee, job.deposit)!.toFixed(2)}</p></Section>
              </>
            )}
            {job.promised_ready_date && <Section title="Promised"><p className="text-sm text-slate-700">{new Date(job.promised_ready_date).toLocaleDateString()}</p></Section>}
          </div>

          {actionError && <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{actionError}</p>}

          {(canEdit || canDelete) && !showEdit && (
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <button onClick={() => setShowEdit(true)} disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50">
                  <Pencil size={14} /> Edit Details
                </button>
              )}
              {canDelete && (
                <button onClick={handleDelete} disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
                  <Trash2 size={14} /> Delete Repair
                </button>
              )}
            </div>
          )}

          {showEdit && (
            <EditDetailsForm job={job} busy={busy} onCancel={() => setShowEdit(false)}
              onSubmit={(patch) => runAction(() => updateRepairDetails(job, patch)).then(() => setShowEdit(false))} />
          )}

          {/* Status actions */}
          {canAct && !isTerminal && (
            <Section title="Actions">
              <div className="flex flex-col gap-2">
                {next && next !== 'COLLECTED' && (
                  <ActionButton icon={ArrowRight} busy={busy}
                    onClick={() => runAction(() => transitionJob({
                      jobId: job.id, toStatus: next, toCustody: CUSTODY_FOR_STATUS[next], servedBy: job.served_by ?? undefined,
                    }))}>
                    {STEP_ACTION_LABELS[next] ?? `Move to ${STATUS_LABELS[next]}`}
                  </ActionButton>
                )}
                {next === 'COLLECTED' && (
                  <ActionButton icon={CheckCircle2} busy={busy} onClick={() => setShowCollect(true)}>
                    Mark Collected
                  </ActionButton>
                )}
                {PRE_READY_STATUSES.includes(job.status) && (
                  <ActionButton icon={PackageX} busy={busy} variant="warn" onClick={() => {
                    const reason = window.prompt('Reason the item is returned unrepaired:');
                    if (reason) runAction(() => transitionJob({ jobId: job.id, toStatus: 'RETURN_UNREPAIRED', toCustody: 'AT_BRANCH', reason }));
                  }}>
                    Return Unrepaired
                  </ActionButton>
                )}
                {job.status === 'RECEIVED' && (
                  <ActionButton icon={Ban} busy={busy} variant="warn" onClick={() => {
                    const reason = window.prompt('Reason for cancelling:');
                    if (reason) runAction(() => transitionJob({ jobId: job.id, toStatus: 'CANCELLED', reason }));
                  }}>
                    Cancel Repair
                  </ActionButton>
                )}
                {canVoid && (
                  <ActionButton icon={ShieldAlert} busy={busy} variant="danger" onClick={() => setShowVoid(true)}>
                    Void Repair
                  </ActionButton>
                )}
              </div>
            </Section>
          )}

          {showCollect && (
            <CollectForm job={job} staff={staff} busy={busy} onCancel={() => setShowCollect(false)}
              onSubmit={(args) => runAction(() => collectJob({ jobId: job.id, ...args })).then(() => setShowCollect(false))} />
          )}
          {showVoid && (
            <VoidForm busy={busy} onCancel={() => setShowVoid(false)}
              onSubmit={(reason) => runAction(() => transitionJob({ jobId: job.id, toStatus: 'VOID', reason })).then(() => setShowVoid(false))} />
          )}

          {collection && (
            <Section title="Collection">
              <p className="text-sm text-slate-700">
                Collected by <span className="font-semibold text-slate-900">{collection.collector_name}</span>
                {collection.collector_relationship && ` (${collection.collector_relationship})`}
                {' · '}{new Date(collection.collected_at).toLocaleString()}
              </p>
              {sigUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL; next/image cannot optimise it in a static export
                <img src={sigUrl} alt={`Signature of ${collection.collector_name}`}
                  className="mt-2 w-full max-w-xs h-28 object-contain bg-white border border-slate-200 rounded-xl" />
              ) : (
                <p className="text-xs text-slate-400 mt-1">
                  {collection.signature_path ? 'Signature could not be loaded.' : 'No signature taken (chit surrendered).'}
                </p>
              )}
            </Section>
          )}

          <ContactLogSection jobId={job.id} contacts={contacts} staff={staff} servedBy={job.served_by}
            canLog={canAct} onLogged={load} />

          <Section title="History">
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="text-xs text-slate-500 border-l-2 border-slate-100 pl-3">
                  <span className="font-semibold text-slate-700">
                    {e.kind === 'VOID' ? 'Voided' : e.to_status ? STATUS_LABELS[e.to_status] : e.to_custody ? CUSTODY_LABELS[e.to_custody] : e.kind}
                  </span>
                  {' · '}{new Date(e.at).toLocaleString()}
                  {e.reason && <div className="text-slate-400 italic">"{e.reason}"</div>}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </motion.div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">{title}</p>
      {children}
    </div>
  );
}

function ActionButton({ icon: Icon, children, onClick, busy, variant = 'default' }: {
  icon: typeof ArrowRight; children: React.ReactNode; onClick: () => void; busy: boolean;
  variant?: 'default' | 'warn' | 'danger';
}) {
  const styles = {
    default: 'bg-slate-900 text-white hover:bg-slate-700',
    warn: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100',
  }[variant];
  return (
    <button onClick={onClick} disabled={busy} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${styles}`}>
      <Icon size={15} /> {children}
    </button>
  );
}

function CollectForm({ job, staff, busy, onCancel, onSubmit }: {
  job: RepairJob; staff: StaffMember[]; busy: boolean; onCancel: () => void;
  onSubmit: (args: {
    collectorName: string; collectorRelationship?: string; proofMethod: CollectionProof;
    chitDestroyed?: boolean; servedBy?: string;
    signaturePath?: string; signedSnapshot?: Record<string, unknown>;
  }) => void;
}) {
  const [collectorName, setCollectorName] = useState(job.customer_name);
  const [collectorRelationship, setCollectorRelationship] = useState('');
  const [proofMethod, setProofMethod] = useState<CollectionProof>('CHIT_SURRENDERED');
  const [servedBy, setServedBy] = useState(job.served_by ?? '');
  const [uploading, setUploading] = useState(false);
  const [sigError, setSigError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  const handleConfirm = async () => {
    setSigError(null);
    const base = {
      collectorName: collectorName.trim(),
      collectorRelationship: collectorRelationship.trim() || undefined,
      proofMethod,
      chitDestroyed: proofMethod === 'CHIT_SURRENDERED',
      servedBy: servedBy || undefined,
    };

    if (proofMethod !== 'SIGNATURE') {
      onSubmit(base);
      return;
    }

    if (!padRef.current || padRef.current.isEmpty()) {
      setSigError('Ask the customer to sign above before confirming.');
      return;
    }
    setUploading(true);
    try {
      const svg = padRef.current.toSVG();
      const signaturePath = await uploadSignature(job.id, svg);
      // What was actually on screen when they signed — a signature image
      // alone proves nothing; bound to this it's evidence (spec §9).
      const signedSnapshot = {
        job_no: job.job_no, customer_name: job.customer_name, brand: job.brand,
        model_no: job.model_no, signed_at: new Date().toISOString(),
      };
      onSubmit({ ...base, signaturePath, signedSnapshot });
    } catch (err) {
      setSigError(err instanceof Error ? err.message : 'Could not save the signature.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-3">
      <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Mark Collected</p>
      <Field label="Collected by"><input value={collectorName} onChange={(e) => setCollectorName(e.target.value)} className={smallInput} /></Field>
      {collectorName !== job.customer_name && (
        <Field label="Relationship to customer"><input value={collectorRelationship} onChange={(e) => setCollectorRelationship(e.target.value)} placeholder="e.g. spouse, colleague" className={smallInput} /></Field>
      )}
      <Field label="Proof">
        <select value={proofMethod} onChange={(e) => setProofMethod(e.target.value as CollectionProof)} className={smallInput}>
          <option value="CHIT_SURRENDERED">Chit surrendered (destroyed)</option>
          <option value="SIGNATURE">Customer signed (no chit brought)</option>
        </select>
      </Field>
      <Field label="Served by"><select value={servedBy} onChange={(e) => setServedBy(e.target.value)} className={smallInput}>
        <option value="">—</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
      </select></Field>
      {proofMethod === 'SIGNATURE' && (
        <div>
          <p className="text-[11px] font-semibold text-slate-500 mb-1">Customer signature</p>
          <SignaturePadCanvas ref={padRef} width={340} height={130} />
          <button type="button" onClick={() => padRef.current?.clear()} className="text-[11px] font-semibold text-slate-500 underline mt-1">
            Clear
          </button>
          {sigError && <p className="text-xs text-red-600 mt-1">{sigError}</p>}
        </div>
      )}
      <div className="flex gap-2">
        <button disabled={busy || uploading || !collectorName.trim()}
          onClick={handleConfirm}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white disabled:opacity-50">
          {uploading ? 'Saving signature…' : 'Confirm Collection'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600">Cancel</button>
      </div>
    </div>
  );
}

function EditDetailsForm({ job, busy, onCancel, onSubmit }: {
  job: RepairJob; busy: boolean; onCancel: () => void; onSubmit: (patch: RepairDetailsPatch) => void;
}) {
  const [customerName, setCustomerName] = useState(job.customer_name);
  const [phone, setPhone] = useState(job.customer_phone_raw ?? job.customer_phone);
  const [brand, setBrand] = useState(job.brand ?? '');
  const [modelNo, setModelNo] = useState(job.model_no ?? '');
  const [serialNo, setSerialNo] = useState(job.serial_no ?? '');
  const [services, setServices] = useState(job.services_required);
  const [observations, setObservations] = useState(job.staff_observations ?? '');
  const [fee, setFee] = useState(job.fee != null ? String(job.fee) : '');
  const [deposit, setDeposit] = useState(job.deposit != null ? String(job.deposit) : '');
  const [promised, setPromised] = useState(job.promised_ready_date ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    if (!customerName.trim()) return setError('Customer name is required.');
    if (!phone.trim()) return setError('Customer phone is required.');
    if (!services.trim()) return setError('Describe what the customer wants fixed.');
    if (deposit && !fee) return setError('Enter the total fee before the deposit.');
    if (deposit && Number(deposit) > Number(fee)) return setError('The deposit cannot be more than the total fee.');
    onSubmit({
      customer_name: customerName.trim(),
      customer_phone: normalisePhone(phone),
      customer_phone_raw: phone.trim(),
      brand: brand.trim() || null,
      model_no: modelNo.trim() || null,
      serial_no: serialNo.trim() || null,
      services_required: services.trim(),
      staff_observations: observations.trim() || null,
      fee: fee ? Number(fee) : null,
      deposit: deposit ? Number(deposit) : null,
      promised_ready_date: promised || null,
    });
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Edit details</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Customer name"><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={smallInput} /></Field>
        <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={smallInput} /></Field>
        <Field label="Brand"><input value={brand} onChange={(e) => setBrand(e.target.value)} className={smallInput} /></Field>
        <Field label="Model"><input value={modelNo} onChange={(e) => setModelNo(e.target.value)} className={smallInput} /></Field>
        <Field label="Serial no."><input value={serialNo} onChange={(e) => setSerialNo(e.target.value)} className={smallInput} /></Field>
        <Field label="Promised ready date"><input type="date" value={promised} onChange={(e) => setPromised(e.target.value)} className={smallInput} /></Field>
        <Field label="Total fee (RM)"><input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} className={smallInput} /></Field>
        <Field label="Deposit paid (RM)"><input type="number" min="0" step="0.01" value={deposit} onChange={(e) => setDeposit(e.target.value)} className={smallInput} /></Field>
      </div>
      <Field label="Services required"><textarea rows={2} value={services} onChange={(e) => setServices(e.target.value)} className={smallInput} /></Field>
      <Field label="Staff observations"><textarea rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} className={smallInput} /></Field>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={save}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-900 text-white disabled:opacity-50">Save Changes</button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600">Cancel</button>
      </div>
    </div>
  );
}

function VoidForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-3">
      <p className="text-xs font-bold text-red-800 uppercase tracking-wide">Void Repair — cannot be undone by staff</p>
      <Field label="Reason *"><input value={reason} onChange={(e) => setReason(e.target.value)} className={smallInput} /></Field>
      <div className="flex gap-2">
        <button disabled={busy || !reason.trim()} onClick={() => onSubmit(reason.trim())}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white disabled:opacity-50">Void</button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600">Cancel</button>
      </div>
    </div>
  );
}

function ContactLogSection({ jobId, contacts, staff, servedBy, canLog, onLogged }: {
  jobId: string; contacts: ContactLogEntry[]; staff: StaffMember[]; servedBy: string | null; canLog: boolean; onLogged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<ContactChannel>('WHATSAPP');
  const [purpose, setPurpose] = useState<ContactPurpose>('READY_FOR_COLLECTION');
  const [outcome, setOutcome] = useState<ContactOutcome>('ANSWERED');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await logContact({ jobId, channel, purpose, outcome, note: note.trim() || undefined, servedBy: servedBy ?? undefined });
      setNote(''); setOpen(false);
      onLogged();
    } finally { setSaving(false); }
  };

  return (
    <Section title={`Contact Log (${contacts.length})`}>
      <div className="space-y-2 mb-2">
        {contacts.map((c) => (
          <div key={c.id} className="text-xs bg-slate-50 rounded-lg px-3 py-2">
            <span className="font-semibold text-slate-700">{c.channel}</span> · {c.outcome.replace(/_/g, ' ').toLowerCase()}
            <span className="text-slate-400"> · {new Date(c.at).toLocaleString()}</span>
            {c.note && <div className="text-slate-500 italic mt-0.5">{c.note}</div>}
          </div>
        ))}
        {contacts.length === 0 && <p className="text-xs text-slate-400">No contact attempts logged yet.</p>}
      </div>
      {!canLog ? null : !open ? (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
          <Clock size={13} /> Log a contact attempt
        </button>
      ) : (
        <div className="bg-slate-50 rounded-xl p-3 space-y-2">
          <p className="text-[11px] text-slate-400">
            Opening WhatsApp doesn't log anything by itself — record it here once you've actually reached out.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <select value={channel} onChange={(e) => setChannel(e.target.value as ContactChannel)} className={smallInput}>
              <option value="WHATSAPP">WhatsApp</option><option value="CALL">Call</option><option value="SMS">SMS</option><option value="IN_PERSON">In Person</option>
            </select>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as ContactOutcome)} className={smallInput}>
              <option value="ANSWERED">Answered</option><option value="NO_ANSWER">No Answer</option><option value="WRONG_NUMBER">Wrong Number</option>
              <option value="LEFT_MESSAGE">Left Message</option><option value="MESSAGE_SENT">Message Sent</option><option value="CUSTOMER_REPLIED">Customer Replied</option>
              <option value="PROMISED_TO_COLLECT">Promised to Collect</option><option value="UNREACHABLE">Unreachable</option>
            </select>
          </div>
          <select value={purpose} onChange={(e) => setPurpose(e.target.value as ContactPurpose)} className={smallInput}>
            <option value="READY_FOR_COLLECTION">Ready for Collection</option><option value="DELAY_UPDATE">Delay Update</option>
            <option value="UNCLAIMED_REMINDER">Unclaimed Reminder</option><option value="FINAL_NOTICE">Final Notice</option>
            <option value="CUSTOMER_ENQUIRY">Customer Enquiry</option><option value="OTHER">Other</option>
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={smallInput} />
          <div className="flex gap-2">
            <button disabled={saving} onClick={submit} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white disabled:opacity-50">Save</button>
            <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500">Cancel</button>
          </div>
        </div>
      )}
    </Section>
  );
}

const smallInput = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</span>{children}</label>;
}
