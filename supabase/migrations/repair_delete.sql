-- Lets a mistaken repair be deleted.
--
-- Owner's request: staff sometimes key in a repair by mistake and need to remove
-- it. Rules:
--   * Outlet staff may delete a repair at their own outlet while it is still
--     "Received" (nothing has happened to the watch yet).
--   * IT Admin may delete any repair (e.g. clearing test data).
--   * Nobody else (Manager, boss) can delete.
-- Its events, contact log and collection go with it (existing ON DELETE CASCADE).
-- A snapshot of every deleted repair is written to admin_audit_log first, so a
-- deletion can always be traced and, if needed, re-keyed.
--
-- Fixing wrong details needs no change here: repair_jobs_update already lets
-- staff (own outlet) and IT Admin edit a repair.

grant delete on public.repair_jobs to authenticated;

create policy repair_jobs_delete on public.repair_jobs for delete to authenticated
  using (
    (select app.role()) = 'admin'
    or ((select app.role()) = 'staff'
        and branch_code = (select app.branch())
        and status = 'RECEIVED')
  );

create function app.log_repair_job_delete()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.admin_audit_log (actor, action, details)
  values (auth.uid(), 'repair_deleted', to_jsonb(old));
  return old;
end;
$$;

create trigger repair_jobs_log_delete before delete on public.repair_jobs
  for each row execute function app.log_repair_job_delete();
