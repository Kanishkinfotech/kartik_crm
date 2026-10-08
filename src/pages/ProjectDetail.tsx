import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import { addAuditLog } from '@/lib/data';
import { addProjectActivity, fetchTeamUsers, nextTaskNumber } from '@/lib/projectData';
import type { Project, ProjectMilestone, Task, ClientRequirement, ProjectDeliverable, ProjectFile, InternalReview, ClientApproval, ChangeRequest, WorkReport, ProjectActivity, ProjectStatus, MilestoneStatus, TaskStatus, TaskPriority, Client, TaskType } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, StatusBadge, type BadgeTone, Modal, Field, TextInput, TextArea, Select, ConfirmDialog } from '@/components/ui';
import { ArrowLeft, FolderKanban, Plus, CheckCircle2, XCircle, Clock, AlertTriangle, FileText, Package, MessageSquare, Settings as SettingsIcon, Activity, Users, ListTodo, FileCheck, GitBranch, ClipboardList, DollarSign, Eye, Sparkles, Edit2, PlayCircle, Pause, RotateCcw } from 'lucide-react';
import { TaskEditModal } from '@/components/TaskEditModal';
import { ProjectEditModal } from '@/components/ProjectEditModal';
import { formatDate, formatDateTime, formatCurrency, classNames } from '@/lib/format';
import { can } from '@/lib/permissions';
import { generateAIContent } from '@/lib/ai';

const STATUS_TONE: Record<ProjectStatus, BadgeTone> = {
  draft: 'neutral', not_started: 'neutral', planning: 'info', in_progress: 'brand',
  waiting_client: 'warning', internal_review: 'info', client_review: 'info',
  on_hold: 'warning', completed: 'success', cancelled: 'danger', archived: 'neutral',
};
const MS_TONE: Record<MilestoneStatus, BadgeTone> = {
  not_started: 'neutral', in_progress: 'brand', waiting_client: 'warning',
  internal_review: 'info', client_review: 'info', completed: 'success', on_hold: 'warning', cancelled: 'danger',
};
const TASK_TONE: Record<TaskStatus, BadgeTone> = {
  backlog: 'neutral', todo: 'neutral', in_progress: 'brand', waiting_client: 'warning',
  blocked: 'danger', internal_review: 'info', client_review: 'info', completed: 'success', cancelled: 'danger',
};
const PRIO_TONE: Record<TaskPriority, BadgeTone> = {
  low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger',
};

type Tab = 'overview' | 'scope' | 'milestones' | 'tasks' | 'team' | 'files' | 'deliverables' | 'requirements' | 'reviews' | 'approvals' | 'change_requests' | 'work_reports' | 'billing' | 'activity' | 'notes';

const TABS: { id: Tab; label: string; icon: typeof Eye }[] = [
  { id: 'overview', label: 'Overview', icon: Eye },
  { id: 'scope', label: 'Scope', icon: FileText },
  { id: 'milestones', label: 'Milestones', icon: CheckCircle2 },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'files', label: 'Files', icon: Package },
  { id: 'deliverables', label: 'Deliverables', icon: Package },
  { id: 'requirements', label: 'Requirements', icon: AlertTriangle },
  { id: 'reviews', label: 'Reviews', icon: Eye },
  { id: 'approvals', label: 'Approvals', icon: FileCheck },
  { id: 'change_requests', label: 'Change Requests', icon: GitBranch },
  { id: 'work_reports', label: 'Work Reports', icon: ClipboardList },
  { id: 'billing', label: 'Billing', icon: DollarSign },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'notes', label: 'Notes', icon: MessageSquare },
];

