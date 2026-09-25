# Watch Repair Module + Real Login — Design Spec

Status: **design finalised, not yet built.**

This document is the single record of a design worked out across four research
passes (repo audit, repair-domain modelling, roles/RBAC, and stack/hosting/legal).
Those reports do not exist anywhere else. If you are picking this up cold, read
this file before touching anything.

It is written to be understood, not just followed — where a decision needs a
concept explained, the concept is explained.

---

## 1. What this is and why

MPT takes in watches for repair on a **carbonless paper chit** (pre-printed serial,
e.g. `54279`), written in four copies: one to the customer, one to the technician,
two kept by the branch. Separately, each branch keeps a **physical logbook**
recording chit no, date, brand, customer name and phone, when the customer was
called once the watch was ready, and the repair amount.

Two things about that are worth stating plainly:

**It works.** Nobody is replacing it because it is broken. It is being replaced
because paper cannot answer questions across 12 counters: *where is this watch
right now, was the customer actually called, which jobs have been sitting
uncollected for two months, how much repair revenue did KMT do last quarter.*

**It matters commercially.** The sales data shows MPT's in-house service line
(`MPT SB`) running at **95.6% margin** on **RM 413,362**, and Service accounting
for **71.9% of all units sold** but only 13.9% of revenue. Repairs are not a
customer-service sideline. They are a high-margin engine currently managed on
paper.

---

## 2. The decisions, in one table

| Area | Decision |
|---|---|
| **Hosting** | Vercel **Pro** ($20/user/mo). Static export (`output: 'export'`) **kept**. |
| **Database** | Supabase, **Singapore** (`ap-southeast-1`). Free tier during build; **Pro ($25/mo) required before the first real customer job** — free has no backups and pauses after 7 days idle. |
| **Auth** | Supabase email/password, replacing the client-side role picker. |
| **Authorization** | Postgres Row Level Security, driven by `role` + `branch_id` JWT claims. |
| **Roles** | IT Admin, Boss/Director, Manager, Retail Staff. |
| **IT Admin data access** | **Full access** (owner's decision — small business, and sales data isn't on the server anyway). |
| **Staff identity** | **One shared login per branch**, plus a "served by" name recorded on each job. |
| **Phase 1 scope** | Digital **logbook + status + custody + contact log + collection proof**. |
| **Deferred to Phase 2** | Condition grid, intake photos, quotations, deposits, vendor consignment, disposal workflow. |
| **Workshop model** | **Central HQ workshop.** Every job leaves its branch and comes back. |
| **Collection** | **Intake branch only.** No cross-branch collection. |
| **Paper** | Customer still walks away with paper. System prints a slip carrying a QR. |
| **Notifications** | `wa.me` click-to-chat + an explicit, separately-logged contact record. |
| **Data residency** | Singapore accepted. Requires TIA, signed DPA, and disclosure in the customer notice. |

Running cost once live: **≈ US$45/mo** (Vercel Pro + Supabase Pro) ≈ RM200.
Build estimate: **12–18 developer-days**, in six independently shippable phases.

---

## 3. Architecture, explained

### 3.1 The constraint that shapes everything

The sales dashboard runs under a hard rule from the Director: **his sales data
never leaves his machine.** The app reads the CSV in the browser
(`lib/salesData.ts`) and caches it in the browser's own storage
(`lib/csvStore.ts`). There is no server.

That promise is currently **structural, not a policy**. `output: 'export'` in
`next.config.ts` builds the app to plain HTML/CSS/JS files with no server runtime.
There is *no server that could receive the CSV even if someone wrote the code to
send it.* A grep for `fetch(` across `app/`, `lib/`, `components/` and `hooks/`
returns nothing.

**This is the single most valuable property the codebase has, and it is why the
static export stays.** The moment a server exists in the Next.js app, the promise
downgrades from "impossible" to "nobody has written that code yet" — which any
future change can silently break.

> ⚠️ **`next.config.ts` line 23 has a stale comment** claiming `output: 'export'`
> is "for mobile app compatibility". Mobile packaging was removed. Anyone tidying
> up could delete that line as vestigial and destroy the guarantee with no error
> message. **Fix that comment before touching auth.**

### 3.2 But a repair chit cannot live in a browser

A repair job is created by staff at one branch, worked on at the HQ workshop,
chased by a manager, and collected weeks later — possibly by different staff on a
different device. That is shared, durable, multi-device data. It needs a real
database and a real login.

So the app holds **two data models under one login, deliberately**:

