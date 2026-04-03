'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface LeaderboardItem {
  id: string;
  revenue: number;
}

export interface SalesmanProfile {
  name: string;
  totalRevenue: number;
  brands: Record<string, number>;
  monthlyData: Record<string, { revenue: number; brands: Record<string, number> }>;
  dailyRevenue?: Record<string, number>;
}

export interface OutletSummary {
  code: string;
  name: string;
  totalRevenue: number;
  totalInvestment: number;
  transactionCount: number;
  salesmen: Record<string, number>;
  brands: Record<string, number>;
  salesmanProfiles: Record<string, SalesmanProfile>;
}

interface DataContextType {
  outlets: OutletSummary[];
  leaderboard: LeaderboardItem[];
  isLoading: boolean;
  systemStatus: string | null;
  lastUpdated: string | null;
  refetch: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const backendUrl = 'http://103.249.84.244'; // Using your Nginx Proxy
      const response = await fetch(`${backendUrl}/api/summary`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.detail || 'Integrity Error');

      setOutlets(data.outlets);
      setLeaderboard(data.leaderboard || []);
      setSystemStatus("Verified");
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error: any) {
      setSystemStatus(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <DataContext.Provider value={{ outlets, leaderboard, isLoading, systemStatus, lastUpdated, refetch: fetchData }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) throw new Error('useData must be used within a DataProvider');
  return context;
}