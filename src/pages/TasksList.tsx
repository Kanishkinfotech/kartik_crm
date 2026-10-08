import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import { addAuditLog } from '@/lib/data';
import { addProjectActivity, fetchTeamUsers, nextTaskNumber } from '@/lib/projectData';
import { can } from '@/lib/permissions';
import { formatDate, classNames, initials } from '@/lib/format';
import type { Task, TaskStatus, TaskPriority, TaskTimeLog } from '@/lib/types';
import {
  BadgeTone,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  Toast,
} from '@/components/ui';
import {
  CheckSquare,
  ChevronRight,
  ClipboardList,
  Clock,
  KanbanSquare,
  ListChecks,
  Plus,
  Search,
  Table as TableIcon,
  Kanban,
  AlertTriangle,
  CalendarClock,
  CircleDot,
  CheckCircle2,
  Ban,
  CalendarOff,
  Play,
  List,
  PlayCircle,
} from 'lucide-react';
import { TaskEditModal } from '@/components/TaskEditModal';
import { StartTimerModal, LogTimeModal, TodayEntriesModal } from '@/components/TimeTrackingModals';
import { AttendancePanel } from '@/components/AttendancePanel';
import { FEATURES } from '@/lib/features';
// ─── Shared constants ──────────────────────────────────────────────────────

const STATUS_TONE: Record<TaskStatus, BadgeTone> = {
  backlog: 'neutral',
  todo: 'neutral',
  in_progress: 'brand',
  waiting_client: 'warning',
  blocked: 'danger',
  internal_review: 'info',
  client_review: 'info',
  completed: 'success',
  cancelled: 'danger',
};

const PRIORITY_TONE: Record<TaskPriority, BadgeTone> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

const STATUSES: TaskStatus[] = [
  'backlog', 'todo', 'in_progress', 'waiting_client', 'blocked',
  'internal_review', 'client_review', 'completed', 'cancelled',
];

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

const KANBAN_COLUMNS: TaskStatus[] = [
  'backlog', 'todo', 'in_progress', 'blocked', 'waiting_client',
  'internal_review', 'client_review', 'completed',
];

type TeamUser = { id: string; role: string; email: string; full_name: string };
type ProjectOption = { id: string; title: string; project_number: string };

type TaskRow = Task & {
  project_title?: string | null;
  project_number?: string | null;
  assignee_name?: string;
  assignee_email?: string;
};