| | Sales analytics | Repair jobs |
|---|---|---|
| Where the data lives | Director's browser only | Supabase (Singapore) |
| Server ever sees it? | **Never** | Yes |
| Who can read it | Whoever sits at that machine | Whoever the database authorises |

This is not a compromise. It hands us separation of duties for free (§4.3).

### 3.3 The load-bearing invariant

> **`lib/salesData.ts`, `lib/csvStore.ts` and `app/dashboard/data-context.tsx`
> must never import a network client.**

That one rule is the entire privacy model. Today it holds by accident — there is
no network client to import. After Supabase is added it must hold by intent.

**Enforce it mechanically:** add a `no-restricted-imports` ESLint rule forbidding
`@supabase/*` in those three files. Note that `next.config.ts` currently has
`eslint.ignoreDuringBuilds: true`, so a lint rule **will not fail the build**
until that is flipped.

### 3.4 What Row Level Security is, in plain language

Normally a server sits between the browser and the database and decides "you are
branch KMT, so you get KMT's rows". With no server, that decision has to move
somewhere the browser cannot lie to — so it moves **into the database itself**.

Postgres lets you attach a rule to a table:

> *"A logged-in user may only SELECT rows where this row's `branch_id` matches the
> branch on their login token."*

The rule runs inside the database engine. It does not matter that the browser is
asking directly, or that the browser could be a hacked one — the database
physically will not return rows that fail the rule.

**The honest trade-off:** in this architecture, RLS is the *only* wall. There is
no server-side guard behind it to catch a mistake. The public key that identifies
the app is embedded in the JavaScript bundle by design — anyone can open devtools,
read it, and issue their own database queries. If a policy is wrong, or a table
gets created without RLS switched on, every customer name and phone number is
readable by anyone.

This is not theoretical. A 2025 scan (CVE-2025-48757) found **10.3% of apps built
on this stack shipped tables readable by anyone holding the public key** — 303
endpoints across 170 projects.

**The mitigation is not "be careful."** It is:

- **Automated policy tests written *before* any feature code** — sign in as each of
  the four roles, assert positively and negatively what each can select, insert and
  update on every table, and run it in CI on every migration. This is the highest
  value engineering investment in the entire project.
- Deny by default. Every new table gets RLS enabled in the same migration that
  creates it.
- Never copy the `using (true)` policy from `backend/supabase_schema.sql`. That is
  the exact pattern behind the leak statistics above.

### 3.5 The gap, and how it is filled

A few operations genuinely need a trusted context the browser cannot have:
creating a staff account, resetting a password, verifying a PIN. These need the
Supabase **secret key**, which must never ship to a browser.

Answer: **Supabase Edge Functions** — small server-side functions that run inside
Supabase, not inside Next.js. The static export stays intact; the server-side
piece lives where it belongs.

---

## 4. Roles and access

### 4.1 The four roles

| Role | Who | Scope |
|---|---|---|
| **IT Admin** | The technical caretaker (currently the intern) | Accounts, branches, reference data, audit log. **Full data access** by owner's decision. |
| **Boss / Director** | The owner | Everything, all branches. The auditor. |
| **Manager** | Operations manager | Same views, scoped to assigned branches (today: all). **The approver.** |
| **Retail Staff** | Counter, one shared account per branch | Own branch only. |

**Boss vs Manager — the shape to build:** *scoped by default, with an explicit
all-branches grant*, and give the current ops manager that grant on day one. It
costs nothing now and avoids unpicking "Manager sees everything" retroactively
when MPT hires a second or regional manager.

**Approvals go to the Manager, not the Boss.** The Director will not be answering
approval pings for a RM 35 battery void at 6pm in Kota Bharu. **The Manager
approves; the Boss audits.**

### 4.2 Staff identity — the decision and its cost

**Decided: one shared account per branch, with a "served by" name selected on each
job.**

Stated honestly, because it should not surprise anyone later:

- The system records who was **selected**, not who was **logged in**. In a dispute
  that field is evidence, not proof.
- The paper chit carries a physical signature and an `Attended By` line. During
  Phase 1, **paper remains the stronger accountability record** — which is an
  argument for running the chit book in parallel.

**The upgrade path is preserved.** The data model stores a `served_by` user
reference either way, so individual staff PINs (device enrolled to a branch, each
person unlocking with a 4–6 digit PIN) can be added later **without a migration**.

### 4.3 IT Admin — what the console contains

Owner's decision is full data access. Note that this costs almost nothing either
way: **the sales CSV is not on any server**, so a "see everything" flag would show
nothing anyway. Sales access means loading a CSV on your own machine, like anyone
else.

**v1 — the system is not operable without these:**

