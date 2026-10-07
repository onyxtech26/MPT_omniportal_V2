'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import {
  FileSpreadsheet, Upload, Download, Copy, Check, Calendar, Loader2,
  AlertCircle, MessageSquare, X, FileArchive, Store, History,
} from 'lucide-react';
import {
  parseReportCsv, parseReportWorkbook, branchFigures, TARGET_BRANCHES,
  type PosReport, type ReportTotals,
} from '@/lib/agenda/engine';
import { generateMessage } from '@/lib/agenda/messages';
import { buildAgendaWorkbook, NUM_SLOTS } from '@/lib/agenda/workbook';
import { listReports, loadReport, type ReportMeta } from '@/lib/csvStore';

/**
 * Meeting Agenda — the Manager's monthly report to the Director.
 *
 * Takes the POS exports for last year and this year, fills the Meeting Agenda
 * workbook (six outlet slots: month and Jan-to-month sales, margins, profit
 * and variances) and writes one WhatsApp message per outlet.
 *
 * Everything runs in this browser: the exports are read here and never
 * uploaded, the same rule as the sales dashboard. The calculations are a port
 * of the Python generator the desktop build used (backend/agenda/), checked
 * figure-for-figure against it on the Jan–Sep 2025/2026 exports.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Slot = 'prev' | 'curr' | 'acc';

/** A report chosen for one slot, already parsed. */
interface Loaded {
  name: string;
  csv?: PosReport;
  totals?: Map<string, ReportTotals>;
}

interface AgendaMessage { branch: string; text: string }

interface SummaryRow {
  branch: string;
  prevSales: number;
  currSales: number | null;
  prevMargin: number;
  currMargin: number | null;
}

interface AgendaResult {
  month: number;
  prevYear: number;
  currYear: number;
  inSheet: string[];
  messages: AgendaMessage[];
  summary: SummaryRow[];
  agendaFilename: string;
  agendaBytes: Uint8Array;
  zipFilename: string;
  zipBytes: Uint8Array;
}

function saveBytes(bytes: Uint8Array, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    return true;
  } catch {
    return false;
  }
}

const money = (n: number) =>
  n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Lets the spinner paint before a long synchronous parse or build. */
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

function describe(r: PosReport): string {
  const span = r.months.length
    ? `${MONTHS[r.months[0] - 1].slice(0, 3)}–${MONTHS[r.months[r.months.length - 1] - 1].slice(0, 3)}`
    : 'no dated rows';
  return `${r.year ?? 'unknown year'} · ${span} · ${r.outlets.length} outlets`;
}

interface FileSlotProps {
  label: string;
  hint: string;
  required?: boolean;
  accept: string;
  loaded: Loaded | null;
  busy: boolean;
  error: string;
  saved: ReportMeta[];
  allowSaved: boolean;
  onFile: (f: File) => void;
  onSaved: (id: number) => void;
  onClear: () => void;
}

