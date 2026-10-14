-- The customer signs for collection on their own phone.
--
-- Owner's request: when a customer comes to collect without the repair chit,
-- they can sign on their own device instead of the counter screen.
--
-- How it works:
--   1. Staff start a signing request for the job (sign_requests row). It holds
--      a random token, expires after 15 minutes and can be signed once.
--   2. The link /sign?t=<token> goes to the customer: by WhatsApp to the phone
--      number on the repair (proves they hold the number the watch was booked
--      under), or as a QR on the counter screen when someone else collects.
--   3. The customer's phone, signed out, calls get_sign_request() to show what
--      they are signing and submit_sign_request() to send the signature.
--   4. The counter screen sees it signed, saves the SVG to the existing private
--      'signatures' bucket and calls collect_repair_job() exactly as for a
--      signature taken on the counter screen. Nothing about collection changes.
--
-- The two public functions are the only way a signed-out caller touches this
-- table, and each works on exactly the one row matching an unguessable token.
-- They never return the customer's phone number, the fee, or anything beyond
-- repair no., item and collector name.

create table public.sign_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.repair_jobs(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  collector_name text not null,
  collector_relationship text,
  delivery text not null check (delivery in ('WHATSAPP', 'QR')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  -- The signature as SVG text: a few KB. Kept here only until staff confirm
  -- collection, which copies it to the signatures bucket.
  signature_svg text check (signature_svg is null or length(signature_svg) <= 200000),
  signed_at timestamptz,
  cancelled_at timestamptz
);

create index sign_requests_job_id_idx on public.sign_requests (job_id);

alter table public.sign_requests enable row level security;

-- Staff can see requests for jobs they can see, and start or cancel them for
-- jobs they can work on (the same split as collections).
create policy sign_requests_read on public.sign_requests for select to authenticated
  using (exists (select 1 from public.repair_jobs j where j.id = sign_requests.job_id));

create policy sign_requests_insert on public.sign_requests for insert to authenticated
  with check (exists (select 1 from public.repair_jobs j
                      where j.id = sign_requests.job_id and app.can_work_branch(j.branch_code)));

create policy sign_requests_update on public.sign_requests for update to authenticated
  using (exists (select 1 from public.repair_jobs j
                 where j.id = sign_requests.job_id and app.can_work_branch(j.branch_code)))
  with check (exists (select 1 from public.repair_jobs j
                      where j.id = sign_requests.job_id and app.can_work_branch(j.branch_code)));

grant select, insert, update on public.sign_requests to authenticated;

-- PUBLIC: what the customer's phone shows before they sign.
create function public.get_sign_request(p_token text)
returns table (
  job_no text, brand text, model_no text, collector_name text,
  collector_relationship text, state text, expires_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select j.job_no, j.brand, j.model_no, r.collector_name, r.collector_relationship,
         case
           when j.status in ('COLLECTED', 'CANCELLED', 'VOID') then 'CLOSED'
           when r.cancelled_at is not null then 'CANCELLED'
           when r.signed_at is not null then 'SIGNED'
           when r.expires_at < now() then 'EXPIRED'
           else 'PENDING'
         end,
         r.expires_at
  from public.sign_requests r
  join public.repair_jobs j on j.id = r.job_id
  where r.token = p_token;
$$;

-- PUBLIC: the customer's phone sends the signature. Works once, only while the
-- request is pending.
create function public.submit_sign_request(p_token text, p_svg text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_svg is null or p_svg not like '<svg%' or length(p_svg) > 200000 then
    raise exception 'invalid signature';
  end if;

  update public.sign_requests r
  set signature_svg = p_svg, signed_at = now()
  from public.repair_jobs j
  where r.token = p_token
    and j.id = r.job_id
    and j.status not in ('COLLECTED', 'CANCELLED', 'VOID')
    and r.signed_at is null
    and r.cancelled_at is null
    and r.expires_at >= now()
  returning r.id into v_id;

  if v_id is null then
    raise exception 'This signing link has expired or was already used.';
  end if;
end;
$$;

revoke execute on function public.get_sign_request(text) from public;
revoke execute on function public.submit_sign_request(text, text) from public;
grant execute on function public.get_sign_request(text) to anon, authenticated;
grant execute on function public.submit_sign_request(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
