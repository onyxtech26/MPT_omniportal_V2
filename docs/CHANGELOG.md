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

---

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
