'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  parseCsvRecords, aggregate, listMonths, normalizeRecords,
  type OutletSummary, type SalesmanProfile, type Row,
} from '@/lib/salesData';
import {
  saveCsv, loadCsv, clearCsv,
  saveReport, listReports, loadReport, deleteReport, type ReportMeta,
} from '@/lib/csvStore';

// Re-export so existing consumers can keep importing these from the context.
export type { OutletSummary, SalesmanProfile };

interface DataContextType {
  outlets: OutletSummary[];
  /**
   * The loaded report as cleaned transaction rows, before any date window or
   * filter. The Explorer slices these itself; the other pages read `outlets`.
   */
  rows: Row[];
  isLoading: boolean;
  systemStatus: string | null;   // human-readable state for the header pill
  lastUpdated: string | null;
  fileName: string | null;       // name of the loaded CSV, if any
  hasData: boolean;
  /** Months present in the loaded report, 'YYYY-MM', oldest first. */
  availableMonths: string[];
  /** Active date window; null means "no limit on this end". */
  dateFrom: string | null;
  dateTo: string | null;
  setDateRange: (from: string | null, to: string | null) => void;
  /** Parse a user-picked CSV in-browser, show it, and remember it on this machine. */
  loadFromFile: (file: File) => Promise<void>;
  /** Forget the stored CSV and return to the empty state. */
  clearData: () => Promise<void>;
  /** Re-read the CSV currently held in the browser store. */
  refetch: () => void;
  /** Reports remembered on this machine, newest first. */
  savedReports: ReportMeta[];
  /** Re-open one of them. */
  openSavedReport: (id: number) => Promise<void>;
  /** Forget one of them. Does not affect what is currently on screen. */
  removeSavedReport: (id: number) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  // The parsed rows are kept so changing the date range only re-aggregates,
  // rather than re-reading and re-parsing several megabytes of CSV.
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [savedReports, setSavedReports] = useState<ReportMeta[]>([]);

  // Everything the pages read is derived from the rows plus the chosen window,
  // so one filter change updates every screen consistently.
  const outlets = useMemo(
    () => (records.length ? aggregate(records, { dateFrom, dateTo }).outlets : []),
    [records, dateFrom, dateTo],
  );
  // Cleaned once per file, not per filter change — this is the expensive part
  // (return matching, date parsing, grouping) and the Explorer re-slices it on
  // every chip click.
  const rows = useMemo(
    () => (records.length ? normalizeRecords(records) : []),
    [records],
  );
  const availableMonths = useMemo(() => listMonths(records), [records]);

  const setDateRange = useCallback((from: string | null, to: string | null) => {
    setDateFrom(from || null);
    setDateTo(to || null);
  }, []);

  // On first mount, restore the last CSV the user loaded (if any).
  const restore = useCallback(async () => {
    setIsLoading(true);
    try {
      const stored = await loadCsv();
      if (!stored) {
        setSystemStatus('No data loaded');
        setRecords([]);
        setFileName(null);
        return;
      }
      setRecords(parseCsvRecords(stored.text));
      setFileName(stored.fileName);
      setSystemStatus('Local data');
      setLastUpdated(new Date(stored.savedAt).toLocaleString());
    } catch {
      setSystemStatus('Error: could not read stored data');
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshReports = useCallback(async () => {
    setSavedReports(await listReports());
  }, []);

  useEffect(() => { restore(); }, [restore]);
  useEffect(() => { refreshReports(); }, [refreshReports]);

  /** Shared by "open a file" and "open a saved report" — same state transition. */
  const showCsv = useCallback((text: string, name: string, savedAt?: number) => {
    setRecords(parseCsvRecords(text));
    setFileName(name);
    setSystemStatus('Local data');
    setLastUpdated(new Date(savedAt ?? Date.now()).toLocaleString());
    setDateFrom(null);   // a new report starts unfiltered
    setDateTo(null);
  }, []);

  const loadFromFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const text = await file.text();
      showCsv(text, file.name);
      // Persist for next time — stays on this machine only. History is a
      // convenience: if the quota is full the report still opens.
      try { await saveCsv(text, file.name); } catch { /* storage may be blocked; data still shows this session */ }
      try { await saveReport(text, file.name); await refreshReports(); } catch { /* history unavailable */ }
    } finally {
      setIsLoading(false);
    }
  }, [showCsv, refreshReports]);

  const openSavedReport = useCallback(async (id: number) => {
    setIsLoading(true);
    try {
      const stored = await loadReport(id);
      if (!stored) { await refreshReports(); return; }   // deleted in another tab
      showCsv(stored.text, stored.fileName, stored.savedAt);
      // Make it the report that comes back on next visit, too.
      try { await saveCsv(stored.text, stored.fileName); } catch { /* ignore */ }
    } finally {
      setIsLoading(false);
    }
  }, [showCsv, refreshReports]);

  const removeSavedReport = useCallback(async (id: number) => {
    try { await deleteReport(id); } catch { /* ignore */ }
    await refreshReports();
  }, [refreshReports]);

  const clearData = useCallback(async () => {
    try { await clearCsv(); } catch { /* ignore */ }
    setRecords([]);
    setFileName(null);
    setLastUpdated(null);
    setDateFrom(null);
    setDateTo(null);
    setSystemStatus('No data loaded');
  }, []);

  return (
    <DataContext.Provider value={{
      outlets, rows, isLoading, systemStatus, lastUpdated, fileName,
      hasData: outlets.length > 0,
      availableMonths, dateFrom, dateTo, setDateRange,
      loadFromFile, clearData, refetch: restore,
      savedReports, openSavedReport, removeSavedReport,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) throw new Error('useData must be used within a DataProvider');
  return context;
}
