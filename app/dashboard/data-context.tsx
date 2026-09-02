'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { parseCsvText, type OutletSummary, type SalesmanProfile } from '@/lib/salesData';
import { saveCsv, loadCsv, clearCsv } from '@/lib/csvStore';

// Re-export so existing consumers can keep importing these from the context.
export type { OutletSummary, SalesmanProfile };

interface DataContextType {
  outlets: OutletSummary[];
  isLoading: boolean;
  systemStatus: string | null;   // human-readable state for the header pill
  lastUpdated: string | null;
  fileName: string | null;       // name of the loaded CSV, if any
  hasData: boolean;
  /** Parse a user-picked CSV in-browser, show it, and remember it on this machine. */
  loadFromFile: (file: File) => Promise<void>;
  /** Forget the stored CSV and return to the empty state. */
  clearData: () => Promise<void>;
  /** Re-parse the CSV currently held in the browser store. */
  refetch: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // On first mount, restore the last CSV the user loaded (if any).
  const restore = useCallback(async () => {
    setIsLoading(true);
    try {
      const stored = await loadCsv();
      if (!stored) {
        setSystemStatus('No data loaded');
        setOutlets([]);
        setFileName(null);
        return;
      }
      const summary = parseCsvText(stored.text);
      setOutlets(summary.outlets);
      setFileName(stored.fileName);
      setSystemStatus('Local data');
      setLastUpdated(new Date(stored.savedAt).toLocaleString());
    } catch {
      setSystemStatus('Error: could not read stored data');
      setOutlets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { restore(); }, [restore]);

  const loadFromFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const text = await file.text();
      const summary = parseCsvText(text);
      setOutlets(summary.outlets);
      setFileName(file.name);
      setSystemStatus('Local data');
      setLastUpdated(new Date().toLocaleString());
      // Persist for next time — stays on this machine only.
      try { await saveCsv(text, file.name); } catch { /* storage may be blocked; data still shows this session */ }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearData = useCallback(async () => {
    try { await clearCsv(); } catch { /* ignore */ }
    setOutlets([]);
    setFileName(null);
    setLastUpdated(null);
    setSystemStatus('No data loaded');
  }, []);

  return (
    <DataContext.Provider value={{
      outlets, isLoading, systemStatus, lastUpdated, fileName,
      hasData: outlets.length > 0,
      loadFromFile, clearData, refetch: restore,
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
