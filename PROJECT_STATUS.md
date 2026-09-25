# MPT OmniPortal — Project Status

The status board. Read this first when picking up work; it is the source of truth
for where things left off.

Companion documents:
- `docs/REPAIR_MODULE_SPEC.md` — the repair module + login design (read before building it)
- `docs/V2_REQUIREMENTS.md` — V2 sales-dashboard requirements and history
- `docs/CHANGELOG.md` — running log of what changed and why

> **Recording convention:** entries here and in the changelog carry **no dates or
> times**. Order carries the sequence.

---

## Now

**Phases 0 through 5 are done.** The repair module is a complete working
system now: login, the whole repair lifecycle, the printed slip and public
status check, and — as of this phase — a real IT Admin console. Accounts are
no longer hand-seeded via SQL; an admin creates them through a screen, and the
one operation that genuinely needs the database's master key (creating a
login, resetting a password) runs through a server-side Edge Function that
never puts that key anywhere near a browser.

Supabase project **`mpt-omniportal`** (ref `qetoquashslxdliyxgyb`), Singapore
`ap-southeast-1`, free tier, in `kunacosta's Org`.

Everything is specified in `docs/REPAIR_MODULE_SPEC.md`. Blocked on nothing.
Waiting on the Director only for items that do not block the build — see spec §13.

> **Still open before real customer data:** Vercel Pro upgrade (billing action,
> needs the account owner); seeding real accounts for the other 8 active
> outlets that still have none (JCI, AM, GPL, MRT, SAT, TBT — the console now
> makes this a five-minute task, just not yet done); photos, the condition
> grid, and quotations (explicitly deferred — see spec's "Phase 1 = logbook,
> not the full chit" decision); Phase 6 (retention job, off-Supabase backup,
> TIA/DPA paperwork).

---

## Next

In order. Full detail in spec §11.

- [ ] **Daily Report follow-ups** — browser test as staff/manager/Director; register
      the `MIL` branch (in the POS export, not in the database) then load its 4
      salesmen and 10 brands from `daily_report_seed_pos_2026.sql`; decide whether
      `CS` (marked inactive, but 3,195 sale lines in 2026) should be reactivated;
      create staff logins for the branches that have none (e.g. MRT); tidy
      near-duplicate brands at MRT and JCI; deactivate the 3 old "Counter Staff"
      test salesmen (KLT, KMT). Not built: receipt-photo scanning (needs a server
      function and an AI key).
- [ ] **Username login** — the login only accepts an email. Workable option: derive a
      placeholder email from a username (costs emailed password resets for those
      accounts). Undecided.
- [ ] **"View as user"** for IT Admin (spec §4.3) — specified, not built.
- [ ] **Small code fixes found in review:** admin function does not check its
      audit-log writes succeeded; nothing stops an admin deactivating their own
      account; profile loads twice at startup; a wrong comment in the forgot-password
      handler; 9 style-level lint errors.
- [x] **Phase 0 — repo hygiene** — three of four done, see Done below.
  - [ ] Upgrade Vercel to Pro — **billing action, needs the account owner.** I do
        not act on payment/plan changes without explicit sign-off each time; this
        is a manual step for whoever holds the Vercel account.
- [x] **Phase 1 — database** — done, see Done below.
- [x] **Phase 2 — real auth** — done, see Done below. RLS test matrix complete.
- [x] **Phase 3 — repair module core** — done, see Done below. Offline outbox
      built but only lightly exercised (see Still open in the changelog entry).
- [x] **Phase 4 — paper & proof** — done, see Done below.
- [x] **Phase 5 — IT Admin console** — done, see Done below.
- [ ] **Phase 6 — compliance & operations** *(1–2 days)* — retention job,
      off-Supabase backup, TIA/DPA paperwork on file. Not started.
- [ ] **Phase 4 — paper & proof** *(2–3 days)* — printed slip, QR, signature capture
- [ ] **Phase 5 — IT Admin console** *(1.5–2 days)*
- [ ] **Phase 6 — compliance & operations** *(1–2 days)*

