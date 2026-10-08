import { describeDbError } from '@/lib/dbError';
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  FileText,
  Plus,
  ArrowLeft,
  Save,
  Send,
  CheckCircle2,
  Share2,
  CheckCheck,
  GitBranch,
  Sparkles,
  Trash2,
  Filter,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import { nextReportNumber, addProjectActivity, fetchTeamUsers } from '@/lib/projectData';
import { addAuditLog } from '@/lib/data';
import { can } from '@/lib/permissions';
import { formatDate, classNames } from '@/lib/format';
import { generateAIContent } from '@/lib/ai';
import type { WorkReport, WorkReportType, WorkReportStatus, Project } from '@/lib/types';
import {
  Button,
  Card,
  PageHeader,
  Field,
  TextInput,
  TextArea,
  Select,
  ConfirmDialog,
  StatusBadge,
  EmptyState,
  LoadingState,
  ErrorState,
  type BadgeTone,
} from '@/components/ui';

// ─── Shared constants ───────────────────────────────────────────────

const REPORT_TYPE_OPTIONS: { value: WorkReportType; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'project_completion', label: 'Project Completion' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'custom', label: 'Custom' },
];

const STATUS_TONES: Record<WorkReportStatus, BadgeTone> = {
  draft: 'neutral',
  internal_review: 'info',
  approved: 'success',
  ready_to_share: 'info',
  shared: 'brand',
  acknowledged: 'success',
  revision_required: 'warning',
  archived: 'neutral',
};

const READ_ONLY_STATUSES: WorkReportStatus[] = ['approved', 'shared', 'acknowledged', 'archived'];

function reportTypeLabel(type: WorkReportType): string {
  return REPORT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type.replace(/_/g, ' ');
}

function statusLabel(status: WorkReportStatus): string {
  return status.replace(/_/g, ' ');
}

interface ToastState {
  message: string;
  tone: 'info' | 'success' | 'error';
}

// ─── List page ──────────────────────────────────────────────────────

interface ListRow extends WorkReport {
  project_title?: string | null;
  prepared_by_name?: string | null;
}

