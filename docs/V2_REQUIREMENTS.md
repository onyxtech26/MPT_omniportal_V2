# MPT OmniPortal V2 — Requirements & Change Log

**Last updated:** 2026-09-02

## Progress

- **Phase 1 — Nav & cleanup — ✅ DONE (2026-09-01)**
  - Moved navigation from left sidebar → top bar (`app/dashboard/layout.tsx`). Verified visually.
  - Deleted Demand Forecast (`app/dashboard/forecast/`) and Seasonal Insights (`app/dashboard/seasonal/`) pages.
  - Kept Brand Performance. Nav now: Dashboard · Meeting Agenda · Brand Performance · Ask the Data.
  - Removed the two routes from `lib/roles.ts` ROUTE_ACCESS.
  - Added mobile dropdown nav + compact status pill. Typecheck passes.
  - ✅ RESOLVED 2026-09-02 — "Brand Performance" was powered by the AI *forecast* backend; rebuilt on actual sales (see Phase 3).
- **Phase 2 — Client-side data engine — IN PROGRESS.**
  - ✅ `lib/salesData.ts` built — browser port of `backend/datasource.py` `load_summary` (PapaParse + in-browser aggregation). Validated against real Jan–Jul 2025 CSV: 13 outlets, 43,676 txns, RM 5.79M, parsed in ~295ms. Typecheck clean.
  - Structured with a `normalizeRow()` Phase-3 hook (currently no-op) so grouping rules layer in without a rewrite.
  - ✅ Extended to track **units** (`trx_qty`) alongside revenue at profile / month / per-product grain — satisfies req #8 and #10 (salesperson month-by-month, sales + units). Validated: ROGER @ JCI = RM 261k / 1,843 units, full monthly + per-product sales+units breakdown.
  - Scope confirmed: Dashboard + Meeting Agenda must work with NO server; "Ask the Data" AI to be dropped; server login → client-side role picker.
  - Persistence decision: remember last CSV in-browser (IndexedDB) so reopening is instant, data stays on the machine.
  - ✅ **Rewire done & verified in-browser (2026-09-01).** App now runs with NO backend:
    - `data-context.tsx` reads CSV via `salesData.ts`; `lib/csvStore.ts` persists the last CSV in IndexedDB (on-machine only).
    - Upload button + dashboard empty state parse the file locally ("nothing is uploaded to any server").
    - Server login replaced by a client-side **role picker** (`app/page.tsx`): Director / Manager / IT Admin.
    - Removed "Ask the Data" assistant (page + `assistant-bot.tsx`); deleted dead `chatStorage.ts`, `demo-data.ts`.
    - Verified: role picker → dashboard upload prompt → injected CSV → correct totals (RM 66,001.50 over 6 outlets), sorted big→small, persisted across reload. Typecheck clean.
  - ⏭ REMAINING (Phase 2b): **Meeting Agenda** still calls the backend — port its Excel generation to run in-browser (SheetJS). This is the manager's key feature.