---

## Done

- **Daily Report section built** (`/daily-report`) and live. Entry is three steps:
  tick the brands that sold, key in RM and quantity for those, then each salesman's
  total for the day; plus a Monthly roll-up, a Setup tab (add, rename, reorder,
  delete brands; add or deactivate salesmen) and a WhatsApp summary that follows the
  brand order. All access rules are Postgres RLS, tested with real identities
  (`supabase/migrations/daily_report*.sql`). Starting data loaded from the Jan to Aug
  2026 POS export: 78 salesmen and about 250 brands across 13 branches (`MIL`
  skipped, see Next). Brands can be deleted only if never used (the database refuses
  otherwise); nothing else is deletable. Decision: daily sales are stored on the
  server, an exception to the browser-only rule, recorded in spec section 14.
  **Never opened signed-in in a browser yet: test as staff, manager and Director.**
- **IT Admin scoped to the console.** Admin no longer reaches the sales screens
  (`/dashboard*`), lands on `/admin/users` after login, and has a Repairs nav item
  in the console with a Console link back from `/repairs`. Fixes the "no way back"
  dead end. Route/navigation change only — no database change. Spec §4.5 matrix
  and changelog updated.
- **Phase 5 — IT Admin console, built and driven live end-to-end, including a
  real bug found and fixed mid-verification, not just tested in theory.**
  - **The one Edge Function this system needs, and why it's the only one.**
    `supabase/functions/admin-users` is the single place in the whole system
    holding the Supabase service-role key — the credential that bypasses RLS
    entirely. It exists ONLY because creating a login account and resetting a
    password require `auth.admin.*` calls, which only that key can make.
    Every other admin action (disabling a user, changing a role or branch) is
    an ordinary `profiles` UPDATE the browser already does directly, because
    admin already has RLS permission for it. Re-derives "is this caller an
    admin" from the caller's own verified JWT on every request — never trusts
    a role claimed in the request body.
  - **Forced password change.** New/reset accounts get a random temporary
    password nobody chose; `must_change_password` forces a real password
    screen before anything else. A user may clear only that one flag on only
    their own row — enforced by a column-level `GRANT`, not just a policy, so
    no amount of client-side cleverness can smuggle a role or branch change
    through the same door.
  - **A real audit trail for account administration**, separate from
    `repair_events` (which covers repair-job history, not accounts).
    Append-only by `GRANT` — no `UPDATE`/`DELETE` to any role, admin included.
    Role/branch/active changes are captured **automatically by a database
    trigger**, so a future UI cannot forget to log one; account creation and
    password resets are logged explicitly by the Edge Function, since those
    never touch `profiles` in a way a trigger would see.
  - **Screens:** `/admin/users` (list, create with a one-time temporary
    password reveal, reset password, activate/deactivate), `/admin/branches`
    (all 14 codes, name editing, activate/deactivate), `/admin/audit`
    (read-only, no edit or delete button exists because there is nothing to
    call).
  - **Verified live, start to finish, not just at the API:**
    - A non-admin calling the Edge Function directly: refused, `403`.
    - The real admin created a real account through the real UI — a JKL
      branch account — with the temporary password shown once, exactly as
      designed.
    - Validation confirmed both ways: staff without a branch rejected, a
      non-staff role carrying a branch rejected.
    - **The forced-password-change loop, tested to completion** — sign in
      with the temp password → redirected to `/change-password` → set a real
      password → land on `/repairs` for real, not bounced back.
    - Deactivating an account was confirmed to actually lock it out (a
      correct password, but "no active access assigned") — not just flip a
      badge in a list.
    - The audit log was confirmed to contain every one of the above, with the
      deactivation entry produced by the trigger with zero explicit logging
      code in the UI.
  - **A real bug found and fixed during verification, not left as a finding:**
    completing the password-change flow in one continuous session (not a
    fresh page load) landed back on `/change-password` instead of `/repairs`,
    even though the database was already correct. Root cause: a plain table
    `UPDATE` fires no auth event, so the shared session context had no reason
    to refetch — the redirect target's own guard read the *stale* in-memory
    profile and bounced back. Fixed by adding `refreshProfile()` to the auth
    context and awaiting it before navigating away, then re-verified in a
    single continuous session with a second, brand-new account — confirmed
    fixed, landed on `/repairs` correctly.
  - **A second, smaller gap found live**: a disabled account signing in
    landed on "no active access assigned" with no way to sign out and try a
    different account from the UI — a real dead end for a shared counter
    device. Fixed with a sign-out button on that exact screen, verified.
