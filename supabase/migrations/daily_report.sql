-- Daily Report module: per-branch brand lists, daily sales by brand, daily sales
-- by salesman, and an append-only history of every change.
--
-- Same rules as the repair module (docs/REPAIR_MODULE_SPEC.md):
--   * RLS is the only security wall; every table has it on.
--   * No DELETE is granted to anyone. A wrong figure is corrected, not removed.
--   * The history is written by a trigger, so no screen can forget to log a change.
--
-- NOTE: this deliberately stores daily sales figures on the server. That is an
-- exception to "sales data never leaves the browser", which still holds for the
-- Director's CSV analytics. See the spec, section on the Daily Report.

-- Lets daily_salesman_sales prove a salesman belongs to the same branch as the row.
alter table public.staff_members
  add constraint staff_members_id_branch_key unique (id, branch_code);

-- ---------------------------------------------------------------- brands
create table public.report_brands (
  id          uuid primary key default gen_random_uuid(),
  branch_code text not null references public.branches(code),
  name        text not null check (length(btrim(name)) between 1 and 60),
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (id, branch_code)
);
-- "Casio" and "CASIO" are the same brand: one per branch, ignoring case/spacing.
create unique index report_brands_branch_name_key
  on public.report_brands (branch_code, lower(btrim(name)));

-- ------------------------------------------------------ sales by brand
create table public.daily_sales (
  id           uuid primary key default gen_random_uuid(),
  branch_code  text not null,
  sale_date    date not null,
  brand_id     uuid not null,
  sales_amount numeric(12,2) not null default 0 check (sales_amount >= 0),
  quantity     integer not null default 0 check (quantity >= 0),
  updated_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now(),
  unique (branch_code, sale_date, brand_id),
  -- A row can only point at a brand belonging to the SAME branch.
  foreign key (brand_id, branch_code) references public.report_brands (id, branch_code)
);
create index daily_sales_branch_date on public.daily_sales (branch_code, sale_date);

-- --------------------------------------------------- sales by salesman
create table public.daily_salesman_sales (
  id           uuid primary key default gen_random_uuid(),
  branch_code  text not null,
  sale_date    date not null,
  staff_id     uuid not null,
  sales_amount numeric(12,2) not null default 0 check (sales_amount >= 0),
  updated_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now(),
  unique (branch_code, sale_date, staff_id),
  foreign key (staff_id, branch_code) references public.staff_members (id, branch_code)
);
create index daily_salesman_branch_date on public.daily_salesman_sales (branch_code, sale_date);

-- ---------------------------------------------------------- history
create table public.daily_report_history (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  actor       uuid,
  source      text not null,   -- which table changed
  branch_code text not null,
  sale_date   date not null,
  subject     uuid not null,   -- the brand or salesman the figure belongs to
  old_values  jsonb,
  new_values  jsonb
);
create index daily_report_history_branch_date on public.daily_report_history (branch_code, sale_date);

-- ---------------------------------------------------------- helpers
-- Who may ENTER figures for a branch on a date: a manager anywhere, or staff at
-- their own branch. Boss and admin are read-only, matching repair intake.
-- Never a future date (Malaysia time).
create function app.can_enter_sales(target text, d date)
returns boolean language sql stable security definer set search_path = ''
as $$
  select d <= (now() at time zone 'Asia/Kuala_Lumpur')::date
     and (app.role() = 'manager' or (app.role() = 'staff' and app.branch() = target))
$$;

