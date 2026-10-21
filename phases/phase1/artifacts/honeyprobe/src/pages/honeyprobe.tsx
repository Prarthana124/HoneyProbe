import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useClerk } from '@clerk/react';
import { Link, useLocation, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, BarChart3, Bell,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Cloud,
  Code2, Copy, Database, Download, ExternalLink, Eye, FileClock, FileText,
  Filter, Globe2, HardDrive, Hexagon, Layers3, LifeBuoy, LockKeyhole, LogIn,
  LogOut, Menu, Network, Play, RefreshCw, Search, Settings2, Shield, ShieldAlert,
  ShieldCheck, SlidersHorizontal, Terminal, X, Zap,
} from 'lucide-react';
import {
  useHealthCheck, getHealthCheckQueryKey, useGetSystemHealth, getGetSystemHealthQueryKey,
  useGetOverview, getGetOverviewQueryKey, useGetEvents, getGetEventsQueryKey, useIngestEvent,
  useGetEvent, getGetEventQueryKey, useGetSessions, getGetSessionsQueryKey,
  useGetSession, getGetSessionQueryKey, useUpdateSessionStatus, useGetDecoys,
  getGetDecoysQueryKey, useRecordWebInteraction, useRecordDatabaseInteraction,
  useImportCowrieEvents, useGetAnalytics, getGetAnalyticsQueryKey, useGetSelfTests,
  getGetSelfTestsQueryKey, useRunSelfTests, useGetReportSummary, getGetReportSummaryQueryKey,
  useExportReportCsv, getExportReportCsvQueryKey, useExportReportHtml,
  getExportReportHtmlQueryKey, useExportEventsCsv, getExportEventsCsvQueryKey,
  useGenerateDemoEvents, useResetDemoEvents,
} from '@workspace/api-client-react';
import type { Event, Session, SelfTestResult } from '@workspace/api-client-react';

const NAV = [
  { href: '/overview', label: 'Overview', icon: Layers3 },
  { href: '/telemetry', label: 'Telemetry', icon: Activity },
  { href: '/decoys', label: 'Decoy integrations', icon: Hexagon },
  { href: '/sessions', label: 'Sessions', icon: Network },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/self-test', label: 'Self-test', icon: ShieldCheck },
  { href: '/reports', label: 'Reports', icon: FileText },
];
const mono = 'mono';
const timePreference = () => typeof localStorage === 'undefined' ? 'local' : localStorage.getItem('honeyprobe-time-format') || 'local';
const dateTime = (v?: string | null) => v ? `${new Date(v).toLocaleString([], { timeZone: timePreference() === 'utc' ? 'UTC' : undefined, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}${timePreference() === 'utc' ? ' UTC' : ' local'}` : '—';
const shortTime = (v?: string | null) => v ? `${new Date(v).toLocaleTimeString([], { timeZone: timePreference() === 'utc' ? 'UTC' : undefined, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}${timePreference() === 'utc' ? ' UTC' : ''}` : '—';
const nice = (v?: string | null) => (v || 'unknown').replaceAll('_', ' ');
const countValue = (v: { value: number; context: string } | undefined) => v?.value ?? 0;

