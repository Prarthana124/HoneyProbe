import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { honeyProbeRequest } from '@/lib/honeyprobe-api';
import { ConsoleShell, PageHeader, Panel, StatusPill } from '@/components/console-shell';

type Decoy = {
  id: 'web' | 'ssh' | 'database' | 'mobile';
  name: string;
  integration_type: string;
  status: 'connected' | 'not_configured' | 'unavailable' | 'demo_mode';
  description: string;
  event_count: number;
  last_event_at: string | null;
  setup_instructions: string;
};
type SelfTestResult = {
  name: string;
  status: 'pass' | 'fail' | 'blocked' | 'not_run';
  duration_ms: number;
  last_run: string | null;
  diagnostic: string;
};
type SelfTestRun = {
  results: SelfTestResult[];
  passed: number;
  failed: number;
  blocked: number;
  completed_at: string;
};
type EventRecord = { id: string; source_type: string; event_type: string; metadata: Record<string, unknown> };
type Assessment = {
  readiness_score: number;
  passed: number;
  total: number;
  status: 'ready' | 'partial' | 'unavailable';
  scope: 'controlled_simulation';
  limitations: string[];
  evaluated_at: string;
};
type AuditRecord = {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  occurred_at: string;
  details: Record<string, unknown>;
};

const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50';
const safeFixtures: Record<Decoy['id'], Record<string, unknown>> = {
  web: { route: '/admin', interaction: 'protected_route_attempt', method: 'GET' },
  ssh: { interaction: 'banner_probe' },
  database: { operation_category: 'schema_probe', target: 'decoy://honeyprobe/test-schema' },
  mobile: { interaction: 'deep_link_probe', component: 'admin' },
};

type OperationsSection = 'all' | 'decoys' | 'self-tests';

