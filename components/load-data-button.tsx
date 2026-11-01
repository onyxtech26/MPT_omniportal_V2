'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2, FileCheck2 } from 'lucide-react';
import { useData } from '@/app/dashboard/data-context';

/**
 * "Load Data" in the top bar: pick a POS sales CSV and load it into the
 * dashboard. Shared by the website's dashboard layout and the Manager's
 * offline desktop app (desktop/), so both load data the same way.
 */
export function LoadDataButton() {
  const { loadFromFile, hasData, fileName } = useData();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploading(true);
    setUploadMsg(null);
    try {
      // Parsed in the browser — the file never leaves this machine.
      await loadFromFile(file);
      setUploadMsg({ ok: true, text: 'Data loaded.' });
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Could not read file.';
      setUploadMsg({ ok: false, text });
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadMsg(null), 5000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {uploadMsg && (
        <span className={`hidden min-[1700px]:inline text-xs font-medium whitespace-nowrap ${uploadMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
          {uploadMsg.text}
        </span>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleUploadData}
        className="hidden"
      />
      {/* Dark "Load Data" until a report is in; then a quiet button
          naming the loaded file, which still swaps it for another.
          Icon-only and a fixed 40px square on phones so the header
          keeps room for the profile avatar. */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        title={hasData && fileName
          ? `Loaded: ${fileName}. Click to load a different report (stays on this computer).`
          : 'Load sales data (CSV) — stays on this computer'}
        className={`flex items-center justify-center gap-2 px-3 py-2 max-sm:w-10 max-sm:h-10 max-sm:px-0 rounded-xl text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-60 ${
          hasData
            ? 'border border-slate-200 text-slate-700 hover:bg-slate-50'
            : 'bg-slate-900 text-white hover:bg-slate-700'
        }`}
      >
        {isUploading
          ? <Loader2 size={16} className="animate-spin" />
          : hasData ? <FileCheck2 size={16} className="text-emerald-600" /> : <Upload size={16} />}
        <span className="hidden md:inline lg:hidden xl:inline">
          {isUploading ? 'Loading…' : hasData ? 'Change Data' : 'Load Data'}
        </span>
      </button>
    </div>
  );
}
