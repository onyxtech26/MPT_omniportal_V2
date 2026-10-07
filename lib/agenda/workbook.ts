/**
 * Fill the manager's Meeting Agenda workbook in the browser — a port of
 * backend/agenda/agenda_writer.py.
 *
 * The template (public/agenda/Meeting_Agenda.xlsx) is edited in place at the
 * XML level, so every border, font, number format and merged cell the manager
 * is used to survives untouched; only the figure cells change.
 *
 * Every figure is written as a literal value, including the four variance
 * columns the template ships as formulas (=D6-C6, =E6/C6, =I6-H6, =J6/H6). A
 * formula with no cached result renders blank in WPS, Excel Online, Sheets,
 * phone previews and PDF exports, and this sheet gets forwarded and printed.
 */
import JSZip from 'jszip';
import { branchFigures, TARGET_BRANCHES, type PosReport, type ReportTotals } from './engine';
import { pyFixed, pyRound } from './pynum';

const RED = 'FFFF0000';
const BLUE = 'FF0070C0';
const AWAITING = 'awaiting data input';

// Six outlet slots, two rows each: the sales row (6, 8 … 16) and the Profit
// row beneath it. Rows 18+ hold unrelated content, so six is a hard limit.
export const NUM_SLOTS = 6;
const salesRow = (slot: number) => 6 + 2 * slot;

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];
const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// FY-current cells cleared when there is no current-year report, as
// (column, row offset from the outlet's sales row).
const CURRENT_YEAR_CELLS: [string, number][] = [
  ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['G', 1], ['E', 1],
  ['I', 0], ['I', 1], ['J', 0], ['K', 0], ['L', 1], ['J', 1],
];

type CellValue = number | string | null;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Minimal editor for one worksheet's XML plus the workbook's styles. */
class SheetEditor {
  private fontList: string[];
  private xfList: string[];
  private colourCache = new Map<string, number>();

  constructor(public sheet: string, public styles: string) {
    this.fontList = SheetEditor.items(styles, 'fonts', 'font');
    this.xfList = SheetEditor.items(styles, 'cellXfs', 'xf');
  }

  private static items(xml: string, list: string, tag: string): string[] {
    const block = new RegExp(`<${list}\\b[^>]*>([\\s\\S]*?)</${list}>`).exec(xml);
    if (!block) return [];
    return block[1].match(new RegExp(`<${tag}\\b[^>]*?(?:/>|>[\\s\\S]*?</${tag}>)`, 'g')) ?? [];
  }

