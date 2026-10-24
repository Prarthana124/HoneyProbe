import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, Clipboard, Copy, Download, FileCheck2, Filter, Hash, RefreshCw, Search, ShieldCheck, Terminal, TimerReset, X } from 'lucide-react';
import { Link } from 'wouter';
import { adaptationEvents, formatDateTime, formatShortTime, incidents, recentEvents, reportPayload, type Incident } from '@/data/demo-data';
import { ConsoleShell, PageHeader, Panel, ScoreBar, StatusPill, useSystemStatus } from '@/components/console-shell';
import { ActivityBars, DistributionRing } from '@/components/dashboard-charts';

function MetricCard({ label, value, detail, accent = 'primary' }: { label: string; value: string; detail: string; accent?: 'primary' | 'accent' | 'danger' }) {
  return <Panel className={`dashboard-metric console-enter border-t-2 ${accent === 'primary' ? 'border-t-primary' : accent === 'accent' ? 'border-t-accent' : 'border-t-destructive'}`}><div className="flex items-start justify-between"><div className="mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">{label}</div><div className={`h-1.5 w-1.5 rounded-full ${accent === 'primary' ? 'bg-primary' : accent === 'accent' ? 'bg-accent' : 'bg-destructive'}`} /></div><div className="mt-2 text-2xl font-semibold tracking-[-.04em]">{value}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{detail}</div></Panel>;
}

