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
