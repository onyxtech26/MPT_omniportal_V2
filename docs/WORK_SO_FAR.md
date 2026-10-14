# Work so far: owner requests, PRs #1 to #12

One place that records everything asked for and built since the project moved
to the project threads: what changed, who can do what, which Supabase SQL had
to be run, and what is still open. Sources: merged PRs #1 to #12, the git
history on `main`, and the project threads.

Companion documents: `PROJECT_STATUS.md` (status board), `docs/CHANGELOG.md`
(per-change detail and files touched), `docs/REPAIR_MODULE_SPEC.md` (design).

> **Recording convention:** no dates or times. Order carries the sequence.

**Status key:** **Live** = merged and deployed to mpt-omniportal.vercel.app.
**In progress** = being built, not merged.

---

## Who can do what today

| | Director (`boss`) | Manager | Retail Staff (one login per outlet) | IT Admin |
|---|---|---|---|---|
| Sales dashboard, Brands, Leaderboards, Explorer | Yes | Yes | No | No |
| Meeting Agenda | No | Yes | No | No |
| Repairs: see | No (blocked in the database too) | All outlets | Own outlet | All outlets |
| Repairs: create, move along, log contacts | No | No (view-only) | Own outlet | Any outlet |
| Repairs: edit details | No | No | Own outlet, until collected, cancelled or voided | Any outlet |
| Repairs: delete | No | No | Own outlet, only while Received | Any time |
| Repairs: void | No | No | No | Yes |
| Collection signature: see | No | All outlets | Own outlet | All outlets |
| Daily Report: see | No (blocked in the database too) | All outlets | Own outlet | All outlets |
| Daily Report: enter figures | No | No | Own outlet | No |
| Brands: add, rename, reorder, sort, delete unused | No | No | Own outlet | Any outlet |
| Salesmen: add, rename, remove, reactivate | No | No | Own outlet | Any outlet |
| IT Admin console (accounts, branches, audit log) | No | No | No | Yes |

The screens hide what a role cannot do, and Supabase Row Level Security
enforces the same rules, so a hidden button is never the only barrier.

---

## Supabase SQL that had to be run

Every file below lives in `supabase/migrations/` and was pasted into the
Supabase SQL Editor for **mpt-omniportal** by the owner. Each was confirmed
live afterwards.

| File | Came with | Run |
|---|---|---|
| `boss_no_branch_ops.sql` | Hide Repairs and Daily Report from the Director | Yes |
| `manager_view_only.sql` | Manager view-only; Ampang shown as AM | Yes |
| `repair_deposit.sql` | Deposit and balance on repairs | Yes |
| `repair_delete.sql` | Edit and delete repairs | Yes |
| `salesmen_staff_manage.sql` | Salesmen tab, staff manage their outlet | Yes |

Earlier files (`daily_report.sql`, `daily_report_brand_delete.sql`,
`daily_report_reorder.sql`) belong to the Daily Report build before this
period and were already applied.

Changes with **no SQL**: three-step repair flow, signature view, Job to Repair
wording, status filter, Meeting Agenda, top bar work, login flash fix, Brands
drag and drop, chit number as repair number.

---

## 1. Hide Repairs and Daily Report from the Director — Live (PR #1)

- **What changed:** the boss account no longer has the Repairs and Daily
  Report tabs, and typing either address sends it back to the dashboard.
  The database also stopped letting the boss read any outlet's repairs,
  daily sales, brands or salesmen.
- **Who:** Director sees the sales dashboard only.
- **SQL:** `boss_no_branch_ops.sql`. Checked live afterwards: boss sees 0
  repairs, 0 brands, 0 salesmen; Manager, IT Admin and staff unchanged.
- **Open:** none.

## 2. Manager view-only; Ampang shown as AM — Live (PR #1)

- **What changed:** outlet staff do all input; the Manager watches status.
  New Repair, repair actions, contact logging, figure entry and brand
  editing are gone from the Manager's screens. The AM outlet no longer shows
  as "Ampang".
- **Who:** Manager reads every outlet but changes nothing. Voiding a repair
  became IT Admin only (the Manager used to be able to).
- **SQL:** `manager_view_only.sql` (adds `app.can_work_branch()`: IT Admin
  anywhere, staff at their own outlet; also clears the AM display name).
- **Open:** none.

## 3. Deposit and balance on repairs — Live (PR #1)

- **What changed:** New Repair has **Deposit paid (RM)** next to **Total fee
  (RM)** and a **Balance to pay (RM)** that updates while typing. The repair
  panel and printed slip show both. A deposit needs a fee and cannot exceed it.
