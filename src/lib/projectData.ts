import { supabase } from './supabase';
import { addAuditLog } from './data';
import type { Task, Project } from './types';

/** Append a project activity timeline entry (workspace-scoped, append-only). */
export async function addProjectActivity(
  wsId: string,
  projectId: string,
  eventType: string,
  fields: {
    actorId?: string | null;
    title?: string;
    description?: string;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
    previousValue?: string | null;
    newValue?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from('project_activities').insert({
    workspace_id: wsId,
    project_id: projectId,
    event_type: eventType,
    actor_id: fields.actorId ?? null,
    title: fields.title ?? null,
    description: fields.description ?? null,
    related_entity_type: fields.relatedEntityType ?? null,
    related_entity_id: fields.relatedEntityId ?? null,
    previous_value: fields.previousValue ?? null,
    new_value: fields.newValue ?? null,
    reason: fields.reason ?? null,
    metadata: fields.metadata ?? {},
  });
}

/** Create an internal notification for a user within a workspace. */
export async function notifyUser(
  wsId: string,
  userId: string,
  type: string,
  title: string,
  fields: { body?: string; relatedEntityType?: string; relatedEntityId?: string } = {},
): Promise<void> {
  await supabase.from('internal_notifications').insert({
    workspace_id: wsId,
    user_id: userId,
    type,
    title,
    body: fields.body ?? null,
    related_entity_type: fields.relatedEntityType ?? null,
    related_entity_id: fields.relatedEntityId ?? null,
  });
}

/** Fetch workspace members as a lightweight user list for assignment dropdowns. */
export async function fetchTeamUsers(
  wsId: string,
): Promise<{ id: string; role: string; email: string; full_name: string }[]> {
  let cachedTeam: { id: string; role: string; email: string; full_name: string }[] = [];
  try {
    const raw = localStorage.getItem(`k1_team_${wsId}`);
    if (raw) cachedTeam = JSON.parse(raw);
  } catch {
    // Ignore cache error
  }

  const { data: rpcData, error } = await supabase
    .rpc('get_workspace_users', { p_workspace_id: wsId });

  let resultList: { id: string; role: string; email: string; full_name: string }[] = [];

  if (!error && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
    resultList = [...(rpcData as { id: string; role: string; email: string; full_name: string }[])];
  } else {
    // Fallback: Query workspace_members directly
    const { data: membersData } = await supabase
      .from('workspace_members')
      .select('id, user_id, role')
      .eq('workspace_id', wsId);

    if (membersData && membersData.length > 0) {
      resultList = membersData.map((m) => ({
        id: m.user_id || m.id,
        role: m.role || 'team_member',
        email: m.user_id ? `${m.user_id.slice(0, 8)}@workspace` : '',
        full_name: `${m.user_id ? m.user_id.slice(0, 8) : 'Member'} (${(m.role || 'team').replace('_', ' ')})`,
      }));
    }
  }

  // Merge cached team entries so newly invited members always appear
  cachedTeam.forEach((tm) => {
    if (!resultList.some((r) => r.id === tm.id || r.email === tm.email)) {
      resultList.push(tm);
    }
  });

  return resultList;
}

/** Next sequential number for a workspace-scoped entity. */
export async function nextProjectNumber(wsId: string, prefix = 'PRJ'): Promise<string> {
  const { count } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', wsId);
  const seq = (count ?? 0) + 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export async function nextTaskNumber(wsId: string, prefix = 'TSK'): Promise<string> {
  const { count } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', wsId);
  const seq = (count ?? 0) + 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export async function nextCRNumber(wsId: string, prefix = 'CR'): Promise<string> {
  const { count } = await supabase
    .from('change_requests')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', wsId);
  const seq = (count ?? 0) + 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export async function nextReportNumber(wsId: string, prefix = 'WR'): Promise<string> {
  const { count } = await supabase
    .from('work_reports')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', wsId);
  const seq = (count ?? 0) + 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export async function updateTask(
  workspaceId: string,
  taskId: string,
  userId: string,
  originalUpdatedAt: string,
  patch: Partial<Task>
): Promise<{ success: boolean; data?: Task; error?: string }> {
  // 1. Enforce strict allow-list of editable fields to prevent mass assignment
  const allowedFields = [
    'title', 'description', 'project_id', 'milestone_id', 'assigned_to', 
    'priority', 'status', 'start_date', 'due_date', 'progress'
  ];
  
  const safePatch: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (allowedFields.includes(k)) {
      safePatch[k] = v;
    }
  }

  // Auto-correct progress based on status
  if (safePatch.status === 'completed') {
    safePatch.progress = 100;
  }
  
  const newUpdatedAt = new Date().toISOString();
  safePatch.updated_at = newUpdatedAt;

  // 2. Execute update with concurrency protection
  const { data, error, count } = await supabase
    .from('tasks')
    .update(safePatch)
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .select('*, projects(title, project_number)')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // 0 rows returned - either task doesn't exist, wrong workspace, or concurrency conflict
      return { success: false, error: 'This task was updated by another user. Please refresh to see the latest changes.' };
    }
    return { success: false, error: error.message };
  }

  // 3. Log audit history
  if (data) {
    await addAuditLog(workspaceId, userId, 'task', taskId, 'update', {
      changeSummary: 'Task details updated manually',
      // Optionally store the patch differences here if needed
    });
  }

  return { success: true, data: data as any };
}

/**
 * Update an existing project with concurrency protection.
 */
export async function updateProject(
  workspaceId: string,
  projectId: string,
  userId: string,
  originalUpdatedAt: string,
  patch: Partial<Project>
): Promise<{ success: boolean; data?: Project; error?: string }> {
  
  // 1. Sanitize patch payload
  const allowedFields = [
    'title', 'description', 'client_id', 'project_manager_id', 
    'status', 'health', 'priority', 'start_date', 'target_completion_date', 'billing_status'
  ];
  
  const safePatch: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (allowedFields.includes(k)) {
      safePatch[k] = v;
    }
  }

  // Handle completion dates
  if (safePatch.status === 'completed' && !safePatch.actual_completion_date) {
    safePatch.actual_completion_date = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    safePatch.progress = 100;
  }
  if (safePatch.status === 'in_progress' && !safePatch.start_date) {
    safePatch.start_date = new Date().toISOString().split('T')[0];
  }
  
  const newUpdatedAt = new Date().toISOString();
  safePatch.updated_at = newUpdatedAt;

  // 2. Execute update with concurrency protection
  const { data, error } = await supabase
    .from('projects')
    .update(safePatch)
    .eq('id', projectId)
    .eq('workspace_id', workspaceId)
    .select('*, clients(business_name, contact_person)')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return { success: false, error: 'This project was updated by another user. Please refresh to see the latest changes.' };
    }
    return { success: false, error: error.message };
  }

  // 3. Log audit history and project activity
  if (data) {
    await addAuditLog(workspaceId, userId, 'project', projectId, 'update', {
      changeSummary: 'Project details updated manually',
    });
    await addProjectActivity(workspaceId, projectId, 'update', { actorId: userId, title: 'Project details updated manually' });
  }

  return { success: true, data: data as any };
}
