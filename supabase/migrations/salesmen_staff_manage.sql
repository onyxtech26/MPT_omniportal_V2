-- Outlet staff can now add, rename and deactivate the salesmen of THEIR OWN branch
-- (IT Admin still any branch). Manager and Director stay view-only.
-- app.can_work_branch(target) already means exactly that: IT Admin anywhere, or
-- staff at their own branch (see manager_view_only.sql). Salesmen are never
-- deleted (no DELETE is granted), only deactivated, so past days keep their names.
-- Run once in the Supabase SQL editor. Safe to re-run.

alter policy staff_members_write on public.staff_members
  with check ((select app.can_work_branch(branch_code)));

alter policy staff_members_update on public.staff_members
  using ((select app.can_work_branch(branch_code)))
  with check ((select app.can_work_branch(branch_code)));