-- Brand lists are looser: management anywhere, staff for their own branch.
create function app.can_edit_brands(target text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select app.is_management() or (app.role() = 'staff' and app.branch() = target)
$$;

-- Stamps who saved a row and when, so the client cannot claim someone else did.
create function app.stamp_daily_report()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create function app.log_daily_report_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  subj uuid;
  strip text[] := array['updated_at', 'updated_by'];
begin
  subj := (case tg_table_name
             when 'daily_sales' then to_jsonb(new)->>'brand_id'
             else to_jsonb(new)->>'staff_id' end)::uuid;
  if tg_op = 'INSERT' then
    insert into public.daily_report_history
      (actor, source, branch_code, sale_date, subject, old_values, new_values)
    values (auth.uid(), tg_table_name, new.branch_code, new.sale_date, subj,
            null, to_jsonb(new) - strip);
  elsif (to_jsonb(new) - strip) is distinct from (to_jsonb(old) - strip) then
    insert into public.daily_report_history
      (actor, source, branch_code, sale_date, subject, old_values, new_values)
    values (auth.uid(), tg_table_name, new.branch_code, new.sale_date, subj,
            to_jsonb(old) - strip, to_jsonb(new) - strip);
  end if;
  return new;
end;
$$;

create trigger daily_sales_stamp before insert or update on public.daily_sales
  for each row execute function app.stamp_daily_report();
create trigger daily_sales_log after insert or update on public.daily_sales
  for each row execute function app.log_daily_report_change();
create trigger daily_salesman_stamp before insert or update on public.daily_salesman_sales
  for each row execute function app.stamp_daily_report();
create trigger daily_salesman_log after insert or update on public.daily_salesman_sales
  for each row execute function app.log_daily_report_change();

-- -------------------------------------------------------------- RLS
alter table public.report_brands        enable row level security;
alter table public.daily_sales          enable row level security;
alter table public.daily_salesman_sales enable row level security;
alter table public.daily_report_history enable row level security;

create policy report_brands_read on public.report_brands for select to authenticated
  using ((select app.can_see_branch(branch_code)));
create policy report_brands_insert on public.report_brands for insert to authenticated
  with check ((select app.can_edit_brands(branch_code)));
create policy report_brands_update on public.report_brands for update to authenticated
  using ((select app.can_edit_brands(branch_code)))
  with check ((select app.can_edit_brands(branch_code)));

create policy daily_sales_read on public.daily_sales for select to authenticated
  using ((select app.can_see_branch(branch_code)));
create policy daily_sales_insert on public.daily_sales for insert to authenticated
  with check ((select app.can_enter_sales(branch_code, sale_date)));
create policy daily_sales_update on public.daily_sales for update to authenticated
  using ((select app.can_enter_sales(branch_code, sale_date)))
  with check ((select app.can_enter_sales(branch_code, sale_date)));

create policy daily_salesman_read on public.daily_salesman_sales for select to authenticated
  using ((select app.can_see_branch(branch_code)));
create policy daily_salesman_insert on public.daily_salesman_sales for insert to authenticated
  with check ((select app.can_enter_sales(branch_code, sale_date)));
create policy daily_salesman_update on public.daily_salesman_sales for update to authenticated
  using ((select app.can_enter_sales(branch_code, sale_date)))
  with check ((select app.can_enter_sales(branch_code, sale_date)));

create policy daily_report_history_read on public.daily_report_history for select to authenticated
  using ((select app.can_see_branch(branch_code)));

-- ------------------------------------------------------------ GRANTs
-- Supabase grants new tables to anon/authenticated by default; start from zero.
revoke all on public.report_brands, public.daily_sales,
              public.daily_salesman_sales, public.daily_report_history
  from anon, authenticated;
grant select, insert, update on public.report_brands        to authenticated;
grant select, insert, update on public.daily_sales          to authenticated;
grant select, insert, update on public.daily_salesman_sales to authenticated;
grant select                 on public.daily_report_history to authenticated;
-- No DELETE anywhere, and the history is written only by the trigger.

-- ------------------------------------------------------------- save
-- One atomic save for a whole day. SECURITY INVOKER (the default): runs as the
-- caller, so every policy above still applies. Without this, a dropped connection
-- between two requests could save the brand figures but not the salesman ones.
create function public.save_daily_report(
  p_branch text, p_date date, p_brands jsonb, p_salesmen jsonb
) returns void language plpgsql set search_path = ''
as $$
begin
  insert into public.daily_sales (branch_code, sale_date, brand_id, sales_amount, quantity)
  select p_branch, p_date, (e->>'brand_id')::uuid,
         coalesce((e->>'sales_amount')::numeric, 0),
         coalesce((e->>'quantity')::integer, 0)
  from jsonb_array_elements(coalesce(p_brands, '[]'::jsonb)) e
  on conflict (branch_code, sale_date, brand_id) do update
    set sales_amount = excluded.sales_amount, quantity = excluded.quantity;

  insert into public.daily_salesman_sales (branch_code, sale_date, staff_id, sales_amount)
  select p_branch, p_date, (e->>'staff_id')::uuid,
         coalesce((e->>'sales_amount')::numeric, 0)
  from jsonb_array_elements(coalesce(p_salesmen, '[]'::jsonb)) e
  on conflict (branch_code, sale_date, staff_id) do update
    set sales_amount = excluded.sales_amount;
end;
$$;
revoke all on function public.save_daily_report(text, date, jsonb, jsonb) from public, anon;
grant execute on function public.save_daily_report(text, date, jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------- seed
-- Starting brand lists carried over from the sales-keeper app, for the two
-- outlets it served. Other branches build their own list from the screen.
insert into public.report_brands (branch_code, name, sort_order)
select 'MRT', b, row_number() over ()
from unnest(array[
  'BATTERY (CLOCK)','Bonia','Caesar','Casio','Cro wc','Chronctech','Digitec',
  'Daniel klein','J.bovier','L. strap','Mini Focus','Naviforce','Pvc strap',
  'R-bat','R&E','REWARDS WATCH','S-bat','S.B. Polo','Slo/pokemon','S.parts',
  'Submarine','service']) as b;

insert into public.report_brands (branch_code, name, sort_order)
select 'JCI', b, row_number() over ()
from unnest(array[
  'ALBA','BIGOTTI','BONIA','CASIO','BABY-G','EDIFICE','G-SHOCK','CITOLE',
  'DANIEL KLEIN','ECO DRIVE','FREE GIFT','J.BOVIER','LONGINES','LEATHER STRAP',
  'MINI FOCUS','MIDO','NAVIFORCE','P.V.C STRAP','RENATA BATTERY','SONY BATTERY',
  'SANTA POLO','SEIKO','SEIKO 5','SEIKO SPORTS 5','SERVICE','SPARE PARTS',
  'STAINLESS STEEL STRAP','TISSOT']) as b;