1. **User accounts** — create, edit, disable. Without this, every new hire is a
   phone call to the intern; after the internship it is a phone call to nobody.
2. **Password reset with forced change on next login.** This replaces the process
   documented in `RUNBOOK.md` §9 — SSH in, `INSERT` a plaintext password into
   MySQL, then remember to hash it afterwards. Forgetting step two silently stores
   a plaintext password. **Delete that workflow.**
3. **Assign users to branches** — this *is* the scoping model for the whole module.
4. **Deactivate leavers** — soft-disable, never delete, so their name survives on
   jobs still sitting in the drawer.
5. **Branch registry** (§6) — also retro-fixes the sales dashboard's unreadable
   outlet codes.
6. **Audit log** — v1, not later. See §4.4.
7. **"View as user"** — read-only. Support will happen over WhatsApp with someone
   in another state describing a screen. Without this, every support call is a
   guessing game.

**v1.5:** technicians and vendors reference data, brands + warranty periods, chit
number ranges per branch, failed-login monitoring, session management / force
sign-out, repair CSV export, feature flags for a staged single-branch rollout.

**Later:** backup/restore UI (use the provider's own), system health page, bulk
user import. **Resist** per-user permission overrides — four roles is the point.

### 4.4 The audit log

Append-only. Minimum events: login success/failure; repair job created, status
changed, **voided**; any change to a **money field**; "marked collected"; user
created/disabled/role changed/password reset.

Each entry: timestamp, actor, actor's branch, entity, field, old value, new value.

> **Nobody can edit or delete it — including the IT Admin.** Not a trust question.
> A log an administrator can rewrite is not a log, and the whole reason it exists
> is the dispute where someone would want to rewrite it.

**Enforce it at the `GRANT` level, not just with a policy.** A policy can be
replaced by a future migration; a missing `UPDATE`/`DELETE` grant is a harder
floor:

```sql
grant select, insert on repair_events to authenticated;
revoke update, delete on repair_events from authenticated;
```

### 4.5 Permission matrix (Phase 1)

`A` allow · `D` deny · `S` scoped · `*` audit-logged

| Capability | IT Admin | Boss | Manager | Staff |
|---|---|---|---|---|
| Sales dashboard / brands / leaderboards | **D** (revised — nothing an admin does needs it) | A | S — assigned branches | D |
| Load the sales CSV | **D** (revised, as above) | A | S — own machine | D |
| Repair job — create | D | D | S | S — own branch |
| Repair job — read | A | A — all | S — assigned | S — own branch |
| Repair job — update status | D | D | S | S — own branch |
| Repair job — edit money fields | A\* | A\* | S\* | S\* — before collected only |
| Repair job — void | A\* | A\* | **A\*** | D — staff *request*, Manager approves |
| Mark collected | D | D | S\* | S\* — own branch |
| Reverse "collected" | A\* | A\* | A\* | D |
| Repair management reports | A | A | S | D — sees own branch queue, not reports |
| Export repair data | A\* | A\* | A\* | D |
| User administration | A\* | A\* — break-glass | D | D |
| Branch / reference data | A\* | A\* | D | D |
| Audit log — read | A | A | S | D |
| **Audit log — edit or delete** | **D** | **D** | **D** | **D** |
| **Delete anything** | **D** | **D** | **D** | **D** |

**"Own branch"** = the branch on the logged-in account. **"Assigned branches"** =
the branch list on the Manager's record, maintained by IT Admin (today: all).

**Boss and Manager cannot create repair jobs, deliberately.** Intake happens at a
counter with the watch in hand. A job created by an account not physically at a
branch is either a data fix (which is an *edit*, logged) or a mistake.

---

## 5. The repair data model

### 5.1 The most important modelling decision

**Do not use a single `status` field.** The chit conflates four independent things,
and flattening them produces nonsense states like
`AT_VENDOR_AWAITING_PARTS_DEPOSIT_PAID`.

Four orthogonal axes:

| Axis | Answers |
|---|---|
| **Lifecycle** | What stage is the *work* at? |
| **Custody** | Where is the *physical watch*, and who is responsible for it? |
| **Money** | Nothing paid / deposit / paid in full? *(derived)* |
| **Contact** | Has the customer been told, and when? *(derived)* |

**Custody is the biggest single upgrade over paper, and the paper form has no
concept of it at all.** Today, once the technician's copy leaves the branch, the
branch has no record of where the watch physically is. The chit's own terms make
MPT liable for a lost article — an unbroken chain of custody is the direct
mitigation.

Because MPT runs a **central HQ workshop**, *every* job leaves its branch. Custody
is therefore a Phase 1 concern, not a Phase 2 one.

### 5.2 Phase 1 lifecycle

```
DRAFT → RECEIVED → SENT_TO_HQ → IN_REPAIR → RETURNED_TO_BRANCH
      → READY_FOR_COLLECTION → COLLECTED
```

With branches off the happy path:

- `RETURN_UNREPAIRED` — not repairable, or customer declined; item is back and collectable
- `UNCLAIMED` — ready, past threshold, contact attempts exhausted
- `CANCELLED` — voided before work; item returned immediately
- `VOID` — record itself void (mis-keyed). **Never a delete.**

**Deliberate non-states.** `CUSTOMER_NOTIFIED` is *not* a status — it is a fact
about `READY_FOR_COLLECTION`, recorded in the contact log. Make it a status and a
job called twice needs states for "notified once" and "notified twice". Likewise
`PAID` and `AT_HQ` belong to the money and custody axes, not the lifecycle.

**`UNCLAIMED` is derived-then-confirmed**, never automatic: the system computes
eligibility and flags it, a human moves it. The terms also let the company *extend*
the collection period. **Nothing is ever auto-disposed.**

**`COLLECTED` is terminal.** A customer returning with the same complaint creates a
**new job** linked via `parent_job_id`, flagged as rework. That keeps turnaround
metrics honest.

### 5.3 Phase 1 entities

**`branches`** — `id`, `code` (`JCI`, `KMT`…), `name`, `phone`, `is_active`.

**`profiles`** — links to Supabase auth users. `id`, `role`, `branch_id`,
`full_name`, `is_active`. Staff have a `branch_id`; boss/manager/admin have `NULL`.

**`staff_members`** — the "served by" list per branch. Separate from `profiles`
because with shared branch logins, the person serving is *not* the account.

**`repair_jobs`** — the core record:

- `id`, `job_no` (system-generated, §7), `preprinted_chit_no` (optional)
- `branch_id`, `intake_at`, `served_by` (→ `staff_members`)
- `customer_name`, `customer_phone` (stored normalised, §8)
- `brand`, `model_no`, `serial_no`
- `services_required` — **the customer's complaint, in their words**
- `staff_observations` — **what staff noticed.** *Two separate fields. The chit has
  one box for both, and the jewellery trade is emphatic that merging them causes
  disputes. One-field change, whole class of argument avoided.*
- `warranty_declaration` (`VALID_AND_RECEIVED` / `NOT_VALID` / `OTHERS`),
  `purchase_date`, `in_warranty_at_intake` **(frozen at intake, §9)**
- `fee`, `promised_ready_date` — *neither is on the paper chit. The promised date
  is the question every customer asks, and staff currently answer it from memory.*
- `declared_item_value` — *not on the chit. Without it, "we replace with a similar
  article or one of the same value" is negotiated after a loss, from a weak
  position.*
- `status`, `custody_state`, `voided_at`, `void_reason`

**`repair_events`** — append-only. Every status and custody change: `job_id`,
`from`, `to`, `at`, `actor`, `served_by`, `reason`. Every metric (turnaround, days
at HQ, days sitting uncollected) is **derived from this table**, never stored on
the job.

**`contact_log`** — the digital replacement for the logbook's "we called them"
column: `job_id`, `channel` (call / WhatsApp / SMS / in person), `direction`
(customers ring in to chase too), `purpose`, `outcome` (answered / no answer /
wrong number / left message), `at`, `actor`, `note`.

Materially stronger than paper: the timestamp and author are system-set, not
handwritten.

**`collections`** — `job_id`, `collected_at`, `released_by`, `collector_name`,
`collector_relationship`, `proof_method` (`CHIT_SURRENDERED` / `SIGNATURE` /
`BOTH`), `signature_path`, `snapshot` (what was on screen when they signed).

> `collector_name` matters. The paper form has **no field for a representative**,
> and a wife, son or colleague collecting is routine. That is a live gap today.

Rule: at least one of chit-surrendered or signature must be present. That is the
digital form of *"take the chit, or make them sign."*

### 5.4 Explicitly deferred to Phase 2

The 12×7 condition grid, intake photos, quotations and revisions, deposits and
payment records, vendor/factory consignment tracking, the 6-month disposal
workflow, warranty claim outcomes.

**Design note for whoever builds Phase 2:** the condition grid should be stored as
**sparse rows** (only the ticked intersections), not 84 boolean columns and not a
JSON blob — a typical watch has 0–5 marks, and sparse rows leave room for severity,
a note and a photo per mark. The UI is **part-first**: tap "Glass" → a sheet of 7
condition chips → done. Two taps per defect. Keep the chit's watch line-drawing as
a tappable diagram so it still feels like the chit.

---

## 6. Branch registry — what the dataset actually says

Both sales files contain **14 outlet codes**. The apparent "13 vs 14" disagreement
resolves like this:

| Code | 2024 rows | 2025 rows | Status |
|---|---|---|---|
| JCI | 11,153 | 12,206 | active |
| AM | 6,909 | 6,831 | active |
| KMT | 5,279 | 6,635 | active |
| SAT | 6,704 | 6,626 | active |
| GPL | 6,301 | 5,933 | active |
| TBT | 6,078 | 5,273 | active |
| KLT | 4,726 | 4,073 | active |
| MRT | 3,929 | 3,932 | active |
| WZ | 3,741 | 3,575 | active |
| JKL | 3,381 | 3,060 | active |
| MFW | 2,099 | 1,538 | active |
| TSB | 1,075 | 1,230 | active |
| **CS** | **5,027** | **369** | **wound down during 2025** |
| **HQ** | 9 | 12 | **head office, not a counter** |

**Conclusion: 12 active retail counters.** Seed all 14 codes into `branches`, mark
12 `is_active = true`. **No login is created for CS or HQ.**

Codes are kept as-is per the owner's instruction (follow the dataset; no full
names). If real outlet names are supplied later, they go in `branches.name` and
improve the sales dashboard at the same time.

