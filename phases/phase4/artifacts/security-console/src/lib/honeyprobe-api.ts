export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type EventEnvironment = 'local' | 'test' | 'configured_lab';

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
  unique_sessions: { value: number; context: string };
  active_decoys: { value: number; context: string };
  telemetry_health: 'healthy' | 'degraded';
  severity_counts: Record<Severity, number>;
  recent_events: HoneyProbeEvent[];
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
