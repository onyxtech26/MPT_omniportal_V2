/**
 * Year-on-year comparison for the Compare tab.
 *
 * Takes the cleaned rows of two years (from `normalizeRecords`) and lines them
 * up: the network, each outlet, and each outlet's brands and salespeople.
 * Every total comes from `aggregateRows`, the same code the Dashboard, Brands
 * and Leaderboards use, so Compare can never disagree with those screens.
 *
 * Comparing like with like: last year is cut to the same calendar window as
 * this year. If this year's data runs 1 Jan – 25 Jul, last year is compared
 * 1 Jan – 25 Jul too, not its whole twelve months.
 */
import { aggregateRows, applyFilters, type OutletSummary, type Row } from './salesData';

export interface Totals {
  revenue: number;
  units: number;
  cost: number;
  transactions: number;
}

/** Last year (`prev`) beside this year (`curr`); null where there were no sales. */
export interface Pair<T> {
  key: string;
  prev: T | null;
  curr: T | null;
}

export interface Window { from: string; to: string }

export interface YearComparison {
  prevWindow: Window;
  currWindow: Window;
  /** Whole network; always present, zero when a year had no sales in the window. */
  network: { prev: Totals; curr: Totals };
  outlets: Pair<Totals>[];
  /** Per outlet, for the breakdown tables. */
  outletSummaries: { prev: Map<string, OutletSummary>; curr: Map<string, OutletSummary> };
}

/** Sales lines only need revenue, units and cost; transactions are an outlet idea. */
export type LineTotals = Omit<Totals, 'transactions'>;

export const profit = (t: Pick<Totals, 'revenue' | 'cost'>) => t.revenue - t.cost;
export const marginPct = (t: Pick<Totals, 'revenue' | 'cost'>) => (t.revenue ? (profit(t) / t.revenue) * 100 : 0);
export const avgSale = (t: Totals) => (t.transactions ? t.revenue / t.transactions : 0);

/** The years the rows cover, e.g. ['2025', '2026']. */
export function yearsIn(rows: Row[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) if (r.day) seen.add(r.day.slice(0, 4));
  return [...seen].sort();
}

/** 'YYYY-MM-DD' moved to another year; 29 Feb becomes 28 Feb in a non-leap year. */
function inYear(date: string, year: string): string {
  const [, m, d] = date.split('-');
  if (m === '02' && d === '29') {
    const y = Number(year);
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return `${year}-02-${leap ? '29' : '28'}`;
  }
  return `${year}-${m}-${d}`;
}

/**
 * The window to compare. By default this year from 1 January to its last sale
 * date; a period chosen in the dashboard's period filter narrows it. Last year
 * gets the same dates one year earlier.
 */
export function compareWindows(
  currRows: Row[], currYear: string, prevYear: string,
  period?: { dateFrom?: string | null; dateTo?: string | null },
): { prev: Window; curr: Window } {
  let last = `${currYear}-01-01`;
  for (const r of currRows) if (r.day && r.day.startsWith(currYear) && r.day > last) last = r.day;

  let from = `${currYear}-01-01`;
  let to = last;
  // Only a period inside this year means anything here; elsewhere it is ignored.
  if (period?.dateFrom?.startsWith(currYear) && period.dateFrom > from) from = period.dateFrom;
  if (period?.dateTo?.startsWith(currYear) && period.dateTo < to) to = period.dateTo;

  return {
    curr: { from, to },
    prev: { from: inYear(from, prevYear), to: inYear(to, prevYear) },
  };
}

function outletTotals(o: OutletSummary): Totals {
  return { revenue: o.totalRevenue, units: o.totalUnits, cost: o.totalInvestment, transactions: o.transactionCount };
}

function sumTotals(list: Totals[]): Totals {
  return list.reduce(
    (a, t) => ({
      revenue: a.revenue + t.revenue, units: a.units + t.units,
      cost: a.cost + t.cost, transactions: a.transactions + t.transactions,
    }),
    { revenue: 0, units: 0, cost: 0, transactions: 0 },
  );
}

export function compareYears(
  prevRows: Row[], currRows: Row[], prevYear: string, currYear: string,
  period?: { dateFrom?: string | null; dateTo?: string | null },
): YearComparison {
  const windows = compareWindows(currRows, currYear, prevYear, period);
  const prevSum = aggregateRows(applyFilters(prevRows, { dateFrom: windows.prev.from, dateTo: windows.prev.to }));
  const currSum = aggregateRows(applyFilters(currRows, { dateFrom: windows.curr.from, dateTo: windows.curr.to }));

  const prev = new Map(prevSum.outlets.map((o) => [o.code, o]));
  const curr = new Map(currSum.outlets.map((o) => [o.code, o]));
  const codes = [...new Set([...prev.keys(), ...curr.keys()])];

  const outlets = codes.map((code): Pair<Totals> => ({
    key: code,
    prev: prev.has(code) ? outletTotals(prev.get(code)!) : null,
    curr: curr.has(code) ? outletTotals(curr.get(code)!) : null,
  }));

  return {
    prevWindow: windows.prev,
    currWindow: windows.curr,
    network: {
      prev: sumTotals([...prev.values()].map(outletTotals)),
      curr: sumTotals([...curr.values()].map(outletTotals)),
    },
    outlets,
    outletSummaries: { prev, curr },
  };
}

export type Breakdown = 'brand' | 'salesman';

/**
 * Brands or salespeople, last year beside this year, for one outlet or all.
 * Across all outlets a salesperson who worked at two outlets is one line.
 */
export function compareBreakdown(
  cmp: YearComparison, kind: Breakdown, outlet: string | 'ALL',
): Pair<LineTotals>[] {
  const collect = (map: Map<string, OutletSummary>) => {
    const out = new Map<string, LineTotals>();
    for (const o of map.values()) {
      if (outlet !== 'ALL' && o.code !== outlet) continue;
      const [rev, units, cost] = kind === 'brand'
        ? [o.brands, o.brandUnits, o.brandCost]
        : [o.salesmen, o.salesmenUnits, o.salesmenCost];
      for (const [k, v] of Object.entries(rev)) {
        const key = k || 'Unspecified';
        const t = out.get(key) ?? { revenue: 0, units: 0, cost: 0 };
        t.revenue += v;
        t.units += units[k] ?? 0;
        t.cost += cost[k] ?? 0;
        out.set(key, t);
      }
    }
    return out;
  };
  const prev = collect(cmp.outletSummaries.prev);
  const curr = collect(cmp.outletSummaries.curr);
  // A line that rounds to nothing in a year counts as "no sales" that year.
  const real = (t: LineTotals | undefined) => (t && (Math.abs(t.revenue) >= 0.005 || t.units !== 0) ? t : null);

  return [...new Set([...prev.keys(), ...curr.keys()])]
    .map((key) => ({ key, prev: real(prev.get(key)), curr: real(curr.get(key)) }))
    .filter((p) => p.prev || p.curr);
}

/** Change in revenue, RM; a missing year counts as zero. */
export const revenueChange = (p: Pair<{ revenue: number }>) => (p.curr?.revenue ?? 0) - (p.prev?.revenue ?? 0);

/** Percentage change, or null when last year had nothing to compare against. */
export function pctChange(prev: number | null | undefined, curr: number | null | undefined): number | null {
  if (!prev) return null;
  return (((curr ?? 0) - prev) / Math.abs(prev)) * 100;
}