function KindIcon({ kind }: { kind: string }) {
  return <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${kind === 'detection' ? 'bg-destructive/10 text-destructive' : kind === 'adaptation' ? 'bg-primary/10 text-primary' : kind === 'response' ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>{kind === 'report' ? <FileCheck2 size={15} /> : kind === 'adaptation' ? <RefreshCw size={15} /> : kind === 'response' ? <ShieldCheck size={15} /> : <Terminal size={15} />}</div>;
}

export function Dashboard() {
  const system = useSystemStatus();
  const activity = useMemo(() => Array.from({ length: 8 }, (_, slot) => {
    const startHour = slot * 3;
    const value = incidents.filter((incident) => {
      const hour = new Date(incident.timestamp).getUTCHours();
      return hour >= startHour && hour < startHour + 3;
    }).length;
    return { label: String(startHour).padStart(2, '0'), value };
  }), []);
  const severityCounts = useMemo(() => incidents.reduce<Record<Incident['severity'], number>>((result, incident) => {
    result[incident.severity] += 1;
    return result;
  }, { Critical: 0, High: 0, Medium: 0, Low: 0 }), []);
  const severityColors: Record<Incident['severity'], string> = {
    Critical: 'hsl(var(--severity-critical))',
    High: 'hsl(var(--severity-high))',
    Medium: 'hsl(var(--severity-medium))',
    Low: 'hsl(var(--severity-low))',
  };
  const severityDistribution = Object.entries(severityCounts).map(([label, value]) => ({
    label,
    value,
    color: severityColors[label as Incident['severity']],
  }));

  return (
    <ConsoleLayout>
      <PageHeader
        eyebrow="01 / operational picture"
        title="Security Operations Dashboard"
        description="Live system status and a clear summary of observed activity, findings, and response history."
        action={<div className="flex items-center gap-2 rounded border border-accent/25 bg-accent/10 px-2.5 py-1.5 text-[9px] uppercase tracking-wider text-accent"><span className="status-pulse h-1.5 w-1.5 rounded-full bg-accent" /> Demo dataset · Phase 1–3</div>}
      />
      <div className="dashboard-metrics mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Events observed" value={String(incidents.length)} detail="Across the current demo window" />
        <MetricCard label="High / critical" value={String(incidents.filter((incident) => incident.severity === 'High' || incident.severity === 'Critical').length)} detail="Require analyst attention" accent="danger" />
        <MetricCard label="Detection confidence" value="88.3%" detail="Across this illustrative dataset" />
        <MetricCard label="Adaptations applied" value={String(adaptationEvents.length)} detail="Recorded in the demo window" accent="accent" />
      </div>

      <div className="mb-3 grid gap-3 xl:grid-cols-[1.25fr_.75fr]">
        <Panel className="p-3.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold">Recent event activity</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Incidents grouped into three-hour UTC windows · demo data</p>
            </div>
            <TimerReset size={14} className="text-muted-foreground" />
          </div>
          <ActivityBars data={activity} ariaLabel="Demo incident activity grouped into three-hour UTC windows" />
        </Panel>
        <Panel className="p-3.5">
          <div className="mb-2">
            <h2 className="text-xs font-semibold">Finding severity</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Distribution across the demo incidents</p>
          </div>
          <DistributionRing
            data={severityDistribution}
            centerLabel="incidents"
            ariaLabel="Demo incident severity distribution"
          />
        </Panel>
      </div>

      <div className="mb-3 grid gap-3 xl:grid-cols-[1.35fr_.65fr]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <div>
              <h2 className="text-xs font-semibold">Recent security activity</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Observed incidents and response state</p>
            </div>
            <Link href="/incidents?mode=demo" className="flex items-center gap-1 text-[10px] text-primary hover:underline" data-testid="link-dashboard-incidents">View all <ArrowUpRight size={12} /></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left">
              <thead><tr className="mono text-muted-foreground"><th>Time</th><th>Incident</th><th>Severity</th><th>Attack type</th><th>Status</th></tr></thead>
              <tbody className="divide-y divide-border/70">
                {incidents.slice(0, 5).map((incident) => (
                  <tr key={incident.id} data-testid={`row-dashboard-incident-${incident.id}`}>
                    <td className="mono text-muted-foreground">{formatShortTime(incident.timestamp)}</td>
                    <td className="mono text-primary">{incident.id}</td>
                    <td><StatusPill value={incident.severity} /></td>
                    <td>{incident.attackType}</td>
                    <td><StatusPill value={incident.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel className="p-3.5">
          <div className="mb-2">
            <h2 className="text-xs font-semibold">Quick actions</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Open a demo console section</p>
          </div>
          <div className="grid gap-1.5">
            {[
              { href: '/decoys?mode=demo', label: 'Decoy interactions' },
              { href: '/rules?mode=demo', label: 'Custom detection rules' },
              { href: '/evidence?mode=demo', label: 'Evidence ledger' },
              { href: '/reports?mode=demo', label: 'Generate reports' },
            ].map((action) => (
              <Link key={action.href} href={action.href} className="dashboard-quick-action">
                <span>{action.label}</span><ArrowUpRight size={12} />
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <div><h2 className="text-xs font-semibold">Recent operator activity</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Signals from the demo response loop</p></div>
            <TimerReset size={14} className="text-muted-foreground" />
          </div>
          <div className="space-y-1">
            {recentEvents.slice(0, 4).map((event) => (
              <div key={event.id} className="flex gap-2 rounded p-1.5 hover:bg-muted/30" data-testid={`event-recent-${event.id}`}>
                <KindIcon kind={event.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2"><span className="text-[10px] font-medium">{event.label}</span><span className="mono text-[9px] text-muted-foreground">{formatShortTime(event.timestamp)}</span></div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{event.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <div><h2 className="text-xs font-semibold">Adaptation history</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Latest recorded control changes</p></div>
            <Link href="/adaptation?mode=demo" className="text-[10px] text-primary hover:underline" data-testid="link-dashboard-adaptation">Open log</Link>
          </div>
          <div className="space-y-2">
            {adaptationEvents.slice(0, 3).map((event) => (
              <div key={event.id} className="relative border-l border-primary/35 py-0.5 pl-3" data-testid={`dashboard-adaptation-${event.id}`}>
                <div className="absolute -left-[4px] top-1 h-1.5 w-1.5 rounded-full bg-primary" />
                <div className="mono text-[9px] text-muted-foreground">{formatShortTime(event.timestamp)} · {event.phase}</div>
                <div className="mt-0.5 text-[10px] font-medium">{event.action}</div>
                <div className="text-[9px] leading-4 text-muted-foreground">{event.outcome}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <div><h2 className="text-xs font-semibold">System health</h2><p className="mt-0.5 text-[10px] text-muted-foreground">API reachability is queried separately from demo records</p></div>
            <span className="mono text-[9px] text-muted-foreground">{system.lastUpdated === '—' ? 'waiting' : formatShortTime(system.lastUpdated)}</span>
          </div>
          <div className="grid gap-1.5">
            {[
              ['API reachability', system.api === 'reachable' ? 'Reachable' : system.api === 'checking' ? 'Checking' : 'Unavailable', system.api === 'reachable' ? 'good' : system.api === 'checking' ? 'warn' : 'bad'],
              ['Detection engine', 'Nominal', 'good'],
              ['Adaptation loop', 'Nominal', 'good'],
              ['Report integrity', 'Verified', 'good'],
            ].map(([label, value, tone]) => (
              <div key={label} className="flex items-center justify-between gap-2 border-b border-border/70 py-1.5 last:border-0">
                <span className="text-[10px] text-muted-foreground">{label}</span>
                <StatusPill value={value} tone={tone as 'good' | 'warn' | 'bad'} />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </ConsoleLayout>);
}

function ConsoleLayout({ children }: { children: ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}

export function Incidents() {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('All severity');
  const [status, setStatus] = useState('All status');
  const [selected, setSelected] = useState<Incident | null>(null);
  const filtered = incidents.filter((incident) => `${incident.id} ${incident.attackType} ${incident.source}`.toLowerCase().includes(query.toLowerCase()) && (severity === 'All severity' || incident.severity === severity) && (status === 'All status' || incident.status === status));
  return <ConsoleLayout><PageHeader eyebrow="02 / incident register" title="Incidents & attacks" description="Search the response record by attack signature, source, severity, or containment state." action={<div className="flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-2 text-[10px] uppercase tracking-wider text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> DEMO DATA</div>} />
    <Panel className="overflow-hidden"><div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row"><div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search incident ID, attack type, source..." className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary" data-testid="input-search-incidents" /></div><div className="flex gap-2"><select value={severity} onChange={(event) => setSeverity(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-primary" data-testid="select-filter-severity"><option>All severity</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-primary" data-testid="select-filter-status"><option>All status</option><option>Contained</option><option>Investigating</option><option>Resolved</option></select></div></div><div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Filter size={14} /> {filtered.length} matching records</div><div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">all records marked demo</div></div><div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left"><thead className="border-b border-border bg-muted/20"><tr className="mono text-[10px] uppercase tracking-[.13em] text-muted-foreground"><th className="px-5 py-3 font-normal">Incident / time</th><th className="px-4 py-3 font-normal">Classification</th><th className="px-4 py-3 font-normal">Source</th><th className="px-4 py-3 font-normal">Scores</th><th className="px-4 py-3 font-normal">Status</th><th className="px-4 py-3 font-normal" /></tr></thead><tbody className="divide-y divide-border/70">{filtered.map((incident) => <tr key={incident.id} className="group transition-colors hover:bg-muted/30" data-testid={`row-incident-${incident.id}`}><td className="px-5 py-4"><div className="mono text-xs text-primary">{incident.id}</div><div className="mt-1 text-xs text-muted-foreground">{formatDateTime(incident.timestamp)}</div></td><td className="px-4 py-4"><div className="text-sm font-medium">{incident.attackType}</div><div className="mt-1"><StatusPill value={incident.severity} /></div></td><td className="px-4 py-4 mono text-[11px] text-muted-foreground">{incident.source}</td><td className="w-[190px] px-4 py-4"><div className="space-y-2"><ScoreBar label="det" score={incident.detectionScore} /><ScoreBar label="atk" score={incident.attackScore} /></div></td><td className="px-4 py-4"><StatusPill value={incident.status} /></td><td className="px-4 py-4 text-right"><button onClick={() => setSelected(incident)} className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary" data-testid={`button-view-incident-${incident.id}`}>Inspect</button></td></tr>)}</tbody></table></div>{filtered.length === 0 && <div className="p-12 text-center"><div className="text-sm font-medium">No matching incidents</div><div className="mt-1 text-xs text-muted-foreground">Try a different term or clear one of the filters.</div></div>}</Panel>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-5 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-border bg-card p-6 shadow-2xl" role="dialog" aria-modal="true"><div className="flex items-start justify-between"><div><div className="mono text-xs text-primary">{selected.id} · DEMO DATA</div><h2 className="mt-2 text-2xl font-semibold">{selected.attackType}</h2><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(selected.timestamp)} · {selected.source}</p></div><button onClick={() => setSelected(null)} className="rounded-md p-2 text-muted-foreground hover:bg-muted" data-testid="button-close-incident-detail"><X size={18} /></button></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-border bg-muted/30 p-4"><div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Behaviour observed</div><p className="mt-2 text-sm leading-6">{selected.behaviour}</p></div><div className="rounded-lg border border-border bg-muted/30 p-4"><div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Response applied</div><p className="mt-2 text-sm leading-6">{selected.response}</p></div><div className="rounded-lg border border-border bg-muted/30 p-4"><div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Adaptation</div><p className="mt-2 text-sm leading-6">{selected.adaptation}</p></div><div className="rounded-lg border border-border bg-muted/30 p-4"><div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Phase / state</div><p className="mt-2 text-sm leading-6">{selected.phase} · {selected.status}</p></div></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg border border-border p-4"><ScoreBar label="Detection score" score={selected.detectionScore} /></div><div className="rounded-lg border border-border p-4"><ScoreBar label="Attack score" score={selected.attackScore} /></div></div></div></div>}
  </ConsoleLayout>;
}

export function Adaptation() {
  return <ConsoleLayout><PageHeader eyebrow="03 / learning loop" title="Adaptation history" description="A traceable timeline of control changes made after observed behaviour, with confidence and outcome." action={<span className="mono rounded-full border border-primary/20 bg-primary/10 px-3 py-2 text-[10px] uppercase tracking-wider text-primary">{adaptationEvents.length} adaptations logged</span>} /><Panel className="p-5 md:p-8"><div className="relative ml-2 border-l border-border md:ml-5">{adaptationEvents.map((event, index) => <div key={event.id} className={`relative pb-10 pl-8 last:pb-2 console-enter delay-${Math.min(index + 1, 3)}`} data-testid={`timeline-adaptation-${event.id}`}><div className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-card bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/.16)]" /><div className="flex flex-col justify-between gap-2 md:flex-row"><div><div className="flex flex-wrap items-center gap-2"><span className="mono text-xs text-primary">{event.id}</span><StatusPill value={event.phase} tone="neutral" /></div><h2 className="mt-2 text-base font-semibold">{event.action}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{event.outcome}</p></div><div className="md:text-right"><div className="mono text-[11px] text-muted-foreground">{formatDateTime(event.timestamp)}</div><div className="mt-2 inline-flex items-center gap-2 text-xs"><span className="text-muted-foreground">confidence</span><span className="mono text-primary">{event.confidence}%</span></div></div></div><div className="mt-4 rounded-lg border border-border bg-muted/20 px-4 py-3 text-xs"><span className="mono mr-2 text-[10px] uppercase tracking-wider text-muted-foreground">trigger</span>{event.trigger}</div></div>)}</div></Panel><div className="mt-5 grid gap-5 md:grid-cols-3"><Panel className="p-5"><div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Phase 1</div><div className="mt-3 text-2xl font-semibold">1</div><div className="mt-1 text-xs text-muted-foreground">Foundational controls</div></Panel><Panel className="p-5"><div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Phase 2</div><div className="mt-3 text-2xl font-semibold">2</div><div className="mt-1 text-xs text-muted-foreground">Pattern propagation</div></Panel><Panel className="p-5"><div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Phase 3</div><div className="mt-3 text-2xl font-semibold">2</div><div className="mt-1 text-xs text-muted-foreground">Adaptive response</div></Panel></div></ConsoleLayout>;
}

async function digestReport(payload: string) {
  const bytes = new TextEncoder().encode(payload);
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function Reports() {
  const [hash, setHash] = useState('');
  const payload = useMemo(() => reportPayload(), []);
  useEffect(() => { digestReport(payload).then(setHash); }, [payload]);
  const download = () => { const blob = new Blob([payload], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `aegis-ops-demo-report-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); };
  return <ConsoleLayout><PageHeader eyebrow="04 / evidence export" title="Reports" description="Generate a portable snapshot of the current demo dataset. The integrity digest is computed locally in this browser." action={<button onClick={download} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5" data-testid="button-generate-report"><Download size={16} /> Generate report</button>} /><div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><Panel className="overflow-hidden"><div className="border-b border-border px-5 py-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Report detail data</h2><p className="mt-1 text-xs text-muted-foreground">The fields included in the generated JSON snapshot</p></div><span className="mono rounded bg-accent/10 px-2 py-1 text-[10px] uppercase tracking-wider text-accent">DEMO DATA</span></div></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead className="border-b border-border bg-muted/20"><tr className="mono text-[10px] uppercase tracking-wider text-muted-foreground"><th className="px-5 py-3 font-normal">Timestamp</th><th className="px-4 py-3 font-normal">Attack type</th><th className="px-4 py-3 font-normal">Scores</th><th className="px-4 py-3 font-normal">Response / adaptation</th></tr></thead><tbody className="divide-y divide-border/70">{incidents.map((incident) => <tr key={incident.id} data-testid={`row-report-${incident.id}`}><td className="px-5 py-4"><div className="mono text-[11px] text-foreground">{formatDateTime(incident.timestamp)}</div><div className="mt-1 mono text-[10px] text-primary">{incident.id}</div></td><td className="px-4 py-4 text-sm">{incident.attackType}</td><td className="px-4 py-4"><div className="mono text-xs">D {incident.detectionScore} <span className="text-muted-foreground">/</span> A {incident.attackScore}</div></td><td className="max-w-[290px] px-4 py-4"><div className="text-xs text-foreground">{incident.response}</div><div className="mt-1 text-[11px] text-muted-foreground">{incident.adaptation}</div></td></tr>)}</tbody></table></div></Panel><div className="space-y-5"><Panel className="p-5"><div className="flex items-center gap-2"><Hash size={17} className="text-primary" /><h2 className="text-sm font-semibold">Current report digest</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">SHA-256 for the report generated from the current dataset. Generate again to create a fresh timestamped snapshot.</p><div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-4"><div className="mono break-all text-xs leading-6 text-primary" data-testid="text-report-hash">{hash || 'Computing digest…'}</div></div><div className="mt-4 flex gap-2"><button onClick={() => navigator.clipboard?.writeText(hash)} disabled={!hash} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-40" data-testid="button-copy-hash"><Copy size={14} /> Copy hash</button><Link href="/verification" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground transition-colors hover:bg-muted" data-testid="link-verify-report"><FileCheck2 size={14} /> Verify report</Link></div></Panel><Panel className="p-5"><div className="flex items-center gap-2"><Clipboard size={17} className="text-accent" /><h2 className="text-sm font-semibold">Export contract</h2></div><div className="mt-4 space-y-3 text-xs"><div className="flex justify-between border-b border-border pb-3"><span className="text-muted-foreground">Format</span><span className="mono">JSON</span></div><div className="flex justify-between border-b border-border pb-3"><span className="text-muted-foreground">Incident records</span><span className="mono">{incidents.length}</span></div><div className="flex justify-between border-b border-border pb-3"><span className="text-muted-foreground">Adaptation records</span><span className="mono">{adaptationEvents.length}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Source mode</span><span className="mono text-accent">DEMO</span></div></div></Panel></div></div></ConsoleLayout>;
}

export function Verification() {
  const [hash, setHash] = useState('');
  const [currentHash, setCurrentHash] = useState('');
  const [result, setResult] = useState<'match' | 'mismatch' | null>(null);
  useEffect(() => { digestReport(reportPayload()).then(setCurrentHash); }, []);
  const verify = () => setResult(hash.trim().toLowerCase() === currentHash ? 'match' : 'mismatch');
  return <ConsoleLayout><PageHeader eyebrow="05 / trust boundary" title="SHA-256 verification" description="Confirm that a report hash matches the current generated snapshot before treating the export as intact." action={<div className="flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-[10px] uppercase tracking-wider text-primary"><ShieldCheck size={14} /> Integrity control</div>} /><div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[1fr_.8fr]"><Panel className="p-6 md:p-8"><div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Hash size={19} /></div><div><h2 className="text-base font-semibold">Verify report-integrity</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Paste the SHA-256 digest from an exported report. Comparison is against the current browser-generated demo snapshot.</p></div></div><label className="mt-7 block"><span className="mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Report SHA-256 hash</span><textarea value={hash} onChange={(event) => { setHash(event.target.value); setResult(null); }} rows={4} spellCheck={false} placeholder="64-character hexadecimal hash" className="mono mt-2 w-full resize-none rounded-lg border border-input bg-background p-3 text-xs leading-6 outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary" data-testid="input-verification-hash" /></label><button onClick={verify} disabled={!hash.trim() || !currentHash} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-verify-hash"><FileCheck2 size={16} /> Verify report hash</button>{result && <div className={`mt-5 rounded-lg border p-4 ${result === 'match' ? 'border-primary/30 bg-primary/10' : 'border-destructive/30 bg-destructive/10'}`} data-testid={`status-verification-${result}`}><div className={`flex items-center gap-2 text-sm font-semibold ${result === 'match' ? 'text-primary' : 'text-destructive'}`}>{result === 'match' ? <Check size={17} /> : <X size={17} />} {result === 'match' ? 'Report-integrity verified' : 'Report-integrity mismatch'}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{result === 'match' ? 'The supplied digest matches the current generated report.' : 'The supplied digest does not match the current generated report. Confirm the export source and regenerate if needed.'}</p></div>}</Panel><Panel className="p-6"><div className="mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Reference snapshot</div><div className="mt-5 space-y-4 text-xs"><div className="flex items-start justify-between gap-4 border-b border-border pb-4"><span className="text-muted-foreground">Current digest</span><span className="mono max-w-[220px] break-all text-right text-primary">{currentHash || 'Computing…'}</span></div><div className="flex justify-between border-b border-border pb-4"><span className="text-muted-foreground">Records covered</span><span className="mono">{incidents.length} incidents / {adaptationEvents.length} adaptations</span></div><div className="flex justify-between border-b border-border pb-4"><span className="text-muted-foreground">Algorithm</span><span className="mono">SHA-256</span></div><div className="flex justify-between"><span className="text-muted-foreground">Dataset mode</span><span className="mono text-accent">DEMO DATA</span></div></div><Link href="/reports" className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-xs transition-colors hover:border-primary/50 hover:text-primary" data-testid="link-back-reports"><ArrowDownToLine size={14} className="rotate-180" /> Back to reports</Link></Panel></div></ConsoleLayout>;
}