import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { fetchTeamUsers } from '@/lib/projectData';
import { can } from '@/lib/permissions';
import { classNames } from '@/lib/format';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  type BadgeTone,
} from '@/components/ui';
import { Users2, RefreshCw, Briefcase, ListTodo, Clock, AlertTriangle, CalendarClock } from 'lucide-react';
import type { TaskStatus } from '@/lib/types';

type WorkloadLevel = 'available' | 'balanced' | 'near_capacity' | 'overloaded';

const WORKLOAD_LABEL: Record<WorkloadLevel, string> = {
  available: 'Available',
  balanced: 'Balanced',
  near_capacity: 'Near Capacity',
  overloaded: 'Overloaded',
};

const WORKLOAD_TONE: Record<WorkloadLevel, BadgeTone> = {
  available: 'success',
  balanced: 'info',
  near_capacity: 'warning',
  overloaded: 'danger',
};

// Higher rank = heavier workload; used to sort overloaded first.
const WORKLOAD_RANK: Record<WorkloadLevel, number> = {
  overloaded: 3,
  near_capacity: 2,
  balanced: 1,
  available: 0,
};

// Colored dots per task status (cancelled is excluded by the query).
const TASK_STATUS_DOT: Record<string, string> = {
  backlog: 'bg-slate-400',
  todo: 'bg-slate-500',
  in_progress: 'bg-blue-500',
  waiting_client: 'bg-amber-500',
  blocked: 'bg-rose-500',
  internal_review: 'bg-violet-500',
  client_review: 'bg-cyan-500',
  completed: 'bg-emerald-500',
};

const TASK_STATUSES: TaskStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'waiting_client',
  'blocked',
  'internal_review',
  'client_review',
  'completed',
];

