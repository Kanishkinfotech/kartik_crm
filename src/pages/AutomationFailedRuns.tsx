import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import type { AutomationFailure, AutomationFailureCategory, AutomationFailureResolutionStatus } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, type BadgeTone, Select, TextArea, Modal, Field, ConfirmDialog } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { Eye, RefreshCw, Pause } from 'lucide-react';
import { can } from '@/lib/permissions';
import { formatDateTime } from '@/lib/format';

const CAT_TONE: Record<string, BadgeTone> = { execution_error: 'danger', integration_error: 'warning', permission_error: 'danger', validation_error: 'warning', rate_limit_error: 'warning', loop_prevented: 'danger', usage_limit: 'warning', timeout: 'neutral', external_error: 'warning' };
const RES_TONE: Record<string, BadgeTone> = { open: 'warning', retried: 'info', ignored: 'neutral', resolved_manually: 'success', disabled_automation: 'neutral' };

export function AutomationFailedRuns() {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const [failures, setFailures] = useState<(AutomationFailure & { automation_name?: string; client_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [detail, setDetail] = useState<(AutomationFailure & { automation_name?: string; client_name?: string }) | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  const canRetry = can(role, 'automation_run.retry');
  const canPause = can(role, 'automation.pause');
  const canView = can(role, 'automation_run.view');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    let q = supabase.from('automation_failures').select('*, automations(name), clients(business_name, contact_person)').eq('workspace_id', activeWorkspace.id).order('failure_time', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('resolution_status', statusFilter as AutomationFailureResolutionStatus);
    const { data, error: err } = await q;
    if (err) { setError(describeDbError(err)); setLoading(false); return; }
    setFailures((data ?? []).map((r: Record<string, unknown>) => ({
      ...(r as unknown as AutomationFailure),
      automation_name: (r.automations as { name?: string })?.name,
      client_name: (r.clients as { business_name?: string; contact_person?: string })?.business_name || (r.clients as { contact_person?: string })?.contact_person,
    })));
    setLoading(false);
  }, [activeWorkspace, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (resolution: AutomationFailureResolutionStatus, extra?: { disableAuto?: boolean }) => {
    if (!detail || !activeWorkspace) return;
    setBusy(true);
    await supabase.from('automation_failures').update({
      resolution_status: resolution, resolution_notes: notes, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString(),
    }).eq('id', detail.id);

    if (extra?.disableAuto && detail.automation_id) {
      await supabase.from('automations').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', detail.automation_id);
    }

    if (resolution === 'retried') {
      await supabase.from('automation_jobs').insert({
        workspace_id: activeWorkspace.id, job_type: 'retry_action', run_id: detail.run_id,
        payload_ref: { failure_id: detail.id }, scheduled_at: new Date().toISOString(), priority: 5,
        status: 'pending', attempts: 0, max_attempts: 3,
      });
    }

    await supabase.from('audit_logs').insert({ workspace_id: activeWorkspace.id, actor_id: user?.id ?? null, entity_type: 'automation_failure', entity_id: detail.id, action: resolution, change_summary: notes || `Failure ${resolution}` });
    setBusy(false); setDetail(null); setNotes(''); setShowDisableConfirm(false); load();
  };

  if (!canView) return <ErrorState message="You don't have permission to view failures." />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const openCount = failures.filter((f) => f.resolution_status === 'open').length;

  const columns: Column<(AutomationFailure & { automation_name?: string; client_name?: string })>[] = [
    { key: 'automation', header: 'Automation', sortValue: (r) => r.automation_name ?? '', render: (r) => <span className="font-medium text-slate-900">{r.automation_name ?? 'Unknown'}</span> },
    { key: 'action', header: 'Failed Action', sortValue: (r) => r.action_type ?? '', render: (r) => <span className="text-sm text-slate-600">{r.action_type ?? '—'}</span> },
    { key: 'client', header: 'Client', sortValue: (r) => r.client_name ?? '', render: (r) => <span className="text-sm text-slate-600">{r.client_name ?? '—'}</span> },
    { key: 'category', header: 'Error Category', sortValue: (r) => r.error_category, render: (r) => <StatusBadge status={r.error_category.replace(/_/g, ' ')} tone={CAT_TONE[r.error_category] ?? 'neutral'} /> },
    { key: 'message', header: 'Error', sortValue: (r) => r.error_message ?? '', render: (r) => <span className="text-sm text-slate-600 truncate max-w-xs">{r.error_message}</span> },
    { key: 'time', header: 'Failure Time', sortValue: (r) => r.failure_time, render: (r) => <span className="text-sm text-slate-500">{formatDateTime(r.failure_time)}</span> },
    { key: 'resolution', header: 'Resolution', sortValue: (r) => r.resolution_status, render: (r) => <StatusBadge status={r.resolution_status.replace(/_/g, ' ')} tone={RES_TONE[r.resolution_status] ?? 'neutral'} /> },
    { key: 'actions', header: '', render: (r) => <Button size="sm" variant="ghost" onClick={() => { setDetail(r); setNotes(r.resolution_notes ?? ''); }}><Eye className="h-4 w-4" /></Button> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Failed Runs" description="Failed automation actions requiring attention" />

      <Card className="p-4"><div className="text-2xl font-bold text-rose-600">{openCount}</div><div className="mt-1 text-xs text-slate-500">Open failures</div></Card>

      <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-48">
        <option value="all">All resolutions</option><option value="open">Open</option><option value="retried">Retried</option><option value="ignored">Ignored</option><option value="resolved_manually">Resolved Manually</option><option value="disabled_automation">Disabled Automation</option>
      </Select>

      {failures.length === 0 ? <EmptyState title="No failures" description="Failed automation actions will appear here." /> : (
        <DataTable columns={columns} rows={failures} rowKey={r => r.id} searchKeys={(r) => `${r.automation_name} ${r.action_type} ${r.error_message}`} />
      )}

      {detail && (
        <Modal open={true} onClose={() => setDetail(null)} title="Failure Detail" size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><div className="text-xs text-slate-400">Automation</div><div className="text-sm text-slate-700">{detail.automation_name}</div></div>
              <div><div className="text-xs text-slate-400">Action</div><div className="text-sm text-slate-700">{detail.action_type ?? '—'}</div></div>
              <div><div className="text-xs text-slate-400">Error category</div><StatusBadge status={detail.error_category.replace(/_/g, ' ')} tone={CAT_TONE[detail.error_category] ?? 'neutral'} /></div>
              <div><div className="text-xs text-slate-400">Resolution</div><StatusBadge status={detail.resolution_status.replace(/_/g, ' ')} tone={RES_TONE[detail.resolution_status] ?? 'neutral'} /></div>
            </div>
            <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{detail.error_message}</div>
            {detail.resolution_status === 'open' && (
              <>
                <Field label="Resolution notes"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes about this resolution…" /></Field>
                <div className="flex flex-wrap gap-2">
                  {canRetry && <Button variant="outline" onClick={() => resolve('retried')} disabled={busy}><RefreshCw className="h-4 w-4" /> Retry</Button>}
                  <Button variant="outline" onClick={() => resolve('ignored')} disabled={busy}>Ignore</Button>
                  <Button variant="outline" onClick={() => resolve('resolved_manually')} disabled={busy}>Resolve manually</Button>
                  {canPause && <Button variant="danger" onClick={() => setShowDisableConfirm(true)} disabled={busy}><Pause className="h-4 w-4" /> Disable automation</Button>}
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {showDisableConfirm && (
        <ConfirmDialog open={true} onClose={() => setShowDisableConfirm(false)} onConfirm={() => resolve('disabled_automation', { disableAuto: true })} title="Disable automation?" message="This will pause the automation and mark this failure as resolved." confirmLabel="Disable" danger />
      )}
    </div>
  );
}