- **Who:** staff entering the repair.
- **SQL:** `repair_deposit.sql` (adds `repair_jobs.deposit`; the balance is
  computed, never stored).
- **Open:** none.

## 4. Three-step repair flow — Live (PR #1)

- **What changed:** after intake (Received), staff press **Send to Repair**,
  **Ready to Collect**, then **Mark Collected**. Sent to HQ and Returned to
  Branch are no longer offered. Return Unrepaired and Cancel remain for
  repairs that don't go through.
- **SQL:** none.
- **Open:** none.

## 5. Collection signature visible on collected repairs — Live (PR #1)

- **What changed:** a collected repair's panel shows a **Collection** section:
  who collected, when, and the customer's signature. If the chit was handed
  back instead, it says "No signature taken".
- **Who:** staff for their own outlet, Manager and IT Admin for all. Boss and
  customers cannot see signatures. They are kept in the private `signatures`
  storage bucket.
- **SQL:** none (existing storage rules already matched).
- **Open:** 2 signature images left in storage from the test repairs the owner
  cleared. Removal was offered and not yet answered.

## 6. "Job" renamed to "Repair" on screen — Live (PR #2)

- **What changed:** Repair No., New Repair, Save Repair, Cancel Repair, Void
  Repair, list counts, the public status page and the WhatsApp greeting.
  Code and database names are unchanged.
- **SQL:** none. **Open:** none.

## 7. Edit and delete repairs — Live (PR #3)

