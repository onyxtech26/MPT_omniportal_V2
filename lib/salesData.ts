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

/**
 * What a row is, once normalised. `Watch` is anything sold as a product;
 * `Service` is the after-sales group; `Voucher` and `Deposit` are the two lines
 * that are not sales of goods at all. See `CATEGORY_LABELS` and
 * `SERVICE_CATEGORIES` — this is a read-out of decisions already made there, not
 * a second classification.
 */
export type RowCategory = 'Watch' | 'Service' | 'Voucher' | 'Deposit';

/** A single parsed transaction, with the fields the aggregation needs. */
export interface Row {
  com_unit: string;
  saleman_cd: string;
  cust_no: string;        // customer code; '0' means a walk-in
  inv_desc: string;
  inv_category: string;   // POS category code, e.g. PIN / BAT-CLK / SEI-WC
  trx_no: string;         // transaction number — several rows share one sale
  trx_type: string;       // PS / NI = sale, CN = credit note (return)
  inv_cd: string;         // model/stock code, e.g. TS-SRPK13K1-4R3
  vendor_no: string;      // supplier code, e.g. TS / WT / TMY
  trx_amt: number;        // sales value
  trx_qty: number;        // units
  cost_amt: number;
  category: RowCategory;  // set by normalizeRow, from the grouping already applied
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
  /** Only count rows on/after this date, 'YYYY-MM-DD'. */
  dateFrom?: string | null;
  /** Only count rows on/before this date, 'YYYY-MM-DD'. */
  dateTo?: string | null;
}

const DEFAULT_GROUPING: Required<GroupingOptions> = {
  mergeSW: true, groupService: true, dateFrom: null, dateTo: null,
};

/** The label all service-type items collapse to. */
export const SERVICE_LABEL = 'Service';

// Categories that are after-sales service, not a product/brand.
// This list is the company's own definition, taken from the Director's
// `sales-pulse` tool so both applications classify rows identically.
const SERVICE_CATEGORIES = new Set([
  'LS', 'S-BAT', 'SP', 'PS', 'R-BAT', 'SER',
  'BAT-CLK', 'PIN', 'FG', 'OTS', 'SSS',
]);

/**
 * Fixed labels for particular category codes. Product lines are otherwise named
 * by their description; this map overrides that in two situations.
 *
 * 1. Lines that are not sales of goods. Confirmed with the Director: `OH` is
 *    voucher, `OT` is deposit. Both are kept out of Service and given their own
 *    line — each is large enough to distort it (vouchers about −RM 114k a year,
 *    deposits up to +RM 167k).
 *
 * 2. Variants of one brand that management wants counted together. Seiko watches
 *    arrive under three codes (`SEI`, `SEI-5`, `SEI-SP5`) and several spellings
 *    ("SEIKO SPORT 5", "SEIKO SPORTS 5", "SEIKO-SPORTS 5"); all become one SEIKO
 *    line. Seiko **clocks** stay separate, as management asked — wall clocks and
 *    alarm clocks keep their own labels, which also folds away a typo in the data
 *    ("SEIKO ALRAM CLOCK").
 *
 * Keying on the category rather than the text makes this robust to those
 * spellings, and keeps stray descriptions off the screen — some rows carry staff
 * names (e.g. "EPJ045 <name>") or discount notes rather than a product.
 */
const CATEGORY_LABELS: Record<string, string> = {
  OH: 'Voucher',
  OT: 'Deposit',
  SEI: 'SEIKO',
  'SEI-5': 'SEIKO',
  'SEI-SP5': 'SEIKO',
  'SEI-AC': 'SEIKO ALARM CLOCK',
  'SEI-WC': 'SEIKO WALL CLOCK',
};

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

  // A return must reduce the totals. The POS is inconsistent about this: roughly
  // half of "-Return" rows carry POSITIVE amounts and quantities, which would
  // otherwise be added to revenue instead of deducted (~RM 100k on one year's
  // file). Force the sign, exactly as the Director's own tool does.
  const isReturn = /-return$/i.test(desc) || row.trx_type === RETURN_TYPE;
  if (isReturn) {
    row.trx_amt = -Math.abs(row.trx_amt);
    row.trx_qty = -Math.abs(row.trx_qty);
    row.cost_amt = -Math.abs(row.cost_amt);
  }

  desc = desc.replace(/-Return$/i, ''); // a return nets against the base product

  const category = row.inv_category.trim().toUpperCase();
  if (CATEGORY_LABELS[category]) {
    desc = CATEGORY_LABELS[category];          // Voucher / Deposit — their own lines
  } else if (opts.groupService && isServiceItem(row.inv_category)) {
    desc = SERVICE_LABEL;
  }
  row.inv_desc = desc;

  // The Watch/Service split the Director filters by. Read it back off the label
  // just assigned rather than re-testing the category codes: one classification,
  // one place to change it, and the two can never drift apart. Note `groupService`
  // is respected for free — with it off, service items stay individual products
  // and correctly read as Watch.
  row.category =
    desc === SERVICE_LABEL ? 'Service'
    : category === 'OH' ? 'Voucher'
    : category === 'OT' ? 'Deposit'
    : 'Watch';
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

