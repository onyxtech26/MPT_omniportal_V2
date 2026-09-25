-- Lets a brand be deleted (staff for their own branch, management for any).
--
-- This is a deliberate, narrow exception to "no DELETE is granted anywhere". It is
-- safe because daily_sales points at report_brands through a foreign key with no
-- cascade: a brand that has ANY sales recorded cannot be deleted (the database
-- refuses with error 23503), so history can never be erased this way. Only a brand
-- nobody has used, such as a typo or a wrong addition, can actually be removed.
--
-- report_brands only. daily_sales, daily_salesman_sales and the history stay
-- delete-proof.
grant delete on public.report_brands to authenticated;

create policy report_brands_delete on public.report_brands for delete to authenticated
  using ((select app.can_edit_brands(branch_code)));