function FileSlot({
  label, hint, required, accept, loaded, busy, error, saved, allowSaved, onFile, onSaved, onClear,
}: FileSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const detail = loaded?.csv ? describe(loaded.csv) : loaded?.totals ? `${loaded.totals.size} outlet totals` : '';
  return (
    <div className="min-w-0">
      <label className="text-sm font-semibold text-slate-700 ml-1 flex items-center gap-2">
        {label}
        {required
          ? <span className="text-xs font-bold text-rose-500 uppercase tracking-wide">Required</span>
          : <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Optional</span>}
      </label>
      <p className="text-xs text-slate-400 font-medium ml-1 mt-0.5 mb-2">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' && !busy) inputRef.current?.click(); }}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-[20px] border transition-all text-left cursor-pointer ${
          loaded
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
        }`}
      >
        {busy
          ? <Loader2 size={18} className="shrink-0 animate-spin" />
          : loaded ? <Check size={18} className="shrink-0 text-emerald-600" /> : <Upload size={18} className="shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-sm">
            {busy ? 'Reading…' : loaded ? loaded.name : 'Choose file…'}
          </span>
          {detail && !busy && <span className="block truncate text-xs text-emerald-700/80">{detail}</span>}
        </span>
        {loaded && !busy && (
          <button
            type="button"
            aria-label="Remove"
            className="ml-auto shrink-0 text-slate-400 hover:text-rose-500 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      {allowSaved && saved.length > 0 && !loaded && !busy && (
        <div className="mt-2 flex items-center gap-2 ml-1">
          <History size={14} className="text-slate-400 shrink-0" />
          <select
            value=""
            onChange={(e) => { if (e.target.value) onSaved(Number(e.target.value)); }}
            className="min-w-0 flex-1 text-xs bg-transparent text-slate-500 font-medium focus:outline-none cursor-pointer"
          >
            <option value="">or use a report saved on this computer…</option>
            {saved.map((r) => <option key={r.id} value={r.id}>{r.fileName}</option>)}
          </select>
        </div>
      )}
      {error && <p className="mt-2 ml-1 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

function MessageCard({ msg }: { msg: AgendaMessage }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(msg.text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <div className="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <span className="min-w-8 h-8 px-1.5 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
            {msg.branch}
          </span>
          <span className="text-sm font-bold text-slate-700">WhatsApp message</span>
        </div>
        <button
          onClick={copy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer active:scale-95 ${
            copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="px-5 py-4 text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed flex-1 overflow-x-auto">
        {msg.text}
      </pre>
    </div>
  );
}

export default function AgendaPage() {
  const [files, setFiles] = useState<Record<Slot, Loaded | null>>({ prev: null, curr: null, acc: null });
  const [busy, setBusy] = useState<Record<Slot, boolean>>({ prev: false, curr: false, acc: false });
  const [slotError, setSlotError] = useState<Record<Slot, string>>({ prev: '', curr: '', acc: '' });
  const [saved, setSaved] = useState<ReportMeta[]>([]);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [outlets, setOutlets] = useState<string[]>(TARGET_BRANCHES);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AgendaResult | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    listReports().then(setSaved).catch(() => setSaved([]));
  }, []);

  const prev = files.prev?.csv ?? null;
  const curr = files.curr?.csv ?? null;

  // Outlets that appear in the chosen reports; only these can be compared.
  const available = useMemo(() => {
    const set = new Set<string>([...(prev?.outlets ?? []), ...(curr?.outlets ?? [])]);
    return [...set].sort();
  }, [prev, curr]);

  const prevYear = prev?.year ?? (curr?.year ? curr.year - 1 : new Date().getFullYear() - 1);
  const currYear = curr?.year ?? prevYear + 1;
  const yearsLookWrong = Boolean(prev?.year && curr?.year && prev.year >= curr.year);

  const setSlot = (slot: Slot, loaded: Loaded | null) => {
    setFiles((f) => ({ ...f, [slot]: loaded }));
    setResult(null);
    if (!loaded) return;
    // When the current year's report arrives, default to its latest month and
    // to the main outlets it actually has.
    const r = loaded.csv;
    if (slot === 'curr' && r?.months.length) setMonth(r.months[r.months.length - 1]);
    if (slot !== 'acc' && r) {
      setOutlets((cur) => {
        const pool = new Set([...(slot === 'prev' ? r.outlets : prev?.outlets ?? []), ...(slot === 'curr' ? r.outlets : curr?.outlets ?? [])]);
        const kept = cur.filter((o) => pool.has(o));
        return kept.length ? kept : TARGET_BRANCHES.filter((o) => pool.has(o));
      });
    }
  };

  const readInto = async (slot: Slot, name: string, read: () => Promise<Loaded>) => {
    setBusy((b) => ({ ...b, [slot]: true }));
    setSlotError((e) => ({ ...e, [slot]: '' }));
    await nextFrame();
    try {
      const loaded = await read();
      if (loaded.csv && !loaded.csv.rows.length) throw new Error('The file has no sales lines.');
      setSlot(slot, loaded);
    } catch (err) {
      setSlot(slot, null);
      setSlotError((e) => ({
        ...e,
        [slot]: `${name}: ${err instanceof Error ? err.message : 'could not be read.'}`,
      }));
    } finally {
      setBusy((b) => ({ ...b, [slot]: false }));
    }
  };

  const onFile = (slot: Slot) => (f: File) => {
    const lower = f.name.toLowerCase();
    if (slot !== 'acc' && !lower.endsWith('.csv')) {
      setSlotError((e) => ({ ...e, [slot]: `${f.name}: choose the CSV export from the POS.` }));
      return;
    }
    if (lower.endsWith('.xls')) {
      setSlotError((e) => ({
        ...e,
        [slot]: 'Old-style .xls files cannot be read in the browser. Open it in Excel and "Save As" .xlsx, or use the CSV export.',
      }));
      return;
    }
    readInto(slot, f.name, async () => {
      if (lower.endsWith('.xlsx')) {
        const totals = await parseReportWorkbook(await f.arrayBuffer());
        if (!totals.size) throw new Error('No outlet "Total:" rows were found in this report.');
        return { name: f.name, totals };
      }
      return { name: f.name, csv: parseReportCsv(await f.text()) };
    });
  };

  const onSaved = (slot: Slot) => (id: number) => {
    const meta = saved.find((r) => r.id === id);
    readInto(slot, meta?.fileName ?? 'Saved report', async () => {
      const stored = await loadReport(id);
      if (!stored) throw new Error('That saved report is no longer on this computer.');
      return { name: stored.fileName, csv: parseReportCsv(stored.text) };
    });
  };

  const toggleOutlet = (code: string) => {
    setResult(null);
    // Selection keeps click order, so "the first six go in the sheet" is
    // predictable and visible.
    setOutlets((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  };

  const selected = outlets.filter((o) => available.includes(o));

  const handleGenerate = async () => {
    if (!prev) { setError("Last year's report is required."); return; }
    if (!selected.length) { setError('Select at least one outlet.'); return; }
    setIsGenerating(true);
    setError('');
    setResult(null);
    await nextFrame();
    try {
      const template = await fetch('/agenda/Meeting_Agenda.xlsx').then((r) => {
        if (!r.ok) throw new Error('Could not load the agenda template.');
        return r.arrayBuffer();
      });
      const acc = files.acc;
      const inSheet = selected.slice(0, NUM_SLOTS);
      const agendaBytes = await buildAgendaWorkbook({
        template,
        month,
        prev,
        curr,
        prevAccReport: acc?.csv ?? (acc?.totals ? null : prev),
        prevAccTotals: acc?.totals ?? null,
        branches: inSheet,
        prevYear,
        currYear,
      });
      const messages = selected.map((b) => ({
        branch: b,
        text: generateMessage(b, month, prev, curr, { prevYear, currYear }),
      }));
      const summary: SummaryRow[] = selected.map((b) => {
        const p = branchFigures(prev, b, [month]);
        const c = curr ? branchFigures(curr, b, [month]) : null;
        return {
          branch: b,
          prevSales: p.sales,
          currSales: c?.sales ?? null,
          prevMargin: p.margin,
          currMargin: c?.margin ?? null,
        };
      });

      const monthName = MONTHS[month - 1];
      const agendaFilename = `agenda_${monthName}.xlsx`;
      const zip = new JSZip();
      for (const m of messages) zip.file(`${m.branch}_${monthName}.txt`, m.text);
      zip.file('ALL_MESSAGES.txt', messages.map((m) => m.text).join(`\n\n${'-'.repeat(40)}\n\n`));
      zip.file(agendaFilename, agendaBytes);
      const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

      setResult({
        month, prevYear, currYear, inSheet, messages, summary,
        agendaFilename, agendaBytes,
        zipFilename: `agenda_package_${monthName}.zip`, zipBytes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the agenda.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyAll = async () => {
    if (!result) return;
    if (await copyText(result.messages.map((m) => m.text).join(`\n\n${'-'.repeat(40)}\n\n`))) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    }
  };

  const slotProps = (slot: Slot) => ({
    loaded: files[slot],
    busy: busy[slot],
    error: slotError[slot],
    saved,
    onFile: onFile(slot),
    onSaved: onSaved(slot),
    onClear: () => { setSlot(slot, null); setSlotError((e) => ({ ...e, [slot]: '' })); },
  });

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
          <FileSpreadsheet className="text-slate-400" size={36} />
          Meeting Agenda
        </h1>
        <p className="text-slate-500 font-medium mt-1">
          Pick last year&apos;s and this year&apos;s POS reports to build the monthly agenda sheet and the WhatsApp message for each outlet.
          The reports are read on this computer and never uploaded.
        </p>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-6 md:p-8"
      >
        <div className="grid gap-6 md:grid-cols-2">
          <FileSlot
            label="Last Year's Report"
            hint="POS export (CSV) covering last year, at least January to the agenda month."
            required
            accept=".csv"
            allowSaved
            {...slotProps('prev')}
          />
          <FileSlot
            label="This Year's Report"
            hint="POS export (CSV) for this year, January to the agenda month."
            accept=".csv"
            allowSaved
            {...slotProps('curr')}
          />
          <FileSlot
            label="Last Year Jan-to-Month"
            hint="Only if last year's accumulated sales should come from a separate report: a CSV, or the printed Sales Profit Report saved as .xlsx."
            accept=".csv,.xlsx,.xls"
            allowSaved
            {...slotProps('acc')}
          />
          <div className="min-w-0">
            <label className="text-sm font-semibold text-slate-700 ml-1 flex items-center gap-2">Month</label>
            <p className="text-xs text-slate-400 font-medium ml-1 mt-0.5 mb-2">The month this agenda covers.</p>
            <div className="relative">
              <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={month}
                onChange={(e) => { setMonth(Number(e.target.value)); setResult(null); }}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20 focus:border-[#0f172a] transition-all text-slate-900 font-medium appearance-none cursor-pointer"
              >
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            {(prev || curr) && (
              <p className="text-xs text-slate-500 font-medium ml-1 mt-2">
                Comparing {prevYear} with {currYear}{curr ? '' : ' (no report for this year yet)'}.
              </p>
            )}
          </div>
        </div>

        {yearsLookWrong && (
          <div className="mt-6 p-4 text-sm text-amber-700 bg-amber-50 rounded-[20px] border border-amber-100 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>
              Last year&apos;s report is from {prev?.year} and this year&apos;s is from {curr?.year}. Check the two files are in the right boxes.
            </span>
          </div>
        )}

        {available.length > 0 && (
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 ml-1">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Store size={16} className="text-slate-400 shrink-0" />
                Outlets to compare
                <span className="text-xs font-medium text-slate-400">{selected.length} selected</span>
              </label>
              <button
                type="button"
                onClick={() => { setOutlets(TARGET_BRANCHES.filter((o) => available.includes(o))); setResult(null); }}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
              >
                Reset to main {NUM_SLOTS}
              </button>
            </div>
            <p className="text-xs text-slate-400 font-medium ml-1 mt-0.5 mb-2">
              Every selected outlet gets a WhatsApp message. Only outlets in the reports are listed.
            </p>
            <div className="flex flex-wrap gap-2">
              {available.map((code) => {
                const active = selected.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleOutlet(code)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer active:scale-95 ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
            {selected.length > NUM_SLOTS && (
              <p className="mt-2 ml-1 text-xs font-medium text-slate-500">
                The agenda sheet holds {NUM_SLOTS} outlets, so it will have the first {NUM_SLOTS} selected
                ({selected.slice(0, NUM_SLOTS).join(', ')}). All {selected.length} messages are still written.
              </p>
            )}
          </div>
        )}

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 p-4 text-sm text-red-600 bg-red-50 rounded-[20px] border border-red-100 flex items-center gap-3"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prev || Object.values(busy).some(Boolean)}
            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-[#0f172a] text-white rounded-[20px] hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 font-semibold cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isGenerating
              ? <><Loader2 size={18} className="animate-spin" /> Generating…</>
              : <><FileSpreadsheet size={18} /> Generate Agenda</>}
          </button>
          {result && (
            <>
              <button
                onClick={() => saveBytes(result.agendaBytes, result.agendaFilename, XLSX_MIME)}
                className="flex items-center justify-center gap-2 min-w-0 px-6 py-3.5 bg-emerald-600 text-white rounded-[20px] hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 font-semibold cursor-pointer active:scale-[0.98]"
              >
                <Download size={18} className="shrink-0" />
                <span className="truncate">Download {result.agendaFilename}</span>
              </button>
              <button
                onClick={() => saveBytes(result.zipBytes, result.zipFilename, 'application/zip')}
                className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white border border-emerald-600 text-emerald-700 rounded-[20px] hover:bg-emerald-50 transition-colors font-semibold cursor-pointer active:scale-[0.98]"
              >
                <FileArchive size={18} />
                Download All (ZIP)
              </button>
            </>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-10 space-y-10">
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4">
                {MONTHS[result.month - 1]} at a glance
              </h2>
              <div className="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-3 font-semibold">Outlet</th>
                      <th className="px-5 py-3 font-semibold text-right">{result.prevYear} sales (RM)</th>
                      <th className="px-5 py-3 font-semibold text-right">{result.currYear} sales (RM)</th>
                      <th className="px-5 py-3 font-semibold text-right">Change</th>
                      <th className="px-5 py-3 font-semibold text-right">Margin {result.prevYear} → {result.currYear}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.summary.map((r) => {
                      const diff = r.currSales !== null ? r.currSales - r.prevSales : null;
                      const change = diff !== null && r.prevSales ? diff / r.prevSales : null;
                      return (
                        <tr key={r.branch} className="border-t border-slate-50">
                          <td className="px-5 py-3 font-bold text-slate-800">
                            {r.branch}
                            {!result.inSheet.includes(r.branch) && (
                              <span className="ml-2 text-[10px] font-semibold text-slate-400 uppercase">message only</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-600">{money(r.prevSales)}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-900 font-semibold">
                            {r.currSales !== null ? money(r.currSales) : '—'}
                          </td>
                          <td className={`px-5 py-3 text-right tabular-nums font-semibold ${
                            diff === null ? 'text-slate-400' : diff < 0 ? 'text-rose-600' : 'text-sky-700'
                          }`}>
                            {diff === null ? '—' : `${diff < 0 ? '−' : '+'}${money(Math.abs(diff))}`}
                            {change !== null && <span className="ml-1 text-xs font-medium">({pct(change)})</span>}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                            {pct(r.prevMargin)} → {r.currMargin !== null ? pct(r.currMargin) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <MessageSquare className="text-slate-400" />
                  WhatsApp Messages, {MONTHS[result.month - 1]}
                </h2>
                <button
                  onClick={copyAll}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer active:scale-95 ${
                    copiedAll ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {copiedAll ? <Check size={14} /> : <Copy size={14} />}
                  {copiedAll ? 'Copied all' : 'Copy all'}
                </button>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                {result.messages.map((m) => <MessageCard key={m.branch} msg={m} />)}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
