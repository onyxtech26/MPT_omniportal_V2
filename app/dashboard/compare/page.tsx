'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { GitCompareArrows, TrendingUp, TrendingDown, Sparkles, CircleSlash } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useIsMobile } from '@/hooks/use-mobile';
import { FileSlot } from '@/components/file-slot';
import { listReports, loadReport, type ReportMeta } from '@/lib/csvStore';
import { missingColumns, normalizeRecords, parseCsvRecords, type Row } from '@/lib/salesData';
import {
  compareYears, compareBreakdown, revenueChange, pctChange, marginPct, avgSale, profit, yearsIn,
  type Breakdown, type Pair, type LineTotals,
} from '@/lib/compare';

/**
 * Compare — last year beside this year: the network, every outlet, and each
 * outlet's brands and salespeople.
 *
 * Takes its own two reports, picked here, and never touches the dashboard's
 * loaded one, so the two features cannot get in each other's way. Totals come
 * from the same code as the other dashboard tabs (lib/compare.ts), so the
 * figures match them. The Meeting Agenda follows the POS tool's own rules and
 * can differ slightly.
 */

type Slot = 'prev' | 'curr';
interface Picked { name: string; rows: Row[]; year: string; detail: string }

const money = (n: number) => `RM ${Math.round(n).toLocaleString('en-MY')}`;
const signedMoney = (n: number) => `${n >= 0 ? '+' : '−'}RM ${Math.abs(Math.round(n)).toLocaleString('en-MY')}`;
const count = (n: number) => Math.round(n).toLocaleString('en-MY');
const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-MY', { month: 'short' });

/** Parse one POS export into rows; the year is the latest one it covers. */
function readReport(name: string, text: string): Picked {
  const records = parseCsvRecords(text);
  const missing = missingColumns(Object.keys(records[0] ?? {}));
  if (missing.length) throw new Error(`not a POS sales export (missing ${missing.join(', ')}).`);
  const rows = normalizeRecords(records);
  const years = yearsIn(rows);
  if (!years.length) throw new Error('no dated sales lines in this file.');
  const year = years[years.length - 1];
  const months = rows.filter((r) => r.month?.startsWith(year)).map((r) => r.month!).sort();
  const outlets = new Set(rows.map((r) => r.com_unit)).size;
  return {
    name, rows, year,
    detail: `${year} · ${monthName(months[0])}–${monthName(months[months.length - 1])} · ${outlets} outlets`,
  };
}

/** Lets the spinner paint before a long synchronous parse. */
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