---

## 7. Job numbering and the QR

**Record both numbers. The system's number is authoritative.**

**`job_no`** — generated **on the device**, format `KLT-2609-7F3K` (branch, year+month,
random). Generating it client-side means **a slip can print even when the
connection is down**, and there is no server sequence to collide on.

**`preprinted_chit_no`** — optional, indexed. Recorded when a physical chit was used.
Duplicates **warn, never block** — old chit stock across 12 branches almost
certainly repeats serials, and a hard block trains staff to type garbage.

**Why not just use the pre-printed number:** it is not under system control (books
get skipped, spoiled, reordered in overlapping ranges), it is not globally unique,
and the first digital-only job would have no number at all.

**Why not drop it:** it is the number in the customer's wallet right now, and it is
the join between the paper logbook and the new system during changeover.

**The QR encodes `job_no`**, printed on the customer's slip. Two collection paths:

- Customer brings the slip → **scan the QR**, job opens instantly.
- Customer forgot it → **search by phone number**, then capture a signature as proof.

**Worth knowing:** `CHIT NO: 53384` already appears verbatim in the POS export's
`inv_desc` field. Repair chits already touch the sales system. Storing the chit
number in a matchable form enables a future reconciliation — *"which completed
repairs never got rung up?"* — which is a real cash-leakage control that costs
nothing to enable now.

