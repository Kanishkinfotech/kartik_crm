import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Project, ProjectStatus, ProjectHealth, BillingStatus, ProjectPriority } from '@/lib/types';
import { fetchTeamUsers, updateProject } from '@/lib/projectData';
import { Modal, Button, Field, TextInput, TextArea, Select } from '@/components/ui';

export type TeamUser = { id: string; role: string; email: string; full_name: string };
export type ClientOption = { id: string; business_name: string; contact_person: string };

const STATUSES: ProjectStatus[] = ['draft', 'not_started', 'planning', 'in_progress', 'waiting_client', 'internal_review', 'client_review', 'on_hold', 'completed', 'cancelled', 'archived'];
const HEALTHS: ProjectHealth[] = ['on_track', 'at_risk', 'delayed', 'blocked'];
const BILLING_STATUSES: BillingStatus[] = ['not_applicable', 'advance_pending', 'partially_billed', 'fully_billed', 'payment_pending', 'payment_completed', 'billing_on_hold'];

export function ProjectEditModal({
  project,
  workspaceId,
  userId,
  onClose,
  onSaved,
}: {
  project: Project;
  workspaceId: string;
  userId: string;
  onClose: () => void;
  onSaved: (updatedProject: Project) => void;
}) {
  const [title, setTitle] = useState(project.title);
  const [clientId, setClientId] = useState(project.client_id || '');
  const [managerId, setManagerId] = useState(project.project_manager_id || '');
  const [priority, setPriority] = useState<ProjectPriority>(project.priority);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [health, setHealth] = useState<ProjectHealth>(project.health);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(project.billing_status);
  const [startDate, setStartDate] = useState(project.start_date || '');
  const [dueDate, setDueDate] = useState(project.target_completion_date || '');
  const [description, setDescription] = useState(project.description || '');

  const [members, setMembers] = useState<TeamUser[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingDeps, setLoadingDeps] = useState(true);
  
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadDeps() {
      try {
        const [membersData, cRes] = await Promise.all([
          fetchTeamUsers(workspaceId),
          supabase.from('clients').select('id, business_name, contact_person').eq('workspace_id', workspaceId).eq('is_deleted', false).order('business_name')
        ]);
        
        if (!active) return;
        
        setMembers(membersData);
        
        if (cRes.data) {
          setClients(cRes.data as ClientOption[]);
        }
      } catch (e) {
        console.error('Failed to load dependencies', e);
      } finally {
        if (active) setLoadingDeps(false);
      }
    }
    loadDeps();
    return () => { active = false; };
  }, [workspaceId]);

  const submit = async () => {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setBusy(true);
    setError(null);

    const patch: Partial<Project> = {
      title: title.trim(),
      client_id: clientId || null,
      project_manager_id: managerId || null,
      priority,
      status,
      health,
      billing_status: billingStatus,
      start_date: startDate || null,
      target_completion_date: dueDate || null,
      description: description.trim() || null,
    };

    try {
      const res = await updateProject(workspaceId, project.id, userId, project.updated_at, patch);
      if (!res.success) {
        setError(res.error || 'Failed to update project.');
        setBusy(false);
        return;
      }
      onSaved(res.data as Project);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setBusy(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Edit Project: ${project.project_number}`} size="lg">
      <div className="space-y-4">
        {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600">{error}</div>}

        <Field label="Title" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} placeholder="e.g. Website Redesign" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={busy || loadingDeps}>
              <option value="">— Internal / No Client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.business_name || c.contact_person}</option>
              ))}
            </Select>
          </Field>

          <Field label="Project Manager">
            <Select value={managerId} onChange={(e) => setManagerId(e.target.value)} disabled={busy || loadingDeps}>
              <option value="">— Unassigned —</option>
              {members.filter(m => m.full_name || m.email).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email || 'Unnamed member'} {m.role === 'owner' ? '— Owner' : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} disabled={busy}>
              {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
            </Select>
          </Field>

          <Field label="Health">
            <Select value={health} onChange={(e) => setHealth(e.target.value as ProjectHealth)} disabled={busy}>
              {HEALTHS.map(h => <option key={h} value={h}>{h.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
            </Select>
          </Field>

          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as ProjectPriority)} disabled={busy}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </Field>

          <Field label="Billing Status">
            <Select value={billingStatus} onChange={(e) => setBillingStatus(e.target.value as BillingStatus)} disabled={busy}>
              {BILLING_STATUSES.map(b => <option key={b} value={b}>{b.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
            </Select>
          </Field>

          <Field label="Start Date">
            <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={busy} />
          </Field>
          <Field label="Target Completion">
            <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={busy} />
          </Field>
        </div>

        <Field label="Description">
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
            placeholder="Add project details..."
            rows={4}
          />
        </Field>

        <div className="mt-6 flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !title.trim() || loadingDeps}>
            {busy ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
