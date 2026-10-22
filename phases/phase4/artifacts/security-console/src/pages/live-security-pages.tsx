import { type ReactNode, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Download,
  FileCheck2,
  Hash,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Link } from 'wouter';
import { useClerk } from '@clerk/react';
import {
  honeyProbeRequest,
  isSimulatedEvent,
  type AdaptiveActionAudit,
  type EventPage,
  type HoneyProbeEvent,
  type Overview,
  type ReportDocument,
  type ReportVerification,
  type SelfTestResult,
  type Severity,
  type SourceProfile,
} from '@/lib/honeyprobe-api';
import {
  formatDateTime,
  formatShortTime,
} from '@/data/demo-data';
import {
  ConsoleShell,
  PageHeader,
  Panel,
  StatusPill,
} from '@/components/console-shell';

function LiveConsoleLayout({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();
  const authControls = (
    <button
      type="button"
      onClick={() => signOut({ redirectUrl: '/' })}
      className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      data-testid="button-sign-out"
    >
      Sign out
    </button>
  );

  return <ConsoleShell authControls={authControls}>{children}</ConsoleShell>;
}

function ApiError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <Panel className="border-destructive/40 bg-destructive/5 p-5" testId="panel-api-error">
      <div className="flex items-start gap-3">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-destructive" />
        <div>
          <h2 className="text-sm font-semibold">Live telemetry unavailable</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {error.message} No demo data has been substituted for live records.
          </p>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            Check the API service, Clerk session, and verified operator allowlist.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function LoadingPanel({ label = 'Loading persisted HoneyProbe data…' }: { label?: string }) {
  return (
    <Panel className="p-8 text-center text-sm text-muted-foreground" testId="panel-loading">
      {label}
    </Panel>
  );
}

function LiveModeBadge() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-[10px] uppercase tracking-wider text-primary">
      <span className="status-pulse h-1.5 w-1.5 rounded-full bg-primary" />
      Live API · demo events excluded
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  accent = 'primary',
}: {
  label: string;
  value: string;
  detail: string;
  accent?: 'primary' | 'accent' | 'danger';
}) {
  const dot =
    accent === 'danger'
      ? 'bg-destructive'
      : accent === 'accent'
        ? 'bg-accent'
        : 'bg-primary';
  return (
    <Panel className="console-enter p-5">
      <div className="flex items-start justify-between">
        <div className="mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">
          {label}
        </div>
        <div className={`h-2 w-2 rounded-full ${dot}`} />
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-[-.04em]">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </Panel>
  );
}

function EventModeLabel({ event }: { event: HoneyProbeEvent }) {
  const simulated = isSimulatedEvent(event);
  const label = simulated
    ? 'SIMULATED LAB EVENT'
    : event.environment === 'configured_lab'
      ? 'CONFIGURED LAB'
      : 'LOCAL OBSERVATION';
  return (
    <span
      className={`mono rounded px-2 py-1 text-[9px] uppercase tracking-wider ${
        simulated
          ? 'bg-accent/10 text-accent'
          : 'bg-primary/10 text-primary'
      }`}
    >
      {label}
    </span>
  );
}