---

## 8. Notifications and contact logging

**v1: `wa.me` click-to-chat + an explicit contact record. RM 0/month.**

`https://wa.me/60123456789?text=<urlencoded>` opens WhatsApp with the message
pre-filled; staff press send from the shop's own number. No account, no approval,
no cost.

Malaysian numbers must be normalised to international digits-only: `012-345 6789`
→ `60123456789`. No `+`, no spaces, no dashes, no leading zero.

> **Opening a WhatsApp link is not evidence a message was sent.** The UI must
> **never** write a contact record as a side effect of opening WhatsApp. Logging
> the contact is a separate, deliberate tap.

**Also v1:** a tokenised public status page (`/s/<random-token>`) linked from the
QR, so customers can check for themselves. This removes most "is it ready?" calls
and is the cheapest single improvement available.

**Not now:**

- **WhatsApp Business Cloud API** — the blocker is not price (service messages are
  free inside the 24-hour window). It requires a phone number **not registered on
  the WhatsApp Business app**, which the counters almost certainly use today.
  Migrating that number costs staff their ordinary WhatsApp inbox.
- **SMS** — following MCMC's anti-scam directive, **Malaysian telcos block URLs in
  SMS unless whitelisted.** The one thing worth sending — a status link — is
  exactly what gets filtered. Sender IDs also need per-operator registration.

---

## 9. Proof — matching or beating paper

| Paper proof | Digital equivalent | Verdict |
|---|---|---|
| Signature authorising repair up to RM X | Signature bound to a **hash of the rendered intake summary** | **Stronger** — paper cannot prove the RM figure was filled in *before* signing |
| Signature at collection | Signature + collector name and relationship | **Stronger** — the collector's identity is finally captured |
| Surrendered chit destroyed | `proof_method = CHIT_SURRENDERED` + who destroyed it | Equal, and auditable |
| "We called them" | `contact_log` rows with system timestamps and author | **Much stronger** |

