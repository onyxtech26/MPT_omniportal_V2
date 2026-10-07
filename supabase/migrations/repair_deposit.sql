-- Repair jobs can record a deposit paid at intake.
--
-- Owner's request: a customer sometimes pays part of the fee up front. Staff
-- key in the deposit beside the fee; the app shows the balance still owed
-- (fee - deposit). The balance is not stored: it is always worked out from the
-- two figures, so it can never drift out of step with them.

alter table public.repair_jobs add column deposit numeric(10,2);

alter table public.repair_jobs add constraint repair_jobs_deposit_valid
  check (deposit is null or (deposit >= 0 and (fee is null or deposit <= fee)));

-- create_repair_job gains p_deposit. Adding a parameter would create a second
-- overload beside the old one (and make PostgREST calls ambiguous), so the old
-- signature is dropped first. Body otherwise unchanged; still security invoker,
-- so RLS (repair_jobs_insert) applies exactly as before.
drop function public.create_repair_job(
  text, text, text, text, text, text, text, text, text, text, public.job_type,
  public.service_route, public.warranty_declaration, date, boolean, text,
  numeric, numeric, date, text, uuid);

create function public.create_repair_job(
  p_job_no text, p_branch_code text, p_customer_name text, p_customer_phone text,
  p_customer_phone_raw text default null, p_brand text default null,
  p_model_no text default null, p_serial_no text default null,
  p_services_required text default '', p_staff_observations text default null,
  p_job_type public.job_type default 'REPAIR_SERVICE',
  p_service_route public.service_route default 'IN_HOUSE',
  p_warranty_declaration public.warranty_declaration default null,
  p_purchase_date date default null, p_in_warranty_at_intake boolean default null,
  p_warranty_note text default null, p_fee numeric default null,
  p_declared_item_value numeric default null, p_promised_ready_date date default null,
  p_preprinted_chit_no text default null, p_served_by uuid default null,
  p_deposit numeric default null)
returns public.repair_jobs
language plpgsql set search_path = ''
as $$
declare
  v_job public.repair_jobs;
begin
  insert into public.repair_jobs (
    job_no, preprinted_chit_no, branch_code, served_by,
    customer_name, customer_phone, customer_phone_raw,
    brand, model_no, serial_no, job_type, service_route,
    services_required, staff_observations,
    warranty_declaration, purchase_date, in_warranty_at_intake, warranty_note,
    fee, deposit, declared_item_value, promised_ready_date,
    created_by, status, custody_state
  ) values (
    p_job_no, p_preprinted_chit_no, p_branch_code, p_served_by,
    p_customer_name, p_customer_phone, p_customer_phone_raw,
    p_brand, p_model_no, p_serial_no, p_job_type, p_service_route,
    p_services_required, p_staff_observations,
    p_warranty_declaration, p_purchase_date, p_in_warranty_at_intake, p_warranty_note,
    p_fee, p_deposit, p_declared_item_value, p_promised_ready_date,
    (select auth.uid()), 'RECEIVED', 'AT_BRANCH'
  )
  returning * into v_job;

  insert into public.repair_events (job_id, kind, to_status, to_custody, actor, served_by, reason)
  values (v_job.id, 'CREATED', v_job.status, v_job.custody_state, (select auth.uid()), p_served_by, 'Job received');

  return v_job;
end;
$$;

-- Tell the API layer about the new signature straight away.
notify pgrst, 'reload schema';
