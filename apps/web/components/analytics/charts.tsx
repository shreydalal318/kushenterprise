'use client';
import { useMemo, useRef, useState } from 'react';
import { formatDate } from '@kush/core';
import { rupees } from '@/lib/format';

/** Validated categorical palette (slot order is the colour-blind-safety mechanism). */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] as const;
const GRID = '#e3e8ec';
const INK2 = '#5b6774';

/** Axis labels: in full under 10,000; then K, lakh (L) and crore (Cr). */
const compact = (n: number) => { const a = Math.abs(n); const t = (v: number) => String(+v.toFixed(1)); return a >= 1e7 ? `${t(n / 1e7)}Cr` : a >= 1e5 ? `${t(n / 1e5)}L` : a >= 1e4 ? `${t(n / 1e3)}K` : Math.round(n).toLocaleString('en-IN'); };
/** Round step (1/2/5 × 10ⁿ) so ticks read 0 / 10K / 20K, never 13K / 25K. */
function niceStep(v: number) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

export interface Series { name: string; points: { label: string; value: number }[] }

/** Line chart for change over time: 2px lines, crosshair + tooltip on hover, one y-axis. */
export function LineChart({ series, height = 220, money = true, title }: { series: Series[]; height?: number; money?: boolean; title: string }) {
  const W = 720, H = height, L = 52, R = 12, T = 12, B = 26;
  const n = Math.max(...series.map((s) => s.points.length));
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const step = niceStep(Math.max(1, ...values.map(Math.abs)) / 4);
  const max = step * Math.max(1, Math.ceil(Math.max(0, ...values) / step));
  // Returns can make a day negative; only extend below zero when that is visible at this scale.
  const lowest = Math.min(0, ...values);
  const min = lowest < -step * 0.15 ? step * Math.floor(lowest / step) : 0;
  const x = (i: number) => L + (n <= 1 ? 0 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (H - T - B) * (1 - (Math.max(v, min) - min) / (max - min));
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const fmt = (v: number) => (money ? rupees(v) : v.toLocaleString('en-IN'));
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);
  const every = Math.ceil(n / 6);
  function move(e: React.PointerEvent) {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1)))));
  }
  return (
    <figure className="relative">
      {series.length > 1 && (
        <figcaption className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
          {series.map((s, i) => <span key={s.name} className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded" style={{ background: SERIES[i] }} />{s.name}</span>)}
        </figcaption>
      )}
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" role="img" aria-label={title} onPointerMove={move} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={INK2}>{compact(t)}</text></g>)}
        {series[0]?.points.map((p, i) => (i % every === 0 || i === n - 1) && <text key={i} x={x(i)} y={H - 6} textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fontSize={11} fill={INK2}>{p.label}</text>)}
        {series.map((s, si) => (
          <g key={s.name}>
            {si === 0 && <path d={`M${x(0)},${y(0)} ${s.points.map((p, i) => `L${x(i)},${y(p.value)}`).join(' ')} L${x(s.points.length - 1)},${y(0)} Z`} fill={SERIES[si]} opacity={0.1} />}
            <polyline points={s.points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke={INK2} strokeWidth={1} />
            {series.map((s, si) => s.points[hover] && <circle key={s.name} cx={x(hover)} cy={y(s.points[hover]!.value)} r={4.5} fill={SERIES[si]} stroke="#fff" strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute top-6 z-10 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-md" style={{ left: `${Math.min(70, (x(hover) / W) * 100)}%` }}>
          {series.map((s, si) => s.points[hover] && <div key={s.name} className="flex items-center gap-2"><i className="inline-block size-2 rounded-full" style={{ background: SERIES[si] }} /><span className="text-muted">{s.points[hover]!.label}</span><span className="font-semibold text-ink">{fmt(s.points[hover]!.value)}</span></div>)}
        </div>
      )}
    </figure>
  );
}

/** Horizontal bar list for ranking: one hue, ≤24px bars, rounded data end, value at the tip. */
export function BarList({ rows, money = true, max: maxRows = 8, color = SERIES[0], title }: { rows: { label: string; sub?: string; value: number }[]; money?: boolean; max?: number; color?: string; title: string }) {
  const shown = useMemo(() => rows.slice(0, maxRows), [rows, maxRows]);
  const top = Math.max(1, ...shown.map((r) => r.value));
  if (!shown.length) return <p className="py-6 text-center text-sm text-muted">No sales in this period.</p>;
  return (
    <ul className="flex flex-col gap-2.5" aria-label={title}>
      {shown.map((r) => (
        <li key={r.label} className="group" title={`${r.label}: ${money ? rupees(r.value) : r.value}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="truncate text-ink">{r.label}{r.sub && <span className="ml-1 text-xs text-muted">{r.sub}</span>}</span><span className="shrink-0 font-semibold tabular-nums text-ink">{money ? rupees(r.value) : r.value.toLocaleString('en-IN')}</span></div>
          <div className="h-2.5 w-full rounded-full bg-canvas"><div className="h-2.5 rounded-r-full transition-[filter] group-hover:brightness-90" style={{ width: `${Math.max(1.5, (Math.max(0, r.value) / top) * 100)}%`, background: color, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 }} /></div>
        </li>
      ))}
    </ul>
  );
}

/** Sequential single-hue blocks for receivables ageing (darker = older). */
export function AgeingBar({ ageing }: { ageing: Record<string, number> }) {
  const ramp = ['#86b6ef', '#3987e5', '#1c5cab', '#184f95'];
  const entries = Object.entries(ageing);
  const total = entries.reduce((t, [, v]) => t + v, 0);
  if (!total) return <p className="text-sm text-muted">Nothing outstanding.</p>;
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded" role="img" aria-label={`Ageing: ${entries.map(([k, v]) => `${k} days ${rupees(v)}`).join(', ')}`}>
        {entries.map(([k, v], i) => v > 0 && <div key={k} title={`${k} days: ${rupees(v)}`} style={{ width: `${(v / total) * 100}%`, background: ramp[i] }} />)}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {entries.map(([k, v], i) => <div key={k}><dt className="flex items-center gap-1.5 text-xs text-muted"><i className="inline-block size-2 rounded-sm" style={{ background: ramp[i] }} />{k} days</dt><dd className="font-semibold tabular-nums">{rupees(v)}</dd></div>)}
      </dl>
    </div>
  );
}

export const dayLabel = (iso: string) => formatDate(iso).slice(0, 5);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Daily points for up to a month; weekly up to a quarter; monthly beyond that. */
export function bucketSales(daily: { date: string; sales: number }[]): { points: { label: string; value: number }[]; unit: 'day' | 'week' | 'month' } {
  if (daily.length <= 35) return { unit: 'day', points: daily.map((p) => ({ label: dayLabel(p.date), value: p.sales })) };
  const monthly = daily.length > 100;
  const m = new Map<string, number>();
  daily.forEach((p, i) => {
    const key = monthly ? p.date.slice(0, 7) : daily[i - (i % 7)]!.date;
    m.set(key, (m.get(key) ?? 0) + p.sales);
  });
  return {
    unit: monthly ? 'month' : 'week',
    points: [...m.entries()].map(([k, v]) => ({ label: monthly ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}` : dayLabel(k), value: Math.round(v * 100) / 100 })),
  };
}