export function LiveOperationsPage({ section = 'all' }: { section?: OperationsSection } = {}) {
  const showDecoys = section !== 'self-tests';
  const showSelfTests = section !== 'decoys';
  const client = useQueryClient();
  const [lastEvent, setLastEvent] = useState<EventRecord | null>(null);
  const [lastRun, setLastRun] = useState<SelfTestRun | null>(null);
  const decoys = useQuery({
    queryKey: ['operator-decoys'],
    queryFn: () => honeyProbeRequest<Decoy[]>('/api/decoys'),
    enabled: showDecoys,
  });
  const tests = useQuery({
    queryKey: ['operator-self-tests'],
    queryFn: () => honeyProbeRequest<SelfTestResult[]>('/api/self-tests'),
    enabled: showSelfTests,
  });
  const assessment = useQuery({
    queryKey: ['operator-deception-assessment'],
    queryFn: () => honeyProbeRequest<Assessment>('/api/assessment/deception'),
    enabled: showSelfTests,
  });
  const runTests = useMutation({
    mutationFn: () => honeyProbeRequest<SelfTestRun>('/api/self-tests/run', { method: 'POST', body: '{}' }),
    onSuccess: async (result) => {
      setLastRun(result);
      await client.invalidateQueries({ queryKey: ['operator-self-tests'] });
    },
  });
  const recordInteraction = useMutation({
    mutationFn: (decoy: Decoy['id']) =>
      honeyProbeRequest<EventRecord>(`/api/decoys/${decoy}/interaction`, {
        method: 'POST',
        body: JSON.stringify(safeFixtures[decoy]),
      }),
    onSuccess: async (event) => {
      setLastEvent(event);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['operator-decoys'] }),
        client.invalidateQueries({ queryKey: ['overview'] }),
        client.invalidateQueries({ queryKey: ['live-events'] }),
        client.invalidateQueries({ queryKey: ['live-findings'] }),
      ]);
    },
  });
  return (
    <ConsoleShell>
      <PageHeader
        eyebrow={section === 'decoys' ? 'Decoy service registry' : section === 'self-tests' ? 'Validation history' : 'Service status and validation'}
        title={section === 'decoys' ? 'Decoy services' : section === 'self-tests' ? 'Self-testing' : 'Decoys & self-tests'}
        description={section === 'decoys'
          ? 'Service states and event counts come from the backend registry. Clearly labeled simulator controls record local events without contacting third-party systems.'
          : section === 'self-tests'
            ? 'Run the persisted safe self-test suite and inspect the latest backend results. Checks stay inside the local HoneyProbe environment.'
            : 'Service health is read from the backend registry. Simulator interactions are bounded and never contact third-party systems.'}
        action={showSelfTests ? (
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            type="button"
            disabled={runTests.isPending}
            onClick={() => runTests.mutate()}
          >
            {runTests.isPending ? <RefreshCw size={14} className="animate-spin" /> : <FlaskConical size={14} />}
            Run safe self-tests
          </button>
        ) : undefined}
      />
      {(decoys.error || tests.error || assessment.error || runTests.error || recordInteraction.error) && (
        <Panel className="mb-5 border-destructive/30 p-4 text-sm text-destructive" role="alert">
          {(decoys.error || tests.error || assessment.error || runTests.error || recordInteraction.error)?.message}
        </Panel>
      )}
      <div className={`grid gap-5 ${section === 'all' ? 'lg:grid-cols-[1fr_340px]' : ''}`}>
        {showDecoys && <Panel className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Decoy integration registry</h2>
            <p className="mt-1 text-xs text-muted-foreground">Live status and event totals from persisted backend records.</p>
          </div>
          {decoys.isLoading ? <p className="p-5 text-sm text-muted-foreground">Loading decoy registry…</p> : (
            <div className="divide-y divide-border">
              {(decoys.data ?? []).map((decoy) => (
                <div className="flex flex-wrap items-center justify-between gap-4 p-5" key={decoy.id}>
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{decoy.name}</h3>
                      <StatusPill
                        value={decoy.status.replaceAll('_', ' ')}
                        tone={decoy.status === 'connected' ? 'good' : decoy.status === 'unavailable' ? 'bad' : 'warn'}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{decoy.description}</p>
                    <p className="mono mt-2 text-[10px] text-muted-foreground">{decoy.integration_type} · {decoy.event_count} persisted events</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{decoy.setup_instructions}</p>
                  </div>
                  <button
                    className={buttonClass}
                    type="button"
                    disabled={recordInteraction.isPending}
                    onClick={() => recordInteraction.mutate(decoy.id)}
                  >
                    <Send size={13} /> Record controlled test interaction
                  </button>
                </div>
              ))}
            </div>
          )}
          {lastEvent && (
            <div className="border-t border-primary/20 bg-primary/5 px-5 py-3 text-xs" role="status">
              Test event persisted: <span className="mono">{lastEvent.id}</span> · {lastEvent.source_type} · {lastEvent.event_type} · simulated={String(lastEvent.metadata.simulated === true)}
            </div>
          )}
        </Panel>}
        {showSelfTests && <Panel className="p-5">
          <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-primary" /><h2 className="text-sm font-semibold">Controlled detection coverage</h2></div>
          {assessment.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Evaluating configured test scenarios…</p> : assessment.data && (
            <>
              <div className="mt-4 flex items-end gap-2"><span className="text-3xl font-semibold">{assessment.data.passed}/{assessment.data.total}</span><span className="pb-1 text-xs text-muted-foreground">test scenarios</span></div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Scope: controlled simulation · evaluated {new Date(assessment.data.evaluated_at).toLocaleString()}</p>
              <p className="mt-2 text-xs text-accent">Not a real-world attack detection or service availability score.</p>
              <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] leading-5 text-muted-foreground">{assessment.data.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
            </>
          )}
        </Panel>}
      </div>
      {showSelfTests && (lastRun || tests.data) && (
        <Panel className="mt-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div><h2 className="text-sm font-semibold">Persisted self-test results</h2><p className="mt-1 text-xs text-muted-foreground">These checks execute schema, SQLite, ingestion, detection, export, and Phase 3 dry-run paths.</p></div>
            {lastRun && <span className="mono text-xs">{lastRun.passed} passed · {lastRun.failed} failed · {lastRun.blocked} blocked</span>}
          </div>
          <div className="divide-y divide-border">
            {(lastRun?.results ?? tests.data ?? []).map((result) => (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" key={result.name}>
                <div><p className="text-xs font-medium">{result.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{result.diagnostic}</p></div>
                <div className="text-right"><StatusPill value={result.status} tone={result.status === 'pass' ? 'good' : result.status === 'fail' ? 'bad' : 'warn'} /><p className="mono mt-1 text-[10px] text-muted-foreground">{result.duration_ms} ms</p></div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </ConsoleShell>
  );
}

export function LiveAuditPage() {
  const audit = useQuery({
    queryKey: ['operator-audit'],
    queryFn: () => honeyProbeRequest<AuditRecord[]>('/api/audit?limit=200'),
  });
  const adaptations = useQuery({
    queryKey: ['adaptive-action-audit'],
    queryFn: () => honeyProbeRequest<Array<{ id: string; actor_id: string; action: string; requested_at: string; result: string; applied: false; finding_id: string | null }>>('/api/adaptive-actions/audit?limit=200'),
  });
  return (
    <ConsoleShell>
      <PageHeader eyebrow="Operator accountability" title="Audit log" description="Persisted operator actions and adaptation previews. No action is represented as applied unless the backend records it as applied." />
      {(audit.error || adaptations.error) && <Panel className="mb-5 border-destructive/30 p-4 text-sm text-destructive" role="alert">{(audit.error || adaptations.error)?.message}</Panel>}
      <Panel className="overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold">Operator actions</h2><p className="mt-1 text-xs text-muted-foreground">Rule changes, rule tests, self-test runs, incident status changes, reports, and adaptation previews.</p></div>
        {audit.isLoading ? <p className="p-5 text-sm text-muted-foreground">Loading audit records…</p> : (audit.data ?? []).length === 0 ? <p className="p-5 text-sm text-muted-foreground">No operator actions have been recorded yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3">Time</th><th className="px-5 py-3">Actor</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Entity</th><th className="px-5 py-3">Details</th></tr></thead><tbody className="divide-y divide-border">{audit.data?.map((record) => <tr key={record.id}><td className="whitespace-nowrap px-5 py-3">{new Date(record.occurred_at).toLocaleString()}</td><td className="mono px-5 py-3">{record.actor_id}</td><td className="px-5 py-3">{record.action}</td><td className="mono px-5 py-3">{record.entity_type} · {record.entity_id}</td><td className="max-w-[340px] truncate px-5 py-3 text-muted-foreground">{JSON.stringify(record.details)}</td></tr>)}</tbody></table></div>
        )}
      </Panel>
      <Panel className="mt-5 overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold">Adaptive-action previews</h2><p className="mt-1 text-xs text-muted-foreground">Phase 3 actions remain dry-run only; this integration does not apply system or decoy configuration changes.</p></div>
        {adaptations.isLoading ? <p className="p-5 text-sm text-muted-foreground">Loading adaptation records…</p> : (adaptations.data ?? []).length === 0 ? <p className="p-5 text-sm text-muted-foreground">No adaptation previews recorded.</p> : (
          <div className="divide-y divide-border">{adaptations.data?.map((item) => <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs" key={item.id}><div><p className="font-medium">{item.action} · finding {item.finding_id ?? '—'}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.actor_id} · {new Date(item.requested_at).toLocaleString()}</p></div><StatusPill value={`${item.result} · applied=${item.applied}`} tone={item.applied ? 'good' : 'warn'} /></div>)}</div>
        )}
      </Panel>
    </ConsoleShell>
  );
}

export function DemoOperationsNotice() {
  return <ConsoleShell><PageHeader eyebrow="Demo preview" title="Operations unavailable" description="The static preview cannot run tests, create events, or inspect live service health. Sign in to use the protected operator tools." /></ConsoleShell>;
}

export function LiveDecoysPage() {
  return <LiveOperationsPage section="decoys" />;
}

export function LiveSelfTestsPage() {
  return <LiveOperationsPage section="self-tests" />;
}
