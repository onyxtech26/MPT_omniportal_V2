-- The Manager views Repairs and the Daily Report but no longer enters anything.
--
-- Owner's decision: input is done by the staff at each outlet; the Manager only
-- watches status. Reads are unchanged (app.can_see_branch() still lets admin
-- and manager see every branch). Every WRITE that let a manager in now goes
-- through app.can_work_branch(): IT Admin anywhere (support), staff for their
-- own branch. Repair intake and daily figures are staff only, as before for
-- admin. Run after boss_no_branch_ops.sql.

create function app.can_work_branch(target text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(app.role() = 'admin' or (app.role() = 'staff' and app.branch() = target), false)
$$;

-- Daily Report: figures are staff-only; brand lists admin or own-branch staff.
create or replace function app.can_enter_sales(target text, d date)
returns boolean language sql stable security definer set search_path = ''
as $$
  select d <= (now() at time zone 'Asia/Kuala_Lumpur')::date
     and app.role() = 'staff' and app.branch() = target
$$;

create or replace function app.can_edit_brands(target text)
returns boolean language sql stable security definer set search_path = ''
as $$ select app.can_work_branch(target) $$;

-- Repairs: intake is staff at their own branch; later steps admin or own staff.
alter policy repair_jobs_insert on public.repair_jobs
  with check ((select app.role()) = 'staff' and branch_code = (select app.branch()));

alter policy repair_jobs_update on public.repair_jobs
  using ((select app.can_work_branch(branch_code)))
  with check ((select app.can_work_branch(branch_code)));

alter policy repair_events_insert on public.repair_events
  with check (exists (select 1 from public.repair_jobs j
                      where j.id = repair_events.job_id and app.can_work_branch(j.branch_code)));

alter policy contact_log_insert on public.contact_log
  with check (exists (select 1 from public.repair_jobs j
                      where j.id = contact_log.job_id and app.can_work_branch(j.branch_code)));

alter policy collections_insert on public.collections
  with check (exists (select 1 from public.repair_jobs j
                      where j.id = collections.job_id and app.can_work_branch(j.branch_code)));

alter policy collections_update on public.collections
  using ((select app.role()) = 'admin')
  with check ((select app.role()) = 'admin');

alter policy "signatures insert if job visible" on storage.objects
  with check (bucket_id = 'signatures' and exists (
    select 1 from public.repair_jobs j
    where j.id = ((storage.foldername(objects.name))[1])::uuid
      and app.can_work_branch(j.branch_code)));

-- Salesmen lists: IT Admin only.
alter policy staff_members_update on public.staff_members
  using ((select app.role()) = 'admin')
  with check ((select app.role()) = 'admin');

alter policy staff_members_write on public.staff_members
  with check ((select app.role()) = 'admin');

-- Small fix: the Ampang outlet showed as "Ampang"; every other outlet shows its
-- code, so clear the display name and let it show as "AM" too.
update public.branches set name = null where code = 'AM';
