'use client';

import { useRef } from 'react';
import { Upload, Check, Loader2, X, History } from 'lucide-react';
import type { ReportMeta } from '@/lib/csvStore';

/**
 * One "choose a report" box: pick a file, or reuse a report already saved on
 * this computer. Shared by the Meeting Agenda and Compare, which each take
 * their own files rather than the dashboard's loaded one.
 */
export interface FileSlotProps {
  label: string;
  hint: string;
  required?: boolean;
  accept: string;
  /** What is loaded: its name and a one-line summary. */
  loaded: { name: string; detail?: string } | null;
  busy: boolean;
  error: string;
  saved: ReportMeta[];
  allowSaved: boolean;
  onFile: (f: File) => void;
  onSaved: (id: number) => void;
  onClear: () => void;
}

export function FileSlot({
  label, hint, required, accept, loaded, busy, error, saved, allowSaved, onFile, onSaved, onClear,
}: FileSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const detail = loaded?.detail ?? '';
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
            // Padding with matching negative margin gives phones a ~40px target without moving the icon.
            className="ml-auto shrink-0 text-slate-400 hover:text-rose-500 cursor-pointer max-sm:p-3 max-sm:-m-3"
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
            className="min-w-0 flex-1 text-xs bg-transparent text-slate-500 font-medium focus:outline-none cursor-pointer max-sm:py-2.5"
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
