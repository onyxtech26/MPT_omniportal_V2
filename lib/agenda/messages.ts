/**
 * The WhatsApp-style outlet performance message the manager sends the
 * Director each month — a port of backend/agenda/message_gen.py.
 *
 * Format: header -> total sales comparison -> product breakdown -> profit.
 * The only deliberate difference from the Python: the years are read from the
 * uploaded reports instead of being fixed at 2025/2026, so the message stays
 * right after the year rolls over.
 */
import { branchFigures, productBreakdown, type CategoryFigures, type PosReport } from './engine';
import { pyComma, pyFixed, pyRound } from './pynum';

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

// Display names for inv_category codes, verbatim from the POS "Sales Profit
// Report - By Product Group (Detail)" printout. Check a new code against that
// report rather than guessing.
export const CATEGORY_NAMES: Record<string, string> = {
  AB: 'Alba',
  AD: 'Alain Delon',
  AE: 'Alexandre Christie',
  'BAT-CLK': 'Battery (Clock)',
  BGT: 'Bigotti',
  BN: 'Bonia',
  BUM: 'Bum',
  'BUM-EQ': 'Bum Equipment',
  CA: 'Cluse Accessories',
  CAS: 'Casio',
  'CAS-BG': 'Baby G',
  'CAS-CTE': 'Edifice',
  'CAS-GS': 'G-Shock',
  CAES: 'Caesar',
  CK: 'Calvin Klein',
  CLJ: 'Charles Jourdan',
  CM: 'Camel',
  'CR-AC': 'Crocodile Alarm Clock',
  'CR-WC': 'Crocodile Wall Clock',
  CT: 'Chronotech',
  CTL: 'Citole',
  DGT: 'Digitec Watch',
  DIS: 'Disney',
  DK: 'Daniel Klein',
  DW: 'Daniel Wellington',
  ECOD: 'Eco Drive',
  FG: 'Free Gift',
  FOS: 'Fossil',
  GAR: 'Garmin',
  GUE: 'Guess',
  HAM: 'Hamilton',
  HKW: 'HK Watch',
  JBV: 'J. Bovier',
  JTW: 'JT Warriors',
  LM: 'Luminox',
  LONG: 'Longines',
  LS: 'Leather Strap',
  MF: 'Mini Focus',
  MH: 'Michel Herbelin',
  MID: 'Mido',
  MK: 'Michael Kors',
  NAV: 'Naviforce',
  OH: 'Deposit/EP',
  'OH-AC': 'Other Alarm Clock',
  'OH-W': 'Other Watch',
  'OH-WC': 'Other Wall Clock',
  OT: 'Repair Deposit',
  PIN: 'Pin',
  PS: 'PVC Strap',
  'Q&Q': 'Q&Q Watch',
  'R-BAT': 'Renata Battery',
  RAD: 'Rado',
  RE: 'R&E',
  REE: 'Reebok',
  RW: 'Rewards Watch',
  'S-BAT': 'Sony Battery',
  SBP: 'S.B. Polo',
  SEI: 'Seiko',
  'SEI-5': 'Seiko 5',
  'SEI-AC': 'Seiko Alarm Clock',
  'SEI-SP5': 'Seiko Sports 5',
  'SEI-WC': 'Seiko Wall Clock',
  SER: 'Service',
  SKC: 'Skechers',
  SLO: 'Slo/Pokemon',
  'SLO-AC': 'Slo Alarm Clock',
  SP: 'Spare Parts',
  SSS: 'Stainless Strap',
  SUB: 'Submarine',
  TBL: 'Timberland',
  TF: 'Trofish',
  TIS: 'Tissot',
  'TSO-WC': 'Telesonic Wall Clock',
  VSA: 'Victorinox Swiss Army',
  WMB: 'Tokei Mystery Box',
};

// Categories merged into one display line. Watches only: SEI-WC (Seiko Wall
// Clock) reports on its own, at the manager's request — folded in, four wall
// clocks once hid that an outlet had sold no Seiko watches at all.
export const CATEGORY_GROUPS: Record<string, string[]> = {
  Seiko: ['SEI', 'SEI-5', 'SEI-SP5'],
  '🔋 Sony + Renata battery': ['S-BAT', 'R-BAT'],
};

