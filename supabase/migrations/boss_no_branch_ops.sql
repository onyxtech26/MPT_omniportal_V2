-- The Director (boss) no longer sees Repairs or the Daily Report.
--
-- Owner's request: the boss account only uses the sales dashboard. The web app
-- hides both modules (lib/roles.ts); this makes the database agree, so the boss
-- login cannot read or change branch data through the API either.
--
-- Two levers:
--   1. app.can_see_branch() — the read gate for repair_jobs (and through it
--      repair_events, contact_log, collections and the signatures bucket),
--      daily_sales, daily_salesman_sales, daily_report_history, report_brands
--      and staff_members. Boss is dropped from it. Boss has no branch_code, so
--      the "own branch" half never matches for boss.
--   2. app.runs_branches() (new) — admin or manager. Replaces is_management()
--      wherever management could WRITE branch data. is_management() itself is
--      left alone: profiles_read_self and other non-branch rules still use it.
--
-- Every write RPC (create/transition/collect_repair_job, save_daily_report,
-- reorder_report_brands) is security invoker, so RLS covers them too.

create function app.runs_branches()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(app.role() in ('admin', 'manager'), false) $$;

create or replace function app.can_see_branch(target text)
returns boolean language sql stable security definer set search_path = ''
as $$ select app.runs_branches() or app.branch() = target $$;

create or replace function app.can_edit_brands(target text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select app.runs_branches() or (app.role() = 'staff' and app.branch() = target)
$$;

alter policy repair_jobs_update on public.repair_jobs
  using ((select app.runs_branches())
         or ((select app.role()) = 'staff' and branch_code = (select app.branch())))
  with check ((select app.runs_branches())
         or ((select app.role()) = 'staff' and branch_code = (select app.branch())));

alter policy collections_update on public.collections
  using ((select app.runs_branches()))
  with check ((select app.runs_branches()));

alter policy staff_members_update on public.staff_members
  using ((select app.runs_branches()))
  with check ((select app.runs_branches()));

alter policy staff_members_write on public.staff_members
  with check ((select app.runs_branches()));