/**
 * Clean the raw CSV records into rows, once.
 *
 * This is everything `aggregate()` used to do before the totals loop: keep only
 * completed sales, parse the date, apply the grouping rules. It is split out so
 * the rows can be *reused* — the Explorer slices the same rows by outlet,
 * salesperson, brand, model, vendor, customer and category without paying for
 * `filterCompletedSales()`'s two-pass return matching on every click.
 *
 * Deliberately does NOT apply the date window: dates are just one more filter,
 * handled by `applyFilters` alongside the rest.
 */
export function normalizeRecords(
  records: Record<string, string>[],
  options?: GroupingOptions,
): Row[] {
  const opts = { ...DEFAULT_GROUPING, ...options };
  const rows: Row[] = [];

  for (const rec of filterCompletedSales(records)) {
    const { month, day } = parseDate(rec.trx_date);
    const row = normalizeRow({
      com_unit: (rec.com_unit ?? '').toString(),
      saleman_cd: (rec.saleman_cd ?? '').toString(),
      cust_no: (rec.cust_no ?? '').toString().trim(),
      inv_desc: (rec.inv_desc ?? '').toString(),
      inv_category: (rec.inv_category ?? '').toString(),
      trx_no: (rec.trx_no ?? '').toString().trim(),
      trx_type: (rec.trx_type ?? '').toString().trim().toUpperCase(),
      inv_cd: (rec.inv_cd ?? '').toString().trim(),
      vendor_no: (rec.vendor_no ?? '').toString().trim(),
      trx_amt: toNumber(rec.trx_amt),
      trx_qty: toNumber(rec.trx_qty),
      cost_amt: toNumber(rec.cost_amt),
      category: 'Watch',   // replaced by normalizeRow
      month,
      day,
    }, opts);
    if (!row.com_unit) continue; // pandas groupby('com_unit') drops null outlet
    rows.push(row);
  }

  return rows;
}

