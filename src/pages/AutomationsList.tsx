import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import type { Automation, AutomationStatus, AutomationCategory } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, type BadgeTone, ConfirmDialog, Field, TextInput, Select } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { Zap, Plus, Play, Pause, Copy, Archive, Trash2, TestTube, Clock, AlertTriangle, Activity } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { can } from '@/lib/permissions';
import { ensureAutomationSettings, formatTriggerType, CATEGORY_LABELS } from '@/lib/automation';

const STATUS_TONE: Record<AutomationStatus, BadgeTone> = {
  draft: 'neutral', active: 'success', paused: 'warning', error: 'danger', archived: 'neutral',
};

export function AutomationsList() {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [rows, setRows] = useState<(Automation & { runs_this_month?: number; failure_count?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ type: string; automation: Automation } | null>(null);
  const [busy, setBusy] = useState(false);

  const canCreate = can(role, 'automation.create');
  const canView = can(role, 'automation.view');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true); setError(null);
    await ensureAutomationSettings(activeWorkspace.id);
    const { data, error: err } = await supabase.from('automations').select('*').eq('workspace_id', activeWorkspace.id).order('updated_at', { ascending: false });
    if (err) { setError(describeDbError(err)); setLoading(false); return; }
    const automations = (data ?? []) as Automation[];
    const month = new Date().toISOString().slice(0, 7);
    const enriched = await Promise.all(automations.map(async (auto) => {
      const [{ count: runCount }, { count: failCount }] = await Promise.all([
        supabase.from('automation_runs').select('*', { count: 'exact', head: true }).eq('automation_id', auto.id).gte('started_at', `${month}-01T00:00:00Z`),
        supabase.from('automation_failures').select('*', { count: 'exact', head: true }).eq('automation_id', auto.id).eq('resolution_status', 'open'),
      ]);
      return { ...auto, runs_this_month: runCount ?? 0, failure_count: failCount ?? 0 };
    }));
    setRows(enriched); setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const CATEGORY_PRIORITY: Record<string, number> = {
    lead_management: 1,
    client_onboarding: 2,
    client_communication: 3,
    quotation: 4,
    invoice: 5,
    payment: 6,
    project: 7,
    task: 8,
    renewal: 9,
    work_report: 10,
    internal_notification: 11,
    custom: 12
  };

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.trigger_type.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const pA = CATEGORY_PRIORITY[a.category] || 99;
    const pB = CATEGORY_PRIORITY[b.category] || 99;
    if (pA !== pB) return pA - pB;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  }), [rows, statusFilter, categoryFilter, search]);

  const updateStatus = async (auto: Automation, status: AutomationStatus) => {
    if (!activeWorkspace) return;
    setBusy(true);
    await supabase.from('automations').update({ status, updated_at: new Date().toISOString(), updated_by: user?.id ?? null }).eq('id', auto.id);
    await supabase.from('audit_logs').insert({ workspace_id: activeWorkspace.id, actor_id: user?.id ?? null, entity_type: 'automation', entity_id: auto.id, action: status === 'active' ? 'activated' : status === 'paused' ? 'paused' : 'archived', change_summary: `Automation "${auto.name}" ${status}` });
    setBusy(false); setConfirmAction(null); load();
  };

  const deleteAutomation = async (auto: Automation) => {
    if (!activeWorkspace) return;
    setBusy(true);
    await supabase.from('automations').delete().eq('id', auto.id);
    await supabase.from('audit_logs').insert({ workspace_id: activeWorkspace.id, actor_id: user?.id ?? null, entity_type: 'automation', entity_id: auto.id, action: 'deleted', change_summary: `Automation "${auto.name}" deleted` });
    setBusy(false); setConfirmAction(null); load();
  };

  const duplicate = async (auto: Automation) => {
    if (!activeWorkspace) return;
    setBusy(true);
    const { data, error: dupErr } = await supabase.from('automations').insert({
      workspace_id: activeWorkspace.id, name: `${auto.name} (Copy)`, description: auto.description,
      category: auto.category, trigger_type: auto.trigger_type, trigger_config: auto.trigger_config,
      conditions: auto.conditions, actions: auto.actions, execution_config: auto.execution_config,
      status: 'draft', approval_mode: auto.approval_mode, failure_policy: auto.failure_policy,
      retry_policy: auto.retry_policy, run_limit_daily: auto.run_limit_daily, run_limit_monthly: auto.run_limit_monthly,
      cooldown_minutes: auto.cooldown_minutes, created_by: user?.id ?? null,
    }).select().single();
    if (dupErr) { setError(describeDbError(dupErr)); setBusy(false); return; }
    setBusy(false); navigate(`/automations/${data.id}/edit`);
  };

  const columns: Column<(Automation & { runs_this_month?: number; failure_count?: number })>[] = [
    { key: 'name', header: 'Automation Name', sortValue: (r) => r.name, render: (r) => (
      <div className="flex items-center gap-3 py-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold border border-blue-100 shrink-0">
          <Zap className="h-4 w-4" />
        </div>
        <div>
          <button className="font-bold text-slate-900 hover:text-blue-600 text-sm text-left transition-colors" onClick={() => navigate(`/automations/${r.id}`)}>{r.name}</button>
          {r.description && <div className="text-xs text-slate-500 truncate max-w-sm mt-0.5">{r.description}</div>}
        </div>
      </div>
    )},
    { key: 'category', header: 'Category', sortValue: (r) => r.category, render: (r) => (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
        {CATEGORY_LABELS[r.category] || r.category}
      </span>
    )},
    { key: 'trigger', header: 'Event Trigger', sortValue: (r) => r.trigger_type, render: (r) => (
      <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
        {formatTriggerType(r.trigger_type)}
      </span>
    )},
    { key: 'actions_count', header: 'Actions', sortValue: (r) => r.actions.length, render: (r) => (
      <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">
        {r.actions.length} step{r.actions.length === 1 ? '' : 's'}
      </span>
    )},
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <StatusBadge status={r.status} tone={STATUS_TONE[r.status]} /> },
    { key: 'last_run', header: 'Last Executed', sortValue: (r) => r.last_run_at ?? '', render: (r) => <span className="text-xs text-slate-500 font-medium">{r.last_run_at ? formatDateTime(r.last_run_at) : 'Never'}</span> },
    { key: 'runs_month', header: 'Runs (30d)', sortValue: (r) => r.runs_this_month ?? 0, render: (r) => <span className="text-xs font-bold text-slate-800">{r.runs_this_month ?? 0}</span> },
    { key: 'failures', header: 'Failures', sortValue: (r) => r.failure_count ?? 0, render: (r) => (r.failure_count ?? 0) > 0 ? <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full"><AlertTriangle className="h-3 w-3" /> {r.failure_count}</span> : <span className="text-xs text-slate-400">0</span> },
    { key: 'actions_menu', header: 'Actions', render: (r) => (
      <div className="flex items-center gap-1.5 justify-end">
        {can(role, 'automation.activate') && r.status === 'paused' && (
          <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs py-1 px-2 font-bold" onClick={() => setConfirmAction({ type: 'activate', automation: r })}>
            <Play className="h-3.5 w-3.5 mr-1" /> Run
          </Button>
        )}
        {can(role, 'automation.pause') && r.status === 'active' && (
          <Button size="sm" variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs py-1 px-2 font-bold" onClick={() => setConfirmAction({ type: 'pause', automation: r })}>
            <Pause className="h-3.5 w-3.5 mr-1" /> Pause
          </Button>
        )}
        {can(role, 'automation.test') && (
          <Button size="sm" variant="ghost" title="Edit & Test" onClick={() => navigate(`/automations/${r.id}/edit`)}>
            <TestTube className="h-4 w-4 text-blue-600" />
          </Button>
        )}
        {can(role, 'automation.duplicate') && (
          <Button size="sm" variant="ghost" title="Duplicate Workflow" onClick={() => duplicate(r)}>
            <Copy className="h-4 w-4 text-slate-600" />
          </Button>
        )}
        {can(role, 'automation.archive') && r.status !== 'archived' && (
          <Button size="sm" variant="ghost" title="Archive" onClick={() => setConfirmAction({ type: 'archive', automation: r })}>
            <Archive className="h-4 w-4 text-slate-400 hover:text-rose-600" />
          </Button>
        )}
        {can(role, 'automation.delete') && (
          <Button size="sm" variant="ghost" title="Delete" onClick={() => setConfirmAction({ type: 'delete', automation: r })}>
            <Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-600" />
          </Button>
        )}
      </div>
    )},
  ];

  if (!canView) return <ErrorState message="You don't have permission to view automations." />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const activeCount = rows.filter((r) => r.status === 'active').length;
  const pausedCount = rows.filter((r) => r.status === 'paused').length;
  const draftCount = rows.filter((r) => r.status === 'draft').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automations Engine"
        description="Build & manage automated business workflows, triggers, and action sequences."
        actions={canCreate && (
          <Button onClick={() => navigate('/automations/new')} className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md">
            <Plus className="h-4 w-4 mr-1.5" /> New Automation
          </Button>
        )}
      />

      {/* Modern KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4 border-l-4 border-l-emerald-500 shadow-sm hover:shadow transition-shadow bg-gradient-to-br from-white to-emerald-50/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Active Engine</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{activeCount}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-sm">
              <Activity className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500 shadow-sm hover:shadow transition-shadow bg-gradient-to-br from-white to-amber-50/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-700">Paused Workflows</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{pausedCount}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-sm">
              <Pause className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-slate-400 shadow-sm hover:shadow transition-shadow bg-gradient-to-br from-white to-slate-50">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600">Draft Workflows</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{draftCount}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 shadow-sm">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-rose-500 shadow-sm hover:shadow transition-shadow bg-gradient-to-br from-white to-rose-50/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-rose-700">Execution Alerts</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{errorCount}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700 shadow-sm">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filter & Sub-nav Action Toolbar */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <TextInput
              placeholder="Search by name, trigger, or tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 text-xs"
            />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40 text-xs">
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="error">Error</option>
              <option value="archived">Archived</option>
            </Select>
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-52 text-xs">
              <option value="all">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" onClick={() => navigate('/automations/runs')} className="text-xs font-semibold">Run History</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/automations/failed')} className="text-xs font-semibold text-rose-700 border-rose-200 hover:bg-rose-50">Failed Runs</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/automations/approvals')} className="text-xs font-semibold">Approvals</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/automations/templates')} className="text-xs font-semibold text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100">Templates</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/automations/usage')} className="text-xs font-semibold">Usage</Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Zap className="h-10 w-10 text-blue-500" />}
            title={rows.length === 0 ? "No automations created yet" : "No matching automations found"}
            description={rows.length === 0 ? "Create your first automation or start from pre-built templates." : "Try adjusting your search keyword or filters."}
            action={canCreate && rows.length === 0 && (
              <div className="flex gap-3">
                <Button onClick={() => navigate('/automations/new')} className="bg-blue-600 text-white font-bold"><Plus className="h-4 w-4 mr-1" /> New Automation</Button>
                <Button variant="outline" onClick={() => navigate('/automations/templates')}>Browse Ready Templates</Button>
              </div>
            )}
          />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={r => r.id} searchKeys={(r) => `${r.name} ${r.trigger_type} ${r.category}`} />
        )}
      </Card>

      {confirmAction && (
        <ConfirmDialog 
          open={true} 
          onClose={() => setConfirmAction(null)} 
          onConfirm={() => confirmAction.type === 'delete' ? deleteAutomation(confirmAction.automation) : updateStatus(confirmAction.automation, confirmAction.type === 'activate' ? 'active' : confirmAction.type === 'pause' ? 'paused' : 'archived')} 
          title={`${confirmAction.type === 'activate' ? 'Activate' : confirmAction.type === 'pause' ? 'Pause' : confirmAction.type === 'delete' ? 'Delete' : 'Archive'} automation`} 
          message={`Are you sure you want to ${confirmAction.type} "${confirmAction.automation.name}"? ${confirmAction.type === 'delete' ? 'This action cannot be undone.' : ''}`} 
          confirmLabel={confirmAction.type === 'activate' ? 'Activate' : confirmAction.type === 'pause' ? 'Pause' : confirmAction.type === 'delete' ? 'Delete' : 'Archive'} 
          danger={confirmAction.type === 'archive' || confirmAction.type === 'delete'} 
        />
      )}
    </div>
  );
}
