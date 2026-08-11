# Backend / Portal — PROJECT STATE

> Read at the start of a session that touches `mpt-omniportal/backend/`.
> Sister documents: `mpt-agenda-automation/PROJECT_STATE.md` (agenda engine),
> `datamining/PROJECT_STATE.md` (CRISP-DM pipeline). This file was created
> 2026-08-09 because the portal backend had no continuity record of its own.

## ▶ Resume here

**Last session ended:** 2026-08-11 (claude-opus-5)

**What just got done:** The Supabase database was rebuilt from scratch on a new
account, and the parity harness the code had always *claimed* to have was
actually written.

Why the rebuild: the original project (`kkilnabfirwtfreewpaq`, org "Onyx Tech")
became unreachable — the student could not see it from any account they could
log into, though Supabase's free-project counter still attributed it to
`onyxtech26`. Rather than keep chasing it, the whole thing was recreated on the
personal account that also owns the GitHub repo. That is the better home for it
anyway: **`zvtxkxhappkawzfqygff`**, org "kunacosta's Org", region
`ap-southeast-1` (Singapore, was Seoul on the interim attempt).

The rebuild is now reproducible rather than hand-made:
- `backend/supabase_schema.sql` — table, 5 indexes, RLS policy, grants, the
  `run_readonly_query` RPC, and the advisor hardening. Idempotent, re-runnable.
- `backend/seed_supabase.py` — loads the 123,783 demo rows. Prompts for the
  service_role key (hidden input) instead of storing it, and **refuses to run
  against a non-empty table** — that guard exists because the original seeding
  died mid-run on a NaN and silently left 6,000 duplicates behind.

Verified after rebuild: 123,783 rows, 13 outlets, 41 staff, 1,059 brands,
RM19,988,203.32 — identical to the old project and to the CSV on disk, so every
figure quoted in the report still holds. Security advisors: **0 findings**.
43 tests pass.

**Nothing outstanding.** The dev `.env` says `DATA_SOURCE=supabase`, and that is
fine to leave alone: the frozen build skips `.env` entirely (see below), so the
desktop installer stays offline regardless. The `nvapi-` key lives only in the
gitignored `backend/.env`. Previous `.env` saved as `.env.bak-old-project`.

**One action left for the student:** the service_role key for the new project
was pasted into a chat transcript during the rebuild and should be rotated
(Project Settings → API keys). Rotating it does not affect the app, which
authenticates with the anon key.

## Architecture

Two interchangeable sales backends behind `backend/datasource.py`:

