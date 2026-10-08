import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import type { AutomationRun, AutomationActionRun, AutomationRunStatus } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, type BadgeTone, Select, Modal } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { Eye, RefreshCw, XCircle } from 'lucide-react';
import { can } from '@/lib/permissions';
import { formatDateTime } from '@/lib/format';

const TONE: Record<string, BadgeTone> = { completed: 'success', partially_completed: 'warning', failed: 'danger', running: 'info', queued: 'info', waiting: 'neutral', approval_pending: 'warning', cancelled: 'neutral', skipped: 'neutral', duplicate_prevented: 'neutral' };
const ACTION_TONE: Record<string, BadgeTone> = { completed: 'success', failed: 'danger', running: 'info', pending: 'neutral', skipped: 'neutral', waiting: 'neutral', approval_pending: 'warning', cancelled: 'neutral' };

export function AutomationRunHistory() {
  const { activeWorkspace, role } = useWorkspace();
  const { navigate } = useRouter();
  const [runs, setRuns] = useState<(AutomationRun & { automation_name?: string; client_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [autoFilter, setAutoFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [detailRun, setDetailRun] = useState<(AutomationRun & { automation_name?: string; client_name?: string }) | null>(null);
  const [actionRuns, setActionRuns] = useState<AutomationActionRun[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const canRetry = can(role, 'automation_run.retry');
  const canCancel = can(role, 'automation_run.cancel');
  const canView = can(role, 'automation_run.view');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true); setError(null);
    let q = supabase.from('automation_runs').select('*, automations(name), clients(business_name, contact_person)').eq('workspace_id', activeWorkspace.id).order('started_at', { ascending: false }).range(offset, offset + 49);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter as AutomationRunStatus);
    if (autoFilter !== 'all') q = q.eq('automation_id', autoFilter);
    const { data, error: err } = await q;
    if (err) { setError(describeDbError(err)); setLoading(false); return; }
    const enriched = (data ?? []).map((r: Record<string, unknown>) => ({
      ...(r as unknown as AutomationRun),
      automation_name: (r.automations as { name?: string })?.name,
      client_name: (r.clients as { business_name?: string; contact_person?: string })?.business_name || (r.clients as { contact_person?: string })?.contact_person,
    }));
    setRuns(enriched); setHasMore(enriched.length === 50); setLoading(false);
  }, [activeWorkspace, statusFilter, autoFilter, offset]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (run: (AutomationRun & { automation_name?: string; client_name?: string })) => {
    setDetailRun(run); setDetailLoading(true);
    const { data } = await supabase.from('automation_action_runs').select('*').eq('run_id', run.id).order('action_sequence', { ascending: true });
    setActionRuns((data ?? []) as AutomationActionRun[]); setDetailLoading(false);
  };

  const retryAction = async (ar: AutomationActionRun) => {
    await supabase.from('automation_action_runs').update({ status: 'pending', retry_count: ar.retry_count + 1 }).eq('id', ar.id);
    await supabase.from('automation_runs').update({ status: 'running' }).eq('id', ar.run_id).eq('status', 'failed');
    if (detailRun) openDetail(detailRun);
  };

  const cancelRun = async (run: AutomationRun) => {
    await supabase.from('automation_runs').update({ status: 'cancelled', completed_at: new Date().toISOString() }).eq('id', run.id);
    setDetailRun(null); load();
  };

  if (!canView) return <ErrorState message="You don't have permission to view run history." />;

  const columns: Column<(AutomationRun & { automation_name?: string; client_name?: string })>[] = [
    { key: 'automation', header: 'Automation', sortValue: (r) => r.automation_name ?? '', render: (r) => <span className="font-medium text-slate-900">{r.automation_name ?? 'Unknown'}</span> },
    { key: 'trigger', header: 'Trigger', sortValue: (r) => r.trigger_event_type ?? '', render: (r) => <span className="text-sm text-slate-600">{r.trigger_event_type}</span> },
    { key: 'client', header: 'Client', sortValue: (r) => r.client_name ?? '', render: (r) => <span className="text-sm text-slate-600">{r.client_name ?? '—'}</span> },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <StatusBadge status={r.status} tone={TONE[r.status] ?? 'neutral'} /> },
    { key: 'started', header: 'Started', sortValue: (r) => r.started_at, render: (r) => <span className="text-sm text-slate-500">{formatDateTime(r.started_at)}</span> },
    { key: 'steps', header: 'Steps', sortValue: (r) => r.completed_steps, render: (r) => <span className="text-sm text-slate-600">{r.completed_steps}/{r.total_steps}</span> },
    { key: 'retry', header: 'Retries', sortValue: (r) => r.retry_count, render: (r) => <span className="text-sm text-slate-600">{r.retry_count}</span> },
    { key: 'actions', header: '', render: (r) => <Button size="sm" variant="ghost" onClick={() => openDetail(r)}><Eye className="h-4 w-4" /></Button> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Run History" description="All automation execution records" />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }} className="w-48">
          <option value="all">All statuses</option>
          <option value="queued">Queued</option><option value="running">Running</option><option value="waiting">Waiting</option><option value="approval_pending">Approval Pending</option><option value="completed">Completed</option><option value="partially_completed">Partially Completed</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="skipped">Skipped</option><option value="duplicate_prevented">Duplicate Prevented</option>
        </Select>
        <Select value={autoFilter} onChange={(e) => { setAutoFilter(e.target.value); setOffset(0); }} className="w-48">
          <option value="all">All automations</option>
        </Select>
        {offset > 0 && <Button variant="outline" size="sm" onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</Button>}
        {hasMore && <Button variant="outline" size="sm" onClick={() => setOffset(offset + 50)}>Load more</Button>}
      </div>

      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : runs.length === 0 ? (
        <EmptyState title="No runs found" description="Automation runs will appear here when automations execute." />
      ) : (
        <DataTable columns={columns} rows={runs} rowKey={r => r.id} searchKeys={(r) => `${r.automation_name} ${r.trigger_event_type} ${r.client_name}`} />
      )}

      {detailRun && (
        <Modal open={true} onClose={() => setDetailRun(null)} title={`Run: ${detailRun.automation_name ?? 'Unknown'}`} size="xl">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div><div className="text-xs text-slate-400">Status</div><StatusBadge status={detailRun.status} tone={TONE[detailRun.status] ?? 'neutral'} /></div>
              <div><div className="text-xs text-slate-400">Started</div><div className="text-sm text-slate-700">{formatDateTime(detailRun.started_at)}</div></div>
              <div><div className="text-xs text-slate-400">Completed</div><div className="text-sm text-slate-700">{detailRun.completed_at ? formatDateTime(detailRun.completed_at) : '—'}</div></div>
              <div><div className="text-xs text-slate-400">Steps</div><div className="text-sm text-slate-700">{detailRun.completed_steps}/{detailRun.total_steps} ({detailRun.failed_steps} failed)</div></div>
            </div>
            {detailRun.error_message && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{detailRun.error_message}</div>}
            {detailRun.input_snapshot && <div><div className="text-xs font-semibold uppercase text-slate-400">Input</div><pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(detailRun.input_snapshot, null, 2)}</pre></div>}
            {detailRun.output_summary && Object.keys(detailRun.output_summary).length > 0 && <div><div className="text-xs font-semibold uppercase text-slate-400">Output</div><pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(detailRun.output_summary, null, 2)}</pre></div>}

            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Action Runs</div>
              {detailLoading ? <LoadingState /> : actionRuns.length === 0 ? <p className="text-sm text-slate-400">No action runs recorded.</p> : (
                <div className="space-y-2">
                  {actionRuns.map((ar) => (
                    <div key={ar.id} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">#{ar.action_sequence}</span>
                          <span className="text-sm font-medium text-slate-700">{ar.action_type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
                          <StatusBadge status={ar.status} tone={ACTION_TONE[ar.status] ?? 'neutral'} />
                        </div>
                        {canRetry && ar.status === 'failed' && <Button size="sm" variant="ghost" onClick={() => retryAction(ar)}><RefreshCw className="h-4 w-4" /> Retry</Button>}
                      </div>
                      {ar.error_message && <div className="mt-1 text-xs text-rose-600">{ar.error_message}</div>}
                      {ar.output_summary && Object.keys(ar.output_summary).length > 0 && <pre className="mt-1 max-h-32 overflow-auto text-xs text-slate-500">{JSON.stringify(ar.output_summary, null, 2)}</pre>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canCancel && ['waiting', 'approval_pending', 'queued'].includes(detailRun.status) && (
              <Button variant="danger" size="sm" onClick={() => cancelRun(detailRun)}><XCircle className="h-4 w-4" /> Cancel run</Button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
