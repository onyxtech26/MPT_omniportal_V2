/**
 * Meeting Agenda calculation engine — a line-for-line port of
 * backend/agenda/engine.py so the agenda runs in the browser and the POS
 * exports never leave the manager's computer (the same rule the sales
 * dashboard follows).
 *
 * Given the raw POS "Sales Profit Report" CSV, compute per-outlet
 * sales/cost/profit/margin for a month and for the Jan->month accumulation,
 * applying the trx_mode D-minus-C rule. Rounding and summation reproduce
 * pandas exactly (see pynum.ts) so figures match the Python tool to the cent.
 */
import Papa from 'papaparse';
import JSZip from 'jszip';
import { pandasSum, pyRound, npRound } from './pynum';

/** The six main outlets, in the order of the agenda template's rows. */
export const TARGET_BRANCHES = ['JCI', 'KMT', 'GPL', 'MRT', 'MFW', 'SAT'];

/** One POS line, reduced to the fields the agenda uses. NaN = missing. */
export interface Txn {
  unit: string | null;
  month: number;      // 1-12, NaN when the date did not parse
  year: number;
  mode: string | null;
  category: string | null;
  amt: number;
  cost: number;
  qty: number;
}

export interface PosReport {
  rows: Txn[];
  /** Rows per outlet code, in file order (the order pandas filters in). */
  byUnit: Map<string, Txn[]>;
  /** Outlet codes present, trimmed, sorted. */
  outlets: string[];
  /** The calendar year most rows fall in, or null if no date parsed. */
  year: number | null;
  /** Months (1-12) that have at least one row. */
  months: number[];
}

export interface Figures {
  branch: string;
  sales: number;
  cost: number;
  qty: number;
  profit: number;
  margin: number;
}

export interface CategoryFigures {
  sales: number;
  cost: number;
  profit: number;
  qty: number;
}

/** Totals for one outlet read from a printed "Sales Profit Report" workbook. */
export interface ReportTotals {
  sales: number;
  profit: number;
  cost: number;
  margin: number;
}

// pandas' default missing-value markers. With dtype=str these cells become NaN
// and drop out of comparisons and groupings, so a category literally coded "NA"
// is ignored by the Python tool — and must be here too.
const NA_VALUES = new Set([
  '', '#N/A', '#N/A N/A', '#NA', '-1.#IND', '-1.#QNAN', '-NaN', '-nan',
  '1.#IND', '1.#QNAN', '<NA>', 'N/A', 'NA', 'NULL', 'NaN', 'None', 'n/a',
  'nan', 'null',
]);

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v);
  return NA_VALUES.has(s) ? null : s;
}