  private cellRegex(ref: string): RegExp {
    return new RegExp(`<c r="${ref}"(?=[\\s/>])([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
  }

  private styleOf(ref: string): number | null {
    const m = this.cellRegex(ref).exec(this.sheet);
    const s = m && /\bs="(\d+)"/.exec(m[1]);
    return s ? Number(s[1]) : null;
  }

  /** Write a value (or clear it with null), keeping the cell's style. */
  set(ref: string, value: CellValue, styleOverride?: number): void {
    const style = styleOverride ?? this.styleOf(ref);
    const sAttr = style !== null ? ` s="${style}"` : '';
    let xml: string;
    if (value === null) xml = `<c r="${ref}"${sAttr}/>`;
    else if (typeof value === 'number') xml = `<c r="${ref}"${sAttr}><v>${Object.is(value, -0) ? 0 : value}</v></c>`;
    else xml = `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;

    const re = this.cellRegex(ref);
    if (re.test(this.sheet)) {
      this.sheet = this.sheet.replace(re, () => xml);
      return;
    }
    this.insert(ref, xml);
  }

  private insert(ref: string, xml: string): void {
    const [, col, rowStr] = /^([A-Z]+)(\d+)$/.exec(ref)!;
    const rowNum = Number(rowStr);
    const rowRe = new RegExp(`<row r="${rowNum}"([^>]*?)(?:/>|>([\\s\\S]*?)</row>)`);
    const row = rowRe.exec(this.sheet);
    if (!row) throw new Error(`Template has no row ${rowNum}`);
    const cells = row[2] ?? '';
    const parts: string[] = cells.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? [];
    const target = colNumber(col);
    const idx = parts.findIndex((p) => colNumber(/r="([A-Z]+)/.exec(p)![1]) > target);
    if (idx === -1) parts.push(xml);
    else parts.splice(idx, 0, xml);
    const rebuilt = `<row r="${rowNum}"${row[1]}>${parts.join('')}</row>`;
    this.sheet = this.sheet.replace(rowRe, () => rebuilt);
  }

  /**
   * Colour a variance cell by sign: negative red, otherwise blue, bold. The
   * cell's own font is copied and only weight and colour change — replacing
   * the font outright drops the template's Calibri 10 and the four variance
   * cells come out visibly larger than the figures beside them.
   */
  colour(ref: string, value: number | null): void {
    if (value === null) return;
    const rgb = value < 0 ? RED : BLUE;
    const xfIndex = this.styleOf(ref) ?? 0;
    const key = `${xfIndex}:${rgb}`;
    let newXf = this.colourCache.get(key);
    if (newXf === undefined) {
      const xf = this.xfList[xfIndex];
      const fontId = Number(/fontId="(\d+)"/.exec(xf)?.[1] ?? 0);
      let font = this.fontList[fontId] ?? '<font/>';
      if (font.endsWith('/>')) font = font.replace(/\/>$/, '></font>');
      font = font
        .replace(/<b\b[^>]*\/>/g, '')
        .replace(/<color\b[^>]*\/>/g, '')
        .replace(/^<font\b([^>]*)>/, '<font$1><b/>');
      // CT_Font order: b … sz, color, name … — colour goes after the size.
      font = /<sz\b[^>]*\/>/.test(font)
        ? font.replace(/(<sz\b[^>]*\/>)/, `$1<color rgb="${rgb}"/>`)
        : font.replace('<b/>', `<b/><color rgb="${rgb}"/>`);
      this.fontList.push(font);
      const newFontId = this.fontList.length - 1;
      let clone = xf.replace(/fontId="\d+"/, `fontId="${newFontId}"`);
      if (!/applyFont=/.test(clone)) clone = clone.replace(/^<xf\b/, '<xf applyFont="1"');
      else clone = clone.replace(/applyFont="\d"/, 'applyFont="1"');
      this.xfList.push(clone);
      newXf = this.xfList.length - 1;
      this.colourCache.set(key, newXf);
    }
    const m = this.cellRegex(ref).exec(this.sheet);
    if (!m) return;
    const updated = /\bs="\d+"/.test(m[0]) ? m[0].replace(/\bs="\d+"/, `s="${newXf}"`) : m[0].replace(`<c r="${ref}"`, `<c r="${ref}" s="${newXf}"`);
    this.sheet = this.sheet.replace(m[0], () => updated);
  }

  finishStyles(): string {
    const swap = (xml: string, list: string, items: string[]) =>
      xml.replace(
        new RegExp(`<${list}\\b([^>]*)>[\\s\\S]*?</${list}>`),
        (_all, attrs: string) => `<${list}${attrs.replace(/count="\d+"/, `count="${items.length}"`)}>${items.join('')}</${list}>`,
      );
    return swap(swap(this.styles, 'fonts', this.fontList), 'cellXfs', this.xfList);
  }
}

export interface AgendaWorkbookInput {
  template: ArrayBuffer | Uint8Array;
  month: number;
  prev: PosReport;
  curr: PosReport | null;
  /** Source of the earlier year's Jan->month figures; defaults to `prev`. Null = none. */
  prevAccReport?: PosReport | null;
  /** Totals from a printed report workbook; win over prevAccReport. */
  prevAccTotals?: Map<string, ReportTotals> | null;
  /** Outlets for the six slots, in order. Only the first six are used. */
  branches?: string[];
  prevYear: number;
  currYear: number;
}

const accMarginLabel = (branch: string, margin: number) => `${branch}        ${pyFixed(margin * 100, 2)}%`;

function writeBranch(ed: SheetEditor, branch: string, slot: number, inp: AgendaWorkbookInput, accReport: PosReport | null) {
  const srow = salesRow(slot);
  const prow = srow + 1;
  const months = Array.from({ length: inp.month }, (_, i) => i + 1);

  ed.set(`B${srow}`, branch);
  ed.set(`B${prow}`, 'Profit');

  const monthly = branchFigures(inp.prev, branch, [inp.month]);
  ed.set(`C${srow}`, monthly.sales);
  ed.set(`C${prow}`, monthly.margin);
  ed.set(`G${srow}`, monthly.profit);

  // Earlier year's Jan->month: the printed report's totals win over the CSV.
  let accSales: number | null = null;
  let accProfit: number | null = null;
  let accMargin: number | null = null;
  const totals = inp.prevAccTotals?.get(branch);
  if (inp.prevAccTotals && totals) {
    ({ sales: accSales, profit: accProfit, margin: accMargin } = totals);
  } else if (accReport) {
    const acc = branchFigures(accReport, branch, months);
    ({ sales: accSales, profit: accProfit, margin: accMargin } = acc);
  }
  if (accSales !== null) {
    ed.set(`H${srow}`, accSales);
    ed.set(`H${prow}`, accMarginLabel(branch, accMargin!));
    ed.set(`L${srow}`, accProfit);
  } else {
    ed.set(`H${srow}`, null);
    ed.set(`H${prow}`, null);
    ed.set(`L${srow}`, null);
  }

  if (!inp.curr) {
    for (const [col, off] of CURRENT_YEAR_CELLS) ed.set(`${col}${srow + off}`, null);
    return;
  }

  const m26 = branchFigures(inp.curr, branch, [inp.month]);
  const a26 = branchFigures(inp.curr, branch, months);
  ed.set(`D${srow}`, m26.sales);
  ed.set(`D${prow}`, m26.margin);
  ed.set(`G${prow}`, m26.profit);

  // An outlet that did not trade in the earlier year has no baseline: every
  // comparison cell is blanked rather than dividing by zero, while its own
  // current figures still print.
  const hasMonthBase = Boolean(monthly.sales);
  const hasAccBase = Boolean(accSales);

  const eVal = hasMonthBase ? pyRound(m26.margin - monthly.margin, 4) : null;
  ed.set(`E${prow}`, eVal);
  ed.colour(`E${prow}`, eVal);

  ed.set(`I${srow}`, a26.sales);
  ed.set(`I${prow}`, a26.margin);
  ed.set(`L${prow}`, a26.profit);

  const jVal = accMargin !== null && hasAccBase ? pyRound(a26.margin - accMargin, 4) : null;
  ed.set(`J${prow}`, jVal);
  ed.colour(`J${prow}`, jVal);

  const eAmt = pyRound(m26.sales - monthly.sales, 2);
  ed.set(`E${srow}`, eAmt);
  if (hasMonthBase) {
    const fPct = pyRound(eAmt / monthly.sales, 4);
    ed.set(`F${srow}`, fPct);
    ed.colour(`F${srow}`, fPct);
  } else {
    ed.set(`F${srow}`, null);
  }

  const jAmt = accSales !== null ? pyRound(a26.sales - accSales, 2) : null;
  ed.set(`J${srow}`, jAmt);
  if (hasAccBase) {
    const kPct = pyRound(jAmt! / accSales!, 4);
    ed.set(`K${srow}`, kPct);
    ed.colour(`K${srow}`, kPct);
  } else {
    ed.set(`K${srow}`, null);
  }
}

/** Fill a copy of the agenda template; returns the .xlsx bytes. */
export async function buildAgendaWorkbook(inp: AgendaWorkbookInput): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(inp.template);
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const sheet = await zip.file(sheetPath)!.async('string');
  const styles = await zip.file('xl/styles.xml')!.async('string');
  const ed = new SheetEditor(sheet, styles);

  const accReport = inp.prevAccReport === undefined ? inp.prev : inp.prevAccReport;
  const branches = (inp.branches ?? TARGET_BRANCHES).slice(0, NUM_SLOTS);
  const py = String(inp.prevYear).slice(-2);
  const cy = String(inp.currYear).slice(-2);
  const abbr = MONTH_ABBR[inp.month - 1];

  ed.set('F1', MONTH_NAMES[inp.month - 1]);
  const hasAcc = Boolean(inp.prevAccTotals) || accReport !== null;
  ed.set('H2', hasAcc ? `JAN-${abbr} ${py}` : `JAN-${abbr} ${py} (${AWAITING})`);
  ed.set('I2', `JAN-${abbr} ${cy}`);
  ed.set('H4', `G 1-${inp.month}`);
  ed.set('I4', `H 1-${inp.month}`);
  // Year labels follow the reports, so the sheet stays right after the year
  // rolls over. For 2025 vs 2026 these are exactly the template's own text.
  ed.set('F2', `${inp.currYear} YEAR`);
  ed.set('C5', `FY${py}/MCO`);
  ed.set('D5', `FY${cy}/`);
  ed.set('G5', `PROFIT ${py}/${cy}`);
  ed.set('H5', `FY${py}/ Acc. Sales `);
  ed.set('I5', `FY${cy}/ Acc. Sales`);
  ed.set('L5', `PROFIT ${py}/${cy}`);

  branches.forEach((b, slot) => writeBranch(ed, b, slot, inp, accReport));
  for (let slot = branches.length; slot < NUM_SLOTS; slot++) {
    const srow = salesRow(slot);
    for (const row of [srow, srow + 1]) {
      for (const col of 'BCDEFGHIJKL') ed.set(`${col}${row}`, null);
    }
  }

  if (!inp.curr) {
    ed.set('D5', `FY${cy}/ (${AWAITING})`);
    ed.set('I5', `FY${cy}/ Acc. Sales (${AWAITING})`);
  }

  if (/<f\b/.test(ed.sheet)) {
    // Every figure cell is written as a value; a formula left anywhere would
    // render blank in viewers that don't recalculate.
    throw new Error('Agenda template still holds a formula after filling.');
  }

  zip.file(sheetPath, ed.sheet);
  zip.file('xl/styles.xml', ed.finishStyles());

  // The calculation chain lists formula cells that no longer exist; Excel
  // would offer to "repair" the file if it stayed.
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    const ct = await zip.file('[Content_Types].xml')!.async('string');
    zip.file('[Content_Types].xml', ct.replace(/<Override\b[^>]*calcChain[^>]*\/>/, ''));
    const relsPath = 'xl/_rels/workbook.xml.rels';
    const rels = await zip.file(relsPath)!.async('string');
    zip.file(relsPath, rels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/, ''));
  }
  const wb = await zip.file('xl/workbook.xml')!.async('string');
  zip.file('xl/workbook.xml', wb.replace(/<calcPr\b([^>]*?)\/>/, (_all, a: string) =>
    /fullCalcOnLoad/.test(a) ? `<calcPr${a}/>` : `<calcPr${a} fullCalcOnLoad="1"/>`));

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
