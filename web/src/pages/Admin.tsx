import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import { PageHeader } from '../components/Layout';
import { Card, Empty, SectionTitle, Skeleton } from '../components/ui';
import { cx, timeAgo } from '../lib/format';
import type { AdminCustomer, AdminDailyRow, AdminOverview } from '../lib/types';

type Range = 7 | 30 | 90;

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat();
const fmt = (n: number) => (Math.abs(n) >= 10_000 ? compact.format(n) : whole.format(Math.round(n)));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const shortDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Admin only: every customer, what they've done, and how much AI they've used. */
export function AdminPage() {
  const user = useAuth();
  const [range, setRange] = useState<Range>(30);
  const [data, setData] = useState<AdminOverview>();
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = (r = range) => {
    setLoading(true);
    setErr('');
    api
      .adminOverview(r)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (user?.isAdmin) load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, user?.isAdmin]);

  if (!user?.isAdmin)
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8">
        <Card>
          <Empty icon={<ShieldAlert className="size-5" />} title="Admins only" body="This page is for the app’s administrators." />
        </Card>
      </div>
    );

  const s = data?.summary;
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Admin"
        sub={data ? `Customers and usage across the app · updated ${timeAgo(data.generatedAt)}` : 'Customers and usage across the app'}
        right={
          <>
            <div role="group" aria-label="Date range" className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
              {([7, 30, 90] as Range[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                  className={cx('h-9 rounded-md px-3 font-medium', range === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
                >
                  {r} days
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => load()}
              aria-label="Refresh"
              className="flex size-11 items-center justify-center rounded-lg text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            >
              <RefreshCw className={cx('size-4', loading && 'animate-spin')} />
            </button>
          </>
        }
      />

      {err && <div role="alert" className="mb-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">{err}</div>}

      {/* ---------------- headline numbers */}
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat label="Customers" value={s && fmt(s.customers)} note={s && `${s.newCustomers} new in ${range} days`} />
        <Stat label="Active in last 7 days" value={s && fmt(s.active7d)} note={s && s.customers ? `${pct(s.active7d / s.customers)} of customers` : undefined} />
        <Stat label="Roles added" value={s && fmt(s.roles)} note={s && `${fmt(s.resumesTailored)} tailored resumes`} />
        <Stat label="Cover letters · interview prep" value={s && `${fmt(s.coverLetters)} · ${fmt(s.interviewPreps)}`} note="All time" />
        <Stat label={`AI requests (${range} days)`} value={s && fmt(s.rangeRequests)} note={s && `${fmt(s.avgRequestsPerDay)} a day on average`} />
        <Stat label={`Tokens (${range} days)`} value={s && fmt(s.rangeTokens)} note={s && s.estimatedShare > 0 ? `${pct(s.estimatedShare)} of requests estimated` : 'As reported by providers'} />
        <Stat label="Average tokens a day" value={s && fmt(s.avgTokensPerDay)} note={`Over the last ${range} days`} />
        <Stat label="Average tokens a request" value={s && fmt(s.avgTokensPerRequest)} note="Prompt plus reply" />
      </div>

      {/* ---------------- daily charts */}
      <div className="mt-8 grid grid-cols-1 gap-4 @5xl:grid-cols-3">
        <ChartCard title="AI requests per day" rows={data?.daily} value={(r) => r.requests} />
        <ChartCard title="Tokens per day" rows={data?.daily} value={(r) => r.promptTokens + r.completionTokens} />
        <ChartCard title="Roles added per day" rows={data?.daily} value={(r) => r.rolesAdded} />
      </div>
      {data && <DailyTable rows={data.daily} />}

      {/* ---------------- customers */}
      <Customers rows={data?.customers} range={range} />

      <p className="mt-6 text-xs leading-relaxed text-slate-500">
        AI usage is recorded from when this page was added, per day in UTC. Some free and local AI servers don’t report token counts; those requests are
        estimated at about 4 characters per token. Roles, tailored resumes, cover letters and interview prep are counted from each customer’s saved data.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function Stat({ label, value, note }: { label: string; value?: ReactNode; note?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      {value == null ? <Skeleton className="mt-2 h-7 w-20" /> : <div className="mt-1 font-display text-[26px] font-semibold tracking-[-0.02em] text-slate-900 tabular-nums">{value}</div>}
      {note && <div className="mt-0.5 text-xs text-slate-500">{note}</div>}
    </Card>
  );
}

/** One series, one axis: thin bars from the baseline, a tooltip on hover or keyboard focus. */
function ChartCard({ title, rows, value }: { title: string; rows?: AdminDailyRow[]; value: (r: AdminDailyRow) => number }) {
  const [hover, setHover] = useState<number | null>(null);
  // draw at the real pixel width so text stays 10px whatever the card's size
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(360);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);
  const H = 170;
  const pad = { l: 40, r: 8, t: 10, b: 24 };
  const vals = rows?.map(value) ?? [];
  const max = Math.max(1, ...vals);
  const nice = niceMax(max);
  const n = vals.length || 1;
  const step = (W - pad.l - pad.r) / n;
  const barW = Math.max(2, step - 2); // 2px gap between bars
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
  const total = vals.reduce((a, b) => a + b, 0);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - pad.l) / 64)))); // ~64px per date label

  return (
    <Card className="p-4">
      <SectionTitle right={rows && <span className="text-xs text-slate-500 tabular-nums">{fmt(total)} total</span>}>{title}</SectionTitle>
      {!rows ? (
        <Skeleton className="mt-3 h-[150px] w-full" />
      ) : (
        <div ref={box} className="relative mt-3">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={`${title}: ${fmt(total)} over ${n} days, highest ${fmt(max)}`}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={pad.l} x2={W - pad.r} y1={y(nice * f)} y2={y(nice * f)} stroke={f === 0 ? '#cbd5e1' : '#eef2f7'} strokeWidth="1" />
                <text x={pad.l - 6} y={y(nice * f) + 3} textAnchor="end" className="fill-slate-500 text-[10px] tabular-nums">
                  {fmt(nice * f)}
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              const v = vals[i];
              const x = pad.l + i * step + (step - barW) / 2;
              const top = y(v);
              const h = H - pad.b - top;
              const rad = Math.min(4, barW / 2, h);
              return (
                <g key={r.date}>
                  {v > 0 && (
                    <path
                      d={`M${x},${H - pad.b} V${top + rad} Q${x},${top} ${x + rad},${top} H${x + barW - rad} Q${x + barW},${top} ${x + barW},${top + rad} V${H - pad.b} Z`}
                      className={cx('transition-opacity', hover != null && hover !== i ? 'opacity-40' : 'opacity-100')}
                      fill="var(--brand-500)"
                    />
                  )}
                  {i % labelEvery === (n - 1) % labelEvery && (
                    <text
                      x={i === n - 1 ? W - pad.r : x + barW / 2}
                      y={H - 6}
                      textAnchor={i === n - 1 ? 'end' : 'middle'}
                      className="fill-slate-500 text-[10px]"
                    >
                      {shortDate(r.date)}
                    </text>
                  )}
                  {/* hit target: the whole column, bigger than the bar */}
                  <rect
                    x={pad.l + i * step}
                    y={pad.t}
                    width={step}
                    height={H - pad.t - pad.b}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${shortDate(r.date)}: ${fmt(v)}`}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="outline-none"
                  />
                </g>
              );
            })}
          </svg>
          {hover != null && rows[hover] && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
              style={{ left: Math.min(W - 70, Math.max(70, pad.l + hover * step + step / 2)) }}
            >
              <div className="text-slate-300">{shortDate(rows[hover].date)}</div>
              <div className="font-semibold tabular-nums">{whole.format(vals[hover])}</div>
              <div className="text-slate-300">{rows[hover].activeCustomers} active customers</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function DailyTable({ rows }: { rows: AdminDailyRow[] }) {
  return (
    <details className="mt-3 rounded-xl border border-slate-200/80 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">Show the numbers by day</summary>
      <div className="max-h-[360px] overflow-auto border-t border-slate-100">
        <table className="w-full text-sm tabular-nums">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              {['Date', 'Active customers', 'Roles added', 'Tailored', 'AI runs', 'AI requests', 'Failures', 'Prompt tokens', 'Reply tokens'].map((h) => (
                <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.date} className="border-t border-slate-100">
                <td className="px-3 py-2 whitespace-nowrap text-slate-700">{shortDate(r.date)}</td>
                {[r.activeCustomers, r.rolesAdded, r.resumesTailored, r.runs, r.requests, r.failures, r.promptTokens, r.completionTokens].map((v, i) => (
                  <td key={i} className="px-3 py-2 text-slate-700">{whole.format(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

type SortKey = 'lastActive' | 'createdAt' | 'roles' | 'resumesTailored' | 'coverLetters' | 'interviewPreps' | 'requests' | 'tokens' | 'avg';
const sortValue = (c: AdminCustomer, k: SortKey): number | string =>
  k === 'requests' ? c.ai.requests : k === 'tokens' ? c.ai.tokens : k === 'avg' ? c.ai.avgTokensPerActiveDay : (c[k] as number | string);

function Customers({ rows, range }: { rows?: AdminCustomer[]; range: Range }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'lastActive', desc: true });
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = (rows ?? []).filter((c) => !t || c.email.toLowerCase().includes(t) || c.name.toLowerCase().includes(t));
    return [...f].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.desc ? -d : d;
    });
  }, [rows, q, sort]);

  const cols: { key?: SortKey; label: string; align?: 'right' }[] = [
    { label: 'Customer' },
    { key: 'createdAt', label: 'Joined' },
    { key: 'lastActive', label: 'Last active' },
    { key: 'roles', label: 'Roles', align: 'right' },
    { key: 'resumesTailored', label: 'Tailored', align: 'right' },
    { key: 'coverLetters', label: 'Cover letters', align: 'right' },
    { key: 'interviewPreps', label: 'Interview prep', align: 'right' },
    { key: 'requests', label: 'AI requests', align: 'right' },
    { key: 'tokens', label: 'Tokens', align: 'right' },
    { key: 'avg', label: 'Avg tokens / active day', align: 'right' },
  ];

  return (
    <Card className="mt-8 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <SectionTitle>Customers{rows ? ` · ${rows.length}` : ''}</SectionTitle>
        <label className="relative">
          <span className="sr-only">Search customers</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email"
            className="h-10 w-64 max-w-full rounded-lg border border-slate-200 pr-3 pl-9 text-sm outline-none focus:border-brand-500"
          />
        </label>
      </div>
      {!rows ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {cols.map((c) => (
                  <th key={c.label} className={cx('px-3 py-2 font-medium whitespace-nowrap', c.align === 'right' ? 'text-right' : 'text-left')} aria-sort={c.key && sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                    {c.key ? (
                      <button
                        type="button"
                        onClick={() => setSort((s) => ({ key: c.key!, desc: s.key === c.key ? !s.desc : true }))}
                        className={cx('inline-flex items-center gap-1 hover:text-slate-900', sort.key === c.key && 'text-slate-900')}
                      >
                        {c.label}
                        {sort.key === c.key && (sort.desc ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" aria-hidden />)}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {list.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                  <td className="min-w-[230px] px-3 py-2.5">
                    <div className="font-medium text-slate-900">{c.name || '—'}</div>
                    <div className="text-xs break-words text-slate-500">{c.email}</div>
                    {!c.hasMaster && <div className="mt-1 inline-block rounded whitespace-nowrap bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800 ring-1 ring-inset ring-amber-200">No master resume yet</div>}
                    {c.consent && (
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                        <span
                          className={cx('rounded px-1.5 py-0.5 ring-1 ring-inset', c.consent.ai === 'active' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-slate-50 text-slate-700 ring-slate-200')}
                          title={c.consent.aiAt ? `Since ${new Date(c.consent.aiAt).toLocaleString()}` : undefined}
                        >
                          AI consent: {c.consent.ai === 'active' ? `on (v${c.consent.aiVersion})` : c.consent.ai === 'none' ? 'never given' : c.consent.ai}
                        </span>
                        <span className="rounded bg-slate-50 px-1.5 py-0.5 text-slate-700 ring-1 ring-inset ring-slate-200">
                          Policy ack: {c.consent.privacyAckVersion ? `v${c.consent.privacyAckVersion}` : 'none'}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{timeAgo(c.lastActive)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-900">{c.roles}</td>
                  <td className="px-3 py-2.5 text-right text-slate-900">{c.resumesTailored}</td>
                  <td className="px-3 py-2.5 text-right text-slate-900">{c.coverLetters}</td>
                  <td className="px-3 py-2.5 text-right text-slate-900">{c.interviewPreps}</td>
                  <td className="px-3 py-2.5 text-right text-slate-900">
                    {fmt(c.ai.requests)}
                    <div className="text-[11px] text-slate-500">{fmt(c.ai.rangeRequests)} in {range}d</div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-900">
                    {fmt(c.ai.tokens)}
                    {c.ai.estimatedShare > 0 && <div className="text-[11px] text-slate-500">{pct(c.ai.estimatedShare)} estimated</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-900">
                    {fmt(c.ai.avgTokensPerActiveDay)}
                    <div className="text-[11px] text-slate-500">{c.ai.activeDays} active days</div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={cols.length} className="px-3 py-8 text-center text-slate-500">
                    No customers match “{q}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