export function WorkReportsList() {
  const { activeWorkspace, role } = useWorkspace();
  const { navigate } = useRouter();
  const wsId = activeWorkspace?.id;

  const [reports, setReports] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | WorkReportStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | WorkReportType>('all');

  const canCreate = can(role, 'work_report.create');
  const canView = can(role, 'work_report.view');

  const load = useCallback(async () => {
    if (!wsId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error: err } = await supabase
        .from('work_reports')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });
      if (err) throw err;

      const { data: projects } = await supabase
        .from('projects')
        .select('id, title')
        .eq('workspace_id', wsId);
      const projectMap = new Map<string, string>();
      for (const p of (projects ?? []) as Pick<Project, 'id' | 'title'>[]) {
        projectMap.set(p.id, p.title);
      }

      const team = await fetchTeamUsers(wsId);
      const userMap = new Map<string, string>();
      for (const u of team) userMap.set(u.id, u.full_name);

      const enriched: ListRow[] = ((rows ?? []) as WorkReport[]).map((r) => ({
        ...r,
        project_title: r.project_id ? (projectMap.get(r.project_id) ?? null) : null,
        prepared_by_name: r.prepared_by ? (userMap.get(r.prepared_by) ?? null) : null,
      }));
      setReports(enriched);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load work reports');
    } finally {
      setLoading(false);
    }
  }, [wsId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (typeFilter !== 'all' && r.report_type !== typeFilter) return false;
      return true;
    });
  }, [reports, statusFilter, typeFilter]);

  if (!wsId) {
    return <LoadingState />;
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Work Reports" description="Internal progress and status reports" />
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="No access"
          description="You do not have permission to view work reports in this workspace."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Reports"
        description="Internal progress and status reports across projects"
        actions={
          canCreate && (
            <Button onClick={() => navigate('/work-reports/new')}>
              <Plus className="h-4 w-4" />
              New report
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | WorkReportStatus)}
            >
              <option value="all">All statuses</option>
              {(Object.keys(STATUS_TONES) as WorkReportStatus[]).map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">Report type</label>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | WorkReportType)}
            >
              <option value="all">All types</option>
              {REPORT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          {(statusFilter !== 'all' || typeFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
              }}
            >
              <Filter className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
          <div className="ml-auto text-xs text-slate-500">{filtered.length} report(s)</div>
        </div>
      </Card>

      {loading ? (
        <LoadingState label="Loading reports…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title={reports.length === 0 ? 'No work reports yet' : 'No reports match your filters'}
          description={
            reports.length === 0
              ? 'Create your first work report to track project progress.'
              : 'Try adjusting or clearing the filters above.'
          }
          action={
            canCreate && (
              <Button onClick={() => navigate('/work-reports/new')}>
                <Plus className="h-4 w-4" />
                New report
              </Button>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Report #</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Prepared by</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/work-reports/${r.id}`)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
                      {r.report_number}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{r.title || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.project_title ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {reportTypeLabel(r.report_type)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {r.reporting_period_start || r.reporting_period_end
                        ? `${formatDate(r.reporting_period_start)} → ${formatDate(r.reporting_period_end)}`
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={statusLabel(r.status)} tone={STATUS_TONES[r.status]} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {r.prepared_by_name ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDate(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Editor page ────────────────────────────────────────────────────

interface ReportFormState {
  title: string;
  report_type: WorkReportType;
  project_id: string;
  reporting_period_start: string;
  reporting_period_end: string;
  executive_summary: string;
  work_completed: string;
  work_in_progress: string;
  pending_from_client: string;
  delays_blockers: string;
  results: string;
  deliverables_summary: string;
  hours_worked: string;
  team_involved: string;
  next_steps: string;
  recommendations: string;
  metrics: { key: string; value: string }[];
}

const EMPTY_FORM: ReportFormState = {
  title: '',
  report_type: 'weekly',
  project_id: '',
  reporting_period_start: '',
  reporting_period_end: '',
  executive_summary: '',
  work_completed: '',
  work_in_progress: '',
  pending_from_client: '',
  delays_blockers: '',
  results: '',
  deliverables_summary: '',
  hours_worked: '',
  team_involved: '',
  next_steps: '',
  recommendations: '',
  metrics: [],
};

export function WorkReportEditor({ reportId }: { reportId: string | null }) {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const wsId = activeWorkspace?.id;

  const isNew = reportId === null;
  const [form, setForm] = useState<ReportFormState>(EMPTY_FORM);
  const [status, setStatus] = useState<WorkReportStatus>('draft');
  const [report, setReport] = useState<WorkReport | null>(null);
  const [projects, setProjects] = useState<Pick<Project, 'id' | 'title' | 'project_number'>[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState<'tasks' | 'milestones' | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const canReview = can(role, 'work_report.review');
  const canUpdate = can(role, 'work_report.update');
  const readOnly = !!report && READ_ONLY_STATUSES.includes(status);
  const fieldsEditable = !readOnly && canUpdate;

  // Load projects dropdown
  useEffect(() => {
    if (!wsId) return;
    supabase
      .from('projects')
      .select('id, title, project_number')
      .eq('workspace_id', wsId)
      .neq('status', 'archived')
      .order('title')
      .then(({ data, error: e }) => {
        if (!e && data) setProjects(data as Pick<Project, 'id' | 'title' | 'project_number'>[]);
      });
  }, [wsId]);

  // Load existing report
  useEffect(() => {
    if (isNew || !wsId || !reportId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    supabase
      .from('work_reports')
      .select('*')
      .eq('id', reportId)
      .eq('workspace_id', wsId)
      .single()
      .then(({ data, error: e }) => {
        setLoading(false);
        if (e) {
          setError(describeDbError(e));
          return;
        }
        const r = data as WorkReport;
        setReport(r);
        setStatus(r.status);
        setForm({
          title: r.title ?? '',
          report_type: r.report_type,
          project_id: r.project_id ?? '',
          reporting_period_start: r.reporting_period_start ?? '',
          reporting_period_end: r.reporting_period_end ?? '',
          executive_summary: r.executive_summary ?? '',
          work_completed: r.work_completed ?? '',
          work_in_progress: r.work_in_progress ?? '',
          pending_from_client: r.pending_from_client ?? '',
          delays_blockers: r.delays_blockers ?? '',
          results: r.results ?? '',
          deliverables_summary: r.deliverables_summary ?? '',
          hours_worked: r.hours_worked != null ? String(r.hours_worked) : '',
          team_involved: (r.team_involved ?? []).join(', '),
          next_steps: r.next_steps ?? '',
          recommendations: r.recommendations ?? '',
          metrics: Object.entries(r.metrics ?? {}).map(([k, v]) => ({ key: k, value: String(v) })),
        });
      });
  }, [isNew, wsId, reportId]);

  const set = useCallback(
    <K extends keyof ReportFormState>(key: K, value: ReportFormState[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    [],
  );

  const buildPayload = useCallback(() => {
    const metricsObj: Record<string, unknown> = {};
    for (const m of form.metrics) {
      const k = m.key.trim();
      if (k) metricsObj[k] = m.value;
    }
    return {
      title: form.title.trim(),
      report_type: form.report_type,
      project_id: form.project_id || null,
      reporting_period_start: form.reporting_period_start || null,
      reporting_period_end: form.reporting_period_end || null,
      executive_summary: form.executive_summary || null,
      work_completed: form.work_completed || null,
      work_in_progress: form.work_in_progress || null,
      pending_from_client: form.pending_from_client || null,
      delays_blockers: form.delays_blockers || null,
      results: form.results || null,
      deliverables_summary: form.deliverables_summary || null,
      hours_worked: form.hours_worked ? Number(form.hours_worked) : null,
      team_involved: form.team_involved
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      next_steps: form.next_steps || null,
      recommendations: form.recommendations || null,
      metrics: metricsObj,
    };
  }, [form]);

  const logTransition = useCallback(
    async (
      saved: WorkReport,
      before: WorkReportStatus,
      after: WorkReportStatus,
      action: string,
      summary: string,
    ) => {
      if (!wsId) return;
      await addAuditLog(wsId, user?.id ?? null, 'work_report', saved.id, action, {
        changeSummary: summary,
        before: { status: before },
        after: { status: after },
      });
      if (saved.project_id) {
        await addProjectActivity(wsId, saved.project_id, 'work_report_status_change', {
          actorId: user?.id ?? null,
          title: `Work report ${saved.report_number} — ${statusLabel(after)}`,
          description: summary,
          relatedEntityType: 'work_report',
          relatedEntityId: saved.id,
          previousValue: before,
          newValue: after,
        });
      }
    },
    [wsId, user],
  );

  // Persist content (insert if new, update if existing). Returns saved row or null.
  const persistContent = useCallback(
    async (overrides?: Record<string, unknown>): Promise<WorkReport | null> => {
      if (!wsId || !user) return null;
      const base = buildPayload();
      if (isNew) {
        const num = await nextReportNumber(wsId);
        const row = {
          ...base,
          workspace_id: wsId,
          report_number: num,
          prepared_by: user.id,
          status: 'draft' as WorkReportStatus,
          ...overrides,
        };
        const { data, error: e } = await supabase
          .from('work_reports')
          .insert(row)
          .select()
          .single();
        if (e) {
          setToast({ message: e.message, tone: 'error' });
          return null;
        }
        return data as WorkReport;
      } else {
        const { data, error: e } = await supabase
          .from('work_reports')
          .update({ ...base, ...overrides })
          .eq('id', reportId!)
          .select()
          .single();
        if (e) {
          setToast({ message: e.message, tone: 'error' });
          return null;
        }
        return data as WorkReport;
      }
    },
    [wsId, user, isNew, reportId, buildPayload],
  );

  const saveDraft = useCallback(async () => {
    if (!form.title.trim()) {
      setToast({ message: 'Title is required', tone: 'error' });
      return;
    }
    setBusy(true);
    const saved = await persistContent();
    setBusy(false);
    if (!saved) return;
    setReport(saved);
    setStatus(saved.status);
    if (isNew) navigate(`/work-reports/${saved.id}`);
    if (!isNew) {
      await addAuditLog(wsId!, user?.id ?? null, 'work_report', saved.id, 'work_report.updated', {
        changeSummary: 'Report content updated',
      });
    }
    setToast({ message: 'Draft saved', tone: 'success' });
  }, [form.title, persistContent, isNew, navigate, wsId, user]);

  const transition = useCallback(
    async (
      target: WorkReportStatus,
      action: string,
      summary: string,
      extra?: Record<string, unknown>,
    ) => {
      if (!form.title.trim()) {
        setToast({ message: 'Title is required before changing status', tone: 'error' });
        return;
      }
      setBusy(true);
      const before = status;
      const saved = await persistContent({ status: target, ...extra });
      setBusy(false);
      if (!saved) return;
      setReport(saved);
      setStatus(saved.status);
      if (isNew && saved.id) navigate(`/work-reports/${saved.id}`);
      await logTransition(saved, before, saved.status, action, summary);
      setToast({ message: summary, tone: 'success' });
    },
    [form.title, status, persistContent, isNew, navigate, logTransition],
  );

  const submitForReview = () =>
    transition('internal_review', 'work_report.submitted', 'Report submitted for internal review');

  const approve = () =>
    transition(
      'approved',
      'work_report.approved',
      'Report approved',
      { reviewed_by: user?.id ?? null, approved_date: new Date().toISOString() },
    );

  const requestRevision = () =>
    transition('revision_required', 'work_report.revision_requested', 'Revision requested');

  const markReadyToShare = () =>
    transition('ready_to_share', 'work_report.ready_to_share', 'Marked ready to share');

  const recordShared = () =>
    transition('shared', 'work_report.shared', 'Report shared with client', {
      shared_date: new Date().toISOString(),
    });

  const recordAcknowledged = () =>
    transition('acknowledged', 'work_report.acknowledged', 'Client acknowledgement recorded');

  const createRevision = useCallback(async () => {
    if (!wsId || !user || !report) return;
    setBusy(true);
    try {
      const num = await nextReportNumber(wsId);
      const { data, error: e } = await supabase
        .from('work_reports')
        .insert({
          workspace_id: wsId,
          report_number: num,
          report_type: report.report_type,
          title: `${report.title} (Revision)`,
          project_id: report.project_id,
          reporting_period_start: report.reporting_period_start,
          reporting_period_end: report.reporting_period_end,
          executive_summary: report.executive_summary,
          work_completed: report.work_completed,
          work_in_progress: report.work_in_progress,
          pending_from_client: report.pending_from_client,
          delays_blockers: report.delays_blockers,
          results: report.results,
          deliverables_summary: report.deliverables_summary,
          hours_worked: report.hours_worked,
          team_involved: report.team_involved,
          next_steps: report.next_steps,
          recommendations: report.recommendations,
          metrics: report.metrics,
          prepared_by: user.id,
          status: 'draft',
        })
        .select()
        .single();
      if (e) throw e;
      const newReport = data as WorkReport;
      await addAuditLog(wsId, user.id, 'work_report', report.id, 'revision_created', {
        changeSummary: `Created revision ${newReport.report_number}`,
        after: { revision_id: newReport.id },
      });
      if (report.project_id) {
        await addProjectActivity(wsId, report.project_id, 'work_report_revision_created', {
          actorId: user.id,
          title: `Revision ${newReport.report_number} created from ${report.report_number}`,
          relatedEntityType: 'work_report',
          relatedEntityId: newReport.id,
        });
      }
      setToast({ message: `Revision ${newReport.report_number} created`, tone: 'success' });
      navigate(`/work-reports/${newReport.id}`);
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to create revision', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }, [wsId, user, report, navigate]);

  // Generate work_completed from completed tasks in the period
  const generateFromTasks = useCallback(async () => {
    if (!wsId || !form.project_id || !form.reporting_period_start || !form.reporting_period_end) {
      setToast({ message: 'Select a project and reporting period first', tone: 'error' });
      return;
    }
    setGenerating('tasks');
    try {
      const { data, error: e } = await supabase
        .from('tasks')
        .select('title, completed_date')
        .eq('workspace_id', wsId)
        .eq('project_id', form.project_id)
        .eq('status', 'completed')
        .gte('completed_date', form.reporting_period_start)
        .lte('completed_date', form.reporting_period_end);
      if (e) throw e;
      const rows = (data ?? []) as { title: string; completed_date: string | null }[];
      const lines = rows.map(
        (t) => `- ${t.title} (completed ${formatDate(t.completed_date)})`,
      );
      const text =
        lines.length > 0
          ? lines.join('\n')
          : 'No completed tasks found in the selected period.';
      set('work_completed', text);
      setToast({
        message: rows.length > 0 ? `Populated ${rows.length} completed task(s)` : 'No tasks found',
        tone: rows.length > 0 ? 'success' : 'info',
      });
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to generate from tasks', tone: 'error' });
    } finally {
      setGenerating(null);
    }
  }, [wsId, form.project_id, form.reporting_period_start, form.reporting_period_end, set]);

  // Generate deliverables_summary from completed milestones in the period
  const generateFromMilestones = useCallback(async () => {
    if (!wsId || !form.project_id || !form.reporting_period_start || !form.reporting_period_end) {
      setToast({ message: 'Select a project and reporting period first', tone: 'error' });
      return;
    }
    setGenerating('milestones');
    try {
      const { data, error: e } = await supabase
        .from('project_milestones')
        .select('name, actual_completion_date')
        .eq('workspace_id', wsId)
        .eq('project_id', form.project_id)
        .eq('status', 'completed')
        .gte('actual_completion_date', form.reporting_period_start)
        .lte('actual_completion_date', form.reporting_period_end);
      if (e) throw e;
      const rows = (data ?? []) as { name: string; actual_completion_date: string | null }[];
      const lines = rows.map(
        (m) => `- ${m.name} (completed ${formatDate(m.actual_completion_date)})`,
      );
      const text =
        lines.length > 0
          ? lines.join('\n')
          : 'No completed milestones found in the selected period.';
      set('deliverables_summary', text);
      setToast({
        message: rows.length > 0 ? `Populated ${rows.length} milestone(s)` : 'No milestones found',
        tone: rows.length > 0 ? 'success' : 'info',
      });
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : 'Failed to generate from milestones',
        tone: 'error',
      });
    } finally {
      setGenerating(null);
    }
  }, [wsId, form.project_id, form.reporting_period_start, form.reporting_period_end, set]);

  const draftWithAI = async (field: 'executive_summary' | 'results' | 'next_steps' | 'recommendations') => {
    if (!wsId || !form.project_id) {
      setToast({ message: "Please select a project first.", tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      const fieldCurrent = form[field];
      const projectCtx = projects.find(p => p.id === form.project_id)?.title || '';
      const context = `Project: ${projectCtx}\nWork Completed: ${form.work_completed}\nWork in Progress: ${form.work_in_progress}`;

      const response = await generateAIContent({
        workspace_id: wsId,
        feature_name: `draft_work_report_${field}`,
        module_name: "work_reports",
        userInstruction: `Draft the ${field.replace('_', ' ')} for a work report. Current content: ${fieldCurrent}. Context: ${context}`,
        systemInstruction: "You are an assistant drafting a section of a business work report. Provide concise, professional text suitable for the requested section. Do not include introductory conversational text.",
      });

      if (response.success && response.content) {
        set(field, response.content);
        setToast({ message: `Drafted ${field.replace('_', ' ')}`, tone: 'success' });
      } else {
        throw new Error(response.error || "Failed to generate draft");
      }
    } catch (err: any) {
      setToast({ message: err.message || "AI Draft failed", tone: 'error' });
    }
    setBusy(false);
  };

  const AILabel = ({ text, field }: { text: string, field: 'executive_summary' | 'results' | 'next_steps' | 'recommendations' }) => (
    <div className="flex w-full items-center justify-between">
      <span>{text}</span>
      {fieldsEditable && (
        <button type="button" onClick={(e) => { e.preventDefault(); draftWithAI(field); }} className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded transition-colors disabled:opacity-50" disabled={busy}>
          <Sparkles className="h-3 w-3" /> Draft with AI
        </button>
      )}
    </div>
  );

  // ─── Render guards ──────────────────────────────────────────────

  if (!wsId) return <LoadingState />;
  if (loading) return <LoadingState label="Loading report…" />;
  if (error) {
    return (
      <div className="space-y-6">
        <BackButton navigate={navigate} />
        <ErrorState message={error} onRetry={() => navigate('/work-reports')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BackButton navigate={navigate} />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {isNew ? 'New work report' : form.title || report?.report_number}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {report ? `${report.report_number} · ${reportTypeLabel(report.report_type)}` : 'Create a new report'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && <StatusBadge status={statusLabel(status)} tone={STATUS_TONES[status]} />}
        </div>
      </div>

      {readOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4" />
          This report is {statusLabel(status)}. Content is read-only — use the actions below to advance status.
        </div>
      )}

      {/* ─── Header fields ─── */}
      <Card className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Title" required>
            <TextInput
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Weekly progress — Website redesign"
              disabled={!fieldsEditable}
            />
          </Field>
          <Field label="Report type" required>
            <Select
              value={form.report_type}
              onChange={(e) => set('report_type', e.target.value as WorkReportType)}
              disabled={!fieldsEditable}
            >
              {REPORT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project">
            <Select
              value={form.project_id}
              onChange={(e) => set('project_id', e.target.value)}
              disabled={!fieldsEditable}
            >
              <option value="">— No project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.project_number})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period start">
              <TextInput
                type="date"
                value={form.reporting_period_start}
                onChange={(e) => set('reporting_period_start', e.target.value)}
                disabled={!fieldsEditable}
              />
            </Field>
            <Field label="Period end">
              <TextInput
                type="date"
                value={form.reporting_period_end}
                onChange={(e) => set('reporting_period_end', e.target.value)}
                disabled={!fieldsEditable}
              />
            </Field>
          </div>
        </div>

        {form.project_id && form.reporting_period_start && form.reporting_period_end && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={generateFromTasks}
              disabled={!fieldsEditable || generating !== null}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {generating === 'tasks' ? 'Generating…' : 'Generate from tasks'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={generateFromMilestones}
              disabled={!fieldsEditable || generating !== null}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {generating === 'milestones' ? 'Generating…' : 'Generate from milestones'}
            </Button>
          </div>
        )}
      </Card>

      {/* ─── Narrative fields ─── */}
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-slate-900">Report content</h2>

        <Field label={<AILabel text="Executive summary" field="executive_summary" />}>
          <TextArea
            value={form.executive_summary}
            onChange={(e) => set('executive_summary', e.target.value)}
            rows={3}
            disabled={!fieldsEditable}
            placeholder="High-level overview of progress this period…"
          />
        </Field>

        <Field label="Work completed" hint="Use “Generate from tasks” to auto-fill from completed tasks.">
          <TextArea
            value={form.work_completed}
            onChange={(e) => set('work_completed', e.target.value)}
            rows={5}
            disabled={!fieldsEditable}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Work in progress">
            <TextArea
              value={form.work_in_progress}
              onChange={(e) => set('work_in_progress', e.target.value)}
              rows={4}
              disabled={!fieldsEditable}
            />
          </Field>
          <Field label="Pending from client">
            <TextArea
              value={form.pending_from_client}
              onChange={(e) => set('pending_from_client', e.target.value)}
              rows={4}
              disabled={!fieldsEditable}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Delays / blockers">
            <TextArea
              value={form.delays_blockers}
              onChange={(e) => set('delays_blockers', e.target.value)}
              rows={4}
              disabled={!fieldsEditable}
            />
          </Field>
          <Field label={<AILabel text="Results" field="results" />} hint="Outcomes, KPIs, measurable impact.">
            <TextArea
              value={form.results}
              onChange={(e) => set('results', e.target.value)}
              rows={4}
              disabled={!fieldsEditable}
            />
          </Field>
        </div>

        <Field label="Deliverables summary" hint="Use “Generate from milestones” to auto-fill.">
          <TextArea
            value={form.deliverables_summary}
            onChange={(e) => set('deliverables_summary', e.target.value)}
            rows={4}
            disabled={!fieldsEditable}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Hours worked">
            <TextInput
              type="number"
              min="0"
              step="0.5"
              value={form.hours_worked}
              onChange={(e) => set('hours_worked', e.target.value)}
              disabled={!fieldsEditable}
              placeholder="0"
            />
          </Field>
          <Field label="Team involved" hint="Comma-separated names.">
            <TextInput
              value={form.team_involved}
              onChange={(e) => set('team_involved', e.target.value)}
              disabled={!fieldsEditable}
              placeholder="Jane Doe, John Smith"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={<AILabel text="Next steps" field="next_steps" />}>
            <TextArea
              value={form.next_steps}
              onChange={(e) => set('next_steps', e.target.value)}
              rows={4}
              disabled={!fieldsEditable}
            />
          </Field>
          <Field label={<AILabel text="Recommendations" field="recommendations" />}>
            <TextArea
              value={form.recommendations}
              onChange={(e) => set('recommendations', e.target.value)}
              rows={4}
              disabled={!fieldsEditable}
            />
          </Field>
        </div>
      </Card>

      {/* ─── Metrics editor ─── */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Metrics</h2>
          {fieldsEditable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => set('metrics', [...form.metrics, { key: '', value: '' }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add metric
            </Button>
          )}
        </div>
        {form.metrics.length === 0 ? (
          <p className="text-sm text-slate-400">No metrics added. Add key/value pairs like “Tasks completed: 12”.</p>
        ) : (
          <div className="space-y-2">
            {form.metrics.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInput
                  value={m.key}
                  onChange={(e) => {
                    const next = [...form.metrics];
                    next[i] = { ...next[i], key: e.target.value };
                    set('metrics', next);
                  }}
                  placeholder="Metric name"
                  disabled={!fieldsEditable}
                  className="flex-1"
                />
                <TextInput
                  value={m.value}
                  onChange={(e) => {
                    const next = [...form.metrics];
                    next[i] = { ...next[i], value: e.target.value };
                    set('metrics', next);
                  }}
                  placeholder="Value"
                  disabled={!fieldsEditable}
                  className="flex-1"
                />
                {fieldsEditable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => set('metrics', form.metrics.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-rose-600"
                    aria-label="Remove metric"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─── Action bar ─── */}
      <Card className="flex flex-wrap items-center gap-2 p-4">
        {fieldsEditable && (
          <Button onClick={saveDraft} disabled={busy}>
            <Save className="h-4 w-4" />
            {isNew ? 'Save draft' : 'Save changes'}
          </Button>
        )}

        {status === 'draft' && (
          <Button variant="secondary" onClick={submitForReview} disabled={busy}>
            <Send className="h-4 w-4" />
            Submit for review
          </Button>
        )}

        {status === 'revision_required' && (
          <Button variant="secondary" onClick={submitForReview} disabled={busy}>
            <Send className="h-4 w-4" />
            Resubmit for review
          </Button>
        )}

        {status === 'internal_review' && canReview && (
          <>
            <Button variant="primary" onClick={approve} disabled={busy}>
              <CheckCircle2 className="h-4 w-4" />
              Approve
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setConfirm({
                  title: 'Request revision',
                  message: 'Request changes to this report? It will return to revision_required.',
                  onConfirm: requestRevision,
                })
              }
              disabled={busy}
            >
              <RotateCcw className="h-4 w-4" />
              Request revision
            </Button>
          </>
        )}

        {status === 'approved' && (
          <Button variant="primary" onClick={markReadyToShare} disabled={busy}>
            <Share2 className="h-4 w-4" />
            Mark ready to share
          </Button>
        )}

        {status === 'ready_to_share' && (
          <Button variant="primary" onClick={recordShared} disabled={busy}>
            <Share2 className="h-4 w-4" />
            Record shared
          </Button>
        )}

        {status === 'shared' && (
          <Button variant="primary" onClick={recordAcknowledged} disabled={busy}>
            <CheckCheck className="h-4 w-4" />
            Record acknowledged
          </Button>
        )}

        {!isNew &&
          ['approved', 'ready_to_share', 'shared', 'acknowledged', 'archived', 'revision_required'].includes(
            status,
          ) && (
            <Button
              variant="outline"
              onClick={() =>
                setConfirm({
                  title: 'Create revision',
                  message:
                    'Create a new draft copy of this report with a new number? You will be taken to edit the revision.',
                  onConfirm: createRevision,
                })
              }
              disabled={busy}
            >
              <GitBranch className="h-4 w-4" />
              Create revision
            </Button>
          )}

        <div className="ml-auto text-xs text-slate-400">
          {report && (
            <span>
              Prepared by {report.prepared_by ? 'you' : '—'} · Created {formatDate(report.created_at)}
            </span>
          )}
        </div>
      </Card>

      {/* ─── Status workflow legend ─── */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <span className="font-medium">Workflow:</span>
        {(['draft', 'internal_review', 'approved', 'ready_to_share', 'shared', 'acknowledged'] as WorkReportStatus[]).map(
          (s, i, arr) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className={classNames(
                  'rounded px-1.5 py-0.5 font-medium',
                  s === status ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600',
                )}
              >
                {statusLabel(s)}
              </span>
              {i < arr.length - 1 && <span className="text-slate-300">→</span>}
            </span>
          ),
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.title}
        />
      )}

      {toast && (
        <ToastInline toast={toast} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────

function BackButton({ navigate }: { navigate: (to: string) => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={() => navigate('/work-reports')}>
      <ArrowLeft className="h-4 w-4" />
      Back
    </Button>
  );
}

function ToastInline({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  const tones = {
    info: 'bg-slate-900 text-white',
    success: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white',
  };
  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      <div className={classNames('rounded-lg px-4 py-3 text-sm shadow-lg', tones[toast.tone])}>
        {toast.message}
      </div>
    </div>
  );
}
