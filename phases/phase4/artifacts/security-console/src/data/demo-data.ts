export type Incident = {
  id: string;
  timestamp: string;
  attackType: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Contained' | 'Investigating' | 'Resolved';
  source: string;
  detectionScore: number;
  attackScore: number;
  behaviour: string;
  response: string;
  adaptation: string;
  phase: 'Phase 1' | 'Phase 2' | 'Phase 3';
  demo: boolean;
};

export type AdaptationEvent = {
  id: string;
  timestamp: string;
  action: string;
  trigger: string;
  outcome: string;
  confidence: number;
  phase: 'Phase 1' | 'Phase 2' | 'Phase 3';
};

export type RecentEvent = {
  id: string;
  timestamp: string;
  label: string;
  detail: string;
  kind: 'detection' | 'response' | 'adaptation' | 'report';
};

export type SystemStatus = {
  api: 'reachable' | 'unreachable' | 'checking';
  detection: 'nominal' | 'degraded';
  adaptation: 'nominal' | 'degraded';
  reportIntegrity: 'verified' | 'pending';
  lastUpdated: string;
};

export const incidents: Incident[] = [
  { id: 'INC-0427', timestamp: '2025-02-18T14:42:18Z', attackType: 'Credential stuffing', severity: 'High', status: 'Contained', source: 'gateway-03 / 185.14.22.91', detectionScore: 94, attackScore: 89, behaviour: 'Burst login attempts across 14 accounts; rotating user agents.', response: 'Rate limit applied, source quarantined for 30 min.', adaptation: 'Raised velocity threshold for auth edge.', phase: 'Phase 3', demo: true },
  { id: 'INC-0426', timestamp: '2025-02-18T13:08:04Z', attackType: 'SQL injection', severity: 'Critical', status: 'Resolved', source: 'api-prod / 91.202.11.44', detectionScore: 98, attackScore: 96, behaviour: 'Encoded UNION payload in report filter parameter.', response: 'Request blocked; WAF signature propagated.', adaptation: 'Added parameter normalization rule.', phase: 'Phase 2', demo: true },
  { id: 'INC-0425', timestamp: '2025-02-18T11:56:39Z', attackType: 'Path traversal', severity: 'Medium', status: 'Investigating', source: 'files-edge / 45.77.12.8', detectionScore: 79, attackScore: 74, behaviour: 'Repeated encoded parent traversal against export route.', response: 'Export route isolated; forensic capture enabled.', adaptation: 'Increased anomaly weight for encoded paths.', phase: 'Phase 2', demo: true },
  { id: 'INC-0424', timestamp: '2025-02-18T10:22:51Z', attackType: 'Data exfiltration', severity: 'High', status: 'Contained', source: 'worker-07 / internal', detectionScore: 91, attackScore: 83, behaviour: 'Unusual outbound volume to an untrusted ASN.', response: 'Egress policy tightened; session revoked.', adaptation: 'Marked ASN for elevated scrutiny.', phase: 'Phase 1', demo: true },
  { id: 'INC-0423', timestamp: '2025-02-18T09:47:12Z', attackType: 'Command injection', severity: 'Critical', status: 'Resolved', source: 'hooks-prod / 103.52.18.6', detectionScore: 97, attackScore: 93, behaviour: 'Shell metacharacters in webhook display name.', response: 'Payload dropped; integration key rotated.', adaptation: 'Expanded shell token classifier.', phase: 'Phase 3', demo: true },
  { id: 'INC-0422', timestamp: '2025-02-18T08:31:43Z', attackType: 'Reconnaissance', severity: 'Low', status: 'Resolved', source: 'edge-01 / 172.84.5.19', detectionScore: 63, attackScore: 51, behaviour: 'Sequential probe of version and health routes.', response: 'Challenge served; no protected route accessed.', adaptation: 'No rule change required.', phase: 'Phase 1', demo: true },
  { id: 'INC-0421', timestamp: '2025-02-17T22:16:09Z', attackType: 'Credential stuffing', severity: 'Medium', status: 'Contained', source: 'gateway-01 / 176.9.44.2', detectionScore: 86, attackScore: 78, behaviour: 'Low-and-slow login retries using residential proxies.', response: 'Step-up verification requested for affected accounts.', adaptation: 'Session diversity signal reweighted.', phase: 'Phase 3', demo: true },
];

export const adaptationEvents: AdaptationEvent[] = [
  { id: 'ADP-018', timestamp: '2025-02-18T14:45:02Z', action: 'Raised auth velocity threshold', trigger: 'INC-0427 / rotating user agents', outcome: 'Future bursts grouped 18% faster', confidence: 92, phase: 'Phase 3' },
  { id: 'ADP-017', timestamp: '2025-02-18T13:12:45Z', action: 'Propagated WAF signature', trigger: 'INC-0426 / encoded UNION payload', outcome: 'Signature active across 4 edge clusters', confidence: 98, phase: 'Phase 2' },
  { id: 'ADP-016', timestamp: '2025-02-18T12:04:29Z', action: 'Reweighted encoded path signal', trigger: 'INC-0425 / traversal attempts', outcome: 'Anomaly confidence improved by 11%', confidence: 81, phase: 'Phase 2' },
  { id: 'ADP-015', timestamp: '2025-02-18T10:28:11Z', action: 'Flagged untrusted ASN', trigger: 'INC-0424 / egress deviation', outcome: 'Egress review now runs pre-session', confidence: 87, phase: 'Phase 1' },
  { id: 'ADP-014', timestamp: '2025-02-18T09:51:37Z', action: 'Expanded shell token classifier', trigger: 'INC-0423 / webhook payload', outcome: 'Classifier covers 6 new token patterns', confidence: 95, phase: 'Phase 3' },
];

export const recentEvents: RecentEvent[] = [
  { id: 'EVT-881', timestamp: '2025-02-18T14:45:02Z', label: 'Detection model adapted', detail: 'Auth velocity threshold raised after INC-0427', kind: 'adaptation' },
  { id: 'EVT-880', timestamp: '2025-02-18T14:42:18Z', label: 'Incident contained', detail: 'Credential stuffing from 185.14.22.91', kind: 'response' },
  { id: 'EVT-879', timestamp: '2025-02-18T13:12:45Z', label: 'Signature propagated', detail: 'WAF rule active across 4 edge clusters', kind: 'adaptation' },
  { id: 'EVT-878', timestamp: '2025-02-18T13:08:04Z', label: 'Critical attack detected', detail: 'SQL injection against api-prod', kind: 'detection' },
  { id: 'EVT-877', timestamp: '2025-02-18T12:36:20Z', label: 'Integrity check complete', detail: 'Report snapshot hash verified', kind: 'report' },
  { id: 'EVT-876', timestamp: '2025-02-18T11:56:39Z', label: 'Investigation opened', detail: 'Path traversal against files-edge', kind: 'detection' },
];

export const initialSystemStatus: SystemStatus = {
  api: 'checking',
  detection: 'nominal',
  adaptation: 'nominal',
  reportIntegrity: 'verified',
  lastUpdated: '—',
};

export const attackTypes = Array.from(new Set(incidents.map((incident) => incident.attackType)));

export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(value));

export const formatShortTime = (value: string) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));

export const reportPayload = () => JSON.stringify({ mode: 'DEMO DATA', incidents, adaptationEvents }, null, 2);