| Mode | Reads from | Used by | Assistant |
|---|---|---|---|
| `file` (default) | CSV in `%APPDATA%\MPT OmniPortal\` | packaged Windows app, offline demos | unavailable |
| `supabase` | Postgres over PostgREST | hosted deployment, the AI assistant | available |

They are proven interchangeable: `/api/summary` output is identical across all
13 outlets, 41 salespeople, every monthly and daily figure, and 2,378
brand-model rows. Re-run that check after touching either implementation
(the parity script pattern is in this session's log).

**Supabase project:** `mpt-omniportal` / `kkilnabfirwtfreewpaq`, region
ap-southeast-1, org Onyx Tech, free tier. Contains **only fabricated demo
data**. Real POS exports must never be loaded into it.

**The demo dataset** is `backend/Sales Profit Report - By Product Group DEMO
2025-2026.csv` — 123,783 rows, Jan 2025 to Jul 2026, RM19,988,203.32. Jan-Sep
2025 is the original anonymised export; Oct 2025 onward is synthesised by
`backend/make_demo_dataset.py`, which resamples the real distribution of
branches, brands, staff and prices and applies a seasonal shape (CNY, Raya,
December) plus 8% year-on-year growth. It is seeded and reproducible.
The span matters: without a second year the portal has nothing to compare
against, and year-on-year comparison is what the meeting agenda exists for.
Regenerate with `python make_demo_dataset.py` from `backend/`.

**Salesperson names are real, by the student's explicit decision** (2026-08-10).
The `STF-nn` placeholders were replaced with the actual names from the July
export via `backend/apply_real_names.py`, each matched to a person who really
works at that branch. Money, quantities and dates remain fabricated; customer
and transaction identifiers are still absent entirely. Consequences to keep in
mind: those names are now in the project's Supabase table, which grants `anon`
SELECT — so anyone holding the publishable key can read them. `backend/*.csv`
is gitignored and the names are deliberately **not** hard-coded in
`apply_real_names.py`, so nothing reaches git history. If the names ever need
to come out, rerun `make_demo_dataset.py` (which rebuilds from the `STF-nn`
source file) and reseed.

**Why the assistant cannot damage anything:** the `anon` role holds `SELECT`
and nothing else — INSERT/UPDATE/DELETE are revoked — and
`run_readonly_query` is `SECURITY INVOKER`, so model-authored SQL executes
with those same privileges. `assistant.validate_sql` rejects non-SELECT
statements before that point, but the database is the guarantee, not the
validator. Verified: `delete`, `update` and `drop` are all rejected live.

## Gotchas

- **Sorting ties is a parity bug waiting to happen.** `brand_models` ranks by
  units, and across 579 models there are only 21 distinct unit counts. With no
  secondary sort key the two backends returned the same rows in a different
  order — pandas' sort is stable and kept the grouped order, Postgres
  guarantees nothing and was not even stable between runs. Both now sort by
  model code as a tie-break. Any new ranked output needs the same treatment;
  equal values are the norm in this dataset, not the exception.
- **RLS is not what blocks writes here.** The policy is `using (true)` — it
  permits reads and does no filtering. Writes are blocked by the *grant*
  (`anon` holds SELECT only). Do not conflate the two when explaining the
  security model; they are separate mechanisms. RLS is where per-branch
  scoping would go if that is ever built.
- **Supabase's `rls_auto_enable` trips the security advisor on new projects.**
  It is a platform-supplied `SECURITY DEFINER` event-trigger function granted
  to PUBLIC, so it shows up as reachable over PostgREST. `supabase_schema.sql`
  revokes EXECUTE from `anon`/`authenticated`/`public`. Confirmed this does not
  break it — creating a table still auto-enables RLS, because event triggers
  fire through DDL processing rather than role grants.

- **`/health` must never depend on the database.** `electron/main.js` blocks
  window creation on a 30-second `/health` poll; a DB check there would leave
  an offline install staring at a broken window.
- **`load_dotenv()` was missing for months.** `python-dotenv` sat in
  requirements.txt while nothing called it, so `backend/.env` was silently
  ignored. It is now called at the top of `main.py` — **but only when not
  frozen.** The packaged desktop app must not read a developer `.env` that
  points at a cloud database, or it would break on a machine with no network.
  Real environment variables still apply, so a packaged install can still be
  configured deliberately. This is why `DATA_SOURCE=supabase` can sit in the
  dev `.env` without endangering the installer.
- **Tests pin `DATA_SOURCE=file`** in `backend/tests/conftest.py` so a
  developer's local `.env` cannot change what the suite exercises.
- **pandas `groupby` drops null keys; SQL does not.** The Supabase queries add
  `is not null` guards on grouping columns to match. Related: a month's
  `revenue` counts every row while its `brands` breakdown excludes null-brand
  rows, so those need two separate queries.
- **Seeding cannot go through a chat context** (55k rows). Use a local script
  against a temporary `SECURITY DEFINER` RPC and drop it afterwards. If a seed
  run fails partway, check for duplicates before retrying — one aborted run
  left 6,000 extra rows.
- **Upload validation covers 9 columns, not 6.** It previously checked only the
  dashboard's columns, so a CSV could upload cleanly and then break
  `/api/brands/models` with a KeyError.
- **A follow-up question needs three things the obvious design forgets.**
  `/api/chat` is stateless, so the client sends the recent turns and both model
  steps receive them — the SQL step to resolve "what about JCI?", and the
  answer step because otherwise it sees that bare phrase beside a table of
  brand names and reports no matching records. It also receives **the query
  that produced the rows**: a filter lives in the WHERE clause, not in the
  output columns, so given `WHERE com_unit = 'JCI'` the model hunted for a JCI
  value among the results and concluded it was missing. Some follow-ups need
  no query at all ("is this for next month?"), so the model may answer
  `NO_QUERY` and is then answered from the conversation plus the dataset's
  coverage.
- **Never state the data's date range as a literal in a prompt.** It said
  "covers Jan-Sep 2025", went stale when the dataset was extended to Jul 2026,
  and the model duly compared 2024 against 2025 and found nothing. Coverage is
  now read from the source once per process and injected.
- **The assistant's failure modes are mostly the model refusing, not the code
  breaking.** Three distinct ones, all now handled in `assistant.py`:
  (a) `clean_sql` used to search for a bare `select|with` *anywhere*, so the
  "with" inside a refusal ("I can't help with that") became the query
  `with that.` — the keyword must begin a line, and no match returns `""` so
  the caller can say something human; (b) wording like "which stocks should I
  invest in" reads as financial advice, so both prompts state explicitly that
  stock means shop inventory, and `_is_unhelpful()` detects a refusal or an
  empty-result claim made while holding rows, and retries; (c) generated SQL
  occasionally references a column that does not exist, so a failed execution
  regenerates the query once instead of surfacing a raw Postgres error.
  Answers are also asked for in plain text — the model reaches for `**bold**`
  otherwise, and the chat UI renders it via a small `RichText` helper.
- **Never let an element's visibility depend on an entrance animation.**
  `components/assistant-bot.tsx` originally used `initial={{opacity:0}}` +
  `animate={{opacity:1}}`. Animation frames stop in a background or
  non-compositing tab, so the robot stayed frozen at `initial` — permanently
  invisible. It now renders visible by default and motion only moves it.
  Related first bug in the same component: putting the drift keyframes'
  `transition` inside the `animate` object applied that 34-second repeating
  timing to `opacity` and `scale` as well, so it faded in over half a minute
  then reset. Per-property transitions, or no entrance animation at all.
- **FastAPI returns `detail` in two shapes, and one of them crashes React.**
  Errors the app raises give `detail` as a string; a Pydantic validation
  failure (422) gives an *array* of `{type, loc, msg, input, ctx}` objects.
  Rendering the second directly produces "Objects are not valid as a React
  child". Reproduce by asking the assistant a question under 3 characters.
  All five frontend fetch error paths now go through
  `lib/apiError.ts::apiErrorMessage()`; use it for any new endpoint call
  rather than reading `data.detail` directly.
- **Never run `npm run build` while `npm run dev` is running.** Both write to
  `.next/`, and the dev server then serves 500s with "Cannot read properties
  of undefined (reading 'call')". Recovery: stop dev, `rm -rf .next`, restart.
- **A dead uvicorn `--reload` parent can leave an orphaned worker serving old
  code.** `start.bat` runs uvicorn with `--reload`, which spawns a child
  process. If the parent is killed (or a previous run was never closed), the
  child keeps listening on port 8000 and answers every request from the code
  it was started with — so edits appear to have no effect and the bug you
  just fixed keeps happening. Symptom seen: `/api/chat` failing identically
  4/4 through the server while the same call succeeded 5/5 in-process. Before
  concluding anything about server behaviour, check for strays:
  `Get-CimInstance Win32_Process -Filter "Name like '%python%'"` and confirm
  only one thing is listening on 8000. Note the orphan may run under the
  *system* Python rather than the venv, which makes it easy to overlook.
- **Many NVIDIA models are listed but do not serve.** `GET /v1/models` returns
  ~100 ids; several of them (`meta/llama-3.3-70b-instruct`,
  `openai/gpt-oss-120b`, `nvidia/llama-3.1-nemotron-nano-8b-v1`) accept the
  connection and then never reply, which looks exactly like a network problem.
  Diagnose by calling `GET /v1/models` first: if that returns 200 quickly, the
  network and key are fine and the model is the problem. Benchmarked on this
  workload: `openai/gpt-oss-20b` 3/3 in 4-12s (current default, cleanest SQL),
  `meta/llama-3.1-8b-instruct` 3/3 in ~1.2s but noisier SELECT lists,
  `meta/llama-3.1-70b-instruct` 1/3.

## Environment variables

See `backend/.env.example`. `JWT_SECRET`, `DATA_SOURCE`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `NVIDIA_API_KEY`, `NVIDIA_MODEL`, `NVIDIA_BASE_URL`.
The NVIDIA endpoint is OpenAI-compatible, so another provider can be swapped
in by changing `NVIDIA_BASE_URL` and `NVIDIA_MODEL` alone.