function AppShell({ children, title, subtitle, action }: { children: ReactNode; title: string; subtitle?: string; action?: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { signOut } = useClerk();
  const [navOpen, setNavOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const health = useGetSystemHealth({ query: { queryKey: getGetSystemHealthQueryKey() } });
  return <div className="min-h-[100dvh] bg-[#090C12] text-[#F1F5FA]">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[246px] flex-col border-r border-[#273447] bg-[#0c111a] transition-transform lg:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[76px] items-center gap-3 border-b border-[#273447] px-6">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#f5b544] text-[#10131a]"><Hexagon size={21} strokeWidth={2.5}/><span className="absolute h-1.5 w-1.5 rounded-full bg-[#0c111a]"/></div>
        <div><div className="text-[17px] font-bold tracking-[-.04em]">honey<span className="text-[#f5b544]">probe</span></div><div className="eyebrow mt-0.5">CONTROLLED LAB</div></div>
        <button className="ml-auto rounded-md p-1 text-[#94a3b8] lg:hidden" onClick={() => setNavOpen(false)} aria-label="Close navigation" data-testid="button-close-navigation"><X size={18}/></button>
      </div>
      <div className="px-4 pt-6">
        <p className="eyebrow px-3 pb-3">Workspace</p>
        <nav className="space-y-1" aria-label="Main navigation">
          {NAV.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setNavOpen(false)} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${location === href || (href === '/sessions' && location.startsWith('/sessions/')) ? 'bg-[#f5b544]/10 text-[#ffd780]' : 'text-[#94a3b8] hover:bg-[#151f2c] hover:text-[#f1f5fa]'}`}>
            <Icon size={16} strokeWidth={1.8}/>{label}{href === '/telemetry' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#52d8f2]"/>}
          </Link>)}
        </nav>
      </div>
      <div className="mt-auto p-4">
        <div className="relative overflow-hidden rounded-xl border border-[#273447] bg-[#101722] p-4">
          <div className="honeycomb absolute inset-0 opacity-50"/>
          <div className="relative flex items-start gap-2.5"><div className="rounded-lg bg-[#52d8f2]/10 p-2 text-[#52d8f2]"><Shield size={15}/></div><div><div className="text-[12px] font-semibold">Lab mode</div><div className="mt-1 text-[11px] leading-relaxed text-[#94a3b8]">Controlled telemetry workspace. Synthetic events are labeled.</div></div></div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-[#273447]/70 px-3 py-2 text-[10px]">
          <span className="flex items-center gap-2 text-[#94a3b8]"><span className={`h-1.5 w-1.5 rounded-full ${health.data?.status === 'healthy' ? 'bg-[#4ddba1]' : health.isError ? 'bg-[#ff5c70]' : 'bg-[#f5b544]'}`}/>API {health.isLoading ? 'checking' : health.data?.status || 'unavailable'}</span>
          <span className="mono text-[#64748b]">v0.1.0</span>
        </div>
        <Link href="/settings" className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-[#94a3b8] hover:bg-[#151f2c] hover:text-[#f1f5fa]" data-testid="link-settings"><Settings2 size={16}/>Settings</Link>
      </div>
    </aside>
    {navOpen && <button className="fixed inset-0 z-30 bg-black/55 lg:hidden" onClick={() => setNavOpen(false)} aria-label="Close menu backdrop" data-testid="button-backdrop-close"/>}
    <div className="lg:pl-[246px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#273447] bg-[#090c12]/90 px-4 backdrop-blur-xl sm:px-7">
        <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-[#94a3b8] hover:bg-[#151f2c] lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={18}/></button><div className="hidden text-[11px] text-[#64748b] sm:block">HoneyProbe <span className="mx-1.5 text-[#334155]">/</span><span className="text-[#cbd5e1]">{title}</span></div><div className="text-sm font-semibold sm:hidden">{title}</div></div>
        <div className="flex min-w-0 items-center gap-3">
          <form onSubmit={e=>{e.preventDefault();if(globalSearch.trim()){setLocation('/telemetry');window.dispatchEvent(new CustomEvent('honeyprobe-global-search',{detail:globalSearch.trim()}))}}} className="relative hidden lg:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]"/>
            <input value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder="Search events or sessions" aria-label="Search events and sessions" data-testid="input-global-search" className="h-9 w-56 rounded-lg border border-[#273447] bg-[#101722] pl-9 pr-3 text-[11px] text-[#e2e8f0] outline-none placeholder:text-[#64748b] focus:border-[#f5b544]/60"/>
          </form>
          <div className="hidden items-center gap-2 rounded-full border border-[#273447] bg-[#101722] px-3 py-1.5 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#4ddba1]"/><span className="eyebrow !text-[9px]">AUTHORIZED OPERATOR</span></div>
          <Link href="/decoy" className="hidden items-center gap-1.5 text-[11px] text-[#94a3b8] hover:text-[#ffd780] md:flex" data-testid="link-open-decoy"><ExternalLink size={13}/>Decoy preview</Link>
          <button type="button" onClick={() => void signOut({ redirectUrl: import.meta.env.BASE_URL || '/' })} aria-label="Sign out of HoneyProbe" title="Sign out" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#273447] bg-[#101722] px-2.5 text-[11px] font-medium text-[#cbd5e1] hover:border-[#40526b] hover:text-[#ffd780]"><LogOut size={14}/><span className="hidden sm:inline">Sign out</span></button>
        </div>
      </header>
      <main className="mx-auto max-w-[1540px] px-4 py-7 sm:px-7 lg:px-9">
        <div className="mb-7 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div><p className="eyebrow mb-2 text-[#f5b544]">OBSERVE · VALIDATE · INVESTIGATE</p><h1 className="text-[26px] font-semibold tracking-[-.045em] sm:text-[30px]">{title}</h1>{subtitle && <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-[#94a3b8]">{subtitle}</p>}</div>
          {action && <div className="flex w-full max-w-full flex-wrap items-center gap-2 xl:w-auto xl:flex-nowrap">{action}</div>}
        </div>
        {children}
      </main>
      <footer className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-2 border-t border-[#273447]/70 px-4 py-5 text-[10px] text-[#64748b] sm:px-7 lg:px-9"><span>HoneyProbe <span className={mono}>/</span> controlled-lab telemetry</span><span className={mono}>SYNTHETIC DATA RETAINS PROVENANCE</span></footer>
    </div>
  </div>;
}

function Button({ children, onClick, variant = 'secondary', disabled, testId, type = 'button' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; disabled?: boolean; testId: string; type?: 'button' | 'submit' }) {
  const style = variant === 'primary' ? 'border-[#f5b544] bg-[#f5b544] text-[#14171c] hover:bg-[#ffd780]' : variant === 'danger' ? 'border-[#ff5c70]/30 bg-[#ff5c70]/10 text-[#ff8b99] hover:bg-[#ff5c70]/15' : variant === 'quiet' ? 'border-transparent bg-transparent text-[#94a3b8] hover:bg-[#151f2c] hover:text-[#f1f5fa]' : 'border-[#273447] bg-[#151f2c] text-[#e2e8f0] hover:border-[#40526b] hover:bg-[#1a2736]';
  return <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${style}`}>{children}</button>;
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`panel ${className}`}>{children}</section>; }
function PanelHead({ title, meta, icon: Icon }: { title: string; meta?: ReactNode; icon?: typeof Activity }) { return <div className="flex items-center justify-between gap-3 border-b border-[#273447] px-4 py-3.5 sm:px-5"><div className="flex items-center gap-2.5">{Icon && <Icon size={15} className="text-[#f5b544]"/>}<h2 className="text-[13px] font-semibold">{title}</h2></div>{meta}</div>; }
function State({ loading, error, empty, onRetry, children }: { loading?: boolean; error?: boolean; empty?: boolean; onRetry?: () => void; children?: ReactNode }) {
  if (loading) return <div className="space-y-3 p-5" aria-label="Loading"><div className="skeleton h-5 w-1/3 rounded"/><div className="skeleton h-10 w-full rounded"/><div className="skeleton h-10 w-4/5 rounded"/></div>;
  if (error) return <div className="flex flex-col items-center gap-3 px-5 py-12 text-center"><AlertTriangle size={22} className="text-[#ff5c70]"/><p className="text-sm text-[#cbd5e1]">Telemetry could not be loaded.</p><Button onClick={onRetry} variant="secondary" testId="button-retry"><RefreshCw size={13}/>Retry</Button></div>;
  if (empty) return <div className="flex flex-col items-center gap-2 px-5 py-12 text-center"><div className="rounded-xl border border-[#273447] bg-[#151f2c] p-3 text-[#718096]"><Activity size={19}/></div><p className="text-sm font-medium text-[#cbd5e1]">No records in this view</p><p className="max-w-xs text-[12px] text-[#718096]">Adjust the filters or wait for decoy activity to arrive.</p></div>;
  return <>{children}</>;
}
function Severity({ value }: { value?: string }) {
  const key = (value || 'info').toLowerCase();
  const map: Record<string, string> = { critical: 'text-[#ff5c70] bg-[#ff5c70]/10 border-[#ff5c70]/20', high: 'text-[#ff9a66] bg-[#ff9a66]/10 border-[#ff9a66]/20', medium: 'text-[#f5b544] bg-[#f5b544]/10 border-[#f5b544]/20', low: 'text-[#52d8f2] bg-[#52d8f2]/10 border-[#52d8f2]/20', info: 'text-[#94a3b8] bg-[#94a3b8]/10 border-[#94a3b8]/20' };
  return <span data-testid={`severity-${key}`} className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-[.1em] ${map[key] || map.info}`}>{key}</span>;
}
function StatusPill({ value }: { value?: string }) {
  const connected = value === 'connected' || value === 'healthy' || value === 'pass' || value === 'resolved';
  const warning = value === 'demo_mode' || value === 'investigating' || value === 'degraded';
  return <span data-testid={`status-${(value || 'unknown').replaceAll('_', '-')}`} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium capitalize ${connected ? 'border-[#4ddba1]/20 bg-[#4ddba1]/10 text-[#4ddba1]' : warning ? 'border-[#f5b544]/20 bg-[#f5b544]/10 text-[#ffd780]' : 'border-[#273447] bg-[#151f2c] text-[#94a3b8]'}`}><span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-[#4ddba1]' : warning ? 'bg-[#f5b544]' : 'bg-[#64748b]'}`}/>{nice(value)}</span>;
}
function MetricCard({ label, value, context, icon: Icon, color = 'amber' }: { label: string; value: number | string; context?: string; icon: typeof Activity; color?: 'amber' | 'cyan' | 'green' | 'red' }) {
  const colors = { amber: 'text-[#f5b544] bg-[#f5b544]/10', cyan: 'text-[#52d8f2] bg-[#52d8f2]/10', green: 'text-[#4ddba1] bg-[#4ddba1]/10', red: 'text-[#ff5c70] bg-[#ff5c70]/10' };
  return <div className="panel relative min-w-0 overflow-hidden p-4 sm:p-5"><div className="flex items-start justify-between gap-2"><div><p className="eyebrow">{label}</p><p className="mt-3 text-[28px] font-semibold tracking-[-.05em] sm:text-[32px]" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</p></div><div className={`rounded-lg p-2.5 ${colors[color]}`}><Icon size={17}/></div></div>{context && <p className="mt-2 text-[11px] text-[#718096]">{context}</p>}</div>;
}
function EventRows({ events, compact = false, onPick }: { events: Event[]; compact?: boolean; onPick?: (e: Event) => void }) {
  if (!events.length) return <State empty/>;
  return <div className="divide-y divide-[#273447]/70">{events.map((e) => <button key={e.id} onClick={() => onPick?.(e)} data-testid={`row-event-${e.id}`} className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#151f2c]/70 sm:px-5 ${onPick ? 'cursor-pointer' : 'cursor-default'}`}><div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: e.severity === 'critical' || e.severity === 'high' ? '#ff5c70' : e.severity === 'medium' ? '#f5b544' : '#52d8f2' }}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-[12px] font-semibold">{e.event_type}</span><Severity value={e.severity}/>{e.environment !== 'configured_lab' && <span className="rounded border border-[#f5b544]/20 bg-[#f5b544]/5 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-[#ffd780]">{nice(e.environment)} data</span>}</div><p className="mt-1 truncate text-[11px] text-[#94a3b8]">{e.summary}</p><div className="mono mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-[#718096]"><span>{e.source_address || 'address unavailable'}</span><span>→ {e.target}</span>{e.session_id && <span>session {e.session_id}</span>}</div></div><div className="shrink-0 text-right"><p className={`${mono} text-[10px] text-[#94a3b8]`}>{shortTime(e.timestamp)}</p>{!compact && <p className="mt-1 text-[9px] capitalize text-[#64748b]">{nice(e.source_type)}</p>}</div></button>)}</div>;
}
function EventInspector({ eventId, close }: { eventId: string | null; close: () => void }) {
  const query = useGetEvent(eventId || '', { query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId || '') } });
  const [copyMessage, setCopyMessage] = useState('');
  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} copied`);
    } catch {
      setCopyMessage('Clipboard access is unavailable in this browser.');
    }
  };
  if (!eventId) return null;
  const e = query.data;
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/65" role="dialog" aria-modal="true">
    <button className="absolute inset-0 cursor-default" onClick={close} aria-label="Close event detail" data-testid="button-close-event-overlay"/>
    <aside className="relative h-full w-full max-w-[520px] overflow-y-auto border-l border-[#273447] bg-[#101722] shadow-2xl">
      <div className="sticky top-0 flex items-center justify-between border-b border-[#273447] bg-[#101722]/95 px-5 py-4 backdrop-blur"><div><p className="eyebrow">EVENT RECORD</p><h2 className="mt-1 text-lg font-semibold">Investigation detail</h2></div><button onClick={close} className="rounded-lg p-2 text-[#94a3b8] hover:bg-[#151f2c]" aria-label="Close detail" data-testid="button-close-event"><X size={18}/></button></div>
      {query.isLoading ? <State loading/> : query.isError ? <State error onRetry={() => query.refetch()}/> : e ? <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-2"><Severity value={e.severity}/><StatusPill value={e.processing_status}/><span className="text-xs text-[#94a3b8]">{nice(e.source_type)}</span></div>
        <h3 className="text-xl font-semibold">{e.event_type}</h3><p className="text-sm leading-6 text-[#a8b4c4]">{e.summary}</p>
        <div className="grid grid-cols-2 gap-2">{[['Event ID', e.id], ['Timestamp (UTC)', new Date(e.timestamp).toISOString()], ['Local time', dateTime(e.timestamp)], ['Source', e.source_address || '—'], ['Target', e.target], ['Session', e.session_id || 'Uncorrelated'], ['Environment', nice(e.environment)], ['Ingestion', nice(e.ingestion_source)]].map(([k,v]) => <div key={k} className="rounded-lg border border-[#273447] bg-[#151f2c] p-3"><p className="eyebrow">{k}</p><p className={`${mono} mt-2 break-all text-[11px] text-[#e2e8f0]`}>{v}</p></div>)}</div>
        <div className="flex flex-wrap items-center gap-2"><Button testId="button-copy-event-id" onClick={()=>void copyValue(e.id,'Event ID')}><Copy size={13}/>Copy event ID</Button>{e.session_id&&<Button testId="button-copy-session-id" onClick={()=>void copyValue(e.session_id as string,'Session ID')}><Copy size={13}/>Copy session ID</Button>}{copyMessage&&<span role="status" className="text-[10px] text-[#4ddba1]">{copyMessage}</span>}</div>
        <div className="rounded-lg border border-[#273447] bg-[#0b1119]"><div className="border-b border-[#273447] px-3 py-2 text-[11px] font-semibold text-[#cbd5e1]">Sanitized metadata</div><pre className="overflow-auto p-3 text-[10px] leading-5 text-[#52d8f2]">{JSON.stringify(e.metadata, null, 2)}</pre></div>
      </div> : null}
    </aside>
  </div>;
}

function generateTestPayload() {
  return { source_type: 'web' as const, event_type: 'probe.validation', severity: 'medium' as const, source_address: '192.0.2.44', target: '/admin', session_id: `lab-${Date.now().toString(36)}`, summary: 'Operator-generated validation event from the HoneyProbe console.', metadata: { test: true, origin: 'operator_console' }, environment: 'test' as const, ingestion_source: 'honeyprobe_self_test' };
}
function invalidateTelemetry(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: getGetOverviewQueryKey() });
  void client.invalidateQueries({ queryKey: getGetEventsQueryKey() });
  void client.invalidateQueries({ queryKey: getGetSessionsQueryKey() });
  void client.invalidateQueries({ queryKey: getGetAnalyticsQueryKey() });
  void client.invalidateQueries({ queryKey: getGetReportSummaryQueryKey() });
  void client.invalidateQueries({ queryKey: getGetDecoysQueryKey() });
}