interface MemberWorkload {
  id: string;
  role: string;
  email: string;
  full_name: string;
  projectCount: number;
  taskCount: number;
  tasksByStatus: Record<string, number>;
  dueTodayCount: number;
  overdueCount: number;
  estimatedHours: number;
  loggedHours: number;
  activeTaskCount: number;
  workload: WorkloadLevel;
  activeAttendance: {
    id: string;
    checked_in_at: string;
    current_location_status: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
}

function classifyWorkload(activeCount: number): WorkloadLevel {
  if (activeCount === 0) return 'available';
  if (activeCount < 5) return 'balanced';
  if (activeCount <= 10) return 'near_capacity';
  return 'overloaded';
}

function isSameDay(dateStr: string): boolean {
  const today = new Date();
  const d = new Date(dateStr);
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

async function fetchMemberWorkload(
  wsId: string,
  member: { id: string; role: string; email: string; full_name: string },
): Promise<MemberWorkload> {
  const [tasksRes, logsRes, projectsRes, workspaceMembersRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, status, due_date, estimated_hours')
      .eq('workspace_id', wsId)
      .eq('assigned_to', member.id)
      .neq('status', 'cancelled'),
    supabase
      .from('task_time_logs')
      .select('duration_minutes')
      .eq('workspace_id', wsId)
      .eq('user_id', member.id),
    supabase
      .from('project_members')
      .select('project_id')
      .eq('workspace_id', wsId)
      .eq('user_id', member.id),
    supabase
      .from('workspace_members')
      .select('id, attendance_sessions(id, checked_in_at, current_location_status, check_in_latitude, check_in_longitude)')
      .eq('workspace_id', wsId)
      .eq('user_id', member.id)
      .is('attendance_sessions.checked_out_at', null)
      .limit(1)
      .single()
  ]);

  const tasks = (tasksRes.data ?? []) as Array<{
    id: string;
    status: string;
    due_date: string | null;
    estimated_hours: number | null;
  }>;
  const logs = (logsRes.data ?? []) as Array<{ duration_minutes: number | null }>;
  const projectIds = (projectsRes.data ?? []) as Array<{ project_id: string }>;

  const tasksByStatus: Record<string, number> = {};
  let dueTodayCount = 0;
  let overdueCount = 0;
  let estimatedHours = 0;

  for (const t of tasks) {
    tasksByStatus[t.status] = (tasksByStatus[t.status] ?? 0) + 1;
    if (t.estimated_hours) estimatedHours += t.estimated_hours;
    if (t.due_date && isSameDay(t.due_date)) dueTodayCount += 1;
    if (t.status !== 'completed' && isOverdue(t.due_date)) overdueCount += 1;
  }

  const loggedMinutes = logs.reduce(
    (sum, l) => sum + (l.duration_minutes ?? 0),
    0,
  );

  const taskCount = tasks.length;
  const completedCount = tasksByStatus['completed'] ?? 0;
  const activeTaskCount = taskCount - completedCount;

  const activeAttendanceArray = workspaceMembersRes?.data?.attendance_sessions;
  const activeAttendanceRaw = Array.isArray(activeAttendanceArray) ? activeAttendanceArray[0] : activeAttendanceArray;
  
  const activeAttendance = activeAttendanceRaw ? {
    id: activeAttendanceRaw.id,
    checked_in_at: activeAttendanceRaw.checked_in_at,
    current_location_status: activeAttendanceRaw.current_location_status,
    latitude: activeAttendanceRaw.check_in_latitude,
    longitude: activeAttendanceRaw.check_in_longitude,
  } : null;

  return {
    id: member.id,
    role: member.role,
    email: member.email,
    full_name: member.full_name,
    projectCount: new Set(projectIds.map((p) => p.project_id)).size,
    taskCount,
    tasksByStatus,
    dueTodayCount,
    overdueCount,
    estimatedHours,
    loggedHours: loggedMinutes / 60,
    activeTaskCount,
    workload: classifyWorkload(activeTaskCount),
    activeAttendance,
  };
}

export function TeamWorkload() {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'accounts' | 'sales' | 'project_manager' | 'team_member' | 'viewer'>('team_member');
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError(null);
    try {
      const team = await fetchTeamUsers(activeWorkspace.id);
      if (team.length === 0) {
        setMembers([]);
        setLoading(false);
        return;
      }
      const results = await Promise.all(
        team.map((m) => fetchMemberWorkload(activeWorkspace.id, m)),
      );
      setMembers(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workload data.');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    load();
  }, [load]);

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    setInviteSuccess(null);

    const displayName = inviteName.trim() || inviteEmail.split('@')[0];

    try {
      // Create team member entry in workspace_members
      const newMember = {
        workspace_id: activeWorkspace.id,
        user_id: `usr_${Date.now().toString(36)}`,
        role: inviteRole,
        member_status: 'active',
        invited_by: user?.id || null,
        joined_at: new Date().toISOString(),
      };

      await supabase.from('workspace_members').insert(newMember);

      // Store in workspace team cache for dropdowns
      try {
        const cacheKey = `k1_team_${activeWorkspace.id}`;
        const existingCache = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        const updatedCache = [
          ...existingCache,
          {
            id: newMember.user_id,
            full_name: `${displayName} (${inviteRole.replace('_', ' ')})`,
            email: inviteEmail,
            role: inviteRole,
          },
        ];
        localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
      } catch {
        // Ignore storage error
      }

      setInviteSuccess(`Successfully added ${displayName} (${inviteRole.replace(/_/g, ' ').toUpperCase()}) to team!`);
      setInviteEmail('');
      setInviteName('');
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteSuccess(null);
        load();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to add team member');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    if (!activeWorkspace) return;
    const { error: err } = await supabase
      .from('workspace_members')
      .update({ role: newRole })
      .eq('workspace_id', activeWorkspace.id)
      .eq('user_id', memberId);

    if (err) {
      setError('Failed to update member role');
    } else {
      load();
    }
  };

  const sortedMembers = useMemo(
    () =>
      [...members].sort(
        (a, b) =>
          WORKLOAD_RANK[b.workload] - WORKLOAD_RANK[a.workload] ||
          b.activeTaskCount - a.activeTaskCount,
      ),
    [members],
  );

  const canView = can(role, 'team.view') || can(role, 'task.view_all');
  const canManageTeam = can(role, 'team.manage') || role === 'owner' || role === 'admin';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team & Role Management"
        description="Workspace member assignments, granular RBAC roles, and workload status."
        actions={
          <div className="flex gap-2">
            {canManageTeam && (
              <Button onClick={() => setShowInviteModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs">
                <Users2 className="h-4 w-4 mr-1.5" /> + Invite / Add Team Member
              </Button>
            )}
            <Button variant="outline" onClick={load} disabled={loading} className="text-xs">
              <RefreshCw className={classNames('h-4 w-4 mr-1', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        }
      />

      {!canView ? (
        <EmptyState
          icon={<Users2 className="h-10 w-10" />}
          title="No access"
          description="You don't have permission to view the team workload."
        />
      ) : loading ? (
        <LoadingState label="Loading team workload…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : sortedMembers.length === 0 ? (
        <EmptyState
          icon={<Users2 className="h-10 w-10" />}
          title="No team members"
          description="There are no active members in this workspace yet."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedMembers.map((m) => (
            <WorkloadCard key={m.id} member={m} canManage={canManageTeam} onRoleChange={handleRoleChange} />
          ))}
        </div>
      )}

      {/* Invite Team Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md w-full rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users2 className="h-5 w-5 text-blue-600" /> Invite / Add Team Member
              </h3>
              <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-slate-600 text-sm">×</button>
            </div>

            <form onSubmit={handleInviteMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="e.g. rahul@company.com"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assign Role (Permissions)</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="admin">Admin (Full Access except billing)</option>
                  <option value="project_manager">Project Manager (Projects & Tasks)</option>
                  <option value="sales">Sales Executive (Leads & Quotations)</option>
                  <option value="accounts">Accounts & Finance (Invoices & Payments)</option>
                  <option value="team_member">Team Member (Assigned Tasks & Work Reports)</option>
                  <option value="viewer">Viewer (Read-Only)</option>
                </select>
              </div>

              {inviteSuccess && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs font-bold text-emerald-800">
                  ✓ {inviteSuccess}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowInviteModal(false)} className="text-xs">Cancel</Button>
                <Button type="submit" disabled={inviting || !inviteEmail} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs">
                  {inviting ? 'Adding...' : 'Add Team Member'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <span className={classNames('text-slate-400', tone)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{value}</div>
        <div className="truncate text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function WorkloadCard({ member, canManage, onRoleChange }: { member: MemberWorkload; canManage?: boolean; onRoleChange?: (id: string, role: string) => void }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      {/* Header: identity + workload badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">
            {member.full_name}
          </h3>
          <p className="truncate text-xs text-slate-500">{member.email}</p>
        </div>
        <StatusBadge
          status={WORKLOAD_LABEL[member.workload]}
          tone={WORKLOAD_TONE[member.workload]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canManage && onRoleChange ? (
          <select
            value={member.role}
            onChange={(e) => onRoleChange(member.id, e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-100"
          >
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="project_manager">Project Manager</option>
            <option value="sales">Sales</option>
            <option value="accounts">Accounts</option>
            <option value="team_member">Team Member</option>
            <option value="viewer">Viewer</option>
          </select>
        ) : (
          <StatusBadge status={member.role} tone="neutral" />
        )}
        <StatusBadge
          status={`${member.activeTaskCount} active`}
          tone="neutral"
        />
        {member.activeAttendance && (
          <StatusBadge 
            status={member.activeAttendance.current_location_status === 'live' ? 'Checked in • Live' : 'Checked in • Stale'} 
            tone={member.activeAttendance.current_location_status === 'live' ? 'success' : 'warning'} 
          />
        )}
      </div>

      {/* Top-line counts */}
      <div className="grid grid-cols-2 gap-2">
        <Stat
          icon={<Briefcase className="h-4 w-4" />}
          label="Projects"
          value={member.projectCount}
        />
        <Stat
          icon={<ListTodo className="h-4 w-4" />}
          label="Total tasks"
          value={member.taskCount}
        />
        <Stat
          icon={<CalendarClock className="h-4 w-4" />}
          label="Due today"
          value={member.dueTodayCount}
          tone={member.dueTodayCount > 0 ? 'text-amber-500' : undefined}
        />
        <Stat
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Overdue"
          value={member.overdueCount}
          tone={member.overdueCount > 0 ? 'text-rose-500' : undefined}
        />
      </div>

      {/* Tasks by status with colored dots */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Tasks by status
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {TASK_STATUSES.map((s) => {
            const count = member.tasksByStatus[s] ?? 0;
            if (count === 0) return null;
            return (
              <div key={s} className="flex items-center gap-1.5">
                <span
                  className={classNames(
                    'h-2 w-2 rounded-full',
                    TASK_STATUS_DOT[s] ?? 'bg-slate-400',
                  )}
                />
                <span className="text-xs capitalize text-slate-600">
                  {s.replace(/_/g, ' ')}
                </span>
                <span className="text-xs font-semibold text-slate-900">{count}</span>
              </div>
            );
          })}
          {member.taskCount === 0 && (
            <span className="text-xs text-slate-400">No assigned tasks</span>
          )}
        </div>
      </div>

      {/* Hours summary */}
      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-4 w-4 text-slate-400" />
          Estimated
          <span className="font-semibold text-slate-900">
            {member.estimatedHours.toFixed(1)}h
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          Logged
          <span className="font-semibold text-slate-900">
            {member.loggedHours.toFixed(1)}h
          </span>
        </div>
      </div>
    </Card>
  );
}

export default TeamWorkload;
