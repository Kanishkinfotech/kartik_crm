import React, { useState, useEffect } from 'react';
import type { Task, TaskPriority, TaskStatus } from '@/lib/types';
import { updateTask } from '@/lib/projectData';
import { Modal, Button, Field, TextInput, TextArea, Select } from '@/components/ui';

export type TeamUser = { id: string; role: string; email: string; full_name: string };
export type ProjectOption = { id: string; title: string; project_number: string };
export type MilestoneOption = { id: string; name: string };

export function TaskEditModal({
  task,
  members,
  projects,
  milestones,
  workspaceId,
  userId,
  onClose,
  onSaved,
}: {
  task: Task;
  members: TeamUser[];
  projects?: ProjectOption[];
  milestones?: MilestoneOption[];
  workspaceId: string;
  userId: string;
  onClose: () => void;
  onSaved: (updatedTask: Task) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [projectId, setProjectId] = useState(task.project_id || '');
  const [milestoneId, setMilestoneId] = useState(task.milestone_id || '');
  const [assigneeId, setAssigneeId] = useState(task.assigned_to || '');
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [dueDate, setDueDate] = useState(task.due_date || '');
  const [startDate, setStartDate] = useState(task.start_date || '');
  const [progress, setProgress] = useState(task.progress.toString());
  const [description, setDescription] = useState(task.description || '');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If project changes, and we don't have milestones for the new project in the modal's current scope,
  // we might want to clear milestoneId. For now, just allow them to pick from whatever milestones are passed.

  const submit = async () => {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setBusy(true);
    setError(null);

    const patch: Partial<Task> = {
      title: title.trim(),
      project_id: projectId || null,
      milestone_id: milestoneId || null,
      assigned_to: assigneeId || null,
      priority,
      status,
      due_date: dueDate || null,
      start_date: startDate || null,
      progress: parseInt(progress, 10) || 0,
      description: description.trim() || null,
    };

    try {
      const res = await updateTask(workspaceId, task.id, userId, task.updated_at, patch);
      if (!res.success) {
        setError(res.error || 'Failed to update task.');
        setBusy(false);
        return;
      }
      onSaved(res.data as Task);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setBusy(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Edit Task: ${task.task_number}`} size="lg">
      <div className="space-y-4">
        {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600">{error}</div>}

        <Field label="Title" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} placeholder="e.g. Design homepage hero" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          {projects && projects.length > 0 && (
            <Field label="Project">
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={busy}>
                <option value="">— No Project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.project_number} - {p.title}</option>
                ))}
              </Select>
            </Field>
          )}

          {milestones && milestones.length > 0 && (
            <Field label="Milestone">
              <Select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} disabled={busy}>
                <option value="">— No Milestone —</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assignee">
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={busy}>
              <option value="">— Unassigned —</option>
              {members.filter(m => m.full_name || m.email).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} disabled={busy}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>

          <Field label="Status">
            <Select value={status} onChange={(e) => {
              const newStatus = e.target.value as TaskStatus;
              setStatus(newStatus);
              if (newStatus === 'completed') setProgress('100');
            }} disabled={busy}>
              <option value="backlog">Backlog</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="in_review">In Review</option>
              <option value="completed">Completed</option>
              <option value="blocked">Blocked</option>
            </Select>
          </Field>

          <Field label="Progress (%)">
            <TextInput
              type="number"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
              disabled={busy || status === 'completed'}
            />
          </Field>

          <Field label="Start Date">
            <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={busy} />
          </Field>
          <Field label="Due Date">
            <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={busy} />
          </Field>
        </div>

        <Field label="Description">
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
            placeholder="Add task details..."
            rows={4}
          />
        </Field>

        <div className="mt-6 flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !title.trim()}>
            {busy ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