export function OverviewPage() {
  const qc = useQueryClient();
  const [range, setRange] = useState('24h');
  const params = useMemo(() => ({ since: new Date(Date.now() - (range === '7d' ? 7 : range === '30d' ? 30 : 1) * 86400000).toISOString() }), [range]);
  const overview = useGetOverview(params, { query: { queryKey: getGetOverviewQueryKey(params) } });
  const ingest = useIngestEvent();
  const [selected, setSelected] = useState<string | null>(null);
  const data = overview.data;
  return <AppShell title="Overview" subtitle="A trustworthy view of decoy activity across your controlled research environment." action={<><select value={range} onChange={e=>setRange(e.target.value)} aria-label="Overview time range" data-testid="select-overview-range" className="h-9 rounded-lg border border-[#273447] bg-[#101722] px-3 text-[11px] text-[#cbd5e1]"><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select><Button testId="button-refresh-overview" onClick={()=>void overview.refetch()}><RefreshCw size={14}/>Refresh</Button><Link href="/decoy" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#273447] bg-[#151f2c] px-3.5 text-[12px] font-semibold text-[#e2e8f0]" data-testid="button-preview-decoy"><ExternalLink size={14}/>Preview decoy</Link><Button variant="primary" disabled={ingest.isPending} onClick={() => ingest.mutate({ data: generateTestPayload() }, { onSuccess: () => invalidateTelemetry(qc) })} testId="button-generate-test-event"><Zap size={14}/>{ingest.isPending ? 'Recording…' : 'Generate test event'}</Button></>}>
    {overview.isError ? <Panel><State error onRetry={() => overview.refetch()}/></Panel> : overview.isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[1,2,3,4,5].map(n=><div key={n} className="skeleton h-32 rounded-xl"/>)}<Panel className="sm:col-span-2 xl:col-span-5"><State loading/></Panel></div> : data && <>
      {ingest.isError && <div className="mb-4 rounded-lg border border-[#ff5c70]/30 bg-[#ff5c70]/10 p-3 text-xs text-[#ff9aa6]" role="alert">Test event was not recorded. Please retry.</div>}
      <div className="mb-4 flex flex-wrap items-center gap-2"><span className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] ${data.telemetry_health === 'healthy' ? 'border-[#4ddba1]/20 bg-[#4ddba1]/10 text-[#4ddba1]' : 'border-[#f5b544]/20 bg-[#f5b544]/10 text-[#ffd780]'}`} data-testid="status-telemetry-health"><span className="h-1.5 w-1.5 rounded-full bg-current"/>{nice(data.telemetry_health)} telemetry</span><span className="rounded-full border border-[#273447] bg-[#101722] px-3 py-1.5 text-[10px] text-[#94a3b8]">Updated {dateTime(data.last_updated)}</span></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total events" value={countValue(data.total_events).toLocaleString()} context={data.total_events.context} icon={Activity} color="cyan"/>
        <MetricCard label="Suspicious events" value={countValue(data.suspicious_events).toLocaleString()} context={data.suspicious_events.context} icon={ShieldAlert} color="red"/>
        <MetricCard label="Unique sessions" value={countValue(data.unique_sessions).toLocaleString()} context={data.unique_sessions.context} icon={Network} color="amber"/>
        <MetricCard label="Active decoys" value={countValue(data.active_decoys).toLocaleString()} context={data.active_decoys.context} icon={Hexagon} color="green"/>
         <MetricCard label="Telemetry health" value={nice(data.telemetry_health)} context="SQLite and API response status" icon={Activity} color={data.telemetry_health === 'healthy' ? 'green' : 'red'}/>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Panel><PanelHead title="Activity stream" icon={Activity} meta={<Link href="/telemetry" className="text-[10px] text-[#52d8f2] hover:text-[#a1effc]" data-testid="link-view-all-events">View all <ArrowRight className="ml-1 inline" size={12}/></Link>}/><EventRows events={data.recent_events || []} compact onPick={(e) => setSelected(e.id)}/></Panel>
        <div className="space-y-4">
          <Panel><PanelHead title="Severity distribution" icon={ShieldAlert}/><div className="space-y-4 p-5">{['critical','high','medium','low','info'].map(s=>{const n=data.severity_counts?.[s] || 0; const total=Math.max(1,countValue(data.total_events)); return <div key={s}><div className="mb-1.5 flex items-center justify-between"><span className="flex items-center gap-2"><Severity value={s}/></span><span className={`${mono} text-[10px] text-[#94a3b8]`}>{n.toLocaleString()}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#202d3c]"><div className="h-full rounded-full" style={{width:`${Math.min(100,n/total*100)}%`,background:s==='critical'||s==='high'?'#ff5c70':s==='medium'?'#f5b544':'#52d8f2'}}/></div></div>})}</div></Panel>
          <Panel><PanelHead title="Decoy coverage" icon={Hexagon} meta={<Link href="/decoys" className="text-[10px] text-[#52d8f2]" data-testid="link-decoys-overview">Manage</Link>}/><div className="divide-y divide-[#273447]/70">{(data.decoys || []).slice(0,4).map(d=><div key={d.id} className="flex items-center justify-between px-4 py-3"><div className="flex items-center gap-3"><div className="rounded-lg bg-[#151f2c] p-2 text-[#94a3b8]"><DecoyGlyph id={d.id}/></div><div><p className="text-xs font-medium">{d.name}</p><p className="mt-0.5 text-[10px] text-[#718096]">{d.event_count} events · {nice(d.integration_type)}</p></div></div><StatusPill value={d.status}/></div>)}</div></Panel>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel><PanelHead title="Recent sessions" icon={Network} meta={<Link href="/sessions" className="text-[10px] text-[#52d8f2]" data-testid="link-all-sessions">All sessions</Link>}/><SessionRows sessions={(data.sessions || []).slice(0,5)}/></Panel>
        <Panel><PanelHead title="Signal activity" icon={BarChart3} meta={<span className="eyebrow !text-[9px]">RECENT BUCKETS</span>}/><MiniBars items={data.activity || []}/></Panel>
      </div>
    </>}
    <EventInspector eventId={selected} close={() => setSelected(null)}/>
  </AppShell>;
}

