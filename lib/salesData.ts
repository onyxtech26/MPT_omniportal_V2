/**
 * Client-side sales-data engine.
 *
 * This is the browser port of the old Python backend's `FileSource.load_summary`
 * (backend/datasource.py). It reads a POS CSV entirely in the browser and
 * produces the exact `outlets` structure the dashboard already consumes — so the
 * app can run with NO server and the CSV never leaves the user's machine.
 *
 * Faithful-port note: the aggregation here mirrors the Python one 1:1 so nothing
 * regresses. The boss's grouping rules (Pin→Service, SW salesperson merge,
 * wall-clock split, unit-vs-sales) are deliberately NOT applied here yet — they
 * layer on top in Phase 3 via `normalizeRow` below, which is currently a no-op.
 */
import Papa from 'papaparse';

// ---- Output shapes (match app/dashboard/data-context.tsx) -------------------

export interface SalesmanProfile {
  name: string;
  totalRevenue: number;
  totalUnits: number;                       // units sold (sum of trx_qty), returns netted
  brands: Record<string, number>;           // revenue per product/brand
  brandUnits: Record<string, number>;       // units per product/brand
  // Month-by-month: each month carries revenue + units, and the per-product
  // breakdown for that month in BOTH revenue and units — this is what powers the
  // boss's "each salesperson, month by month, what they sold (sales + units)" view.
  monthlyData: Record<string, {
    revenue: number;
    units: number;
    brands: Record<string, number>;         // revenue per product that month
    brandUnits: Record<string, number>;     // units per product that month
  }>;
  dailyRevenue: Record<string, number>;
}

export interface OutletSummary {
  code: string;
  name: string;
  totalRevenue: number;
  totalUnits: number;          // units sold across the outlet
  totalInvestment: number;
  transactionCount: number;
  salesmen: Record<string, number>;        // revenue per salesperson
  salesmenUnits: Record<string, number>;   // units per salesperson
  salesmenCost: Record<string, number>;    // cost of goods per salesperson
  brands: Record<string, number>;          // revenue per brand/product line
  brandUnits: Record<string, number>;      // units per brand/product line
  brandCost: Record<string, number>;       // cost of goods per brand
  vendors: Record<string, number>;         // revenue per supplier
  vendorUnits: Record<string, number>;     // units per supplier
  vendorCost: Record<string, number>;      // cost of goods per supplier
  // brand -> model code -> totals. Powers the Brand Performance drill-down
  // ("which actual models of this brand sold").
  brandModels: Record<string, Record<string, { units: number; revenue: number }>>;
  salesmanProfiles: Record<string, SalesmanProfile>;
}

export interface SalesSummary {
  message: string;
  outlets: OutletSummary[];
}

// Columns a sales CSV must provide (mirrors REQUIRED_COLUMNS in datasource.py).
export const REQUIRED_COLUMNS = [
  'com_unit', 'saleman_cd', 'inv_desc', 'trx_amt', 'cost_amt', 'trx_date',
  'trx_qty', 'list_price', 'inv_cd',
] as const;

// ---- Row-level helpers ------------------------------------------------------

/** A single parsed transaction, with the fields the aggregation needs. */
interface Row {
  com_unit: string;
  saleman_cd: string;
  inv_desc: string;
  inv_category: string;   // POS category code, e.g. PIN / BAT-CLK / SEI-WC
  trx_no: string;         // transaction number — several rows share one sale
  inv_cd: string;         // model/stock code, e.g. TS-SRPK13K1-4R3
  vendor_no: string;      // supplier code, e.g. TS / WT / TMY
  trx_amt: number;        // sales value
  trx_qty: number;        // units
  cost_amt: number;
  month: string | null;   // 'YYYY-MM' or null when the date won't parse
  day: string | null;     // 'YYYY-MM-DD' or null
}

