import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import type { AutomationApproval, AutomationApprovalStatus } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, type BadgeTone, Select, TextArea, Modal, Field } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { Eye, Check, X } from 'lucide-react';
import { can } from '@/lib/permissions';
import { formatDateTime } from '@/lib/format';

const TONE: Record<AutomationApprovalStatus, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'danger', expired: 'neutral', cancelled: 'neutral' };

export function AutomationApprovals() {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<(AutomationApproval & { automation_name?: string; client_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [detail, setDetail] = useState<(AutomationApproval & { automation_name?: string; client_name?: string }) | null>(null);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<{ user_id: string; role: string }[]>([]);

  const canApprove = can(role, 'automation_approval.approve');
  const canReject = can(role, 'automation_approval.reject');
  const canReassign = can(role, 'automation_approval.reassign');
  const canView = can(role, 'automation_approval.view');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    let q = supabase.from('automation_approvals').select('*, automations(name), clients(business_name, contact_person)').eq('workspace_id', activeWorkspace.id).order('requested_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter as AutomationApprovalStatus);
    const { data, error: err } = await q;
    if (err) { setError(describeDbError(err)); setLoading(false); return; }
    setApprovals((data ?? []).map((r: Record<string, unknown>) => ({
      ...(r as unknown as AutomationApproval),
      automation_name: (r.automations as { name?: string })?.name,
      client_name: (r.clients as { business_name?: string; contact_person?: string })?.business_name || (r.clients as { contact_person?: string })?.contact_person,
    })));
    const { data: m } = await supabase.from('workspace_members').select('user_id, role').eq('workspace_id', activeWorkspace.id);
    setMembers((m ?? []) as { user_id: string; role: string }[]);
    setLoading(false);
  }, [activeWorkspace, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const decide = async (status: 'approved' | 'rejected') => {
    if (!detail || !activeWorkspace) return;
    setBusy(true);
    await supabase.from('automation_approvals').update({
      status, approver_comments: comments, approved_at: status === 'approved' ? new Date().toISOString() : null,
      rejected_at: status === 'rejected' ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    }).eq('id', detail.id);
    await supabase.from('automation_runs').update({ status: 'running' }).eq('id', detail.run_id).eq('status', 'approval_pending');
    await supabase.from('audit_logs').insert({ workspace_id: activeWorkspace.id, actor_id: user?.id ?? null, entity_type: 'automation_approval', entity_id: detail.id, action: status, change_summary: `Approval ${status} for ${detail.action_type}` });
    setBusy(false); setDetail(null); setComments(''); load();
  };

  const reassign = async (newApproverId: string) => {
    if (!detail || !activeWorkspace) return;
    await supabase.from('automation_approvals').update({ assigned_approver_id: newApproverId, updated_at: new Date().toISOString() }).eq('id', detail.id);
    await supabase.from('audit_logs').insert({ workspace_id: activeWorkspace.id, actor_id: user?.id ?? null, entity_type: 'automation_approval', entity_id: detail.id, action: 'reassigned', change_summary: `Approval reassigned` });
    setDetail(null); load();
  };

  if (!canView) return <ErrorState message="You don't have permission to view approvals." />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const pendingCount = approvals.filter((a) => a.status === 'pending').length;
  const approvedCount = approvals.filter((a) => a.status === 'approved').length;
  const rejectedCount = approvals.filter((a) => a.status === 'rejected').length;

  const columns: Column<(AutomationApproval & { automation_name?: string; client_name?: string })>[] = [
    { key: 'automation', header: 'Automation', sortValue: (r) => r.automation_name ?? '', render: (r) => <span className="font-medium text-slate-900">{r.automation_name ?? 'Unknown'}</span> },
    { key: 'action', header: 'Action', sortValue: (r) => r.action_type, render: (r) => <span className="text-sm text-slate-600">{r.action_type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span> },
    { key: 'client', header: 'Client', sortValue: (r) => r.client_name ?? '', render: (r) => <span className="text-sm text-slate-600">{r.client_name ?? '—'}</span> },
    { key: 'requested', header: 'Requested', sortValue: (r) => r.requested_at, render: (r) => <span className="text-sm text-slate-500">{formatDateTime(r.requested_at)}</span> },
    { key: 'due', header: 'Due', sortValue: (r) => r.due_at ?? '', render: (r) => <span className="text-sm text-slate-500">{r.due_at ? formatDateTime(r.due_at) : '—'}</span> },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <StatusBadge status={r.status} tone={TONE[r.status]} /> },
    { key: 'actions', header: '', render: (r) => <Button size="sm" variant="ghost" onClick={() => { setDetail(r); setComments(r.approver_comments ?? ''); }}><Eye className="h-4 w-4" /></Button> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" description="Human approval queue for sensitive automation actions" />

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4"><div className="text-2xl font-bold text-amber-600">{pendingCount}</div><div className="mt-1 text-xs text-slate-500">Pending</div></Card>
        <Card className="p-4"><div className="text-2xl font-bold text-emerald-600">{approvedCount}</div><div className="mt-1 text-xs text-slate-500">Approved</div></Card>
        <Card className="p-4"><div className="text-2xl font-bold text-rose-600">{rejectedCount}</div><div className="mt-1 text-xs text-slate-500">Rejected</div></Card>
      </div>

      <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-48">
        <option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option>
      </Select>

      {approvals.length === 0 ? <EmptyState title="No approvals" description="Approval requests will appear here when automations need human review." /> : (
        <DataTable columns={columns} rows={approvals} rowKey={r => r.id} searchKeys={(r) => `${r.automation_name} ${r.action_type} ${r.client_name}`} />
      )}

      {detail && (
        <Modal open={true} onClose={() => setDetail(null)} title="Approval Request" size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><div className="text-xs text-slate-400">Automation</div><div className="text-sm text-slate-700">{detail.automation_name}</div></div>
              <div><div className="text-xs text-slate-400">Action</div><div className="text-sm text-slate-700">{detail.action_type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</div></div>
              <div><div className="text-xs text-slate-400">Client</div><div className="text-sm text-slate-700">{detail.client_name ?? '—'}</div></div>
              <div><div className="text-xs text-slate-400">Status</div><StatusBadge status={detail.status} tone={TONE[detail.status]} /></div>
            </div>
            {detail.draft_content && Object.keys(detail.draft_content).length > 0 && (
              <div><div className="text-xs font-semibold uppercase text-slate-400">Draft Content</div><pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(detail.draft_content, null, 2)}</pre></div>
            )}
            {detail.status === 'pending' && (
              <>
                <Field label="Approver comments"><TextArea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Add your comments…" /></Field>
                {canReassign && (
                  <Field label="Reassign to">
                    <Select onChange={(e) => e.target.value && reassign(e.target.value)} defaultValue="">
                      <option value="">Select a member…</option>
                      {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.role}</option>)}
                    </Select>
                  </Field>
                )}
                <div className="flex gap-2">
                  {canApprove && <Button variant="success" onClick={() => decide('approved')} disabled={busy}><Check className="h-4 w-4" /> Approve</Button>}
                  {canReject && <Button variant="danger" onClick={() => decide('rejected')} disabled={busy}><X className="h-4 w-4" /> Reject</Button>}
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
