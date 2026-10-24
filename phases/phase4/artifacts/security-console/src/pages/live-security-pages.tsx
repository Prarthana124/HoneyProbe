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
  type AdaptiveProposal,
  type DeceptionReadinessAssessment,
  type DetectionFinding,
  type EvidenceRecord,
  type EventPage,
  type HoneyProbeEvent,
  type Overview,
  type ReportDocument,
  type ReportVerification,
  type SelfTestResult,
  type Severity,
  type SourceProfile,
  type WebDecoyConfig,
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
import { ActivityBars, DistributionRing } from '@/components/dashboard-charts';

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
    <Panel className="dashboard-metric console-enter border-t-2 p-3.5">
      <div className="flex items-start justify-between">
        <div className="mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">
          {label}
        </div>
        <div className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-[-.04em]">{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{detail}</div>
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

const CONTROLLED_SCENARIOS: {
  label: string;
  path: string;
  body: Record<string, string>;
}[] = [
  {
    label: 'Web route observation',
    path: '/api/decoys/web/interaction',
    body: { route: '/service-probe', interaction: 'route_visit' },
  },
  {
    label: 'SSH banner check',
    path: '/api/decoys/ssh/interaction',
    body: { interaction: 'banner_probe' },
  },
  {
    label: 'Database schema check',
    path: '/api/decoys/database/interaction',
    body: {
      operation_category: 'schema_probe',
      target: 'decoy://ledger/schema',
    },
  },
  {
    label: 'Mobile deep-link check',
    path: '/api/decoys/mobile/interaction',
    body: { interaction: 'deep_link_probe', component: 'admin' },
  },
];