/** pandas.to_numeric(errors='coerce'). */
function num(v: unknown): number {
  const s = str(v);
  if (s === null || s.trim() === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/;

/** The POS date formats the Python tool accepts: d/m/Y H:M:S, then d/m/Y H:M. */
function parseDate(v: unknown): { month: number; year: number } {
  const s = str(v);
  const m = s ? DATE_RE.exec(s) : null;
  if (!m) return { month: NaN, year: NaN };
  const [day, month, year, hh, mm, ss] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hh > 23 || mm > 59 || ss > 59) {
    return { month: NaN, year: NaN };
  }
  return { month, year };
}

function indexReport(rows: Txn[]): PosReport {
  const byUnit = new Map<string, Txn[]>();
  const outlets = new Set<string>();
  const yearCount = new Map<number, number>();
  const months = new Set<number>();
  for (const r of rows) {
    if (r.unit !== null) {
      const list = byUnit.get(r.unit);
      if (list) list.push(r);
      else byUnit.set(r.unit, [r]);
      const trimmed = r.unit.trim();
      if (trimmed) outlets.add(trimmed);
    }
    if (!Number.isNaN(r.year)) yearCount.set(r.year, (yearCount.get(r.year) ?? 0) + 1);
    if (!Number.isNaN(r.month)) months.add(r.month);
  }
  let year: number | null = null;
  let best = -1;
  for (const [y, c] of yearCount) if (c > best) { best = c; year = y; }
  return {
    rows, byUnit,
    outlets: [...outlets].sort(),
    year,
    months: [...months].sort((a, b) => a - b),
  };
}

/** Load and normalise a raw POS report CSV (engine.load_report_csv). */
export function parseReportCsv(text: string): PosReport {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const fields = parsed.meta.fields ?? [];
  for (const need of ['com_unit', 'trx_date', 'trx_mode', 'trx_amt', 'cost_amt', 'trx_qty', 'inv_category']) {
    if (!fields.includes(need)) {
      throw new Error(`This does not look like the full POS export (no "${need}" column).`);
    }
  }
  const hasDiscount = fields.includes('discount');
  const rows: Txn[] = parsed.data.map((rec) => {
    let amt = num(rec.trx_amt);
    if (hasDiscount) {
      const d = num(rec.discount);
      const rate = Number.isNaN(d) ? 0 : d / 100;
      amt = npRound(amt * (1 - rate), 2);
    }
    const { month, year } = parseDate(rec.trx_date);
    return {
      unit: str(rec.com_unit),
      month, year,
      mode: str(rec.trx_mode),
      category: str(rec.inv_category),
      amt,
      cost: num(rec.cost_amt),
      qty: num(rec.trx_qty),
    };
  });
  return indexReport(rows);
}

type Col = 'amt' | 'cost' | 'qty';

/**
 * D-minus-C net: debits add, credits (returns) subtract. Credit rows are
 * summed as-is (signed): a negative C row is a POS correction that cancels a
 * positive one, so taking the absolute value would double-subtract it.
 */
function net(rows: Txn[], col: Col): number {
  const debit = pandasSum(rows.filter((r) => r.mode === 'D').map((r) => r[col]));
  const credit = pandasSum(rows.filter((r) => r.mode === 'C').map((r) => r[col]));
  return pyRound(debit - credit, 2);
}

function select(report: PosReport, branch: string, months: number[]): Txn[] {
  const rows = report.byUnit.get(branch) ?? [];
  return rows.filter((r) => months.includes(r.month));
}

/** Sales/cost/profit/margin/qty for one outlet over the given month(s). */
export function branchFigures(report: PosReport, branch: string, months: number[]): Figures {
  const sub = select(report, branch, months);
  const sales = net(sub, 'amt');
  const cost = net(sub, 'cost');
  const qty = net(sub, 'qty');
  const profit = pyRound(sales - cost, 2);
  const margin = sales ? pyRound(profit / sales, 4) : 0;
  return { branch, sales, cost, qty, profit, margin };
}

/** Per-category sales/cost/qty for one outlet over the given months. */
export function productBreakdown(
  report: PosReport, branch: string, months: number[],
): Map<string, CategoryFigures> {
  const groups = new Map<string, Txn[]>();
  for (const r of select(report, branch, months)) {
    if (r.category === null) continue; // groupby drops missing keys
    const g = groups.get(r.category);
    if (g) g.push(r);
    else groups.set(r.category, [r]);
  }
  const result = new Map<string, CategoryFigures>();
  for (const cat of [...groups.keys()].sort()) {
    const grp = groups.get(cat)!;
    const sales = net(grp, 'amt');
    const cost = net(grp, 'cost');
    const qty = net(grp, 'qty');
    result.set(cat, { sales, cost, profit: pyRound(sales - cost, 2), qty: pyRound(qty, 1) });
  }
  return result;
}

/** Returns (amount, pct) variance of this vs last year. */
export function variance(thisYear: number, lastYear: number): [number, number] {
  const amt = pyRound(thisYear - lastYear, 2);
  const pct = lastYear ? pyRound(amt / lastYear, 4) : 0;
  return [amt, pct];
}

// ---- Printed "Sales Profit Report" workbook (accumulated figures) ----------

// POS cipher: digits are substituted in printed reports to hide margins from
// staff. Encoded letter -> digit:  - R A Y M O N D J E  ->  0 1 2 3 4 5 6 7 8 9
const DECODE: Record<string, string> = {
  '-': '0', R: '1', A: '2', Y: '3', M: '4', O: '5', N: '6', D: '7', J: '8', E: '9',
};

/** Decode a POS-encoded financial string to a number. */
export function decodePos(raw: string): number {
  let s = raw.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/,/g, '');
  const decoded = [...s].map((ch) => DECODE[ch] ?? ch).join('');
  const val = Number(decoded);
  if (decoded.trim() === '' || !Number.isFinite(val)) {
    throw new Error(`Could not decode "${raw}" in the report.`);
  }
  return negative ? -val : val;
}

