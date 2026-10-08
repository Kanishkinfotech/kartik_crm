import { supabase } from './supabase';
import { useWorkspace } from './workspace';

/**
 * Returns a supabase query builder pre-filtered to the active workspace.
 * Every tenant-owned query must go through this to guarantee workspace isolation.
 */
export function useScopedQuery() {
  const { activeWorkspace } = useWorkspace();
  if (!activeWorkspace) throw new Error('No active workspace');
  const wsId = activeWorkspace.id;

  return {
    wsId,
    from: (table: string) => supabase.from(table).select('*').eq('workspace_id', wsId),
  };
}

/** Insert with the active workspace_id baked in. */
export function useScopedInsert() {
  const { activeWorkspace } = useWorkspace();
  if (!activeWorkspace) throw new Error('No active workspace');
  const wsId = activeWorkspace.id;
  return {
    wsId,
    insert: (table: string, row: Record<string, unknown>) =>
      supabase.from(table).insert({ ...row, workspace_id: wsId }).select(),
  };
}

/** Next sequential number for a given entity, workspace-scoped. */
export async function nextEntityNumber(
  wsId: string,
  table: string,
  prefix: string,
  separator = '-',
): Promise<string> {
  const numberColumn = table === 'leads' ? 'lead_number' : (table === 'clients' ? 'client_number' : (table === 'projects' ? 'project_number' : (table === 'invoices' ? 'invoice_number' : 'id')));
  const { data } = await supabase
    .from(table)
    .select(numberColumn)
    .eq('workspace_id', wsId);
    
  let maxNum = 0;
  if (data && data.length > 0) {
    for (const row of data) {
      const valStr = row[numberColumn];
      if (valStr && typeof valStr === 'string') {
        const match = valStr.match(/\d+/);
        if (match) {
          const val = parseInt(match[0], 10);
          if (!isNaN(val) && val > maxNum) {
            maxNum = val;
          }
        }
      }
    }
  }
  const seq = maxNum + 1;
  return `${prefix}${separator}${String(seq).padStart(4, '0')}`;
}

/** Append a timeline event for a client (workspace-scoped). */
export async function addTimelineEvent(
  wsId: string,
  clientId: string,
  eventType: string,
  fields: { title?: string; description?: string; actorId?: string | null; relatedEntityType?: string; relatedEntityId?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  await supabase.from('client_timeline').insert({
    workspace_id: wsId,
    client_id: clientId,
    event_type: eventType,
    title: fields.title ?? null,
    description: fields.description ?? null,
    actor_id: fields.actorId ?? null,
    related_entity_type: fields.relatedEntityType ?? null,
    related_entity_id: fields.relatedEntityId ?? null,
    metadata: fields.metadata ?? {},
  });
}

/** Write an audit log entry (workspace-scoped). */
export async function addAuditLog(
  wsId: string,
  actorId: string | null,
  entityType: string,
  entityId: string | null,
  action: string,
  fields: { changeSummary?: string; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null },
): Promise<void> {
  await supabase.from('audit_logs').insert({
    workspace_id: wsId,
    actor_id: actorId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    change_summary: fields.changeSummary ?? null,
    before: fields.before ?? null,
    after: fields.after ?? null,
  });
}