/** Build the dashboard summary from rows already cleaned by `normalizeRecords`. */
export function aggregateRows(rows: Row[]): SalesSummary {
  // Bucket rows by outlet in a single pass.
  const byOutlet = new Map<string, Row[]>();
  for (const row of rows) {
    const bucket = byOutlet.get(row.com_unit);
    if (bucket) bucket.push(row);
    else byOutlet.set(row.com_unit, [row]);
  }

  const outlets: OutletSummary[] = [];

  for (const [outletCode, outletRows] of byOutlet) {
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

    for (const r of outletRows) {
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

// ---- Row-level filtering ----------------------------------------------------

/** The dimensions a row can be sliced by on the Explorer. */
export type Dimension =
  | 'outlet' | 'salesman' | 'brand' | 'model' | 'vendor' | 'customer' | 'category';

/** How each dimension reads its value off a row. One place, so nothing drifts. */
export const DIMENSION_VALUE: Record<Dimension, (r: Row) => string> = {
  outlet:   (r) => r.com_unit,
  salesman: (r) => r.saleman_cd,
  brand:    (r) => r.inv_desc,
  model:    (r) => r.inv_cd,
  vendor:   (r) => r.vendor_no || 'Unspecified',
  customer: (r) => r.cust_no,
  category: (r) => r.category,
};

export const DIMENSION_LABELS: Record<Dimension, string> = {
  outlet: 'Outlet', salesman: 'Salesperson', brand: 'Brand', model: 'Model',
  vendor: 'Vendor', customer: 'Customer', category: 'Sales category',
};

/** Selected values per dimension. An absent or empty list means "no constraint". */
export type Selection = Partial<Record<Dimension, string[]>>;

export interface RowFilters {
  /** 'YYYY-MM-DD'; null means no limit on that end. */
  dateFrom?: string | null;
  dateTo?: string | null;
  /**
   * Year ('2026') and month ('0'–'11', JS-style) chips. Multi-select, and NOT
   * expressible as a range — "January and March" is two windows, not one — so
   * they are matched per row rather than folded into dateFrom/dateTo.
   *
   * An explicit date range takes precedence and these are ignored while one is
   * set, matching the Director's tool (`sales-pulse` app.js:53). Doing it the
   * other way round silently intersects two date rules and produces empty
   * screens nobody can explain.
   */
  years?: string[];
  months?: string[];
  selected?: Selection;
}

/**
 * Narrow rows to the current selection.
 *
 * `skip` leaves one dimension unconstrained. That is what makes the chip lists
 * behave: when drawing the Brand chips we skip `brand`, so every brand the
 * *other* filters still allow stays visible and clickable — otherwise picking one
 * brand would hide all the others and you could never pick a second.
 */
export function applyFilters(rows: Row[], filters: RowFilters, skip?: Dimension): Row[] {
  const { dateFrom, dateTo, years, months, selected } = filters;
  // Pre-build the active constraints so the hot loop does Set lookups, not
  // array scans — this runs over tens of thousands of rows on every click.
  const active: [Dimension, Set<string>][] = [];
  for (const [dim, values] of Object.entries(selected ?? {}) as [Dimension, string[]][]) {
    if (dim === skip || !values?.length) continue;
    active.push([dim, new Set(values)]);
  }
  const hasWindow = Boolean(dateFrom || dateTo);
  // Year/month only apply when no explicit range is set — see RowFilters.
  const yearSet = !hasWindow && years?.length ? new Set(years) : null;
  const monthSet = !hasWindow && months?.length ? new Set(months) : null;
  const hasDateRule = hasWindow || yearSet || monthSet;

  return rows.filter((r) => {
    // Rows whose date could not be parsed are excluded once any date rule is
    // set, since there is no way to know whether they belong in it.
    if (hasDateRule && !r.day) return false;
    if (hasWindow) {
      // 'YYYY-MM-DD' sorts lexically, so string compare is safe.
      if (dateFrom && r.day! < dateFrom) return false;
      if (dateTo && r.day! > dateTo) return false;
    } else {
      // r.month is 'YYYY-MM'; month chips are JS 0-11 to match a Date's getMonth.
      if (yearSet && !yearSet.has(r.month!.slice(0, 4))) return false;
      if (monthSet && !monthSet.has(String(Number(r.month!.slice(5, 7)) - 1))) return false;
    }
    for (const [dim, set] of active) {
      if (!set.has(DIMENSION_VALUE[dim](r))) return false;
    }
    return true;
  });
}

/** Distinct years present in the rows, newest first. Feeds the year chips. */
export function listYears(rows: Row[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) if (r.month) seen.add(r.month.slice(0, 4));
  return [...seen].sort().reverse();
}

/**
 * The values still worth offering in each chip group, given everything else that
 * is selected. Sorted, distinct, blanks dropped.
 *
 * Seven passes over the rows — one per dimension, each skipping itself. On a
 * 46k-row export that is a few milliseconds, and it is what stops the UI offering
 * a salesperson who sold nothing of the brand you just picked.
 */
export function facetValues(rows: Row[], filters: RowFilters): Record<Dimension, string[]> {
  const out = {} as Record<Dimension, string[]>;
  for (const dim of Object.keys(DIMENSION_VALUE) as Dimension[]) {
    const seen = new Set<string>();
    for (const r of applyFilters(rows, filters, dim)) {
      const v = DIMENSION_VALUE[dim](r).trim();
      if (v) seen.add(v);
    }
    out[dim] = [...seen].sort();
  }
  return out;
}

/** Customer `0` is a walk-in, not a customer number. Display-only. */
export function customerLabel(code: string): string {
  return code === '0' || code === '000' ? 'Walk-in' : code;
}

// ---- Public entry points ----------------------------------------------------

/**
 * Build the dashboard summary from raw parsed CSV records.
 *
 * Kept as the one-call entry point the three dashboard pages already use. It is
 * now just `normalizeRecords` → `applyFilters` (date window only) → `aggregateRows`,
 * which is exactly what it did inline before the split.
 */
export function aggregate(records: Record<string, string>[], options?: GroupingOptions): SalesSummary {
  const opts = { ...DEFAULT_GROUPING, ...options };
  const rows = normalizeRecords(records, opts);
  return aggregateRows(applyFilters(rows, { dateFrom: opts.dateFrom, dateTo: opts.dateTo }));
}

/**
 * Parse CSV text into raw records, without aggregating.
 *
 * The app keeps these so it can re-aggregate cheaply when the user changes the
 * date range, instead of re-reading and re-parsing the whole file each time.
 */
export function parseCsvRecords(text: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // keep everything as strings; we coerce explicitly
  }).data;
}

/** Parse CSV text (already in memory) into a dashboard summary. */
export function parseCsvText(text: string, options?: GroupingOptions): SalesSummary {
  return aggregate(parseCsvRecords(text), options);
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

/**
 * The months present in a report, as 'YYYY-MM', oldest first. Used to offer
 * month shortcuts in the period picker rather than guessing a calendar.
 */
export function listMonths(records: Record<string, string>[]): string[] {
  const seen = new Set<string>();
  for (const r of records) {
    const { month } = parseDate(r.trx_date);
    if (month) seen.add(month);
  }
  return [...seen].sort();
}

/** Quick header check so we can warn the user on a wrong file. */
export function missingColumns(headerRow: string[]): string[] {
  const present = new Set(headerRow.map((h) => h.trim()));
  return REQUIRED_COLUMNS.filter((c) => !present.has(c));
}
