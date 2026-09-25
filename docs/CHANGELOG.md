# MPT OmniPortal — Dev Changelog

Running log of what changed in the app and why. Newest entries on top.
Each entry: a date, a short title, and plain-language notes — what was asked
for, what changed, and the reasoning. This is for remembering the work, not for
the FYP report (that is finished and archived under `_archive_fyp/`).

Format:
```
## YYYY-MM-DD — short title
- what changed / why
- files touched (if useful)
```

> **Convention change:** entries from here on carry **no date**. Newest still on
> top, so the order carries the sequence. Older dated entries are left as they are.

---

## Daily Report section: sales entry by brand and by salesman, moved in from sales-keeper

The branches already keep a daily sales log in a separate app (`sales-keeper`,
Firebase). This brings it into OmniPortal as a second section beside Repairs, so
staff use one login and the figures live in the same governed database.

- **Database (applied to the live project):** four new tables with RLS, a
  case-insensitive unique brand name per branch, composite keys that stop a row
  crossing branches, a trigger-written append-only history, and an atomic
  `save_daily_report` function. No DELETE granted. Starting brand lists for MRT
  and JCI carried over from sales-keeper.
- **Proven against real identities before any screen was built:** 25 checks in
  rolled-back transactions. Staff limited to their own branch (reads and writes),
  cross-branch brand/salesman references rejected, future dates and negative
  amounts rejected, DELETE refused at the grant, a forged `updated_by`
  overwritten, manager may enter anywhere, boss/admin read-only, signed-out
  denied. Security advisor: nothing new.
- **Screens:** `/daily-report` with Daily entry, Monthly and Setup tabs. Entry is
  one list of all brands with RM and quantity boxes (sales-keeper's
  one-brand-at-a-time wizard was replaced by a single list: everything visible,
  faster with many brands). The WhatsApp summary copies from saved figures.
- **Navigation fixed along the way:** a Repairs / Daily Report switcher for
  branch users; the Director and Manager gained links to both from the sales nav
  (nobody linked to `/repairs` before); Director/Manager get a Dashboard link back.
- **Decision, recorded in spec section 14:** daily sales are stored on the server.
  The Director's CSV analytics are unaffected and stay browser-only.
- **Not verified in a browser:** signing in needs a real password, which was not
  used. Build and type-check pass; the database rules were tested directly.
- Not done: receipt scanning (needs a server function and a Gemini key).

---

## IT Admin scoped down to what it actually does — no sales screens, real navigation

An admin signing in landed on the sales dashboard, and the console was only a small
"Admin" item in that nav; inside the console there was no way back out. The sales
screens do nothing for an admin — the CSV lives only in whoever loads it's browser,
so an admin saw an empty dashboard — and none of accounts, branches, audit log or
repair support needs sales figures.

- `lib/roles.ts`: `admin` removed from all four `/dashboard*` routes; admin now
  lands on `/admin/users`. Spec §4.5 matrix updated to match.
- `app/dashboard/layout.tsx`: the Admin nav item removed (admin no longer reaches it).
- `app/admin/layout.tsx`: a **Repairs** nav item added (read access, for helping a
  stuck branch); logo links to the console.
- `app/repairs/layout.tsx`: a **← Console** link, admin only, so `/repairs` is not a dead end.
- Still unbuilt from spec §4.3: "View as user", the one thing an admin doing remote
  support would genuinely want next.

---

## Repair module — IT Admin console built (Phase 5): accounts stop being a SQL exercise

Until now, every one of the seven login accounts in this system was created
by hand, via direct SQL, in this chat. That was fine for building — it's not
a real answer for a business with 12 branches. This phase makes account
administration a real console, with exactly one piece of it running outside
the browser, on purpose.

### The one Edge Function this system needs — and the discipline around why it's the only one

`supabase/functions/admin-users` is now the single place in the entire
system that holds the Supabase **service-role key** — the credential that
bypasses Row Level Security completely. It exists for exactly one reason:
creating a login account and resetting its password require
`auth.admin.createUser()` / `auth.admin.updateUserById()`, and only the
service-role key can call those. Everything else an admin does — disabling a
user, changing a role or branch — is a plain `profiles` UPDATE the browser
already sends directly, because `profiles_admin_update` already lets admin do
that under ordinary RLS. No new elevated code path was created where an
existing RLS policy already covered the job.

The function re-derives "is this caller actually an admin" from the caller's
own verified JWT on **every** request — a client scoped to their
`Authorization` header, reading their own `profiles` row (the same
`profiles_read_self` policy that already exists for any user to read their
own row). It never trusts a role claimed in the request body. Only after that
check passes does a second, service-role-scoped client ever get created.

`docs/REPAIR_MODULE_SPEC.md` §12 already named the reason this matters: the
*previous* MPT Supabase project was abandoned specifically because its
service-role key was pasted into a chat transcript and never rotated. That
key now lives in exactly one place — an environment variable Supabase itself
injects into this one function at runtime — and nowhere else in this repo,
this chat, or any `NEXT_PUBLIC_*` variable the browser could ever read.

### Forced password change, and the column-level grant that makes it safe

A new or reset account gets a random temporary password nobody chose.
`profiles.must_change_password` forces a real password screen
(`/change-password`) before that account can reach anything else. Clearing
the flag is the **only** column a non-admin may ever touch on their own
profile row — enforced by a column-level `GRANT`
(`grant update (must_change_password) on profiles to authenticated`), not
merely a policy. A policy alone would still need to stop someone smuggling a
role or branch change into the same `UPDATE` statement; restricting which
*column* can be touched at all closes that off regardless of what any future
policy says.

### An audit trail for accounts, separate from the one for repairs

