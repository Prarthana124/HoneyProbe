import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FlaskConical, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { honeyProbeRequest } from '@/lib/honeyprobe-api';
import { ConsoleShell, PageHeader, Panel, StatusPill } from '@/components/console-shell';

type RuleCondition = {
  field: string;
  operator: 'equals' | 'contains' | 'starts_with' | 'one_of';
  value: string | string[];
};
type RuleDefinition = {
  name: string;
  category: string;
  description: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  conditions: RuleCondition[];
  recommended_steps: string[];
};
type DetectionRule = RuleDefinition & {
  id: string;
  enabled: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};
type RuleTest = {
  rule_id: string;
  rule_version: number;
  matched: boolean;
  tested_at: string;
  matched_conditions: string[];
};
type RuleVersion = {
  version: number;
  action: 'created' | 'updated' | 'rollback';
  actor_id: string;
  created_at: string;
  definition: RuleDefinition;
};

const fieldChoices = [
  'event_type',
  'source_type',
  'severity',
  'target',
  'summary',
  'ingestion_source',
  'metadata.route',
  'metadata.interaction',
  'metadata.operation_category',
];
const operators: RuleCondition['operator'][] = ['equals', 'contains', 'starts_with', 'one_of'];
const blankDefinition = (): RuleDefinition => ({
  name: '',
  category: 'Operator-defined',
  description: '',
  severity: 'medium',
  conditions: [{ field: 'event_type', operator: 'contains', value: '' }],
  recommended_steps: [],
});
const controlClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary';
const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50';

function definitionForRule(rule: DetectionRule): RuleDefinition {
  return {
    name: rule.name,
    category: rule.category,
    description: rule.description,
    severity: rule.severity,
    conditions: rule.conditions,
    recommended_steps: rule.recommended_steps,
  };
}

function testEvent(conditions: RuleCondition[]) {
  const event: {
    source_type: 'web' | 'ssh' | 'database' | 'mobile';
    event_type: string;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    target: string;
    summary: string;
    metadata: Record<string, unknown>;
    environment: 'test';
    ingestion_source: string;
  } = {
    source_type: 'web',
    event_type: 'controlled_rule_test',
    severity: 'info',
    target: '/safe-rule-test',
    summary: 'Controlled rule test event',
    metadata: {},
    environment: 'test',
    ingestion_source: 'rule_test',
  };
  for (const condition of conditions) {
    const value = Array.isArray(condition.value) ? condition.value[0] : condition.value;
    const parts = condition.field.split('.');
    let destination: Record<string, unknown> = event;
    for (const part of parts.slice(0, -1)) {
      const child = destination[part];
      if (typeof child !== 'object' || child === null || Array.isArray(child)) {
        destination[part] = {};
      }
      destination = destination[part] as Record<string, unknown>;
    }
    destination[parts.at(-1) ?? condition.field] = value;
  }
  return event;
}