- **Phase 3 — Dashboard refinements — IN PROGRESS.**
  - ✅ **Salesperson month-by-month view (req #10) — DONE & verified.** In the salesman drill-down, the "Month-by-Month Performance" list now shows revenue + units per month (newest first), and each month expands to a Product / Sales / Units table sorted big→small. Verified in-browser against injected data (ROGER: Mar RM1,300/6u → CASIO 800/4, ALBA 500/2; Jan RM3,100/17u — all exact). `app/dashboard/page.tsx`. Typecheck clean.
  - ✅ **Grouping cleanup — DONE & validated (req #2, #3, #7).** Implemented in `salesData.ts` `normalizeRow` + `GroupingOptions` (toggle-able, defaults on):
    - #2 Pin→Service: categories PIN / BAT-CLK / SER and desc keywords BATTERY/LABOUR/SERVICE roll into a single **"Service"** group.
    - #3 SW merge: `canonicalSalesman` strips the standalone "SW" token so ROGER / ROGER SW / SW ROGER become one. (UI toggle to *separate* still to build — engine already supports `mergeSW:false`.)
    - #7 Seiko vs wall clock: satisfied by grouping on full description — watch variants and "SEIKO WALL CLOCK"/"ALARM CLOCK" stay distinct; service rule never touches them.
    - Also: returns netted into base product (`-Return` stripped), whitespace-duplicate descriptions merged.
    - Validated on real 2025 data: JCI salesmen 25→19, ROGER 261k→307k (SW folded in), Service line RM 185,744, **grand total identical** before/after (money only relabeled). Typecheck clean.
  - ✅ **#6 Monthly Performance on overview — DONE & verified.** Added a Recharts bar chart of network-wide monthly totals on the Global Overview, with a **Sales / Units toggle** (also the first half of #8). Computed client-side from every salesperson's `monthlyData` across all outlets. Verified in-browser (bars render, toggle switches axis RM↔units). `app/dashboard/page.tsx`; Recharts added to imports. Typecheck clean.
  - ⏭ Remaining Phase 3: UI toggle to *separate* SW channel (#3 second half); extend unit-vs-sales toggle (#8) to the branch cards / brand lists; #4 big→small audit across remaining tables; vendor-name labels.
- **✅ Brand Performance rebuilt on actual sales (2026-09-02).** `app/dashboard/brands/page.tsx` rewritten to read from the client-side engine — outlet scope (all / one), Sales↔Units toggle, ranking biggest-first with share bars, and an expandable per-brand **model** breakdown. Engine extended: `OutletSummary` gains `brandUnits` and `brandModels` (placeholder `**` stock codes excluded, as the old backend did). Verified in-browser on real data: RM 5,793,679 over 150 lines; Service RM 803,652 — matching an independent calculation exactly. By units the ranking flips: **Service is 71.9% of all units but 13.9% of revenue.** Typecheck clean.
- **Phase 2b — Agenda offline (SheetJS/ExcelJS)** — pending (biggest task; ~673 lines + Excel template fidelity).
- **✅ Phase 4 — Leaderboards DONE (2026-09-02).** New page `app/dashboard/leaderboard/page.tsx` + nav + `ROUTE_ACCESS`. Four boards (**Vendor**, Salesperson, Brand, Outlet) × three metrics (Sales / Units / **Margin**), outlet-scoped, ranked largest-first — modelled on `sales-pulse`'s boards. Engine gained `vendors`/`vendorUnits`/`vendorCost`, `brandCost`, `salesmenUnits`/`salesmenCost`. Verified against an independent calculation: SW RM 1,779,084 · TS RM 769,103 · AD RM 658,868; margins SW 26.4%, MPT SB 95.6%, MC 39.4%, AD 31.9% — all exact. Typecheck clean.
- **✅ Figures reconciled to `sales-pulse` (2026-09-02).** Adopted his counting rules in `salesData.ts`. Revenue unchanged (RM 5,793,679 — every row in the file is PS/NI). Transactions corrected 43,676 → **32,774**; ATV RM 132.65 → **RM 176.78**. Service grouping now complete: JCI product lines **369 → 56**, Service becomes its 3rd-largest line (RM 242,209). Typecheck clean.

**Source:** Boss/Manager demo feedback (Day 1) + architecture decision (client-side, no server)

---

## Architecture (decided)

- **Client-side only.** CSV is read and processed in the browser. No backend server; data never leaves the user's machine. (Boss's rule: "don't connect to my server, just upload the CSV and look inside.")
- **Roles = client-side view-switching** (already implemented in `lib/roles.ts`, read from `localStorage`). No secured login server needed.
- Existing stack kept: Next.js + React + Tailwind + Recharts. Next.js static export.
- **To migrate:** the brand/category grouping logic currently lives in the Python backend — it must move to the frontend (client-side) as part of V2.
- **Single stored report (decided 2026-09-02).** `csvStore.ts` holds **one** CSV at a time (key `sales-csv`). Deliberate: keeps the model simple.
  - *Trade-off accepted:* the dashboard cannot do year-on-year comparison (e.g. 2026 vs 2025). If the Director later asks for it, the store, `data-context.tsx` and the views all need extending — budget for that, don't bolt it on.
  - *Not a blocker for the Agenda:* that page takes its year files as ad-hoc uploads at generation time and never relied on stored history.

## Deployment — Vercel (decided 2026-09-02)

V2 is deployed to **Vercel** from `onyxtech26/MPT_omniportal_V2`
(SSH remote: `git@github.com-company:onyxtech26/MPT_omniportal_V2.git`).

`next.config.ts` already sets `output: 'export'`, so the build is a **purely static
site** — HTML/CSS/JS only, no server runtime. That is exactly right for this
architecture and deploys on Vercel's free tier.

**Consequence — the Agenda port is now mandatory, not optional.** No Python backend is
deployed. `app/dashboard/agenda/page.tsx` is the **only** remaining file that calls
`NEXT_PUBLIC_BACKEND_URL`; in production that call has nothing to reach, so "Generate"
fails. Until it is ported to run in-browser, that feature is broken for the Manager.

**The privacy promise still holds, and here is the precise wording:** Vercel hosts the
*application*; it never receives the *data*. The page is downloaded once, like installing
a program, after which the CSV is read on the user's own machine and stored only in that
browser. Nothing is sent back.

**Open point:** a Vercel URL is public by default. Anyone with the link sees an empty
"Load your sales CSV" screen — no company data is exposed — but access protection
(Vercel password protection, or an in-app passcode) is worth offering the Director.

### Agenda decision (2026-09-02)

The Meeting Agenda was **removed from the web app** rather than ported. It was the
only feature needing a running Python backend, and none is deployed with the static
site. Options considered: port to the browser (ExcelJS), run it as a Vercel
serverless function (rejected — the CSV would leave the user's machine, breaking the
Director's requirement), simplify the output, or keep the desktop build.

**Chosen:** keep the desktop build for the Manager, and make the website the
Director's dashboard. The Manager already uses the `.exe` monthly and is unaffected.

⚠️ **`backend/` is deliberately KEPT in the repo** — it is the source of the Agenda
logic the Manager's desktop build depends on, and would be needed to rebuild or fix
that build. Do not delete it while the `.exe` is in use.
> Note: the Electron packaging was removed in the cleanup, so a *new* `.exe` cannot
> be produced without restoring it from git history. The Manager's installed copy
> still works.

**Pre-deploy checklist:**
- [x] **Meeting Agenda resolved** — removed from the web app (2026-09-02). The web app now has **no backend reference of any kind**.
- [x] Remove stale `public/api_dashboard.php` — done 2026-09-02
- [x] **Strip desktop/mobile packaging — done 2026-09-02.** Removed `electron/`, `android/`, `dist-electron/` (~1.3 GB), `capacitor.config.ts`, `generate-assets.js`, `build.log`; dropped `main`, the electron-builder `build` block, the `electron:*` / `dist:exe` scripts, and the `@capacitor/*` + `electron` + `electron-builder` dependencies. Also removed the Capacitor native-save branches from `lib/download.ts` and the dashboard PDF export — browser download is now the only path.
- [x] **`npm run build` verified** — all 5 routes prerender as **Static**; `out/` produced correctly.
- [x] `npm run build` re-verified after removal — 5 static routes, no agenda
- [ ] Decide on access protection (public Vercel URL vs password)

**Audience (clarified 2026-09-02):** the Dashboard is for the **Director only**. Two
further systems are planned for other staff — scope to be defined.

> Note: `output: 'export'` in `next.config.ts` is **kept**. Its comment says "for mobile",
> but it is now wanted for a different reason: it produces the static site Vercel serves.

---

## Roles & access (current intent)

| Role | Sees |
|---|---|
| **Boss / Director** | Dashboard only (for now) |
| **Manager** | Agenda (primary) + Dashboard |
| **Admin / IT** | Everything |

## Features

**Keep:** Dashboard, **Brand Performance** (`/brands`), **Leaderboards** (`/leaderboard`).
**Removed 2026-09-02:** Meeting Agenda — see the Agenda decision below.
**Remove (delete):** Demand Forecast (`/forecast`), Seasonal Insights (`/seasonal`).
> Decided 2026-09-01: Brand Performance stays; Forecast + Seasonal deleted.

---

## Change requests from demo

### A. Navigation / UX
| # | Request | Interpretation | Status |
|---|---|---|---|
| 1 | Nav at top | Move sidebar → top navbar | Clear |
| 9 | Hard to U-turn from a page | Always-visible top nav + clear back control | Clear (tied to #1) |

### B. Grouping / normalization rules (CONFIRMED from data)
| # | Request | Interpretation | Status |
|---|---|---|---|
| 2 | Pin under Service | `inv_category == 'PIN'` (O-rings, spring bars, small parts) rolls into a **Service** group with battery (`BAT-CLK`) + labour | ✅ confirmed |
| 3 | SW separable (Roger / Roger SW) | **"SW" is a salesperson-code prefix/channel**, NOT a brand. Merge `ROGER` + `ROGER SW` + `SW ROGER` → one "Roger" by default; toggle to split out the SW channel | ✅ confirmed (❓ what does SW stand for — Swatch counter?) |
| 7 | Seiko vs Seiko wall clock | Wall clocks = desc `OTHER WALL CLOCK` / category `OH-AC` / vendor `WT`; Seiko watches = `SEI`/`TS`. Keep separate | ✅ confirmed (❓ do Seiko-branded wall clocks exist separately, or all under WT?) |

**Salesperson normalization (data-quality task, feeds #3 and vendor/salesperson views):**
codes are inconsistent — `ROGER SW`, `SW ROGER`, `SW NINA AT`, trailing spaces (`SW ALIFAH `). Need a normalizer: trim, strip the `SW` token, unify order, so one person = one identity (with SW flag retained for the toggle).

### C. Metrics / overview
| # | Request | Interpretation | Status |
|---|---|---|---|
| 4 | Big to small | Default sort descending on all rankings/tables | Clear |
| 6 | Monthly performance on overview | Add monthly trend chart to dashboard overview | Clear |
| 8 | Unit vs Sales separate | Toggle/split units (`trx_qty`) vs sales value (`trx_amt`) | ✅ data engine now tracks both |
| 10 | **Salesperson performance, month by month, with what they sold (sales + units)** | Per-salesperson: monthly revenue+units, and each month's per-product breakdown in both sales and units | ✅ data engine ready; needs the UI view (Phase 3) |

### D. New feature
| # | Request | Interpretation | Status |
|---|---|---|---|
| 5 | Vendor leaderboard | Rank vendors (`vendor_no`) by sales/units, big→small | Clear (confirm vendor name source) |

---

## Reference implementation — the Director's `sales-pulse`

`Boss mpt Project/sales-pulse/` (26 Aug 2026) is a working browser-only analytics tool the
Director provided **as a reference** ("build something like this, or better"). Plain
HTML/CSS/JS with SheetJS + Chart.js. Its tagline — *"Files never leave this browser"* —
independently confirms the V2 client-side architecture.

**It is the authority on how MPT counts things.** Rules adopted 2026-09-02:

| Rule | Source | Our status |
|---|---|---|
| A sale is `trx_type` **PS** or **NI**; `CN` = credit note (return) | sales-pulse | ✅ adopted (`filterCompletedSales`) |
| A return counts **only if matched** to a sale with same `inv_cd` + amount; orphans dropped | sales-pulse | ✅ adopted |
| **Transactions = distinct `trx_no`**, not row count | sales-pulse | ✅ adopted — was overstated (43,676 → 32,774) |
| Service = 13 category codes `LS S-BAT SP PS R-BAT SER BAT-CLK PIN OH FG OT OTS SSS` | sales-pulse | ✅ adopted (we had only 3 — missed ~RM 726k, incl. `S-BAT` = RM 512k) |
| "Brand" means `inv_category`, not `inv_desc` | sales-pulse | ⚠️ OPEN — we group by `inv_desc`. See open questions. |
| `cost × qty` for cost totals | sales-pulse | ❌ **NOT adopted — his tool is wrong here.** `cost_amt` already scales with qty (verified: cost/qty constant per model), so multiplying double-counts. Ours sums `cost_amt` directly. **Raise with the Director.** |

**Features his tool has that we don't (candidates, not yet built):** multi-select pivot
filters (outlet/brand/salesman/model), date-range + year/month filters, Service-vs-Watch
split, 6 leaderboards (salesman, brand, store, **vendor**, salesman margin, brand margin),
WhatsApp daily/MTD summary, searchable transaction table, CSV export, saved report history.

**What we have that his doesn't:** the per-salesperson month-by-month drill-down with
sales + units (the thing the Director actually asked for), SW salesperson merging,
role-based views, and Meeting Agenda generation.

---

## Dataset reference

Raw POS export, ~30 cols. Key fields:
- `com_unit` = outlet/branch • `trx_date` = date • `saleman_cd` = salesperson
- `inv_desc` = product/brand name • `inv_category` = category code (e.g. `BAT-CLK`)
- `vendor_no` = vendor • `trx_qty` = **units** • `trx_amt` = **sales value**
- Note: return rows have negative qty/amount (e.g. `CAESAR-Return`) — must be netted out.

Files: `dataset/Sales Profit Report - By Product Group JAN TO JULY 2025.csv`, `...2026.csv`

---

## Challenges & resolutions (why the code looks like this)

Technical problems hit while building V2 and how they were resolved. Read this before
changing the data layer — several of these are load-bearing decisions, not preferences.
(Narrative versions for the internship report live in `internship-docs/issues-log.md`.)

**1. V1 was server-bound, but the requirement is "no server."**
The dashboard fetched `/api/summary` from a Python FastAPI backend that owned the CSV.
That directly conflicts with the Director's rule that data must not leave his machine.
*Resolved:* ported `backend/datasource.py::FileSource.load_summary` to `lib/salesData.ts`
(PapaParse + in-browser aggregation), with `lib/csvStore.ts` (IndexedDB) holding the last
report locally. ⚠️ **Do not reintroduce `fetch` into the dashboard data path** — that
silently breaks the core guarantee.

**2. "SW" was initially misread as a product/brand suffix.**
The demo note *"SW and other sales put together… for example roger and roger sw"* reads
like a brand variant. Checking the data disproved it: `SW` appears on `saleman_cd`
(`ROGER`, `ROGER SW`, `SW ROGER`, `SW YOYO`, `SW NINA AT`), i.e. a **sales-counter code on
people, not products**.
*Resolved:* `canonicalSalesman()` strips the standalone `SW` token. Lesson: verify demo
shorthand against the raw data before designing to it.

**3. One person, several salesperson codes.**
Variants differ by word order and stray whitespace (`ROGER SW` / `SW ROGER` / `SW ALIFAH `),
so a single person's sales split across leaderboard rows.
*Resolved:* trim + collapse whitespace + strip `SW`, in `normalizeRow`. **Integrity check:**
grand total is identical before and after grouping — money is only relabelled, never moved.
Re-run that check after any grouping change.

**4. Product descriptions are far messier than they look.**
One outlet produced ~475 distinct "brand" keys because returns are separate `-Return` rows,
whitespace variants duplicate entries, and service items (battery/labour/pins) sit in the
same field as real brands.
*Resolved in `normalizeRow`:* strip the `-Return` suffix so returns net against the base
product, collapse whitespace, and roll `PIN` / `BAT-CLK` / `SER` into a single `Service`
group. Wall/alarm clocks are deliberately **not** folded into their watch brand (req #7).

**5. ✅ RESOLVED — "Brand Performance" was showing predictions, not history.**
The page called `/api/forecast/top-brands` and ranked brands by an AI forecast for
Oct–Dec 2025 — a *prediction of a period that had already passed* — while showing real
model figures below it, mixing two kinds of number on one screen under a name that implies
history. Rebuilt 2026-09-02 on actual sales from the loaded CSV (`brands`, `brandUnits`,
`brandModels` from `salesData.ts`); no backend, no predictions.

**6. Minor build friction (for reference).**
- Recharts v3 types `Tooltip`'s `formatter` value as possibly-`undefined`; annotating the
  param as `number` fails typecheck — coerce inside the callback instead.
- Deleting a page folder leaves stale generated types in `.next/`; clear `.next` before
  trusting a `tsc --noEmit` result.
- `lib/demo-data.ts` was dead code that broke typecheck when `units` was added to the
  profile type; deleted along with the demo mode.

---

## Open questions (business intent — not answerable from data)
1. Remove the 3 unused features (Forecast, Brands, Seasonal) entirely, or just hide from boss/manager (keep for admin)?
2. ~~What does "SW" stand for?~~ **ANSWERED 2026-09-02 from the data.** `SW` is also a **vendor code** — the largest supplier at RM 1.78M — and it sells TISSOT, LONGINES, RADO and MIDO, all **Swatch Group** brands. So `SW` = Swatch Group, and a salesperson code like `SW ROGER` means Roger working the **Swatch counter** (shop-in-shop concession). This is exactly what the Director meant by "SW and other sales put together, add option to separate".
3. Vendor codes are short (`TS`, `WT`, `TMY`, `LST`...). Currently shown as-is on the Leaderboards page with a footnote. Two are now known: **`SW` = Swatch Group**, **`MPT SB` = MPT's own in-house service** (95.6% margin — battery + labour). Ask the Director for a code→name list to label the remaining 52.

## Confirmed data facts
- **Pin** = `inv_category == 'PIN'` → Service group.
- **SW** = salesperson channel prefix/suffix on `saleman_cd` → normalize + toggle.
- **Wall clock** = `inv_desc == 'OTHER WALL CLOCK'` / cat `OH-AC` / vendor `WT`.
- **Outlets in file:** JCI, SAT, AM, KMT, GPL, TBT, KLT, MRT, WZ, JKL, MFW, TSB + HQ.
- **Vendors:** 54 distinct. `SW` = Swatch Group (Tissot/Longines/Rado/Mido), largest by revenue. `MPT SB` = MPT's own service entity (battery + labour), ~19k units at 95.6% margin.
- **Business insight (2026-09-02):** in-house service (`MPT SB`) is the **2nd-largest profit generator** (RM 413,362) despite far lower revenue, because its margin is 95.6% vs Swatch Group's 26.4%. Separately, Service is **71.9% of all units sold but only 13.9% of revenue**.
- **Returns** = negative `trx_qty`/`trx_amt` (desc suffix `-Return`) → net out.
