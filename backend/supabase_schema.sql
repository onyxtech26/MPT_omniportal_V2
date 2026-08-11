-- MPT OmniPortal — Supabase schema.
--
-- Everything the `supabase` data source needs, in one runnable file: the table,
-- its indexes, the access-control model, and the read-only query RPC used by
-- both the dashboard and the natural-language assistant.
--
-- To stand the database up on a new project, paste this into the Supabase SQL
-- Editor and run it, then load the demo rows with:
--
--     python backend/seed_supabase.py https://<ref>.supabase.co
--
-- Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------- table
create table if not exists public.sales_transactions (
    id           bigserial primary key,
    com_unit     text,          -- branch code
    saleman_cd   text,          -- salesperson
    inv_desc     text,          -- brand / product description
    inv_cd       text,          -- model code
    inv_category text,
    trx_mode     text,          -- D / C, used by the D-minus-C net sales rule
    trx_date     timestamptz,
    trx_amt      numeric,
    cost_amt     numeric,
    trx_qty      numeric,
    list_price   numeric
);

-- Covering the query patterns in datasource.py: per-branch aggregation, date
-- ranges, case-insensitive brand matching, category filters, and the combined
-- branch+date grain the monthly and daily breakdowns use.
create index if not exists idx_sales_com_unit     on public.sales_transactions (com_unit);
create index if not exists idx_sales_trx_date     on public.sales_transactions (trx_date);
create index if not exists idx_sales_inv_desc     on public.sales_transactions (upper(inv_desc));
create index if not exists idx_sales_inv_category on public.sales_transactions (inv_category);
create index if not exists idx_sales_unit_date    on public.sales_transactions (com_unit, trx_date);

-- ------------------------------------------------------- access control
-- Two distinct mechanisms, often conflated:
--
--   RLS   decides WHICH ROWS a role may read. Here it is permissive, because
--         the demo dataset is uniformly readable. This is where per-branch
--         scoping would go if a manager should see only their own branch.
--   GRANT decides WHICH OPERATIONS a role may perform. This is what makes
--         writes impossible for the application, and therefore what actually
--         contains LLM-authored SQL.
alter table public.sales_transactions enable row level security;

drop policy if exists "demo data is publicly readable" on public.sales_transactions;
create policy "demo data is publicly readable"
    on public.sales_transactions
    for select
    to anon, authenticated
    using (true);

revoke insert, update, delete, truncate on public.sales_transactions from anon, authenticated;
grant select on public.sales_transactions to anon, authenticated;

-- ----------------------------------------------------------- query RPC
-- SECURITY INVOKER (the default — note the absence of SECURITY DEFINER) is
-- load-bearing: the function executes with the CALLER's privileges, i.e. anon's
-- SELECT-only grant. Declaring it SECURITY DEFINER would run it as the owner
-- and dissolve the guarantee above.
--
-- The guards inside are defence in depth, not the primary control:
--   * the regex rejects anything not starting with SELECT
--   * transaction_read_only fails any write at the transaction level
--   * statement_timeout bounds a runaway query
--   * the pinned search_path prevents search-path hijacking
create or replace function public.run_readonly_query(q text)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
    result jsonb;
begin
    if q !~* '^\s*select\s' then
        raise exception 'Only SELECT statements are permitted';
    end if;

    perform set_config('statement_timeout', '8s', true);
    perform set_config('transaction_read_only', 'on', true);

    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', q)
        into result;

    return result;
end;
$function$;

grant execute on function public.run_readonly_query(text) to anon, authenticated;

-- ---------------------------------------------------------- hardening
-- Supabase ships an event-trigger function that auto-enables RLS on new tables.
-- It is granted to PUBLIC by default, which makes it reachable at
-- /rest/v1/rpc/rls_auto_enable and raises two security-advisor warnings. It is
-- not part of this application's API. Event triggers fire through DDL
-- processing rather than role grants, so revoking EXECUTE does not stop it
-- doing its job (verified: creating a table still auto-enables RLS).
do $$
begin
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
        revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
    end if;
end $$;