// Lines the manager hand-totals every month: always shown, however small the
// movement.
const ALWAYS_SHOW = new Set(['🔋 Sony + Renata battery']);

// Operational / non-product categories left out of the breakdown.
const SKIP_CATEGORIES = new Set(['SER', 'FG', 'SP']);

// Deposit accounts, reported as labelled summary lines (no qty) when they move
// by at least the threshold. They sit inside the outlet's sales total, so a
// large swing has to be shown or the "Mainly due to" list cannot add up.
const DEPOSIT_LINES: [string, string[]][] = [
  ['Deposit collection', ['OH']],
  ['Repair/reservation deposits', ['OT']],
];
const DEPOSIT_CATEGORIES = new Set(DEPOSIT_LINES.flatMap(([, cats]) => cats));

/** Format a RM amount as e.g. '29k' or '29.3k'. */
function fmtK(amount: number): string {
  const k = Math.abs(amount) / 1000;
  return k === Math.trunc(k) ? `${pyFixed(k, 0)}k` : `${pyFixed(k, 1)}k`;
}

interface Totals { sales: number; qty: number }

/** Collapse categories into their display groups, keyed by display name. */
function mergeGroups(raw: Map<string, Totals>): Map<string, Totals> {
  const merged = new Map<string, Totals>();
  for (const [group, members] of Object.entries(CATEGORY_GROUPS)) {
    const present = members.filter((c) => raw.has(c));
    if (!present.length) continue;
    merged.set(group, {
      sales: present.reduce((s, c) => s + raw.get(c)!.sales, 0),
      qty: present.reduce((s, c) => s + raw.get(c)!.qty, 0),
    });
  }
  const grouped = new Set(Object.values(CATEGORY_GROUPS).flat());
  for (const [cat, data] of raw) {
    if (grouped.has(cat) || SKIP_CATEGORIES.has(cat)) continue;
    const name = CATEGORY_NAMES[cat] ?? cat;
    const entry = merged.get(name) ?? { sales: 0, qty: 0 };
    entry.sales += data.sales;
    entry.qty += data.qty;
    merged.set(name, entry);
  }
  return merged;
}

interface Line {
  name: string;
  sales25: number; qty25: number;
  sales26: number; qty26: number;
  variance: number;
}

