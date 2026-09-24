import { supabase } from './supabase';

// Mirrors the Postgres enums exactly (see the Supabase migrations run for
// this project). If a value is added on one side, add it on the other —
// TypeScript has no way to know the database enum changed underneath it.
export type JobStatus =
  | 'DRAFT' | 'RECEIVED' | 'SENT_TO_HQ' | 'IN_REPAIR' | 'RETURNED_TO_BRANCH'
  | 'READY_FOR_COLLECTION' | 'RETURN_UNREPAIRED' | 'COLLECTED' | 'UNCLAIMED'
  | 'CANCELLED' | 'VOID';

export type CustodyState =
  | 'AT_BRANCH' | 'IN_TRANSIT_TO_HQ' | 'AT_HQ_WORKSHOP'
  | 'IN_TRANSIT_TO_BRANCH' | 'RELEASED_TO_CUSTOMER';

export type JobType = 'REPAIR_SERVICE' | 'PARTS_ORDER';
export type ServiceRoute = 'IN_HOUSE' | 'VENDOR_FACTORY';
export type WarrantyDeclaration = 'VALID_AND_RECEIVED' | 'NOT_VALID' | 'OTHERS';
export type ContactChannel = 'CALL' | 'WHATSAPP' | 'SMS' | 'IN_PERSON';
export type ContactPurpose =
  | 'READY_FOR_COLLECTION' | 'DELAY_UPDATE' | 'UNCLAIMED_REMINDER'
  | 'FINAL_NOTICE' | 'CUSTOMER_ENQUIRY' | 'OTHER';
export type ContactOutcome =
  | 'ANSWERED' | 'NO_ANSWER' | 'WRONG_NUMBER' | 'LEFT_MESSAGE'
  | 'MESSAGE_SENT' | 'CUSTOMER_REPLIED' | 'PROMISED_TO_COLLECT' | 'UNREACHABLE';
export type CollectionProof = 'CHIT_SURRENDERED' | 'SIGNATURE' | 'BOTH';

export type RepairJob = {
  id: string;
  job_no: string;
  // Bearer token for the public status page (/status?token=...). Treat it
  // like a credential, not a display value — never log it, never put it
  // anywhere but the QR code and the direct link on the printed slip.
  status_token: string;
  preprinted_chit_no: string | null;
  branch_code: string;
  intake_at: string;
  served_by: string | null;
  customer_name: string;
  customer_phone: string;
  customer_phone_raw: string | null;
  brand: string | null;
  model_no: string | null;
  serial_no: string | null;
  job_type: JobType;
  service_route: ServiceRoute;
  services_required: string;
  staff_observations: string | null;
  warranty_declaration: WarrantyDeclaration | null;
  purchase_date: string | null;
  in_warranty_at_intake: boolean | null;
  warranty_note: string | null;
  fee: number | null;
  declared_item_value: number | null;
  promised_ready_date: string | null;
  status: JobStatus;
  custody_state: CustodyState;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  void_reason: string | null;
};

export type RepairEvent = {
  id: string;
  job_id: string;
  kind: string;
  from_status: JobStatus | null;
  to_status: JobStatus | null;
  from_custody: CustodyState | null;
  to_custody: CustodyState | null;
  at: string;
  actor: string | null;
  served_by: string | null;
  reason: string | null;
};

export type ContactLogEntry = {
  id: string;
  job_id: string;
  at: string;
  channel: ContactChannel;
  purpose: ContactPurpose;
  outcome: ContactOutcome;
  note: string | null;
  served_by: string | null;
};

export type StaffMember = {
  id: string;
  branch_code: string;
  full_name: string;
  is_active: boolean;
};

// ---------------------------------------------------------------------------
// job_no is generated HERE, on the device, deliberately — not by the server.
// That is what lets a slip print even when the connection is down: the
// number exists the instant the form is filled in, and an offline write can
// queue under this same number and sync later without waiting on a server
// round-trip to learn what its own reference number is.
// Format: BRANCH-YYMM-XXXX, e.g. KMT-2609-7F3K. Not a security token —
// collisions are astronomically unlikely at real branch volumes, and the
// database's own job_no UNIQUE constraint is the actual backstop.
export function generateJobNo(branchCode: string): string {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const suffix = Array.from({ length: 4 }, () =>
    '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 34)] // no O/I, easy to misread
  ).join('');
  return `${branchCode}-${yymm}-${suffix}`;
}

// Malaysian mobile numbers, however typed, become plain digits starting with
// 60 — matches the CHECK constraint on repair_jobs.customer_phone. Kept next
// to generateJobNo() because both run on whatever the counter typed, before
// anything reaches the database.
export function normalisePhone(raw: string): string {
  let digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) digits = '60' + digits.slice(1);
  if (!digits.startsWith('60') && digits.length <= 10) digits = '60' + digits;
  return digits;
}

export function waLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

// ---------------------------------------------------------------------------
// Every read below is a plain, unfiltered select. There is deliberately no
// "if role is staff, filter by branch" in this file — that filtering already
// happened inside Postgres before a single row reached the browser (see the
// repair_jobs_read policy). The same query is correct for every role; RLS is
// what makes their results differ.

