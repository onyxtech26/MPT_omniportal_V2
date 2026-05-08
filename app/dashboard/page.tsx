'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, TrendingUp, Package, ChevronRight, Download, Users, Award, DollarSign, Medal, Calendar, X, Trophy, Zap, Info, LogOut } from 'lucide-react';
import { useData } from './data-context';

export default function DashboardPage() {
  const { outlets, isLoading, lastUpdated, systemStatus, refetch } = useData();
  const [selectedOutletCode, setSelectedOutletCode] = useState<string | null>(null);
  const [selectedSalesmanId, setSelectedSalesmanId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/');
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    router.push('/');
  };

  const selectedOutlet = useMemo(() => 
    outlets?.find(o => o.code === selectedOutletCode) || null, 
  [outlets, selectedOutletCode]);

  const selectedSalesman = useMemo(() => {
    if (!selectedOutlet || !selectedSalesmanId) return null;
    return selectedOutlet.salesmanProfiles[selectedSalesmanId] || null;
  }, [selectedOutlet, selectedSalesmanId]);

  // Helper for currency formatting
  const formatCurrencyFull = (value: number) => {
    return `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatCurrencyCompact = (value: number) => {
    if (value >= 1000000) {
      return `RM ${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `RM ${(value / 1000).toFixed(0)}k`;
    }
    return `RM ${value.toLocaleString('en-MY')}`;
  };

  // Calculate high-level metrics
  const totalNetworkRevenue = (outlets || []).reduce((acc, curr) => acc + curr.totalRevenue, 0);
  const totalNetworkInvestment = (outlets || []).reduce((acc, curr) => acc + curr.totalInvestment, 0);
  const totalNetworkTransactions = (outlets || []).reduce((acc, curr) => acc + (curr.transactionCount || 0), 0);
  const networkATV = totalNetworkTransactions > 0 ? totalNetworkRevenue / totalNetworkTransactions : 0;

  // Detail View Metrics
  const salesmanLeaderboard = useMemo(() => {
    if (!selectedOutlet) return [];
    return Object.entries(selectedOutlet.salesmen)
      .map(([name, sales]) => ({ name, sales }))
      .sort((a, b) => b.sales - a.sales);
  }, [selectedOutlet]);

  const brandSuccess = useMemo(() => {
    if (!selectedOutlet) return { top: [], bottom: [] };
    const sortedBrands = Object.entries(selectedOutlet.brands)
      .map(([name, sales]) => ({ name, sales }))
      .sort((a, b) => b.sales - a.sales);
    
    return {
      top: sortedBrands.slice(0, 3),
      bottom: sortedBrands.slice(-3).reverse(),
      all: sortedBrands
    };
  }, [selectedOutlet]);

  const outletATV = selectedOutlet && selectedOutlet.transactionCount > 0
    ? selectedOutlet.totalRevenue / selectedOutlet.transactionCount
    : 0;

  const networkTopBrands = useMemo(() => {
    const brandMap: Record<string, number> = {};
    (outlets || []).forEach(outlet => {
      Object.entries(outlet.brands).forEach(([brand, revenue]) => {
        brandMap[brand] = (brandMap[brand] || 0) + (revenue as number);
      });
    });
    return Object.entries(brandMap)
      .map(([name, sales]) => ({ name, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 8);
  }, [outlets]);

  // Salesman Detail Metrics
  const salesmanMetrics = useMemo(() => {
    if (!selectedSalesman) return null;

    // Top Brands
    const topBrands = Object.entries(selectedSalesman.brands)
      .map(([name, sales]) => ({ name, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10); // Show top 10 for overall ranking

    // Monthly Breakdown
    const monthlyData = Object.entries(selectedSalesman.monthlyData)
      .sort((a, b) => a[0].localeCompare(b[0])) // Sort by YYYY-MM
      .map(([month, data]) => {
        // Find top brand for this month
        const topBrandEntry = Object.entries(data.brands).sort((a, b) => b[1] - a[1])[0];
        
        // Convert YYYY-MM to Month Name
        const date = new Date(`${month}-01`);
        const monthName = date.toLocaleString('default', { month: 'short', year: 'numeric' });

        return {
          month,
          monthName,
          revenue: data.revenue,
          topBrand: topBrandEntry ? topBrandEntry[0] : 'None',
          topBrandRevenue: topBrandEntry ? topBrandEntry[1] : 0
        };
      });

    // Rank in Outlet
    const rank = salesmanLeaderboard.findIndex(s => s.name === selectedSalesman.name) + 1;
    const isTop1 = rank === 1;

    // Best Day
    let bestDay = 'N/A';
    let maxDayRevenue = 0;
    if (selectedSalesman.dailyRevenue) {
      Object.entries(selectedSalesman.dailyRevenue).forEach(([day, revenue]) => {
        if (revenue > maxDayRevenue) {
          maxDayRevenue = revenue;
          bestDay = day;
        }
      });
    }

    return { topBrands, monthlyData, rank, isTop1, bestDay };
  }, [selectedSalesman, salesmanLeaderboard]);


  const handleDownloadReport = async () => {
    if (!selectedOutlet) return;
    setIsExporting(true);

    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pW = 210;
      const pH = 297;
      const mg = 15;

      // Colour palette
      const C = {
        dark:     [15, 23, 42]    as [number, number, number],
        white:    [255, 255, 255] as [number, number, number],
        slate50:  [248, 250, 252] as [number, number, number],
        slate200: [226, 232, 240] as [number, number, number],
        slate400: [148, 163, 184] as [number, number, number],
        slate500: [100, 116, 139] as [number, number, number],
        emerald:  [16, 185, 129]  as [number, number, number],
        amber:    [245, 158, 11]  as [number, number, number],
        orange:   [234, 88, 12]   as [number, number, number],
        green50:  [240, 253, 244] as [number, number, number],
        amber50:  [255, 251, 235] as [number, number, number],
        green700: [21, 128, 61]   as [number, number, number],
        red50:    [255, 241, 242] as [number, number, number],
        red600:   [220, 38, 38]   as [number, number, number],
      };

      const drawHeader = (title: string, subtitle: string) => {
        doc.setFillColor(...C.dark);
        doc.rect(0, 0, pW, 42, 'F');
        doc.setTextColor(...C.white);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('MPT OMNIPORTAL', mg, 11);
        doc.text(`Generated: ${new Date().toLocaleString('en-MY')}`, pW - mg, 11, { align: 'right' });
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(title, mg, 25);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.slate400);
        doc.text(subtitle, mg, 34);
      };

      const drawFooter = () => {
        doc.setDrawColor(...C.slate200);
        doc.setLineWidth(0.3);
        doc.line(mg, pH - 14, pW - mg, pH - 14);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.slate500);
        doc.text('Powered by Onyxx Tech Hub', mg, pH - 8);
        doc.text('MPT OmniPortal — Confidential', pW - mg, pH - 8, { align: 'right' });
      };

      const sectionLabel = (label: string, y: number) => {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...C.slate500);
        doc.text(label, mg, y);
      };

      const metricBox = (x: number, y: number, w: number, label: string, value: string) => {
        doc.setFillColor(...C.slate50);
        doc.roundedRect(x, y, w, 24, 2, 2, 'F');
        doc.setDrawColor(...C.slate200);
        doc.roundedRect(x, y, w, 24, 2, 2, 'S');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...C.slate500);
        doc.text(label, x + 4, y + 8);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...C.dark);
        doc.text(value, x + 4, y + 19);
      };

      let filename = '';

      if (selectedSalesman && salesmanMetrics) {
        // ── SALESMAN REPORT ────────────────────────────────────────────
        filename = `${selectedOutlet.code}_${selectedSalesman.name.replace(/[\s/\\:*?"<>|]+/g, '_')}_Report.pdf`;
        drawHeader(
          'SALESMAN PERFORMANCE REPORT',
          `${selectedSalesman.name}  •  Outlet: ${selectedOutlet.code}`
        );

        let y = 52;
        const bW = (pW - mg * 2 - 10) / 3;
        metricBox(mg,              y, bW, 'TOTAL REVENUE',  formatCurrencyFull(selectedSalesman.totalRevenue));
        metricBox(mg + bW + 5,     y, bW, 'OUTLET RANK',    `#${salesmanMetrics.rank}`);
        metricBox(mg + (bW + 5)*2, y, bW, 'BEST DAY',       salesmanMetrics.bestDay);
        y += 32;

        doc.setDrawColor(...C.slate200);
        doc.setLineWidth(0.3);
        doc.line(mg, y, pW - mg, y);
        y += 8;

        sectionLabel('12-MONTH PERFORMANCE', y);
        y += 4;
        autoTable(doc, {
          startY: y,
          head: [['Month', 'Revenue (RM)', 'Top Brand']],
          body: salesmanMetrics.monthlyData.map(d => [d.monthName, formatCurrencyFull(d.revenue), d.topBrand]),
          margin: { left: mg, right: mg },
          headStyles: { fillColor: C.dark, textColor: C.white, fontStyle: 'bold', fontSize: 8.5, cellPadding: 4 },
          bodyStyles: { fontSize: 8.5, textColor: C.dark, cellPadding: 3.5 },
          alternateRowStyles: { fillColor: C.slate50 },
          columnStyles: { 0: { cellWidth: 35 }, 1: { halign: 'right', cellWidth: 55 } },
        });
        y = (doc as any).lastAutoTable.finalY + 10;

        if (y > pH - 70) { doc.addPage(); y = 20; }

        sectionLabel('OVERALL BRAND RANKING', y);
        y += 4;
        autoTable(doc, {
          startY: y,
          head: [['Rank', 'Brand', 'Revenue (RM)']],
          body: salesmanMetrics.topBrands.map((b, i) => [`#${i + 1}`, b.name, formatCurrencyFull(b.sales)]),
          margin: { left: mg, right: mg },
          headStyles: { fillColor: C.dark, textColor: C.white, fontStyle: 'bold', fontSize: 8.5, cellPadding: 4 },
          bodyStyles: { fontSize: 8.5, textColor: C.dark, cellPadding: 3.5 },
          alternateRowStyles: { fillColor: C.slate50 },
          columnStyles: { 0: { cellWidth: 20, halign: 'center' }, 2: { halign: 'right' } },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.row.index < 3) {
              data.cell.styles.fontStyle = 'bold';
              if (data.column.index === 0)
                data.cell.styles.textColor = [C.amber, C.slate400, C.orange][data.row.index];
            }
          },
        });

      } else {
        // ── OUTLET REPORT ──────────────────────────────────────────────
        filename = `${selectedOutlet.code}_Branch_Report.pdf`;
        drawHeader('BRANCH PERFORMANCE REPORT', `Outlet: ${selectedOutlet.code}`);

        let y = 52;
        const bW = (pW - mg * 2 - 10) / 3;

        sectionLabel('FINANCIAL OVERVIEW', y);
        y += 5;
        metricBox(mg,              y, bW, 'TOTAL REVENUE',        formatCurrencyFull(selectedOutlet.totalRevenue));
        metricBox(mg + bW + 5,     y, bW, 'TOTAL INVESTMENT',     formatCurrencyFull(selectedOutlet.totalInvestment));
        metricBox(mg + (bW + 5)*2, y, bW, 'AVG TRANSACTION VALUE', formatCurrencyFull(outletATV));
        y += 32;

        // ATV vs network comparison banner
        const aboveAvg = outletATV >= networkATV;
        doc.setFillColor(...(aboveAvg ? C.green50 : C.red50));
        doc.roundedRect(mg, y, pW - mg * 2, 12, 2, 2, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...(aboveAvg ? C.green700 : C.red600));
        doc.text(
          `${aboveAvg ? 'Above' : 'Below'} Network Average  |  Network ATV: ${formatCurrencyFull(networkATV)}`,
          mg + 4, y + 8
        );
        y += 20;

        sectionLabel('SALESMAN LEADERBOARD', y);
        y += 4;
        autoTable(doc, {
          startY: y,
          head: [['Rank', 'Salesman', 'Total Revenue (RM)']],
          body: salesmanLeaderboard.map((s, i) => [`#${i + 1}`, s.name, formatCurrencyFull(s.sales)]),
          margin: { left: mg, right: mg },
          headStyles: { fillColor: C.dark, textColor: C.white, fontStyle: 'bold', fontSize: 9, cellPadding: 4 },
          bodyStyles: { fontSize: 9, textColor: C.dark, cellPadding: 3.5 },
          alternateRowStyles: { fillColor: C.slate50 },
          columnStyles: { 0: { cellWidth: 20, halign: 'center' }, 2: { halign: 'right' } },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.row.index < 3 && data.column.index === 0) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.textColor = [C.amber, C.slate400, C.orange][data.row.index];
            }
          },
        });
        y = (doc as any).lastAutoTable.finalY + 10;

        if (y > pH - 80) { doc.addPage(); y = 20; }

        sectionLabel('BRAND PERFORMANCE', y);
        y += 4;
        const halfW = (pW - mg * 2 - 5) / 2;

        autoTable(doc, {
          startY: y, tableWidth: halfW,
          head: [['TOP 3 BRANDS', 'Revenue (RM)']],
          body: brandSuccess.top.map((b, i) => [`${i + 1}. ${b.name}`, formatCurrencyFull(b.sales)]),
          margin: { left: mg },
          headStyles: { fillColor: C.emerald, textColor: C.white, fontStyle: 'bold', fontSize: 9, cellPadding: 4 },
          bodyStyles: { fontSize: 8.5, textColor: C.dark, cellPadding: 3.5 },
          alternateRowStyles: { fillColor: C.green50 },
          columnStyles: { 1: { halign: 'right' } },
        });
        const leftY = (doc as any).lastAutoTable.finalY;

        autoTable(doc, {
          startY: y, tableWidth: halfW,
          head: [['BOTTOM 3 BRANDS', 'Revenue (RM)']],
          body: brandSuccess.bottom.map((b, i) => [`${i + 1}. ${b.name}`, formatCurrencyFull(b.sales)]),
          margin: { left: mg + halfW + 5 },
          headStyles: { fillColor: C.amber, textColor: C.white, fontStyle: 'bold', fontSize: 9, cellPadding: 4 },
          bodyStyles: { fontSize: 8.5, textColor: C.dark, cellPadding: 3.5 },
          alternateRowStyles: { fillColor: C.amber50 },
          columnStyles: { 1: { halign: 'right' } },
        });
        y = Math.max(leftY, (doc as any).lastAutoTable.finalY) + 10;
      }

      drawFooter();

      // ── Save: browser or Capacitor native ────────────────────────────
      const isNative = typeof window !== 'undefined'
        && !!(window as any)?.Capacitor
        && ((window as any).Capacitor.isNativePlatform?.() || (window as any).Capacitor.isNative);

      if (isNative) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const base64 = doc.output('datauristring').split(',')[1];
        await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
        const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
        await Share.share({ title: filename, files: [uri], dialogTitle: 'Save or Share Report' });
      } else {
        doc.save(filename);
      }

    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading || !outlets) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (outlets.length === 0) {
    const hasError = systemStatus?.includes('Error');
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="bg-slate-100 p-6 rounded-full mb-4">
          <Package size={48} className="text-slate-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {hasError ? 'Connection Failed' : 'No Data Available'}
        </h2>
        <p className="text-slate-500 max-w-md mb-8">
          {hasError
            ? 'Unable to connect to the backend server. Please check your network connection and try again.'
            : 'Connecting to the backend system...'}
        </p>
        <div className="flex gap-3">
          {hasError && (
            <button
              onClick={refetch}
              className="flex items-center gap-2 px-6 py-3 bg-[#0f172a] text-white rounded-[24px] hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 font-medium"
            >
              Retry
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-[24px] hover:bg-slate-50 transition-colors shadow-sm font-medium"
          >
            <LogOut size={18} />
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto relative pb-12">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
              {selectedOutlet ? selectedOutlet.code : 'Global Overview'}
            </h1>
            <p className="text-slate-500 font-medium mt-1">
              {selectedOutlet 
                  ? 'Branch Performance & Analytics' 
                  : `Network Performance • Updated ${lastUpdated || 'Just now'}`}
            </p>
          </div>
          
          <div className="flex gap-3">
            {selectedOutlet && (
              <>
                <button
                  onClick={handleDownloadReport}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#0f172a] text-white rounded-[18px] hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 font-medium cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isExporting
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Download size={18} />}
                  {isExporting ? 'Exporting...' : 'Export PDF'}
                </button>
                <button 
                  onClick={() => setSelectedOutletCode(null)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-[18px] text-slate-600 hover:bg-slate-50 transition-colors shadow-sm font-medium cursor-pointer active:scale-95"
                >
                  <ArrowLeft size={18} />
                  Back
                </button>
              </>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {!selectedOutlet ? (
            <motion.div 
              key="global"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Network Revenue Hero Card */}
              <div className="bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-8 md:p-10 rounded-[32px] shadow-2xl shadow-slate-900/20 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5 transform translate-x-1/4 -translate-y-1/4">
                  <DollarSign size={300} />
                </div>
                <div className="relative z-10">
                  <h3 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-widest">Total Network Revenue</h3>
                  <div className="flex items-baseline gap-4">
                    <p className="text-5xl md:text-7xl font-bold tracking-tight">{formatCurrencyFull(totalNetworkRevenue)}</p>
                  </div>
                  <div className="mt-8 flex flex-wrap gap-8 md:gap-16">
                     <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Network ATV</p>
                        <p className="text-2xl font-bold">{formatCurrencyFull(networkATV)}</p>
                     </div>
                     <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Total Investment</p>
                        <p className="text-2xl font-bold">{formatCurrencyCompact(totalNetworkInvestment)}</p>
                     </div>
                     <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Transactions</p>
                        <p className="text-2xl font-bold">{totalNetworkTransactions.toLocaleString()}</p>
                     </div>
                     <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Active Outlets</p>
                        <p className="text-2xl font-bold">{outlets.length}</p>
                     </div>
                  </div>
                </div>
              </div>

              {/* Outlet Grid */}
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Package className="text-slate-400" />
                  Branch Performance
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {outlets.map((outlet, i) => {
                    const topSalesman = Object.entries(outlet.salesmen).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0];
                    const topBrand = Object.entries(outlet.brands).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0];
                    return (
                      <div
                        key={outlet.code}
                        onClick={() => setSelectedOutletCode(outlet.code)}
                        className="bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 hover:border-slate-300 transition-all cursor-pointer group relative overflow-hidden hover:shadow-xl hover:-translate-y-1 flex flex-col h-full"
                      >
                        {i < 3 && (
                          <span className={`absolute top-4 left-4 text-xs font-bold px-2 py-0.5 rounded-full ${
                            i === 0 ? 'bg-amber-100 text-amber-700' :
                            i === 1 ? 'bg-slate-200 text-slate-600' :
                            'bg-orange-100 text-orange-700'
                          }`}>#{i + 1}</span>
                        )}
                        <div className="flex justify-between items-start mb-4">
                           <h3 className={`font-bold text-slate-900 truncate text-2xl tracking-tight ${i < 3 ? 'mt-5' : ''}`}>{outlet.code}</h3>
                           <div className={`p-2 bg-slate-50 rounded-full group-hover:bg-[#0f172a] group-hover:text-white transition-colors duration-300 ${i < 3 ? 'mt-5' : ''}`}>
                              <ChevronRight size={20} />
                           </div>
                        </div>

                        <div className="mb-4">
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Revenue</p>
                          <p className="text-3xl font-bold text-slate-900 tracking-tight">
                            {formatCurrencyCompact(outlet.totalRevenue)}
                          </p>
                        </div>

                        <div className="flex flex-col gap-1.5 mb-4">
                          {topSalesman && (
                            <div className="flex items-center gap-2">
                              <Users size={12} className="text-slate-400 shrink-0" />
                              <span className="text-xs text-slate-500 truncate font-medium">{topSalesman}</span>
                            </div>
                          )}
                          {topBrand && (
                            <div className="flex items-center gap-2">
                              <Package size={12} className="text-slate-400 shrink-0" />
                              <span className="text-xs text-slate-500 truncate font-medium">{topBrand}</span>
                            </div>
                          )}
                        </div>

                        <div className="mt-auto pt-4 border-t border-slate-50">
                          <div className="flex items-baseline justify-between text-slate-500 mb-2">
                            <span className="text-xs font-bold uppercase tracking-wider">Investment</span>
                            <span className="text-sm font-semibold text-slate-700">{formatCurrencyCompact(outlet.totalInvestment)}</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-slate-800"
                              style={{ width: `${Math.min((outlet.totalInvestment / outlet.totalRevenue) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Network Top Brands */}
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Award className="text-slate-400" />
                  Network Top Brands
                </h2>
                <div className="bg-white rounded-[24px] shadow-sm border border-slate-100 p-6 md:p-8">
                  <div className="space-y-5">
                    {networkTopBrands.map((brand, i) => {
                      const pct = networkTopBrands[0] ? (brand.sales / networkTopBrands[0].sales) * 100 : 0;
                      return (
                        <div key={i} className="flex items-center gap-4">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            i === 0 ? 'bg-amber-100 text-amber-700' :
                            i === 1 ? 'bg-slate-200 text-slate-600' :
                            i === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-slate-100 text-slate-500'
                          }`}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="text-sm font-bold text-slate-900 truncate">{brand.name}</span>
                              <span className="text-sm font-bold text-slate-700 shrink-0 ml-4">{formatCurrencyCompact(brand.sales)}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-slate-800 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="detail"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid gap-8 lg:grid-cols-3"
            >
              {/* Main Content - Salesman Leaderboard */}
              <div className="lg:col-span-2 space-y-6">
                {/* Hero Header for Detail View */}
                <div className="bg-[#0f172a] p-8 rounded-[32px] shadow-lg text-white flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
                  <div className="absolute -right-10 -bottom-10 opacity-10">
                    <TrendingUp size={200} />
                  </div>
                  <div className="relative z-10">
                    <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-1">Total Revenue</p>
                    <h2 className="text-5xl font-bold tracking-tight">{formatCurrencyFull(selectedOutlet.totalRevenue)}</h2>
                    <div className="flex gap-6 mt-4">
                      <div>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Transactions</p>
                        <p className="text-xl font-bold text-slate-200">{selectedOutlet.transactionCount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Salesmen</p>
                        <p className="text-xl font-bold text-slate-200">{Object.keys(selectedOutlet.salesmen).length}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-left md:text-right relative z-10">
                    <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-1">Outlet Code</p>
                    <h2 className="text-4xl font-bold text-slate-200">{selectedOutlet.code}</h2>
                  </div>
                </div>

                <div className="bg-white p-6 md:p-8 rounded-[32px] shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <Users className="text-slate-400" size={24} />
                      Salesman Leaderboard
                    </h2>
                    <div className="text-xs font-medium px-3 py-1 bg-slate-100 text-slate-500 rounded-full">
                      Click row for details
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="pb-4 font-bold text-slate-400 text-xs uppercase tracking-wider w-16">Rank</th>
                          <th className="pb-4 font-bold text-slate-400 text-xs uppercase tracking-wider">Salesman ID</th>
                          <th className="pb-4 font-bold text-slate-400 text-xs uppercase tracking-wider text-right">Total Revenue</th>
                          <th className="pb-4 font-bold text-slate-400 text-xs uppercase tracking-wider w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {salesmanLeaderboard.map((salesman, i) => (
                          <tr
                            key={i}
                            onClick={() => setSelectedSalesmanId(prev => prev === salesman.name ? null : salesman.name)}
                            className="group hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <td className="py-5 font-bold text-slate-400">#{i + 1}</td>
                            <td className="py-5">
                              <div className="flex items-center gap-3 font-bold text-slate-900">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                  i === 0 ? 'bg-amber-100 text-amber-700' :
                                  i === 1 ? 'bg-slate-200 text-slate-600' :
                                  i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {salesman.name.substring(0, 2).toUpperCase()}
                                </div>
                                <span>{salesman.name}</span>
                                {i < 3 && <Medal size={16} className={
                                  i === 0 ? 'text-amber-500' :
                                  i === 1 ? 'text-slate-400' : 'text-orange-500'
                                } />}
                              </div>
                              <div className="mt-1.5 ml-11 h-1 w-32 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-slate-300 rounded-full transition-all"
                                  style={{ width: `${salesmanLeaderboard[0] ? (salesman.sales / salesmanLeaderboard[0].sales) * 100 : 0}%` }}
                                />
                              </div>
                            </td>
                            <td className="py-5 text-slate-900 font-bold text-right text-lg">
                              {formatCurrencyFull(salesman.sales)}
                            </td>
                            <td className="py-5 text-slate-400 text-right">
                              <ChevronRight size={20} className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Sidebar - Stats & Brand Success */}
              <div className="space-y-6">
                {/* Outlet ATV Card */}
                <div className="bg-white p-6 md:p-8 rounded-[32px] shadow-sm border border-slate-100">
                   <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                     <Zap className="text-amber-500" size={24} />
                     Efficiency (ATV)
                   </h2>
                   <p className="text-4xl font-bold text-slate-900 mb-2 tracking-tight">{formatCurrencyFull(outletATV)}</p>
                   <p className="text-sm text-slate-500 font-medium">Average Transaction Value</p>
                   <div className="mt-6 pt-6 border-t border-slate-50 flex justify-between items-center text-xs">
                      <span className="text-slate-500 font-medium">Network Avg: {formatCurrencyCompact(networkATV)}</span>
                      <span className={`font-bold px-2 py-1 rounded-md ${outletATV >= networkATV ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {outletATV >= networkATV ? '+Above Avg' : '-Below Avg'}
                      </span>
                   </div>
                </div>

                {/* Brand Success Card */}
                <div className="bg-white p-6 md:p-8 rounded-[32px] shadow-sm border border-slate-100">
                  <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <Award className="text-slate-400" size={24} />
                    Brand Success
                  </h2>
                  
                  <div className="space-y-8">
                    <div>
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-4">Top 3 Brands</p>
                      <div className="space-y-5">
                        {brandSuccess.top.map((brand, i) => {
                          const percentage = (brand.sales / selectedOutlet.totalRevenue) * 100;
                          return (
                            <div key={i}>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-bold text-slate-900 truncate max-w-[120px]">{brand.name}</span>
                                <span className="text-sm font-bold text-slate-900">{formatCurrencyFull(brand.sales)}</span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full bg-emerald-500" 
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-6 border-t border-slate-50">
                      <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-4">Bottom 3 Brands</p>
                      <div className="space-y-3">
                        {brandSuccess.bottom.map((brand, i) => (
                          <div key={i} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg transition-colors">
                            <span className="text-sm font-medium text-slate-500 truncate max-w-[120px]">{brand.name}</span>
                            <span className="text-sm font-bold text-slate-500">{formatCurrencyFull(brand.sales)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Spending Power / Investment Summary */}
                <div className="bg-white p-6 md:p-8 rounded-[32px] shadow-sm border border-slate-100">
                  <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <TrendingUp className="text-slate-400" size={24} />
                    Spending Power
                  </h2>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm text-slate-500 font-medium">Total Stock Investment</p>
                      <div className="group relative">
                        <Info size={14} className="text-slate-400 cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          Total current asset value in stock
                        </div>
                      </div>
                    </div>
                    <p className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">{formatCurrencyFull(selectedOutlet.totalInvestment)}</p>
                    
                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-[#0f172a]" 
                        style={{ width: '100%' }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-3 text-right font-medium">100% Utilized (Cost Basis)</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Salesman Slide-Over Panel */}
        <AnimatePresence>
          {selectedSalesman && salesmanMetrics && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedSalesmanId(null)}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
              />
              
              {/* Slide-Over Panel */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl z-50 overflow-y-auto border-l border-slate-100"
              >
                <div className="p-8">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-10">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-3xl font-bold text-slate-900">
                          {selectedSalesman.name}
                        </h2>
                        {salesmanMetrics.isTop1 && (
                          <div className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                            <Trophy size={12} />
                            Top Performer
                          </div>
                        )}
                      </div>
                      <p className="text-slate-500 font-medium">Salesman Performance Drill-Down</p>
                    </div>
                    <button 
                      onClick={() => setSelectedSalesmanId(null)}
                      className="p-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                    >
                      <X size={24} className="text-slate-400" />
                    </button>
                  </div>

                  {/* Key Metrics Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-10">
                    <div className="p-6 bg-slate-50 rounded-[24px] border border-slate-100">
                      <p className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">Total Revenue</p>
                      <p className="text-2xl font-bold text-slate-900 tracking-tight">{formatCurrencyFull(selectedSalesman.totalRevenue)}</p>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-[24px] border border-slate-100">
                      <p className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">Outlet Rank</p>
                      <p className="text-2xl font-bold text-slate-900 tracking-tight">#{salesmanMetrics.rank}</p>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-[24px] border border-slate-100">
                      <p className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">Revenue Share</p>
                      <p className="text-2xl font-bold text-slate-900 tracking-tight">
                        {selectedOutlet ? ((selectedSalesman.totalRevenue / selectedOutlet.totalRevenue) * 100).toFixed(1) : '0'}%
                      </p>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-[24px] border border-slate-100">
                      <p className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">Best Day</p>
                      <p className="text-2xl font-bold text-slate-900 tracking-tight">{salesmanMetrics.bestDay}</p>
                    </div>
                  </div>

                  {/* 12-Month Performance List */}
                  <div className="mb-10">
                    <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2 text-lg">
                      <Calendar size={20} className="text-slate-400" />
                      12-Month Performance
                    </h3>
                    <div className="space-y-3">
                      {salesmanMetrics.monthlyData.map((data, i) => (
                        <div key={i} className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-[20px] transition-colors border border-transparent hover:border-slate-100 group">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 group-hover:bg-white group-hover:shadow-sm transition-all">
                              {data.month.split('-')[1]}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{data.monthName}</p>
                              <p className="text-xs text-slate-500 truncate max-w-[120px]">Top: {data.topBrand}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-slate-900 text-sm">{formatCurrencyFull(data.revenue)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Overall Brand Ranking */}
                  <div>
                    <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2 text-lg">
                      <Award size={20} className="text-slate-400" />
                      Overall Brand Ranking
                    </h3>
                    <div className="space-y-4">
                      {salesmanMetrics.topBrands.map((brand, i) => (
                        <div key={i} className="flex items-center justify-between p-2">
                          <div className="flex items-center gap-4">
                            <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                              i < 3 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {i + 1}
                            </span>
                            <span className="text-sm font-bold text-slate-900">{brand.name}</span>
                          </div>
                          <span className="text-sm font-bold text-slate-900">{formatCurrencyFull(brand.sales)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