**The detail that makes it hold up:** a signature image on its own proves nothing —
it is a drawing. Store alongside it the server timestamp, the account, the "served
by" staff member, and a snapshot of **exactly what was on screen when they signed**.
A scribble plus *"this is the text they were shown at 14:32"* is evidence.

**Storage matters more than it looks:** store signatures as **vector path data (a
few KB)**, not PNG (50 KB+). At ~3,900 jobs/month, PNGs alone would exceed the free
1 GB storage in about five months. Compress any Phase 2 photos client-side
(~1280px, JPEG q0.7) before upload. **Storage, not row count, is what breaks the
budget first.**

**Legal footing:** Malaysia's Electronic Commerce Act 2006 (s.6, s.9) means an
electronic signature satisfies a signature requirement where it identifies the
person, indicates approval, and is reliable for the purpose. A counter e-signature
on a repair authorisation sits comfortably there — it is an ordinary commercial
transaction, not an excluded instrument, and needs no certified digital signature
under the Digital Signature Act 1997.

**Offline resilience — the outbox pattern (~1 day of work, not full offline sync):**

1. `job_no` generated on the device (§7), so a slip prints regardless.
2. Intake writes to a local IndexedDB queue **first**, then attempts the database
   insert. Success → dequeue. Failure → stays queued.
3. A persistent banner: *"2 jobs saved on this device, not yet synced"*, with manual
   retry plus automatic retry when the connection returns.
4. Reads are honest — when offline, show the last-synced list **with its timestamp**
   and say so. Never fake freshness.

Full offline sync (PowerSync et al.) costs ~$49/mo and a permanent architectural
commitment, to solve a problem that happens a few times a month. The outbox covers
the one moment failure is visible to a customer — intake — at about a tenth of the
cost.

---

## 10. PDPA obligations

The module stores customer names and phone numbers. MPT is a **data controller**
under Malaysia's PDPA 2010 as amended.

**Schema-level consequences — decide these now, not later:**

- **Retention (s.10).** Data must not be kept longer than necessary. "Keep forever"
  is not lawful. This is a `purge_after` column plus a scheduled job. **The Director
  must set the period.**
- **Notice & Choice (s.7).** A written notice in **Bahasa Malaysia and English**, at
  or before collection. It must name the **vendor factory as a recipient**, because
  sending a watch out for repair discloses customer data to a third party. This text
  goes on both the intake screen and the printed slip.
- **Breach notification.** In force since 1 June 2025: notify the Commissioner
  **within 72 hours**, and affected individuals within 7 days of that. Penalties up
  to **RM 250,000** for failure to notify; up to **RM 1,000,000** for breaching the
  protection principles. → **You need a breach *detection* story, not just
  prevention.** Turn on Supabase's security advisor emails and log admin actions.
- **DPO becomes mandatory above 20,000 data subjects.** At ~130 jobs/day across 12
  counters, MPT crosses that in roughly **12–18 months**. Flag it now.
- **Cross-border transfer.** Hosting in Singapore **is** a cross-border transfer
  under the amended s.129 (in force 1 April 2025). Defensible — Singapore's law is
  broadly comparable and Supabase's DPA supplies the contractual route — but it
  requires paperwork MPT must actually produce: a **Transfer Impact Assessment**
  (valid 3 years) on file, the **DPA executed**, and the transfer **disclosed in the
  s.7 notice**.

> **Region cannot be changed after the Supabase project is created.** If MPT ever
> needs data to stay in Malaysia, the whole stack changes (Supabase has no Malaysian
> region; AWS Cyberjaya `ap-southeast-5` does). Decision taken: **Singapore is
> accepted.**

**Open question worth a lawyer, not a developer:** the Personal Data Protection
(Class of Data Users) Order 2013 requires controllers in specified classes to
register with the Commissioner. The "Services" class includes *retail or wholesale
dealing as defined under the Control of Supplies Act 1961*. Whether a watch
retailer falls inside that definition is not self-evident. **Raise it; do not
assume either way.**

---

## 11. Build phases

