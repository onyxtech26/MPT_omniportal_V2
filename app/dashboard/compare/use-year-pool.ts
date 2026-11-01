'use client';

import { useEffect, useMemo, useState } from 'react';
import { normalizeRecords, parseCsvRecords, type Row } from '@/lib/salesData';
import { loadReport } from '@/lib/csvStore';
import { useData } from '../data-context';

/**
 * Every year of sales the Compare tab can use, gathered from the report on
 * screen plus the reports saved on this computer (the clock menu's history).
 * The owner exports one file per year and loads each through Load Data, so
 * both years are normally already saved here; nothing extra to upload.
 *
 * A year found in more than one file comes from the report on screen first,
 * then the newest saved report. Saved reports are parsed once and cached for
 * the session, since each is several MB.
 */
export interface YearSource { rows: Row[]; fileName: string }

const parsedReports = new Map<number, Row[]>();

function splitByYear(rows: Row[]): Map<string, Row[]> {
  const out = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.day) continue;
    const y = r.day.slice(0, 4);
    const list = out.get(y);
    if (list) list.push(r);
    else out.set(y, [r]);
  }
  return out;
}

export function useYearPool() {
  const { rows, fileName, savedReports, isLoading } = useData();
  const [saved, setSaved] = useState<{ id: number; fileName: string; rows: Row[] }[]>([]);
  const [reading, setReading] = useState(false);

  // The report on screen is already parsed; skip its saved copy.
  const others = useMemo(
    () => savedReports.filter((r) => r.fileName !== fileName),
    [savedReports, fileName],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReading(others.some((r) => !parsedReports.has(r.id)));
      const out: { id: number; fileName: string; rows: Row[] }[] = [];
      for (const meta of others) {
        let parsed = parsedReports.get(meta.id);
        if (!parsed) {
          const stored = await loadReport(meta.id);
          if (cancelled) return;
          if (!stored) continue;
          parsed = normalizeRecords(parseCsvRecords(stored.text));
          parsedReports.set(meta.id, parsed);
        }
        out.push({ id: meta.id, fileName: meta.fileName, rows: parsed });
      }
      if (!cancelled) { setSaved(out); setReading(false); }
    })();
    return () => { cancelled = true; };
  }, [others]);

  const years = useMemo(() => {
    const pool = new Map<string, YearSource>();
    const add = (source: Row[], name: string) => {
      for (const [y, yearRows] of splitByYear(source)) {
        if (!pool.has(y)) pool.set(y, { rows: yearRows, fileName: name });
      }
    };
    if (rows.length && fileName) add(rows, fileName);
    for (const s of saved) add(s.rows, s.fileName);   // savedReports is newest first
    return pool;
  }, [rows, fileName, saved]);

  return { years, loading: isLoading || reading };
}
