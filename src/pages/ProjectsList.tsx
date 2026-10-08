import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { addAuditLog, addTimelineEvent, nextEntityNumber } from '@/lib/data';
import { addProjectActivity, nextProjectNumber } from '@/lib/projectData';
import type { Project, ProjectStatus, ProjectHealth, Client } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, type BadgeTone, Modal, Field, TextInput, TextArea, Select, ConfirmDialog } from '@/components/ui';
import { Plus, FolderKanban, LayoutGrid, Table as TableIcon, Kanban, ArrowLeft, Save, Copy, PlayCircle, Pause, CheckCircle2, XCircle, RotateCcw, Edit2, Eye, GripVertical, Trash2 } from 'lucide-react';
import { formatDate, classNames } from '@/lib/format';
import { can } from '@/lib/permissions';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent, useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ProjectEditModal } from '@/components/ProjectEditModal';

const STATUS_TONE: Record<ProjectStatus, BadgeTone> = {
  draft: 'neutral', not_started: 'neutral', planning: 'info', in_progress: 'brand',
  waiting_client: 'warning', internal_review: 'info', client_review: 'info',
  on_hold: 'warning', completed: 'success', cancelled: 'danger', archived: 'neutral',
};

const HEALTH_TONE: Record<ProjectHealth, BadgeTone> = {
  on_track: 'success', at_risk: 'warning', delayed: 'danger', blocked: 'danger',
};

const STATUSES: ProjectStatus[] = ['draft','not_started','planning','in_progress','waiting_client','internal_review','client_review','on_hold','completed','cancelled','archived'];
const HEALTHS: ProjectHealth[] = ['on_track','at_risk','delayed','blocked'];

const VALID_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  not_started: ['planning', 'in_progress', 'on_hold', 'cancelled'],
  planning: ['not_started', 'in_progress', 'waiting_client', 'on_hold', 'cancelled'],
  in_progress: ['planning', 'waiting_client', 'internal_review', 'client_review', 'on_hold', 'completed', 'cancelled'],
  waiting_client: ['in_progress', 'internal_review', 'on_hold', 'cancelled'],
  internal_review: ['in_progress', 'waiting_client', 'client_review', 'on_hold', 'completed', 'cancelled'],
  client_review: ['in_progress', 'internal_review', 'on_hold', 'completed', 'cancelled'],
  on_hold: ['planning', 'in_progress', 'waiting_client', 'cancelled'],
  completed: ['in_progress'],
  cancelled: ['in_progress'],
  draft: ['not_started', 'planning'],
  archived: []
};