- **What changed:** each repair panel has **Edit Details** (customer, phone,
  item, services, observations, fee, deposit, promised date; each correction
  is noted in the repair's history) and **Delete Repair** (asks to confirm).
- **Who:** see the table above. Every delete keeps a full copy of the repair
  in the audit log.
- **SQL:** `repair_delete.sql` (delete permission, policy, and an audit
  trigger).
- **Open:** the delete rule could not be test-run against the live database
  before it was applied; the policy, trigger and permission were confirmed
  present afterwards.

## 8. Status filter shows only the repair steps — Live (PR #4)

- **What changed:** the Repairs status dropdown offers All statuses, Received,
  Sent to Repair, Ready to Collect and Collected. Returned Unrepaired,
  Cancelled and Void repairs still show under All statuses.
- **SQL:** none. **Open:** none.

From here on the owner asked for every update to be merged straight away;
only changes that need SQL wait for the owner to run it.

## 9. Meeting Agenda for the Manager — Live (PR #5)

- **What changed:** the Manager's monthly tool is a page at
  `/dashboard/agenda`. The Manager picks last year's and this year's POS
  exports (uploaded or already saved in the browser), an optional
  Jan-to-month report, the month and the outlets, and gets the filled
  Meeting Agenda workbook, one WhatsApp message per outlet with Copy buttons,
  a summary table, and a ZIP of everything. It runs entirely in the browser;
  nothing is uploaded or stored.
- **Built from** the latest Python generator in the owner's desktop folder
  (not the older copy in V2). Checked on the Jan to Sep 2025/2026 exports:
  every workbook matched the Python cell for cell; 148 of 150 messages were
  identical and the other 2 only swap two lines with equal movement.
- **Who:** Manager only.
- **SQL:** none (owner chose not to save agendas online).
- **Differences from the Python:** year labels come from the reports instead
  of being fixed at 2025/2026; the coded old-format `.xls` cannot be read in
  the browser (save it as `.xlsx` or use the CSV).
- **Open:** not yet opened signed in as the Manager on the live site.

## 10. Top bar tidied, then shared across the app — Live (PRs #6, #7, #8)

- **What changed:** the "No data loaded" pill is gone; the button reads
  **Load Data**, or **Change Data** with a green tick once a report is loaded.
  Tabs are grouped (sales screens | Agenda | Repairs, Daily Report) with
  shorter labels that don't wrap. Repairs and Daily Report now draw the same
  top bar as the dashboard, so moving between them no longer feels like a
  different app (they keep their own layouts so sales data never mixes with
  the repairs database). History became a clock icon next to Load Data.
- **Who:** tabs follow each role's access (see the table above). IT Admin
  also gets a "Console" link.
- **SQL:** none. **Open:** none.

## 11. No error flash after signing in — Live (PR #9)

- **What changed:** right after Sign in, the login page briefly showed the
  red "no active access" box because the account details loaded a moment
  after the login. The app now waits for the account details first.
- **SQL:** none.
- **Open:** not yet confirmed by signing in on the live site.

## 12. Daily Report salesmen management — Live (PR #10)

- **What changed:** salesmen moved out of the Setup tab into their own
  **Salesmen** tab: add, rename, **Remove** (hides them from new entries and
  the Repairs form; past days keep the name) and **Reactivate**. The old
  Setup tab is now **Brands**. Daily entry has an **Add a salesman** box
  under "Who sold" for adding on the spot; figures already typed are kept.
- **Who:** staff for their own outlet, IT Admin for any outlet. Manager and
  Director view-only. Salesmen are never deleted, only deactivated.
- **SQL:** `salesmen_staff_manage.sql` (switches the `staff_members`
  policies to `app.can_work_branch`).
- **Open:** not yet tested signed in as staff.

## 13. Brands drag and drop and Sort A to Z — Live (PR #11)

- **What changed:** on the Brands tab, drag a brand by its grip handle to a
  new spot, or press **Sort A to Z** to put the whole list in alphabetical
  order after brands are added or removed. The up and down arrows stay for
  phones (dragging works with a mouse). New brands go to the bottom until
  sorted or dragged.
- **Who:** staff for their own outlet, IT Admin for any.
- **SQL:** none (uses the existing `reorder_report_brands` function).
- **Open:** dragging not yet tried in a browser.

## 14. Chit number is the repair number — Live (PR #12)

- **What changed:** New Repair opens with a required **Chit no.** box at the
  top. The repair number becomes the outlet code plus the chit number, for
  example `KMT-54279`, so two outlets with the same chit number never clash.
  A chit number already used at the same outlet is refused with an "already
  used" message. Older repairs keep their old numbers.
- **SQL:** none (the repair number was already unique; the chit still saves
  to `preprinted_chit_no`).
- **Open:** the owner has not yet confirmed keeping the outlet-code prefix
  (the alternative is the bare chit number). Not yet tested signed in as
  staff.

## 15. Repair customer copy and signing on the customer's phone — In progress

Plan: `/mnt/project-files/plans/repair-intake-photos-and-remote-signing.md`
in the project files. Being built in two PRs.

- **Intake photos: dropped.** Front, back, side and condition photos would
  outgrow Supabase's free 1 GB storage within about a month, and the owner
  is staying on the free plan. Staff observations (text) remain the record
  of the watch's condition.
- **Customer copy (PR 1, being built):** the status page the slip's QR
  already opens gains an "Intake record" section (date, outlet, item,
  serial no., services, staff observations, warranty declaration), text
  only. After saving, staff get a **Send copy on WhatsApp** button that
  sends the link to the phone number on the repair. The copy never shows the
  phone number, fee or deposit.
- **Signing on the customer's phone (PR 2, being built):** at collection with
  no chit, staff choose "Sign on customer's phone". A one-time link (works
  once, expires in 15 minutes, can be cancelled, unusable once collected)
  goes by WhatsApp to the number on the repair, or staff show a QR on the
  counter screen when someone else collects. The customer signs at
  `/sign?t=…`, the counter screen updates to "Signed", and staff confirm
  collection. Signatures are a few KB each, so this stays within the free plan.
- **Supabase work expected:** one migration (widen
  `get_job_status_by_token` to return the intake fields; a new
  `sign_requests` table with staff-only policies and Realtime; a staff
  function to start a signing link; let `collect_repair_job` accept a
  signature from a signing link), plus deploying one Edge Function,
  `customer-sign`.
- **Open:** "receipt" was read as the repair chit at collection, not the
  purchase receipt. Owner to correct if that's wrong.

---

## Open items across everything

- Sign in on the live site and try: the Meeting Agenda as Manager; the
  Salesmen tab, Add a salesman, Brands drag and drop and a new repair with a
  chit number as staff; that the login flash is gone.
- Confirm the outlet-code prefix on repair numbers (or switch to the bare
  chit number).
- Decide whether to remove the 2 leftover signature images in storage.
- Finish and ship item 15 (customer copy, then phone signing), including its
  SQL file and the `customer-sign` Edge Function.
- Carried over from `PROJECT_STATUS.md`: staff logins for the outlets that
  still have none; Daily Report follow-ups (MIL branch, CS status, duplicate
  brands); Vercel Pro and Phase 6 (retention, backups, paperwork) before real
  customer data. The owner is staying on Supabase free for now; the
  status board's warning that free has no backups still applies.
