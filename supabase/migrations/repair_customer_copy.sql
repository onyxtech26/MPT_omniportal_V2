-- The customer's copy of their intake record, on the public status page.
--
-- Owner's request: the customer should get a copy of what was recorded when
-- they left their watch. The QR on the printed slip already opens /status, so
-- that page becomes the copy, and staff can also send its link by WhatsApp.
--
-- get_job_status_by_token() is deliberately left exactly as it is (its comment
-- in the original migration says never to widen it). This is a SEPARATE
-- function with its own, larger but still fixed, list of columns: the details
-- the customer gave or was told at the counter, about their own watch.
--
-- Still NEVER returned here: the phone number, the fee, the deposit, the
-- declared value, staff names or ids. A customer may forward this link, so it
-- must not carry anything beyond what describes the watch and the job.

create function public.get_intake_record_by_token(p_token text)
returns table (
  job_no text, status public.job_status, branch_name text, intake_at timestamptz,
  brand text, model_no text, serial_no text, services_required text,
  staff_observations text, warranty_declaration public.warranty_declaration,
  purchase_date date, promised_ready_date date, updated_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select j.job_no, j.status, coalesce(b.name, j.branch_code), j.intake_at,
         j.brand, j.model_no, j.serial_no, j.services_required,
         j.staff_observations, j.warranty_declaration,
         j.purchase_date, j.promised_ready_date, j.updated_at
  from public.repair_jobs j
  left join public.branches b on b.code = j.branch_code
  where j.status_token = p_token
    and j.status <> 'VOID';
$$;

revoke execute on function public.get_intake_record_by_token(text) from public;
grant execute on function public.get_intake_record_by_token(text) to anon, authenticated;

notify pgrst, 'reload schema';