function buildCombined(bd25: Map<string, CategoryFigures>, bd26: Map<string, CategoryFigures>): Line[] {
  const cats = new Set([...bd25.keys(), ...bd26.keys()]);
  const all = [...cats].filter((c) => !SKIP_CATEGORIES.has(c) && !DEPOSIT_CATEGORIES.has(c));
  const side = (bd: Map<string, CategoryFigures>) =>
    mergeGroups(new Map(all.map((c) => [c, { sales: bd.get(c)?.sales ?? 0, qty: bd.get(c)?.qty ?? 0 }])));
  const m25 = side(bd25);
  const m26 = side(bd26);
  const names = new Set([...m25.keys(), ...m26.keys()]);
  const result: Line[] = [...names].map((name) => {
    const s25 = m25.get(name)?.sales ?? 0;
    const q25 = m25.get(name)?.qty ?? 0;
    const s26 = m26.get(name)?.sales ?? 0;
    const q26 = m26.get(name)?.qty ?? 0;
    return {
      name,
      sales25: s25, qty25: pyRound(q25),
      sales26: s26, qty26: pyRound(q26),
      variance: pyRound(s26 - s25, 2),
    };
  });
  // Biggest drop first, biggest gain last. Equal movements are ordered by
  // name so the message is the same every time it is generated.
  result.sort((a, b) => a.variance - b.variance || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return result;
}

export interface MessageOptions {
  /** Calendar year of the earlier report, e.g. 2025. */
  prevYear: number;
  /** Calendar year of the later report, e.g. 2026. */
  currYear: number;
  /** Hide product lines that moved by less than this many RM. */
  minVarianceRm?: number;
}

/** The formatted WhatsApp message for one outlet and month. */
export function generateMessage(
  branch: string,
  month: number,
  prev: PosReport,
  curr: PosReport | null,
  { prevYear, currYear, minVarianceRm = 500 }: MessageOptions,
): string {
  const monthName = MONTH_NAMES[month - 1];
  const months = [month];
  const m25 = branchFigures(prev, branch, months);
  const sales25 = m25.sales;

  if (!curr) {
    return [
      `Outlets: ${branch} ${monthName}`,
      `${prevYear} Summary (${currYear} data awaiting)`,
      '',
      `${prevYear} Sales`,
      `RM${pyComma(sales25, 2)}`,
      '',
      `Profit ${pyFixed(m25.margin * 100, 2)}%`,
    ].join('\n');
  }

  const m26 = branchFigures(curr, branch, months);
  const sales26 = m26.sales;
  const varSales = pyRound(sales26 - sales25, 2);
  const direction = varSales < 0 ? 'Decreased 📉' : 'Increased 📈';
  const varStr = varSales < 0 ? `(RM${pyComma(Math.abs(varSales), 0)})` : `+RM${pyComma(varSales, 0)}`;

  const lines: string[] = [
    `Outlets: ${branch} ${monthName}`,
    `${prevYear} 🆚 ${currYear}`,
    '',
    `${prevYear} Sales`,
    `RM${pyComma(sales25, 2)}`,
    '🆚',
    `${currYear} Sales RM${pyComma(sales26, 2)}`,
    `${direction} by ${varStr}`,
    '',
    'Mainly due to:',
    '',
  ];

  const bd25 = productBreakdown(prev, branch, months);
  const bd26 = productBreakdown(curr, branch, months);

  for (const [label, cats] of DEPOSIT_LINES) {
    const dep25 = cats.reduce((s, c) => s + (bd25.get(c)?.sales ?? 0), 0);
    const dep26 = cats.reduce((s, c) => s + (bd26.get(c)?.sales ?? 0), 0);
    const depVar = pyRound(dep26 - dep25, 2);
    if (Math.abs(depVar) < minVarianceRm) continue;
    const dir = depVar >= 0 ? 'increased' : 'decreased';
    const sign = depVar >= 0 ? '+' : '-';
    lines.push(`${label} ${dir} by ${sign}RM${pyComma(Math.abs(depVar), 2)}`);
    lines.push('');
  }

  for (const item of buildCombined(bd25, bd26)) {
    const { name, variance: v, sales26: s26, sales25: s25, qty26: q26, qty25: q25 } = item;
    // Nothing traded in either year.
    if (s25 === 0 && s26 === 0) continue;
    // Tiny movement between two present years.
    if (!ALWAYS_SHOW.has(name) && Math.abs(v) < minVarianceRm && s25 !== 0 && s26 !== 0) continue;
    // A negative quantity or revenue is a POS adjustment, not performance.
    if (q25 < 0 || q26 < 0 || s25 < 0 || s26 < 0) continue;

    if (s25 === 0 && s26 > 0) {
      lines.push(`${name} achieved RM${pyComma(s26, 2)} = ${q26}pcs`);
      lines.push('');
    } else if (s25 !== 0 && s26 === 0) {
      lines.push(`${name} dropped out 📉 (${prevYear}: ${fmtK(s25)} = ${q25}pcs)`);
      lines.push('');
    } else {
      const emoji = v < 0 ? '📉' : '📈';
      const word = v < 0 ? 'dropped' : 'increased';
      const sign = v < 0 ? '' : '+';
      lines.push(`${name} ${word} ${emoji} by ${sign}RM${pyComma(Math.abs(v), 0)} / ${q26}pcs`);
      lines.push(`${fmtK(s26)} ${currYear} sales = ${q26}pcs`);
      lines.push(`${fmtK(s25)} ${prevYear} sales = ${q25}pcs`);
      lines.push('');
    }
  }

  const mDiff = pyRound((m26.margin - m25.margin) * 100, 2);
  const mDir = mDiff >= 0 ? 'increased' : 'decreased';
  const sign = mDiff >= 0 ? '+' : '';
  lines.push(`Profit ${pyFixed(m26.margin * 100, 2)}%`);
  lines.push(`Compared to last year, ${mDir} by ${sign}${pyFixed(mDiff, 2)}%`);
  return lines.join('\n');
}
