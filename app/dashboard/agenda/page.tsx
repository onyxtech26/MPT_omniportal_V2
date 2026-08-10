'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileSpreadsheet, Upload, Download, Copy, Check, Calendar,
  Loader2, AlertCircle, MessageSquare, X, FileArchive, Store,
} from 'lucide-react';
import { ALL_OUTLETS, DEFAULT_OUTLETS, AGENDA_SLOTS } from '@/lib/branches';
import { downloadBase64 } from '@/lib/download';
import { apiErrorMessage } from '@/lib/apiError';

interface AgendaMessage {
  branch: string;
  text: string;
}

interface AgendaResult {
  month: string;
  branches: string[];
  skippedBranches: string[];
  agendaFilename: string;
  agendaBase64: string;
  zipFilename: string;
  zipBase64: string;
  messages: AgendaMessage[];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ZIP_MIME = 'application/zip';

interface FileSlotProps {
  label: string;
  hint: string;
  required?: boolean;
  accept: string;
  file: File | null;
  onPick: (f: File | null) => void;
}

function FileSlot({ label, hint, required, accept, file, onPick }: FileSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
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
        onChange={(e) => onPick(e.target.files?.[0] || null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-[20px] border transition-all text-left ${
          file
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
        }`}
      >
        {file ? <Check size={18} className="shrink-0 text-emerald-600" /> : <Upload size={18} className="shrink-0" />}
        <span className="truncate font-medium text-sm">
          {file ? file.name : 'Choose file…'}
        </span>
        {file && (
          <X
            size={16}
            className="ml-auto shrink-0 text-slate-400 hover:text-rose-500"
            onClick={(e) => { e.stopPropagation(); onPick(null); }}
          />
        )}
      </button>
    </div>
  );
}

function MessageCard({ msg }: { msg: AgendaMessage }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(msg.text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = msg.text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
            {msg.branch}
          </span>
          <span className="text-sm font-bold text-slate-700">WhatsApp message</span>
        </div>
        <button
          onClick={copy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer active:scale-95 ${
            copied
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
  const router = useRouter();
  const [year25, setYear25] = useState<File | null>(null);
  const [year26, setYear26] = useState<File | null>(null);
  const [year25Acc, setYear25Acc] = useState<File | null>(null);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [outlets, setOutlets] = useState<string[]>(DEFAULT_OUTLETS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AgendaResult | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/');
    }
  }, [router]);

  // Selection keeps toggle order, so "the first six go in the workbook"
  // is deterministic and visible to the user.
  const toggleOutlet = (code: string) => {
    setOutlets((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleGenerate = async () => {
    if (!year25) {
      setError('The previous year report file is required.');
      return;
    }
    if (outlets.length === 0) {
      setError('Select at least one outlet.');
      return;
    }
    setIsGenerating(true);
    setError('');
    setResult(null);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      const token = localStorage.getItem('token');
      const form = new FormData();
      form.append('month', String(month));
      form.append('branches', outlets.join(','));
      form.append('year25', year25);
      if (year26) form.append('year26', year26);
      if (year25Acc) form.append('year25_acc', year25Acc);

      const res = await fetch(`${backendUrl}/api/agenda/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (res.status === 401) {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        router.push('/');
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Generation failed'));
      setResult(data);
    } catch (err) {
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setError('Backend is offline. Please check your connection.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not generate the agenda.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!result) return;
    await downloadBase64(result.agendaBase64, result.agendaFilename, XLSX_MIME);
  };

  const handleDownloadZip = async () => {
    if (!result) return;
    await downloadBase64(result.zipBase64, result.zipFilename, ZIP_MIME);
  };

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
          <FileSpreadsheet className="text-slate-400" size={36} />
          Meeting Agenda
        </h1>
        <p className="text-slate-500 font-medium mt-1">
          Upload the monthly POS sales reports and generate the agenda spreadsheet plus WhatsApp messages.
        </p>
      </header>

      {/* Input Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-6 md:p-8"
      >
        <div className="grid gap-6 md:grid-cols-2">
          <FileSlot
            label="Previous Year Report"
            hint="Full POS export for the previous financial year (CSV)."
            required
            accept=".csv"
            file={year25}
            onPick={setYear25}
          />
          <FileSlot
            label="Current Year Report"
            hint="POS export for the current year, Jan to the selected month (CSV)."
            accept=".csv"
            file={year26}
            onPick={setYear26}
          />
          <FileSlot
            label="Previous Year Accumulated"
            hint="Jan to selected month for the previous year — CSV or encoded .xls report."
            accept=".csv,.xls,.xlsx"
            file={year25Acc}
            onPick={setYear25Acc}
          />
          <div>
            <label className="text-sm font-semibold text-slate-700 ml-1 flex items-center gap-2">
              Month
            </label>
            <p className="text-xs text-slate-400 font-medium ml-1 mt-0.5 mb-2">
              The month this agenda covers.
            </p>
            <div className="relative">
              <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20 focus:border-[#0f172a] transition-all text-slate-900 font-medium appearance-none cursor-pointer"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Outlet picker */}
        <div className="mt-6">
          <div className="flex items-center justify-between ml-1">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Store size={16} className="text-slate-400" />
              Outlets to compare
              <span className="text-xs font-medium text-slate-400">
                {outlets.length} selected
              </span>
            </label>
            <button
              type="button"
              onClick={() => setOutlets(DEFAULT_OUTLETS)}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
            >
              Reset to main {AGENDA_SLOTS}
            </button>
          </div>
          <p className="text-xs text-slate-400 font-medium ml-1 mt-0.5 mb-2">
            Every selected outlet gets a WhatsApp message. Outlets not present in the uploaded report are skipped.
          </p>
          <div className="flex flex-wrap gap-2">
            {ALL_OUTLETS.map((code) => {
              const active = outlets.includes(code);
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
          {outlets.length > AGENDA_SLOTS && (
            <p className="mt-2 ml-1 text-xs font-medium text-slate-500">
              The agenda sheet holds {AGENDA_SLOTS} outlets — it will contain the first {AGENDA_SLOTS} selected.
              All {outlets.length} messages are still generated.
            </p>
          )}
        </div>

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

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !year25}
            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-[#0f172a] text-white rounded-[20px] hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 font-semibold cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isGenerating
              ? <><Loader2 size={18} className="animate-spin" /> Generating…</>
              : <><FileSpreadsheet size={18} /> Generate Agenda</>}
          </button>
          {result && (
            <>
              <button
                onClick={handleDownload}
                className="flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-600 text-white rounded-[20px] hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 font-semibold cursor-pointer active:scale-[0.98]"
              >
                <Download size={18} />
                Download {result.agendaFilename}
              </button>
              <button
                onClick={handleDownloadZip}
                className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white border border-emerald-600 text-emerald-700 rounded-[20px] hover:bg-emerald-50 transition-colors font-semibold cursor-pointer active:scale-[0.98]"
              >
                <FileArchive size={18} />
                Download All (ZIP)
              </button>
            </>
          )}
        </div>

        {result && result.skippedBranches?.length > 0 && (
          <div className="mt-4 p-4 text-sm text-amber-700 bg-amber-50 rounded-[20px] border border-amber-100 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>
              Not in the uploaded report, skipped: {result.skippedBranches.join(', ')}
            </span>
          </div>
        )}
      </motion.div>

      {/* Results */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10"
          >
            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <MessageSquare className="text-slate-400" />
              WhatsApp Messages — {result.month}
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              {result.messages.map((m) => (
                <MessageCard key={m.branch} msg={m} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
