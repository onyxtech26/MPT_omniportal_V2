'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DEMO_DATA } from '@/lib/demo-data';
import { apiErrorMessage } from '@/lib/apiError';

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
  skills?: string[];
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
  const router = useRouter();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.role === 'demo') {
        setOutlets(DEMO_DATA);
        setLeaderboard([
          { id: 'Michael Chen', revenue: 182000 },
          { id: 'James Smith', revenue: 167800 },
          { id: 'Sarah Jenkins', revenue: 156500 },
          { id: 'Emily Wong', revenue: 145000 },
          { id: 'Robert Wilson', revenue: 112000 }
        ]);
        setSystemStatus('Demo Mode');
        setLastUpdated(new Date().toLocaleTimeString());
        setIsLoading(false);
        return;
      }

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      const token = localStorage.getItem('token');
      const response = await fetch(`${backendUrl}/api/summary`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        router.push('/');
        return;
      }

      const data = await response.json();

      if (!response.ok) throw new Error(apiErrorMessage(data, 'Integrity Error'));

      setOutlets(data.outlets);
      setLeaderboard(data.leaderboard || []);
      setSystemStatus("Verified");
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      setSystemStatus('Error: Could not reach server');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

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