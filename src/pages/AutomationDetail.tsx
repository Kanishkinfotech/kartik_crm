import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import type { Automation, AutomationRun } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, type BadgeTone } from '@/components/ui';
import { Edit, Play, Pause, Archive, History, Zap, ArrowLeft } from 'lucide-react';
import { formatTriggerType, CATEGORY_LABELS } from '@/lib/automation';
import { can } from '@/lib/permissions';
import { formatDateTime } from '@/lib/format';

const STATUS_TONE: Record<string, BadgeTone> = { draft: 'neutral', active: 'success', paused: 'warning', error: 'danger', archived: 'neutral' };
const RUN_TONE: Record<string, BadgeTone> = { completed: 'success', partially_completed: 'warning', failed: 'danger', running: 'info', queued: 'info', waiting: 'neutral', approval_pending: 'warning', cancelled: 'neutral', skipped: 'neutral', duplicate_prevented: 'neutral' };

export function AutomationDetail({ automationId }: { automationId: string }) {
  const { activeWorkspace, role } = useWorkspace();
  const { navigate } = useRouter();
  const [auto, setAuto] = useState<Automation | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspace || !automationId) return;
    setLoading(true);
    const [{ data: a, error: ae }, { data: r }] = await Promise.all([
      supabase.from('automations').select('*').eq('id', automationId).eq('workspace_id', activeWorkspace.id).maybeSingle(),
      supabase.from('automation_runs').select('*').eq('automation_id', automationId).order('started_at', { ascending: false }).limit(10),
    ]);
    if (ae) { setError(describeDbError(ae)); setLoading(false); return; }
    if (!a) { setError('Automation not found'); setLoading(false); return; }
    setAuto(a as Automation); setRuns((r ?? []) as AutomationRun[]); setLoading(false);
  }, [activeWorkspace, automationId]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (status: Automation['status']) => {
    if (!auto || !activeWorkspace) return;
    setBusy(true);
    await supabase.from('automations').update({ status, updated_at: new Date().toISOString() }).eq('id', auto.id);
    await supabase.from('audit_logs').insert({ workspace_id: activeWorkspace.id, actor_id: null, entity_type: 'automation', entity_id: auto.id, action: status === 'active' ? 'activated' : status === 'paused' ? 'paused' : 'archived', change_summary: `Automation "${auto.name}" ${status}` });
    setBusy(false); load();
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!auto) return <EmptyState title="Automation not found" />;

  return (
    <div className="space-y-6">
      <PageHeader title={auto.name} description={auto.description || CATEGORY_LABELS[auto.category] || auto.category} actions={
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/automations')}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          {can(role, 'automation.update') && <Button variant="outline" size="sm" onClick={() => navigate(`/automations/${auto.id}/edit`)}><Edit className="h-4 w-4 mr-1" /> Edit</Button>}
          {can(role, 'automation.pause') && auto.status === 'active' && <Button variant="outline" size="sm" onClick={() => updateStatus('paused')} disabled={busy}><Pause className="h-4 w-4 mr-1" /> Pause</Button>}
          {can(role, 'automation.activate') && auto.status === 'paused' && <Button variant="success" size="sm" onClick={() => updateStatus('active')} disabled={busy}><Play className="h-4 w-4 mr-1" /> Activate</Button>}
          {can(role, 'automation.archive') && auto.status !== 'archived' && <Button variant="ghost" size="sm" onClick={() => updateStatus('archived')} disabled={busy}><Archive className="h-4 w-4 mr-1" /> Archive</Button>}
        </div>
      } />

      {/* HUMAN READABLE RULE SUMMARY */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Zap className="h-4 w-4 text-blue-600" /> Automation Rule Logic (WHEN → IF → THEN)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 space-y-1">
            <span className="font-bold text-blue-700 uppercase tracking-wide text-[10px]">WHEN (Trigger)</span>
            <p className="font-semibold text-slate-800">{formatTriggerType(auto.trigger_type)}</p>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 space-y-1">
            <span className="font-bold text-amber-700 uppercase tracking-wide text-[10px]">IF (Conditions)</span>
            {auto.conditions && auto.conditions.length > 0 ? (
              <div className="space-y-1 text-slate-700">
                {(auto.conditions as Array<{ field?: string; operator?: string; value?: unknown; logic?: string }>).map((c, i) => (
                  <div key={i} className="font-mono text-[11px]">
                    {i > 0 && <span className="font-bold text-amber-600 mr-1">{c.logic || 'AND'}</span>}
                    <span className="font-semibold">{c.field}</span> {c.operator?.replace(/_/g, ' ')} <span className="font-semibold">{String(c.value ?? '')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 italic">Always run (No conditions)</p>
            )}
          </div>

          <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 space-y-1 md:col-span-2">
            <span className="font-bold text-emerald-700 uppercase tracking-wide text-[10px]">THEN & WAIT (Actions Sequence)</span>
            {auto.actions && auto.actions.length > 0 ? (
              <div className="space-y-1.5">
                {(auto.actions as Array<{ type: string; config?: Record<string, unknown>; branch?: string }>).map((act, i) => (
                  <div key={i} className="flex items-center gap-2 text-slate-800">
                    <span className="font-bold text-emerald-600 text-[11px]">{i + 1}.</span>
                    {act.branch === 'else' && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">ELSE</span>}
                    <span className="font-medium">{formatTriggerType(act.type)}</span>
                    {act.type === 'wait' && Boolean(act.config?.duration) && <span className="text-slate-500">({String(act.config?.duration)})</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 italic">No actions configured</p>
            )}
          </div>
        </div>

        {/* Safety Rules Banner */}
        {auto.execution_config && (
          <div className="mt-2 flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider self-center mr-1">Safety Rules:</span>
            {Boolean((auto.execution_config as Record<string, unknown>).run_once_per_record) && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">Run once per record</span>}
            {Boolean((auto.execution_config as Record<string, unknown>).prevent_duplicate_execution) && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">Prevent duplicate execution</span>}
            {Boolean((auto.execution_config as Record<string, unknown>).stop_on_lead_won) && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">Stop if Lead = Won</span>}
            {Boolean((auto.execution_config as Record<string, unknown>).stop_on_lead_lost) && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">Stop if Lead = Lost</span>}
            {Boolean((auto.execution_config as Record<string, unknown>).stop_on_customer_reply) && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">Stop on customer reply</span>}
            {Boolean((auto.execution_config as Record<string, unknown>).stop_on_do_not_contact) && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">Stop if Do Not Contact</span>}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Overview</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><StatusBadge status={auto.status} tone={STATUS_TONE[auto.status]} /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Category</dt><dd className="text-slate-700">{CATEGORY_LABELS[auto.category] || auto.category}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Trigger</dt><dd className="text-slate-700">{formatTriggerType(auto.trigger_type)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Actions</dt><dd className="text-slate-700">{auto.actions.length}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Conditions</dt><dd className="text-slate-700">{auto.conditions.length}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Approval</dt><dd className="text-slate-700">{auto.approval_mode.replace(/_/g, ' ')}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Cooldown</dt><dd className="text-slate-700">{auto.cooldown_minutes} min</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Version</dt><dd className="text-slate-700">{auto.current_version}</dd></div>
          </dl>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Run Stats</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Last run</dt><dd className="text-slate-700">{auto.last_run_at ? formatDateTime(auto.last_run_at) : 'Never'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Last success</dt><dd className="text-slate-700">{auto.last_success_at ? formatDateTime(auto.last_success_at) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Last failure</dt><dd className="text-slate-700">{auto.last_failure_at ? formatDateTime(auto.last_failure_at) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Next scheduled</dt><dd className="text-slate-700">{auto.next_scheduled_at ? formatDateTime(auto.next_scheduled_at) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Daily limit</dt><dd className="text-slate-700">{auto.run_limit_daily}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Monthly limit</dt><dd className="text-slate-700">{auto.run_limit_monthly}</dd></div>
          </dl>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Execution Safety</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Failure Policy</dt><dd className="text-slate-700 font-medium">{auto.failure_policy}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Max Retries</dt><dd className="text-slate-700 font-medium">{Number((auto.retry_policy as Record<string, unknown>)?.max_retries ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Run Once / Record</dt><dd className="text-slate-700">{(auto.execution_config as Record<string, unknown>)?.run_once_per_record !== false ? 'Yes' : 'No'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Stop on Reply</dt><dd className="text-slate-700">{(auto.execution_config as Record<string, unknown>)?.stop_on_customer_reply !== false ? 'Yes' : 'No'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Stop on Won/Lost</dt><dd className="text-slate-700">{(auto.execution_config as Record<string, unknown>)?.stop_on_lead_won !== false ? 'Yes' : 'No'}</dd></div>
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Recent Runs</h3>
          <Button variant="ghost" size="sm" onClick={() => navigate('/automations/runs')}>View all <History className="ml-1 inline h-4 w-4" /></Button>
        </div>
        {runs.length === 0 ? <p className="text-sm text-slate-400">No runs yet.</p> : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <StatusBadge status={run.status} tone={RUN_TONE[run.status] ?? 'neutral'} />
                  <span className="text-slate-600">{run.trigger_event_type}</span>
                  <span className="text-xs text-slate-400">{run.completed_steps}/{run.total_steps} steps</span>
                </div>
                <span className="text-xs text-slate-400">{formatDateTime(run.started_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