function ChangeBadge({ prev, curr, points = false }: { prev: number | null | undefined; curr: number | null | undefined; points?: boolean }) {
  if (points) {
    if (prev == null || curr == null) return <span className="text-slate-400">—</span>;
    const d = curr - prev;
    return <span className={`font-bold ${d >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1)} pts</span>;
  }
  const pct = pctChange(prev, curr);
  if (pct == null) return <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">New</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 font-bold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      {up ? '+' : '−'}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function StatCard({ label, prev, curr, format, points = false }: {
  label: string; prev: number; curr: number; format: (n: number) => string; points?: boolean;
}) {
  return (
    <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-5 max-sm:p-4">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-2xl max-sm:text-lg font-bold text-slate-900 tracking-tight mt-2 whitespace-nowrap">{format(curr)}</p>
      {/* Phones: "was" and the change stack, so neither wraps mid-figure. */}
      <div className="flex items-center justify-between gap-2 mt-1 text-sm max-sm:flex-col max-sm:items-start max-sm:gap-0.5 max-sm:text-xs">
        <span className="text-slate-500 font-medium whitespace-nowrap">was {format(prev)}</span>
        <ChangeBadge prev={prev} curr={curr} points={points} />
      </div>
    </div>
  );
}

export default function ComparePage() {
  const isMobile = useIsMobile();
  const [files, setFiles] = useState<Record<Slot, Picked | null>>({ prev: null, curr: null });
  const [busy, setBusy] = useState<Record<Slot, boolean>>({ prev: false, curr: false });
  const [slotError, setSlotError] = useState<Record<Slot, string>>({ prev: '', curr: '' });
  const [saved, setSaved] = useState<ReportMeta[]>([]);

  useEffect(() => {
    listReports().then(setSaved).catch(() => setSaved([]));
  }, []);

  const readInto = async (slot: Slot, name: string, getText: () => Promise<string | null>) => {
    setBusy((b) => ({ ...b, [slot]: true }));
    setSlotError((e) => ({ ...e, [slot]: '' }));
    await nextFrame();
    try {
      const text = await getText();
      if (text == null) throw new Error('that saved report is no longer on this computer.');
      const picked = readReport(name, text);
      setFiles((f) => ({ ...f, [slot]: picked }));
    } catch (err) {
      setFiles((f) => ({ ...f, [slot]: null }));
      setSlotError((e) => ({ ...e, [slot]: `${name}: ${err instanceof Error ? err.message : 'could not be read.'}` }));
    } finally {
      setBusy((b) => ({ ...b, [slot]: false }));
    }
  };

  const slotProps = (slot: Slot) => ({
    accept: '.csv',
    allowSaved: true,
    saved,
    loaded: files[slot] && { name: files[slot].name, detail: files[slot].detail },
    busy: busy[slot],
    error: slotError[slot],
    onFile: (f: File) => {
      if (!f.name.toLowerCase().endsWith('.csv')) {
        setSlotError((e) => ({ ...e, [slot]: `${f.name}: choose the CSV export from the POS.` }));
        return;
      }
      readInto(slot, f.name, () => f.text());
    },
    onSaved: (id: number) => {
      const meta = saved.find((r) => r.id === id);
      readInto(slot, meta?.fileName ?? 'Saved report', async () => (await loadReport(id))?.text ?? null);
    },
    onClear: () => { setFiles((f) => ({ ...f, [slot]: null })); setSlotError((e) => ({ ...e, [slot]: '' })); },
  });

  const prev = files.prev?.year ?? '';
  const curr = files.curr?.year ?? '';
  const yearsLookWrong = Boolean(prev && curr && prev >= curr);

  const cmp = useMemo(() => {
    if (!files.prev || !files.curr || yearsLookWrong) return null;
    return compareYears(files.prev.rows, files.curr.rows, prev, curr);
  }, [files, prev, curr, yearsLookWrong]);

  const [kind, setKindState] = useState<Breakdown>('brand');
  const [scope, setScopeState] = useState<string>('ALL');
  const [showAll, setShowAll] = useState(false);
  const breakdownRef = useRef<HTMLDivElement>(null);
  // A different list starts collapsed again.
  const setKind = (k: Breakdown) => { setKindState(k); setShowAll(false); };
  const setScope = (s: string) => { setScopeState(s); setShowAll(false); };

  const outletRows = useMemo(
    () => (cmp ? [...cmp.outlets].sort((a, b) => revenueChange(b) - revenueChange(a)) : []),
    [cmp],
  );
  const lines = useMemo(
    () => (cmp ? compareBreakdown(cmp, kind, scope).sort((a, b) => revenueChange(b) - revenueChange(a)) : []),
    [cmp, kind, scope],
  );

  const net = cmp?.network;
  const chartData = (cmp?.outlets ?? [])
    .slice()
    .sort((a, b) => (b.curr?.revenue ?? 0) - (a.curr?.revenue ?? 0))
    .map((o) => ({ outlet: o.key, [prev]: Math.round(o.prev?.revenue ?? 0), [curr]: Math.round(o.curr?.revenue ?? 0) }));
  const gains = lines.filter((l) => revenueChange(l) > 0).slice(0, 5);
  const drops = [...lines].reverse().filter((l) => revenueChange(l) < 0).slice(0, 5);
  const added = lines.filter((l) => !l.prev);
  const gone = lines.filter((l) => !l.curr);
  const shown = showAll ? lines : lines.slice(0, 30);
  const kindLabel = kind === 'brand' ? 'brand' : 'salesperson';
  const kindPlural = kind === 'brand' ? 'brands' : 'salespeople';

  const pickOutlet = (code: string) => {
    setScope(code);
    breakdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <header>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
          <GitCompareArrows className="text-slate-400" size={36} />
          Compare
        </h1>
        <p className="text-slate-500 font-medium mt-1">
          Pick last year&apos;s and this year&apos;s POS reports to see them side by side over the same dates: the network,
          each outlet, and its brands and salespeople. The reports are read on this computer and never uploaded.
        </p>
      </header>

      {/* The two reports, and the window they are compared over */}
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-5 md:p-6 space-y-4">
        <div className="grid md:grid-cols-2 gap-5">
          <FileSlot label="Last year's report" hint="POS export (CSV) for last year." required {...slotProps('prev')} />
          <FileSlot label="This year's report" hint="POS export (CSV) for this year." required {...slotProps('curr')} />
        </div>
        {yearsLookWrong && (
          <p className="text-sm font-medium text-rose-600">
            Last year&apos;s report is {prev} and this year&apos;s is {curr}. Put the older year on the left.
          </p>
        )}
        {cmp && (
          <p className="text-sm text-slate-500 font-medium">
            Comparing <b className="text-slate-900">{fmtDate(cmp.currWindow.from)} – {fmtDate(cmp.currWindow.to)}</b> in
            both years: last year is cut to this year&apos;s dates.
          </p>
        )}
      </div>

      {cmp && net && (<>

      {/* Network */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">All outlets</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          <StatCard label="Sales" prev={net.prev.revenue} curr={net.curr.revenue} format={money} />
          <StatCard label="Profit" prev={profit(net.prev)} curr={profit(net.curr)} format={money} />
          <StatCard label="Margin" prev={marginPct(net.prev)} curr={marginPct(net.curr)} format={(n) => `${n.toFixed(1)}%`} points />
          <StatCard label="Units" prev={net.prev.units} curr={net.curr.units} format={count} />
          <StatCard label="Transactions" prev={net.prev.transactions} curr={net.curr.transactions} format={count} />
          <StatCard label="Average sale" prev={avgSale(net.prev)} curr={avgSale(net.curr)} format={money} />
        </div>
      </section>

      {/* Outlets */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Outlets</h2>
        <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-4 md:p-6">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: isMobile ? 0 : 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                {/* Phones: outlet codes turned on their side so all fifteen fit. */}
                <XAxis
                  dataKey="outlet" interval={0}
                  tick={{ fontSize: isMobile ? 10 : 12, fill: '#64748b' }}
                  angle={isMobile ? -90 : 0} textAnchor={isMobile ? 'end' : 'middle'}
                  height={isMobile ? 40 : 30}
                />
                <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tick={{ fontSize: isMobile ? 10 : 12, fill: '#94a3b8' }} width={isMobile ? 36 : 44} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend />
                <Bar dataKey={prev} fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey={curr} fill="#0f172a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Phones: one card per outlet */}
        <ul className="md:hidden space-y-2">
          {outletRows.map((o) => (
            <li key={o.key}>
              <button onClick={() => pickOutlet(o.key)} className="w-full text-left bg-white rounded-2xl border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{o.key}</span>
                  {o.curr ? <ChangeBadge prev={o.prev?.revenue} curr={o.curr.revenue} /> : <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">No sales this year</span>}
                </div>
                <p className="text-sm text-slate-600 mt-1">{o.prev ? money(o.prev.revenue) : '—'} → <b className="text-slate-900">{o.curr ? money(o.curr.revenue) : '—'}</b></p>
                <p className="text-xs text-slate-500 mt-0.5">{signedMoney(revenueChange(o))} · tap for brands and salespeople</p>
              </button>
            </li>
          ))}
        </ul>

        <div className="hidden md:block bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">
                <th className="px-5 py-3">Outlet</th>
                <th className="px-3 py-3 text-right">{prev} sales</th>
                <th className="px-3 py-3 text-right">{curr} sales</th>
                <th className="px-3 py-3 text-right">Change</th>
                <th className="px-3 py-3 text-right">Units</th>
                <th className="px-3 py-3 text-right">Transactions</th>
                <th className="px-5 py-3 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {outletRows.map((o) => (
                <tr key={o.key} onClick={() => pickOutlet(o.key)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer" title={`Show ${o.key}'s brands and salespeople`}>
                  <td className="px-5 py-3 font-bold text-slate-900">{o.key}</td>
                  <td className="px-3 py-3 text-right text-slate-500">{o.prev ? money(o.prev.revenue) : '—'}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{o.curr ? money(o.curr.revenue) : '—'}</td>
                  <td className="px-3 py-3 text-right">
                    <div>{o.curr ? <ChangeBadge prev={o.prev?.revenue} curr={o.curr.revenue} /> : <span className="text-xs font-bold text-slate-500">No sales this year</span>}</div>
                    <div className="text-xs text-slate-400">{signedMoney(revenueChange(o))}</div>
                  </td>
                  <td className="px-3 py-3 text-right text-slate-600">{o.prev ? count(o.prev.units) : '—'} → {o.curr ? count(o.curr.units) : '—'}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{o.prev ? count(o.prev.transactions) : '—'} → {o.curr ? count(o.curr.transactions) : '—'}</td>
                  <td className="px-5 py-3 text-right text-slate-600">
                    {o.prev ? `${marginPct(o.prev).toFixed(1)}%` : '—'} → {o.curr ? `${marginPct(o.curr).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Brands / salespeople */}
      <section ref={breakdownRef} className="space-y-4 scroll-mt-32">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
            {(['brand', 'salesman'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-4 py-1.5 max-sm:py-2.5 rounded-full text-sm font-bold transition-colors cursor-pointer ${
                  kind === k ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
              >{k === 'brand' ? 'Brands' : 'Salespeople'}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Outlet</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="px-4 py-2 max-sm:py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20 cursor-pointer"
            >
              <option value="ALL">All outlets</option>
              {outletRows.map((o) => o.key).sort().map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3 md:gap-4">
          <MoverCard title="Biggest gains" icon={<TrendingUp size={16} className="text-emerald-600" />} items={gains} empty={`No ${kindLabel} grew.`} />
          <MoverCard title="Biggest drops" icon={<TrendingDown size={16} className="text-rose-600" />} items={drops} empty={`No ${kindLabel} fell.`} />
          <ChipCard title={`New this year (${added.length})`} icon={<Sparkles size={16} className="text-sky-600" />} names={added.map((l) => l.key)} empty={`No new ${kindPlural}.`} hint={`Sold in ${curr}, not in ${prev}.`} />
          <ChipCard title={`No sales this year (${gone.length})`} icon={<CircleSlash size={16} className="text-slate-400" />} names={gone.map((l) => l.key)} empty={`Every ${kindLabel} from ${prev} still sold.`} hint={`Sold in ${prev}, not in ${curr}.`} />
        </div>

        <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">
                  <th className="px-5 py-3 max-sm:px-4">{kind === 'brand' ? 'Brand' : 'Salesperson'}</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap max-sm:hidden">{prev}</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap max-sm:hidden">{curr}</th>
                  <th className="px-3 py-3 text-right max-sm:pl-2 max-sm:pr-4">Change</th>
                  <th className="px-5 py-3 text-right max-sm:hidden">Units</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.key} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 max-sm:px-4 max-w-[16rem] max-sm:max-w-[12rem]" title={l.key}>
                      <span className="block font-semibold text-slate-900 truncate">{l.key}</span>
                      {/* Phones: both years' sales move under the name, leaving two columns. */}
                      <span className="sm:hidden block text-xs text-slate-500 truncate">
                        <b className="text-slate-900">{l.curr ? money(l.curr.revenue) : '—'}</b> · was {l.prev ? money(l.prev.revenue) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-slate-500 whitespace-nowrap max-sm:hidden">{l.prev ? money(l.prev.revenue) : '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900 whitespace-nowrap max-sm:hidden">{l.curr ? money(l.curr.revenue) : '—'}</td>
                    <td className="px-3 py-3 max-sm:pl-2 max-sm:pr-4 text-right whitespace-nowrap">
                      <div>{l.curr ? <ChangeBadge prev={l.prev?.revenue} curr={l.curr.revenue} /> : <span className="text-xs font-bold text-slate-500">None this year</span>}</div>
                      <div className="text-xs text-slate-400">{signedMoney(revenueChange(l))}</div>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-600 whitespace-nowrap max-sm:hidden">{l.prev ? count(l.prev.units) : '—'} → {l.curr ? count(l.curr.units) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lines.length > shown.length && (
            <button onClick={() => setShowAll(true)} className="w-full py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 border-t border-slate-100 cursor-pointer">
              Show all {lines.length} {kindPlural}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 font-medium">
          Figures match the Dashboard, Brands and Leaderboards tabs. The Meeting Agenda follows the POS tool&apos;s own rules, so its outlet totals can differ slightly.
        </p>
      </section>
      </>)}
    </div>
  );
}

function MoverCard({ title, icon, items, empty }: { title: string; icon: React.ReactNode; items: Pair<LineTotals>[]; empty: string }) {
  return (
    <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-3">{icon}{title}</p>
      {items.length === 0 ? <p className="text-sm text-slate-400">{empty}</p> : (
        <ul className="space-y-2">
          {items.map((l) => (
            <li key={l.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700 truncate" title={l.key}>{l.key}</span>
              <span className={`font-bold whitespace-nowrap ${revenueChange(l) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{signedMoney(revenueChange(l))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChipCard({ title, icon, names, empty, hint }: { title: string; icon: React.ReactNode; names: string[]; empty: string; hint: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? names : names.slice(0, 12);
  return (
    <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-900">{icon}{title}</p>
      <p className="text-xs text-slate-400 font-medium mb-3">{hint}</p>
      {names.length === 0 ? <p className="text-sm text-slate-400">{empty}</p> : (
        <div className="flex flex-wrap gap-1.5">
          {shown.map((n) => (
            <span key={n} className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full max-w-full truncate" title={n}>{n}</span>
          ))}
          {names.length > shown.length && (
            <button onClick={() => setAll(true)} className="text-xs font-bold text-slate-500 px-2.5 py-1 cursor-pointer hover:text-slate-900">+{names.length - shown.length} more</button>
          )}
        </div>
      )}
    </div>
  );
}