`admin_audit_log` is new — `repair_events` already covers repair-job history,
but nothing recorded who created, disabled, or reassigned an *account*. Same
append-only stance as everywhere else in this schema: no `UPDATE`/`DELETE`
grant to any role, admin included. Role, branch, and active-flag changes are
captured **automatically by a trigger on `profiles`**, so a future screen
can't forget to log one; account creation and password resets are logged
explicitly by the Edge Function, since a `service_role` client never touches
`profiles` in a way a client-side trigger firing on a Data-API request would
catch the same way (it does fire — triggers run on any write regardless of
which client made it — but the explicit log call there also records the
*action* itself, "account_created" vs "password_reset", which the trigger
can't distinguish from a generic profile update).

### Screens

`/admin/users` — list, a "New Account" form, and a one-time "shown once, will
not be shown again" reveal of the temporary password after create or reset.
`/admin/branches` — all 14 seeded codes, name editing, activate/deactivate.
`/admin/audit` — read-only; there is no edit or delete button because there
is nothing to call. All three sit under a new `/admin` layout, admin-only,
the same sibling-layout pattern as `/dashboard` and `/repairs`.

### Verified live, start to finish

A non-admin calling the Edge Function directly was refused (`403`). The real
admin account created a real staff account for JKL through the real UI, with
the temporary password shown exactly once. Both validation rules were
confirmed: staff without a branch rejected, a non-staff role carrying a
branch rejected. **The forced-password-change loop was run to completion,
twice** — sign in with the temp password, land on `/change-password`, set a
real password, land on `/repairs` for real. Deactivating an account was
confirmed to actually lock it out (a correct password met with "no active
access assigned"), not just flip a badge. The audit log was confirmed to
contain every one of these actions, including the deactivation — produced by
the trigger, with zero explicit logging code anywhere in the UI for that path.

### Two real bugs, found by finishing the flow rather than stopping at "it looks right"

**The password-change loop bounced back on itself.** Completing it in one
continuous session (not a fresh page load) landed back on
`/change-password` instead of `/repairs` — even though the database already
held the correct, updated value. Root cause: a plain table `UPDATE` fires no
Supabase auth event, so nothing told the shared session context to re-fetch
the profile; the very next guard read the *stale* in-memory copy and bounced
back to the page that had just succeeded. Fixed by adding a `refreshProfile()`
function to the auth context and awaiting it before navigating away — and
re-verified properly this time: a second, brand-new account, one continuous
session from sign-in to landing on `/repairs`, no reload in between.

**A disabled account had no way out of its own error screen.** Signing in
with a correct password but a deactivated profile landed on "no active access
assigned" — with nothing on screen to sign out and try a different account.
On a shared counter device, that's a real dead end, not a cosmetic gap. Fixed
with a sign-out button on that exact branch of the login page, confirmed
working.

**Not done, and explicitly out of scope for this pass:** 8 of the 14 branches
still have no staff account (the console makes creating one trivial; doing it
for real accounts is a business decision, not a technical one); Phase 6
(retention job, off-Supabase backup, TIA/DPA paperwork) hasn't started.

---

## Repair module — paper & proof built (Phase 4): the slip, the QR, the signature

The repair module now covers what the paper chit actually did for the
customer, not just the record behind it: something physical to walk away
with, and a real signature at collection instead of a typed stand-in for one.

### One deliberate hole through RLS, and why it's safe

A customer checking on their own watch must not need an account. That means
one narrow, *intentional* exception to "everything requires a login":
`repair_jobs` gained a `status_token` column — a random value, one per job,
generated by the database itself — and a new function,
`get_job_status_by_token()`, that any caller, anonymous or not, may call with
a token and get back a small fixed set of columns (job number, status, brand,
model, promised date) for exactly the one matching row. It never returns the
phone number, the fee, or any free-text field, and the function's own SQL
comment says so explicitly, because this is the one place in the schema where
future maintenance must not "helpfully" widen what's returned.

This is a different animal from the `app.*` helper functions from Phase 1 that
got accidentally exposed to the internet — those were internal plumbing that
leaking would have been a mistake. This one is *built* to be a public
endpoint; the security advisor flags it with the same warning either way
(it can't read intent), which is exactly why the intent is written down in
the migration itself rather than left for someone to guess at later.

### Signatures live in a private Storage bucket, addressed like everything else

A new `signatures` bucket (not public) stores signature files at
`<job_id>/<timestamp>.svg`. Its access policies don't re-derive branch logic —
they just ask "does a `repair_jobs` row with this id exist for the caller",
the same `EXISTS` pattern already used for `repair_events` and `contact_log`.
One access rule, reused, rather than three slightly-different ones.

**Vector, not raster, and it's no longer a hope — it's a measurement.**
`signature_pad`'s `toSVG()` produces plain SVG text, uploaded directly (no PNG
conversion). A real captured signature came back at **592 bytes**. The spec's
prediction ("a few KB, not 50KB+") wasn't just correct, it undersold it.

### Screens

`/repairs/slip?job=<id>` — an 80mm printable slip, opened from a print icon in
the job detail panel: job number, chit number if one exists, normalised phone,
the resolved staff name (a small join from `served_by` to `staff_members`),
a QR code (via the `qrcode` package, rendered client-side — nothing calls an
external QR image service), and a bilingual PDPA notice. `app/globals.css`
gained the print rules: `@page { size: 80mm auto; margin: 0 }` plus a
`.no-print` class now on the app's own header, so what comes out of the
printer is the slip alone, not the app chrome around it.

`/status?token=...` — the page the QR points to. Deliberately a **sibling** of
`/`, `/dashboard`, `/repairs`, not nested under either login-guarded layout,
so it was never a question of adding it to `ROUTE_ACCESS` — it isn't gated at
all, on purpose.

Collection's "Customer signed" path now shows a real canvas
(`components/signature-pad.tsx`), not a typed declaration. Handles three
gotchas up front rather than leaving them to be rediscovered later:
`touch-action: none` so drawing doesn't scroll the page on a phone, sizing the
canvas to `devicePixelRatio` so it isn't blurry on any modern screen, and
never resizing after mount, since resizing a signature canvas silently
clears it.

The intake form and the printed slip both carry the same short bilingual
PDPA notice — required "at or before collection" by the amended Act (spec §10)
— naming the vendor factory as a recipient where a job goes out-of-house. This
is notice text, not a new consent-tracking table: a `TermsAcceptance`-style
record stays explicitly out of scope, per the spec's Phase 1 = logbook
decision.

### Verified live — including two checks that had to fail correctly, not just look right

- The slip rendered correctly on a fresh job: normalised phone, resolved
  staff name, working QR.
- `/status` was tested **genuinely logged out** — `localStorage.clear()`, not
  merely "hadn't clicked sign out" — and still answered correctly; a garbage
  token produced the clean "we couldn't find a repair job" message rather
  than an error.
- A real signature was drawn (three drag strokes, not a placeholder),
  uploaded, and confirmed in the database: `proof_method: SIGNATURE`,
  `signature_path` pointing at a real 592-byte object in storage, and a
  `signed_snapshot` capturing exactly what was on screen when it was signed.
- **The security check that mattered most**: signed in as the KLT staff test
  account and made a direct API request for the KMT job's signature file.
  Came back `404 not_found` — the storage policy correctly ties signature
  visibility to job visibility, the same branch scoping proven for
  `repair_jobs` itself back in Phase 2, now proven again one layer down, for
  a completely different Supabase primitive (Storage, not just tables).

### A snag with nothing to do with the app itself

The dev server wouldn't start on its usual port — a **completely unrelated**
barber-salon booking project was already listening on port 3000. Not touched;
killing another project's live process on a shared machine on a guess is
exactly the kind of thing to avoid. `.claude/launch.json` gained
`"autoPort": true` (a real, durable fix — the config now tolerates a
busy port on any future run) and this session's server ran on an alternate
port instead.

**Not done, and explicitly out of scope for this pass:** the full condition
grid, intake photos, and quotations remain Phase-2-of-the-domain-model,
deferred by the original "logbook, not the whole chit" decision; a
`TermsAcceptance`-style consent record is a Phase 6 compliance item, not this
one; Phase 5 (the IT Admin console) still means accounts are created by hand
via SQL.

---

## Repair module — the core loop built (Phase 3): intake through collection

`/repairs` stops being a placeholder. A watch can now actually be taken in,
tracked, and collected, start to finish, through real screens — and the whole
loop was driven for real, as real staff and manager accounts, not just
exercised at the API.

### The database gained three functions, not just more tables

`create_repair_job`, `transition_repair_job`, `collect_repair_job` — each one
wraps a business action that touches more than one table (a job plus its first
history row; a status change plus the history row explaining it; a collection
record plus closing the job) in a single atomic Postgres function. All three
are `SECURITY INVOKER`: they run as whoever called them, so every RLS policy
and every `GRANT` from Phase 1 still applies exactly as it would to a direct
request — nothing is bypassed, the only thing gained is atomicity. Without
this, a connection dropping between two separate browser requests could leave
a job that exists with no history, or a job marked `COLLECTED` with no
`collections` row to back it up.

### The client-side rule that makes RLS worth having

`lib/repairs.ts` reads are plain `select *` — there is no `if (role === staff)
filter by branch` anywhere in the client. That absence is the point: the
filtering already happened inside Postgres before a single row reached the
browser. The same code runs for every role; only the results differ, and only
because the database decided that, not the UI.

### The offline outbox, and the discipline it forced

`lib/repairs-outbox.ts` is deliberately small — one IndexedDB store, no sync
engine, no conflict resolution — because it solves exactly one problem: the
network dropping the moment a counter presses Save with a customer's watch in
hand. Building it surfaced a real correctness issue before it shipped: the job
number has to be generated **once**, by the browser, before the first attempt,
and reused verbatim on every retry. `createRepairJob()` originally generated
its own number internally, which meant a job that failed offline and retried
later would get a *second, different* number — orphaning whatever was already
printed and handed to the customer. Fixed by moving `jobNo` into
`CreateJobInput` as something the caller generates once, never something the
write path invents.

### Screens

`/repairs` — branch-scoped list, search, status filter, and a slide-over detail
panel. The detail panel is addressed by `?job=<id>`, not a dynamic
`/repairs/[id]` route — `docs/REPAIR_MODULE_SPEC.md` already called this out:
a static export can't `generateStaticParams()` for job IDs that don't exist at
build time. `/repairs/new` is the digital chit — the actual intake form.
Status and custody advance together with one click (`CUSTODY_FOR_STATUS` maps
each forward step to where the watch should physically be); a "Mark Collected"
flow and a "Log a contact attempt" form round out the loop. Both `/repairs`
routes were added to `ROUTE_ACCESS` alongside the existing ones, since Phase
0's fail-closed fix means an unlisted route is unreachable, not merely open.

### Verified for real, end to end, not just at the API

Signed in as the real KMT and KLT staff test accounts and a manager account
and drove one job through its **entire lifecycle** via the actual UI: created
at intake (job number generated live, e.g. `KMT-2609-7VVM`) → Sent to HQ → In
Repair → Returned to Branch → Ready for Collection → Collected, checking the
database after each step to confirm the atomic writes landed correctly (the
collection record, the full history trail, the phone number normalised from
"012-345 6789" to "60123456789"). A contact log entry was logged and confirmed.
A void was performed and confirmed, with a reason. The manager account, viewing
the same list, correctly saw **"All branches · 3 jobs"** where each staff
account saw only its own branch's one job — the exact scoping behaviour proven
at the API in Phase 2, now proven again through the screens a real counter
will actually use.

### Two real defects, found by checking rather than assuming, fixed before moving on

**`/repairs/new` was completely unreachable.** Clicking "New Job" did nothing;
navigating there directly bounced back to `/repairs`. Not a routing bug in the
framework — a direct, working consequence of the Phase 0 fail-closed fix:
`/repairs/new` had never been added to `ROUTE_ACCESS`, so `canAccess` correctly
denied it. The deeper cause took a second pass to find: even after adding the
route, it *still* redirected, because this app's static export sets
`trailingSlash: true` and `usePathname()` was returning a trailing-slash form
that didn't match the map's key. Fixed properly rather than papering over it
with a slash-twin entry: `canAccess()` now normalises the path itself before
looking it up, so every future route needs exactly one entry, in one form.

**A staff account could void its own branch's job — through the database
directly, not just in theory.** The "Void" button is hidden from staff in the
UI, but the `repair_jobs_update` RLS policy from Phase 1 had no opinion about
*which* status a staff member could move a job to — only that they could move
one at their own branch at all. In an architecture where RLS is supposed to be
the *only* security wall, a hidden button is not a wall. Found by asking "what
does the database actually permit", the same discipline Phase 1's RLS test
matrix was built on — not by trusting the UI's own restrictions. Fixed inside
`transition_repair_job`: a transition to `VOID` now requires
`app.is_management()`, checked server-side, with a clear error otherwise.
**Re-verified live**: signed in as the KMT staff account through the real
Auth API and called the RPC directly — rejected, `"only a manager, boss, or
admin may void a job"`.

A third, smaller gap surfaced while writing the void fix and was closed before
it ever touched a real record: the original `transition_repair_job` set
`status = 'VOID'` without also setting `voided_at`/`void_reason` on the job
row — the reason was captured in the event but not on the row the `check`
constraint (`repair_jobs_void_has_reason`) actually exists to protect. Fixed,
and confirmed by SQL after a live void that both columns populated correctly.

**Not done, and explicitly out of scope for this pass:** signature capture
(collection currently records `CHIT_SURRENDERED` or a typed `SIGNATURE`
declaration, not an on-screen signature — see spec §5.3); the offline outbox
is built and unit-reasoned about but not exercised against an actually-dropped
connection in this session; only 2 of the 12 active branches have staff
accounts and `staff_members` rows (deliberate test fixtures, not a rollout).

---

## Repair module — real login built (Phase 2), RLS proven against live accounts

The role picker (`app/page.tsx`) is gone. Signing in now goes through Supabase
Auth for real — an email, a password, a session — and what you can see after
that is decided entirely by Postgres RLS on the tables built in Phase 1, not by
anything the browser asserts about itself.

**New:** `lib/supabase.ts` (the one client the app shares — built on the
*publishable* key, safe in a browser bundle), `lib/auth-context.tsx` (wraps the
Supabase session with a `profiles` lookup for role + branch), `app/repairs/`
(layout + a placeholder page — see below for why it exists at all).

**Rewritten:** `app/page.tsx` (real sign-in form), `app/dashboard/layout.tsx`
and `app/dashboard/page.tsx` (the old `localStorage` token guards replaced by
the auth context; two dead/dangerous bits of code removed along the way — the
`role !== 'demo'` check, since `'demo'` was never a real role, and a second,
independent guard in `page.tsx` that checked a `'token'` key real auth never
sets, which would have silently bounced every dashboard visit back to login the
moment this landed).

**`lib/roles.ts` gained a fourth role and a real landing-page map.** `Role` now
includes `'staff'`. More importantly: `DEFAULT_ROUTE_FOR_ROLE` sends each role
to a page it can actually reach (`staff → /repairs`, everyone else →
`/dashboard`) instead of one hardcoded destination. This exists because of the
Phase 0 fix to `canAccess` — once unlisted routes deny by default, redirecting
a rejected staff login to `/dashboard` (which staff cannot reach either) would
have been a redirect to nowhere. `app/repairs/` had to exist, even as a
placeholder, for the login to have somewhere honest to send a staff account.

**`app/repairs/` is deliberately a sibling of `app/dashboard/`, not nested
under it** — its own layout, its own auth guard, and critically **not** wrapped
in `<DataProvider>`. This is the route arrangement `docs/REPAIR_MODULE_SPEC.md`
§3.3 called for: the sales CSV path stays structurally untouched by any of this,
provably, not just by convention.

### The RLS test matrix — deferred twice, now done

Five real accounts signed in through the actual Supabase Auth API (not the
admin SQL connection, which bypasses RLS and proves nothing about it): IT
Admin, Boss, Manager, and one Retail Staff account each for two branches (KMT,
KLT), with one test job seeded per branch. Then 8 live requests against the
real REST API with real JWTs:

| # | Test | Result |
|---|---|---|
| 1 | KMT staff reads `repair_jobs` | sees only the KMT job |
| 2 | Manager / Boss / Admin read `repair_jobs` | see both branches' jobs |
| 3 | KMT staff inserts a job for their own branch | succeeds, HTTP 201 |
| 4 | KMT staff inserts a job for KLT | blocked, HTTP 403 |
| 5 | **KMT staff UPDATEs their own job's `branch_code` to KLT** | blocked, HTTP 403 |
| 6 | Boss attempts to create a job (only staff/manager may) | blocked, HTTP 403 |
| 7 | Admin attempts to edit a `repair_events` row | blocked — **`permission denied`, not an RLS message**: PostgREST's own hint names the missing `GRANT UPDATE`, confirming append-only is enforced at the grant level exactly as designed, not by a policy that a later migration could loosen |
| 8 | Fully anonymous read and insert, no signed-in user at all | blocked, HTTP 401, zero grants |

Test 5 is the one that matters most: it is the exact "with `using` alone, a
staff member could move their own job to another branch" trap the original
schema design called out. It was tested for real, not just reasoned about, and
it held.

**Verified live in the browser**, not only at the API: staff login lands on
`/repairs` showing the correct branch and role; boss login lands on `/dashboard`
with full nav and the correct name/role in the header; sign-out from either
layout returns cleanly to the login form; a fresh page load keeps the session
(the Director does not need to sign in again just because the tab reloaded);
a wrong password shows Supabase's own generic "Invalid login credentials" —
accurate and safe, since it never reveals whether the account exists.

### A spec prediction, confirmed empirically

Creating the fifth test account hit Supabase's free-tier email rate limit after
only two confirmation emails sent. `docs/REPAIR_MODULE_SPEC.md` §12 had already
flagged this — "Supabase's built-in mail is capped at 2 messages/hour and is
explicitly not for production" — as a reason real branch accounts will need a
proper mail sender before go-live, not the built-in one. This is that
prediction landing in practice rather than staying theoretical. Worked around
for these dev accounts by creating them directly with SQL and confirming them
instantly — a reasonable thing to do for test fixtures the team controls, not a
path anyone should take for real staff accounts.

**Not done, and not in scope for Phase 2:** seeding real accounts for the other
10 active branches (only KMT and KLT exist, as test fixtures), and the Vercel
Pro upgrade (a billing action — left for the account owner, not acted on here).

---

## Repair module database — rebuilt after a Supabase account mix-up

Between sessions, the Supabase connection was reconnected and landed on a
**different account** than the one holding the project below — the company's
`Onyxx Tech Hub` org, which turned out to hold two unrelated *live* systems: Onyxx
Tech's own operations database, and a separate client's booking system with real
production data (nearly 2,000 bookings). Caught before anything was touched —
table names were listed to work out what the connection pointed at, nothing was
read or written — and flagged rather than guessed at, since which account should
hold a client's data is not a call to make silently.

The original `mpt-omniportal` project (personal `kunacosta's Org`) was then
deliberately deleted and rebuilt fresh in the same org once the correct account
was reconnected. **New project ref: `qetoquashslxdliyxgyb`** — the old ref
(`ostcubnjpvkdlupcsbdq`) below no longer exists. Same region (Singapore), same
schema, same free tier.

**Rebuilt correctly on the first pass.** The two defects described below belonged
to the *original* build. The rebuild applied the corrected version directly — RLS
helper functions created straight into the `app` schema, `branches`' write grant
added alongside its write policies — so this time the advisor came back clean and
the grant matrix came back right without a fix-up migration.

---

## Repair module — database built (Phase 1)

*(Describes the original build. Superseded by the rebuild above — the schema and
every design choice below carried over unchanged, only the project ref changed.)*

Supabase project **`mpt-omniportal`** created in **Singapore** (`ap-southeast-1`),
free tier, in `kunacosta's Org`. Deliberately a **fresh** project: the old MPT one
had a master key that was pasted into a chat transcript during a rebuild and never
rotated, and that key bypasses row-level security entirely — which is the only
security wall in this architecture.

Seven tables: `branches`, `profiles`, `staff_members`, `repair_jobs`,
`repair_events`, `contact_log`, `collections`. RLS enabled on every one.

**Design choices worth knowing before extending this:**

- **`branches.code` is the primary key**, not a random UUID. These codes (`JCI`,
  `KMT`, …) come from the POS export and are already how the company identifies
  outlets, so `repair_jobs.branch_code = 'KMT'` reads correctly without a join.
  Foreign keys use `on update cascade` in case a code is ever renamed.
- **14 codes seeded, 12 active.** `CS` fell from 5,027 transactions in 2024 to 369
  in 2025 (wound down) and `HQ` runs ~10 a year (head office, not a counter). No
  logins for either.
- **`status` and `custody_state` are separate columns.** Work stage and physical
  location are different questions; merging them produces states like
  `AT_VENDOR_AWAITING_PARTS_DEPOSIT_PAID`.
- **Money is `numeric(10,2)`**, never a float. Floats cannot represent `0.10`
  exactly.
- **Phone stored twice** — normalised digits for lookup and `wa.me` links, plus the
  raw text as staff typed it. A check constraint enforces the normalised form.
- **`in_warranty_at_intake` is stored, not computed on read.** If a brand changes
  its warranty period later, recomputing an old job would rewrite history and
  contradict what the customer was told.
- **Business rules live in `check` constraints**, not just the UI: staff must have a
  branch and management must not; a void must carry a reason; a warranty claim must
  carry the purchase date it is calculated from.
- **Append-only is enforced by `GRANT`, not by policy.** `repair_events` and
  `contact_log` have INSERT and SELECT only. **No `DELETE` is granted on any
  table.** A policy can be replaced by a later migration; a permission never
  granted is a harder floor.
- **`repair_jobs` UPDATE policy has both `using` and `with check`.** With `using`
  alone, a staff member could open their own job and change `branch_code` — writing
  a row into a branch they can no longer read.

**Two defects found and fixed during the build:**

### The RLS helper functions were published as a public web API

Supabase exposes everything in the `public` schema over REST, so `app_role()`,
`app_branch()`, `app_is_management()` and `app_can_see_branch()` became live
endpoints at `/rest/v1/rpc/...`, callable by anyone including signed-out visitors.
Caught by Supabase's own security advisor.

They leaked nothing — each returns only the caller's own value, so an anonymous
call returns null. But a `SECURITY DEFINER` function reachable from the open
internet is the wrong shape to leave lying around; it becomes a breach the first
time someone edits it without remembering it is publicly callable.

Fixed structurally rather than by patching permissions: the functions moved to a
new `app` schema that PostgREST does not publish, so they are no longer an endpoint
at all. Policies were repointed at them and the originals dropped. Advisor now
returns zero findings.

### `branches` had write policies but no write grant

`branches` was granted `SELECT` only, while carrying INSERT and UPDATE policies —
so admin and boss could not actually maintain the outlet registry and the policies
were dead code.

Root cause: treating `GRANT` and `POLICY` as one gate. They are two, and a query
must pass both — the grant decides whether an operation is permitted on the table
at all, the policy decides which rows. Fixed by granting INSERT and UPDATE, leaving
the policies to restrict them to admin/boss.

**Verified:** security advisor clean; `anon` holds zero privileges on any table in
`public`; grant matrix confirms no DELETE anywhere and INSERT/SELECT only on the
two append-only tables.

**Still outstanding:** full role-by-role RLS tests need real signed-in accounts, so
they land with Phase 2 — and must be written before any repair-module UI.

---

## Repair module + real login — design finalised

The first page (the role picker) is being replaced by a real login with four roles
— IT Admin, Boss/Director, Manager, Retail Staff — and the first staff feature is a
**Watch Repair Status** module digitalising the paper repair chit and the physical
logbook.

Nothing is built yet. This entry records that the design is settled and where it
lives: **`docs/REPAIR_MODULE_SPEC.md`**, with the board in `PROJECT_STATUS.md`.

**The architectural problem, and the answer.** A repair job is created by staff at
one branch, worked on at the HQ workshop, and collected weeks later. That is shared,
multi-device, durable data — it cannot live in the browser the way the sales CSV
does. But the sales CSV *must* keep living there, because "the Director's data never
leaves his machine" is currently a **structural** guarantee: with `output: 'export'`
there is no server that could receive it even by accident.

**Decision: keep the static export, and let the browser talk directly to Supabase,
with Postgres Row Level Security deciding which rows each login may see.** The
alternative — dropping the static export for a normal server-rendered Next.js app —
was rejected for the same reason the Meeting Agenda serverless option was rejected
earlier: it downgrades the privacy promise from *impossible* to *nobody has written
that code yet*. Cost of the chosen route: RLS is the only security wall, so
automated policy tests get written **before** any feature code.

- **Two data rules in one app, deliberately.** Sales stays browser-only; repairs go
  to a server. The load-bearing invariant is that `lib/salesData.ts`,
  `lib/csvStore.ts` and `app/dashboard/data-context.tsx` never import a network
  client. Worth enforcing with a lint rule (note: `eslint.ignoreDuringBuilds` is
  currently `true`, so that rule would not fail the build until it is flipped).
- **Phase 1 is the logbook, not the whole chit.** Job number, customer, phone,
  brand, status, custody, contact log, collection proof. The 12×7 condition grid,
  photos, quotations and deposits are Phase 2. The logbook is what staff actually
  flip through and what nobody can search — roughly a fifth of the work, most of
  the daily value.
- **Custody is in Phase 1**, contrary to the first instinct. MPT runs a central HQ
  workshop, so *every* job leaves its branch. "Where is my watch" is precisely what
  paper cannot answer, and the chit's own terms make MPT liable for a lost article.
- **Branch list resolved from the dataset.** The "13 vs 14 outlets" disagreement in
  `V2_REQUIREMENTS.md` turns out to be neither: both files carry 14 codes, but `CS`
  fell from 5,027 to 369 transactions between the two years (wound down) and `HQ`
  runs ~10 a year (head office, not a counter). **12 active retail counters.** Seed
  all 14, mark 12 active, no logins for CS or HQ.
- **Both job numbers kept.** A system-generated `job_no` (`KLT-2609-7F3K`) is
  authoritative and is generated on the device so a slip prints even offline; the
  pre-printed chit serial is recorded optionally as the join to the paper logbook.
  Duplicates warn rather than block — a hard block trains staff to type garbage.
- **Owner's calls, recorded with their trade-offs:** one shared login per branch
  with a "served by" name (attribution is a selected name, not proof — the data
  model preserves an upgrade to per-staff PINs without a migration); IT Admin gets
  full data access; customers still walk away with paper.
- **Repo hazards found during the audit** are listed in spec §15. Two matter before
  auth work starts: `canAccess` at `lib/roles.ts:18` **fails open**, so a new
  `/repairs` route would be reachable by every role until someone lists it; and the
  comment at `next.config.ts:23` wrongly says `output: 'export'` is "for mobile",
  inviting someone to delete the line that makes the privacy guarantee real.
- **PDPA is now a schema question, not paperwork.** Retention has to be a column
  and a scheduled job; the customer notice must be bilingual and must name the
  vendor factory as a recipient; breach notification is 72 hours, so detection
  matters as much as prevention.

- Files added: `docs/REPAIR_MODULE_SPEC.md`, `PROJECT_STATUS.md`

---

## 2026-09-07 — Explorer page: filter by anything, and a saved-report history

Ported the two things the Director's own `sales-pulse` tool does that OmniPortal
could not. His tool reads the same POS export we do, so this closes a real gap:
he could answer "how did OGY do on CAESAR at AM in March?" and we could not.

**Decision: a new page, not global filters.** The three existing pages were
reconciled against the official POS report and stay exactly as they were — filter
state lives inside the Explorer, not in the shared data context, so a filter can
never leak into them. Promoting it later is a deliberate second step.

**Decision: our counting wins where the two tools disagree.** `cost_amt` is already
a line total and is not multiplied by quantity (his multiplies, overstating cost on
multi-unit lines); returns forced negative; orphan credit notes dropped.

- **Engine split** (`lib/salesData.ts`). `aggregate()` did three jobs in one pass and
  threw the cleaned rows away. Now `normalizeRecords()` cleans (the expensive part —
  return matching, date parsing, grouping) and `aggregateRows()` totals; `aggregate()`
  is a wrapper, so every existing caller is untouched. Cleaning runs once per file
  instead of once per click: 509 ms once, then ~20–60 ms per filter change on 46k rows.
- **Row-level filters** — `applyFilters(rows, filters, skip)` and `facetValues()`.
  `skip` is what makes the chip lists usable: when drawing the Brand chips it leaves
  `brand` unconstrained, so picking one brand does not hide all the others. Ported
  from his `filtered(skip)` (`app.js:13`).
- **Explorer page** (`app/dashboard/explorer/`) — filter sidebar (outlet, sales
  category, salesperson, brand, vendor, customer, model), KPI row with **ASP**,
  trend chart at monthly/weekly/daily/weekdays/weekend, and top-10 breakdowns.
- **Watch vs Service is read back off the label `normalizeRow` already assigned**,
  not re-derived from the category codes — one classification, so the two cannot drift.
  (His 13-code list folds `OH`/`OT` into Service; ours keeps Voucher and Deposit separate.)
- **Saved-report history** (`lib/csvStore.ts`, DB v1 → v2). Was one CSV under one key;
  now keeps the newest 5, with load/delete. Metadata and payload are in **separate
  object stores** so listing does not deserialise ~9 MB per report — his tool stores
  the *parsed rows*, which is bigger still. Dedupes on filename+size; a quota failure
  degrades to "no history" rather than blocking the load.
- **Finding: the Customer filter is dead on this data.** `cust_no` is `0`/`000` on
  every row of all three exports — every sale is a walk-in. Rather than delete the
  dimension, a chip group with fewer than 2 values hides itself, so Customer returns
  automatically if a file with real customer numbers ever arrives. His tool has the
  same dead panel (rewritten three times, `app.js:40-42`).

**Bug found and fixed while building:** the Explorer's trend chart rendered its Units
line as a ~7px sliver while the bars were correct. Cause: `interval="preserveStartEnd"`
on the Recharts `XAxis` — in Recharts 3.x it collapses a `Line`'s x positions in a
`ComposedChart` while `Bar` (which positions off the band scale directly) is unaffected.
Silent: no console error. Fixed by removing `interval` and using `minTickGap` for label
thinning, with a comment in the file so it is not re-added. Same family as the
`AnimatePresence mode="wait"` note at `app/dashboard/page.tsx:493` — a chart-adjacent
prop that breaks rendering without complaining.

**Verified** (the integrity convention: money may be relabelled, never moved):
- Old vs new engine on the 46k-row 2026 file — revenue, units, cost, transaction count
  and every per-outlet figure identical. Grand total RM 5,511,299.89 unchanged.
- Reconciled again to the printed POS report, 1–30 April 2026, through the full UI:
  **KLT RM 26,456.00**, **KMT RM 35,824.75** — still exact.
- Cross-filtering: selecting KLT leaves Outlet at all 14 (so a second is pickable)
  while Salesperson 78→9, Brand 120→28, Vendor 54→24, Model 4,567→736.
- Weekday (152) + weekend (60) buckets = daily (212), so the split is exhaustive.
- History: v1→v2 upgrade on a real existing database kept `kv`; save, dedupe, 5-report
  cap with eviction, load, delete and survival across reload all confirmed.
- Static export builds; no `fetch` anywhere in `app/`, `lib/`, `components/`.

Files: `lib/salesData.ts`, `lib/csvStore.ts`, `lib/roles.ts`,
`app/dashboard/data-context.tsx`, `app/dashboard/layout.tsx`,
`app/dashboard/explorer/page.tsx`, `components/explorer-filters.tsx`,
`components/filter-chip-group.tsx`, `components/saved-reports.tsx`.

## 2026-09-02 — Seiko watch variants counted as one line

- Decision: **keep grouping product lines by description** (they read better than
  category codes), and merge only where management asks.
- Seiko watches arrive under three category codes (`SEI`, `SEI-5`, `SEI-SP5`) and
  several spellings ("SEIKO SPORT 5", "SEIKO SPORTS 5", "SEIKO-SPORTS 5"). All now
  report as a single **SEIKO** line: RM 351,255 / 268 units on the 2026 file.
- **Seiko clocks stay separate**, as originally requested — `SEI-WC` →
  SEIKO WALL CLOCK (RM 13,536), `SEI-AC` → SEIKO ALARM CLOCK (RM 1,214). Fixed
  labels also fold away a typo in the data ("SEIKO ALRAM CLOCK").
- Keyed on category code rather than description text, so spelling differences cannot
  split the line. It also keeps stray rows off screen — some `SEI` rows carry a staff
  name or a discount note instead of a product.
- Integrity check: grand revenue unchanged at RM 5,511,300; product lines 125 → 121.

## 2026-09-02 — Validated against the official POS report; Voucher and Deposit split out

- **Reconciled to the company's printed report.** The Director provided the *Sales
  Profit Report — By Product Group (Detail)* for 1–30 April 2026. Checked line by line:
  **KLT RM 26,456.00** and **KMT RM 35,824.75** — both exact, every category matching.
- **This confirmed the returns fix.** KMT April has 8 returns. Before the fix we read
  RM 36,060.55 (S-BAT 393 units vs the report's 389; SUB 17 vs 15). After it, exact.
  The official report deducts returns; now so do we.
- **`OH` = Voucher and `OT` = Deposit are now their own lines**, out of the Service
  group — neither is a sale of goods and both distorted it (vouchers ≈ −RM 114k a year,
  deposits up to +RM 167k). Fixed labels also keep their raw descriptions off screen:
  voucher rows contain **staff names**, deposit rows contain transaction references.
  (The printed report labels `OH` as "OTHER"; the Director confirmed it is vouchers.)
- Recorded the full **category code → name** list from the report (CAS=Casio,
  S-BAT=Sony battery, SUB=Submarine, …) in `V2_REQUIREMENTS.md`.
- Noted: the report groups by `inv_category` under the title "By Product Group",
  confirming the company treats the category code as the product grouping. Our app
  still groups by description — switching would match the official report exactly.

## 2026-09-02 — Returns now deducted, and a shared period filter

- 🐛 **Returns were inflating revenue.** The Director asked us to check this and he
  was right. Returns are marked by a `-Return` description (or `trx_type = CN`), but
  **the POS records about half of them with POSITIVE amounts and quantities**, so
  they were being added instead of subtracted. Examples from one outlet:
  a correct return reads `qty −1, amt −239`; a wrong one reads `qty +1, amt +129`.
  The engine now forces amount, quantity and cost negative for every return, exactly
  as the Director's own tool does.
  - 2025 file: RM 5,793,679 → **RM 5,692,813** (229 bad rows, RM 100,866 swing)
  - 2026 file: RM 5,639,309 → **RM 5,511,300** (291 bad rows, RM 128,010 swing)
  - About 2% of revenue in both years.
- **New period filter.** A bar under the navigation lets you pick a **month** or a
  **custom date range** after loading a report. Month shortcuts are built from the
  months actually in the file, so you cannot select a period with no data.
  - It lives in the layout and is read from the data context, so **one choice applies
    to every page** — verified: March 2025 shows RM 913,677.45 on both the dashboard
    and Brand Performance, with product lines dropping from 150 to 73.
  - `data-context.tsx` now keeps the parsed rows and re-aggregates on filter change,
    rather than re-reading and re-parsing megabytes of CSV each time.
- **Category meanings confirmed by the Director:** `OH` = voucher, `OT` = deposit.
  Both remain inside the Service group to match his tool, but `OH` is heavily negative
  (~−RM 114k), which depresses the Service total — worth asking if they should be
  separate lines.
- Noted: the 2026 file contains **14 outlets** (2025 has 13).

## 2026-09-02 — Dashboard shows sales and units together (+ drill-down bug fixed)

- **Monthly Performance** is now a dual-axis chart: **bars = sales** (ringgit, left
  axis), **line = units** (count, right axis). The two cannot share a scale, so each
  gets its own. The Sales/Units toggle is gone — both are always visible.
- **Units added alongside revenue** on: branch cards, Network Top Brands, the Salesman
  Leaderboard, Brand Success (top and bottom), the salesperson's headline total and
  their Overall Brand Ranking. Engine gained `OutletSummary.totalUnits`.
- 🐛 **Fixed a regression I introduced with the chart.** Clicking an outlet changed the
  heading but not the content — the detail view never mounted.
  `<AnimatePresence mode="wait">` waits for the exiting view's animation to complete,
  and the chart's `ResponsiveContainer` resize observer kept that view re-rendering so
  it never finished. Dropped `mode="wait"`. The chart had been verified in isolation
  and looked fine; the breakage was on the same screen, one interaction away.
- Data note: the "Bottom 3 brands" panel surfaces junk `inv_desc` values (e.g. `CN`,
  `CHIT NO: 53384`) rather than genuinely weak brands — worth filtering later.

## 2026-09-02 — Leaderboards show sales, units and profit together

- Same change as Brand Performance, applied to the ranking boards: every row now
  shows **Sales**, **Units** and **Profit** (with margin %) as columns, each with
  its share of the total. The summary card shows all three totals. The metric
  buttons became a **"Rank by"** control that only sets the ordering.
- Why it matters: the comparison across measures *is* the insight. `MPT SB` reads
  in one line as RM 432,517 (7.5% of sales) · 19,019 units (42.2% of units) ·
  RM 413,362 profit (95.6% margin) — fifth by revenue but nearly the top vendor by
  profit. Previously that needed three separate views.
- `app/dashboard/leaderboard/page.tsx`. Table scrolls horizontally on narrow
  screens rather than squashing the columns. Verified in-browser.

## 2026-09-02 — Brand Performance shows sales and units together

- Requested: stop making the user toggle between sales and units — show both.
- Each row now has **Sales** and **Units** columns, each with its own share of the
  total; the summary card shows both totals; the old metric toggle became a
  **"Rank by"** control that only changes the ordering.
- Why it matters: the contrast is the insight, and it is now visible at a glance
  without switching views — TISSOT is 20.3% of sales but 1.3% of units, while
  Service is 13.9% of sales and 71.9% of units.
- `app/dashboard/brands/page.tsx`. Verified in-browser; ranking by either measure
  reorders correctly while both figures stay visible.

## 2026-09-02 — Meeting Agenda removed from the web app

- **Why:** the Agenda was the only feature still requiring the Python backend, and
  no backend is deployed with the static Vercel site, so it could not work there.
- **Options weighed:** port to the browser with ExcelJS; run it as a Vercel
  serverless function (**rejected** — the CSV would travel to Vercel, breaking the
  Director's "data never leaves my machine" requirement); simplify the output and
  drop the template; or keep the existing desktop build.
- **Decision:** remove it from the website. The Manager already uses the `.exe`
  monthly for his agenda and is unaffected; the website is the Director's dashboard.
- **Removed:** `app/dashboard/agenda/`, plus `lib/branches.ts`, `lib/download.ts`
  and `lib/apiError.ts` (all agenda-only); the nav entry and its `ROUTE_ACCESS`
  rule; `.env.example` rewritten — the app needs no environment variables at all.
- **`backend/` deliberately kept** — it is the source of the Agenda logic the
  Manager's desktop build depends on. Note the Electron packaging was already
  removed, so a *new* `.exe` would need it restored from git history.
- Build re-verified: 5 static routes, no backend reference anywhere in the app.
- Also noted: the Dashboard is for the **Director only**; two further systems are
  planned for other staff.

## 2026-09-02 — Reconciled to the Director's own tool, Brand Performance rebuilt, Leaderboards, deploy prep

- **Found the Director's reference app** (`Boss mpt Project/sales-pulse/`, 26 Aug):
  a working browser-only analytics tool of his own, tagline *"Files never leave
  this browser"* — independent confirmation of the V2 architecture. He gave it to
  us as a reference ("build something like this, or better"), so its logic is the
  authority on how MPT counts things.
- **Counting rules adopted** (`lib/salesData.ts`) so both apps agree:
  - a sale is `trx_type` PS/NI; a `CN` credit note counts only when matched to a
    real sale (same `inv_cd` + amount) — orphan returns dropped
  - **transactions = distinct `trx_no`, not rows** (43,676 → 32,774; ATV
    RM 132.65 → RM 176.78) — our figure had been ~33% overstated
  - Service = the company's **13** category codes, not 3. `S-BAT` alone is
    RM 512k; ~RM 726k had been showing as watch brands
  - **NOT adopted:** his `cost × qty`. Verified across products at varying
    quantities that `cost_amt` is already a line total, so multiplying
    double-counts. His margin boards overstate cost — raise with him.
- **Brand Performance rebuilt on actual sales** (`app/dashboard/brands/page.tsx`).
  It had been ranking brands by an **AI forecast for Oct–Dec 2025** — a prediction
  of a period that has since passed — with real model figures underneath, under a
  name implying history. Now: outlet scope, Sales/Units toggle, expandable model
  breakdown, all from the loaded CSV. Removes the last forecast dependency.
- **New Leaderboards page** (`app/dashboard/leaderboard/page.tsx`): Vendor /
  Salesperson / Brand / Outlet × Sales / Units / Margin, modelled on his boards.
  Engine gained `vendors`, `vendorUnits`, `vendorCost`, `brandCost`,
  `salesmenUnits`, `salesmenCost`.
- **"SW" finally identified.** It is also a vendor code — the largest supplier at
  RM 1.78M — selling TISSOT, LONGINES, RADO, MIDO, i.e. **Swatch Group**. So
  `SW ROGER` = Roger on the Swatch concession counter. Answers the open question
  behind "SW and other sales put together, add option to separate".
- **Business findings worth showing the Director:**
  - Service is **71.9% of all units sold but only 13.9% of revenue**
  - `MPT SB` (in-house service) is the **2nd-largest profit generator**
    (RM 413,362 at 95.6% margin) — nearly matching Swatch Group on far less revenue
- **Deploy prep (target: Vercel).** Stripped desktop/mobile packaging: removed
  `electron/`, `android/`, `dist-electron/` (~1.3 GB), `capacitor.config.ts`,
  `generate-assets.js`, plus the Electron/Capacitor deps and scripts. Removed the
  Capacitor native-save branches from `lib/download.ts` and the dashboard PDF
  export. `npm run build` verified: all 5 routes prerender as **Static**.
  `output: 'export'` kept — now for Vercel rather than Capacitor.
- **Also:** "Upload Data" renamed **"Load Data"** (it never uploaded — clearer for
  the Director); added `start-omniportal.bat` to run it locally.
- **Still blocking deploy:** the **Meeting Agenda** is the only remaining caller of
  `NEXT_PUBLIC_BACKEND_URL` (`app/dashboard/agenda/page.tsx:182`). No backend is
  deployed to Vercel, so it must be ported to run in-browser (ExcelJS) first.

## 2026-09-01 — V2 kickoff: go server-less (client-side), boss/manager feedback
- **Context:** New internship direction. Boss wants the portal to run with **no
  server** — "don't connect to my server, just upload the CSV and look inside."
  Decided architecture: **pure client-side web app** (no FastAPI, no MariaDB, no
  Supabase). This makes most of `RUNBOOK.md` (SSH/systemd/scp/DB) obsolete for V2.
  Working repo target: `onyxtech26/MPT_omniportal_V2` (not yet pushed).
  Full requirements/decisions tracked in `docs/V2_REQUIREMENTS.md`.
- **Phase 1 — nav & cleanup:** sidebar → top nav (`app/dashboard/layout.tsx`);
  deleted Demand Forecast + Seasonal Insights pages; kept Brand Performance;
  removed those routes from `lib/roles.ts`. (Note: Brand Performance is still
  forecast-backend-powered — flagged to revisit.)
- **Phase 2 — client-side data engine (app now runs with NO backend):**
  - `lib/salesData.ts` — browser port of `backend/datasource.py` `load_summary`
    (PapaParse + in-browser aggregation). Grand total verified identical to source.
  - `lib/csvStore.ts` — remembers last CSV in IndexedDB (on-machine only).
  - `data-context.tsx` rewired off `fetch('/api/summary')` to the local engine;
    upload + empty-state parse the file in the browser.
  - Server login → client-side **role picker** (`app/page.tsx`): Director /
    Manager / IT Admin. Removed "Ask the Data" assistant (needs a server);
    deleted dead `chatStorage.ts`, `demo-data.ts`, `assistant-bot.tsx`.
  - Extended engine to track **units** (`trx_qty`) alongside revenue everywhere.
- **Phase 3 (in progress):**
  - Salesperson **month-by-month** view (`app/dashboard/page.tsx`): each month
    expands to a Product / Sales / Units table, big→small (boss request).
  - **Grouping cleanup** in `salesData.ts` `normalizeRow` + `GroupingOptions`:
    Pin/battery/labour/service → one "Service" group (#2); merge ROGER/ROGER SW/
    SW ROGER via `canonicalSalesman` (#3); Seiko watches kept separate from wall/
    alarm clocks (#7); returns netted; whitespace-dup descriptions merged.
    Validated on real 2025 data; grand total unchanged.
- **Still pending:** UI toggles to *separate* SW / unit-vs-sales, big→small
  everywhere, monthly perf on overview, vendor-name labels; **Phase 4** vendor
  leaderboard; **Phase 2b** agenda offline port (ExcelJS); V2 repo push.
- **Verified in browser:** role picker → upload prompt → CSV → correct totals,
  sorted big→small, persisted across reload; salesperson month drill-down exact.
  Typecheck clean throughout.

## 2026-08-30 — Pivot to maintenance mode + project cleanup
- **Context:** The FYP is finished and the report has been submitted. Kunalan is
  now doing an internship and wants to keep developing/upgrading the app, with a
  simple record of what he does — and explicitly **no more report updates**.
- **Instructions changed:** rewrote `PROJECT 2/CLAUDE.md` so every session now
  focuses on app development. Removed the entire report/Chapter-4 workflow from
  the session-start routine (no more `doc_status.md` comparison or docx regen).
  Session-end now logs to this changelog + the module `PROJECT_STATE.md` files +
  the memory `SCRUM.md` board.
- **New log:** created this `docs/CHANGELOG.md` as the single running "what I did"
  record.
- **Cleanup (PROJECT 2 root is not a git repo — deletes were permanent):**
  - Deleted the dead report scaffolding: `chapter4_draft.md`, `gen_chapter4.py`,
    `Chapter4_Implementation.docx`, `doc_status.md`, plus stale scratch
    (`_backend.log`, `uvicorn.log`, `_guideline_text.txt`, `_v3_text.txt`,
    `plan.txt`, `.pytest_cache/`).
  - Archived (moved, not deleted) all finished FYP deliverables into
    `_archive_fyp/`: `report/`, `report_backup_2026-08-10/`, `presentation/`,
    `slide_images/`, `notebooklm_sources/`, the NotebookLM pack + zips, the FYP
    PDFs, `FYP_docs/`, `CAPTURED_DOCS/`, `agenda_June.xlsx`.
  - Left the live app untouched: `mpt-omniportal/`, `mpt-agenda-automation/`,
    `datamining/`, `forecasting/`, `latest sales profit repport/`, `start.bat`.
- **No application code changed this session.**
