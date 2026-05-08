import { OutletSummary } from '@/app/dashboard/data-context';

const months = ['2024-01','2024-02','2024-03','2024-04','2024-05','2024-06','2024-07','2024-08','2024-09','2024-10','2024-11','2024-12'];

function monthlyRevenue(brands: Record<string, number>, factor: number) {
  return Object.fromEntries(
    months.map((m, i) => [m, {
      revenue: Object.values(brands).reduce((a, b) => a + b, 0) * factor * (0.7 + i * 0.05),
      brands: Object.fromEntries(Object.entries(brands).map(([k, v]) => [k, v * factor * (0.7 + i * 0.05)])),
    }])
  );
}

function dailyRevenue(total: number) {
  const days: Record<string, number> = {};
  for (let d = 1; d <= 28; d++) {
    days[`2024-12-${String(d).padStart(2, '0')}`] = +(total / 30 * (0.5 + Math.random())).toFixed(2);
  }
  return days;
}

export const DEMO_DATA: OutletSummary[] = [
  {
    code: 'OUT001',
    name: 'Branch OUT001',
    totalRevenue: 428500,
    totalInvestment: 214250,
    transactionCount: 87,
    salesmen: { S001: 182000, S002: 156500, S003: 90000 },
    brands: { Rolex: 182000, 'Tag Heuer': 156500, Seiko: 90000 },
    salesmanProfiles: {
      S001: {
        name: 'S001', totalRevenue: 182000,
        brands: { Rolex: 120000, 'Tag Heuer': 62000 },
        monthlyData: monthlyRevenue({ Rolex: 10000, 'Tag Heuer': 5167 }, 1),
        dailyRevenue: dailyRevenue(182000),
      },
      S002: {
        name: 'S002', totalRevenue: 156500,
        brands: { 'Tag Heuer': 94500, Seiko: 62000 },
        monthlyData: monthlyRevenue({ 'Tag Heuer': 7875, Seiko: 5167 }, 1),
        dailyRevenue: dailyRevenue(156500),
      },
      S003: {
        name: 'S003', totalRevenue: 90000,
        brands: { Seiko: 90000 },
        monthlyData: monthlyRevenue({ Seiko: 7500 }, 1),
        dailyRevenue: dailyRevenue(90000),
      },
    },
  },
  {
    code: 'OUT002',
    name: 'Branch OUT002',
    totalRevenue: 312800,
    totalInvestment: 156400,
    transactionCount: 64,
    salesmen: { S004: 145000, S005: 167800 },
    brands: { Tissot: 145000, Omega: 167800 },
    salesmanProfiles: {
      S004: {
        name: 'S004', totalRevenue: 145000,
        brands: { Tissot: 145000 },
        monthlyData: monthlyRevenue({ Tissot: 12083 }, 1),
        dailyRevenue: dailyRevenue(145000),
      },
      S005: {
        name: 'S005', totalRevenue: 167800,
        brands: { Omega: 167800 },
        monthlyData: monthlyRevenue({ Omega: 13983 }, 1),
        dailyRevenue: dailyRevenue(167800),
      },
    },
  },
  {
    code: 'OUT003',
    name: 'Branch OUT003',
    totalRevenue: 276400,
    totalInvestment: 138200,
    transactionCount: 72,
    salesmen: { S006: 98400, S007: 112000, S008: 66000 },
    brands: { Casio: 98400, Orient: 112000, Seiko: 66000 },
    salesmanProfiles: {
      S006: {
        name: 'S006', totalRevenue: 98400,
        brands: { Casio: 98400 },
        monthlyData: monthlyRevenue({ Casio: 8200 }, 1),
        dailyRevenue: dailyRevenue(98400),
      },
      S007: {
        name: 'S007', totalRevenue: 112000,
        brands: { Orient: 112000 },
        monthlyData: monthlyRevenue({ Orient: 9333 }, 1),
        dailyRevenue: dailyRevenue(112000),
      },
      S008: {
        name: 'S008', totalRevenue: 66000,
        brands: { Seiko: 66000 },
        monthlyData: monthlyRevenue({ Seiko: 5500 }, 1),
        dailyRevenue: dailyRevenue(66000),
      },
    },
  },
  {
    code: 'OUT004',
    name: 'Branch OUT004',
    totalRevenue: 198600,
    totalInvestment: 99300,
    transactionCount: 51,
    salesmen: { S009: 110000, S010: 88600 },
    brands: { Tissot: 110000, Casio: 88600 },
    salesmanProfiles: {
      S009: {
        name: 'S009', totalRevenue: 110000,
        brands: { Tissot: 110000 },
        monthlyData: monthlyRevenue({ Tissot: 9167 }, 1),
        dailyRevenue: dailyRevenue(110000),
      },
      S010: {
        name: 'S010', totalRevenue: 88600,
        brands: { Casio: 88600 },
        monthlyData: monthlyRevenue({ Casio: 7383 }, 1),
        dailyRevenue: dailyRevenue(88600),
      },
    },
  },
  {
    code: 'OUT005',
    name: 'Branch OUT005',
    totalRevenue: 154200,
    totalInvestment: 77100,
    transactionCount: 39,
    salesmen: { S011: 82000, S012: 72200 },
    brands: { Seiko: 82000, Orient: 72200 },
    salesmanProfiles: {
      S011: {
        name: 'S011', totalRevenue: 82000,
        brands: { Seiko: 82000 },
        monthlyData: monthlyRevenue({ Seiko: 6833 }, 1),
        dailyRevenue: dailyRevenue(82000),
      },
      S012: {
        name: 'S012', totalRevenue: 72200,
        brands: { Orient: 72200 },
        monthlyData: monthlyRevenue({ Orient: 6017 }, 1),
        dailyRevenue: dailyRevenue(72200),
      },
    },
  },
];
