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
    code: 'NY-FLAGSHIP',
    name: 'New York Flagship Store',
    totalRevenue: 428500,
    totalInvestment: 214250,
    transactionCount: 87,
    salesmen: { 'Michael Chen': 182000, 'Sarah Jenkins': 156500, 'David Rodriguez': 90000 },
    brands: { Rolex: 182000, 'Tag Heuer': 156500, Seiko: 90000 },
    salesmanProfiles: {
      'Michael Chen': {
        name: 'Michael Chen', totalRevenue: 182000,
        brands: { Rolex: 120000, 'Tag Heuer': 62000 },
        monthlyData: monthlyRevenue({ Rolex: 10000, 'Tag Heuer': 5167 }, 1),
        dailyRevenue: dailyRevenue(182000),
        skills: ['Luxury Consultation', 'Clienteling', 'Horology Expert'],
      },
      'Sarah Jenkins': {
        name: 'Sarah Jenkins', totalRevenue: 156500,
        brands: { 'Tag Heuer': 94500, Seiko: 62000 },
        monthlyData: monthlyRevenue({ 'Tag Heuer': 7875, Seiko: 5167 }, 1),
        dailyRevenue: dailyRevenue(156500),
        skills: ['VIP Handling', 'Negotiation', 'Visual Merchandising'],
      },
      'David Rodriguez': {
        name: 'David Rodriguez', totalRevenue: 90000,
        brands: { Seiko: 90000 },
        monthlyData: monthlyRevenue({ Seiko: 7500 }, 1),
        dailyRevenue: dailyRevenue(90000),
        skills: ['Inventory Management', 'Customer Service', 'After-Sales Support'],
      },
    },
  },
  {
    code: 'LA-BOUTIQUE',
    name: 'Los Angeles Boutique',
    totalRevenue: 312800,
    totalInvestment: 156400,
    transactionCount: 64,
    salesmen: { 'Emily Wong': 145000, 'James Smith': 167800 },
    brands: { Tissot: 145000, Omega: 167800 },
    salesmanProfiles: {
      'Emily Wong': {
        name: 'Emily Wong', totalRevenue: 145000,
        brands: { Tissot: 145000 },
        monthlyData: monthlyRevenue({ Tissot: 12083 }, 1),
        dailyRevenue: dailyRevenue(145000),
        skills: ['Trend Analysis', 'Social Media Sales', 'Bilingual (Mandarin)'],
      },
      'James Smith': {
        name: 'James Smith', totalRevenue: 167800,
        brands: { Omega: 167800 },
        monthlyData: monthlyRevenue({ Omega: 13983 }, 1),
        dailyRevenue: dailyRevenue(167800),
        skills: ['Vintage Watches', 'Appraisals', 'High-Ticket Closing'],
      },
    },
  },
  {
    code: 'CHI-PREMIUM',
    name: 'Chicago Premium Retail',
    totalRevenue: 276400,
    totalInvestment: 138200,
    transactionCount: 72,
    salesmen: { 'Jessica Davis': 98400, 'Robert Wilson': 112000, 'Amanda Taylor': 66000 },
    brands: { Casio: 98400, Orient: 112000, Seiko: 66000 },
    salesmanProfiles: {
      'Jessica Davis': {
        name: 'Jessica Davis', totalRevenue: 98400,
        brands: { Casio: 98400 },
        monthlyData: monthlyRevenue({ Casio: 8200 }, 1),
        dailyRevenue: dailyRevenue(98400),
        skills: ['Volume Sales', 'Product Demonstration', 'Youth Market'],
      },
      'Robert Wilson': {
        name: 'Robert Wilson', totalRevenue: 112000,
        brands: { Orient: 112000 },
        monthlyData: monthlyRevenue({ Orient: 9333 }, 1),
        dailyRevenue: dailyRevenue(112000),
        skills: ['Mechanical Movements', 'Brand Storytelling', 'Customer Retention'],
      },
      'Amanda Taylor': {
        name: 'Amanda Taylor', totalRevenue: 66000,
        brands: { Seiko: 66000 },
        monthlyData: monthlyRevenue({ Seiko: 5500 }, 1),
        dailyRevenue: dailyRevenue(66000),
        skills: ['Point of Sale Systems', 'Restocking', 'Greeting'],
      },
    },
  },
  {
    code: 'MIA-RESORT',
    name: 'Miami Resort Outlet',
    totalRevenue: 198600,
    totalInvestment: 99300,
    transactionCount: 51,
    salesmen: { 'Carlos Martinez': 110000, 'Linda Brown': 88600 },
    brands: { Tissot: 110000, Casio: 88600 },
    salesmanProfiles: {
      'Carlos Martinez': {
        name: 'Carlos Martinez', totalRevenue: 110000,
        brands: { Tissot: 110000 },
        monthlyData: monthlyRevenue({ Tissot: 9167 }, 1),
        dailyRevenue: dailyRevenue(110000),
        skills: ['Tourism Sales', 'Bilingual (Spanish)', 'Quick Conversions'],
      },
      'Linda Brown': {
        name: 'Linda Brown', totalRevenue: 88600,
        brands: { Casio: 88600 },
        monthlyData: monthlyRevenue({ Casio: 7383 }, 1),
        dailyRevenue: dailyRevenue(88600),
        skills: ['G-Shock Specialist', 'Promotions', 'Cross-selling'],
      },
    },
  },
  {
    code: 'DAL-GALLERIA',
    name: 'Dallas Galleria Branch',
    totalRevenue: 154200,
    totalInvestment: 77100,
    transactionCount: 39,
    salesmen: { 'Thomas Anderson': 82000, 'Kevin White': 72200 },
    brands: { Seiko: 82000, Orient: 72200 },
    salesmanProfiles: {
      'Thomas Anderson': {
        name: 'Thomas Anderson', totalRevenue: 82000,
        brands: { Seiko: 82000 },
        monthlyData: monthlyRevenue({ Seiko: 6833 }, 1),
        dailyRevenue: dailyRevenue(82000),
        skills: ['Corporate Gifts', 'B2B Sales', 'Lead Generation'],
      },
      'Kevin White': {
        name: 'Kevin White', totalRevenue: 72200,
        brands: { Orient: 72200 },
        monthlyData: monthlyRevenue({ Orient: 6017 }, 1),
        dailyRevenue: dailyRevenue(72200),
        skills: ['Store Operations', 'Display Setup', 'Training'],
      },
    },
  },
];