export function ProjectsList() {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [rows, setRows] = useState<(Project & { client_name?: string; pm_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [view, setView] = useState<'table' | 'kanban'>(() => {
    return (localStorage.getItem('k1-projects-view') as 'table' | 'kanban') || 'kanban';
  });
  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  
  const [confirmComplete, setConfirmComplete] = useState<Project | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Project | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);

  const handleViewChange = (v: 'table' | 'kanban') => {
    setView(v);
    localStorage.setItem('k1-projects-view', v);
  };

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('projects')
      .select('*, clients!inner(business_name, contact_person)')
      .eq('workspace_id', activeWorkspace.id)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });
    if (error) { setError(describeDbError(error)); setLoading(false); return; }
    const mapped = (data ?? []).map((p: Project & { clients?: { business_name: string | null; contact_person: string } }) => ({
      ...p,
      client_name: p.clients?.business_name ?? p.clients?.contact_person ?? '—',
    }));
    setRows(mapped);
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (project: Project, action: 'start' | 'hold' | 'resume' | 'reopen') => {
    if (!activeWorkspace) return;
    try {
      const { updateProject } = await import('@/lib/projectData');
      const userId = user?.id ?? '';
      
      let patch: Partial<Project> = {};
      let actType = '';
      let actTitle = '';
      
      switch (action) {
        case 'start':
          patch = { status: 'in_progress', start_date: project.start_date || new Date().toISOString().slice(0, 10) };
          actType = 'project_started';
          actTitle = 'Project started';
          break;
        case 'hold':
          patch = { status: 'on_hold' };
          actType = 'project_on_hold';
          actTitle = 'Project put on hold';
          break;
        case 'resume':
          patch = { status: 'in_progress' };
          actType = 'project_resumed';
          actTitle = 'Project resumed';
          break;
        case 'reopen':
          patch = { status: 'in_progress', actual_completion_date: null };
          actType = 'project_reopened';
          actTitle = 'Project reopened';
          break;
      }
      
      const res = await updateProject(activeWorkspace.id, project.id, userId, project.updated_at, patch);
      if (res.success) {
        await addProjectActivity(activeWorkspace.id, project.id, actType, { actorId: userId, title: actTitle });
        toast.success(`Project ${action}ed successfully.`);
        load();
      } else {
        toast.error(res.error || 'Failed to update project status.');
      }
    } catch (e: any) {
      toast.error(e.message || 'An unexpected error occurred.');
    }
  };

  const handleComplete = async (project: Project) => {
    if (!activeWorkspace) return;
    try {
      const { updateProject } = await import('@/lib/projectData');
      const userId = user?.id ?? '';
      const patch = { status: 'completed' as ProjectStatus, actual_completion_date: new Date().toISOString().slice(0, 10) };
      const res = await updateProject(activeWorkspace.id, project.id, userId, project.updated_at, patch);
      if (res.success) {
        await addProjectActivity(activeWorkspace.id, project.id, 'project_completed', { actorId: userId, title: 'Project completed' });
        toast.success('Project completed successfully.');
        load();
      } else {
        toast.error(res.error || 'Failed to complete project.');
      }
    } catch (e: any) {
      toast.error(e.message || 'An unexpected error occurred.');
    }
    setConfirmComplete(null);
  };
  
  const handleCancel = async (project: Project) => {
    if (!activeWorkspace) return;
    try {
      const { updateProject } = await import('@/lib/projectData');
      const userId = user?.id ?? '';
      const patch = { status: 'cancelled' as ProjectStatus };
      const res = await updateProject(activeWorkspace.id, project.id, userId, project.updated_at, patch);
      if (res.success) {
        await addProjectActivity(activeWorkspace.id, project.id, 'project_cancelled', { actorId: userId, title: 'Project cancelled' });
        toast.success('Project cancelled successfully.');
        load();
      } else {
        toast.error(res.error || 'Failed to cancel project.');
      }
    } catch (e: any) {
      toast.error(e.message || 'An unexpected error occurred.');
    }
    setConfirmCancel(null);
  };

  const handleDelete = async (project: Project) => {
    if (!activeWorkspace) return;
    try {
      const { updateProject } = await import('@/lib/projectData');
      const userId = user?.id ?? '';
      const patch = { is_deleted: true };
      const res = await updateProject(activeWorkspace.id, project.id, userId, project.updated_at, patch);
      if (res.success) {
        toast.success('Project deleted successfully.');
        load();
      } else {
        toast.error(res.error || 'Failed to delete project.');
      }
    } catch (e: any) {
      toast.error(e.message || 'An unexpected error occurred.');
    }
    setConfirmDelete(null);
  };

  const handleMove = async (project: Project, targetStatus: ProjectStatus) => {
    if (project.status === targetStatus || !activeWorkspace) return;
    
    const validNextStatuses = VALID_TRANSITIONS[project.status] || [];
    if (!validNextStatuses.includes(targetStatus)) {
      toast.error(`Cannot move project from ${project.status.replace(/_/g, ' ')} to ${targetStatus.replace(/_/g, ' ')}`);
      return;
    }

    if (targetStatus === 'completed') {
      setConfirmComplete(project);
      return;
    }
    if (targetStatus === 'cancelled') {
      setConfirmCancel(project);
      return;
    }

    const originalStatus = project.status;
    setRows(prev => prev.map(r => r.id === project.id ? { ...r, status: targetStatus } : r));

    try {
      const { updateProject } = await import('@/lib/projectData');
      const userId = user?.id ?? '';
      
      let patch: Partial<Project> = { status: targetStatus };
      if (targetStatus === 'in_progress' && !project.start_date) {
        patch.start_date = new Date().toISOString().slice(0, 10);
      }
      
      const res = await updateProject(activeWorkspace.id, project.id, userId, project.updated_at, patch);
      if (res.success) {
        load();
      } else {
        toast.error(res.error || 'Failed to update project status.');
        setRows(prev => prev.map(r => r.id === project.id ? { ...r, status: originalStatus } : r));
      }
    } catch (e: any) {
      toast.error(e.message || 'An unexpected error occurred.');
      setRows(prev => prev.map(r => r.id === project.id ? { ...r, status: originalStatus } : r));
    }
  };

  const filtered = rows.filter((r) =>
    (statusFilter === 'all' || r.status === statusFilter) &&
    (healthFilter === 'all' || r.health === healthFilter),
  );

  const kanbanColumns: ProjectStatus[] = ['not_started','planning','in_progress','waiting_client','internal_review','client_review','completed'];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Manage delivery projects from approved quotations to completion."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/60 shadow-sm">
              <button onClick={() => handleViewChange('kanban')} className={classNames('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200', view === 'kanban' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50')}>
                <Kanban className="h-4 w-4" />
                <span>Board</span>
              </button>
              <button onClick={() => handleViewChange('table')} className={classNames('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200', view === 'table' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50')}>
                <TableIcon className="h-4 w-4" />
                <span>Table</span>
              </button>
            </div>
            {can(role, 'project.create') && (
              <Button onClick={() => setShowCreate(true)} className="shadow-sm">
                <Plus className="h-4 w-4 mr-1" /> New project
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44 bg-slate-50 border-slate-200 font-medium">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </Select>
        <Select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} className="w-40 bg-slate-50 border-slate-200 font-medium">
          <option value="all">All health</option>
          {HEALTHS.map((h) => <option key={h} value={h}>{h.replace(/_/g, ' ')}</option>)}
        </Select>
      </div>

      {loading ? (
        view === 'kanban' ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex w-80 shrink-0 flex-col rounded-[14px] border border-slate-200 bg-slate-50/40 space-y-3">
                <div className="border-b border-slate-200/60 px-4 py-3.5 bg-white/50 rounded-t-[14px]">
                  <div className="h-5 w-24 bg-slate-200 rounded animate-pulse" />
                </div>
                <div className="p-3 space-y-3">
                  <div className="h-32 w-full bg-white border border-slate-100 rounded-xl animate-pulse" />
                  <div className="h-32 w-full bg-white border border-slate-100 rounded-xl animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <LoadingState />
        )
      ) :
        error ? <ErrorState message={error} onRetry={load} /> :
        rows.length === 0 ? (
          <EmptyState icon={<FolderKanban className="h-10 w-10" />} title="No projects yet" description="Create a project manually or convert an approved quotation." action={can(role, 'project.create') && <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> New project</Button>} />
        ) : view === 'table' ? (
          <ProjectTable 
            rows={filtered} 
            onRowClick={(p) => navigate(`/projects/${p.id}`)} 
            onEdit={can(role, 'project.update') ? setEditingProject : undefined}
            onAction={can(role, 'project.update') ? handleAction : undefined}
            onComplete={can(role, 'project.complete') ? setConfirmComplete : undefined}
            onCancel={can(role, 'project.update') ? setConfirmCancel : undefined}
          />
        ) : (
          <ProjectKanban 
            rows={filtered} 
            columns={kanbanColumns} 
            onCardClick={(p) => navigate(`/projects/${p.id}`)} 
            onEdit={can(role, 'project.update') ? setEditingProject : undefined}
            onAction={can(role, 'project.update') ? handleAction : undefined}
            onComplete={can(role, 'project.complete') ? setConfirmComplete : undefined}
            onCancel={can(role, 'project.update') ? setConfirmCancel : undefined}
            onDelete={can(role, 'project.delete') ? setConfirmDelete : undefined}
            onMove={handleMove}
            canUpdate={can(role, 'project.update')}
          />
        )
      }

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={(id) => navigate(`/projects/${id}`)} />}
      
      {editingProject && activeWorkspace && (
        <ProjectEditModal
          project={editingProject}
          workspaceId={activeWorkspace.id}
          userId={user?.id ?? ''}
          onClose={() => setEditingProject(null)}
          onSaved={(updated) => {
            setEditingProject(null);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmComplete}
        onClose={() => setConfirmComplete(null)}
        onConfirm={() => confirmComplete && handleComplete(confirmComplete)}
        title="Complete Project"
        message={`Are you sure you want to mark ${confirmComplete?.project_number} as completed?`}
        confirmLabel="Complete"
      />

      <ConfirmDialog
        open={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={() => confirmCancel && handleCancel(confirmCancel)}
        title="Cancel Project"
        message={`Are you sure you want to cancel ${confirmCancel?.project_number}?`}
        confirmLabel="Cancel Project"
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title="Delete Project"
        message={`Are you sure you want to permanently delete ${confirmDelete?.project_number}? This action cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

function ActionsMenu({ p, onEdit, onAction, onComplete, onCancel, onDelete }: { p: Project; onEdit?: (p: Project) => void; onAction?: (p: Project, a: any) => void; onComplete?: (p: Project) => void; onCancel?: (p: Project) => void; onDelete?: (p: Project) => void; }) {
  if (!onEdit) return null; // read-only viewer
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {p.status === 'not_started' && (
        <>
          {onAction && <button onClick={() => onAction(p, 'start')} title="Start Project" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 transition-colors"><PlayCircle className="h-4 w-4" /></button>}
          {onEdit && <button onClick={() => onEdit(p)} title="Edit" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"><Edit2 className="h-4 w-4" /></button>}
          {onDelete && <button onClick={() => onDelete(p)} title="Delete Project" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 transition-colors"><Trash2 className="h-4 w-4" /></button>}
        </>
      )}
      
      {(p.status === 'in_progress' || p.status === 'planning' || p.status === 'waiting_client' || p.status === 'internal_review' || p.status === 'client_review') && (
        <>
          {onEdit && <button onClick={() => onEdit(p)} title="Edit" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"><Edit2 className="h-4 w-4" /></button>}
          {onAction && <button onClick={() => onAction(p, 'hold')} title="Put On Hold" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-amber-600 transition-colors"><Pause className="h-4 w-4" /></button>}
          {onComplete && <button onClick={() => onComplete(p)} title="Complete Project" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 transition-colors"><CheckCircle2 className="h-4 w-4" /></button>}
        </>
      )}

      {p.status === 'on_hold' && (
        <>
          {onAction && <button onClick={() => onAction(p, 'resume')} title="Resume Project" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 transition-colors"><PlayCircle className="h-4 w-4" /></button>}
          {onEdit && <button onClick={() => onEdit(p)} title="Edit" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"><Edit2 className="h-4 w-4" /></button>}
          {onCancel && <button onClick={() => onCancel(p)} title="Cancel Project" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 transition-colors"><XCircle className="h-4 w-4" /></button>}
        </>
      )}

      {p.status === 'completed' && onAction && (
        <button onClick={() => onAction(p, 'reopen')} title="Reopen Project" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"><RotateCcw className="h-4 w-4" /></button>
      )}
      
      {p.status === 'cancelled' && onAction && (
        <button onClick={() => onAction(p, 'reopen')} title="Reopen Project" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"><RotateCcw className="h-4 w-4" /></button>
      )}
    </div>
  );
}

function ProjectTable({ rows, onRowClick, onEdit, onAction, onComplete, onCancel, onDelete }: { rows: (Project & { client_name?: string })[]; onRowClick: (p: Project) => void; onEdit?: (p: Project) => void; onAction?: (p: Project, a: any) => void; onComplete?: (p: Project) => void; onCancel?: (p: Project) => void; onDelete?: (p: Project) => void; }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Billing</th>
              {onEdit && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => (
              <tr key={p.id} onClick={() => onRowClick(p)} className="cursor-pointer hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.project_number}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{p.title}</td>
                <td className="px-4 py-3 text-slate-600">{p.client_name}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} tone={STATUS_TONE[p.status]} /></td>
                <td className="px-4 py-3"><StatusBadge status={p.health} tone={HEALTH_TONE[p.health]} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${p.progress}%` }} />
                    </div>
                    <span className="text-xs text-slate-500">{p.progress}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDate(p.target_completion_date)}</td>
                <td className="px-4 py-3"><span className="text-xs text-slate-600 capitalize">{p.billing_status.replace(/_/g, ' ')}</span></td>
                {(onEdit || onAction) && (
                  <td className="px-4 py-3 text-right">
                    <ActionsMenu p={p} onEdit={onEdit} onAction={onAction} onComplete={onComplete} onCancel={onCancel} onDelete={onDelete} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ProjectKanban({ rows, columns, onCardClick, onEdit, onAction, onComplete, onCancel, onDelete, onMove, canUpdate }: { rows: (Project & { client_name?: string })[]; columns: ProjectStatus[]; onCardClick: (p: Project) => void; onEdit?: (p: Project) => void; onAction?: (p: Project, a: any) => void; onComplete?: (p: Project) => void; onCancel?: (p: Project) => void; onDelete?: (p: Project) => void; onMove?: (project: Project, targetStatus: ProjectStatus) => void; canUpdate?: boolean; }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const projectId = active.id as string;
    const targetStatus = over.id as ProjectStatus;
    
    const project = rows.find(r => r.id === projectId);
    if (project && project.status !== targetStatus && onMove) {
      onMove(project, targetStatus);
    }
  };

  const activeProject = activeId ? rows.find(r => r.id === activeId) : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const items = rows.filter((r) => r.status === col);
          return (
            <KanbanColumn key={col} id={col} title={col.replace(/_/g, ' ')} count={items.length}>
              {items.map((p) => (
                <KanbanCard key={p.id} p={p} onCardClick={onCardClick} onEdit={onEdit} onAction={onAction} onComplete={onComplete} onCancel={onCancel} onDelete={onDelete} canDrag={!!canUpdate} />
              ))}
              {items.length === 0 && <div className="py-4 text-center text-xs text-slate-400">No projects</div>}
            </KanbanColumn>
          );
        })}
      </div>
      <DragOverlay>
        {activeProject ? (
          <KanbanCardContent p={activeProject} onCardClick={() => {}} canDrag={!!canUpdate} isOverlay={true} onEdit={onEdit} onAction={onAction} onComplete={onComplete} onCancel={onCancel} onDelete={onDelete} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({ id, title, count, children }: { id: string, title: string, count: number, children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={classNames(
      "flex w-80 shrink-0 flex-col rounded-[14px] border transition-all duration-200", 
      isOver ? "border-blue-400 bg-blue-50/50 shadow-sm" : "border-slate-200 bg-slate-50/40 hover:bg-slate-50/80"
    )}>
      <div className="flex items-center justify-between border-b border-slate-200/60 px-4 py-3.5 bg-white/50 rounded-t-[14px]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700 capitalize tracking-wide">{title}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">{count}</span>
        </div>
      </div>
      <div className="space-y-3 p-3 min-h-[150px]">
        {children}
      </div>
    </div>
  );
}

function KanbanCardContent({ p, onCardClick, onEdit, onAction, onComplete, onCancel, onDelete, canDrag, isOverlay, dragRef, style, isDragging, attributes, listeners }: { p: Project & { client_name?: string }; onCardClick: (p: Project) => void; onEdit?: (p: Project) => void; onAction?: (p: Project, a: any) => void; onComplete?: (p: Project) => void; onCancel?: (p: Project) => void; onDelete?: (p: Project) => void; canDrag: boolean; isOverlay?: boolean; dragRef?: any; style?: any; isDragging?: boolean; attributes?: any; listeners?: any; }) {
  return (
      <div 
      ref={dragRef} 
      style={style} 
      {...(canDrag && !isOverlay ? attributes : {})}
      {...(canDrag && !isOverlay ? listeners : {})}
      className={classNames(
        "group relative rounded-xl border bg-white p-4 shadow-sm transition-all duration-200", 
        isDragging && !isOverlay ? "opacity-30 scale-95" : "opacity-100", 
        isOverlay ? "border-blue-500 shadow-2xl cursor-grabbing ring-1 ring-blue-500/20 rotate-2" : "border-slate-200 hover:border-slate-300 hover:shadow-md cursor-pointer",
        canDrag && !isOverlay ? "cursor-grab active:cursor-grabbing" : ""
      )} 
      onClick={(e) => {
        if (!isOverlay) {
          // Prevent click if we are dragging
          if (isDragging) return;
          onCardClick(p);
        }
      }}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div className="text-xs font-mono font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{p.project_number}</div>
        </div>
        {!isOverlay && <ActionsMenu p={p} onEdit={onEdit} onAction={onAction} onComplete={onComplete} onCancel={onCancel} onDelete={onDelete} />}
      </div>
      <div className="mt-1 text-sm font-bold text-slate-800 leading-snug line-clamp-2">{p.title}</div>
      <div className="mt-1.5 text-xs font-medium text-slate-500 flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">
          {p.client_name?.charAt(0).toUpperCase() || 'C'}
        </div>
        <span className="truncate">{p.client_name}</span>
      </div>
      
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <StatusBadge status={p.health} tone={HEALTH_TONE[p.health]} />
          <span className="text-xs font-bold text-slate-600">{p.progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${p.progress}%` }} />
        </div>
      </div>
    </div>
  );
}

function KanbanCard({ p, onCardClick, onEdit, onAction, onComplete, onCancel, onDelete, canDrag }: { p: Project & { client_name?: string }; onCardClick: (p: Project) => void; onEdit?: (p: Project) => void; onAction?: (p: Project, a: any) => void; onComplete?: (p: Project) => void; onCancel?: (p: Project) => void; onDelete?: (p: Project) => void; canDrag: boolean; }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: p.id, data: p, disabled: !canDrag });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return <KanbanCardContent p={p} onCardClick={onCardClick} onEdit={onEdit} onAction={onAction} onComplete={onComplete} onCancel={onCancel} onDelete={onDelete} canDrag={canDrag} isOverlay={false} dragRef={setNodeRef} style={style} isDragging={isDragging} attributes={attributes} listeners={listeners} />;
}

export function CreateProjectModal({ onClose, onCreated, preselectQuotationId }: { onClose: () => void; onCreated: (id: string) => void; preselectQuotationId?: string }) {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [targetDate, setTargetDate] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; role: string; email: string; full_name: string }[]>([]);
  const [quotation, setQuotation] = useState<{ id: string; subject: string; total: number; client_id: string } | null>(null);

  useEffect(() => {
    if (!activeWorkspace) return;
    supabase.from('clients').select('*').eq('workspace_id', activeWorkspace.id).eq('is_deleted', false).order('created_at', { ascending: false })
      .then(({ data }) => setClients((data ?? []) as Client[]));
    import('@/lib/projectData').then(({ fetchTeamUsers }) => fetchTeamUsers(activeWorkspace.id).then(setMembers));
    if (preselectQuotationId) {
      supabase.from('quotations').select('id, subject, total, client_id').eq('id', preselectQuotationId).maybeSingle()
        .then(({ data }) => { if (data) { setQuotation(data as typeof quotation); setClientId(data.client_id ?? ''); setTitle(data.subject ?? ''); } });
    }
  }, [activeWorkspace, preselectQuotationId]);

  const submit = async () => {
    if (!activeWorkspace || !title.trim()) return;
    setBusy(true);
    setError(null);

    if (quotation) {
      const { data, error: rpcErr } = await supabase.rpc('convert_quotation_to_project', {
        p_workspace_id: activeWorkspace.id,
        p_quotation_id: quotation.id,
        p_project_number: await nextProjectNumber(activeWorkspace.id),
        p_title: title.trim(),
        p_project_manager_id: managerId || user?.id || '',
        p_start_date: startDate,
        p_target_date: targetDate || null,
      });
      if (rpcErr) { setError(describeDbError(rpcErr)); setBusy(false); return; }
      const proj = data as Project;
      await addProjectActivity(activeWorkspace.id, proj.id, 'project_created', { actorId: user?.id ?? null, title: 'Project created from quotation' });
      if (proj.client_id) await addTimelineEvent(activeWorkspace.id, proj.client_id, 'project_created', { title: 'Project created', description: proj.title, actorId: user?.id ?? null, relatedEntityType: 'project', relatedEntityId: proj.id });
      await addAuditLog(activeWorkspace.id, user?.id ?? null, 'project', proj.id, 'create', { changeSummary: `Converted quotation to project ${proj.project_number}` });
      setBusy(false);
      onCreated(proj.id);
      return;
    }

    if (clientId) {
      const { data: existing } = await supabase
        .from('projects')
        .select('id')
        .eq('workspace_id', activeWorkspace.id)
        .eq('client_id', clientId)
        .ilike('title', title.trim())
        .eq('is_deleted', false)
        .maybeSingle();

      if (existing) {
        setError("A project with this title already exists for this client.");
        setBusy(false);
        return;
      }
    }

    const pnum = await nextProjectNumber(activeWorkspace.id);
    const { data, error: insErr } = await supabase.from('projects').insert({
      workspace_id: activeWorkspace.id, project_number: pnum, title: title.trim(),
      client_id: clientId || null, project_manager_id: managerId || null,
      start_date: startDate, target_completion_date: targetDate || null,
      description: description || null, priority, category: category || null,
      status: 'not_started', health: 'on_track', billing_status: 'not_applicable',
      created_by: user?.id ?? null,
    }).select().single();
    if (insErr) { setError(describeDbError(insErr)); setBusy(false); return; }
    const proj = data as Project;
    await addProjectActivity(activeWorkspace.id, proj.id, 'project_created', { actorId: user?.id ?? null, title: 'Project created' });
    if (clientId) await addTimelineEvent(activeWorkspace.id, clientId, 'project_created', { title: 'Project created', description: proj.title, actorId: user?.id ?? null, relatedEntityType: 'project', relatedEntityId: proj.id });
    await addAuditLog(activeWorkspace.id, user?.id ?? null, 'project', proj.id, 'create', { changeSummary: `Created project ${pnum}` });
    setBusy(false);
    onCreated(proj.id);
  };

  const canCreate = can(role, 'project.create');

  return (
    <Modal open={true} onClose={onClose} title={quotation ? 'Convert quotation to project' : 'New project'} size="lg">
      <div className="space-y-4">
        {quotation && (
          <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
            Converting approved quotation: {quotation.subject}
          </div>
        )}
        <Field label="Project title" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Website redesign for Client X" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Client">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={!!quotation}>
              <option value="">— Select —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.business_name ?? c.contact_person}</option>)}
            </Select>
          </Field>
          <Field label="Project manager">
            <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">— Assign —</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Start date" required>
            <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Target completion">
            <TextInput type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </Select>
          </Field>
        </div>
        <Field label="Category">
          <TextInput value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Web Development, Branding, etc." />
        </Field>
        {!quotation && (
          <Field label="Description">
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief project description…" />
          </Field>
        )}
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !title.trim() || !canCreate}>{busy ? 'Creating…' : 'Create project'}</Button>
        </div>
      </div>
    </Modal>
  );
}