function xmlText(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Read the first sheet of an .xlsx as rows of raw cell values (column A = 0). */
async function readXlsxRows(data: ArrayBuffer | Uint8Array): Promise<(string | number | null)[][]> {
  const zip = await JSZip.loadAsync(data);
  const read = async (p: string) => (await zip.file(p)?.async('string')) ?? null;

  const workbook = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw new Error('Not a readable Excel workbook.');
  const firstSheet = /<sheet\b[^>]*?r:id="([^"]+)"/.exec(workbook);
  const target = firstSheet && new RegExp(`<Relationship\\b[^>]*?Id="${firstSheet[1]}"[^>]*?Target="([^"]+)"`).exec(rels)
    || firstSheet && new RegExp(`<Relationship\\b[^>]*?Target="([^"]+)"[^>]*?Id="${firstSheet[1]}"`).exec(rels);
  if (!target) throw new Error('Could not find the first sheet in the workbook.');
  const sheetPath = target[1].startsWith('/') ? target[1].slice(1) : `xl/${target[1]}`;
  const sheet = await read(sheetPath);
  if (!sheet) throw new Error('Could not open the first sheet in the workbook.');

  const shared: string[] = [];
  const sst = await read('xl/sharedStrings.xml');
  if (sst) {
    for (const si of sst.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      shared.push([...si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join(''));
    }
  }

  const rows: (string | number | null)[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: (string | number | null)[] = [];
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs);
      if (!ref) continue;
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const inner = c[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value: string | number | null = null;
      if (t === 's' && v !== undefined) value = shared[Number(v)] ?? null;
      else if (t === 'inlineStr') value = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join('');
      else if (t === 'str' || t === 'e') value = v !== undefined ? xmlText(v) : null;
      else if (t === 'b') value = v !== undefined ? Number(v) : null;
      else if (v !== undefined) value = Number(v);
      row[colIndex(ref[1])] = value;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Read a printed "Sales Profit Report" workbook and return outlet totals
 * (engine.load_xls_report): Sales from column N (plain), Profit from Q and
 * Margin % from S (both POS-encoded), on every outlet "Total:" row.
 *
 * Only .xlsx is readable in the browser; an old-format .xls has to be saved
 * as .xlsx first (or the CSV used instead).
 */
export async function parseReportWorkbook(data: ArrayBuffer | Uint8Array): Promise<Map<string, ReportTotals>> {
  const rows = await readXlsxRows(data);
  const result = new Map<string, ReportTotals>();
  for (const row of rows) {
    const label = row[4];
    if (typeof label !== 'string' || !label.includes('Total:') || label.includes('Grand')) continue;
    const branch = label.replace(' Total:', '').trim();
    const salesRaw = Number(row[13]);
    if (row[13] === null || row[13] === undefined || !Number.isFinite(salesRaw)) {
      throw new Error(`The ${branch} total row has no sales figure.`);
    }
    const sales = pyRound(salesRaw, 2);
    const profit = pyRound(decodePos(String(row[16] ?? '')), 2);
    const margin = pyRound(decodePos(String(row[18] ?? '')) / 100, 4);
    result.set(branch, { sales, profit, cost: pyRound(sales - profit, 2), margin });
  }
  return result;
}