export function LiveDashboard() {
  const queryClient = useQueryClient();
  const [simulationMessage, setSimulationMessage] = useState<string | null>(null);
  const overview = useQuery({
    queryKey: ['honeyprobe', 'overview', 'observed'],
    queryFn: () =>
      honeyProbeRequest<Overview>('/api/overview?include_demo=false'),
    refetchInterval: 30_000,
  });
  const events = useQuery({
    queryKey: ['honeyprobe', 'events', 'recent-observed'],
    queryFn: () =>
      honeyProbeRequest<EventPage>('/api/events?include_demo=false&limit=8'),
    refetchInterval: 30_000,
  });
  const profiles = useQuery({
    queryKey: ['honeyprobe', 'profiles', 'observed'],
    queryFn: () =>
      honeyProbeRequest<SourceProfile[]>('/api/sources/profiles?include_demo=false&limit=8'),
    refetchInterval: 30_000,
  });
  const findings = useQuery({
    queryKey: ['honeyprobe', 'findings', 'observed'],
    queryFn: () =>
      honeyProbeRequest<DetectionFinding[]>('/api/findings?include_demo=false&limit=200'),
    refetchInterval: 30_000,
  });
  const evidence = useQuery({
    queryKey: ['honeyprobe', 'evidence', 'observed'],
    queryFn: () =>
      honeyProbeRequest<EvidenceRecord[]>(
        '/api/evidence?include_demo=false&limit=25',
      ),
    refetchInterval: 30_000,
  });
  const assessment = useQuery({
    queryKey: ['honeyprobe', 'assessment', 'controlled-simulation'],
    queryFn: () =>
      honeyProbeRequest<DeceptionReadinessAssessment>(
        '/api/assessment/deception',
      ),
  });
  const selfTests = useQuery({
    queryKey: ['honeyprobe', 'dashboard-self-tests'],
    queryFn: () => honeyProbeRequest<SelfTestResult[]>('/api/self-tests'),
    refetchInterval: 30_000,
  });
  const adaptations = useQuery({
    queryKey: ['honeyprobe', 'dashboard-adaptations'],
    queryFn: () => honeyProbeRequest<AdaptiveProposal[]>('/api/adaptations?limit=10'),
    refetchInterval: 30_000,
  });
  const simulation = useMutation({
    mutationFn: (scenario: {
      path: string;
      body: Record<string, string>;
    }) =>
      honeyProbeRequest<HoneyProbeEvent>(scenario.path, {
        method: 'POST',
        body: JSON.stringify(scenario.body),
      }),
    onSuccess: (event) => {
      setSimulationMessage(`Recorded synthetic event ${event.id}.`);
      void queryClient.invalidateQueries({ queryKey: ['honeyprobe'] });
    },
  });
  const error =
    overview.error ??
    events.error ??
    profiles.error ??
    findings.error ??
    evidence.error ??
    assessment.error ??
    selfTests.error ??
    adaptations.error ??
    simulation.error;
  const data = overview.data;
  const highFindingCount = data?.suspicious_findings.value ?? 0;
  const activityBuckets = (data?.activity ?? []).slice(-24).reduce<Array<{ bucket: string; count: number }>>((groups, item, index, source) => {
    if (index % 2 !== 0) return groups;
    const pair = source.slice(index, index + 2);
    groups.push({
      bucket: item.bucket,
      count: pair.reduce((sum, bucket) => sum + bucket.count, 0),
    });
    return groups;
  }, []);
  const peakActivity = Math.max(1, ...activityBuckets.map((bucket) => bucket.count));
  const categoryCounts = (findings.data ?? []).reduce<Record<string, number>>((counts, finding) => {
    counts[finding.rule_name] = (counts[finding.rule_name] ?? 0) + 1;
    return counts;
  }, {});
  const findingCategories = Object.entries(categoryCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);
  const latestTests = (selfTests.data ?? []).filter((test) => test.last_run).slice(0, 3);
  const recentAdaptations = adaptations.data ?? [];
  const pendingAdaptations = recentAdaptations.filter((item) => item.status === 'pending').length;

  return (
    <LiveConsoleLayout>
      <PageHeader
        eyebrow="01 / operational picture"
        title="HoneyProbe operations"
        description="Live operational view backed by persisted events, findings, service registry, self-tests, and controlled adaptation records. Test/demo events are excluded."
        action={<LiveModeBadge />}
      />
      {error && <ApiError error={error as Error} />}
      {(overview.isLoading ||
        events.isLoading ||
        profiles.isLoading ||
        evidence.isLoading ||
        selfTests.isLoading ||
        adaptations.isLoading) &&
      !data ? (
        <LoadingPanel />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Observed events"
              value={String(data?.total_events.value ?? 0)}
              detail="Non-demo records in the last 24 hours"
            />
            <MetricCard
              label="Detection findings"
              value={String(data?.findings_count.value ?? 0)}
              detail="Rule matches linked to persisted events"
              accent="accent"
            />
            <MetricCard
              label="High / critical findings"
              value={String(highFindingCount)}
              detail="Persisted findings in the selected window"
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
          <div className="mb-6 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
            <Panel className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Controlled lab scenarios</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Creates synthetic records only. No external target, credentials, device data, or commands are used.
                  </p>
                </div>
                <ShieldCheck size={18} className="shrink-0 text-primary" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {CONTROLLED_SCENARIOS.map((scenario) => (
                  <button
                    key={scenario.path}
                    type="button"
                    disabled={simulation.isPending}
                    onClick={() => {
                      setSimulationMessage(null);
                      simulation.mutate(scenario);
                    }}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {scenario.label}
                  </button>
                ))}
              </div>
              {simulation.isPending && (
                <p className="mt-3 text-xs text-muted-foreground">Recording synthetic event…</p>
              )}
              {simulationMessage && (
                <p className="mt-3 text-xs text-primary" role="status">
                  {simulationMessage}
                </p>
              )}
            </Panel>
            <Panel className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Simulation readiness</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Controlled detector coverage, not real-world deception effectiveness
                  </p>
                </div>
                <span className="mono text-2xl font-semibold">
                  {assessment.data ? `${assessment.data.readiness_score}%` : '—'}
                </span>
              </div>
              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Controlled simulation detector coverage"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={assessment.data?.readiness_score ?? 0}
              >
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${assessment.data?.readiness_score ?? 0}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {assessment.data
                  ? `${assessment.data.passed} of ${assessment.data.total} channel checks matched`
                  : 'Loading controlled checks…'}
              </p>
              <div className="mt-3 space-y-2">
                {(assessment.data?.checks ?? []).map((item) => (
                  <div key={item.channel} className="flex items-center gap-2 text-xs">
                    <span className={item.passed ? 'text-primary' : 'text-destructive'}>
                      {item.passed ? 'PASS' : 'CHECK'}
                    </span>
                    <span className="capitalize text-muted-foreground">{item.channel}</span>
                    <span className="truncate">{item.detector}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <div className="mb-6 grid gap-5 xl:grid-cols-3">
            <Panel className="p-5 xl:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Persisted activity · last 24 hours</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Two-hour totals from backend hourly buckets; test/demo events are excluded.</p>
                </div>
                <Link href="/incidents" className="text-xs text-primary hover:underline">Investigate events</Link>
              </div>
              {activityBuckets.length > 0 ? (
                <div className="mt-5 grid h-36 grid-cols-12 items-end gap-2" role="img" aria-label="Hourly event activity chart">
                  {activityBuckets.map((bucket) => {
                    const height = Math.max(4, (bucket.count / peakActivity) * 100);
                    return (
                      <div className="flex h-full min-w-0 flex-col items-center justify-end gap-2" key={bucket.bucket} title={`${new Date(bucket.bucket).toLocaleString()}: ${bucket.count} events`}>
                        <span className="mono text-[9px] text-muted-foreground">{bucket.count}</span>
                        <div className="w-full rounded-t bg-primary/80" style={{ height: `${height}%` }} />
                        <span className="mono text-[8px] text-muted-foreground">{new Date(bucket.bucket).toLocaleTimeString([], { hour: '2-digit' })}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No activity buckets are available.</div>
              )}
              <div className="mt-6 border-t border-border pt-4">
                <h3 className="text-xs font-semibold">Finding categories by matched rule</h3>
                <p className="mt-1 text-[10px] text-muted-foreground">Distribution uses persisted non-demo rule matches loaded for this dashboard.</p>
                {findingCategories.length > 0 ? (
                  <div className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2">
                    {findingCategories.map(([name, count]) => (
                      <div key={name}>
                        <div className="mb-1 flex justify-between gap-3 text-[10px]"><span className="truncate">{name}</span><span className="mono text-muted-foreground">{count}</span></div>
                        <div className="h-1.5 overflow-hidden rounded bg-muted"><div className="h-full rounded bg-accent" style={{ width: `${Math.max(6, (count / Math.max(...findingCategories.map((item) => item[1]))) * 100)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">{findings.isLoading ? 'Loading rule matches…' : 'No persisted findings in the selected window.'}</p>
                )}
              </div>
            </Panel>
            <Panel className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Decoy service health</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Backend registry status</p>
                </div>
                <Link href="/settings" aria-label="Open system health" className="text-xs text-primary hover:underline">Details</Link>
              </div>
              <div className="mt-4 space-y-3">
                {(data?.decoys ?? []).map((decoy) => (
                  <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-2 last:border-0" key={decoy.id}>
                    <div className="min-w-0"><p className="truncate text-xs font-medium">{decoy.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{decoy.event_count} persisted interactions</p></div>
                    <StatusPill value={decoy.status.replaceAll('_', ' ')} tone={decoy.status === 'connected' ? 'good' : decoy.status === 'unavailable' ? 'bad' : 'warn'} />
                  </div>
                ))}
                {!data?.decoys.length && <p className="text-xs text-muted-foreground">No service registry data is available.</p>}
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold">Latest self-tests</h3><Link href="/self-tests" className="text-[10px] text-primary hover:underline">View tests</Link></div>
                <div className="mt-3 space-y-2">
                  {latestTests.map((test) => (
                    <div className="flex items-start justify-between gap-3" key={test.name}>
                      <span className="min-w-0 text-[10px] text-muted-foreground">{test.name}</span>
                      <StatusPill value={test.status} tone={test.status === 'pass' ? 'good' : test.status === 'fail' ? 'bad' : 'warn'} />
                    </div>
                  ))}
                  {!selfTests.isLoading && latestTests.length === 0 && <p className="text-[10px] text-muted-foreground">No persisted self-test results.</p>}
                </div>
              </div>
            </Panel>
          </div>
          <Panel className="mb-6 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">Adaptation approvals and outcomes</h2>
                <p className="mt-1 text-xs text-muted-foreground">Approval and verification states are read from persisted proposals.</p>
              </div>
              <Link href="/adaptation-history" className="text-xs text-primary hover:underline">Open history · {pendingAdaptations} pending in latest 10</Link>
            </div>
            {recentAdaptations.length > 0 ? (
              <div className="divide-y divide-border/70">
                {recentAdaptations.slice(0, 4).map((item) => (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" key={item.id}>
                    <div><p className="text-xs font-medium">Web decoy · {item.response_profile} profile</p><p className="mt-1 text-[10px] text-muted-foreground">Finding {item.finding_id} · verification {item.verification_status}</p></div>
                    <StatusPill value={item.status} tone={item.status === 'applied' ? 'good' : item.status === 'pending' ? 'warn' : item.status === 'rejected' ? 'bad' : 'neutral'} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-5 text-xs text-muted-foreground">{adaptations.isLoading ? 'Loading adaptation history…' : 'No adaptation proposals are recorded.'}</p>
            )}
          </Panel>
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
          <Panel className="mt-5 overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold">Persisted detection findings</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Phase 2 rules linked to stored events and evidence · demo records excluded
              </p>
            </div>
            {findings.data && findings.data.length > 0 ? (
              <div className="divide-y divide-border/70">
                  {findings.data.slice(0, 8).map((finding) => {
                  const linkedEvidence = evidence.data?.find(
                    (record) => record.id === finding.evidence_id,
                  );
                  return (
                      <div key={finding.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill value={finding.severity.toUpperCase()} />
                            <span className="text-sm font-medium">{finding.rule_name}</span>
                            <span className="mono text-[10px] text-muted-foreground">{finding.detector}</span>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{finding.reason}</p>
                          <p className="mono mt-2 break-all text-[10px] text-muted-foreground">
                            Event {finding.event_id} · Evidence {finding.evidence_id}
                          </p>
                          {evidence.data && (
                            <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                                Persisted evidence snapshot
                              </p>
                              {linkedEvidence ? (
                                <>
                                  <p className="mt-2 text-[11px] text-muted-foreground">
                                    Captured {formatDateTime(linkedEvidence.captured_at)} · event{' '}
                                    {linkedEvidence.event_id}
                                  </p>
                                  <p className="mono mt-1 break-all text-[10px] text-muted-foreground">
                                    SHA-256 {linkedEvidence.sha256}
                                  </p>
                                  <p className="mono mt-1 break-all text-[10px] text-muted-foreground">
                                    Chain {linkedEvidence.chain_hash}
                                  </p>
                                </>
                              ) : (
                                <p className="mt-2 text-[11px] text-muted-foreground">
                                  No persisted evidence record matches this finding.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        <time className="shrink-0 text-[10px] text-muted-foreground">
                          {formatShortTime(finding.created_at)}
                        </time>
                      </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-5 text-sm text-muted-foreground">
                {findings.isLoading ? 'Loading persisted findings…' : 'No Phase 2 findings have been recorded.'}
              </div>
            )}
          </Panel>
        </>
      )}
    </LiveConsoleLayout>
  );
}

export function LiveIncidents() {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [selected, setSelected] = useState<HoneyProbeEvent | null>(null);
  const [selectedSourceAddress, setSelectedSourceAddress] = useState<string | null>(null);
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
  const findings = useQuery({
    queryKey: ['honeyprobe', 'findings', 'incidents'],
    queryFn: () => honeyProbeRequest<DetectionFinding[]>('/api/findings?include_demo=false&limit=200'),
    refetchInterval: 30_000,
  });
  const filtered = useMemo(
    () =>
      (events.data?.items ?? []).filter((event) => {
        const text = `${event.id} ${event.event_type} ${event.source_address ?? ''} ${event.target} ${event.summary}`.toLowerCase();
        return text.includes(query.toLowerCase()) && (severity === 'all' || event.severity === severity);
      }),
    [events.data?.items, query, severity],
  );
  const selectedProfile = profiles.data?.find(
    (profile) => profile.source_address === selectedSourceAddress,
  );

  return (
    <LiveConsoleLayout>
      <PageHeader
        eyebrow="02 / incident register"
        title="Incidents & attacks"
        description="Investigate persisted event observations, rule-linked findings, evidence references, and event-derived source profiles. Test/demo records are excluded."
        action={<LiveModeBadge />}
      />
      {(events.error || profiles.error || findings.error) && <ApiError error={(events.error ?? profiles.error ?? findings.error) as Error} />}
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Detected incidents</h2>
            <p className="mt-1 text-xs text-muted-foreground">Rule matches linked to stored event and evidence IDs · newest first</p>
          </div>
          <Link href="/evidence" className="text-xs text-primary hover:underline">Review evidence</Link>
        </div>
        {findings.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading persisted findings…</p>
        ) : (findings.data ?? []).length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No non-demo findings have been recorded.</p>
        ) : (
          <div className="divide-y divide-border/70">
            {(findings.data ?? []).map((finding) => {
              const event = events.data?.items.find((item) => item.id === finding.event_id);
              return (
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={finding.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><StatusPill value={finding.severity.toUpperCase()} /><span className="text-sm font-medium">{finding.rule_name}</span></div>
                    <p className="mt-2 text-xs text-muted-foreground">{finding.reason}</p>
                    <p className="mono mt-1 break-all text-[10px] text-muted-foreground">Finding {finding.id} · Event {finding.event_id} · Evidence {finding.evidence_id}</p>
                  </div>
                  {event && <button type="button" onClick={() => setSelected(event)} className="rounded-md border border-border px-3 py-2 text-xs hover:border-primary/50 hover:text-primary">Inspect event</button>}
                </div>
              );
            })}
          </div>
        )}
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
                  <td className="px-4 py-4 mono text-xs">
                    <button
                      type="button"
                      className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-pressed={selectedSourceAddress === profile.source_address}
                      onClick={() =>
                        setSelectedSourceAddress((current) =>
                          current === profile.source_address ? null : profile.source_address,
                        )
                      }
                    >
                      {profile.source_address}
                    </button>
                  </td>
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
        {selectedProfile && (
          <div className="border-t border-border p-5" data-testid="panel-source-timeline">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Observed behavior timeline</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedProfile.source_address} · latest {selectedProfile.timeline.length} events
                </p>
              </div>
              <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] text-primary">
                Category indicators only
              </span>
            </div>
            {selectedProfile.timeline.length > 0 ? (
              <ol className="mt-4 space-y-3">
                {selectedProfile.timeline.map((activity) => (
                  <li
                    key={activity.event_id}
                    className="rounded-lg border border-border bg-muted/20 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill value={activity.severity.toUpperCase()} />
                        <span className="text-xs font-medium">{activity.event_type}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {activity.source_type}
                        </span>
                        {activity.simulated && (
                          <span className="rounded border border-accent/30 px-1.5 py-0.5 text-[9px] text-accent">
                            SIMULATED
                          </span>
                        )}
                      </div>
                      <time className="text-[10px] text-muted-foreground">
                        {formatDateTime(activity.timestamp)}
                      </time>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {activity.indicators.length > 0 ? (
                        activity.indicators.map((indicator) => (
                          <span
                            key={indicator}
                            className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground"
                          >
                            {indicator}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          No detection indicator matched
                        </span>
                      )}
                    </div>
                    <p className="mono mt-2 text-[10px] text-muted-foreground">
                      Event {activity.event_id}
                      {activity.session_id ? ` · Session ${activity.session_id}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                No recent events are available for this source.
              </p>
            )}
            <p className="mt-3 text-[10px] text-muted-foreground">
              This view stores and displays event categories only; it does not collect credentials or raw commands.
            </p>
          </div>
        )}
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

function WebDecoyAdaptiveWorkflow({ findings }: { findings: DetectionFinding[] }) {
  const queryClient = useQueryClient();
  const [findingId, setFindingId] = useState('');
  const [responseProfile, setResponseProfile] =
    useState<WebDecoyConfig['response_profile']>('contextual');
  const [reason, setReason] = useState('');
  const config = useQuery({
    queryKey: ['honeyprobe', 'web-decoy-config'],
    queryFn: () => honeyProbeRequest<WebDecoyConfig>('/api/decoys/web/config'),
  });
  const proposals = useQuery({
    queryKey: ['honeyprobe', 'adaptive-proposals'],
    queryFn: () => honeyProbeRequest<AdaptiveProposal[]>('/api/adaptations?limit=100'),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['honeyprobe', 'web-decoy-config'] }),
      queryClient.invalidateQueries({ queryKey: ['honeyprobe', 'adaptive-proposals'] }),
      queryClient.invalidateQueries({ queryKey: ['honeyprobe', 'operator-audit'] }),
    ]);
  };
  const createProposal = useMutation({
    mutationFn: () => honeyProbeRequest<AdaptiveProposal>('/api/adaptations', {
      method: 'POST',
      body: JSON.stringify({ finding_id: findingId || findings[0]?.id, response_profile: responseProfile, reason }),
    }),
    onSuccess: refresh,
  });
  const approve = useMutation({
    mutationFn: (id: string) => honeyProbeRequest<AdaptiveProposal>(`/api/adaptations/${id}/approve`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: (id: string) => honeyProbeRequest<AdaptiveProposal>(`/api/adaptations/${id}/reject`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const rollback = useMutation({
    mutationFn: (id: string) => honeyProbeRequest<AdaptiveProposal>(`/api/adaptations/${id}/rollback`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const error = config.error ?? proposals.error ?? createProposal.error ?? approve.error ?? reject.error ?? rollback.error;
  const selectedFindingId = findings.some((item) => item.id === findingId) ? findingId : findings[0]?.id ?? '';
  const isBusy = createProposal.isPending || approve.isPending || reject.isPending || rollback.isPending;

  return (
    <Panel className="mb-5 overflow-hidden">
      <div className="border-b border-border px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Allowlisted web-decoy adaptation</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Only changes the local web decoy’s visible response profile. Approval applies the change; rollback restores the previous profile if no newer change superseded it.
            </p>
          </div>
          {config.data && <StatusPill value={`${config.data.response_profile} · v${config.data.version}`} tone="good" />}
        </div>
      </div>
      {error && <div className="m-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">{error.message}</div>}
      <div className="grid gap-3 p-5 md:grid-cols-[1.1fr_1fr_1.4fr_auto] md:items-end md:px-6">
        <label className="block text-xs text-muted-foreground">
          Triggering finding
          <select className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-foreground" value={selectedFindingId} onChange={(event) => setFindingId(event.target.value)} disabled={!findings.length}>
            {!findings.length && <option value="">No non-test findings</option>}
            {findings.map((finding) => <option key={finding.id} value={finding.id}>{finding.rule_name} · {finding.severity}</option>)}
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          Response profile
          <select className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-foreground" value={responseProfile} onChange={(event) => setResponseProfile(event.target.value as WebDecoyConfig['response_profile'])}>
            <option value="contextual">Contextual service notice</option>
            <option value="baseline">Baseline</option>
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          Reason
          <input className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-foreground" value={reason} maxLength={300} required onChange={(event) => setReason(event.target.value)} placeholder="Why is this response profile appropriate?" />
        </label>
        <button
          type="button"
          className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          disabled={isBusy || !selectedFindingId || !reason.trim() || !config.data || responseProfile === config.data.response_profile}
          onClick={() => createProposal.mutate()}
        >
          {createProposal.isPending ? 'Proposing…' : 'Propose change'}
        </button>
      </div>
      <div className="border-t border-border">
        <div className="px-5 py-3 text-xs font-semibold md:px-6">Proposal and verification history</div>
        {proposals.isLoading ? <p className="px-5 pb-5 text-xs text-muted-foreground">Loading proposal history…</p> : (proposals.data ?? []).length === 0 ? (
          <p className="px-5 pb-5 text-xs text-muted-foreground">No allowlisted response-profile changes have been proposed.</p>
        ) : (
          <div className="divide-y divide-border">
            {proposals.data?.map((proposal) => (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 md:px-6" key={proposal.id}>
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono text-[10px]">{proposal.id}</span>
                    <StatusPill value={proposal.status.replaceAll('_', ' ')} tone={proposal.status === 'applied' ? 'good' : proposal.status === 'pending' ? 'warn' : proposal.status === 'rolled_back' ? 'neutral' : 'bad'} />
                    <span className="text-[10px] text-muted-foreground">verify: {proposal.verification_status}</span>
                  </div>
                  <p className="mt-1 text-xs">{proposal.previous_profile ?? config.data?.response_profile ?? '—'} → {proposal.response_profile}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{proposal.reason} · finding {proposal.finding_id} · evidence {proposal.evidence_id}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{proposal.verification_detail}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {proposal.status === 'pending' && <>
                    <button type="button" className="rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground disabled:opacity-50" disabled={isBusy} onClick={() => { if (window.confirm('Apply this allowlisted change to the isolated web decoy?')) approve.mutate(proposal.id); }}>Approve & apply</button>
                    <button type="button" className="rounded-lg border border-border px-3 py-2 text-[11px] disabled:opacity-50" disabled={isBusy} onClick={() => { if (window.confirm('Reject this proposal without changing the decoy?')) reject.mutate(proposal.id); }}>Reject</button>
                  </>}
                  {proposal.status === 'applied' && <button type="button" className="rounded-lg border border-border px-3 py-2 text-[11px] disabled:opacity-50" disabled={isBusy} onClick={() => { if (window.confirm('Roll back this profile change? Rollback is refused if a newer configuration replaced it.')) rollback.mutate(proposal.id); }}>Rollback</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

export function LiveAdaptation() {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<AdaptiveActionAudit['action']>('restrict_file_permissions');
  const [findingId, setFindingId] = useState('');
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
  const findings = useQuery({
    queryKey: ['honeyprobe', 'findings', 'adaptation'],
    queryFn: () => honeyProbeRequest<DetectionFinding[]>('/api/findings?include_demo=false&limit=500'),
  });
  const selectedFindingId = findings.data?.some((item) => item.id === findingId)
    ? findingId
    : findings.data?.[0]?.id ?? '';
  const selectedFinding = findings.data?.find(
    (item) => item.id === selectedFindingId,
  );
  const linkedEvidence = useQuery({
    queryKey: ['honeyprobe', 'adaptation-evidence', selectedFinding?.evidence_id],
    queryFn: () => {
      if (!selectedFinding) {
        throw new Error('Select a finding before loading linked evidence.');
      }
      return honeyProbeRequest<EvidenceRecord>(
        `/api/evidence/by-id/${encodeURIComponent(selectedFinding.evidence_id)}`,
      );
    },
    enabled: Boolean(selectedFinding),
  });
  const evidenceMatchesFinding =
    Boolean(selectedFinding) &&
    linkedEvidence.data?.event_id === selectedFinding?.event_id &&
    linkedEvidence.data?.id === selectedFinding?.evidence_id;
  const preview = useMutation({
    mutationFn: () =>
      honeyProbeRequest<AdaptiveActionAudit>('/api/adaptive-actions/dry-run', {
        method: 'POST',
         body: JSON.stringify({ action, reason, finding_id: selectedFindingId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['honeyprobe', 'adaptive-action-audit'] }),
  });
  const error =
    audit.error ??
    tests.error ??
    findings.error ??
    linkedEvidence.error ??
    preview.error;

  return (
    <LiveConsoleLayout>
      <PageHeader
        eyebrow="03 / learning loop"
        title="Adaptation & audit"
        description="An approval-gated, allowlisted response-profile change is supported only for the loopback web decoy. Phase 3 host/file permission actions remain dry-run only."
        action={<LiveModeBadge />}
      />
      {error && <ApiError error={error as Error} />}
      <WebDecoyAdaptiveWorkflow findings={findings.data ?? []} />
      <Panel className="p-5 md:p-7">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/10 text-accent"><RefreshCw size={18} /></div>
          <div>
            <h2 className="text-sm font-semibold">Request a dry-run preview</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Link each preview to a real finding and its stored evidence. The Phase 3 adapter forces apply_changes=false; applied actions are not supported.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[1.25fr_1fr_1.4fr_auto] md:items-end">
          <label className="block text-xs text-muted-foreground">
            Evidence-linked finding
            <select
              value={selectedFindingId}
              onChange={(event) => setFindingId(event.target.value)}
              disabled={!findings.data?.length}
              className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-foreground"
            >
              {!findings.data?.length && <option value="">No live findings available</option>}
              {findings.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.rule_name} · {item.severity} · {item.id.slice(-8)}
                </option>
              ))}
            </select>
          </label>
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
            disabled={
              preview.isPending ||
              linkedEvidence.isLoading ||
              !evidenceMatchesFinding ||
              !reason.trim() ||
              !selectedFindingId
            }
            className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            data-testid="button-run-dry-run"
          >
            {preview.isPending ? 'Recording preview…' : 'Run safe preview'}
          </button>
        </div>
        {selectedFinding && (
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 text-xs">
            <div className="font-semibold">
              Selected finding: {selectedFinding.rule_name} · {selectedFinding.severity}
            </div>
            <p className="mt-2 leading-5 text-muted-foreground">
              {selectedFinding.reason}
            </p>
            <p className="mono mt-2 break-all text-[10px] text-muted-foreground">
              Finding {selectedFinding.id} · Event {selectedFinding.event_id}
            </p>
            {linkedEvidence.isLoading ? (
              <p className="mt-3 text-muted-foreground">Loading persisted linked evidence…</p>
            ) : evidenceMatchesFinding && linkedEvidence.data ? (
              <div className="mt-3 rounded-md border border-border bg-background/70 p-3">
                <div className="font-medium">Persisted linked evidence · redacted view</div>
                <p className="mono mt-1 break-all text-[10px] text-muted-foreground">
                  {linkedEvidence.data.id} · SHA-256 {linkedEvidence.data.sha256}
                </p>
                <p className="mt-2">{linkedEvidence.data.event.summary}</p>
                <p className="mono mt-1 break-all text-[10px] text-muted-foreground">
                  Event {linkedEvidence.data.event.id} · {linkedEvidence.data.event.source_type} · {linkedEvidence.data.event.target} · {formatDateTime(linkedEvidence.data.captured_at)}
                </p>
                <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/30 p-3 text-[10px] leading-5 text-muted-foreground" data-testid="evidence-payload">
                  {JSON.stringify(linkedEvidence.data.event.metadata, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="mt-3 text-destructive">
                The selected finding’s linked evidence could not be verified.
              </p>
            )}
          </div>
        )}
        {preview.data && (
          <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-4 text-xs" data-testid="status-dry-run">
            Recorded as <span className="mono">{preview.data.mode}</span>; result: {preview.data.result}. Applied: {String(preview.data.applied)}.
            {preview.data.evidence_id && <> Evidence: <span className="mono">{preview.data.evidence_id}</span>.</>}
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
        description="Generate a persisted report from non-demo events, linked evidence and findings, latest self-test results, and adaptation previews. Demo records are excluded by the API."
        action={<div className="flex flex-wrap items-center gap-2"><LiveModeBadge /><Link href="/evidence" className="rounded-lg border border-border px-3 py-2 text-xs hover:border-primary/50 hover:text-primary">Evidence ledger</Link></div>}
      />
      {(summary.error || generate.error) && <ApiError error={(summary.error ?? generate.error) as Error} />}
      <div className="grid gap-5 xl:grid-cols-[1fr_.8fr]">
        <Panel className="p-5">
          <div className="flex items-center gap-2"><FileCheck2 size={17} className="text-primary" /><h2 className="text-sm font-semibold">Report data</h2></div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Events, findings, evidence, self-test results, and preview-only adaptation records are read from the shared SQLite store.
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
                <div className="flex justify-between gap-3 border-b border-border pb-3"><span className="text-muted-foreground">Findings / tests / previews / adaptations</span><span className="mono">{activeReport.findings.length} / {activeReport.self_tests.length} / {activeReport.adaptive_actions.length} / {activeReport.adaptive_proposals.length}</span></div>
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