export function ProjectDetail({ projectId }: { projectId: string }) {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<{ id: string; role: string; email: string; full_name: string }[]>([]);
  const [requirements, setRequirements] = useState<ClientRequirement[]>([]);
  const [deliverables, setDeliverables] = useState<ProjectDeliverable[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [reviews, setReviews] = useState<InternalReview[]>([]);
  const [approvals, setApprovals] = useState<ClientApproval[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [workReports, setWorkReports] = useState<WorkReport[]>([]);
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [invoices, setInvoices] = useState<{ id: string; invoice_number: string; total: number; status: string; balance: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [showAddRequirement, setShowAddRequirement] = useState(false);
  const [showAddDeliverable, setShowAddDeliverable] = useState(false);
  const [showAddApproval, setShowAddApproval] = useState(false);
  const [showAddReview, setShowAddReview] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showHoldConfirm, setShowHoldConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);
  const [completeReason, setCompleteReason] = useState('');
  const [editingProject, setEditingProject] = useState(false);

  const load = useCallback(async () => {
    const ws = activeWorkspace?.id;
    if (!ws || !projectId) return;
    setLoading(true);
    setError(null);

    const [projRes, msRes, tasksRes, reqRes, delivRes, filesRes, revRes, apprRes, crRes, wrRes, actRes, membersRes] = await Promise.all([
      supabase.from('projects').select('*, clients!left(*)').eq('id', projectId).eq('workspace_id', ws).maybeSingle(),
      supabase.from('project_milestones').select('*').eq('workspace_id', ws).eq('project_id', projectId).order('sequence'),
      supabase.from('tasks').select('*').eq('workspace_id', ws).eq('project_id', projectId).is('archived_at', null).order('created_at', { ascending: false }),
      supabase.from('client_requirements').select('*').eq('workspace_id', ws).eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_deliverables').select('*').eq('workspace_id', ws).eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_files').select('*').eq('workspace_id', ws).eq('project_id', projectId).eq('is_archived', false).order('created_at', { ascending: false }),
      supabase.from('internal_reviews').select('*').eq('workspace_id', ws).eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('client_approvals').select('*').eq('workspace_id', ws).eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('change_requests').select('*').eq('workspace_id', ws).eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('work_reports').select('*').eq('workspace_id', ws).eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_activities').select('*').eq('workspace_id', ws).eq('project_id', projectId).order('event_date', { ascending: false }).limit(50),
      fetchTeamUsers(ws),
    ]);

    if (projRes.error) { setError(describeDbError(projRes.error)); setLoading(false); return; }
    if (!projRes.data) { setError('Project not found'); setLoading(false); return; }

    const projData = projRes.data as Project & { clients?: Client };
    setProject(projData);
    setClient(projData.clients ?? null);
    setMilestones((msRes.data ?? []) as ProjectMilestone[]);
    setTasks((tasksRes.data ?? []) as Task[]);
    setRequirements((reqRes.data ?? []) as ClientRequirement[]);
    setDeliverables((delivRes.data ?? []) as ProjectDeliverable[]);
    setFiles((filesRes.data ?? []) as ProjectFile[]);
    setReviews((revRes.data ?? []) as InternalReview[]);
    setApprovals((apprRes.data ?? []) as ClientApproval[]);
    setChangeRequests((crRes.data ?? []) as ChangeRequest[]);
    setWorkReports((wrRes.data ?? []) as WorkReport[]);
    setActivities((actRes.data ?? []) as ProjectActivity[]);
    setMembers(membersRes);
    setNotesValue(projData.internal_notes ?? '');

    if (projData.client_id) {
      const { data: invData } = await supabase.from('invoices').select('id, invoice_number, total, status, balance').eq('workspace_id', ws).eq('client_id', projData.client_id).order('created_at', { ascending: false });
      setInvoices((invData ?? []) as { id: string; invoice_number: string; total: number; status: string; balance: number }[]);
    }

    setLoading(false);
  }, [activeWorkspace, projectId]);

  useEffect(() => { load(); }, [load]);

  const updateProject = async (fields: Partial<Project>, activityType: string, activityTitle: string, prev?: Record<string, unknown>) => {
    if (!activeWorkspace || !project) return;
    const { error: updErr } = await supabase.from('projects').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', project.id).eq('workspace_id', activeWorkspace.id);
    if (updErr) return;
    await addProjectActivity(activeWorkspace.id, project.id, activityType, { actorId: user?.id ?? null, title: activityTitle, previousValue: prev ? JSON.stringify(prev) : null, newValue: JSON.stringify(fields) });
    await addAuditLog(activeWorkspace.id, user?.id ?? null, 'project', project.id, 'update', { changeSummary: activityTitle });
    load();
  };

  const startProject = async () => {
    if (!activeWorkspace || !project) return;
    const newStartDate = new Date().toISOString().split('T')[0];
    await updateProject({ status: 'in_progress', start_date: newStartDate }, 'project_started', 'Project started');
  };

  const completeProject = async () => {
    if (!activeWorkspace || !project) return;
    await supabase.from('projects').update({
      status: 'completed', actual_completion_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString(),
    }).eq('id', project.id).eq('workspace_id', activeWorkspace.id);
    await addProjectActivity(activeWorkspace.id, project.id, 'project_completed', { actorId: user?.id ?? null, title: 'Project completed', reason: completeReason || null });
    await addAuditLog(activeWorkspace.id, user?.id ?? null, 'project', project.id, 'complete', { changeSummary: 'Project marked completed' });
    if (project.client_id) {
      const { data: cl } = await supabase.from('clients').select('contact_person').eq('id', project.client_id).maybeSingle();
      if (cl) await supabase.from('client_timeline').insert({ workspace_id: activeWorkspace.id, client_id: project.client_id, event_type: 'project_completed', title: 'Project completed', description: project.title, actor_id: user?.id ?? null, related_entity_type: 'project', related_entity_id: project.id });
    }
    setShowCompleteConfirm(false);
    setCompleteReason('');
    load();
  };

  const putOnHold = async () => {
    await updateProject({ status: 'on_hold' }, 'project_on_hold', 'Project put on hold');
    setShowHoldConfirm(false);
  };
  
  const cancelProject = async () => {
    await updateProject({ status: 'cancelled' }, 'project_cancelled', 'Project cancelled');
    setShowCancelConfirm(false);
  };
  
  const reopenProject = async () => {
    await updateProject({ status: 'in_progress', actual_completion_date: null }, 'project_reopened', 'Project reopened');
    setShowReopenConfirm(false);
  };

  const saveNotes = async () => {
    await updateProject({ internal_notes: notesValue }, 'note_added', 'Internal notes updated');
    setEditingNotes(false);
  };

  if (loading) return <LoadingState label="Loading project…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!project) return <ErrorState message="Project not found" />;

  const completedMilestones = milestones.filter((m) => m.status === 'completed').length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const overdueTasks = tasks.filter((t) => t.due_date && t.due_date < new Date().toISOString().slice(0, 10) && t.status !== 'completed' && t.status !== 'cancelled');
  const waitingTasks = tasks.filter((t) => t.status === 'waiting_client');
  const pendingApprovals = approvals.filter((a) => a.status === 'sent' || a.status === 'ready_to_send');
  const pendingRequirements = requirements.filter((r) => r.status === 'requested' || r.status === 'partially_received');
  const pendingReviews = reviews.filter((r) => r.status === 'pending' || r.status === 'in_review');

  const warnings: { text: string; tone: BadgeTone }[] = [];
  if (project.health === 'at_risk') warnings.push({ text: 'Project is at risk', tone: 'warning' });
  if (project.health === 'delayed') warnings.push({ text: 'Project is delayed', tone: 'danger' });
  if (project.health === 'blocked') warnings.push({ text: 'Project is blocked', tone: 'danger' });
  if (project.target_completion_date && project.target_completion_date < new Date().toISOString().slice(0, 10) && project.status !== 'completed') warnings.push({ text: 'Project is overdue', tone: 'danger' });
  if (overdueTasks.length > 0) warnings.push({ text: `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`, tone: 'danger' });
  if (pendingApprovals.length > 0) warnings.push({ text: `${pendingApprovals.length} pending approval${pendingApprovals.length > 1 ? 's' : ''}`, tone: 'warning' });
  if (pendingRequirements.length > 0) warnings.push({ text: `${pendingRequirements.length} pending client requirement${pendingRequirements.length > 1 ? 's' : ''}`, tone: 'warning' });
  if (project.payment_dependency) warnings.push({ text: 'Payment dependency active', tone: 'warning' });

  const pmName = members.find((m) => m.id === project.project_manager_id)?.full_name ?? '—';
  const isInProgress = project.status === 'in_progress' || project.status === 'planning' || project.status === 'waiting_client' || project.status === 'internal_review' || project.status === 'client_review';

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/projects')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{project.project_number}</span>
            <StatusBadge status={project.status} tone={STATUS_TONE[project.status]} />
            <StatusBadge status={project.health} tone={project.health === 'on_track' ? 'success' : project.health === 'at_risk' ? 'warning' : 'danger'} />
          </div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">{project.title}</h1>
        </div>
        <div className="flex gap-2">
          {project.status === 'not_started' && can(role, 'project.update') && (
            <Button onClick={startProject}><PlayCircle className="h-4 w-4" /> Start Project</Button>
          )}
          {can(role, 'project.update') && (
            <Button variant="secondary" onClick={() => setEditingProject(true)}><Edit2 className="h-4 w-4" /> Edit</Button>
          )}
          {(project.status === 'in_progress' || project.status === 'planning' || project.status === 'waiting_client' || project.status === 'internal_review' || project.status === 'client_review') && can(role, 'project.update') && (
            <Button variant="warning" onClick={() => setShowHoldConfirm(true)}><Pause className="h-4 w-4" /> Hold</Button>
          )}
          {project.status === 'on_hold' && can(role, 'project.update') && (
            <>
              <Button variant="success" onClick={() => updateProject({ status: 'in_progress' }, 'project_resumed', 'Project resumed')}><PlayCircle className="h-4 w-4" /> Resume</Button>
              <Button variant="danger" onClick={() => setShowCancelConfirm(true)}><XCircle className="h-4 w-4" /> Cancel</Button>
            </>
          )}
          {(project.status === 'completed' || project.status === 'cancelled') && can(role, 'project.update') && (
            <Button variant="outline" onClick={() => setShowReopenConfirm(true)}><RotateCcw className="h-4 w-4" /> Reopen</Button>
          )}
          {(project.status === 'in_progress' || project.status === 'planning' || project.status === 'waiting_client' || project.status === 'internal_review' || project.status === 'client_review') && can(role, 'project.complete') && (
            <Button variant="success" onClick={() => setShowCompleteConfirm(true)}><CheckCircle2 className="h-4 w-4" /> Complete</Button>
          )}
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className={classNames(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
              w.tone === 'danger' ? 'bg-rose-50 text-rose-700' : w.tone === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600',
            )}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {w.text}
            </div>
          ))}
        </div>
      )}

      {/* Sticky summary bar */}
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <SummaryItem label="Client" value={client?.business_name ?? client?.contact_person ?? '—'} />
          <SummaryItem label="Project Manager" value={pmName} />
          <SummaryItem label="Start" value={formatDate(project.start_date)} />
          <SummaryItem label="Target" value={formatDate(project.target_completion_date)} />
          <SummaryItem label="Progress" value={`${project.progress}%`} />
          <SummaryItem label="Billing" value={project.billing_status.replace(/_/g, ' ')} />
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={classNames(
              'flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors',
              tab === t.id ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab project={project} client={client} milestones={milestones} tasks={tasks} activities={activities} warnings={warnings} pendingApprovals={pendingApprovals.length} pendingRequirements={pendingRequirements.length} pendingReviews={pendingReviews.length} overdueTasks={overdueTasks.length} invoices={invoices} />}
      {tab === 'scope' && <ScopeTab project={project} canEdit={can(role, 'project.update')} updateProject={updateProject} wsId={activeWorkspace?.id ?? ''} />}
      {tab === 'milestones' && <MilestonesTab milestones={milestones} tasks={tasks} members={members} canManage={can(role, 'milestone.create')} onAdd={() => setShowAddMilestone(true)} onRefresh={load} wsId={activeWorkspace?.id ?? ''} userId={user?.id ?? ''} projectId={project.id} />}
      {tab === 'tasks' && <TasksTab tasks={tasks} milestones={milestones} members={members} canCreate={can(role, 'task.create')} onAdd={() => setShowAddTask(true)} onRefresh={load} wsId={activeWorkspace?.id ?? ''} userId={user?.id ?? ''} projectId={project.id} clientId={project.client_id} project={project} />}
      {tab === 'team' && <TeamTab members={members} project={project} onRefresh={load} wsId={activeWorkspace?.id ?? ''} userId={user?.id ?? ''} />}
      {tab === 'files' && <FilesTab files={files} wsId={activeWorkspace?.id ?? ''} projectId={project.id} clientId={project.client_id} onRefresh={load} canUpload={can(role, 'project_file.upload')} />}
      {tab === 'deliverables' && <DeliverablesTab deliverables={deliverables} milestones={milestones} members={members} canCreate={can(role, 'project.update')} onAdd={() => setShowAddDeliverable(true)} onRefresh={load} wsId={activeWorkspace?.id ?? ''} userId={user?.id ?? ''} projectId={project.id} />}
      {tab === 'requirements' && <RequirementsTab requirements={requirements} canCreate={can(role, 'project.update')} onAdd={() => setShowAddRequirement(true)} onRefresh={load} wsId={activeWorkspace?.id ?? ''} userId={user?.id ?? ''} projectId={project.id} clientId={project.client_id} />}
      {tab === 'reviews' && <ReviewsTab reviews={reviews} tasks={tasks} deliverables={deliverables} members={members} canCreate={can(role, 'review.request')} onAdd={() => setShowAddReview(true)} onRefresh={load} wsId={activeWorkspace?.id ?? ''} userId={user?.id ?? ''} projectId={project.id} />}
      {tab === 'approvals' && <ApprovalsTab approvals={approvals} canCreate={can(role, 'client_approval.create')} onAdd={() => setShowAddApproval(true)} onRefresh={load} wsId={activeWorkspace?.id ?? ''} userId={user?.id ?? ''} projectId={project.id} clientId={project.client_id} />}
      {tab === 'change_requests' && <ChangeRequestsTab changeRequests={changeRequests} onRefresh={load} wsId={activeWorkspace?.id ?? ''} canCreate={can(role, 'change_request.create')} userId={user?.id ?? ''} projectId={project.id} clientId={project.client_id} />}
      {tab === 'work_reports' && <WorkReportsTab workReports={workReports} onRefresh={load} onOpen={(id) => navigate(`/work-reports/${id}`)} canCreate={can(role, 'work_report.create')} onCreate={() => navigate('/work-reports')} />}
      {tab === 'billing' && <BillingTab project={project} invoices={invoices} milestones={milestones} canViewFinancials={can(role, 'project.view_financials')} />}
      {tab === 'activity' && <ActivityTab activities={activities} />}
      {tab === 'notes' && <NotesTab notes={notesValue} editing={editingNotes} onEdit={() => setEditingNotes(true)} onSave={saveNotes} onChange={setNotesValue} onCancel={() => setEditingNotes(false)} canEdit={can(role, 'project.update')} />}

      {/* Modals */}
      {showAddTask && <QuickAddTaskModal onClose={() => setShowAddTask(false)} onCreated={load} wsId={activeWorkspace?.id ?? ''} projectId={project.id} clientId={project.client_id} milestones={milestones} members={members} userId={user?.id ?? ''} />}
      {showAddMilestone && <AddMilestoneModal onClose={() => setShowAddMilestone(false)} onCreated={load} wsId={activeWorkspace?.id ?? ''} projectId={project.id} nextSeq={milestones.length} userId={user?.id ?? ''} />}
      {showAddRequirement && <AddRequirementModal onClose={() => setShowAddRequirement(false)} onCreated={load} wsId={activeWorkspace?.id ?? ''} projectId={project.id} clientId={project.client_id} userId={user?.id ?? ''} />}
      {showAddDeliverable && <AddDeliverableModal onClose={() => setShowAddDeliverable(false)} onCreated={load} wsId={activeWorkspace?.id ?? ''} projectId={project.id} milestones={milestones} members={members} userId={user?.id ?? ''} />}
      {showAddApproval && <AddApprovalModal onClose={() => setShowAddApproval(false)} onCreated={load} wsId={activeWorkspace?.id ?? ''} projectId={project.id} clientId={project.client_id} userId={user?.id ?? ''} />}
      {showAddReview && <AddReviewModal onClose={() => setShowAddReview(false)} onCreated={load} wsId={activeWorkspace?.id ?? ''} projectId={project.id} tasks={tasks} deliverables={deliverables} members={members} userId={user?.id ?? ''} />}

      <ConfirmDialog
        open={showCompleteConfirm}
        onClose={() => setShowCompleteConfirm(false)}
        onConfirm={completeProject}
        title="Mark project as completed?"
        message={
          tasks.some(t => t.status !== 'completed' && t.status !== 'cancelled')
            ? `Warning: There are ${tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length} incomplete tasks. This will set the project status to completed and record the completion date.`
            : "This will set the project status to completed and record the completion date. You can reopen it later if needed."
        }
        confirmLabel="Complete project"
      />

      <ConfirmDialog
        open={showHoldConfirm}
        onClose={() => setShowHoldConfirm(false)}
        onConfirm={putOnHold}
        title="Put project on hold?"
        message="This will pause the project and change its status to 'On Hold'."
        confirmLabel="Put on hold"
      />

      <ConfirmDialog
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={cancelProject}
        title="Cancel project?"
        message="This will mark the project as cancelled. You can reopen it later if needed."
        confirmLabel="Cancel project"
      />

      <ConfirmDialog
        open={showReopenConfirm}
        onClose={() => setShowReopenConfirm(false)}
        onConfirm={reopenProject}
        title="Reopen project?"
        message="This will change the project status back to 'In Progress' and clear the completion date."
        confirmLabel="Reopen project"
      />

      {editingProject && (
        <ProjectEditModal
          project={project}
          workspaceId={activeWorkspace?.id || ''}
          userId={user?.id ?? ''}
          onClose={() => setEditingProject(false)}
          onSaved={(updated) => {
            setEditingProject(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

// ─── Overview Tab ───
function OverviewTab({ project, client, milestones, tasks, activities, warnings, pendingApprovals, pendingRequirements, pendingReviews, overdueTasks, invoices }: {
  project: Project; client: Client | null; milestones: ProjectMilestone[]; tasks: Task[];
  activities: ProjectActivity[]; warnings: { text: string; tone: BadgeTone }[];
  pendingApprovals: number; pendingRequirements: number; pendingReviews: number; overdueTasks: number;
  invoices: { id: string; invoice_number: string; total: number; status: string; balance: number }[];
}) {
  const completedMs = milestones.filter((m) => m.status === 'completed').length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total), 0);
  const outstanding = invoices.reduce((s, i) => s + Number(i.balance), 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-700">Project Summary</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Client</dt><dd className="font-medium text-slate-900">{client?.business_name ?? client?.contact_person ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Quotation</dt><dd className="font-medium text-slate-900">{project.quotation_id ? 'Linked' : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Budget</dt><dd className="font-medium text-slate-900">{project.budget ? formatCurrency(project.budget) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Amount Invoiced</dt><dd className="font-medium text-slate-900">{formatCurrency(totalInvoiced)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Outstanding</dt><dd className="font-medium text-slate-900">{formatCurrency(outstanding)}</dd></div>
          </dl>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-700">Progress</h3>
          <div className="mt-3 grid grid-cols-3 gap-4 text-center">
            <div><div className="text-2xl font-bold text-slate-900">{completedMs}</div><div className="text-xs text-slate-500">of {milestones.length} milestones</div></div>
            <div><div className="text-2xl font-bold text-slate-900">{completedTasks}</div><div className="text-xs text-slate-500">of {tasks.length} tasks</div></div>
            <div><div className="text-2xl font-bold text-rose-600">{overdueTasks}</div><div className="text-xs text-slate-500">overdue tasks</div></div>
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        {warnings.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-700">Warnings</h3>
            <ul className="mt-3 space-y-1.5 text-sm">
              {warnings.map((w, i) => <li key={i} className="flex items-center gap-2"><AlertTriangle className={classNames('h-4 w-4', w.tone === 'danger' ? 'text-rose-500' : 'text-amber-500')} /> {w.text}</li>)}
            </ul>
          </Card>
        )}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-700">Pending Items</h3>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-amber-50 p-3"><div className="text-xl font-bold text-amber-700">{pendingApprovals}</div><div className="text-xs text-amber-600">Approvals</div></div>
            <div className="rounded-lg bg-amber-50 p-3"><div className="text-xl font-bold text-amber-700">{pendingRequirements}</div><div className="text-xs text-amber-600">Requirements</div></div>
            <div className="rounded-lg bg-sky-50 p-3"><div className="text-xl font-bold text-sky-700">{pendingReviews}</div><div className="text-xs text-sky-600">Reviews</div></div>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-700">Recent Activity</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {activities.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                <div><div className="text-slate-700">{a.title}</div><div className="text-xs text-slate-400">{formatDateTime(a.event_date)}</div></div>
              </li>
            ))}
            {activities.length === 0 && <li className="text-sm text-slate-400">No activity yet</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ─── Scope Tab ───
function ScopeTab({ project, canEdit, updateProject, wsId }: { project: Project; canEdit: boolean; updateProject: (fields: Partial<Project>, type: string, title: string) => Promise<void>; wsId: string; }) {
  const [busy, setBusy] = useState(false);

  const summariseProject = async () => {
    setBusy(true);
    try {
      const context = `Description: ${project.description || ''}\nScope: ${project.scope_of_work || ''}\nDeliverables: ${project.deliverables || ''}\nExclusions: ${project.exclusions || ''}`;
      const response = await generateAIContent({
        workspace_id: wsId,
        feature_name: 'summarise_project',
        module_name: 'projects',
        userInstruction: `Summarise this project into a concise client-visible summary. Context: ${context}`,
        systemInstruction: "You are an assistant. Provide a brief, professional summary of the project scope and goals. Do not include introductory text."
      });
      if (response.success && response.content) {
        await updateProject({ client_summary: response.content }, 'project_updated', 'Client summary generated via AI');
      } else {
        alert(response.error || "Failed to generate summary");
      }
    } catch (e: any) {
      alert(e.message || "Failed");
    }
    setBusy(false);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="p-5"><h3 className="mb-3 text-sm font-semibold text-slate-700">Description</h3><p className="whitespace-pre-wrap text-sm text-slate-600">{project.description || 'No description provided.'}</p></Card>
      <Card className="p-5"><h3 className="mb-3 text-sm font-semibold text-slate-700">Scope of Work</h3><p className="whitespace-pre-wrap text-sm text-slate-600">{project.scope_of_work || 'No scope defined.'}</p></Card>
      <Card className="p-5"><h3 className="mb-3 text-sm font-semibold text-slate-700">Deliverables</h3><p className="whitespace-pre-wrap text-sm text-slate-600">{project.deliverables || 'No deliverables listed.'}</p></Card>
      <Card className="p-5"><h3 className="mb-3 text-sm font-semibold text-slate-700">Exclusions</h3><p className="whitespace-pre-wrap text-sm text-slate-600">{project.exclusions || 'No exclusions listed.'}</p></Card>
      <Card className="p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Client-visible Summary</h3>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={summariseProject} disabled={busy}>
              <Sparkles className="h-4 w-4" /> {busy ? 'Summarising…' : 'Summarise with AI'}
            </Button>
          )}
        </div>
        <p className="whitespace-pre-wrap text-sm text-slate-600">{project.client_summary || 'No client summary generated.'}</p>
      </Card>
    </div>
  );
}

// ─── Milestones Tab ───
function MilestonesTab({ milestones, tasks, members, canManage, onAdd, onRefresh, wsId, userId, projectId }: {
  milestones: ProjectMilestone[]; tasks: Task[]; members: { id: string; full_name: string }[];
  canManage: boolean; onAdd: () => void; onRefresh: () => void; wsId: string; userId: string; projectId: string;
}) {
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const completeMilestone = async (ms: ProjectMilestone) => {
    const msTasks = tasks.filter((t) => t.milestone_id === ms.id);
    const incomplete = msTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
    if (incomplete.length > 0 && !overrideReason.trim()) {
      setCompletingId(ms.id);
      return;
    }
    await supabase.from('project_milestones').update({ status: 'completed', actual_completion_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', ms.id).eq('workspace_id', wsId);
    await addProjectActivity(wsId, projectId, 'milestone_completed', { actorId: userId, title: `Milestone completed: ${ms.name}`, reason: overrideReason || null });
    await addAuditLog(wsId, userId, 'milestone', ms.id, 'complete', { changeSummary: `Milestone ${ms.name} completed${overrideReason ? ` (override: ${overrideReason})` : ''}` });
    setCompletingId(null); setOverrideReason(''); onRefresh();
  };

  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button size="sm" onClick={onAdd}><Plus className="h-4 w-4" /> Add milestone</Button></div>}
      {milestones.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-10 w-10" />} title="No milestones" description="Add milestones to track project phases." />
      ) : (
        <div className="space-y-3">
          {milestones.map((ms) => {
            const msTasks = tasks.filter((t) => t.milestone_id === ms.id);
            const incomplete = msTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
            return (
              <Card key={ms.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-400">M{ms.milestone_number}</span>
                      <span className="font-medium text-slate-900">{ms.name}</span>
                      <StatusBadge status={ms.status} tone={MS_TONE[ms.status]} />
                    </div>
                    {ms.description && <p className="mt-1 text-sm text-slate-500">{ms.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>Due: {formatDate(ms.due_date)}</span>
                      <span>Progress: {ms.progress}%</span>
                      <span>Tasks: {msTasks.length - incomplete.length}/{msTasks.length}</span>
                      {ms.payment_dependency && <span className="text-amber-600">Payment dep: {ms.required_payment_pct}%</span>}
                      {ms.client_approval_required && <span className="text-amber-600">Approval required</span>}
                    </div>
                    {incomplete.length > 0 && ms.status !== 'completed' && (
                      <div className="mt-2 text-xs text-amber-600">{incomplete.length} incomplete task(s) — override requires reason</div>
                    )}
                  </div>
                  {canManage && ms.status !== 'completed' && (
                    <Button size="sm" variant="success" onClick={() => completeMilestone(ms)}>Complete</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {completingId && (
        <Modal open={true} onClose={() => { setCompletingId(null); setOverrideReason(''); }} title="Override milestone completion" size="sm">
          <p className="text-sm text-slate-600">This milestone has incomplete tasks. Provide a reason to override.</p>
          <Field label="Override reason" required>
            <TextArea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why is this milestone being completed with incomplete tasks?" />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setCompletingId(null); setOverrideReason(''); }}>Cancel</Button>
            <Button variant="danger" onClick={() => { const ms = milestones.find((m) => m.id === completingId); if (ms) completeMilestone(ms); }} disabled={!overrideReason.trim()}>Override & complete</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tasks Tab ───
function TasksTab({ tasks, milestones, members, canCreate, onAdd, onRefresh, wsId, userId, projectId, clientId, project }: {
  tasks: Task[]; milestones: ProjectMilestone[]; members: { id: string; full_name: string }[];
  canCreate: boolean; onAdd: () => void; onRefresh: () => void; wsId: string; userId: string; projectId: string; clientId: string | null; project: Project;
}) {
  const [filter, setFilter] = useState('all');
  const [showSubtasksFor, setShowSubtasksFor] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const filtered = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
  const topLevel = filtered.filter((t) => !t.parent_task_id);
  const subtasks = (parentId: string) => filtered.filter((t) => t.parent_task_id === parentId);

  const moveTask = async (taskId: string, newStatus: TaskStatus) => {
    await supabase.from('tasks').update({ status: newStatus, updated_at: new Date().toISOString(), completed_date: newStatus === 'completed' ? new Date().toISOString().slice(0, 10) : null }).eq('id', taskId).eq('workspace_id', wsId);
    await addProjectActivity(wsId, projectId, 'task_status_changed', { actorId: userId, title: `Task moved to ${newStatus.replace(/_/g, ' ')}`, relatedEntityType: 'task', relatedEntityId: taskId });
    onRefresh();
  };

  const generateTasks = async () => {
    setGenerating(true);
    try {
      const context = `Description: ${project.description || ''}\nScope: ${project.scope_of_work || ''}`;
      const response = await generateAIContent({
        workspace_id: wsId,
        feature_name: 'generate_tasks',
        module_name: 'tasks',
        userInstruction: `Based on the following project scope, generate a list of actionable tasks. Context: ${context}`,
        systemInstruction: "You are an AI project manager. Output ONLY a valid JSON array of objects. Each object should have exactly two keys: 'title' (string, concise actionable task name) and 'description' (string, brief details). Do not include markdown code blocks around the JSON."
      });
      if (response.success && response.content) {
        let jsonStr = response.content.trim();
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '');
        else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '');
        const generatedTasks = JSON.parse(jsonStr.trim());
        if (Array.isArray(generatedTasks) && generatedTasks.length > 0) {
          for (const t of generatedTasks) {
            const num = await nextTaskNumber(wsId);
            await supabase.from('tasks').insert({
              workspace_id: wsId, project_id: projectId, client_id: clientId,
              task_number: num, title: t.title, description: t.description,
              status: 'backlog', priority: 'medium', created_by: userId, progress: 0
            });
          }
          onRefresh();
          alert(`Generated ${generatedTasks.length} tasks!`);
        }
      } else {
        alert(response.error || "Failed to generate tasks");
      }
    } catch (e: any) {
      alert("Failed to generate tasks: " + e.message);
    }
    setGenerating(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-40">
          <option value="all">All statuses</option>
          <option value="backlog">Backlog</option><option value="todo">To Do</option><option value="in_progress">In Progress</option>
          <option value="waiting_client">Waiting Client</option><option value="blocked">Blocked</option>
          <option value="internal_review">Internal Review</option><option value="client_review">Client Review</option>
          <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {canCreate && <Button size="sm" variant="outline" onClick={generateTasks} disabled={generating}><Sparkles className="h-4 w-4" /> {generating ? 'Generating…' : 'Generate tasks from scope'}</Button>}
          {canCreate && <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4" /> Add task</Button>}
        </div>
      </div>
      {topLevel.length === 0 ? (
        <EmptyState icon={<ListTodo className="h-10 w-10" />} title="No tasks" description="Add tasks to track project work." />
      ) : (
        <div className="space-y-2">
          {topLevel.map((t) => {
            const subs = subtasks(t.id);
            const assignee = members.find((m) => m.id === t.assigned_to)?.full_name ?? '—';
            return (
              <Card key={t.id} className="p-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate-400">{t.task_number}</span>
                  <span className="flex-1 font-medium text-slate-900">{t.title}</span>
                  <StatusBadge status={t.priority} tone={PRIO_TONE[t.priority]} />
                  <StatusBadge status={t.status} tone={TASK_TONE[t.status]} />
                  <span className="text-xs text-slate-500">{formatDate(t.due_date)}</span>
                  <Select value={t.status} onChange={(e) => moveTask(t.id, e.target.value as TaskStatus)} className="w-36 text-xs">
                    <option value="backlog">Backlog</option><option value="todo">To Do</option><option value="in_progress">In Progress</option>
                    <option value="waiting_client">Waiting Client</option><option value="blocked">Blocked</option>
                    <option value="internal_review">Internal Review</option><option value="client_review">Client Review</option>
                    <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
                  </Select>
                  <button onClick={() => setEditTask(t)} className="text-xs font-medium text-blue-600 hover:underline">Edit</button>
                  {subs.length > 0 && <button onClick={() => setShowSubtasksFor(showSubtasksFor === t.id ? null : t.id)} className="text-xs text-slate-500 hover:underline">{subs.length} subtask(s)</button>}
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                  <span>Assignee: {assignee}</span>
                  {t.milestone_id && <span>Milestone: {milestones.find((m) => m.id === t.milestone_id)?.name ?? '—'}</span>}
                  <span>Progress: {t.progress}%</span>
                </div>
                {showSubtasksFor === t.id && subs.length > 0 && (
                  <div className="mt-2 space-y-1 border-l-2 border-slate-100 pl-3">
                    {subs.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-xs text-slate-400">{s.task_number}</span>
                        <span className="flex-1 text-slate-700">{s.title}</span>
                        <StatusBadge status={s.status} tone={TASK_TONE[s.status]} />
                        <button onClick={() => setEditTask(s)} className="text-xs font-medium text-blue-600 hover:underline">Edit</button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      
      {editTask && (
        <TaskEditModal
          task={editTask}
          members={members as any}
          milestones={milestones as any}
          workspaceId={wsId}
          userId={userId}
          onClose={() => setEditTask(null)}
          onSaved={() => {
            setEditTask(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

// ─── Team Tab ───
function TeamTab({ members, project, onRefresh, wsId, userId }: {
  members: { id: string; role: string; full_name: string }[]; project: Project; onRefresh: () => void; wsId: string; userId: string;
}) {
  const [projectMembers, setProjectMembers] = useState<{ id: string; user_id: string; role: string; full_name?: string }[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('member');

  useEffect(() => {
    supabase.from('project_members').select('id, user_id, role').eq('workspace_id', wsId).eq('project_id', project.id)
      .then(({ data }) => {
        const mapped = (data ?? []).map((pm: { id: string; user_id: string; role: string }) => ({
          ...pm, full_name: members.find((m) => m.id === pm.user_id)?.full_name ?? '—',
        }));
        setProjectMembers(mapped);
      });
  }, [wsId, project.id, members]);

  const addMember = async () => {
    if (!addUserId) return;
    await supabase.from('project_members').insert({ workspace_id: wsId, project_id: project.id, user_id: addUserId, role: addRole });
    await addProjectActivity(wsId, project.id, 'team_assigned', { actorId: userId, title: 'Team member added', relatedEntityType: 'user', relatedEntityId: addUserId });
    setShowAdd(false); setAddUserId(''); setAddRole('member'); onRefresh();
    supabase.from('project_members').select('id, user_id, role').eq('workspace_id', wsId).eq('project_id', project.id)
      .then(({ data }) => setProjectMembers((data ?? []).map((pm: { id: string; user_id: string; role: string }) => ({ ...pm, full_name: members.find((m) => m.id === pm.user_id)?.full_name ?? '—' }))));
  };

  const removeMember = async (id: string) => {
    await supabase.from('project_members').delete().eq('id', id);
    onRefresh();
    supabase.from('project_members').select('id, user_id, role').eq('workspace_id', wsId).eq('project_id', project.id)
      .then(({ data }) => setProjectMembers((data ?? []).map((pm: { id: string; user_id: string; role: string }) => ({ ...pm, full_name: members.find((m) => m.id === pm.user_id)?.full_name ?? '—' }))));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add member</Button></div>
      <Card className="p-4">
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-semibold uppercase text-slate-500"><tr><th className="pb-2">Member</th><th className="pb-2">Role</th><th className="pb-2"></th></tr></thead>
          <tbody>
            {projectMembers.map((pm) => (
              <tr key={pm.id} className="border-t border-slate-100">
                <td className="py-2 font-medium text-slate-900">{pm.full_name}</td>
                <td className="py-2 capitalize text-slate-600">{pm.role}</td>
                <td className="py-2 text-right"><Button size="sm" variant="ghost" onClick={() => removeMember(pm.id)}>Remove</Button></td>
              </tr>
            ))}
            {projectMembers.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-400">No team members assigned</td></tr>}
          </tbody>
        </table>
      </Card>
      {showAdd && (
        <Modal open={true} onClose={() => setShowAdd(false)} title="Add team member" size="sm">
          <Field label="Member"><Select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}><option value="">— Select —</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select></Field>
          <Field label="Role"><Select value={addRole} onChange={(e) => setAddRole(e.target.value)}><option value="manager">Manager</option><option value="member">Member</option><option value="reviewer">Reviewer</option></Select></Field>
          <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={addMember} disabled={!addUserId}>Add</Button></div>
        </Modal>
      )}
    </div>
  );
}

// ─── Files Tab ───
function FilesTab({ files, wsId, projectId, clientId, onRefresh, canUpload }: {
  files: ProjectFile[]; wsId: string; projectId: string; clientId: string | null; onRefresh: () => void; canUpload: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !wsId) return;
    setUploading(true); setError(null);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['pdf','png','jpg','jpeg','gif','webp','svg','doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip','rar','mp4','mov','webm'].includes(ext)) {
      setError('File type not allowed.'); setUploading(false); return;
    }
    if (file.size > 25 * 1024 * 1024) { setError('File too large (max 25MB).'); setUploading(false); return; }
    const path = `${wsId}/projects/${projectId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('project-files').upload(path, file);
    if (upErr) { setError(describeDbError(upErr)); setUploading(false); return; }
    const { error: dbErr } = await supabase.from('project_files').insert({
      workspace_id: wsId, project_id: projectId, client_id: clientId,
      file_name: file.name, storage_path: path, mime_type: file.type, file_size: file.size,
      category: 'internal_working', uploaded_by: null,
    });
    if (dbErr) { setError(describeDbError(dbErr)); setUploading(false); return; }
    setUploading(false); onRefresh();
  };

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('project-files').getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <div className="space-y-4">
      {canUpload && (
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Upload file
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          {uploading && <span className="text-sm text-slate-500">Uploading…</span>}
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
      )}
      {files.length === 0 ? (
        <EmptyState icon={<Package className="h-10 w-10" />} title="No files" description="Upload project files and deliverables." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((f) => (
            <Card key={f.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium text-slate-900">{f.file_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{f.category.replace(/_/g, ' ')} • v{f.version}</div>
                  <div className="text-xs text-slate-400">{f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : '—'}</div>
                </div>
                {f.is_client_visible && <StatusBadge status="client visible" tone="info" />}
              </div>
              <a href={getPublicUrl(f.storage_path)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-blue-600 hover:underline">Download</a>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Deliverables Tab ───
function DeliverablesTab({ deliverables, milestones, members, canCreate, onAdd, onRefresh, wsId, userId, projectId }: {
  deliverables: ProjectDeliverable[]; milestones: ProjectMilestone[]; members: { id: string; full_name: string }[];
  canCreate: boolean; onAdd: () => void; onRefresh: () => void; wsId: string; userId: string; projectId: string;
}) {
  const DELIV_TONE: Record<string, BadgeTone> = { planned: 'neutral', in_progress: 'brand', internal_review: 'info', ready_for_client: 'info', sent_for_approval: 'info', revision_required: 'warning', approved: 'success', delivered: 'success', cancelled: 'danger' };
  const moveDeliverable = async (id: string, status: string) => {
    await supabase.from('project_deliverables').update({ status, updated_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', wsId);
    await addProjectActivity(wsId, projectId, 'deliverable_status_changed', { actorId: userId, title: `Deliverable moved to ${status.replace(/_/g, ' ')}`, relatedEntityType: 'deliverable', relatedEntityId: id });
    onRefresh();
  };
  return (
    <div className="space-y-4">
      {canCreate && <div className="flex justify-end"><Button size="sm" onClick={onAdd}><Plus className="h-4 w-4" /> Add deliverable</Button></div>}
      {deliverables.length === 0 ? (
        <EmptyState icon={<Package className="h-10 w-10" />} title="No deliverables" description="Track project deliverables and their approval status." />
      ) : (
        <div className="space-y-2">
          {deliverables.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex-1 font-medium text-slate-900">{d.title}</span>
                <StatusBadge status={d.status} tone={DELIV_TONE[d.status] ?? 'neutral'} />
                <Select value={d.status} onChange={(e) => moveDeliverable(d.id, e.target.value)} className="w-40 text-xs">
                  <option value="planned">Planned</option><option value="in_progress">In Progress</option><option value="internal_review">Internal Review</option>
                  <option value="ready_for_client">Ready for Client</option><option value="sent_for_approval">Sent for Approval</option>
                  <option value="revision_required">Revision Required</option><option value="approved">Approved</option>
                  <option value="delivered">Delivered</option><option value="cancelled">Cancelled</option>
                </Select>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                <span>Due: {formatDate(d.due_date)}</span>
                <span>Owner: {members.find((m) => m.id === d.owner_id)?.full_name ?? '—'}</span>
                <span>Version: v{d.version}</span>
                {d.milestone_id && <span>Milestone: {milestones.find((m) => m.id === d.milestone_id)?.name ?? '—'}</span>}
                {d.is_final && <span className="text-emerald-600">Final</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Requirements Tab ───
function RequirementsTab({ requirements, canCreate, onAdd, onRefresh, wsId, userId, projectId, clientId }: {
  requirements: ClientRequirement[]; canCreate: boolean; onAdd: () => void; onRefresh: () => void; wsId: string; userId: string; projectId: string; clientId: string | null;
}) {
  const REQ_TONE: Record<string, BadgeTone> = { not_requested: 'neutral', requested: 'warning', partially_received: 'info', received: 'success', rejected: 'danger', not_applicable: 'neutral' };
  const moveReq = async (id: string, status: string) => {
    await supabase.from('client_requirements').update({ status, updated_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', wsId);
    await addProjectActivity(wsId, projectId, 'requirement_status_changed', { actorId: userId, title: `Requirement ${status.replace(/_/g, ' ')}`, relatedEntityType: 'requirement', relatedEntityId: id });
    onRefresh();
  };
  return (
    <div className="space-y-4">
      {canCreate && <div className="flex justify-end"><Button size="sm" onClick={onAdd}><Plus className="h-4 w-4" /> Add requirement</Button></div>}
      {requirements.length === 0 ? (
        <EmptyState icon={<AlertTriangle className="h-10 w-10" />} title="No requirements" description="Track information and assets needed from the client." />
      ) : (
        <div className="space-y-2">
          {requirements.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex-1 font-medium text-slate-900">{r.title}</span>
                <StatusBadge status={r.category} tone="neutral" />
                <StatusBadge status={r.status} tone={REQ_TONE[r.status] ?? 'neutral'} />
                <Select value={r.status} onChange={(e) => moveReq(r.id, e.target.value)} className="w-36 text-xs">
                  <option value="not_requested">Not Requested</option><option value="requested">Requested</option>
                  <option value="partially_received">Partially Received</option><option value="received">Received</option>
                  <option value="rejected">Rejected</option><option value="not_applicable">N/A</option>
                </Select>
              </div>
              {r.description && <p className="mt-1 text-sm text-slate-500">{r.description}</p>}
              <div className="mt-1.5 text-xs text-slate-400">Due: {formatDate(r.due_date)} • From: {r.requested_from ?? '—'}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reviews Tab ───
function ReviewsTab({ reviews, tasks, deliverables, members, canCreate, onAdd, onRefresh, wsId, userId, projectId }: {
  reviews: InternalReview[]; tasks: Task[]; deliverables: ProjectDeliverable[];
  members: { id: string; full_name: string }[]; canCreate: boolean; onAdd: () => void; onRefresh: () => void; wsId: string; userId: string; projectId: string;
}) {
  const REV_TONE: Record<string, BadgeTone> = { pending: 'warning', in_review: 'info', changes_requested: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral' };
  const setReviewStatus = async (id: string, status: string) => {
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'approved' || status === 'rejected' || status === 'changes_requested') updates.decision_date = new Date().toISOString();
    await supabase.from('internal_reviews').update(updates).eq('id', id).eq('workspace_id', wsId);
    await addProjectActivity(wsId, projectId, 'review_status_changed', { actorId: userId, title: `Review ${status.replace(/_/g, ' ')}`, relatedEntityType: 'review', relatedEntityId: id });
    onRefresh();
  };
  return (
    <div className="space-y-4">
      {canCreate && <div className="flex justify-end"><Button size="sm" onClick={onAdd}><Plus className="h-4 w-4" /> Request review</Button></div>}
      {reviews.length === 0 ? (
        <EmptyState icon={<Eye className="h-10 w-10" />} title="No reviews" description="Submit work for internal review and track decisions." />
      ) : (
        <div className="space-y-2">
          {reviews.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex-1 text-sm">
                  {r.task_id && <span>Task: {tasks.find((t) => t.id === r.task_id)?.title ?? '—'}</span>}
                  {r.deliverable_id && <span>Deliverable: {deliverables.find((d) => d.id === r.deliverable_id)?.title ?? '—'}</span>}
                </span>
                <StatusBadge status={r.status} tone={REV_TONE[r.status] ?? 'neutral'} />
                {r.status === 'pending' || r.status === 'in_review' ? (
                  <>
                    <Button size="sm" variant="success" onClick={() => setReviewStatus(r.id, 'approved')}>Approve</Button>
                    <Button size="sm" variant="warning" onClick={() => setReviewStatus(r.id, 'changes_requested')}>Changes</Button>
                    <Button size="sm" variant="danger" onClick={() => setReviewStatus(r.id, 'rejected')}>Reject</Button>
                  </>
                ) : null}
              </div>
              <div className="mt-1.5 text-xs text-slate-400">
                Reviewer: {members.find((m) => m.id === r.reviewer_id)?.full_name ?? '—'} • Submitted: {formatDateTime(r.submission_date)}
                {r.comments && <div className="mt-1 text-slate-500">{r.comments}</div>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Approvals Tab ───
function ApprovalsTab({ approvals, canCreate, onAdd, onRefresh, wsId, userId, projectId, clientId }: {
  approvals: ClientApproval[]; canCreate: boolean; onAdd: () => void; onRefresh: () => void; wsId: string; userId: string; projectId: string; clientId: string | null;
}) {
  const APR_TONE: Record<string, BadgeTone> = { draft: 'neutral', ready_to_send: 'info', sent: 'info', viewed: 'info', approved: 'success', changes_requested: 'warning', rejected: 'danger', expired: 'neutral', cancelled: 'neutral' };
  const setApprovalStatus = async (id: string, status: string) => {
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'approved') updates.approved_date = new Date().toISOString().slice(0, 10);
    if (status === 'rejected') updates.rejected_date = new Date().toISOString().slice(0, 10);
    await supabase.from('client_approvals').update(updates).eq('id', id).eq('workspace_id', wsId);
    await addProjectActivity(wsId, projectId, 'approval_status_changed', { actorId: userId, title: `Approval ${status.replace(/_/g, ' ')}`, relatedEntityType: 'approval', relatedEntityId: id });
    onRefresh();
  };
  return (
    <div className="space-y-4">
      {canCreate && <div className="flex justify-end"><Button size="sm" onClick={onAdd}><Plus className="h-4 w-4" /> Add approval</Button></div>}
      {approvals.length === 0 ? (
        <EmptyState icon={<FileCheck className="h-10 w-10" />} title="No approvals" description="Track client approvals for designs, content, deliverables, and milestones." />
      ) : (
        <div className="space-y-2">
          {approvals.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex-1 font-medium text-slate-900">{a.title}</span>
                <StatusBadge status={a.approval_type} tone="neutral" />
                <StatusBadge status={a.status} tone={APR_TONE[a.status] ?? 'neutral'} />
                {a.status !== 'approved' && a.status !== 'rejected' && a.status !== 'cancelled' && (
                  <>
                    <Button size="sm" variant="success" onClick={() => setApprovalStatus(a.id, 'approved')}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => setApprovalStatus(a.id, 'rejected')}>Reject</Button>
                  </>
                )}
              </div>
              {a.description && <p className="mt-1 text-sm text-slate-500">{a.description}</p>}
              <div className="mt-1.5 text-xs text-slate-400">Due: {formatDate(a.due_date)} • From: {a.requested_from ?? '—'}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Change Requests Tab ───
function ChangeRequestsTab({ changeRequests, onRefresh, wsId, canCreate, userId, projectId, clientId }: {
  changeRequests: ChangeRequest[]; onRefresh: () => void; wsId: string; canCreate: boolean; userId: string; projectId: string; clientId: string | null;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const CR_TONE: Record<string, BadgeTone> = { draft: 'neutral', under_internal_review: 'info', ready_for_client: 'info', sent: 'info', approved: 'success', rejected: 'danger', changes_requested: 'warning', converted: 'brand', cancelled: 'neutral' };
  const moveCR = async (id: string, status: string) => {
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'approved') updates.approved_date = new Date().toISOString().slice(0, 10);
    await supabase.from('change_requests').update(updates).eq('id', id).eq('workspace_id', wsId);
    await addProjectActivity(wsId, projectId, 'change_request_status_changed', { actorId: userId, title: `Change request ${status.replace(/_/g, ' ')}`, relatedEntityType: 'change_request', relatedEntityId: id });
    onRefresh();
  };
  return (
    <div className="space-y-4">
      {canCreate && <div className="flex justify-end"><Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add change request</Button></div>}
      {changeRequests.length === 0 ? (
        <EmptyState icon={<GitBranch className="h-10 w-10" />} title="No change requests" description="Formal scope changes require a change request." />
      ) : (
        <div className="space-y-2">
          {changeRequests.map((cr) => (
            <Card key={cr.id} className="p-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-slate-400">{cr.cr_number}</span>
                <span className="flex-1 font-medium text-slate-900">{cr.title}</span>
                <span className="text-sm text-slate-600">{formatCurrency(cr.additional_amount)}</span>
                <StatusBadge status={cr.status} tone={CR_TONE[cr.status] ?? 'neutral'} />
              </div>
              {cr.description && <p className="mt-1 text-sm text-slate-500">{cr.description}</p>}
              <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
                <span>Impact: {cr.impact_timeline ?? '—'}</span>
                {cr.status === 'under_internal_review' && <Button size="sm" variant="success" onClick={() => moveCR(cr.id, 'approved')}>Approve</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {showAdd && <AddChangeRequestModal onClose={() => setShowAdd(false)} onCreated={onRefresh} wsId={wsId} projectId={projectId} clientId={clientId} userId={userId} />}
    </div>
  );
}

// ─── Work Reports Tab ───
function WorkReportsTab({ workReports, onRefresh, onOpen, canCreate, onCreate }: {
  workReports: WorkReport[]; onRefresh: () => void; onOpen: (id: string) => void; canCreate: boolean; onCreate: () => void;
}) {
  const WR_TONE: Record<string, BadgeTone> = { draft: 'neutral', internal_review: 'info', approved: 'success', ready_to_share: 'info', shared: 'brand', acknowledged: 'success', revision_required: 'warning', archived: 'neutral' };
  return (
    <div className="space-y-4">
      {canCreate && <div className="flex justify-end"><Button size="sm" onClick={onCreate}><Plus className="h-4 w-4" /> New report</Button></div>}
      {workReports.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-10 w-10" />} title="No work reports" description="Generate professional work reports for this project." />
      ) : (
        <div className="space-y-2">
          {workReports.map((wr) => (
            <Card key={wr.id} className="cursor-pointer p-4 hover:shadow-md" >
              <div className="flex items-center gap-3" onClick={() => onOpen(wr.id)}>
                <span className="font-mono text-xs text-slate-400">{wr.report_number}</span>
                <span className="flex-1 font-medium text-slate-900">{wr.title}</span>
                <span className="text-xs text-slate-500 capitalize">{wr.report_type}</span>
                <StatusBadge status={wr.status} tone={WR_TONE[wr.status] ?? 'neutral'} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Billing Tab ───
function BillingTab({ project, invoices, milestones, canViewFinancials }: {
  project: Project; invoices: { id: string; invoice_number: string; total: number; status: string; balance: number }[]; milestones: ProjectMilestone[]; canViewFinancials: boolean;
}) {
  if (!canViewFinancials) return <Card className="p-8 text-center text-sm text-slate-500">You don't have permission to view financial information.</Card>;
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total), 0);
  const outstanding = invoices.reduce((s, i) => s + Number(i.balance), 0);
  const collected = totalInvoiced - outstanding;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5"><div className="text-xs text-slate-500">Project Budget</div><div className="mt-1 text-2xl font-bold text-slate-900">{project.budget ? formatCurrency(project.budget) : '—'}</div></Card>
        <Card className="p-5"><div className="text-xs text-slate-500">Total Invoiced</div><div className="mt-1 text-2xl font-bold text-blue-700">{formatCurrency(totalInvoiced)}</div></Card>
        <Card className="p-5"><div className="text-xs text-slate-500">Outstanding</div><div className="mt-1 text-2xl font-bold text-rose-600">{formatCurrency(outstanding)}</div></Card>
      </div>
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Linked Invoices</h3>
        {invoices.length === 0 ? <p className="text-sm text-slate-400">No invoices linked to this project's client.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase text-slate-500"><tr><th className="pb-2">Number</th><th className="pb-2">Total</th><th className="pb-2">Balance</th><th className="pb-2">Status</th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100"><td className="py-2 font-mono text-xs">{inv.invoice_number}</td><td className="py-2">{formatCurrency(inv.total)}</td><td className="py-2">{formatCurrency(inv.balance)}</td><td className="py-2"><StatusBadge status={inv.status} tone="neutral" /></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Milestone Billing</h3>
        <div className="space-y-2">
          {milestones.filter((m) => m.payment_dependency).map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{m.name}</span>
              <span className="text-xs text-amber-600">Requires {m.required_payment_pct}% payment</span>
            </div>
          ))}
          {milestones.filter((m) => m.payment_dependency).length === 0 && <p className="text-sm text-slate-400">No payment-dependent milestones.</p>}
        </div>
      </Card>
    </div>
  );
}

// ─── Activity Tab ───
function ActivityTab({ activities }: { activities: ProjectActivity[] }) {
  return (
    <Card className="p-5">
      {activities.length === 0 ? <p className="text-sm text-slate-400">No activity recorded yet.</p> : (
        <ul className="space-y-3">
          {activities.map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
              <div className="flex-1">
                <div className="text-sm text-slate-700">{a.title}</div>
                {a.description && <div className="text-xs text-slate-500">{a.description}</div>}
                {a.reason && <div className="text-xs text-amber-600">Reason: {a.reason}</div>}
                <div className="text-xs text-slate-400">{formatDateTime(a.event_date)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Notes Tab ───
function NotesTab({ notes, editing, onEdit, onSave, onChange, onCancel, canEdit }: {
  notes: string; editing: boolean; onEdit: () => void; onSave: () => void; onChange: (v: string) => void; onCancel: () => void; canEdit: boolean;
}) {
  return (
    <Card className="p-5">
      {editing ? (
        <div className="space-y-3">
          <TextArea value={notes} onChange={(e) => onChange(e.target.value)} className="min-h-[200px]" placeholder="Internal notes (not visible to clients)…" />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button onClick={onSave}>Save notes</Button></div>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Internal Notes</h3>
            {canEdit && <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>}
          </div>
          <p className="whitespace-pre-wrap text-sm text-slate-600">{notes || 'No internal notes yet.'}</p>
        </div>
      )}
    </Card>
  );
}

// ─── Quick Add Task Modal ───
function QuickAddTaskModal({ onClose, onCreated, wsId, projectId, clientId, milestones, members, userId }: {
  onClose: () => void; onCreated: () => void; wsId: string; projectId: string; clientId: string | null;
  milestones: ProjectMilestone[]; members: { id: string; full_name: string }[]; userId: string;
}) {
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('general');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true); setError(null);
    const tnum = await nextTaskNumber(wsId);
    const { error: insErr } = await supabase.from('tasks').insert({
      workspace_id: wsId, project_id: projectId, client_id: clientId,
      milestone_id: milestoneId || null, task_number: tnum, title: title.trim(),
      assigned_to: assignee || null, priority, task_type: taskType,
      due_date: dueDate || null, status: 'todo', created_by: userId,
    });
    if (insErr) { setError(describeDbError(insErr)); setBusy(false); return; }
    await addProjectActivity(wsId, projectId, 'task_created', { actorId: userId, title: `Task created: ${title.trim()}`, relatedEntityType: 'task' });
    setBusy(false); onCreated(); onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title="Quick add task" size="md">
      <div className="space-y-4">
        <Field label="Title" required><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Assignee"><Select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">— Unassigned —</option>{userId && <option value={userId}>Assign to me</option>}{members.filter(m => m.full_name && m.id !== userId).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select></Field>
          <Field label="Milestone"><Select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}><option value="">— None —</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Priority"><Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></Select></Field>
          <Field label="Type"><Select value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)}><option value="general">General</option><option value="design">Design</option><option value="development">Development</option><option value="content">Content</option><option value="testing">Testing</option><option value="review">Review</option></Select></Field>
          <Field label="Due date"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Add task'}</Button></div>
      </div>
    </Modal>
  );
}

// ─── Add Milestone Modal ───
function AddMilestoneModal({ onClose, onCreated, wsId, projectId, nextSeq, userId }: {
  onClose: () => void; onCreated: () => void; wsId: string; projectId: string; nextSeq: number; userId: string;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    const { error: insErr } = await supabase.from('project_milestones').insert({
      workspace_id: wsId, project_id: projectId, milestone_number: nextSeq + 1,
      name: name.trim(), description: description || null, sequence: nextSeq,
      due_date: dueDate || null, status: 'not_started', created_by: userId,
    });
    if (insErr) { setError(describeDbError(insErr)); setBusy(false); return; }
    await addProjectActivity(wsId, projectId, 'milestone_created', { actorId: userId, title: `Milestone created: ${name.trim()}`, relatedEntityType: 'milestone' });
    setBusy(false); onCreated(); onClose();
  };
  return (
    <Modal open={true} onClose={onClose} title="Add milestone" size="md">
      <div className="space-y-4">
        <Field label="Name" required><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Discovery & Research" autoFocus /></Field>
        <Field label="Description"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Due date"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Add milestone'}</Button></div>
      </div>
    </Modal>
  );
}

// ─── Add Requirement Modal ───
function AddRequirementModal({ onClose, onCreated, wsId, projectId, clientId, userId }: {
  onClose: () => void; onCreated: () => void; wsId: string; projectId: string; clientId: string | null; userId: string;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [dueDate, setDueDate] = useState('');
  const [requestedFrom, setRequestedFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true); setError(null);
    const { error: insErr } = await supabase.from('client_requirements').insert({
      workspace_id: wsId, project_id: projectId, client_id: clientId,
      title: title.trim(), description: description || null, category,
      due_date: dueDate || null, requested_from: requestedFrom || null,
      status: 'requested', requested_by: userId, requested_date: new Date().toISOString().slice(0, 10),
    });
    if (insErr) { setError(describeDbError(insErr)); setBusy(false); return; }
    await addProjectActivity(wsId, projectId, 'requirement_requested', { actorId: userId, title: `Requirement requested: ${title.trim()}`, relatedEntityType: 'requirement' });
    setBusy(false); onCreated(); onClose();
  };
  return (
    <Modal open={true} onClose={onClose} title="Add client requirement" size="md">
      <div className="space-y-4">
        <Field label="Title" required><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brand logo files" autoFocus /></Field>
        <Field label="Description"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="content">Content</option><option value="logo">Logo</option><option value="brand_assets">Brand Assets</option>
            <option value="credentials">Credentials</option><option value="domain_access">Domain Access</option><option value="hosting_access">Hosting Access</option>
            <option value="product_info">Product Info</option><option value="images">Images</option><option value="videos">Videos</option>
            <option value="legal_info">Legal Info</option><option value="approval">Approval</option><option value="payment">Payment</option>
            <option value="feedback">Feedback</option><option value="other">Other</option>
          </Select></Field>
          <Field label="Due date"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>
        <Field label="Requested from"><TextInput value={requestedFrom} onChange={(e) => setRequestedFrom(e.target.value)} placeholder="Contact name" /></Field>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Add requirement'}</Button></div>
      </div>
    </Modal>
  );
}

// ─── Add Deliverable Modal ───
function AddDeliverableModal({ onClose, onCreated, wsId, projectId, milestones, members, userId }: {
  onClose: () => void; onCreated: () => void; wsId: string; projectId: string;
  milestones: ProjectMilestone[]; members: { id: string; full_name: string }[]; userId: string;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true); setError(null);
    const { error: insErr } = await supabase.from('project_deliverables').insert({
      workspace_id: wsId, project_id: projectId, milestone_id: milestoneId || null,
      title: title.trim(), description: description || null, owner_id: ownerId || null,
      due_date: dueDate || null, status: 'planned',
    });
    if (insErr) { setError(describeDbError(insErr)); setBusy(false); return; }
    await addProjectActivity(wsId, projectId, 'deliverable_created', { actorId: userId, title: `Deliverable created: ${title.trim()}`, relatedEntityType: 'deliverable' });
    setBusy(false); onCreated(); onClose();
  };
  return (
    <Modal open={true} onClose={onClose} title="Add deliverable" size="md">
      <div className="space-y-4">
        <Field label="Title" required><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Website homepage design" autoFocus /></Field>
        <Field label="Description"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Milestone"><Select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}><option value="">— None —</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
          <Field label="Owner"><Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}><option value="">— Assign —</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select></Field>
        </div>
        <Field label="Due date"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Add deliverable'}</Button></div>
      </div>
    </Modal>
  );
}

// ─── Add Approval Modal ───
function AddApprovalModal({ onClose, onCreated, wsId, projectId, clientId, userId }: {
  onClose: () => void; onCreated: () => void; wsId: string; projectId: string; clientId: string | null; userId: string;
}) {
  const [title, setTitle] = useState('');
  const [approvalType, setApprovalType] = useState('design');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [requestedFrom, setRequestedFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true); setError(null);
    const { error: insErr } = await supabase.from('client_approvals').insert({
      workspace_id: wsId, client_id: clientId, project_id: projectId,
      approval_type: approvalType, title: title.trim(), description: description || null,
      due_date: dueDate || null, requested_from: requestedFrom || null,
      status: 'ready_to_send', requested_date: new Date().toISOString().slice(0, 10), recorded_by: userId,
    });
    if (insErr) { setError(describeDbError(insErr)); setBusy(false); return; }
    await addProjectActivity(wsId, projectId, 'approval_requested', { actorId: userId, title: `Approval requested: ${title.trim()}`, relatedEntityType: 'approval' });
    setBusy(false); onCreated(); onClose();
  };
  return (
    <Modal open={true} onClose={onClose} title="Add client approval" size="md">
      <div className="space-y-4">
        <Field label="Title" required><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Homepage design approval" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type"><Select value={approvalType} onChange={(e) => setApprovalType(e.target.value)}>
            <option value="design">Design</option><option value="content">Content</option><option value="scope">Scope</option>
            <option value="milestone">Milestone</option><option value="deliverable">Deliverable</option>
            <option value="change_request">Change Request</option><option value="deployment">Deployment</option>
            <option value="project_completion">Project Completion</option><option value="other">Other</option>
          </Select></Field>
          <Field label="Due date"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>
        <Field label="Description"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Requested from"><TextInput value={requestedFrom} onChange={(e) => setRequestedFrom(e.target.value)} placeholder="Client contact name" /></Field>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Add approval'}</Button></div>
      </div>
    </Modal>
  );
}

// ─── Add Review Modal ───
function AddReviewModal({ onClose, onCreated, wsId, projectId, tasks, deliverables, members, userId }: {
  onClose: () => void; onCreated: () => void; wsId: string; projectId: string;
  tasks: Task[]; deliverables: ProjectDeliverable[]; members: { id: string; full_name: string }[]; userId: string;
}) {
  const [taskId, setTaskId] = useState('');
  const [deliverableId, setDeliverableId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!reviewerId) { setError('Select a reviewer'); return; }
    setBusy(true); setError(null);
    const { error: insErr } = await supabase.from('internal_reviews').insert({
      workspace_id: wsId, project_id: projectId,
      task_id: taskId || null, deliverable_id: deliverableId || null,
      submitted_by: userId, reviewer_id: reviewerId, comments: comments || null,
      status: 'pending', submission_date: new Date().toISOString(),
    });
    if (insErr) { setError(describeDbError(insErr)); setBusy(false); return; }
    await addProjectActivity(wsId, projectId, 'review_requested', { actorId: userId, title: 'Review requested', relatedEntityType: 'review' });
    setBusy(false); onCreated(); onClose();
  };
  return (
    <Modal open={true} onClose={onClose} title="Request internal review" size="md">
      <div className="space-y-4">
        <Field label="Task"><Select value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">— None —</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></Field>
        <Field label="Deliverable"><Select value={deliverableId} onChange={(e) => setDeliverableId(e.target.value)}><option value="">— None —</option>{deliverables.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</Select></Field>
        <Field label="Reviewer" required><Select value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}><option value="">— Select —</option>{members.filter((m) => m.id !== userId).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select></Field>
        <Field label="Comments"><TextArea value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !reviewerId}>{busy ? 'Creating…' : 'Request review'}</Button></div>
      </div>
    </Modal>
  );
}

// ─── Add Change Request Modal ───
function AddChangeRequestModal({ onClose, onCreated, wsId, projectId, clientId, userId }: {
  onClose: () => void; onCreated: () => void; wsId: string; projectId: string; clientId: string | null; userId: string;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [additionalAmount, setAdditionalAmount] = useState(0);
  const [impactScope, setImpactScope] = useState('');
  const [impactTimeline, setImpactTimeline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true); setError(null);
    const { data: countData } = await supabase.from('change_requests').select('id', { count: 'exact', head: true }).eq('workspace_id', wsId);
    const seq = (countData?.length ?? 0) + 1;
    const crNum = `CR-${String(seq).padStart(4, '0')}`;
    const { error: insErr } = await supabase.from('change_requests').insert({
      workspace_id: wsId, client_id: clientId, project_id: projectId, cr_number: crNum,
      title: title.trim(), description: description || null, reason: reason || null,
      additional_amount: additionalAmount, impact_scope: impactScope || null, impact_timeline: impactTimeline || null,
      status: 'draft', requested_by: userId, requested_date: new Date().toISOString().slice(0, 10),
      created_by: userId,
    });
    if (insErr) { setError(describeDbError(insErr)); setBusy(false); return; }
    await addProjectActivity(wsId, projectId, 'change_request_created', { actorId: userId, title: `Change request created: ${title.trim()}`, relatedEntityType: 'change_request' });
    setBusy(false); onCreated(); onClose();
  };
  return (
    <Modal open={true} onClose={onClose} title="Add change request" size="lg">
      <div className="space-y-4">
        <Field label="Title" required><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Additional landing page" autoFocus /></Field>
        <Field label="Description"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Reason"><TextArea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Additional amount"><TextInput type="number" value={additionalAmount} onChange={(e) => setAdditionalAmount(Number(e.target.value))} /></Field>
          <Field label="Impact on scope"><TextInput value={impactScope} onChange={(e) => setImpactScope(e.target.value)} /></Field>
          <Field label="Impact on timeline"><TextInput value={impactTimeline} onChange={(e) => setImpactTimeline(e.target.value)} /></Field>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create change request'}</Button></div>
      </div>
    </Modal>
  );
}