export async function listRepairJobs(): Promise<RepairJob[]> {
  const { data, error } = await supabase
    .from('repair_jobs')
    .select('*')
    .order('intake_at', { ascending: false });
  if (error) throw error;
  return data as RepairJob[];
}

export async function getRepairJob(id: string): Promise<RepairJob | null> {
  const { data, error } = await supabase.from('repair_jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as RepairJob | null;
}

export async function listStaffForBranch(branchCode: string): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from('staff_members')
    .select('*')
    .eq('branch_code', branchCode)
    .eq('is_active', true)
    .order('full_name');
  if (error) throw error;
  return data as StaffMember[];
}

export async function listJobEvents(jobId: string): Promise<RepairEvent[]> {
  const { data, error } = await supabase
    .from('repair_events')
    .select('*')
    .eq('job_id', jobId)
    .order('at', { ascending: false });
  if (error) throw error;
  return data as RepairEvent[];
}

export async function listJobContacts(jobId: string): Promise<ContactLogEntry[]> {
  const { data, error } = await supabase
    .from('contact_log')
    .select('*')
    .eq('job_id', jobId)
    .order('at', { ascending: false });
  if (error) throw error;
  return data as ContactLogEntry[];
}

// ---------------------------------------------------------------------------
// Writes. Multi-table ones go through the Postgres functions from the
// repair_job_write_functions migration so they're atomic — see that
// migration's comments for why. Single-row writes (logging a contact) are
// plain inserts; there's nothing to make atomic.

export type CreateJobInput = {
  // Generated ONCE by the caller (generateJobNo()) before the first attempt,
  // and reused verbatim on every retry — including from the offline outbox.
  // createRepairJob() deliberately does NOT generate its own: if it did, a
  // job that failed offline and retried later would get a SECOND, different
  // number, orphaning whatever was already printed and handed to the
  // customer at intake.
  jobNo: string;
  branchCode: string;
  customerName: string;
  customerPhone: string;
  customerPhoneRaw?: string;
  brand?: string;
  modelNo?: string;
  serialNo?: string;
  servicesRequired: string;
  staffObservations?: string;
  jobType?: JobType;
  serviceRoute?: ServiceRoute;
  warrantyDeclaration?: WarrantyDeclaration;
  purchaseDate?: string;
  inWarrantyAtIntake?: boolean;
  warrantyNote?: string;
  fee?: number;
  declaredItemValue?: number;
  promisedReadyDate?: string;
  preprintedChitNo?: string;
  servedBy?: string;
};

export async function createRepairJob(input: CreateJobInput): Promise<RepairJob> {
  const { data, error } = await supabase.rpc('create_repair_job', {
    p_job_no: input.jobNo,
    p_branch_code: input.branchCode,
    p_customer_name: input.customerName,
    p_customer_phone: normalisePhone(input.customerPhone),
    p_customer_phone_raw: input.customerPhoneRaw ?? input.customerPhone,
    p_brand: input.brand ?? null,
    p_model_no: input.modelNo ?? null,
    p_serial_no: input.serialNo ?? null,
    p_services_required: input.servicesRequired,
    p_staff_observations: input.staffObservations ?? null,
    p_job_type: input.jobType ?? 'REPAIR_SERVICE',
    p_service_route: input.serviceRoute ?? 'IN_HOUSE',
    p_warranty_declaration: input.warrantyDeclaration ?? null,
    p_purchase_date: input.purchaseDate ?? null,
    p_in_warranty_at_intake: input.inWarrantyAtIntake ?? null,
    p_warranty_note: input.warrantyNote ?? null,
    p_fee: input.fee ?? null,
    p_declared_item_value: input.declaredItemValue ?? null,
    p_promised_ready_date: input.promisedReadyDate ?? null,
    p_preprinted_chit_no: input.preprintedChitNo ?? null,
    p_served_by: input.servedBy ?? null,
  });
  if (error) throw error;
  return data as RepairJob;
}

export async function transitionJob(args: {
  jobId: string;
  toStatus?: JobStatus;
  toCustody?: CustodyState;
  reason?: string;
  servedBy?: string;
}): Promise<RepairJob> {
  const { data, error } = await supabase.rpc('transition_repair_job', {
    p_job_id: args.jobId,
    p_to_status: args.toStatus ?? null,
    p_to_custody: args.toCustody ?? null,
    p_reason: args.reason ?? null,
    p_served_by: args.servedBy ?? null,
  });
  if (error) throw error;
  return data as RepairJob;
}