function EventTable({
  events,
  onInspect,
}: {
  events: HoneyProbeEvent[];
  onInspect?: (event: HoneyProbeEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No non-demo events are stored yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead className="border-b border-border bg-muted/20">
          <tr className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-normal">Time / event</th>
            <th className="px-4 py-3 font-normal">Source / target</th>
            <th className="px-4 py-3 font-normal">Severity</th>
            <th className="px-4 py-3 font-normal">Data mode</th>
            {onInspect && <th className="px-4 py-3 font-normal" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {events.map((event) => (
            <tr key={event.id} data-testid={`row-live-event-${event.id}`}>
              <td className="px-4 py-4">
                <div className="mono text-[11px] text-primary">{event.event_type}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(event.timestamp)}
                </div>
                <div className="mt-1 max-w-lg text-xs text-foreground">{event.summary}</div>
              </td>
              <td className="px-4 py-4">
                <div className="mono text-xs">{event.source_address ?? 'address unavailable'}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {event.source_type} · {event.target}
                </div>
              </td>
              <td className="px-4 py-4">
                <StatusPill value={event.severity.toUpperCase()} />
              </td>
              <td className="px-4 py-4">
                <EventModeLabel event={event} />
              </td>
              {onInspect && (
                <td className="px-4 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => onInspect(event)}
                    className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
                    data-testid={`button-inspect-event-${event.id}`}
                  >
                    Inspect
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LiveDashboard() {
  const overview = useQuery({
    queryKey: ['honeyprobe', 'overview', 'observed'],
    queryFn: () =>
      honeyProbeRequest<Overview>('/api/overview?include_demo=false'),
    refetchInterval: 10_000,
  });
  const events = useQuery({
    queryKey: ['honeyprobe', 'events', 'recent-observed'],
    queryFn: () =>
      honeyProbeRequest<EventPage>('/api/events?include_demo=false&limit=8'),
    refetchInterval: 10_000,
  });
  const profiles = useQuery({
    queryKey: ['honeyprobe', 'profiles', 'observed'],
    queryFn: () =>
      honeyProbeRequest<SourceProfile[]>('/api/sources/profiles?include_demo=false&limit=8'),
    refetchInterval: 30_000,
  });
  const error = overview.error ?? events.error ?? profiles.error;
  const data = overview.data;
  const highCount =
    (data?.severity_counts.high ?? 0) + (data?.severity_counts.critical ?? 0);

  return (
    <LiveConsoleLayout>
      <PageHeader
        eyebrow="01 / operational picture"
        title="HoneyProbe operations"
        description="Persisted event telemetry from the protected HoneyProbe API. Synthetic test records are excluded from these views."
        action={<LiveModeBadge />}
      />
      {error && <ApiError error={error as Error} />}
      {(overview.isLoading || events.isLoading || profiles.isLoading) && !data ? (
        <LoadingPanel />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Observed events"
              value={String(data?.total_events.value ?? 0)}
              detail="Non-demo records in the last 24 hours"
            />
            <MetricCard
              label="High / critical"
              value={String(data?.suspicious_events.value ?? highCount)}
              detail="Stored high- and critical-severity events"
              accent="danger"
            />
            <MetricCard
              label="Correlated sessions"
              value={String(data?.unique_sessions.value ?? 0)}
              detail="Grouped by persisted session ID"
            />
            <MetricCard
              label="Connected decoys"
              value={String(data?.active_decoys.value ?? 0)}
              detail="Only independently connected services"
              accent="accent"
            />
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold">Recent persisted events</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Refreshes automatically · sample events are not mixed in
                  </p>
                </div>
                <Link href="/incidents" className="flex items-center gap-1 text-xs text-primary hover:underline">
                  All events <ArrowUpRight size={13} />
                </Link>
              </div>
              {events.data ? (
                <EventTable events={events.data.items} />
              ) : (
                <div className="p-5 text-sm text-muted-foreground">No event response is available.</div>
              )}
            </Panel>
            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Source profiles</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Aggregated from persisted non-demo events</p>
                </div>
                <Search size={16} className="text-muted-foreground" />
              </div>
              <div className="mt-4 space-y-3">
                {(profiles.data ?? []).map((profile) => (
                  <div key={profile.source_address} className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="mono text-xs">{profile.source_address}</span>
                      <StatusPill value={profile.highest_severity.toUpperCase()} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{profile.event_count} events</span>
                      <span>{profile.session_count} sessions</span>
                      <span>{profile.simulated_events} simulated</span>
                    </div>
                  </div>
                ))}
                {!profiles.isLoading && profiles.data?.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                    No source addresses have been observed.
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}
    </LiveConsoleLayout>
  );
}

export function LiveIncidents() {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [selected, setSelected] = useState<HoneyProbeEvent | null>(null);
  const events = useQuery({
    queryKey: ['honeyprobe', 'events', 'incidents'],
    queryFn: () =>
      honeyProbeRequest<EventPage>('/api/events?include_demo=false&limit=200'),
    refetchInterval: 10_000,
  });
  const profiles = useQuery({
    queryKey: ['honeyprobe', 'profiles', 'incidents'],
    queryFn: () =>
      honeyProbeRequest<SourceProfile[]>('/api/sources/profiles?include_demo=false&limit=100'),
  });
  const filtered = useMemo(
    () =>
      (events.data?.items ?? []).filter((event) => {
        const text = `${event.id} ${event.event_type} ${event.source_address ?? ''} ${event.target} ${event.summary}`.toLowerCase();
        return text.includes(query.toLowerCase()) && (severity === 'all' || event.severity === severity);
      }),
    [events.data?.items, query, severity],
  );

  return (
    <LiveConsoleLayout>
      <PageHeader
        eyebrow="02 / incident register"
        title="Events & source profiles"
        description="Search stored observations and inspect event-derived source profiles. Test/demo records are excluded."
        action={<LiveModeBadge />}
      />
      {(events.error || profiles.error) && <ApiError error={(events.error ?? profiles.error) as Error} />}
      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search event, source, target, or summary…"
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
              data-testid="input-search-live-events"
            />
          </div>
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as 'all' | Severity)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-primary"
            data-testid="select-live-severity"
          >
            <option value="all">All severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div className="border-b border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          {filtered.length} matching persisted events · synthetic records remain labeled
        </div>
        {events.isLoading ? <LoadingPanel label="Loading persisted events…" /> : <EventTable events={filtered} onInspect={setSelected} />}
      </Panel>

      <Panel className="mt-5 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Source profiles</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Counts and categories are derived from stored events; no external reputation lookup is connected.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead className="border-b border-border bg-muted/20">
              <tr className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-normal">Source</th>
                <th className="px-4 py-3 font-normal">Events / sessions</th>
                <th className="px-4 py-3 font-normal">Highest severity</th>
                <th className="px-4 py-3 font-normal">Categories</th>
                <th className="px-4 py-3 font-normal">Most recent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {(profiles.data ?? []).map((profile) => (
                <tr key={profile.source_address}>
                  <td className="px-4 py-4 mono text-xs">{profile.source_address}</td>
                  <td className="px-4 py-4 text-xs">{profile.event_count} / {profile.session_count}</td>
                  <td className="px-4 py-4"><StatusPill value={profile.highest_severity.toUpperCase()} /></td>
                  <td className="max-w-sm px-4 py-4 text-xs text-muted-foreground">
                    {Object.entries(profile.category_counts).map(([category, count]) => `${category} (${count})`).join(', ')}
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{formatDateTime(profile.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!profiles.isLoading && profiles.data?.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">No source profiles are available yet.</div>
          )}
        </div>
      </Panel>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-5 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-border bg-card p-6 shadow-2xl" role="dialog" aria-modal="true">
            <div className="flex items-start justify-between">
              <div>
                <div className="mono text-xs text-primary">{selected.id}</div>
                <h2 className="mt-2 text-2xl font-semibold">{selected.event_type}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(selected.timestamp)} · {selected.source_address ?? 'unknown source'}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Close event details">
                <X size={18} />
              </button>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Summary</div>
                <p className="mt-2 text-sm leading-6">{selected.summary}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Target / source</div>
                <p className="mt-2 break-all text-sm leading-6">{selected.target} · {selected.source_type}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Ingestion source</div>
                <p className="mt-2 text-sm leading-6">{selected.ingestion_source}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Data mode</div>
                <div className="mt-2"><EventModeLabel event={selected} /></div>
              </div>
            </div>
            {Array.isArray(selected.metadata.phase2_analysis) && (
              <div className="mt-4 rounded-lg border border-border p-4">
                <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Phase 2 detection indicators</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selected.metadata.phase2_analysis as { category?: string; severity?: string }[]).map((item, index) => (
                    <StatusPill key={`${item.category}-${index}`} value={`${item.category ?? 'detection'} · ${item.severity ?? 'info'}`} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </LiveConsoleLayout>
  );
}

export function LiveAdaptation() {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<AdaptiveActionAudit['action']>('restrict_file_permissions');
  const [reason, setReason] = useState('Operator requested a preview; do not apply changes.');
  const audit = useQuery({
    queryKey: ['honeyprobe', 'adaptive-action-audit'],
    queryFn: () =>
      honeyProbeRequest<AdaptiveActionAudit[]>('/api/adaptive-actions/audit?limit=100'),
    refetchInterval: 15_000,
  });
  const tests = useQuery({
    queryKey: ['honeyprobe', 'self-tests'],
    queryFn: () => honeyProbeRequest<SelfTestResult[]>('/api/self-tests'),
  });
  const preview = useMutation({
    mutationFn: () =>
      honeyProbeRequest<AdaptiveActionAudit>('/api/adaptive-actions/dry-run', {
        method: 'POST',
        body: JSON.stringify({ action, reason }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['honeyprobe', 'adaptive-action-audit'] }),
  });
  const error = audit.error ?? tests.error ?? preview.error;

  return (
    <LiveConsoleLayout>
      <PageHeader
        eyebrow="03 / learning loop"
        title="Adaptation & audit"
        description="Phase 3 previews and operator requests are recorded in SQLite. This interface cannot apply configuration changes."
        action={<LiveModeBadge />}
      />
      {error && <ApiError error={error as Error} />}
      <Panel className="p-5 md:p-7">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/10 text-accent"><RefreshCw size={18} /></div>
          <div>
            <h2 className="text-sm font-semibold">Request a dry-run preview</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The Phase 3 adapter forces apply_changes=false. Every accepted request is audited with the verified operator ID; applied actions are not supported.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
          <label className="block text-xs text-muted-foreground">
            Preview action
            <select value={action} onChange={(event) => setAction(event.target.value as AdaptiveActionAudit['action'])} className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-foreground">
              <option value="restrict_file_permissions">File permission policy</option>
              <option value="restrict_configuration_file_permissions">Configuration file policy</option>
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            Audit reason
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-foreground" />
          </label>
          <button
            onClick={() => preview.mutate()}
            disabled={preview.isPending || !reason.trim()}
            className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            data-testid="button-run-dry-run"
          >
            {preview.isPending ? 'Recording preview…' : 'Run safe preview'}
          </button>
        </div>
        {preview.data && (
          <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-4 text-xs" data-testid="status-dry-run">
            Recorded as <span className="mono">{preview.data.mode}</span>; result: {preview.data.result}. Applied: {String(preview.data.applied)}.
          </div>
        )}
      </Panel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Panel className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Adaptive action audit log</h2>
            <p className="mt-1 text-xs text-muted-foreground">Only verified-operator dry-run requests appear here.</p>
          </div>
          {audit.isLoading ? <LoadingPanel /> : (
            <div className="divide-y divide-border/70">
              {(audit.data ?? []).map((entry) => (
                <div key={entry.id} className="p-4" data-testid={`row-action-audit-${entry.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="mono text-xs text-primary">{entry.id}</span>
                    <StatusPill value={`${entry.mode} · ${entry.result}`} tone={entry.applied ? 'bad' : 'good'} />
                  </div>
                  <div className="mt-2 text-sm font-medium">{entry.action.replaceAll('_', ' ')}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{entry.reason}</div>
                  <div className="mt-2 mono text-[10px] text-muted-foreground">{formatDateTime(entry.requested_at)} · actor {entry.actor_id}</div>
                </div>
              ))}
              {!audit.isLoading && audit.data?.length === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground">No adaptive-action requests have been recorded.</div>
              )}
            </div>
          )}
        </Panel>
        <Panel className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Phase 1–3 self-test results</h2>
            <p className="mt-1 text-xs text-muted-foreground">Most recent persisted test status.</p>
          </div>
          <div className="divide-y divide-border/70">
            {(tests.data ?? []).map((test) => (
              <div key={test.name} className="flex items-start justify-between gap-4 p-4">
                <div>
                  <div className="text-xs font-medium">{test.name}</div>
                  <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{test.diagnostic}</div>
                </div>
                <StatusPill value={test.status} tone={test.status === 'pass' ? 'good' : test.status === 'fail' ? 'bad' : 'neutral'} />
              </div>
            ))}
            {!tests.isLoading && tests.data?.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">No persisted test runs are available.</div>
            )}
          </div>
        </Panel>
      </div>
    </LiveConsoleLayout>
  );
}

export function LiveReports() {
  const [report, setReport] = useState<ReportDocument | null>(null);
  const summary = useQuery({
    queryKey: ['honeyprobe', 'report-summary', 'observed'],
    queryFn: () =>
      honeyProbeRequest<{
        total_events: number;
        includes_demo_data: boolean;
        severity_counts: Record<Severity, number>;
      }>('/api/reports/summary?include_demo=false'),
  });
  const generate = useMutation({
    mutationFn: () =>
      honeyProbeRequest<ReportDocument>('/api/reports/generate', { method: 'POST' }),
    onSuccess: (document) => setReport(document),
  });
  const activeReport = report;
  const downloadJson = () => {
    if (!activeReport) return;
    const blob = new Blob([JSON.stringify(activeReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `honeyprobe-report-${activeReport.id}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <LiveConsoleLayout>
      <PageHeader
        eyebrow="04 / evidence export"
        title="Reports & evidence"
        description="Generate a persisted report from non-demo events and their stored evidence hashes. Demo records are excluded by the API."
        action={<LiveModeBadge />}
      />
      {(summary.error || generate.error) && <ApiError error={(summary.error ?? generate.error) as Error} />}
      <div className="grid gap-5 xl:grid-cols-[1fr_.8fr]">
        <Panel className="p-5">
          <div className="flex items-center gap-2"><FileCheck2 size={17} className="text-primary" /><h2 className="text-sm font-semibold">Report data</h2></div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Events are loaded from the shared SQLite store. Evidence contains a canonical event snapshot, SHA-256 digest, and chain link.
          </p>
          <div className="mt-5 space-y-3 text-xs">
            <div className="flex justify-between border-b border-border pb-3"><span className="text-muted-foreground">Non-demo events available</span><span className="mono">{summary.data?.total_events ?? (summary.isLoading ? '…' : '—')}</span></div>
            <div className="flex justify-between border-b border-border pb-3"><span className="text-muted-foreground">Demo/test records</span><span className="mono">Excluded</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Output</span><span className="mono">Persisted JSON + CSV</span></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              data-testid="button-generate-live-report"
            >
              <Download size={15} /> {generate.isPending ? 'Generating…' : 'Generate and save report'}
            </button>
            <a href="/api/reports/export?include_demo=false" className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-xs hover:border-primary/50" data-testid="link-export-live-csv">
              <ArrowDownToLine size={15} /> Export CSV
            </a>
          </div>
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center gap-2"><Hash size={17} className="text-primary" /><h2 className="text-sm font-semibold">Report integrity</h2></div>
          {activeReport ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">The server stored this report and its SHA-256 digest.</p>
              <div className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between gap-3 border-b border-border pb-3"><span className="text-muted-foreground">Report ID</span><span className="mono break-all text-right">{activeReport.id}</span></div>
                <div className="flex justify-between gap-3 border-b border-border pb-3"><span className="text-muted-foreground">Events / evidence</span><span className="mono">{activeReport.events.length} / {activeReport.evidence.length}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Generated</span><span className="mono text-right">{formatDateTime(activeReport.generated_at)}</span></div>
              </div>
              <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="mono break-all text-[11px] leading-5 text-primary" data-testid="text-live-report-hash">{activeReport.sha256}</div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={downloadJson} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:border-primary/50">
                  <Download size={14} /> Download JSON
                </button>
                <Link href="/verification" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground hover:bg-muted">
                  <FileCheck2 size={14} /> Verify hash
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              Generate a report to save its content, evidence records, and digest in SQLite.
            </div>
          )}
        </Panel>
      </div>
    </LiveConsoleLayout>
  );
}

export function LiveVerification() {
  const [digest, setDigest] = useState('');
  const verify = useMutation({
    mutationFn: (value: string) =>
      honeyProbeRequest<ReportVerification>(
        `/api/reports/verify?sha256=${encodeURIComponent(value.trim())}`,
      ),
  });

  return (
    <LiveConsoleLayout>
      <PageHeader
        eyebrow="05 / trust boundary"
        title="SHA-256 verification"
        description="Verify a digest against the content of a report stored in HoneyProbe's SQLite database."
        action={<LiveModeBadge />}
      />
      {verify.error && <ApiError error={verify.error as Error} />}
      <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[1fr_.8fr]">
        <Panel className="p-6 md:p-8">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Hash size={19} /></div>
            <div><h2 className="text-base font-semibold">Verify a saved report</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Paste the 64-character digest shown after report generation.</p></div>
          </div>
          <label className="mt-7 block">
            <span className="mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Report SHA-256 hash</span>
            <textarea
              value={digest}
              onChange={(event) => { setDigest(event.target.value); verify.reset(); }}
              rows={4}
              spellCheck={false}
              placeholder="64-character hexadecimal hash"
              className="mono mt-2 w-full resize-none rounded-lg border border-input bg-background p-3 text-xs leading-6 outline-none placeholder:text-muted-foreground/50 focus:border-primary"
              data-testid="input-live-verification-hash"
            />
          </label>
          <button
            onClick={() => verify.mutate(digest)}
            disabled={!digest.trim() || verify.isPending}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="button-verify-live-hash"
          >
            <FileCheck2 size={16} /> {verify.isPending ? 'Checking stored report…' : 'Verify saved report hash'}
          </button>
          {verify.data && (
            <div className={`mt-5 rounded-lg border p-4 ${verify.data.valid ? 'border-primary/30 bg-primary/10' : 'border-destructive/30 bg-destructive/10'}`} data-testid={`status-live-verification-${verify.data.valid ? 'match' : 'mismatch'}`}>
              <div className={`flex items-center gap-2 text-sm font-semibold ${verify.data.valid ? 'text-primary' : 'text-destructive'}`}>
                {verify.data.valid ? <Check size={17} /> : <X size={17} />}
                {verify.data.valid ? 'Saved report verified' : 'No matching intact report'}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{verify.data.detail}</p>
              {verify.data.report_id && <p className="mt-2 mono text-[10px]">{verify.data.report_id}</p>}
            </div>
          )}
        </Panel>
        <Panel className="p-6">
          <div className="mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Verification scope</div>
          <div className="mt-5 space-y-4 text-xs">
            <div className="flex justify-between border-b border-border pb-4"><span className="text-muted-foreground">Algorithm</span><span className="mono">SHA-256</span></div>
            <div className="flex justify-between border-b border-border pb-4"><span className="text-muted-foreground">Reference</span><span className="mono">Stored report bytes</span></div>
            <div className="flex justify-between border-b border-border pb-4"><span className="text-muted-foreground">Evidence</span><span className="mono">Per-event digest + chain link</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Demo/test records</span><span className="mono">Excluded</span></div>
          </div>
          <Link href="/reports" className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-xs transition-colors hover:border-primary/50 hover:text-primary">
            <ArrowDownToLine size={14} className="rotate-180" /> Back to reports
          </Link>
        </Panel>
      </div>
    </LiveConsoleLayout>
  );
}