| Phase | Work | Effort | Point of no return |
|---|---|---|---|
| **0** | Vercel Pro. Fix the `next.config.ts:23` comment. Remove the plaintext credentials in `README.md`. Fix `canAccess` to fail closed. | 0.5 day | None |
| **1** | Fresh Supabase project (Singapore). Schema, RLS policies, grants, seed 14 branches. **Write the policy tests first.** | 1.5–2 days | None — delete and restart |
| **2** | Replace the role picker with real sign-in. Extend `lib/roles.ts` with `branch`. Session guard replaces the `localStorage` check. **Dashboard still reads CSV locally.** | 1 day | **Deleting the role picker.** After this, no internet = no dashboard for the Director unless the session is cached. |
| **3** | `/repairs` mobile-first: intake, branch-scoped list, detail, status + custody transitions, events, contact log, `wa.me`. IndexedDB outbox. | 5–8 days | **The first real customer job.** Data becomes irreplaceable; schema changes need real migrations. **Supabase Pro must be active before this line.** |
| **4** | 80mm printed slip via `@media print`, QR to the status page, signature capture, private storage bucket, PDPA notice text. | 2–3 days | The first slip a customer walks out with — the layout and notice wording become customer-facing artifacts. |
| **5** | IT Admin console: create/disable staff, assign branch, reset password, via Edge Function. | 1.5–2 days | Handing over the keys |
| **6** | Retention job, off-Supabase backup dump, admin audit log, TIA/DPA on file. | 1–2 days | None — but doing it late is the regret |

**Phases 0–2 are independently shippable and de-risk everything after them.**

**Rollout:** one pilot branch for 2–4 weeks with the paper chit book running in
parallel. Do not switch 12 counters to a new intake process on the same Monday.

---

## 12. Things that must be true before the first real job

- [ ] **Fresh Supabase project**, not the old one. The old project's master key was
      pasted into a chat transcript during a rebuild and, per
      `backend/PROJECT_STATE.md`, was never rotated. That key **bypasses RLS
      entirely** — and RLS is the only wall. It also has real staff names readable
      by anyone holding the public key, and an arbitrary-read RPC
      (`run_readonly_query`) still granted to `anon`.
- [ ] **Supabase Pro active** — the free tier has no backups and pauses after 7 days
      idle. Fine for building; unfit as a system of record.
- [ ] **Staff email addresses resolved.** Supabase Auth requires an email per
      account. Branch accounts like `klt@mpt.internal` work but **cannot receive a
      password reset**, which makes IT Admin a permanent helpdesk — one that leaves
      when the internship ends. Also: Supabase's built-in mail is capped at **2
      messages/hour** and is explicitly not for production, so a real mail sender is
      required. **Design the reset flow in Phase 2, not Phase 5.**
- [ ] **Policy tests passing in CI.**
- [ ] **Break-glass owner account** — belongs to MPT, not a person. Full rights,
      long passphrase on paper, sealed, held by the Director. Loudly audit-logged so
      it cannot be used quietly. **Tested once, in front of him** — an untested
      break-glass account is a rumour.
- [ ] **Retention period set** by the Director.
- [ ] **TIA + DPA on file**, transfer disclosed in the customer notice.

---

## 13. Open items for the Director

1. Real outlet names for the 12 active codes *(optional — improves the sales
   dashboard too)*
2. Retention period for completed repair records including phone numbers
3. Sign-off on Singapore hosting (TIA + DPA)
4. Who — permanently employed — holds the break-glass envelope after the internship
5. Which branch pilots first
6. Is the ≥50% deposit rule enforced or discretionary? Is cash-only still true?
7. How many contact attempts, over how long, before a job counts as unclaimed?
8. What does "dispose" mean in practice under the 6-month clause — sold, scrapped,
   retained? Has it ever actually happened?
9. Does MPT warrant its own repair work, and for how long? *(Determines whether
   rework is charged.)*
10. Are past sales queryable by serial or receipt number? *(If so, warranty could be
    auto-verified from MPT's own records — turning "customer forgot the card" from a
    rejection into an instant verified claim. Paper can never do this.)*

---

## 14. Known risks

1. **An RLS mistake exposing every customer name and phone number.** No second wall
   exists. Mitigation: policy tests from Phase 1, before feature code.
2. **No backups before the first real job.** One bad migration and the repair book
   is gone while customers' watches are still in the safe.
3. **Attribution is a selected name, not an authenticated identity** (§4.2). Accepted
   trade; keep paper in parallel during Phase 1.
4. **Storage handled carelessly** — a cost problem *and* a PDPA problem if photos of
   customers' valuables are held indefinitely with no retention rule.
5. **Coupling the sales dashboard to an online login**, so the Director cannot open
   it when the line is down. The CSV path must stay fully offline-capable.
6. **An editable audit trail** — worthless in exactly the dispute it exists for.
   Enforce append-only at the `GRANT` level.
7. **Static export makes every future server-shaped requirement a fight.** Each one
   becomes another Edge Function, and business logic scatters across the browser,
   Deno functions and Postgres policies with no single place to read the rules. The
   current decision is right *because* the planned additions are more counter-facing
   staff features of the same shape. **If a vendor/factory portal with separate auth
   ever enters the roadmap, revisit this** — and revisit it *before* Phase 3, because
   afterwards it means migrating live customer data.