export async function collectJob(args: {
  jobId: string;
  collectorName: string;
  collectorRelationship?: string;
  proofMethod: CollectionProof;
  chitDestroyed?: boolean;
  servedBy?: string;
  // Populated when proofMethod is SIGNATURE/BOTH — see uploadSignature()
  // below. signedSnapshot is what was actually on screen when they signed
  // (job no, customer, item, timestamp): a signature image alone proves
  // nothing, bound to this it is evidence — see spec §9.
  signaturePath?: string;
  signedSnapshot?: Record<string, unknown>;
}): Promise<RepairJob> {
  const { data, error } = await supabase.rpc('collect_repair_job', {
    p_job_id: args.jobId,
    p_collector_name: args.collectorName,
    p_collector_relationship: args.collectorRelationship ?? null,
    p_proof_method: args.proofMethod,
    p_chit_destroyed: args.chitDestroyed ?? false,
    p_signature_path: args.signaturePath ?? null,
    p_signed_snapshot: args.signedSnapshot ?? null,
    p_served_by: args.servedBy ?? null,
  });
  if (error) throw error;
  return data as RepairJob;
}

// Uploads a captured signature (SVG text — a few KB, versus 50KB+ for a PNG,
// which matters at repair-job volumes; see spec §9) to the private
// 'signatures' bucket, at a path keyed by job id so the storage policies
// (which check "can this caller see this job") apply automatically. Returns
// the storage path to pass into collectJob() as signaturePath.
export async function uploadSignature(jobId: string, svgText: string): Promise<string> {
  const path = `${jobId}/${Date.now()}.svg`;
  const { error } = await supabase.storage.from('signatures').upload(path, svgText, {
    contentType: 'image/svg+xml',
    upsert: false, // a signature is evidence — never silently overwrite one
  });
  if (error) throw error;
  return path;
}

export async function logContact(args: {
  jobId: string;
  channel: ContactChannel;
  purpose: ContactPurpose;
  outcome: ContactOutcome;
  note?: string;
  servedBy?: string;
  phoneUsed?: string;
}): Promise<void> {
  const { error } = await supabase.from('contact_log').insert({
    job_id: args.jobId,
    channel: args.channel,
    purpose: args.purpose,
    outcome: args.outcome,
    note: args.note ?? null,
    served_by: args.servedBy ?? null,
    phone_used: args.phoneUsed ?? null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Display helpers — kept here rather than duplicated in every component.
export const STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: 'Draft',
  RECEIVED: 'Received',
  SENT_TO_HQ: 'Sent to HQ',
  IN_REPAIR: 'In Repair',
  RETURNED_TO_BRANCH: 'Returned to Branch',
  READY_FOR_COLLECTION: 'Ready for Collection',
  RETURN_UNREPAIRED: 'Returned Unrepaired',
  COLLECTED: 'Collected',
  UNCLAIMED: 'Unclaimed',
  CANCELLED: 'Cancelled',
  VOID: 'Void',
};

export const STATUS_COLORS: Record<JobStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  RECEIVED: 'bg-blue-50 text-blue-700',
  SENT_TO_HQ: 'bg-indigo-50 text-indigo-700',
  IN_REPAIR: 'bg-amber-50 text-amber-700',
  RETURNED_TO_BRANCH: 'bg-indigo-50 text-indigo-700',
  READY_FOR_COLLECTION: 'bg-emerald-50 text-emerald-700',
  RETURN_UNREPAIRED: 'bg-orange-50 text-orange-700',
  COLLECTED: 'bg-slate-900 text-white',
  UNCLAIMED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
  VOID: 'bg-slate-100 text-slate-400 line-through',
};

export const CUSTODY_LABELS: Record<CustodyState, string> = {
  AT_BRANCH: 'At Branch',
  IN_TRANSIT_TO_HQ: 'In Transit → HQ',
  AT_HQ_WORKSHOP: 'At HQ Workshop',
  IN_TRANSIT_TO_BRANCH: 'In Transit → Branch',
  RELEASED_TO_CUSTOMER: 'Released to Customer',
};

// The forward path through the lifecycle. Deliberately a fixed sequence
// rather than "any status to any status" — the whole point of modelling this
// as a state machine (docs/REPAIR_MODULE_SPEC.md §5.2) is that most jumps
// don't make sense, so the UI only ever offers the next real step (plus the
// off-ramps handled separately: cancel, return unrepaired, void).
export const FORWARD_PATH: JobStatus[] = [
  'RECEIVED', 'SENT_TO_HQ', 'IN_REPAIR', 'RETURNED_TO_BRANCH',
  'READY_FOR_COLLECTION', 'COLLECTED',
];

export function nextStatus(current: JobStatus): JobStatus | null {
  const i = FORWARD_PATH.indexOf(current);
  if (i === -1 || i === FORWARD_PATH.length - 1) return null;
  return FORWARD_PATH[i + 1];
}

// The custody move that naturally goes with each forward status step, so the
// UI can advance both at once with one transitionJob() call rather than two.
export const CUSTODY_FOR_STATUS: Partial<Record<JobStatus, CustodyState>> = {
  SENT_TO_HQ: 'IN_TRANSIT_TO_HQ',
  IN_REPAIR: 'AT_HQ_WORKSHOP',
  RETURNED_TO_BRANCH: 'IN_TRANSIT_TO_BRANCH',
  READY_FOR_COLLECTION: 'AT_BRANCH',
};
