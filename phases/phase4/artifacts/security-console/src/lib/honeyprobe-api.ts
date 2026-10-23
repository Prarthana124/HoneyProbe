export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type EventEnvironment = 'local' | 'test' | 'configured_lab';

export type ActivityBucket = {
  bucket: string;
  count: number;
};

export type DecoyService = {
  id: 'web' | 'ssh' | 'database' | 'mobile';
  name: string;
  integration_type: string;
  status: 'connected' | 'not_configured' | 'unavailable' | 'demo_mode';
  description: string;
  event_count: number;
  last_event_at: string | null;
  setup_instructions: string;
};

export type Analytics = {
  total_events: number;
  demo_events: number;
  observed_events: number;
  events_over_time: ActivityBucket[];
  severity_counts: Record<Severity, number>;
  source_counts: Record<string, number>;
  category_counts: Record<string, number>;
  session_activity: unknown[];
  top_routes: { route: string; count: number }[];
};

export type SystemHealth = {
  status: 'healthy' | 'degraded';
  environment: string;
  database: { status: string; engine: string; path_label: string };
  checked_at: string;
};

export type HoneyProbeEvent = {
  id: string;
  timestamp: string;
  source_type: 'web' | 'ssh' | 'database' | 'mobile';
  event_type: string;
  severity: Severity;
  source_address: string | null;
  target: string;
  session_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  environment: EventEnvironment;
  ingestion_source: string;
  processing_status: 'accepted' | 'rejected';
};

export type EventPage = {
  items: HoneyProbeEvent[];
  total: number;
  limit: number;
  offset: number;
};

export type Overview = {
  total_events: { value: number; context: string };
  suspicious_events: { value: number; context: string };
  findings_count: { value: number; context: string };
  suspicious_findings: { value: number; context: string };
  unique_sessions: { value: number; context: string };
  active_decoys: { value: number; context: string };
  telemetry_health: 'healthy' | 'degraded';
  activity: ActivityBucket[];
  severity_counts: Record<Severity, number>;
  recent_events: HoneyProbeEvent[];
  decoys: DecoyService[];
  last_updated: string;
};

export type SourceProfile = {
  source_address: string;
  event_count: number;
  session_count: number;
  first_seen: string;
  last_seen: string;
  highest_severity: Severity;
  category_counts: Record<string, number>;
  includes_demo_data: boolean;
  simulated_events: number;
  timeline: SourceProfileActivity[];
};

export type SourceProfileActivity = {
  event_id: string;
  timestamp: string;
  event_type: string;
  source_type: 'web' | 'ssh' | 'database' | 'mobile';
  severity: Severity;
  session_id: string | null;
  indicators: string[];
  simulated: boolean;
};

export type EvidenceRecord = {
  id: string;
  event_id: string;
  captured_at: string;
  sha256: string;
  previous_hash: string | null;
  chain_hash: string;
  event: HoneyProbeEvent;
  redacted: boolean;
};

export type DetectionFinding = {
  id: string;
  event_id: string;
  evidence_id: string;
  detector: string;
  rule_name: string;
  severity: Severity;
  reason: string;
  created_at: string;
  rule_id?: string | null;
  rule_version?: number | null;
};

export type DeceptionReadinessAssessment = {
  readiness_score: number;
  passed: number;
  total: number;
  status: 'ready' | 'partial' | 'unavailable';
  scope: 'controlled_simulation';
  checks: {
    channel: 'web' | 'ssh' | 'database' | 'mobile';
    passed: boolean;
    detector: string;
    detail: string;
  }[];
  limitations: string[];
  evaluated_at: string;
};

export type SelfTestResult = {
  name: string;
  status: 'pass' | 'fail' | 'blocked' | 'not_run';
  duration_ms: number;
  last_run: string | null;
  diagnostic: string;
};

export type AdaptiveActionAudit = {
  id: string;
  action: 'restrict_file_permissions' | 'restrict_configuration_file_permissions';
  actor_id: string;
  requested_at: string;
  mode: 'dry_run';
  applied: false;
  result: 'previewed' | 'blocked' | 'failed';
  reason: string;
  preview: Record<string, unknown>;
  finding_id: string | null;
  evidence_id: string | null;
};

export type AdaptiveProposal = {
  id: string;
  finding_id: string;
  evidence_id: string;
  response_profile: 'baseline' | 'contextual';
  previous_profile: 'baseline' | 'contextual' | null;
  status: 'pending' | 'applied' | 'rejected' | 'rolled_back';
  reason: string;
  proposed_by: string;
  proposed_at: string;
  approved_by: string | null;
  approved_at: string | null;
  applied_at: string | null;
  rolled_back_at: string | null;
  applied_version: number | null;
  verification_status: 'not_run' | 'passed' | 'failed';
  verification_detail: string;
};

export type WebDecoyConfig = {
  response_profile: 'baseline' | 'contextual';
  version: number;
  updated_at: string;
  updated_by: string;
};

export type ReportDocument = {
  id: string;
  generated_at: string;
  sha256: string;
  summary: {
    includes_demo_data: boolean;
    total_events: number;
    severity_counts: Record<Severity, number>;
  };
  events: HoneyProbeEvent[];
  evidence: EvidenceRecord[];
  findings: DetectionFinding[];
  self_tests: SelfTestResult[];
  adaptive_actions: AdaptiveActionAudit[];
  adaptive_proposals: AdaptiveProposal[];
};

export type ReportVerification = {
  valid: boolean;
  report_id: string | null;
  checked_at: string;
  detail: string;
};

export async function honeyProbeRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let detail = `HoneyProbe API returned HTTP ${response.status}.`;
    try {
      const body = (await response.json()) as {
        detail?: string;
        error?: string;
      };
      detail = body.detail ?? body.error ?? detail;
    } catch {
      // Preserve the useful status message when a proxy returns non-JSON.
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export function isSimulatedEvent(event: HoneyProbeEvent): boolean {
  return (
    event.environment === 'test' ||
    event.metadata.simulated === true ||
    event.metadata.demo === true
  );
}