function statusLabel(s: TaskStatus): string {
  return s.replace(/_/g, ' ');
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── 1. TasksList — All tasks page ─────────────────────────────────────────

export function TasksList() {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const { navigate } = useRouter();

  const [rows, setRows] = useState<TaskRow[]>([]);
  const [members, setMembers] = useState<TeamUser[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'table' | 'kanban'>('table');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<TaskStatus | ''>('');
  const [bulkPriority, setBulkPriority] = useState<TaskPriority | ''>('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'success' | 'error' } | null>(null);

  const canView = can(role, 'task.view');
  const canCreate = can(role, 'task.create');
  const canBulk = can(role, 'task.bulk_update');
  const canUpdate = can(role, 'task.update');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError(null);
    let q = supabase
      .from('tasks')
      .select('*, projects(project_number, title)')
      .eq('workspace_id', activeWorkspace.id)
      .is('archived_at', null)
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (priorityFilter !== 'all') q = q.eq('priority', priorityFilter);
    if (search.trim()) {
      q = q.or(`title.ilike.%${search.trim()}%,task_number.ilike.%${search.trim()}%`);
    }
    const { data, error: qErr } = await q;
    if (qErr) { setError(describeDbError(qErr)); setLoading(false); return; }

    const base = (data ?? []) as Array<Task & { projects?: { project_number: string; title: string } | null }>;

    let teamMap = new Map<string, TeamUser>();
    if (base.length > 0) {
      const team = await fetchTeamUsers(activeWorkspace.id);
      setMembers(team);
      teamMap = new Map(team.map((t) => [t.id, t]));
    }

    const mapped: TaskRow[] = base.map((t) => ({
      ...t,
      project_title: t.projects?.title ?? null,
      project_number: t.projects?.project_number ?? null,
      assignee_name: t.assigned_to ? teamMap.get(t.assigned_to)?.full_name : undefined,
      assignee_email: t.assigned_to ? teamMap.get(t.assigned_to)?.email : undefined,
    }));
    setRows(mapped);
    setLoading(false);
  }, [activeWorkspace, statusFilter, priorityFilter, search]);

  // Load project list once for the create modal
  useEffect(() => {
    if (!activeWorkspace) return;
    supabase
      .from('projects')
      .select('id, title, project_number')
      .eq('workspace_id', activeWorkspace.id)
      .neq('status', 'archived')
      .order('title')
      .then(({ data }) => setProjects((data ?? []) as ProjectOption[]));
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  // Reset selection when filters change
  useEffect(() => { setSelected(new Set()); }, [statusFilter, priorityFilter, search]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const runBulk = async () => {
    if (!activeWorkspace || selected.size === 0) return;
    setBulkBusy(true);
    const patch: Record<string, unknown> = {};
    if (bulkStatus) patch.status = bulkStatus;
    if (bulkPriority) patch.priority = bulkPriority;
    if (Object.keys(patch).length === 0) { setBulkBusy(false); return; }

    const ids = Array.from(selected);
    const { error: updErr } = await supabase.from('tasks').update(patch).in('id', ids);
    setBulkBusy(false);
    if (updErr) { setToast({ message: updErr.message, tone: 'error' }); return; }

    await addAuditLog(activeWorkspace.id, user?.id ?? null, 'task', null, 'bulk_update', {
      changeSummary: `Bulk updated ${ids.length} task(s)${bulkStatus ? ` → ${statusLabel(bulkStatus as TaskStatus)}` : ''}${bulkPriority ? ` · ${bulkPriority}` : ''}`,
    });
    setToast({ message: `Updated ${ids.length} task(s)`, tone: 'success' });
    setBulkStatus(''); setBulkPriority(''); setSelected(new Set());
    load();
  };

  const assignToMe = async (taskId: string) => {
    if (!activeWorkspace || !user || !canUpdate || assigningId) return;
    setAssigningId(taskId);
    const { error: updErr } = await supabase.from('tasks').update({ assigned_to: user.id }).eq('id', taskId);
    if (updErr) { 
      setToast({ message: updErr.message, tone: 'error' }); 
      setAssigningId(null);
      return; 
    }

    await addAuditLog(activeWorkspace.id, user.id, 'task', taskId, 'update', {
      changeSummary: 'Assigned to self',
    });
    setToast({ message: 'Assigned to you', tone: 'success' });
    await load();
    setAssigningId(null);
  };

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tasks" description="All tasks across your projects." />
        <EmptyState icon={<ClipboardList className="h-10 w-10" />} title="No access" description="You don't have permission to view tasks." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="All tasks across your projects."
        actions={canCreate && <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New task</Button>}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search task # or title…"
            className="w-56 pl-9"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </Select>
        <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="w-40">
          <option value="all">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <div className="ml-auto flex gap-1 rounded-lg border border-slate-200 p-1">
          <button onClick={() => setView('table')} className={classNames('rounded-md p-1.5', view === 'table' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100')} title="Table view"><TableIcon className="h-4 w-4" /></button>
          <button onClick={() => setView('kanban')} className={classNames('rounded-md p-1.5', view === 'kanban' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100')} title="Kanban view"><Kanban className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Bulk action bar */}
      {canBulk && selected.size > 0 && (
        <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">{selected.size} selected</span>
          <Select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as TaskStatus | '')} className="w-40" disabled={!canUpdate}>
            <option value="">Set status…</option>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
          <Select value={bulkPriority} onChange={(e) => setBulkPriority(e.target.value as TaskPriority | '')} className="w-36" disabled={!canUpdate}>
            <option value="">Set priority…</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Button size="sm" onClick={runBulk} disabled={bulkBusy || (!bulkStatus && !bulkPriority)}>
            {bulkBusy ? 'Updating…' : 'Apply'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </Card>
      )}

      {loading ? <LoadingState label="Loading tasks…" /> :
        error ? <ErrorState message={error} onRetry={load} /> :
        rows.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-10 w-10" />}
            title="No tasks found"
            description={search || statusFilter !== 'all' || priorityFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first task to get started.'}
            action={canCreate && <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New task</Button>}
          />
        ) : view === 'table' ? (
          <TaskTable
            rows={rows}
            selected={selected}
            allSelected={allSelected}
            onToggleAll={toggleAll}
            onToggleOne={toggleOne}
            canSelect={canBulk}
            onRowClick={(t) => { if (t.project_id) navigate(`/projects/${t.project_id}`); }}
            onEditTask={canUpdate ? setEditTask : undefined}
            onAssignToMe={assignToMe}
            currentUserId={user?.id}
            canUpdate={canUpdate}
            assigningId={assigningId}
          />
        ) : (
          <TaskKanban
            rows={rows}
            onCardClick={(t) => { if (t.project_id) navigate(`/projects/${t.project_id}`); }}
            onMove={async (id, status) => {
              if (!activeWorkspace || !canUpdate) return;
              const { error: mErr } = await supabase.from('tasks').update({ status }).eq('id', id);
              if (mErr) { setToast({ message: mErr.message, tone: 'error' }); return; }
              setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
              await addAuditLog(activeWorkspace.id, user?.id ?? null, 'task', id, 'update', { changeSummary: `Status → ${statusLabel(status)}` });
            }}
            onAssignToMe={assignToMe}
            canUpdate={canUpdate}
            assigningId={assigningId}
          />
        )
      }

      {showCreate && (
        <QuickTaskModal
          members={members}
          projects={projects}
          onClose={() => setShowCreate(false)}
          onCreated={(t) => { setShowCreate(false); setToast({ message: `Task ${t.task_number} created`, tone: 'success' }); load(); }}
        />
      )}

      {editTask && activeWorkspace && user && (
        <TaskEditModal
          task={editTask as any}
          members={members}
          projects={projects}
          workspaceId={activeWorkspace.id}
          userId={user.id}
          onClose={() => setEditTask(null)}
          onSaved={(t) => { 
            setEditTask(null); 
            setToast({ message: `Task ${t.task_number} updated`, tone: 'success' }); 
            load(); 
          }}
        />
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function TaskTable({
  rows, selected, allSelected, onToggleAll, onToggleOne, canSelect, onRowClick, onEditTask, onAssignToMe, currentUserId, canUpdate, assigningId,
}: {
  rows: TaskRow[];
  selected: Set<string>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  canSelect: boolean;
  onRowClick: (t: Task) => void;
  onEditTask?: (t: Task) => void;
  onAssignToMe: (taskId: string) => void;
  currentUserId?: string;
  canUpdate: boolean;
  assigningId?: string | null;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              {canSelect && (
                <th className="px-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={onToggleAll} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                </th>
              )}
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Progress</th>
              {onEditTask && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((t) => {
              const isSel = selected.has(t.id);
              const clickable = !!t.project_id;
              return (
                <tr
                  key={t.id}
                  className={classNames('hover:bg-slate-50', isSel && 'bg-blue-50/40', clickable && 'cursor-pointer')}
                  onClick={() => { if (!canSelect) onRowClick(t); }}
                >
                  {canSelect && (
                    <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); onToggleOne(t.id); }}>
                      <input type="checkbox" checked={isSel} onChange={() => onToggleOne(t.id)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono text-xs text-slate-600" onClick={() => clickable && onRowClick(t)}>{t.task_number}</td>
                  <td className="px-4 py-3 font-medium text-slate-900" onClick={() => clickable && onRowClick(t)}>{t.title}</td>
                  <td className="px-4 py-3 text-slate-600" onClick={() => clickable && onRowClick(t)}>
                    {t.project_number ? <span className="font-mono text-xs text-slate-500">{t.project_number}</span> : <span className="text-slate-400">—</span>}
                    {t.project_title && <div className="text-xs text-slate-400">{t.project_title}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {t.assigned_to ? (
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">{initials(t.assignee_name || t.assignee_email)}</span>
                        <span className="text-xs text-slate-600">{t.assignee_name ?? t.assignee_email}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs italic text-slate-400">Unassigned</span>
                        {canUpdate && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); onAssignToMe(t.id); }} 
                            disabled={assigningId === t.id}
                            className="text-[10px] font-medium text-blue-600 hover:underline disabled:opacity-50 disabled:no-underline"
                          >
                            {assigningId === t.id ? 'Assigning...' : 'Assign to me'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={t.priority} tone={PRIORITY_TONE[t.priority]} /></td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} tone={STATUS_TONE[t.status]} /></td>
                  <td className="px-4 py-3 text-slate-500">
                    {t.due_date ? formatDate(t.due_date) : <span className="text-xs italic text-slate-400">No due date</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${t.progress}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{t.progress}%</span>
                    </div>
                  </td>
                  {onEditTask && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditTask(t); }}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── 2. MyTasks — Personal task view ───────────────────────────────────────

type MyTasksTab = 'due_today' | 'overdue' | 'upcoming' | 'no_due_date' | 'waiting_review' | 'blocked' | 'completed';

const MY_TABS: { key: MyTasksTab; label: string; icon: any }[] = [
  { key: 'no_due_date', label: 'No Due Date', icon: CalendarOff },
  { key: 'due_today', label: 'Due Today', icon: CircleDot },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle },
  { key: 'upcoming', label: 'Upcoming', icon: CalendarClock },
  { key: 'waiting_review', label: 'Waiting Review', icon: ClipboardList },
  { key: 'blocked', label: 'Blocked', icon: Ban },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
];

export function MyTasks() {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { navigate } = useRouter();

  const [tab, setTab] = useState<MyTasksTab>('no_due_date');
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minutesToday, setMinutesToday] = useState(0);
  const [activeTimer, setActiveTimer] = useState<(TaskTimeLog & { tasks?: { title: string; task_number: string } | null }) | null>(null);

  const [showStartTimer, setShowStartTimer] = useState<string | boolean>(false);
  const [showLogTime, setShowLogTime] = useState(false);
  const [showTodayEntries, setShowTodayEntries] = useState(false);
  const [activeTimerElapsed, setActiveTimerElapsed] = useState(0);

  useEffect(() => {
    if (!activeTimer?.start_time) return;
    const update = () => {
      const now = new Date().getTime();
      const start = new Date(activeTimer.start_time!).getTime();
      setActiveTimerElapsed(Math.max(0, Math.floor((now - start) / 1000)));
    };
    update();
    const int = setInterval(update, 1000);
    return () => clearInterval(int);
  }, [activeTimer]);

  const handleStopTimer = async () => {
    if (!activeWorkspace || !activeTimer) return;
    const now = new Date();
    const start = new Date(activeTimer.start_time!);
    const diffMins = Math.max(1, Math.floor((now.getTime() - start.getTime()) / 60000));
    
    const { error: stopErr } = await supabase
      .from('task_time_logs')
      .update({
        end_time: now.toISOString(),
        duration_minutes: diffMins,
      })
      .eq('id', activeTimer.id);
      
    if (stopErr) {
      alert('Failed to stop timer: ' + stopErr.message);
      return;
    }
    load();
  };

  const load = useCallback(async () => {
    if (!activeWorkspace || !user) return;
    setLoading(true);
    setError(null);
    const { data, error: qErr } = await supabase
      .from('tasks')
      .select('*, projects(project_number, title)')
      .eq('workspace_id', activeWorkspace.id)
      .eq('assigned_to', user.id)
      .is('archived_at', null)
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true, nullsFirst: false });
    if (qErr) { setError(describeDbError(qErr)); setLoading(false); return; }

    const base = (data ?? []) as Array<Task & { projects?: { project_number: string; title: string } | null }>;
    const mapped: TaskRow[] = base.map((t) => ({
      ...t,
      project_title: t.projects?.title ?? null,
      project_number: t.projects?.project_number ?? null,
    }));
    setTasks(mapped);

    // Time logged today
    const { data: tl } = await supabase
      .from('task_time_logs')
      .select('*, tasks(title, task_number)')
      .eq('workspace_id', activeWorkspace.id)
      .eq('user_id', user.id)
      .eq('log_date', todayISO());
    
    const logs = (tl ?? []) as Array<TaskTimeLog & { tasks?: { title: string; task_number: string } | null }>;
    const running = logs.find(x => x.end_time == null);
    setActiveTimer(running || null);

    const total = logs.reduce((sum, r) => sum + (r.duration_minutes ?? 0), 0);
    setMinutesToday(total);
    setLoading(false);
  }, [activeWorkspace, user]);

  useEffect(() => { load(); }, [load]);

  const today = todayISO();

  const filtered = useMemo(() => {
    switch (tab) {
      case 'due_today':
        return tasks.filter((t) => t.due_date != null && t.due_date.slice(0, 10) === today && t.status !== 'completed');
      case 'overdue':
        return tasks.filter((t) => t.due_date != null && t.due_date.slice(0, 10) < today && t.status !== 'completed');
      case 'upcoming':
        return tasks.filter((t) => t.due_date != null && t.due_date.slice(0, 10) > today && t.status !== 'completed');
      case 'no_due_date':
        return tasks.filter((t) => t.due_date == null && t.status !== 'completed');
      case 'waiting_review':
        return tasks.filter((t) => t.status === 'internal_review' || t.status === 'client_review' || t.status === 'waiting_client');
      case 'blocked':
        return tasks.filter((t) => t.status === 'blocked');
      case 'completed':
        return tasks.filter((t) => t.status === 'completed');
      default:
        return tasks;
    }
  }, [tasks, tab, today]);

  const hours = Math.floor(minutesToday / 60);
  const mins = minutesToday % 60;

  return (
    <div className="space-y-6">
      <PageHeader title="My Tasks" description="Tasks assigned to you, grouped by what needs attention." />

      {/* Attendance Panel */}
      {FEATURES.ATTENDANCE_ENABLED && <AttendancePanel />}

      {/* Time Tracking Panel */}
      <Card className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-4 bg-white border border-slate-200">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className={classNames("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors", activeTimer ? "bg-emerald-100 text-emerald-600 animate-pulse" : "bg-blue-50 text-blue-600")}>
            <Clock className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">
              {activeTimer ? 'Timer running' : 'Time logged today'}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5 flex items-center gap-1.5">
              {activeTimer ? (
                <>
                  <span className="font-mono text-emerald-600 font-bold">
                    {String(Math.floor(activeTimerElapsed / 3600)).padStart(2, '0')}:
                    {String(Math.floor((activeTimerElapsed % 3600) / 60)).padStart(2, '0')}:
                    {String(activeTimerElapsed % 60).padStart(2, '0')}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="truncate max-w-[200px] text-slate-600">{activeTimer.tasks?.task_number} {activeTimer.tasks?.title}</span>
                </>
              ) : (
                `${hours}h ${mins}m`
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {activeTimer ? (
            <Button variant="danger" size="sm" onClick={handleStopTimer} className="w-full sm:w-auto">
              <span className="h-2 w-2 rounded-sm bg-white mr-1.5" /> Stop Timer
            </Button>
          ) : (
            <Button size="sm" onClick={() => setShowStartTimer(true)} className="w-full sm:w-auto bg-slate-800 hover:bg-slate-900 text-white border-0">
              <Play className="h-3.5 w-3.5 mr-1.5 fill-current" /> Start Timer
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowLogTime(true)} className="w-full sm:w-auto">
            Log Time
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowTodayEntries(true)} className="hidden sm:flex px-2" title="View Today's Entries">
            <List className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {MY_TABS.map((t) => {
          const Icon = t.icon;
          const count = t.key === 'due_today'
            ? tasks.filter((x) => x.due_date != null && x.due_date.slice(0, 10) === today && x.status !== 'completed').length
            : t.key === 'overdue'
            ? tasks.filter((x) => x.due_date != null && x.due_date.slice(0, 10) < today && x.status !== 'completed').length
            : t.key === 'upcoming'
            ? tasks.filter((x) => x.due_date != null && x.due_date.slice(0, 10) > today && x.status !== 'completed').length
            : t.key === 'no_due_date'
            ? tasks.filter((x) => x.due_date == null && x.status !== 'completed').length
            : t.key === 'waiting_review'
            ? tasks.filter((x) => ['internal_review', 'client_review', 'waiting_client'].includes(x.status)).length
            : t.key === 'blocked'
            ? tasks.filter((x) => x.status === 'blocked').length
            : tasks.filter((x) => x.status === 'completed').length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={classNames(
                'flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {count > 0 && <span className={classNames('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}>{count}</span>}
            </button>
          );
        })}
      </div>

      {loading ? <LoadingState label="Loading your tasks…" /> :
        error ? <ErrorState message={error} onRetry={load} /> :
        filtered.length === 0 ? (
          <EmptyState 
            icon={<CheckSquare className="h-10 w-10" />} 
            title="No tasks here" 
            description="No tasks are currently assigned to you in this category. Tasks must be assigned to you before they appear in My Tasks." 
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <MyTaskCard 
                key={t.id} 
                task={t} 
                activeTimerId={activeTimer?.task_id}
                onStartTimer={(task) => {
                  if (activeTimer) {
                    alert(`Timer already running for ${activeTimer.tasks?.task_number}. Stop it first.`);
                  } else {
                    setShowStartTimer(task.id);
                  }
                }}
                onClick={() => { if (t.project_id) navigate(`/projects/${t.project_id}`); }} 
              />
            ))}
          </div>
        )
      }

      {showStartTimer && activeWorkspace && user && (
        <StartTimerModal
          tasks={tasks}
          initialTaskId={typeof showStartTimer === 'string' ? showStartTimer : undefined}
          workspaceId={activeWorkspace.id}
          userId={user.id}
          onClose={() => setShowStartTimer(false)}
          onStarted={() => { setShowStartTimer(false); load(); }}
        />
      )}

      {showLogTime && activeWorkspace && user && (
        <LogTimeModal
          tasks={tasks}
          workspaceId={activeWorkspace.id}
          userId={user.id}
          onClose={() => setShowLogTime(false)}
          onLogged={() => { setShowLogTime(false); load(); }}
        />
      )}

      {showTodayEntries && activeWorkspace && user && (
        <TodayEntriesModal
          tasks={tasks}
          workspaceId={activeWorkspace.id}
          userId={user.id}
          onClose={() => setShowTodayEntries(false)}
          onEntriesChanged={load}
        />
      )}
    </div>
  );
}

function MyTaskCard({ task, onClick, activeTimerId, onStartTimer }: { task: TaskRow; onClick: () => void; activeTimerId?: string | null; onStartTimer: (t: TaskRow) => void; }) {
  const overdue = task.due_date != null && task.due_date.slice(0, 10) < todayISO() && task.status !== 'completed';
  return (
    <button
      onClick={onClick}
      disabled={!task.project_id}
      className={classNames(
        'group flex flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition',
        task.project_id ? 'hover:shadow-md hover:border-blue-300 cursor-pointer' : 'cursor-default opacity-90',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-slate-400">{task.task_number}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-500" />
      </div>
      <h3 className="mt-1 text-sm font-semibold text-slate-900">{task.title}</h3>
      {task.project_title && (
        <div className="mt-1 text-xs text-slate-500">
          <span className="font-mono text-slate-400">{task.project_number}</span> · {task.project_title}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={task.status} tone={STATUS_TONE[task.status]} />
        <StatusBadge status={task.priority} tone={PRIORITY_TONE[task.priority]} />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className={classNames('text-xs font-medium', overdue ? 'text-rose-600' : 'text-slate-500')}>
          {overdue ? 'Overdue · ' : 'Due · '}{formatDate(task.due_date)}
        </span>
        <div className="flex items-center gap-3">
          <button 
            onClick={(e) => { e.stopPropagation(); onStartTimer(task); }} 
            title="Start timer" 
            className={classNames("rounded p-1 transition-colors", activeTimerId === task.id ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50" : "text-slate-300 hover:text-blue-600 hover:bg-blue-50")}
          >
            <PlayCircle className="h-4 w-4" />
          </button>
          <span className="text-xs text-slate-400">{task.progress}%</span>
        </div>
      </div>
    </button>
  );
}

// ─── 3. TaskKanban — Kanban board view component ───────────────────────────

export function TaskKanban({
  rows,
  onCardClick,
  onMove,
  onAssignToMe,
  canUpdate,
  assigningId,
}: {
  rows: TaskRow[];
  onCardClick: (t: Task) => void;
  onMove: (id: string, status: TaskStatus) => Promise<void> | void;
  onAssignToMe?: (id: string) => void;
  canUpdate?: boolean;
  assigningId?: string | null;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((col) => {
        const items = rows.filter((r) => r.status === col);
        const isOver = dragOver === col;
        return (
          <div
            key={col}
            onDragOver={(e) => { e.preventDefault(); setDragOver(col); }}
            onDragLeave={() => setDragOver((c) => (c === col ? null : c))}
            onDrop={() => {
              setDragOver(null);
              if (dragId) { onMove(dragId, col); setDragId(null); }
            }}
            className={classNames(
              'flex w-72 shrink-0 flex-col rounded-xl border bg-slate-50/50 transition-colors',
              isOver ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200',
            )}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <span className="text-sm font-semibold capitalize text-slate-700">{statusLabel(col)}</span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{items.length}</span>
            </div>
            <div className="space-y-2 p-2 min-h-[60px]">
              {items.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => setDragId(null)}
                  onClick={() => onCardClick(t)}
                  className={classNames(
                    'cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing',
                    dragId === t.id && 'opacity-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs text-slate-400">{t.task_number}</span>
                    <StatusBadge status={t.priority} tone={PRIORITY_TONE[t.priority]} />
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{t.title}</div>
                  {t.project_title && <div className="mt-0.5 text-xs text-slate-500">{t.project_title}</div>}
                  <div className="mt-2 flex items-center justify-between">
                    <StatusBadge status={t.status} tone={STATUS_TONE[t.status]} />
                    <span className="text-xs text-slate-400">
                      {t.due_date ? formatDate(t.due_date) : <span className="italic">No due date</span>}
                    </span>
                  </div>
                  {/* Assignee & Quick Move */}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <div className="flex-1">
                      {t.assigned_to ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600">
                            {initials(t.assignee_name || t.assignee_email)}
                          </span>
                          <span className="truncate">{t.assignee_name ?? t.assignee_email}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs italic text-slate-400">Unassigned</span>
                          {canUpdate && onAssignToMe && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); onAssignToMe(t.id); }} 
                              disabled={assigningId === t.id}
                              className="text-[10px] font-medium text-blue-600 hover:underline disabled:opacity-50"
                            >
                              {assigningId === t.id ? '...' : 'Assign'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <Select
                      value={t.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { e.stopPropagation(); onMove(t.id, e.target.value as TaskStatus); }}
                      className="h-7 w-28 py-0 pl-2 pr-6 text-[10px]"
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                    </Select>
                  </div>
                </div>
              ))}
              {items.length === 0 && <div className="py-4 text-center text-xs text-slate-400">No tasks</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Quick task create modal ───────────────────────────────────────────────

function QuickTaskModal({
  members,
  projects,
  onClose,
  onCreated,
}: {
  members: TeamUser[];
  projects: ProjectOption[];
  onClose: () => void;
  onCreated: (t: Task) => void;
}) {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = can(role, 'task.create');

  const submit = async () => {
    if (!activeWorkspace || !title.trim()) return;
    setBusy(true);
    setError(null);

    const taskNum = await nextTaskNumber(activeWorkspace.id);
    const row: Record<string, unknown> = {
      workspace_id: activeWorkspace.id,
      task_number: taskNum,
      title: title.trim(),
      project_id: projectId || null,
      assigned_to: assigneeId || null,
      priority,
      status: 'todo',
      task_type: 'general',
      due_date: dueDate || null,
      description: description || null,
      progress: 0,
      labels: [],
      payment_dependency: false,
      approval_dependency: false,
      created_by: user?.id ?? null,
    };

    // Resolve client_id from project if available
    if (projectId) {
      const { data: proj } = await supabase.from('projects').select('client_id').eq('id', projectId).maybeSingle();
      if (proj?.client_id) row.client_id = proj.client_id;
    }

    const { data, error: insErr } = await supabase.from('tasks').insert(row).select().single();
    if (insErr) { setError(describeDbError(insErr)); setBusy(false); return; }

    const created = data as Task;

    if (projectId) {
      await addProjectActivity(activeWorkspace.id, projectId, 'task_created', {
        actorId: user?.id ?? null,
        title: `Task ${taskNum} created`,
        description: title.trim(),
        relatedEntityType: 'task',
        relatedEntityId: created.id,
      });
    }
    await addAuditLog(activeWorkspace.id, user?.id ?? null, 'task', created.id, 'create', {
      changeSummary: `Created task ${taskNum}: ${title.trim()}`,
    });

    setBusy(false);
    onCreated(created);
  };

  return (
    <Modal open={true} onClose={onClose} title="Quick create task" size="md">
      <div className="space-y-4">
        <Field label="Task title" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Project">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— None —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.project_number} · {p.title}</option>)}
            </Select>
          </Field>
          <Field label="Assignee">
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {user && <option value={user.id}>Assign to me</option>}
              {members.filter(m => (m.full_name || m.email) && m.id !== user?.id).map((m) => (
                <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Due date">
            <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Description">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details…" />
        </Field>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !title.trim() || !canCreate}>{busy ? 'Creating…' : 'Create task'}</Button>
        </div>
      </div>
    </Modal>
  );
}