export function LiveRulesPage() {
  const queryClient = useQueryClient();
  const [definition, setDefinition] = useState<RuleDefinition>(blankDefinition);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const rules = useQuery({
    queryKey: ['operator-rules'],
    queryFn: () => honeyProbeRequest<DetectionRule[]>('/api/rules'),
  });
  const versions = useQuery({
    queryKey: ['operator-rule-versions', historyId],
    queryFn: () => honeyProbeRequest<RuleVersion[]>(`/api/rules/${historyId}/versions`),
    enabled: Boolean(historyId),
  });
  const saveRule = useMutation({
    mutationFn: (body: RuleDefinition) =>
      honeyProbeRequest<DetectionRule>(editingId ? `/api/rules/${editingId}` : '/api/rules', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      setMessage(editingId ? 'Rule updated and disabled until its new version is tested.' : 'Rule saved disabled. Test it before enabling.');
      setEditingId(null);
      setDefinition(blankDefinition());
      await queryClient.invalidateQueries({ queryKey: ['operator-rules'] });
    },
  });
  const testRule = useMutation({
    mutationFn: ({ id, conditions }: { id: string; conditions: RuleCondition[] }) =>
      honeyProbeRequest<RuleTest>(`/api/rules/${id}/test`, {
        method: 'POST',
        body: JSON.stringify(testEvent(conditions)),
      }),
    onSuccess: (result) => {
      setMessage(result.matched ? 'Safe test matched every rule condition.' : 'Safe test did not match every condition.');
      void queryClient.invalidateQueries({ queryKey: ['operator-rules'] });
    },
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      honeyProbeRequest<DetectionRule>(`/api/rules/${id}/enabled`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: async (_result, variables) => {
      setMessage(variables.enabled ? 'Rule enabled.' : 'Rule disabled.');
      await queryClient.invalidateQueries({ queryKey: ['operator-rules'] });
    },
  });
  const removeRule = useMutation({
    mutationFn: (id: string) => honeyProbeRequest<void>(`/api/rules/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setMessage('Rule archived. Existing findings remain linked to their original rule ID.');
      await queryClient.invalidateQueries({ queryKey: ['operator-rules'] });
    },
  });
  const rollback = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      honeyProbeRequest<DetectionRule>(`/api/rules/${id}/rollback/${version}`, { method: 'POST' }),
    onSuccess: async () => {
      setMessage('Previous rule definition restored as a new disabled version. Test before enabling.');
      setHistoryId(null);
      await queryClient.invalidateQueries({ queryKey: ['operator-rules'] });
    },
  });
  const importRules = useMutation({
    mutationFn: (body: { rules: RuleDefinition[] }) =>
      honeyProbeRequest<DetectionRule[]>('/api/rules/import', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: async (created) => {
      setMessage(`Imported ${created.length} rule(s), saved disabled pending safe tests.`);
      await queryClient.invalidateQueries({ queryKey: ['operator-rules'] });
    },
  });
  const sortedRules = useMemo(() => rules.data ?? [], [rules.data]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const normalized: RuleDefinition = {
      ...definition,
      conditions: definition.conditions.map((condition) => ({
        ...condition,
        value:
          condition.operator === 'one_of'
            ? (Array.isArray(condition.value) ? condition.value : condition.value.split(','))
                .map((value) => value.trim())
                .filter(Boolean)
            : Array.isArray(condition.value)
              ? condition.value[0] ?? ''
              : condition.value.trim(),
      })),
      recommended_steps: definition.recommended_steps.map((step) => step.trim()).filter(Boolean),
    };
    saveRule.mutate(normalized);
  }

  async function importFile(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { rules?: RuleDefinition[] } | RuleDefinition[];
      const incoming = Array.isArray(parsed) ? parsed : parsed.rules;
      if (!incoming || !Array.isArray(incoming)) throw new Error('Expected a JSON array or an object with a rules array.');
      importRules.mutate({ rules: incoming });
    } catch (error) {
      setMessage(error instanceof Error ? `Import rejected: ${error.message}` : 'Import rejected: invalid JSON.');
    }
  }

  return (
    <ConsoleShell>
      <PageHeader
        eyebrow="Detection coverage"
        title="Attack rules"
        description="Create bounded declarative rules. Rule expressions never execute code; every new or changed version must pass a safe matching test before activation."
        action={
          <div className="flex flex-wrap gap-2">
            <a className={buttonClass} href="/api/rules/export"><Download size={14} /> Export JSON</a>
            <label className={`${buttonClass} cursor-pointer`}>
              Import JSON
              <input
                aria-label="Import detection rules JSON"
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={(event) => void importFile(event.currentTarget.files?.[0])}
              />
            </label>
          </div>
        }
      />
      {message && <Panel className="mb-5 border-primary/30 p-3 text-sm text-primary" role="status">{message}</Panel>}
      {(rules.error || saveRule.error || testRule.error || changeStatus.error || removeRule.error || rollback.error || importRules.error) && (
        <Panel className="mb-5 border-destructive/30 p-4 text-sm text-destructive" role="alert">
          {(rules.error || saveRule.error || testRule.error || changeStatus.error || removeRule.error || rollback.error || importRules.error)?.message}
        </Panel>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div><h2 className="text-sm font-semibold">Configured rules</h2><p className="mt-1 text-xs text-muted-foreground">Persisted rule definitions and their current versions.</p></div>
            <span className="mono text-xs text-muted-foreground">{rules.data?.length ?? (rules.isLoading ? '…' : '—')}</span>
          </div>
          {rules.isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading rules…</p> : sortedRules.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No operator-defined rules yet. Phase 2 built-in detections remain active.</div>
          ) : (
            <div className="divide-y divide-border">
              {sortedRules.map((rule) => (
                <article className="p-5" key={rule.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{rule.name}</h3>
                        <StatusPill value={rule.enabled ? 'Enabled' : 'Disabled'} tone={rule.enabled ? 'good' : 'neutral'} />
                        <span className="mono text-[10px] text-muted-foreground">v{rule.version} · {rule.severity}</span>
                      </div>
                      <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">{rule.description}</p>
                      <p className="mono mt-2 text-[10px] text-muted-foreground">
                        {rule.conditions.map((condition) => `${condition.field} ${condition.operator} ${Array.isArray(condition.value) ? condition.value.join(', ') : condition.value}`).join(' AND ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className={buttonClass} type="button" onClick={() => { setEditingId(rule.id); setDefinition(definitionForRule(rule)); }}><Pencil size={13} /> Edit</button>
                      <button className={buttonClass} type="button" disabled={testRule.isPending} onClick={() => testRule.mutate({ id: rule.id, conditions: rule.conditions })}><FlaskConical size={13} /> Test</button>
                      <button className={buttonClass} type="button" disabled={changeStatus.isPending} onClick={() => changeStatus.mutate({ id: rule.id, enabled: !rule.enabled })}>{rule.enabled ? 'Disable' : 'Enable'}</button>
                      <button className={buttonClass} type="button" onClick={() => setHistoryId(historyId === rule.id ? null : rule.id)}>Versions</button>
                      <button className={`${buttonClass} text-destructive`} type="button" onClick={() => { if (window.confirm(`Archive rule “${rule.name}”? Existing findings will be retained.`)) removeRule.mutate(rule.id); }}><Trash2 size={13} /> Archive</button>
                    </div>
                  </div>
                  {historyId === rule.id && (
                    <div className="mt-4 rounded-lg border border-border bg-background/60 p-4">
                      <h4 className="text-xs font-semibold">Version history</h4>
                      {versions.isLoading ? <p className="mt-2 text-xs text-muted-foreground">Loading versions…</p> : (
                        <div className="mt-2 space-y-2">
                          {(versions.data ?? []).map((entry) => (
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs" key={`${entry.version}-${entry.action}`}>
                              <span>v{entry.version} · {entry.action} · {new Date(entry.created_at).toLocaleString()}</span>
                              {entry.version !== rule.version && <button className={buttonClass} type="button" disabled={rollback.isPending} onClick={() => rollback.mutate({ id: rule.id, version: entry.version })}><RotateCcw size={13} /> Restore as new version</button>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold">{editingId ? 'Edit rule' : 'Add a rule'}</h2><p className="mt-1 text-xs text-muted-foreground">Changes create a new version and disable it until re-tested.</p></div>
            {editingId && <button className={buttonClass} type="button" onClick={() => { setEditingId(null); setDefinition(blankDefinition()); }}><Plus size={13} /> New</button>}
          </div>
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <label className="block text-xs text-muted-foreground">Rule name<input className={`${controlClass} mt-1`} value={definition.name} maxLength={120} required onChange={(event) => setDefinition({ ...definition, name: event.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-muted-foreground">Category<input className={`${controlClass} mt-1`} value={definition.category} maxLength={80} required onChange={(event) => setDefinition({ ...definition, category: event.target.value })} /></label>
              <label className="block text-xs text-muted-foreground">Severity<select className={`${controlClass} mt-1`} value={definition.severity} onChange={(event) => setDefinition({ ...definition, severity: event.target.value as RuleDefinition['severity'] })}>{['info', 'low', 'medium', 'high', 'critical'].map((value) => <option key={value}>{value}</option>)}</select></label>
            </div>
            <label className="block text-xs text-muted-foreground">Description<textarea className={`${controlClass} mt-1 min-h-20`} value={definition.description} maxLength={500} required onChange={(event) => setDefinition({ ...definition, description: event.target.value })} /></label>
            <div>
              <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold">Conditions (all must match)</h3><button className={buttonClass} type="button" disabled={definition.conditions.length >= 10} onClick={() => setDefinition({ ...definition, conditions: [...definition.conditions, { field: 'event_type', operator: 'contains', value: '' }] })}>Add condition</button></div>
              <div className="space-y-2">
                {definition.conditions.map((condition, index) => (
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.3fr_auto]" key={index}>
                    <select className={controlClass} aria-label={`Condition ${index + 1} field`} value={condition.field} onChange={(event) => setDefinition({ ...definition, conditions: definition.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, field: event.target.value } : item) })}>{fieldChoices.map((field) => <option key={field}>{field}</option>)}</select>
                    <select className={controlClass} aria-label={`Condition ${index + 1} operator`} value={condition.operator} onChange={(event) => setDefinition({ ...definition, conditions: definition.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, operator: event.target.value as RuleCondition['operator'] } : item) })}>{operators.map((operator) => <option key={operator}>{operator}</option>)}</select>
                    <input className={controlClass} aria-label={`Condition ${index + 1} value`} value={Array.isArray(condition.value) ? condition.value.join(', ') : condition.value} maxLength={500} required placeholder={condition.operator === 'one_of' ? 'value 1, value 2' : 'match text'} onChange={(event) => setDefinition({ ...definition, conditions: definition.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) })} />
                    <button className={`${buttonClass} px-2`} aria-label={`Remove condition ${index + 1}`} type="button" disabled={definition.conditions.length <= 1} onClick={() => setDefinition({ ...definition, conditions: definition.conditions.filter((_, itemIndex) => itemIndex !== index) })}>×</button>
                  </div>
                ))}
              </div>
            </div>
            <label className="block text-xs text-muted-foreground">Investigation steps (one per line)<textarea className={`${controlClass} mt-1 min-h-20`} value={definition.recommended_steps.join('\n')} maxLength={2400} onChange={(event) => setDefinition({ ...definition, recommended_steps: event.target.value.split('\n').slice(0, 10) })} /></label>
            <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" type="submit" disabled={saveRule.isPending}>{saveRule.isPending ? 'Saving…' : editingId ? 'Save new version' : 'Create disabled rule'}</button>
          </form>
        </Panel>
      </div>
      {testRule.data && <Panel className="mt-5 p-4 text-sm" role="status"><strong>Latest safe test: {testRule.data.matched ? 'matched' : 'did not match'}</strong><p className="mt-1 text-xs text-muted-foreground">Rule v{testRule.data.rule_version} · {new Date(testRule.data.tested_at).toLocaleString()} · {testRule.data.matched_conditions.join('; ') || 'No conditions matched.'}</p></Panel>}
    </ConsoleShell>
  );
}

export function DemoRulesNotice() {
  return <ConsoleShell><PageHeader eyebrow="Demo preview" title="Rule management unavailable" description="This static preview does not connect to or change live detection rules. Sign in to manage persisted rules." /></ConsoleShell>;
}
