import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Database, FileCheck2, History, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import {
  honeyProbeRequest,
  type AdaptiveActionAudit,
  type AdaptiveProposal,
  type DecoyService,
  type DetectionFinding,
  type EvidenceRecord,
  type SystemHealth,
} from '@/lib/honeyprobe-api';
import { formatDateTime } from '@/data/demo-data';
import { ConsoleShell, PageHeader, Panel, StatusPill } from '@/components/console-shell';

function ErrorPanel({ errors }: { errors: (Error | null | undefined)[] }) {
  const error = errors.find(Boolean);
  return error ? (
    <Panel className="mb-5 border-destructive/30 p-4 text-sm text-destructive" role="alert">
      {error.message} Live data was not replaced with sample records.
    </Panel>
  ) : null;
}

export function LiveEvidencePage() {
  const [search, setSearch] = useState('');
  const evidence = useQuery({
    queryKey: ['honeyprobe', 'evidence-ledger'],
    queryFn: () => honeyProbeRequest<EvidenceRecord[]>('/api/evidence?include_demo=false&limit=200'),
    refetchInterval: 30_000,
  });
  const findings = useQuery({
    queryKey: ['honeyprobe', 'evidence-findings'],
    queryFn: () => honeyProbeRequest<DetectionFinding[]>('/api/findings?include_demo=false&limit=200'),
    refetchInterval: 30_000,
  });
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (evidence.data ?? []).filter((record) => {
      if (!needle) return true;
      const finding = findings.data?.find((item) => item.evidence_id === record.id);
      return `${record.id} ${record.event_id} ${record.event.source_type} ${record.event.event_type} ${finding?.rule_name ?? ''} ${record.sha256}`.toLowerCase().includes(needle);
    });
  }, [evidence.data, findings.data, search]);

  return (
    <ConsoleShell>
      <PageHeader
        eyebrow="Evidence ledger"
        title="Evidence"
        description="Redacted evidence snapshots and their stored SHA-256 chain values, read from the persistent event store. Synthetic test records are excluded."
        action={<Link href="/reports" className="rounded-lg border border-border px-3 py-2 text-xs hover:border-primary/50 hover:text-primary">Reports & exports</Link>}
      />
      <ErrorPanel errors={[evidence.error, findings.error]} />
      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Persisted evidence records</h2>
            <p className="mt-1 text-xs text-muted-foreground">{filtered.length} matching records · values are redacted for display</p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search event, finding, or digest"
            aria-label="Search evidence"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary sm:max-w-sm"
          />
        </div>
        {evidence.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading persisted evidence…</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No matching non-demo evidence records were found.</p>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((record) => {
              const finding = findings.data?.find((item) => item.evidence_id === record.id);
              return (
                <article className="space-y-3 p-5" key={record.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <FileCheck2 size={15} className="text-primary" />
                        <span className="mono text-xs">{record.id}</span>
                        {finding ? <StatusPill value={finding.severity.toUpperCase()} /> : <StatusPill value="Unmatched event" tone="neutral" />}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Event {record.event_id} · {record.event.source_type} · {record.event.event_type} · captured {formatDateTime(record.captured_at)}
                      </p>
                      <p className="mt-1 text-xs">{finding ? `${finding.rule_name}: ${finding.reason}` : record.event.summary}</p>
                    </div>
                    <span className="rounded border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] uppercase text-primary">
                      {record.redacted ? 'Redacted view' : 'Stored'}
                    </span>
                  </div>
                  <dl className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 text-[10px] sm:grid-cols-2">
                    <div className="min-w-0"><dt className="uppercase tracking-wider text-muted-foreground">Event SHA-256</dt><dd className="mono mt-1 break-all text-foreground">{record.sha256}</dd></div>
                    <div className="min-w-0"><dt className="uppercase tracking-wider text-muted-foreground">Chain hash</dt><dd className="mono mt-1 break-all text-foreground">{record.chain_hash}</dd></div>
                    <div className="min-w-0 sm:col-span-2"><dt className="uppercase tracking-wider text-muted-foreground">Previous hash</dt><dd className="mono mt-1 break-all text-muted-foreground">{record.previous_hash ?? 'Genesis record'}</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
      <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
        Hash matching detects changes to stored content; it does not independently prove that an event is factually correct or externally immutable.
      </p>
    </ConsoleShell>
  );
}

export function LiveAdaptationHistoryPage() {
  const proposals = useQuery({
    queryKey: ['honeyprobe', 'adaptation-history'],
    queryFn: () => honeyProbeRequest<AdaptiveProposal[]>('/api/adaptations?limit=200'),
    refetchInterval: 30_000,
  });
  const actions = useQuery({
    queryKey: ['honeyprobe', 'dry-run-history'],
    queryFn: () => honeyProbeRequest<AdaptiveActionAudit[]>('/api/adaptive-actions/audit?limit=200'),
    refetchInterval: 30_000,
  });
  const timeline = useMemo(() => [
    ...(proposals.data ?? []).map((item) => ({ kind: 'profile' as const, id: item.id, at: item.proposed_at, item })),
    ...(actions.data ?? []).map((item) => ({ kind: 'preview' as const, id: item.id, at: item.requested_at, item })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), [proposals.data, actions.data]);

  return (
    <ConsoleShell>
      <PageHeader
        eyebrow="Change history"
        title="Adaptation history"
        description="Persisted allowlisted web-decoy profile proposals and Phase 3 dry-run previews, including their actual approval and verification states."
        action={<Link href="/adaptation" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Adaptive deception</Link>}
      />
      <ErrorPanel errors={[proposals.error, actions.error]} />
      <Panel className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Recorded adaptation activity</h2>
          <p className="mt-1 text-xs text-muted-foreground">Newest first · only a verified allowlisted web-decoy profile can be applied</p>
        </div>
        {(proposals.isLoading || actions.isLoading) ? (
          <p className="p-6 text-sm text-muted-foreground">Loading adaptation history…</p>
        ) : timeline.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No adaptation proposals or previews have been recorded.</p>
        ) : (
          <div className="divide-y divide-border">
            {timeline.map((entry) => entry.kind === 'profile' ? (
              <article className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between" key={`profile-${entry.id}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><Activity size={15} className="text-primary" /><span className="text-sm font-medium">Web decoy profile proposal</span><StatusPill value={entry.item.status} /></div>
                  <p className="mt-2 text-xs text-muted-foreground">{entry.item.previous_profile ?? 'no prior profile'} → {entry.item.response_profile} · finding {entry.item.finding_id} · evidence {entry.item.evidence_id}</p>
                  <p className="mt-1 text-xs">{entry.item.reason}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">{entry.item.verification_status}: {entry.item.verification_detail || 'No verification result recorded.'}</p>
                </div>
                <time className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(entry.at)}</time>
              </article>
            ) : (
              <article className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between" key={`preview-${entry.id}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><History size={15} className="text-accent" /><span className="text-sm font-medium">Phase 3 response preview</span><StatusPill value={`${entry.item.mode} · ${entry.item.result}`} tone={entry.item.applied ? 'bad' : 'warn'} /></div>
                  <p className="mt-2 text-xs text-muted-foreground">{entry.item.action.replaceAll('_', ' ')} · finding {entry.item.finding_id ?? '—'} · evidence {entry.item.evidence_id ?? '—'}</p>
                  <p className="mt-1 text-xs">{entry.item.reason}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">Applied: {String(entry.item.applied)} · actor: {entry.item.actor_id}</p>
                </div>
                <time className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(entry.at)}</time>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </ConsoleShell>
  );
}

export function LiveSystemHealthPage() {
  const client = useQueryClient();
  const health = useQuery({
    queryKey: ['honeyprobe', 'system-health'],
    queryFn: () => honeyProbeRequest<SystemHealth>('/api/health'),
    refetchInterval: 30_000,
  });
  const apiHealth = useQuery({
    queryKey: ['honeyprobe', 'gateway-health'],
    queryFn: () => honeyProbeRequest<{ status: string }>('/api/healthz'),
    refetchInterval: 30_000,
  });
  const decoys = useQuery({
    queryKey: ['honeyprobe', 'system-decoys'],
    queryFn: () => honeyProbeRequest<DecoyService[]>('/api/decoys'),
    refetchInterval: 30_000,
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ['honeyprobe'] });
  const errors = [health.error, apiHealth.error, decoys.error];

  return (
    <ConsoleShell>
      <PageHeader
        eyebrow="Runtime status"
        title="Settings & system health"
        description="Read-only health from the authenticated backend. Security-sensitive configuration stays in Replit Secrets and environment settings; values are never displayed here."
        action={<button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:border-primary/50"><RefreshCw size={14} /> Refresh status</button>}
      />
      <ErrorPanel errors={errors} />
      <div className="grid gap-5 md:grid-cols-2">
        <Panel className="p-5">
          <div className="flex items-center gap-2"><Server size={17} className="text-primary" /><h2 className="text-sm font-semibold">API gateway</h2></div>
          {apiHealth.isLoading ? <p className="mt-4 text-xs text-muted-foreground">Checking gateway…</p> : <div className="mt-4 flex items-center justify-between"><span className="text-xs text-muted-foreground">Health endpoint</span><StatusPill value={apiHealth.data?.status ?? 'unavailable'} tone={apiHealth.data?.status === 'ok' ? 'good' : 'bad'} /></div>}
          <p className="mt-3 text-[10px] leading-5 text-muted-foreground">This check confirms the API process responds; it does not assert that external decoy listeners are running.</p>
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center gap-2"><Database size={17} className="text-primary" /><h2 className="text-sm font-semibold">Persistent database</h2></div>
          {health.isLoading ? <p className="mt-4 text-xs text-muted-foreground">Checking database…</p> : (
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Status</span><StatusPill value={health.data?.database.status ?? 'unavailable'} tone={health.data?.database.status === 'healthy' ? 'good' : 'bad'} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Engine</span><span className="mono">{health.data?.database.engine ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Environment</span><span className="mono">{health.data?.environment ?? '—'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Storage label</span><span className="mono text-right">{health.data?.database.path_label ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Checked</span><span>{health.data ? formatDateTime(health.data.checked_at) : '—'}</span></div>
            </div>
          )}
        </Panel>
      </div>
      <Panel className="mt-5 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2"><ShieldCheck size={17} className="text-primary" /><h2 className="text-sm font-semibold">Decoy integration status</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Registry state is reported by the backend. Simulator status is not represented as an independently running service.</p>
        </div>
        {decoys.isLoading ? <p className="p-5 text-sm text-muted-foreground">Loading service registry…</p> : (
          <div className="divide-y divide-border">
            {(decoys.data ?? []).map((decoy) => (
              <div className="flex flex-wrap items-start justify-between gap-3 p-5" key={decoy.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium">{decoy.name}</h3><StatusPill value={decoy.status.replaceAll('_', ' ')} tone={decoy.status === 'connected' ? 'good' : decoy.status === 'unavailable' ? 'bad' : 'warn'} /></div>
                  <p className="mt-1 text-xs text-muted-foreground">{decoy.integration_type} · {decoy.event_count} persisted interactions</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{decoy.description}</p>
                </div>
                <span className="text-[10px] text-muted-foreground">{decoy.last_event_at ? `Last event ${formatDateTime(decoy.last_event_at)}` : 'No recorded events'}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
        This view intentionally does not expose secret values or provide controls that modify authentication, network access, host files, or decoy configuration.
      </p>
    </ConsoleShell>
  );
}
