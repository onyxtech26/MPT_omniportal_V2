import { supabase } from './supabase';

// The Daily Report module (see supabase/migrations/daily_report.sql).
//
// Like lib/repairs.ts, nothing here filters by branch on the client: every read
// is a plain select and the results differ by role only because Postgres RLS
// already trimmed them before they reached the browser. Staff get their own
// branch, management gets all of them.
//
// NOTE: this stores daily sales on the server, on purpose. The Director's CSV
// analytics under /dashboard remain browser-only and must never import this file.

export type ReportBranch = { code: string; name: string | null };

export type ReportBrand = {
  id: string;
  branch_code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type BrandFigure = { brand_id: string; sale_date: string; sales_amount: number; quantity: number };
export type SalesmanFigure = { staff_id: string; sale_date: string; sales_amount: number };

// Today's date in Malaysia, as YYYY-MM-DD. The database refuses future dates in
// the same timezone, so the date picker must agree with it — using the browser's
// own timezone would let someone abroad (or a wrong device clock) pick a date
// the database then rejects.
export function todayMY(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

// Last calendar day of a YYYY-MM month, as YYYY-MM-DD.
function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

export const rm = (n: number) =>
  n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// numeric columns come back from PostgREST as numbers, but be defensive: a
// figure is never allowed to become NaN on screen.
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function listReportBranches(): Promise<ReportBranch[]> {
  const { data, error } = await supabase
    .from('branches').select('code, name').eq('is_active', true).order('code');
  if (error) throw error;
  return data as ReportBranch[];
}

export async function listBrands(branch: string): Promise<ReportBrand[]> {
  const { data, error } = await supabase
    .from('report_brands').select('*').eq('branch_code', branch)
    .order('sort_order').order('name');
  if (error) throw error;
  return data as ReportBrand[];
}

export async function addBrand(branch: string, name: string, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from('report_brands').insert({ branch_code: branch, name: name.trim(), sort_order: sortOrder });
  if (error) {
    // 23505 = unique violation: the case-insensitive per-branch name index.
    if (error.code === '23505') throw new Error(`"${name.trim()}" is already on this branch's list.`);
    throw error;
  }
}

export async function renameBrand(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('report_brands').update({ name: name.trim() }).eq('id', id);
  if (error) {
    if (error.code === '23505') throw new Error(`"${name.trim()}" is already on this branch's list.`);
    throw error;
  }
}

export async function setBrandActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('report_brands').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

// Deletes a brand. The database only allows this for a brand with NO sales
// recorded: daily_sales points at it through a foreign key with no cascade, so a
// brand that has been used is refused (Postgres error 23503) and its history is
// never touched. That case comes back as 'in_use' so the screen can offer
// Deactivate instead of showing a raw database error.
export async function deleteBrand(id: string): Promise<'deleted' | 'in_use'> {
  const { error } = await supabase.from('report_brands').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') return 'in_use';
    throw error;
  }
  return 'deleted';
}

// Saves a new order for a branch's brand list. `orderedIds` is the WHOLE list in
// the wanted order; the database numbers them 1..N in one atomic statement. The
// brand picker, the entry list, the monthly view and the WhatsApp summary all
// read `sort_order`, so they all follow this order.
export async function reorderBrands(branch: string, orderedIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_report_brands', { p_branch: branch, p_ids: orderedIds });
  if (error) throw error;
}

export async function listBrandFigures(branch: string, month: string): Promise<BrandFigure[]> {
  const { data, error } = await supabase
    .from('daily_sales').select('brand_id, sale_date, sales_amount, quantity')
    .eq('branch_code', branch).gte('sale_date', `${month}-01`).lte('sale_date', monthEnd(month));
  if (error) throw error;
  return (data ?? []).map((r) => ({
    brand_id: r.brand_id, sale_date: r.sale_date,
    sales_amount: num(r.sales_amount), quantity: num(r.quantity),
  }));
}

export async function listSalesmanFigures(branch: string, month: string): Promise<SalesmanFigure[]> {
  const { data, error } = await supabase
    .from('daily_salesman_sales').select('staff_id, sale_date, sales_amount')
    .eq('branch_code', branch).gte('sale_date', `${month}-01`).lte('sale_date', monthEnd(month));
  if (error) throw error;
  return (data ?? []).map((r) => ({
    staff_id: r.staff_id, sale_date: r.sale_date, sales_amount: num(r.sales_amount),
  }));
}

// Every salesman for a branch, including deactivated ones — a leaver's name
// must still resolve on past days (same rule as repairs: soft-disable only).
export async function listAllSalesmen(branch: string) {
  const { data, error } = await supabase
    .from('staff_members').select('id, full_name, is_active')
    .eq('branch_code', branch).order('full_name');
  if (error) throw error;
  return data as { id: string; full_name: string; is_active: boolean }[];
}

export async function addSalesman(branch: string, fullName: string): Promise<void> {
  const { error } = await supabase
    .from('staff_members').insert({ branch_code: branch, full_name: fullName.trim() });
  if (error) throw error;
}

export async function setSalesmanActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('staff_members').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

// One atomic save for the whole day (brand figures + salesman figures) via the
// save_daily_report Postgres function, so a dropped connection can never save
// one half without the other. Only rows the caller sends are written; a figure
// is corrected by saving a new value, never deleted.
export async function saveDailyReport(
  branch: string, date: string,
  brands: { brand_id: string; sales_amount: number; quantity: number }[],
  salesmen: { staff_id: string; sales_amount: number }[],
): Promise<void> {
  const { error } = await supabase.rpc('save_daily_report', {
    p_branch: branch, p_date: date, p_brands: brands, p_salesmen: salesmen,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// The WhatsApp summary — same shape the branches already send today
// (carried over from the sales-keeper app), built from saved figures.

export function buildWhatsappSummary(args: {
  branchCode: string;
  date: string;
  brands: ReportBrand[];
  brandFigures: BrandFigure[];       // the whole month, up to and including `date`
  salesmen: { id: string; full_name: string }[];
  salesmanFigures: SalesmanFigure[]; // the whole month
}): string {
  const { branchCode, date, brands, brandFigures, salesmen, salesmanFigures } = args;
  const [y, m, d] = date.split('-').map(Number);
  const dateLabel = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  const monthLabel = new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const whole = (n: number) => Math.round(n).toLocaleString('en-MY');

  let dayTotal = 0;
  let monthTotal = 0;
  const lines: string[] = [];
  for (const b of brands) {
    const mine = brandFigures.filter((f) => f.brand_id === b.id && f.sale_date <= date);
    const day = mine.find((f) => f.sale_date === date);
    const dRM = day?.sales_amount ?? 0;
    const dQty = day?.quantity ?? 0;
    const mRM = mine.reduce((s, f) => s + f.sales_amount, 0);
    const mQty = mine.reduce((s, f) => s + f.quantity, 0);
    dayTotal += dRM;
    monthTotal += mRM;
    lines.push(`${b.name} =${whole(dRM)}/${whole(mRM)}⌚${whole(dQty)}/${whole(mQty)}`);
  }

  const salesmanLines = salesmen
    .map((s) => {
      const mine = salesmanFigures.filter((f) => f.staff_id === s.id && f.sale_date <= date);
      const dRM = mine.find((f) => f.sale_date === date)?.sales_amount ?? 0;
      const mRM = mine.reduce((sum, f) => sum + f.sales_amount, 0);
      return dRM > 0 || mRM > 0 ? `${s.full_name} =${whole(dRM)}/${whole(mRM)}` : null;
    })
    .filter((l): l is string => l !== null);

  return [
    `${dateLabel}(${branchCode})`,
    `*Sale RM ${whole(dayTotal)}`,
    ...lines,
    ...(salesmanLines.length ? ['', 'Salesmen', ...salesmanLines] : []),
    `\nTotal 1-${d} ${monthLabel}`,
    `*RM ${whole(monthTotal)}`,
  ].join('\n');
}