function DecoyGlyph({ id }: { id: string }) { const C = id === 'web' ? Globe2 : id === 'ssh' ? Terminal : id === 'database' ? Database : LockKeyhole; return <C size={15}/>; }
function MiniBars({ items }: { items: { bucket: string; count: number }[] }) {
  if (!items.length) return <State empty/>;
  const max = Math.max(1,...items.map(x=>x.count));
  return <div className="flex h-[158px] items-end gap-2 px-5 pb-4 pt-6">{items.map((x,i)=><div key={`${x.bucket}-${i}`} className="group flex min-w-0 flex-1 flex-col items-center gap-2"><div className="relative flex h-[108px] w-full items-end rounded-t-sm bg-[#151f2c]"><div title={`${x.count} events`} className="w-full rounded-t-sm bg-gradient-to-t from-[#52d8f2]/40 to-[#52d8f2]" style={{height:`${Math.max(4,x.count/max*100)}%`}}/></div><span className="mono w-full truncate text-center text-[8px] text-[#64748b]">{x.bucket}</span></div>)}</div>;
}
function SessionRows({ sessions }: { sessions: Session[] }) {
  if (!sessions.length) return <State empty/>;
  return <div className="divide-y divide-[#273447]/70">{sessions.map(s=><Link key={s.session_id} href={`/sessions/${encodeURIComponent(s.session_id)}`} data-testid={`row-session-${s.session_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#151f2c]/60 sm:px-5"><div className="rounded-lg bg-[#151f2c] p-2 text-[#52d8f2]"><Network size={14}/></div><div className="min-w-0 flex-1"><p className={`${mono} truncate text-[11px] text-[#dbe4ee]`}>{s.session_id}</p><p className="mt-1 text-[10px] text-[#718096]">{s.event_count} events · last {shortTime(s.last_seen)}</p></div><Severity value={s.highest_severity}/><ChevronRight size={14} className="text-[#64748b]"/></Link>)}</div>;
}

export function TelemetryPage() {
  const [q,setQ]=useState(()=>typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('q') || '');
  const [severity,setSeverity]=useState('');
  const [source,setSource]=useState('');
  const [eventType,setEventType]=useState('');
  const [range,setRange]=useState('all');
  const [sortBy,setSortBy]=useState<'timestamp'|'severity'|'event_type'>('timestamp');
  const [sortDirection,setSortDirection]=useState<'asc'|'desc'>('desc');
  const [selected,setSelected]=useState<string|null>(null);
  const [offset,setOffset]=useState(0);
  const [exportError,setExportError]=useState('');
  useEffect(()=>{
    const applyGlobalSearch:EventListener=(event)=>{
      const query=(event as unknown as CustomEvent<string>).detail;
      if(typeof query==='string'){setQ(query);setOffset(0);}
    };
    window.addEventListener('honeyprobe-global-search',applyGlobalSearch);
    return()=>window.removeEventListener('honeyprobe-global-search',applyGlobalSearch);
  },[]);
  const since = range === 'all' ? undefined : new Date(Date.now() - (range === '24h' ? 1 : range === '7d' ? 7 : 30) * 86400000).toISOString();
  const params = useMemo(()=>({
    limit:30, offset,
    ...(q.trim()?{q:q.trim()}:{}),
    ...(severity?{severity:severity as 'info'|'low'|'medium'|'high'|'critical'}:{}),
    ...(source?{source_type:source as 'web'|'ssh'|'database'|'mobile'}:{}),
    ...(eventType?{event_type:eventType}:{}),
    ...(since?{since}:{}),
    sort_by:sortBy,
    sort_direction:sortDirection,
  }),[q,severity,source,eventType,since,sortBy,sortDirection,offset]);
  const result=useGetEvents(params,{query:{queryKey:getGetEventsQueryKey(params)}});
  const csv=useExportEventsCsv(params,{query:{queryKey:getExportEventsCsvQueryKey(params),enabled:false}});
  const page=result.data;
  const exportFiltered=async()=>{
    setExportError('');
    const response=await csv.refetch();
    if(response.error||response.data===undefined){setExportError('Filtered CSV export failed. Check API health and retry.');return;}
    const url=URL.createObjectURL(new Blob([response.data],{type:'text/csv;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download='honeyprobe-filtered-events.csv';anchor.click();URL.revokeObjectURL(url);
  };
  return <AppShell title="Telemetry" subtitle="Search and investigate persisted event records. Every row links back to its originating decoy and session." action={<span className="rounded-full border border-[#273447] bg-[#101722] px-3 py-2 text-[10px] text-[#94a3b8]"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#52d8f2]"/>Event index</span>}>
    <Panel>
      <div className="flex flex-col gap-3 border-b border-[#273447] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]" size={15}/><input value={q} onChange={e=>{setQ(e.target.value);setOffset(0)}} placeholder="Search summary, target, session…" data-testid="input-event-search" className="h-10 w-full rounded-lg border border-[#273447] bg-[#0b1119] pl-9 pr-3 text-xs text-[#f1f5fa] outline-none placeholder:text-[#64748b] focus:border-[#f5b544]/60"/></label>
          <div className="flex flex-wrap gap-2">
            <select value={severity} onChange={e=>{setSeverity(e.target.value);setOffset(0)}} aria-label="Filter by severity" data-testid="select-severity-filter" className="h-10 min-w-28 rounded-lg border border-[#273447] bg-[#0b1119] px-3 text-xs text-[#cbd5e1]"><option value="">All severity</option>{['critical','high','medium','low','info'].map(s=><option key={s}>{s}</option>)}</select>
            <select value={source} onChange={e=>{setSource(e.target.value);setOffset(0)}} aria-label="Filter by source" data-testid="select-source-filter" className="h-10 min-w-28 rounded-lg border border-[#273447] bg-[#0b1119] px-3 text-xs text-[#cbd5e1]"><option value="">All sources</option>{['web','ssh','database','mobile'].map(s=><option key={s}>{s}</option>)}</select>
            <select value={eventType} onChange={e=>{setEventType(e.target.value);setOffset(0)}} aria-label="Filter by event type" data-testid="select-event-type-filter" className="h-10 min-w-36 rounded-lg border border-[#273447] bg-[#0b1119] px-3 text-xs text-[#cbd5e1]"><option value="">All event types</option>{['route_visit','login_attempt','protected_route_attempt','database_read_attempt','database_write_attempt','database_schema_probe_attempt','ssh_login_failed','ssh_login_success','ssh_command_attempt'].map(type=><option key={type} value={type}>{type.replaceAll('_',' ')}</option>)}</select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={range} onChange={e=>{setRange(e.target.value);setOffset(0)}} aria-label="Filter by time range" data-testid="select-event-range" className="h-9 rounded-lg border border-[#273447] bg-[#0b1119] px-3 text-[11px] text-[#cbd5e1]"><option value="all">All time</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value as typeof sortBy)} aria-label="Sort events by" data-testid="select-event-sort" className="h-9 rounded-lg border border-[#273447] bg-[#0b1119] px-3 text-[11px] text-[#cbd5e1]"><option value="timestamp">Sort: time</option><option value="severity">Sort: severity</option><option value="event_type">Sort: type</option></select>
          <Button testId="button-sort-direction" onClick={()=>setSortDirection(v=>v==='desc'?'asc':'desc')}><ArrowDown size={13}/>{sortDirection==='desc'?'Newest first':'Oldest first'}</Button>
          <Button testId="button-export-filtered-events" disabled={csv.isFetching} onClick={()=>void exportFiltered()}><Download size={13}/>{csv.isFetching?'Exporting…':'Export filtered CSV'}</Button>
          {exportError&&<span role="alert" className="text-[10px] text-[#ff8b99]">{exportError}</span>}
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 text-[10px] text-[#718096] sm:px-5"><span>{page ? `${page.total.toLocaleString()} events · showing ${page.items.length} per page` : 'Querying event stream'}</span><span className="eyebrow !text-[9px]"><Filter size={11} className="mr-1 inline"/>FILTERED VIEW</span></div>
      {result.isLoading ? <State loading/> : result.isError ? <State error onRetry={()=>result.refetch()}/> : <EventRows events={page?.items || []} onPick={e=>setSelected(e.id)}/>}
      {page && page.total > page.limit && <div className="flex items-center justify-between border-t border-[#273447] px-4 py-3"><span className="mono text-[10px] text-[#718096]">PAGE {Math.floor(offset/page.limit)+1} / {Math.ceil(page.total/page.limit)}</span><div className="flex gap-2"><Button testId="button-events-prev" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-(page.limit||30)))}><ArrowLeft size={13}/>Previous</Button><Button testId="button-events-next" disabled={offset+(page.limit||30)>=page.total} onClick={()=>setOffset(offset+(page.limit||30))}>Next<ArrowRight size={13}/></Button></div></div>}
    </Panel><EventInspector eventId={selected} close={()=>setSelected(null)}/>
  </AppShell>;
}

export function DecoysPage() {
  const qc=useQueryClient(); const decoys=useGetDecoys({query:{queryKey:getGetDecoysQueryKey()}}); const web=useRecordWebInteraction(); const db=useRecordDatabaseInteraction(); const cowrie=useImportCowrieEvents();
  const [showImport,setShowImport]=useState(false); const [raw,setRaw]=useState(''); const [notice,setNotice]=useState('');
  const refresh=()=>invalidateTelemetry(qc);
  const submitCowrie=()=>{try{const parsed=JSON.parse(raw) as Array<{eventid:string;src_ip?:string;session?:string;timestamp?:string;message:string}>; if(!Array.isArray(parsed)||!parsed.length) throw new Error(); cowrie.mutate({data:{entries:parsed}}, {onSuccess:r=>{setNotice(`${r.imported} Cowrie records imported.`);setShowImport(false);refresh()},onError:()=>setNotice('Import rejected. Check the record format and try again.')})}catch{setNotice('Provide a JSON array of Cowrie records before importing.')}}
  return <AppShell title="Decoy integrations" subtitle="Integration state is reported by the API. Not configured does not mean connected; demo mode remains visibly distinct." action={<Button testId="button-refresh-decoys" onClick={()=>decoys.refetch()}><RefreshCw size={14}/>Refresh status</Button>}>
    {notice&&<div role="status" className="mb-4 rounded-lg border border-[#52d8f2]/20 bg-[#52d8f2]/5 px-4 py-3 text-xs text-[#9ceafa]" data-testid="status-decoy-notice">{notice}</div>}
    {decoys.isLoading?<div className="grid gap-4 lg:grid-cols-2">{[1,2,3,4].map(i=><div key={i} className="skeleton h-52 rounded-xl"/>)} </div>:decoys.isError?<Panel><State error onRetry={()=>decoys.refetch()}/></Panel>:!decoys.data?.length?<Panel><State empty/></Panel>:<div className="grid gap-4 lg:grid-cols-2">{decoys.data.map(d=><Panel key={d.id} className="overflow-hidden"><div className="flex items-start gap-4 p-5"><div className="rounded-xl border border-[#273447] bg-[#151f2c] p-3 text-[#f5b544]"><DecoyGlyph id={d.id}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">{d.name}</h2><p className="mt-1 text-[10px] text-[#718096]">{d.integration_type}</p></div><StatusPill value={d.status}/></div><p className="mt-4 text-xs leading-5 text-[#94a3b8]">{d.description}</p><div className="mt-4 flex items-center justify-between border-t border-[#273447] pt-3"><span className="text-[10px] text-[#718096]">{d.event_count.toLocaleString()} recorded events</span><span className={`${mono} text-[9px] text-[#64748b]`}>{d.last_event_at?`LAST ${dateTime(d.last_event_at)}`:'NO RECENT EVENT'}</span></div></div></div><div className="border-t border-[#273447] bg-[#0c121b]/70 p-5"><p className="eyebrow mb-2">SETUP GUIDANCE</p><p className="text-[11px] leading-5 text-[#94a3b8]">{d.setup_instructions}</p>{d.id==='mobile'&&<div className="mt-4 rounded-lg border border-[#273447] bg-[#0b1119] p-3"><p className="eyebrow mb-2">EXPECTED MOBILE EVENT SHAPE</p><pre className="overflow-auto text-[9px] leading-4 text-[#52d8f2]">{JSON.stringify({source_type:'mobile',event_type:'device_probe',severity:'low',target:'android://research-device',summary:'Synthetic Android probe sample',metadata:{platform:'android',app_version:'0.1.0'},environment:'test',ingestion_source:'mobile_adapter'},null,2)}</pre><p className="mt-2 text-[9px] text-[#718096]">Example only; no Android app is connected.</p></div>}{d.id==='web'&&<Link href="/decoy" data-testid="link-launch-web-decoy" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#f5b544]/30 bg-[#f5b544]/10 px-3 py-2 text-[11px] font-semibold text-[#ffd780] hover:bg-[#f5b544]/15"><Globe2 size={13}/>Open fictional web decoy<ArrowRight size={13}/></Link>}</div></Panel>)}</div>}
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Panel><PanelHead title="Safe interaction simulators" icon={ShieldCheck}/><div className="p-5"><p className="mb-4 text-xs leading-5 text-[#94a3b8]">Record controlled test signals against supported decoys. These mutations create real test records in the event stream.</p><div className="flex flex-wrap gap-2"><Button variant="primary" disabled={web.isPending} onClick={()=>web.mutate({data:{route:'/admin',interaction:'protected_route_attempt',method:'GET'}},{onSuccess:refresh})} testId="button-simulate-web"><Globe2 size={14}/>{web.isPending?'Recording…':'Simulate web probe'}</Button><Button disabled={db.isPending} onClick={()=>db.mutate({data:{operation_category:'schema_probe',target:'research-db.local'}} ,{onSuccess:refresh})} testId="button-simulate-database"><Database size={14}/>{db.isPending?'Recording…':'Simulate database probe'}</Button></div>{(web.isError||db.isError)&&<p role="alert" className="mt-3 text-xs text-[#ff8b99]">Interaction could not be recorded. Check API health and retry.</p>}</div></Panel>
      <Panel><PanelHead title="Cowrie log import" icon={Terminal} meta={<span className="eyebrow !text-[9px]">MAX 250 RECORDS</span>}/><div className="p-5"><p className="mb-4 text-xs leading-5 text-[#94a3b8]">Validate and ingest a bounded set of Cowrie-style SSH log records.</p>{showImport?<><textarea value={raw} onChange={e=>setRaw(e.target.value)} rows={4} placeholder='[{"eventid":"cowrie.login.failed","message":"Failed login","src_ip":"192.0.2.8"}]' data-testid="input-cowrie-json" className="w-full rounded-lg border border-[#273447] bg-[#0b1119] p-3 font-mono text-[10px] text-[#cbd5e1] outline-none placeholder:text-[#526174] focus:border-[#f5b544]/60"/><div className="mt-3 flex gap-2"><Button variant="primary" disabled={cowrie.isPending} onClick={submitCowrie} testId="button-submit-cowrie"><ArrowDownToLine size={13}/>{cowrie.isPending?'Importing…':'Validate & import'}</Button><Button onClick={()=>setShowImport(false)} testId="button-cancel-cowrie">Cancel</Button></div></>:<Button onClick={()=>setShowImport(true)} testId="button-open-cowrie-import"><Code2 size={14}/>Paste Cowrie records</Button>}</div></Panel>
    </div>
  </AppShell>;
}

export function SessionsPage() {
  const [q,setQ]=useState('');const [status,setStatus]=useState('');
  const params=useMemo(()=>({limit:50,offset:0,...(q?{q}:{}),...(status?{severity:status as 'info'|'low'|'medium'|'high'|'critical'}:{})}),[q,status]);
  const sessions=useGetSessions(params,{query:{queryKey:getGetSessionsQueryKey(params)}});
  return <AppShell title="Sessions" subtitle="Correlated decoy activity, grouped into investigator-ready threads.">
    <Panel><div className="flex flex-col gap-3 border-b border-[#273447] p-4 sm:flex-row"><label className="relative flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Find a session ID…" data-testid="input-session-search" className="h-10 w-full rounded-lg border border-[#273447] bg-[#0b1119] pl-9 pr-3 text-xs outline-none placeholder:text-[#64748b] focus:border-[#f5b544]/60"/></label><select value={status} onChange={e=>setStatus(e.target.value)} data-testid="select-session-severity" className="h-10 rounded-lg border border-[#273447] bg-[#0b1119] px-3 text-xs"><option value="">All severities</option>{['critical','high','medium','low','info'].map(s=><option key={s}>{s}</option>)}</select></div>
      {sessions.isLoading?<State loading/>:sessions.isError?<State error onRetry={()=>sessions.refetch()}/>:!sessions.data?.items.length?<State empty/>:<div className="divide-y divide-[#273447]/70">{sessions.data.items.map(s=><Link key={s.session_id} href={`/sessions/${encodeURIComponent(s.session_id)}`} data-testid={`row-session-${s.session_id}`} className="grid gap-3 px-4 py-4 transition-colors hover:bg-[#151f2c]/50 sm:grid-cols-[minmax(0,1.4fr)_1fr_1fr_auto] sm:items-center sm:px-5"><div className="flex min-w-0 items-center gap-3"><div className="rounded-lg bg-[#52d8f2]/10 p-2.5 text-[#52d8f2]"><Network size={15}/></div><div className="min-w-0"><p className={`${mono} truncate text-xs text-[#e2e8f0]`}>{s.session_id}</p><p className="mt-1 text-[10px] text-[#718096]">{s.source_types.join(' · ') || 'source unknown'}</p></div></div><div><p className="eyebrow">ACTIVITY</p><p className="mt-1 text-[11px] text-[#cbd5e1]">{s.event_count} events <span className="text-[#64748b]">·</span> {s.event_categories.join(', ') || 'uncategorized'}</p></div><div><p className="eyebrow">LAST SEEN</p><p className={`${mono} mt-1 text-[10px] text-[#cbd5e1]`}>{dateTime(s.last_seen)}</p></div><div className="flex items-center gap-2"><Severity value={s.highest_severity}/><StatusPill value={s.investigation_status}/><ChevronRight size={15} className="text-[#64748b]"/></div></Link>)}</div>}
      {sessions.data&&<div className="border-t border-[#273447] px-5 py-3 text-[10px] text-[#718096]">{sessions.data.total} correlated sessions</div>}
    </Panel>
  </AppShell>;
}

export function SessionDetailPage() {
  const {id}=useParams<{id:string}>();const sessionId=decodeURIComponent(id||'');
  const detail=useGetSession(sessionId,{query:{queryKey:getGetSessionQueryKey(sessionId),enabled:!!sessionId}});
  const status=useUpdateSessionStatus();const qc=useQueryClient();const s=detail.data?.session;const events=detail.data?.events||[];
  const change=(v:'unreviewed'|'investigating'|'resolved')=>status.mutate({sessionId,data:{investigation_status:v}},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getGetSessionQueryKey(sessionId)});void qc.invalidateQueries({queryKey:getGetSessionsQueryKey()});void qc.invalidateQueries({queryKey:getGetOverviewQueryKey()});void qc.invalidateQueries({queryKey:getGetAnalyticsQueryKey()});void qc.invalidateQueries({queryKey:getGetReportSummaryQueryKey()})}});
  return <AppShell title="Session investigation" subtitle="A chronological sequence of observations, with analyst status tracked separately from event evidence." action={<Link href="/sessions" className="inline-flex items-center gap-2 rounded-lg border border-[#273447] bg-[#151f2c] px-3.5 py-2 text-xs text-[#cbd5e1]" data-testid="link-back-sessions"><ArrowLeft size={14}/>Sessions</Link>}>
    {detail.isLoading?<Panel><State loading/></Panel>:detail.isError?<Panel><State error onRetry={()=>detail.refetch()}/></Panel>:s&&<div className="space-y-4">
      <Panel><div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"><div><p className="eyebrow">SESSION IDENTIFIER</p><h2 className={`${mono} mt-2 break-all text-lg font-medium`}>{s.session_id}</h2><div className="mt-3 flex flex-wrap gap-2"><Severity value={s.highest_severity}/><StatusPill value={s.investigation_status}/></div></div><div className="flex flex-wrap gap-2"><select defaultValue={s.investigation_status} onChange={e=>change(e.target.value as 'unreviewed'|'investigating'|'resolved')} disabled={status.isPending} data-testid="select-investigation-status" className="h-9 rounded-lg border border-[#273447] bg-[#0b1119] px-3 text-xs capitalize"><option value="unreviewed">Unreviewed</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select></div></div><div className="grid grid-cols-2 border-t border-[#273447] sm:grid-cols-4">{[['Events',s.event_count],['Sources',s.source_types.join(', ')||'—'],['First seen',dateTime(s.first_seen)],['Last seen',dateTime(s.last_seen)]].map(([k,v])=><div key={String(k)} className="border-r border-[#273447] p-4 last:border-r-0"><p className="eyebrow">{k}</p><p className={`${mono} mt-2 break-words text-[10px] text-[#cbd5e1]`}>{v}</p></div>)}</div></Panel>
      {status.isError&&<p role="alert" className="text-xs text-[#ff8b99]">Investigation status could not be updated.</p>}
      <Panel><PanelHead title="Event timeline" icon={Clock3} meta={<span className="eyebrow !text-[9px]">{events.length} RECORDS</span>}/>{!events.length?<State empty/>:<div className="relative p-4 sm:p-6">{events.map((e,i)=><div key={e.id} className="relative flex gap-4 pb-6 last:pb-0" data-testid={`timeline-event-${e.id}`}><div className="relative flex w-5 shrink-0 justify-center"><span className={`z-10 mt-1.5 h-2.5 w-2.5 rounded-full ${e.severity==='critical'||e.severity==='high'?'bg-[#ff5c70]':'bg-[#52d8f2]'}`}/>{i<events.length-1&&<span className="absolute top-4 h-full w-px bg-[#273447]"/>}</div><div className="panel-soft min-w-0 flex-1 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">{e.event_type}</span><Severity value={e.severity}/></div><span className={`${mono} text-[9px] text-[#718096]`}>{dateTime(e.timestamp)}</span></div><p className="mt-2 text-xs leading-5 text-[#aab6c5]">{e.summary}</p><div className={`${mono} mt-3 flex flex-wrap gap-3 text-[9px] text-[#718096]`}><span>{e.source_address||'unknown source'}</span><span>→ {e.target}</span><span>{nice(e.source_type)}</span></div></div></div>)}</div>}</Panel>
    </div>}
  </AppShell>;
}

export function AnalyticsPage() {
  const [period,setPeriod]=useState('7d');const from=period==='24h'?new Date(Date.now()-86400000).toISOString():period==='30d'?new Date(Date.now()-30*86400000).toISOString():new Date(Date.now()-7*86400000).toISOString();
  const params=useMemo(()=>({since:from}),[from]);const query=useGetAnalytics(params,{query:{queryKey:getGetAnalyticsQueryKey(params)}});const d=query.data;
  return <AppShell title="Analytics" subtitle="Measure patterns in observed and synthetic telemetry without blending the two signals." action={<select value={period} onChange={e=>setPeriod(e.target.value)} data-testid="select-analytics-period" className="h-9 rounded-lg border border-[#273447] bg-[#101722] px-3 text-xs"><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select>}>
    {query.isLoading?<div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-28 rounded-xl"/><div className="skeleton h-28 rounded-xl"/><div className="skeleton h-28 rounded-xl"/></div>:query.isError?<Panel><State error onRetry={()=>query.refetch()}/></Panel>:d&&<>
      <div className="grid gap-3 sm:grid-cols-3"><MetricCard label="All events" value={d.total_events.toLocaleString()} context="Within selected period" icon={Activity} color="cyan"/><MetricCard label="Observed" value={d.observed_events.toLocaleString()} context="Real decoy interactions" icon={Eye} color="green"/><MetricCard label="Demo events" value={d.demo_events.toLocaleString()} context="Synthetic test data" icon={Code2} color="amber"/></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]"><Panel><PanelHead title="Events over time" icon={BarChart3}/><MiniBars items={d.events_over_time}/></Panel><Panel><PanelHead title="Source composition" icon={Network}/><Breakdown values={d.source_counts}/></Panel></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2"><Panel><PanelHead title="Severity profile" icon={ShieldAlert}/><Breakdown values={d.severity_counts} severity/></Panel><Panel><PanelHead title="Event categories" icon={Layers3}/><Breakdown values={d.category_counts}/></Panel></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2"><Panel><PanelHead title="Top target routes" icon={Globe2}/>{d.top_routes.length?<div className="divide-y divide-[#273447]/70">{d.top_routes.map(r=><div key={r.route} className="flex items-center justify-between gap-3 px-5 py-3"><span className={`${mono} truncate text-[11px] text-[#cbd5e1]`}>{r.route}</span><span className="rounded-md bg-[#52d8f2]/10 px-2 py-1 text-[10px] text-[#52d8f2]">{r.count}</span></div>)}</div>:<State empty/>}</Panel><Panel><PanelHead title="Session activity" icon={Network}/><SessionRows sessions={d.session_activity.slice(0,7)}/></Panel></div>
    </>}
  </AppShell>;
}
function Breakdown({ values, severity=false }: { values: Record<string,number>; severity?: boolean }) {
  const entries=Object.entries(values||{}).sort((a,b)=>b[1]-a[1]);const max=Math.max(1,...entries.map(x=>x[1]));
  return entries.length?<div className="space-y-4 p-5">{entries.map(([k,v],i)=><div key={k}><div className="mb-1.5 flex items-center justify-between">{severity?<Severity value={k}/>:<span className="text-xs capitalize text-[#cbd5e1]">{nice(k)}</span>}<span className={`${mono} text-[10px] text-[#94a3b8]`}>{v}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#202d3c]"><div className="h-full rounded-full" style={{width:`${v/max*100}%`,background:['#52d8f2','#f5b544','#4ddba1','#9e88d5'][i%4]}}/></div></div>)}</div>:<State empty/>;
}

export function SelfTestPage() {
  const query=useGetSelfTests({query:{queryKey:getGetSelfTestsQueryKey()}});const run=useRunSelfTests();const qc=useQueryClient();const tests=query.data as SelfTestResult[]|undefined;
  const execute=()=>run.mutate(undefined,{onSuccess:()=>{void qc.invalidateQueries({queryKey:getGetSelfTestsQueryKey()});void qc.invalidateQueries({queryKey:getGetSystemHealthQueryKey()});void qc.invalidateQueries({queryKey:getHealthCheckQueryKey()})}});
  return <AppShell title="Self-test" subtitle="Validate the platform's own telemetry path before interpreting your research signals." action={<Button variant="primary" disabled={run.isPending} onClick={execute} testId="button-run-self-tests"><Play size={14}/>{run.isPending?'Running diagnostics…':'Run self-test'}</Button>}>
    {run.isError&&<div role="alert" className="mb-4 rounded-lg border border-[#ff5c70]/30 bg-[#ff5c70]/10 p-3 text-xs text-[#ff9aa6]">Self-test run failed to complete. Review API health and retry.</div>}
    <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><Panel><PanelHead title="Diagnostic checks" icon={ShieldCheck} meta={tests&&<span className="eyebrow !text-[9px]">{tests.filter(t=>t.status==='pass').length}/{tests.length} PASS</span>}/>{query.isLoading?<State loading/>:query.isError?<State error onRetry={()=>query.refetch()}/>:!tests?.length?<State empty/>:<div className="divide-y divide-[#273447]/70">{tests.map((t,i)=><div key={t.name} data-testid={`self-test-${t.name}`} className="flex items-start gap-3 px-5 py-4"><div className={`mt-0.5 rounded-lg p-2 ${t.status==='pass'?'bg-[#4ddba1]/10 text-[#4ddba1]':t.status==='fail'?'bg-[#ff5c70]/10 text-[#ff5c70]':'bg-[#151f2c] text-[#94a3b8]'}`}>{t.status==='pass'?<CheckCircle2 size={15}/>:t.status==='fail'?<AlertTriangle size={15}/>:<CircleHelp size={15}/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{t.name}</p><StatusPill value={t.status}/></div><p className="mt-1.5 text-[11px] leading-5 text-[#94a3b8]">{t.diagnostic}</p><p className={`${mono} mt-2 text-[9px] text-[#64748b]`}>{t.duration_ms} ms {t.last_run&&`· ${dateTime(t.last_run)}`}</p></div></div>)}</div>}</Panel><div className="space-y-4"><Panel><PanelHead title="Test protocol" icon={FileClock}/><div className="space-y-4 p-5">{[['01','Connectivity','Confirm the API accepts requests.'],['02','Persistence','Validate event storage and retrieval.'],['03','Correlation','Check session grouping and indices.'],['04','Decoy adapters','Review available integration health.']].map(([n,t,d])=><div key={n} className="flex gap-3"><span className={`${mono} text-[10px] text-[#f5b544]`}>{n}</span><div><p className="text-xs font-medium">{t}</p><p className="mt-1 text-[10px] leading-4 text-[#718096]">{d}</p></div></div>)}</div></Panel><div className="rounded-xl border border-[#52d8f2]/20 bg-[#52d8f2]/5 p-4"><div className="flex gap-3"><Shield className="mt-0.5 shrink-0 text-[#52d8f2]" size={16}/><div><p className="text-xs font-semibold text-[#b8f4fc]">Safe by design</p><p className="mt-1 text-[11px] leading-5 text-[#94a3b8]">Self-tests validate the local platform only. They do not scan external hosts or systems.</p></div></div></div></div></div>
  </AppShell>;
}

export function ReportsPage() {
  const today = new Date().toISOString().slice(0,10);
  const weekAgo = new Date(Date.now()-7*86400000).toISOString().slice(0,10);
  const [startDate,setStartDate]=useState(weekAgo);const [endDate,setEndDate]=useState(today);const [severity,setSeverity]=useState('');const [source,setSource]=useState('');
  const since=startDate?new Date(`${startDate}T00:00:00.000Z`).toISOString():undefined;
  const until=endDate?new Date(`${endDate}T23:59:59.999Z`).toISOString():undefined;
  const params=useMemo(()=>({...since?{since}:{},...until?{until}:{},...(severity?{severity:severity as 'info'|'low'|'medium'|'high'|'critical'}:{}),...(source?{source_type:source as 'web'|'ssh'|'database'|'mobile'}:{})}),[since,until,severity,source]);
  const report=useGetReportSummary(params,{query:{queryKey:getGetReportSummaryQueryKey(params)}});const csv=useExportReportCsv(params,{query:{queryKey:getExportReportCsvQueryKey(params),enabled:false}});const html=useExportReportHtml(params,{query:{queryKey:getExportReportHtmlQueryKey(params),enabled:false}});
  const [exportError,setExportError]=useState('');
  const download=(content:string,name:string,mime:string)=>{const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)};
  const exportCsv=async()=>{setExportError('');try{const r=await csv.refetch();if(r.data)download(r.data,'honeyprobe-report.csv','text/csv;charset=utf-8')}catch{setExportError('CSV export failed. Try again.')}}
  const exportHtml=async()=>{setExportError('');try{const r=await html.refetch();if(r.data)download(r.data,'honeyprobe-report.html','text/html;charset=utf-8')}catch{setExportError('Printable report export failed. Try again.')}}
  const d=report.data;
  return <AppShell title="Reports" subtitle="Build a period-based snapshot for review, handoff, and controlled-lab validation." action={<><Button onClick={exportHtml} disabled={html.isFetching} testId="button-export-html"><FileText size={14}/>{html.isFetching?'Preparing…':'Printable HTML'}</Button><Button variant="primary" onClick={exportCsv} disabled={csv.isFetching} testId="button-export-csv"><Download size={14}/>{csv.isFetching?'Preparing…':'Export CSV'}</Button></>}>
    <Panel><div className="grid gap-3 border-b border-[#273447] p-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-[10px] text-[#94a3b8]">FROM DATE<input type="date" value={startDate} max={today} onChange={e=>setStartDate(e.target.value)} data-testid="input-report-start-date" className="mt-1.5 h-10 w-full rounded-lg border border-[#273447] bg-[#0b1119] px-3 text-xs text-[#e2e8f0]"/></label><label className="text-[10px] text-[#94a3b8]">TO DATE<input type="date" value={endDate} max={today} onChange={e=>setEndDate(e.target.value)} data-testid="input-report-end-date" className="mt-1.5 h-10 w-full rounded-lg border border-[#273447] bg-[#0b1119] px-3 text-xs text-[#e2e8f0]"/></label><label className="text-[10px] text-[#94a3b8]">SEVERITY<select value={severity} onChange={e=>setSeverity(e.target.value)} data-testid="select-report-severity" className="mt-1.5 h-10 w-full rounded-lg border border-[#273447] bg-[#0b1119] px-3 text-xs text-[#e2e8f0]"><option value="">All severities</option>{['critical','high','medium','low','info'].map(x=><option key={x}>{x}</option>)}</select></label><label className="text-[10px] text-[#94a3b8]">SOURCE<select value={source} onChange={e=>setSource(e.target.value)} data-testid="select-report-source" className="mt-1.5 h-10 w-full rounded-lg border border-[#273447] bg-[#0b1119] px-3 text-xs text-[#e2e8f0]"><option value="">All sources</option>{['web','ssh','database','mobile'].map(x=><option key={x}>{x}</option>)}</select></label></div>
    {exportError&&<p role="alert" className="px-5 pt-4 text-xs text-[#ff8b99]">{exportError}</p>}
    {report.isLoading?<State loading/>:report.isError?<State error onRetry={()=>report.refetch()}/>:d&&<><div className="flex flex-col justify-between gap-3 border-b border-[#273447] px-5 py-4 sm:flex-row sm:items-center"><div><p className="eyebrow">REPORT SNAPSHOT</p><p className="mt-1 text-xs text-[#cbd5e1]">{d.period_start?dateTime(d.period_start):'Period start unavailable'} — {d.period_end?dateTime(d.period_end):'Now'}</p></div><div className="flex flex-wrap items-center gap-2"><span className={`${d.includes_demo_data?'border-[#f5b544]/25 bg-[#f5b544]/10 text-[#ffd780]':'border-[#4ddba1]/25 bg-[#4ddba1]/10 text-[#4ddba1]'} rounded-full border px-3 py-1.5 text-[10px]`} data-testid="status-report-demo">{d.includes_demo_data?'Includes synthetic demo data':'Observed data only'}</span><span className={`${mono} text-[10px] text-[#718096]`}>Generated {dateTime(d.generated_at)}</span></div></div><div className="grid gap-3 border-b border-[#273447] p-4 sm:grid-cols-4"><MetricCard label="Events" value={d.total_events} icon={Activity} color="cyan"/><MetricCard label="Active sessions" value={d.active_sessions.length} icon={Network} color="amber"/><MetricCard label="Critical" value={d.severity_counts.critical||0} icon={AlertTriangle} color="red"/><MetricCard label="Sources" value={Object.keys(d.source_counts).length} icon={Globe2} color="green"/></div><div className="grid gap-4 p-4 lg:grid-cols-3"><div className="panel-soft"><p className="eyebrow px-4 py-3">SEVERITY COUNTS</p><Breakdown values={d.severity_counts} severity/></div><div className="panel-soft"><p className="eyebrow px-4 py-3">EVENT CATEGORIES</p><Breakdown values={d.category_counts}/></div><div className="panel-soft"><p className="eyebrow px-4 py-3">SOURCE TYPES</p><Breakdown values={d.source_counts}/></div></div><div className="border-t border-[#273447]"><PanelHead title="Included event records" icon={FileText} meta={<span className="eyebrow !text-[9px]">{d.events.length} EVENTS</span>}/><EventRows events={d.events.slice(0,20)}/></div></>}</Panel>
  </AppShell>;
}

export function SettingsPage() {
  const health=useGetSystemHealth({query:{queryKey:getGetSystemHealthQueryKey()}});const ping=useHealthCheck({query:{queryKey:getHealthCheckQueryKey()}});const decoys=useGetDecoys({query:{queryKey:getGetDecoysQueryKey()}});const qc=useQueryClient();const generate=useGenerateDemoEvents();const reset=useResetDemoEvents();const [count,setCount]=useState(8);const [message,setMessage]=useState('');const [timeFormat,setTimeFormat]=useState(()=>typeof localStorage==='undefined'?'local':localStorage.getItem('honeyprobe-time-format')||'local');
  const runGenerate=()=>generate.mutate({data:{count}},{onSuccess:r=>{setMessage(`${r.created} synthetic events generated.`);invalidateTelemetry(qc)}});const runReset=()=>{if(window.confirm('Remove synthetic demo events? Observed events will be preserved.'))reset.mutate(undefined,{onSuccess:r=>{setMessage(`${r.deleted} synthetic events removed. Observed data was preserved.`);invalidateTelemetry(qc)}})};
  return <AppShell title="Settings" subtitle="Runtime information and deliberate controls for synthetic lab data." action={<Button onClick={()=>{void health.refetch();void ping.refetch();void decoys.refetch()}} testId="button-refresh-health"><RefreshCw size={14}/>Refresh health</Button>}>
    {message&&<div role="status" className="mb-4 rounded-lg border border-[#4ddba1]/20 bg-[#4ddba1]/5 px-4 py-3 text-xs text-[#80e9bc]" data-testid="status-settings-message">{message}</div>}
    <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
      <div className="space-y-4">
        <Panel>
          <PanelHead title="System health" icon={Activity}/>
          {health.isLoading ? <State loading/> : health.isError ? <State error onRetry={() => health.refetch()}/> : health.data ? (
            <div className="divide-y divide-[#273447]/70">
              <div className="flex items-center justify-between px-5 py-4"><div><p className="text-xs font-semibold">Service API</p><p className="mt-1 text-[10px] text-[#718096]">Compatibility endpoint</p></div><StatusPill value={ping.data?.status || 'unavailable'}/></div>
              <div className="flex items-center justify-between px-5 py-4"><div><p className="text-xs font-semibold">HoneyProbe API</p><p className="mt-1 text-[10px] text-[#718096]">System readiness</p></div><StatusPill value={health.data.status}/></div>
              <div className="flex items-center justify-between px-5 py-4"><div><p className="text-xs font-semibold">Event store</p><p className="mt-1 text-[10px] text-[#718096]">{health.data.database.engine} · {health.data.database.path_label}</p></div><StatusPill value={health.data.database.status}/></div>
              <div className="grid grid-cols-2 gap-3 p-5">
                <div className="rounded-lg border border-[#273447] bg-[#0b1119] p-3"><p className="eyebrow">ENVIRONMENT</p><p className={`${mono} mt-2 text-xs capitalize text-[#52d8f2]`} data-testid="text-environment">{nice(health.data.environment)}</p></div>
                <div className="rounded-lg border border-[#273447] bg-[#0b1119] p-3"><p className="eyebrow">CHECKED AT</p><p className={`${mono} mt-2 text-[10px] text-[#cbd5e1]`}>{dateTime(health.data.checked_at)}</p></div>
              </div>
            </div>
          ) : null}
        </Panel>
        <Panel><PanelHead title="Decoy integration status" icon={Hexagon}/>{decoys.isLoading?<State loading/>:decoys.isError?<State error onRetry={()=>decoys.refetch()}/>:<div className="divide-y divide-[#273447]/70">{(decoys.data||[]).map(d=><div key={d.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="text-xs font-medium">{d.name}</p><p className="mt-1 truncate text-[10px] text-[#718096]">{d.integration_type}</p></div><StatusPill value={d.status}/></div>)}</div>}</Panel>
        <Panel><PanelHead title="Display and retention" icon={Clock3}/><div className="space-y-4 p-5"><label className="block text-[10px] text-[#94a3b8]">TIMESTAMP DISPLAY<select value={timeFormat} onChange={e=>{const value=e.target.value;localStorage.setItem('honeyprobe-time-format',value);setTimeFormat(value)}} data-testid="select-time-format" className="mt-1.5 h-10 w-full rounded-lg border border-[#273447] bg-[#0b1119] px-3 text-xs text-[#e2e8f0]"><option value="local">Browser local time</option><option value="utc">UTC</option></select></label><p className="text-[10px] leading-5 text-[#718096]">No automatic event-retention or pruning policy is configured. Events persist in the local SQLite store; demo reset removes only synthetic test records.</p></div></Panel>
        <Panel><PanelHead title="Workspace safeguards" icon={ShieldCheck}/><div className="divide-y divide-[#273447]/70">{[['Isolation','Signals are scoped to a controlled lab environment.'],['Synthetic labels','Generated test records retain their demo provenance.'],['Evidence integrity','Observed event records are not changed by analyst session-status updates.'],['Credential safety','The fictional decoy sign-in form does not transmit or store passwords.'],['Operator access','The dashboard and data API require a verified account on the server-side email allowlist.'],['Deployment boundary','Keep this app in an isolated lab and review network exposure before publishing.']].map(([k,v])=><div key={k} className="flex items-start gap-3 px-5 py-3.5"><Check size={14} className="mt-0.5 text-[#4ddba1]"/><div><p className="text-xs font-medium">{k}</p><p className="mt-1 text-[10px] leading-4 text-[#718096]">{v}</p></div></div>)}</div></Panel>
      </div>
    <div className="space-y-4"><Panel><PanelHead title="Demo data controls" icon={Code2} meta={<span className="rounded-full border border-[#f5b544]/20 bg-[#f5b544]/10 px-2 py-1 text-[9px] text-[#ffd780]">SYNTHETIC ONLY</span>}/><div className="p-5"><p className="text-xs leading-5 text-[#94a3b8]">Generate controlled synthetic events for interface validation. Reset removes only synthetic records and preserves observed events.</p><label className="mt-5 block text-[10px] text-[#94a3b8]">EVENT COUNT <span className={`${mono} ml-1 text-[#ffd780]`}>{count}</span><input type="range" min="1" max="30" value={count} onChange={e=>setCount(Number(e.target.value))} data-testid="input-demo-count" className="mt-2 block w-full accent-[#f5b544]"/></label><div className="mt-4 flex flex-wrap gap-2"><Button variant="primary" disabled={generate.isPending} onClick={runGenerate} testId="button-generate-demo"><Zap size={14}/>{generate.isPending?'Generating…':'Generate synthetic events'}</Button><Button variant="danger" disabled={reset.isPending} onClick={runReset} testId="button-reset-demo"><RefreshCw size={14}/>{reset.isPending?'Resetting…':'Reset demo data'}</Button></div>{(generate.isError||reset.isError)&&<p role="alert" className="mt-3 text-xs text-[#ff8b99]">The requested demo-data action failed. Check environment policy and retry.</p>}</div><div className="border-t border-[#273447] bg-[#0c121b]/60 px-5 py-3 text-[10px] leading-5 text-[#718096]">Demo-data availability is governed by the API environment. This screen does not assume generation is enabled.</div></Panel>
      <Panel><PanelHead title="Quick links" icon={ExternalLink}/><div className="divide-y divide-[#273447]/70">{[[ '/decoy','Fictional web decoy','See the monitored web surface',Globe2],['/self-test','Platform self-test','Run integration diagnostics',ShieldCheck],['/reports','Report builder','Export a filtered evidence summary',FileText]].map(([href,label,desc,Icon])=>{const I=Icon as typeof Activity;return <Link key={String(href)} href={String(href)} data-testid={`link-quick-${String(label).toLowerCase().replaceAll(' ','-')}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#151f2c]/60"><I size={15} className="text-[#f5b544]"/><div className="flex-1"><p className="text-xs font-medium">{String(label)}</p><p className="mt-1 text-[10px] text-[#718096]">{String(desc)}</p></div><ChevronRight size={14} className="text-[#64748b]"/></Link>})}</div></Panel></div></div>
  </AppShell>;
}
export function DecoySite() {
  const [path,setPath]=useLocation();const web=useRecordWebInteraction();const [username,setUsername]=useState('');const [result,setResult]=useState('');const qc=useQueryClient();
  const [sessionId]=useState(()=>{try{const key='honeyprobe-decoy-session';const existing=sessionStorage.getItem(key);if(existing)return existing;const generated=globalThis.crypto?.randomUUID?.()||`web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;sessionStorage.setItem(key,generated);return generated}catch{return `web_${Date.now().toString(36)}`}});
  const route=path.replace('/decoy','')||'/';
  const record=useCallback((interaction:'route_visit'|'protected_route_attempt'|'login_attempt',usernameValue?:string,routeValue=route)=>{
    if(interaction==='route_visit')return;
    if(interaction==='protected_route_attempt'&&routeValue==='/admin'&&route!=='/admin')return;
    web.mutate({data:{route:routeValue||'/',interaction,method:interaction==='login_attempt'?'POST':'GET',session_id:sessionId,...(usernameValue?{username:usernameValue}:{})}},{onSuccess:()=>invalidateTelemetry(qc),onError:()=>setResult('This interaction could not be recorded right now.')});
  },[route,sessionId,web.mutate,qc]);
  const lastTrackedRoute=useRef<string|null>(null);
  useEffect(()=>{
    if(lastTrackedRoute.current===route)return;
    lastTrackedRoute.current=route;
    const interaction=route==='/admin'?'protected_route_attempt':'route_visit';
    web.mutate({data:{route:route||'/',interaction,method:'GET',session_id:sessionId}},{onSuccess:()=>invalidateTelemetry(qc),onError:()=>setResult('This interaction could not be recorded right now.')});
  },[route,sessionId,web.mutate,qc]);
  const navigate=(to:string)=>{setPath(`/decoy${to==='/'?'':to}`);setResult('');};
  const submitLogin=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();record('login_attempt',username.trim()||undefined);setResult('Sign-in request recorded for the lab. Credentials were not sent or stored.');};
  const protectedAttempt=()=>{record('protected_route_attempt');setResult('Protected route attempt recorded in the lab event stream.');};
  return <div className="min-h-[100dvh] bg-[#f4f1e8] text-[#1c2732]">
    <div className="border-b border-[#d6d1c5] bg-[#e8e2d4] px-4 py-2 text-center text-[10px] font-medium tracking-wide text-[#6c6252]" data-testid="status-decoy-disclaimer">FICTIONAL CONTROLLED-LAB DECOY · interactions are monitored for research</div>
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5"><button onClick={()=>{navigate('/');record('route_visit',undefined,'/')}} className="flex items-center gap-2 text-[19px] font-bold tracking-[-.04em]" data-testid="button-decoy-home"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e7ad3c] text-white"><Hexagon size={18}/></span>Northstar<span className="font-normal text-[#8e8b83]">Cloud</span></button><nav className="flex items-center gap-1 sm:gap-3"><button onClick={()=>{navigate('/');record('route_visit',undefined,'/')}} className="rounded-md px-3 py-2 text-xs text-[#596270] hover:bg-white/60" data-testid="link-decoy-home">Home</button><button onClick={()=>{navigate('/about');record('route_visit',undefined,'/about')}} className="rounded-md px-3 py-2 text-xs text-[#596270] hover:bg-white/60" data-testid="link-decoy-about">About</button><button onClick={()=>{navigate('/login');record('route_visit',undefined,'/login')}} className="rounded-md bg-[#1c2732] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#354250]" data-testid="link-decoy-login">Sign in</button></nav></header>
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-5">
      {result&&<div role="status" className="mb-5 flex items-start gap-2 rounded-lg border border-[#9bb6a8] bg-[#e2eee5] p-3 text-xs text-[#3f634d]" data-testid="status-decoy-interaction"><CheckCircle2 size={15} className="mt-0.5 shrink-0"/>{result}</div>}
      {route==='/about'?<div className="mx-auto max-w-3xl py-16"><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#aa7b22]">ABOUT NORTHSTAR</p><h1 className="mt-4 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">Infrastructure that stays out of your way.</h1><p className="mt-6 text-base leading-8 text-[#68717c]">Northstar Cloud is a fictional infrastructure company created for controlled-lab deception research. This website is intentionally isolated and does not provide real account access or services.</p><div className="mt-10 grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-[#ddd8cc] bg-white/60 p-5"><Cloud className="text-[#aa7b22]" size={20}/><h2 className="mt-4 font-semibold">Thoughtful infrastructure</h2><p className="mt-2 text-sm leading-6 text-[#68717c]">A simulated public surface for evaluating defensive telemetry pipelines.</p></div><div className="rounded-xl border border-[#ddd8cc] bg-white/60 p-5"><LockKeyhole className="text-[#aa7b22]" size={20}/><h2 className="mt-4 font-semibold">No real accounts</h2><p className="mt-2 text-sm leading-6 text-[#68717c]">Never enter real credentials. Password fields are not transmitted or stored.</p></div></div></div>:route==='/login'?<div className="mx-auto grid max-w-4xl gap-10 py-8 md:grid-cols-[1fr_.85fr] md:items-center md:py-16"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#aa7b22]">CUSTOMER PORTAL</p><h1 className="mt-4 text-4xl font-semibold tracking-[-.05em]">Welcome back.</h1><p className="mt-4 max-w-md text-sm leading-7 text-[#68717c]">This sign-in panel is a fictional decoy surface. A synthetic interaction is recorded, but credentials are never sent or stored.</p></div><form onSubmit={submitLogin} className="rounded-2xl border border-[#ddd8cc] bg-white/75 p-6 shadow-sm"><p className="text-lg font-semibold">Sign in to Northstar</p><p className="mt-1 text-xs text-[#8a9199]">Demo portal · no authentication occurs</p><label className="mt-6 block text-xs font-medium">Email or username<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="off" data-testid="input-decoy-username" className="mt-2 h-11 w-full rounded-lg border border-[#d8dce0] bg-white px-3 text-sm outline-none focus:border-[#c89938]" placeholder="name@company.example"/></label><label className="mt-4 block text-xs font-medium">Password<input type="password" autoComplete="new-password" data-testid="input-decoy-password" className="mt-2 h-11 w-full rounded-lg border border-[#d8dce0] bg-white px-3 text-sm outline-none focus:border-[#c89938]" placeholder="Not transmitted or stored"/></label><button type="submit" disabled={web.isPending} data-testid="button-decoy-submit-login" className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1c2732] text-sm font-semibold text-white hover:bg-[#354250] disabled:opacity-50"><LogIn size={15}/>{web.isPending?'Recording…':'Continue'}</button><p className="mt-4 text-center text-[10px] text-[#8a9199]">Do not use real credentials on this research surface.</p></form></div>:route==='/admin'?<div className="mx-auto max-w-3xl py-16 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3e5c6] text-[#a97b22]"><LockKeyhole size={24}/></div><h1 className="mt-5 text-3xl font-semibold">Restricted workspace</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#68717c]">This fictional administrator route is protected. The attempt is recorded as a controlled-lab event; access is not granted.</p><button onClick={protectedAttempt} data-testid="button-record-protected-attempt" className="mt-6 rounded-lg bg-[#1c2732] px-4 py-2.5 text-xs font-semibold text-white">Record access attempt</button></div>:<div className="relative mt-5 overflow-hidden rounded-3xl border border-[#e2dccf] bg-[#ede8dc] px-6 py-14 sm:px-12 sm:py-20"><div className="honeycomb absolute inset-y-0 right-0 w-[55%] opacity-70"/><div className="relative max-w-2xl"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#d7caa9] bg-white/55 px-3 py-1.5 text-[10px] text-[#796332]"><span className="h-1.5 w-1.5 rounded-full bg-[#c89938]"/>Infrastructure, thoughtfully managed</div><h1 className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-.06em] sm:text-6xl">The quiet foundation for big ideas.</h1><p className="mt-6 max-w-xl text-sm leading-7 text-[#68717c] sm:text-base">Reliable cloud infrastructure for teams building what comes next. Keep your systems steady, so your work can move forward.</p><div className="mt-8 flex flex-wrap gap-3"><button onClick={()=>{navigate('/login');record('route_visit')}} data-testid="button-decoy-get-started" className="rounded-lg bg-[#1c2732] px-5 py-3 text-xs font-semibold text-white">Explore customer portal</button><button onClick={()=>{navigate('/about');record('route_visit')}} data-testid="button-decoy-learn-more" className="rounded-lg border border-[#cfc8ba] bg-white/55 px-5 py-3 text-xs font-semibold">Learn about Northstar</button></div><div className="mt-12 flex flex-wrap gap-x-8 gap-y-4 border-t border-[#d8d1c3] pt-6 text-[10px] text-[#7b8287]"><span><Check size={12} className="mr-1 inline text-[#7c967d]"/>Always-on observability</span><span><Check size={12} className="mr-1 inline text-[#7c967d]"/>Built for teams</span><span><Check size={12} className="mr-1 inline text-[#7c967d]"/>Secure by default</span></div></div></div>}
      {route==='/'&&<div className="mt-5 grid gap-4 sm:grid-cols-3">{[['Infrastructure','A steady place to build and grow.'],['Observability','A clearer picture of every moving part.'],['Security','Practical controls for a changing world.']].map(([t,d],i)=><div key={t} className="rounded-xl border border-[#ddd8cc] bg-white/60 p-5"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f3e5c6] text-[#aa7b22]">{i===0?<Cloud size={17}/>:i===1?<Activity size={17}/>:<Shield size={17}/>}</div><h2 className="mt-4 text-sm font-semibold">{t}</h2><p className="mt-2 text-xs leading-5 text-[#68717c]">{d}</p></div>)}</div>}
    </main>
    <footer className="flex items-center justify-center gap-4 border-t border-[#ddd8cc] px-5 py-6 text-[10px] text-[#8a9199]"><span>Northstar Cloud · fictional controlled-lab decoy website</span><button onClick={()=>{navigate('/admin');record('protected_route_attempt',undefined,'/admin')}} className="underline decoration-[#c8c0b1] underline-offset-2 hover:text-[#596270]" data-testid="link-decoy-admin">Admin</button></footer>
  </div>;
}