---

## 15. Repo hazards found during the audit

Independent of this project, these will bite whoever touches auth:

| Issue | Where | Action |
|---|---|---|
| **`canAccess` fails open** — an unlisted route is allowed by default, so a new `/repairs` route is reachable by every role until someone remembers to list it | `lib/roles.ts:18` | **Invert before adding roles** |
| Stale comment claims `output: 'export'` is "for mobile" — someone will delete it as vestigial and destroy the privacy guarantee | `next.config.ts:23` | **Fix the comment first** |
| **Plaintext working credentials** (`admin`/`admin123`, `demo`/`demo`) in a tracked file | `README.md:114-120` | Remove |
| `ROUTE_ACCESS` gates nothing — all four routes list all three roles, so the mechanism has never actually been exercised | `lib/roles.ts:3-8` | Treat as unproven, not as working code |
| `readRole()` is dead — nothing imports it | `lib/roles.ts:22-30` | Delete or make it the single identity accessor |
| Dead branch: checks `user.role !== 'demo'`, but `'demo'` is not in the `Role` union | `app/dashboard/layout.tsx:153` | Remove |
| Two redundant token guards | `layout.tsx:71`, `page.tsx:22` | Consolidate |
| Lint is not enforced at build time, so a boundary-protecting lint rule would not fail the build | `next.config.ts:9` | Flip if adding the import rule |
| `.env.production` contains `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000` | repo root | Delete — misleading |
| `RUNBOOK.md` is entirely V1 (MariaDB, Nginx, SSH); its §9 documents user management against a MySQL table the code does not use | `RUNBOOK.md` | Mark obsolete before someone follows it |
| Hardcoded JWT fallback secret — harmless while the backend is dead, forgeable by anyone who reads the repo if it is ever deployed | `backend/main.py:39` | Make it refuse to start instead |

> ⚠️ **`backend/` must not be deleted.** It is the source of the Agenda logic the
> Manager's desktop `.exe` depends on, and Electron packaging was already removed —
> a new `.exe` cannot be produced without restoring it from git history.

---

## 14. Daily Report (added after the repair module)

A second branch-facing section beside Repairs, brought over from the standalone
`sales-keeper` app. Staff enter each day's sales by brand (RM and quantity) and
by salesman (RM), see a monthly roll-up, keep their branch's brand list, and copy
the WhatsApp summary the branches already send.

**Deliberate exception to the "sales data never leaves the browser" rule.** Daily
figures entered here ARE stored in Supabase, branch-scoped by RLS exactly like
repair jobs. The Director's CSV analytics under `/dashboard` are unchanged and
still browser-only; `lib/daily-report.ts` must never be imported from them. The
two are different datasets: the CSV is the POS export, this is what a counter
keys in by hand each day.

- **Tables:** `report_brands` (per-branch list, case-insensitively unique per
  branch), `daily_sales` (branch, date, brand), `daily_salesman_sales` (branch,
  date, salesman), `daily_report_history` (append-only, written by trigger).
  Composite foreign keys make it impossible to point a row at another branch's
  brand or salesman.
- **Salesmen** are the existing `staff_members` rows (the same list as "served
  by" on repairs), not a second list.
- **Who may do what (RLS):** staff read/write their own branch only; manager
  enters for any branch; boss and admin read-only. Brand lists: management
  anywhere, staff for their own branch. Adding or deactivating salesmen:
  management only (`staff_members` policy, unchanged). No future dates (Malaysia
  time). No DELETE on any sales figure, salesman figure or history row: a figure
  is corrected, not removed. **One narrow exception, added on request:** a brand may
  be deleted (staff own branch, management any) but only if it has never been used.
  Sales point at brands through a foreign key with no cascade, so the database
  itself refuses to delete a brand that has any sales recorded; history cannot be
  erased this way. A used brand can only be deactivated.
- **`updated_by` / `updated_at` are stamped by a trigger**, so a client cannot
  claim someone else saved a figure. Every real change is also written to
  `daily_report_history`.
- **Salesman totals are per day, not per brand** (owner's choice: little extra
  typing). Brand total and salesman total are not forced to match; the screen
  warns when they differ.
- **Left out on purpose:** receipt-photo scanning (needs a Gemini key and a
  server function; this app has neither) and sales-keeper's month-override fields
  (the monthly view is derived from the daily rows, one source of truth).
- SQL: `supabase/migrations/daily_report.sql`. Routes: `/daily-report`.