- **Phase 4 — paper & proof, built and verified live, including two
  cross-branch security checks that had to pass, not just look right.**
  - **Database:** `status_token` (a random, unguessable value, one per job) +
    `get_job_status_by_token()` — the one function in this schema that is
    *deliberately* public, returning a small, fixed set of columns (job
    number, status, brand/model, promised date) for exactly one row. Never
    returns phone, fee, or free text. A private `signatures` Storage bucket,
    with policies that piggyback on repair_jobs' own visibility rules rather
    than re-deriving branch logic — "can you see this signature" reduces to
    "can you see this job."
  - **Screens:** `/repairs/slip` — an 80mm printable customer slip (QR code,
    normalised phone, resolved staff name, bilingual PDPA notice), reachable
    from a print icon in the job detail panel; `/status` — the public page the
    QR points to, a deliberate sibling of `/`, `/dashboard`, `/repairs` rather
    than nested under the login-guarded ones, so a customer never needs an
    account; real on-screen signature capture (`signature_pad`) wired into the
    collection flow, replacing the earlier typed-declaration placeholder.
  - **Verified live, not just built:**
    - The printed slip renders correctly with a working QR.
    - `/status` answers correctly for a **genuinely anonymous** visitor
      (session wiped via `localStorage.clear()`, not just "not clicked
      logout") and handles a wrong token cleanly.
    - A real signature was drawn, captured, and uploaded — **592 bytes**,
      confirming the spec's "SVG, not PNG" storage decision in practice, not
      just on paper — with a `signed_snapshot` (job no, customer, item,
      timestamp) bound to the collection record.
    - **A second staff account, at a different branch, was confirmed unable
      to fetch the first branch's signature file** — a direct API call
      correctly came back "not found" (not even confirming the file exists),
      proving the storage policy is genuinely branch-scoped and not just
      "any signed-in user."
  - **One real-world snag, unrelated to the app itself:** the dev server's
    default port turned out to be occupied by a completely unrelated
    project's server. Rather than touch a process this session didn't start,
    `.claude/launch.json` gained `"autoPort": true` and the server was run on
    an alternate port for this session — a durable fix, not a one-off
    workaround.
- **Phase 3 — repair module core built and driven end-to-end for real.**
  - **Database:** three new Postgres functions —
    `create_repair_job`, `transition_repair_job`, `collect_repair_job` — each
    `SECURITY INVOKER` (runs as the caller, every RLS policy and GRANT still
    applies) wrapping a multi-table write in one atomic transaction. Without
    these, a dropped connection between two separate browser requests could
    leave a job with no history row, or "collected" with no collection record.
  - **`lib/repairs.ts`** — the one place every screen reads and writes through.
    No client-side branch filtering anywhere in it: every read is a plain,
    unfiltered `select *`, and the results differ by role only because
    Postgres RLS already filtered them before they reached the browser.
  - **`lib/repairs-outbox.ts`** — a deliberately small offline outbox (one
    IndexedDB store, no sync engine) for the one moment offline actually
    matters: a dropped connection mid-intake. `job_no` is generated once, by
    the browser, before the first attempt, and reused verbatim on every retry
    — never regenerated — so a slip printed at intake is never orphaned by a
    later sync producing a different number.
  - **Screens:** `/repairs` (branch-scoped list + search + status filter +
    slide-over detail panel, detail addressed by `?job=<id>` rather than a
    dynamic route — a static export can't `generateStaticParams()` for job IDs
    that don't exist yet), `/repairs/new` (the digital chit — full intake
    form), inline status/custody transitions, a contact-log form, and a
    collection flow.
  - **RLS proven again, this time through the built screens, not just curl.**
    Signed in as real KMT and KLT staff accounts and a manager account and
    drove a job through its **entire lifecycle for real**: created at intake →
    Sent to HQ → In Repair → Returned to Branch → Ready for Collection →
    Collected, with the atomic history and collection record confirmed in the
    database after each step. Manager login confirmed to see **"All branches ·
    3 jobs"** where staff saw only their own branch's job.
  - **Two real defects found and fixed during this build, not left as findings
    for later:**
    1. **`/repairs/new` was unreachable** — a direct, illustrative consequence
       of the Phase 0 fail-closed fix: a new route not added to
       `ROUTE_ACCESS` is denied, not merely unrestricted. Root cause turned
       out to be a trailing-slash mismatch between what `usePathname()`
       returns and how routes were keyed in the map (this app's static export
       sets `trailingSlash: true`). Fixed by normalising the path inside
       `canAccess()` itself rather than hand-maintaining a slash-twin for
       every route.
    2. **Staff could void their own branch's job via a direct API call**,
       even though the "Void" button is hidden from staff in the UI. Hiding a
       button is not a security boundary in an architecture where RLS is
       supposed to be the *only* wall — found by asking "what does the
       database actually allow", not by trusting the UI. Fixed inside
       `transition_repair_job` itself (a `VOID` transition now requires
       `app.is_management()`, checked server-side) and **re-verified with a
       live API call as the KMT staff account**, which came back rejected:
       `"only a manager, boss, or admin may void a job"`.
  - **A design gap closed along the way:** the original `transition_repair_job`
    updated `status` to `'VOID'` without also setting `voided_at`/`void_reason`
    on the row — the reason existed on the event but not on the job itself.
    Fixed before it ever reached a real job, and confirmed by SQL after a live
    void: both columns populated correctly.
- **Phase 0 — repo hygiene (3 of 4).** `next.config.ts:23`'s comment no longer
  says "for mobile" — it now explains `output: 'export'` is load-bearing for the
  privacy guarantee, so it doesn't get deleted as a cleanup. `lib/roles.ts`
  `canAccess` denies unlisted routes by default (verified safe: every route that
  existed was already explicitly listed, so nothing changed for existing pages).
  `README.md`'s plaintext V1 credentials replaced with a pointer to the real spec.
  Vercel Pro upgrade is the one item left — a billing action for the account
  owner, not something to act on automatically.
- **Phase 2 — real login built and proven end-to-end.**
  - `lib/supabase.ts` — the one client the whole app shares, built on the
    **publishable** key (safe to ship to a browser; every access decision is
    still made by Postgres RLS on the other end, this key only asserts identity).
  - `lib/auth-context.tsx` — a React context wrapping Supabase's session with a
    lookup into `profiles` for role + branch. Waits for the first "is anyone
    signed in" check before any redirect decision, so a real session is never
    mistaken for "signed out" during the first instant of a page load.
  - `lib/roles.ts` extended: `Role` gained `'staff'`; added
    `DEFAULT_ROUTE_FOR_ROLE` so each role lands somewhere it can actually reach
    (staff → `/repairs`, everyone else → `/dashboard`) instead of one hardcoded
    destination that would have stranded staff logins the moment the fail-closed
    fix from Phase 0 took effect.
  - `app/page.tsx` rewritten as a real email/password sign-in form, replacing the
    three-button role picker.
  - `app/dashboard/layout.tsx` and `app/dashboard/page.tsx`: the `localStorage`
    token guards replaced with the auth context; the dead `role !== 'demo'` check
    removed (`'demo'` was never a real role); the redundant, now-actively-wrong
    guard in `page.tsx` removed (it checked a `'token'` key real auth never sets,
    which would have bounced every dashboard visit straight back to login).
  - **New:** `app/repairs/layout.tsx` + `app/repairs/page.tsx` — a real,
    auth-guarded placeholder. Deliberately its own layout, a sibling of
    `app/dashboard/layout.tsx` rather than nested under it, and **not** wrapped
    in `<DataProvider>` — the route arrangement the spec called for in §3.3, so
    the CSV path stays structurally untouched by any of this.
  - **RLS test matrix — the item deferred twice — is done.** Five real accounts
    (admin, boss, manager, staff@KMT, staff@KLT) signed in through the actual
    Auth API; 7 live tests against the REST API with real JWTs:
    | # | Test | Result |
    |---|---|---|
    | 1 | Staff read scoped to own branch (KMT sees 1 job, not KLT's) | ✅ |
    | 2 | Management (manager/boss/admin) reads both branches | ✅ |
    | 3 | Staff insert into their own branch | ✅ 201 |
    | 4 | Staff insert into a different branch | ✅ blocked, 403 |
    | 5 | **Staff UPDATE moving their own job to another branch (the `with check` trap)** | ✅ blocked, 403 |
    | 6 | Boss attempts to create a job (only staff/manager may) | ✅ blocked, 403 |
    | 7 | Append-only: admin attempts to edit `repair_events` | ✅ blocked at the **GRANT** level, not just policy |
    | 8 | Fully anonymous read/write | ✅ blocked, 401, zero grants |
  - **Verified live in the browser**, not just at the API: staff login → lands on
    `/repairs`, correct branch/role shown; boss login → lands on `/dashboard`,
    full nav, correct name/role; sign-out returns cleanly to login from both
    layouts; session survives a fresh page load; a wrong password shows
    Supabase's own safe "Invalid login credentials" message.
  - **Confirms a spec prediction empirically:** signing up the 3rd test account
    hit Supabase's free-tier email rate limit (2–4 confirmation emails/hour) —
    exactly what `docs/REPAIR_MODULE_SPEC.md` §12 flagged as a reason real staff
    accounts will need a proper mail sender, not the built-in one. Worked around
    for these test accounts via direct SQL (confirmed instantly, no email
    needed) — not a path for real staff accounts later.
  - **Test fixtures created, not yet real data:** 5 login accounts and 2 branches
    (KMT, KLT) have accounts/jobs; the other 10 active branches have no staff
    accounts yet — that seeding is an IT Admin console task (Phase 5) or a manual
    one-time step, not done here.
- **Phase 1 — database built.** Supabase project `mpt-omniportal`
  (`qetoquashslxdliyxgyb`), Singapore, free tier. Seven tables — `branches`,
  `profiles`, `staff_members`, `repair_jobs`, `repair_events`, `contact_log`,
  `collections` — with RLS enabled on every one, ten enum types, check constraints
  carrying the business rules (staff must have a branch and management must not; a
  void must state a reason; a warranty claim must carry its purchase date), and an
  `updated_at` trigger. 14 branch codes seeded, 12 active.
  - **Append-only enforced by `GRANT`, not policy.** `repair_events` and
    `contact_log` have INSERT and SELECT only. **No DELETE is granted on any
    table** — records are voided, never removed.
  - **Two defects found and fixed during the build.** (1) The four RLS helper
    functions were created in `public`, which Supabase publishes as a REST API —
    making them internet-callable endpoints. They leaked nothing (each returns only
    the caller's own value) but were moved to a non-published `app` schema.
    (2) `branches` had INSERT/UPDATE *policies* but only a SELECT *grant*, so the
    policies were dead code and no one could maintain the outlet registry.
  - **Verified:** security advisor returns zero findings; `anon` has no privileges
    on anything.
- **Repair module + login — design finalised.** Four research passes (repo audit,
  repair-domain modelling, roles/RBAC, stack/hosting/legal) consolidated into
  `docs/REPAIR_MODULE_SPEC.md`. Architecture, roles, permission matrix, data model,
  numbering, proof requirements, PDPA obligations and a six-phase build plan all
  settled.
- **Branch list resolved from the dataset.** Both sales files carry 14 outlet codes.
  `CS` collapsed 5,027 → 369 transactions between the two years (wound down); `HQ`
  runs ~10 transactions a year (head office, not a counter). **12 active retail
  counters.** No logins for CS or HQ.
- Everything prior to this — see `docs/V2_REQUIREMENTS.md` and `docs/CHANGELOG.md`.

---

## Decisions (and why)

| Decision | Reason |
|---|---|
| **Static export kept** (`output: 'export'`) | It is what makes "the Director's sales data never leaves his machine" a structural fact rather than a policy. With no server, there is nowhere to send it even by accident. |
| **Supabase + Row Level Security** for repair data | A repair job is shared across branch, workshop and management over weeks. It cannot live in one browser. RLS puts the "which rows may you see" decision inside the database, where the browser cannot lie to it. |
| **Two data rules in one app** | Sales stays browser-only; repairs go to a server. Deliberate, documented, and not to be "fixed" by a future contributor. |
| **Policy tests before feature code** | In this architecture RLS is the *only* security wall — no server-side guard catches a mistake. A 2025 scan found 10.3% of apps on this stack shipped world-readable tables. |
| **Phase 1 = logbook, not the full chit** | The logbook is what staff actually flip through and what nobody can search. It is roughly a fifth of the work of the full chit and delivers most of the daily value. |
| **Shared branch login + "served by" name** | Owner's call — lowest admin cost. Trade-off recorded in spec §4.2: attribution is a selected name, not proof. The data model preserves an upgrade to per-staff PINs without a migration. |
| **IT Admin gets full data access** | Owner's call. Costs little either way, since sales data is not on the server. |
| **Custody tracking in Phase 1, not Phase 2** | MPT runs a central HQ workshop, so *every* job leaves its branch. "Where is my watch" is the question paper cannot answer. |
| **Both job numbers kept** | System-generated `job_no` is authoritative and works offline; the pre-printed chit number is the join to the paper logbook during changeover. |
| **`wa.me` + manual contact log, not the WhatsApp API** | The API needs a number not on the WhatsApp Business app — which the counters use. RM 0/month vs losing staff their inbox. |
| **Singapore hosting accepted** | Cross-border transfer under the amended PDPA; defensible with a TIA + DPA on file. Region cannot be changed after project creation. |
| **`/repairs` is its own layout, sibling of `/dashboard`** | Not nested under the dashboard layout, and never wrapped in `<DataProvider>`. Keeps the CSV-only invariant structurally true rather than relying on nobody importing the wrong thing later. |
| **Each role has its own landing page, not one hardcoded destination** | Staff cannot reach `/dashboard` (fail-closed `canAccess`). Redirecting everyone there after login would have stranded staff logins the moment that fix took effect. |
| **RLS proven with live signed-in accounts, not reasoned about** | This architecture has no second security wall — RLS is it. "The policy looks right" isn't the same claim as "five real logins behaved correctly against the real API," so the second one is what got done. |

---

## Watch out

- **`backend/` must not be deleted.** It is the source of the Agenda logic the
  Manager's desktop `.exe` depends on, and Electron packaging was already removed —
  a new `.exe` cannot be built without restoring it from git history.
- **Do not reintroduce `fetch` into the sales data path** (`lib/salesData.ts`,
  `lib/csvStore.ts`, `app/dashboard/data-context.tsx`). That silently breaks the
  core privacy guarantee.
- **The old Supabase project is not to be reused** — its master key was never
  rotated after being pasted into a chat transcript, and that key bypasses RLS
  entirely.
- Free-tier Supabase has **no backups** and pauses after 7 days idle. Fine for
  building; **Pro must be active before the first real customer job.**