/** pandas `to_numeric(errors='coerce').fillna(0)` — bad values become 0. */
function toNumber(value: unknown): number {
  if (value == null) return 0;
  const n = parseFloat(String(value).trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse the POS date, which looks like "09/02/2025 00:00:00" and is day-first
 * (DD/MM/YYYY), matching pandas' `to_datetime(dayfirst=True)`. Returns the month
 * and day keys, or nulls when the value is missing/unparseable.
 */
function parseDate(value: unknown): { month: string | null; day: string | null } {
  if (!value) return { month: null, day: null };
  const datePart = String(value).trim().split(' ')[0];
  const m = datePart.split(/[/-]/);
  if (m.length < 3) return { month: null, day: null };
  const [dd, mm, yyyy] = m;
  if (!dd || !mm || !yyyy || yyyy.length < 4) return { month: null, day: null };
  const d = dd.padStart(2, '0');
  const mo = mm.padStart(2, '0');
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) {
    return { month: null, day: null };
  }
  return { month: `${yyyy}-${mo}`, day: `${yyyy}-${mo}-${d}` };
}

/**
 * Grouping rules the boss asked for. Toggle-able so the UI can later offer
 * "separate the SW channel" etc.; defaults reflect what he wants to see normally.
 */
export interface GroupingOptions {
  /** Merge a salesperson's SW-channel sales into their base name (ROGER SW → ROGER). */
  mergeSW?: boolean;
  /** Roll pin / battery / labour / service items into a single "Service" group. */
  groupService?: boolean;
}

const DEFAULT_GROUPING: Required<GroupingOptions> = { mergeSW: true, groupService: true };

/** The label all service-type items collapse to. */
export const SERVICE_LABEL = 'Service';

// Categories that are after-sales service, not a product/brand.
// This list is the company's own definition, taken from the Director's
// `sales-pulse` tool so both applications classify rows identically.
const SERVICE_CATEGORIES = new Set([
  'LS', 'S-BAT', 'SP', 'PS', 'R-BAT', 'SER',
  'BAT-CLK', 'PIN', 'OH', 'FG', 'OT', 'OTS', 'SSS',
]);

// Transaction types that represent a completed sale, and the credit-note type
// used for returns. Anything else is not a sale and is excluded.
const SALE_TYPES = new Set(['PS', 'NI']);
const RETURN_TYPE = 'CN';

/**
 * Canonical salesperson name. The POS logs the same person under several codes
 * — "ROGER", "ROGER SW", "SW ROGER" — where "SW" marks the SW sales counter.
 * Stripping that token (and collapsing whitespace) merges them into one identity.
 */
function canonicalSalesman(code: string, mergeSW: boolean): string {
  const t = code.trim().replace(/\s+/g, ' ');
  if (!mergeSW) return t;
  const kept = t.split(' ').filter((tok) => tok.toUpperCase() !== 'SW');
  const merged = kept.join(' ').trim();
  return merged || t; // don't erase a code that was only "SW"
}

/** Is this row an after-sales service item rather than a product? */
function isServiceItem(category: string): boolean {
  return SERVICE_CATEGORIES.has(category.trim().toUpperCase());
}

/**
 * Apply the grouping rules to one row. Wall/alarm clocks are deliberately left
 * as their own descriptions (e.g. "SEIKO WALL CLOCK"), so they stay separate from
 * Seiko watches — that's req #7, satisfied simply by not folding them together.
 */
function normalizeRow(row: Row, opts: Required<GroupingOptions>): Row {
  // Salesperson: merge SW-channel codes into the base name.
  row.saleman_cd = canonicalSalesman(row.saleman_cd, opts.mergeSW);

  // Product: tidy whitespace, net returns into the base product, group service.
  let desc = row.inv_desc.trim().replace(/\s+/g, ' ');
  desc = desc.replace(/-Return$/i, ''); // a return nets against the base product
  if (opts.groupService && isServiceItem(row.inv_category)) {
    desc = SERVICE_LABEL;
  }
  row.inv_desc = desc;
  return row;
}

// ---- Aggregation ------------------------------------------------------------

function addTo(map: Record<string, number>, key: string, amount: number): void {
  map[key] = (map[key] ?? 0) + amount;
}

/**
 * Keep only rows that represent a completed sale.
 *
 * Mirrors the rule used by the Director's own `sales-pulse` tool so both
 * applications report the same figures:
 *   - `PS` / `NI` rows are sales and always count.
 *   - `CN` (credit note) is a return, and only counts when a matching sale —
 *     same model and same amount — exists in this file. An orphan credit note,
 *     cancelling a sale made in some earlier period not present here, is dropped
 *     so it cannot show up as phantom negative revenue.
 *   - Anything else is not a sale and is excluded.
 */
export function filterCompletedSales(records: Record<string, string>[]): Record<string, string>[] {
  const keyOf = (r: Record<string, string>) =>
    `${(r.inv_cd ?? '').trim()}|${Math.abs(toNumber(r.trx_amt)).toFixed(2)}`;

  // Pass 1: how many genuine sales exist for each model+amount pair.
  const available = new Map<string, number>();
  for (const r of records) {
    const type = (r.trx_type ?? '').trim().toUpperCase();
    if (SALE_TYPES.has(type)) {
      const k = keyOf(r);
      available.set(k, (available.get(k) ?? 0) + 1);
    }
  }

  // Pass 2: keep sales; keep a return only if it can be matched to one.
  return records.filter((r) => {
    const type = (r.trx_type ?? '').trim().toUpperCase();
    if (SALE_TYPES.has(type)) return true;
    if (type !== RETURN_TYPE) return false;
    const k = keyOf(r);
    const remaining = available.get(k) ?? 0;
    if (!remaining) return false;
    available.set(k, remaining - 1);  // each sale can absorb only one return
    return true;
  });
}

/** Build the dashboard summary from raw parsed CSV records. */
export function aggregate(records: Record<string, string>[], options?: GroupingOptions): SalesSummary {
  const opts = { ...DEFAULT_GROUPING, ...options };
  // Bucket rows by outlet in a single pass, over completed sales only.
  const byOutlet = new Map<string, Row[]>();

  for (const rec of filterCompletedSales(records)) {
    const { month, day } = parseDate(rec.trx_date);
    const row = normalizeRow({
      com_unit: (rec.com_unit ?? '').toString(),
      saleman_cd: (rec.saleman_cd ?? '').toString(),
      inv_desc: (rec.inv_desc ?? '').toString(),
      inv_category: (rec.inv_category ?? '').toString(),
      trx_no: (rec.trx_no ?? '').toString().trim(),
      inv_cd: (rec.inv_cd ?? '').toString().trim(),
      vendor_no: (rec.vendor_no ?? '').toString().trim(),
      trx_amt: toNumber(rec.trx_amt),
      trx_qty: toNumber(rec.trx_qty),
      cost_amt: toNumber(rec.cost_amt),
      month,
      day,
    }, opts);
    if (!row.com_unit) continue; // pandas groupby('com_unit') drops null outlet
    const bucket = byOutlet.get(row.com_unit);
    if (bucket) bucket.push(row);
    else byOutlet.set(row.com_unit, [row]);
  }

  const outlets: OutletSummary[] = [];

  for (const [outletCode, rows] of byOutlet) {
    const salesmen: Record<string, number> = {};
    const brands: Record<string, number> = {};
    // One sale spans several rows (one per item), so a transaction is a distinct
    // trx_no — counting rows would overstate the figure by roughly a third.
    const txnNumbers = new Set<string>();
    const brandUnits: Record<string, number> = {};
    const brandCost: Record<string, number> = {};
    const salesmenUnits: Record<string, number> = {};
    const salesmenCost: Record<string, number> = {};
    const vendors: Record<string, number> = {};
    const vendorUnits: Record<string, number> = {};
    const vendorCost: Record<string, number> = {};
    const brandModels: Record<string, Record<string, { units: number; revenue: number }>> = {};
    let totalRevenue = 0;
    let totalUnits = 0;
    let totalInvestment = 0;

    // Per-salesperson accumulators
    const profiles: Record<string, SalesmanProfile> = {};

    for (const r of rows) {
      totalRevenue += r.trx_amt;
      totalUnits += r.trx_qty;
      totalInvestment += r.cost_amt;   // already a line total; do NOT multiply by qty
      if (r.trx_no) txnNumbers.add(r.trx_no);
      addTo(salesmen, r.saleman_cd, r.trx_amt);
      addTo(brands, r.inv_desc, r.trx_amt);
      addTo(brandUnits, r.inv_desc, r.trx_qty);
      addTo(brandCost, r.inv_desc, r.cost_amt);
      addTo(salesmenUnits, r.saleman_cd, r.trx_qty);
      addTo(salesmenCost, r.saleman_cd, r.cost_amt);
      // Rows with no supplier code still belong somewhere on the board.
      const vendorKey = r.vendor_no || 'Unspecified';
      addTo(vendors, vendorKey, r.trx_amt);
      addTo(vendorUnits, vendorKey, r.trx_qty);
      addTo(vendorCost, vendorKey, r.cost_amt);
      // Skip placeholder stock codes (e.g. "**-AA") and blanks — they are not
      // real models, matching the old backend's brand_models() behaviour.
      if (r.inv_cd && !r.inv_cd.startsWith('**')) {
        const perBrand = (brandModels[r.inv_desc] ??= {});
        const m = (perBrand[r.inv_cd] ??= { units: 0, revenue: 0 });
        m.units += r.trx_qty;
        m.revenue += r.trx_amt;
      }

      let p = profiles[r.saleman_cd];
      if (!p) {
        p = {
          name: r.saleman_cd, totalRevenue: 0, totalUnits: 0,
          brands: {}, brandUnits: {}, monthlyData: {}, dailyRevenue: {},
        };
        profiles[r.saleman_cd] = p;
      }
      p.totalRevenue += r.trx_amt;
      p.totalUnits += r.trx_qty;
      addTo(p.brands, r.inv_desc, r.trx_amt);
      addTo(p.brandUnits, r.inv_desc, r.trx_qty);

      if (r.month) {
        let mo = p.monthlyData[r.month];
        if (!mo) { mo = { revenue: 0, units: 0, brands: {}, brandUnits: {} }; p.monthlyData[r.month] = mo; }
        mo.revenue += r.trx_amt;
        mo.units += r.trx_qty;
        addTo(mo.brands, r.inv_desc, r.trx_amt);
        addTo(mo.brandUnits, r.inv_desc, r.trx_qty);
      }
      if (r.day) addTo(p.dailyRevenue, r.day, r.trx_amt);
    }

    outlets.push({
      code: outletCode.trim(),
      name: `Branch ${outletCode}`,
      totalRevenue,
      totalUnits,
      totalInvestment,
      transactionCount: txnNumbers.size,
      salesmen,
      salesmenUnits,
      salesmenCost,
      brands,
      brandUnits,
      brandCost,
      vendors,
      vendorUnits,
      vendorCost,
      brandModels,
      salesmanProfiles: profiles,
    });
  }

  outlets.sort((a, b) => b.totalRevenue - a.totalRevenue);
  return { message: 'Data successfully processed', outlets };
}

// ---- Public entry points ----------------------------------------------------

/** Parse CSV text (already in memory) into a dashboard summary. */
export function parseCsvText(text: string, options?: GroupingOptions): SalesSummary {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // keep everything as strings; we coerce explicitly
  });
  return aggregate(result.data, options);
}

/**
 * Parse a user-picked File in the browser. Streams so a large POS export
 * (tens of thousands of rows) doesn't block the UI while parsing.
 */
export function parseCsvFile(file: File, options?: GroupingOptions): Promise<SalesSummary> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      worker: true,
      chunk: (results) => { for (const r of results.data) rows.push(r); },
      complete: () => resolve(aggregate(rows, options)),
      error: (err) => reject(err),
    });
  });
}

/** Quick header check so we can warn the user on a wrong file. */
export function missingColumns(headerRow: string[]): string[] {
  const present = new Set(headerRow.map((h) => h.trim()));
  return REQUIRED_COLUMNS.filter((c) => !present.has(c));
}
