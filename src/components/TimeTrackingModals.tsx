import { describeDbError } from '@/lib/dbError';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, TaskTimeLog } from '@/lib/types';
import {
  Button,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  Select,
  TextInput,
  TextArea,
  ConfirmDialog,
} from '@/components/ui';
import { Trash2, Edit2 } from 'lucide-react';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------
// Start Timer Modal
// ---------------------------------------------------------
export function StartTimerModal({
  tasks,
  initialTaskId,
  workspaceId,
  userId,
  onClose,
  onStarted,
}: {
  tasks: (Task & { project_title?: string | null })[];
  initialTaskId?: string;
  workspaceId: string;
  userId: string;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [taskId, setTaskId] = useState(initialTaskId || tasks[0]?.id || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    if (!taskId) { setError('Select a task'); return; }
    setBusy(true);
    
    // Check if another timer is running
    const { data: running } = await supabase.from('task_time_logs').select('id').eq('user_id', userId).is('end_time', null).limit(1);
    if (running && running.length > 0) {
      setError('Another timer is already running.');
      setBusy(false);
      return;
    }
    
    const t = tasks.find(x => x.id === taskId);

    const { error: insErr } = await supabase.from('task_time_logs').insert({
      workspace_id: workspaceId,
      user_id: userId,
      task_id: taskId,
      project_id: t?.project_id || null,
      log_date: todayISO(),
      start_time: new Date().toISOString(),
      description: note,
      is_billable: true,
      approval_status: 'pending'
    });

    if (insErr) { setError(describeDbError(insErr)); setBusy(false); return; }
    onStarted();
  };

  return (
    <Modal open={true} title="Start Timer" onClose={onClose}>
      <div className="space-y-4">
        {error && <ErrorState message={error} />}
        <Field label="Task">
          <Select value={taskId} onChange={e => setTaskId(e.target.value)}>
            <option value="">Select task...</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.task_number} - {t.title}</option>)}
          </Select>
        </Field>
        <Field label="Note (optional)">
          <TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="What are you working on?" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleStart} disabled={busy || !taskId}>Start Timer</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------
// Log Time Modal (Manual Entry)
// ---------------------------------------------------------
export function LogTimeModal({
  tasks,
  workspaceId,
  userId,
  onClose,
  onLogged,
  editEntry,
}: {
  tasks: (Task & { project_title?: string | null })[];
  workspaceId: string;
  userId: string;
  onClose: () => void;
  onLogged: () => void;
  editEntry?: TaskTimeLog;
}) {
  const [taskId, setTaskId] = useState(editEntry?.task_id || tasks[0]?.id || '');
  const [date, setDate] = useState(editEntry?.log_date || todayISO());
  
  const initHours = editEntry?.duration_minutes ? Math.floor(editEntry.duration_minutes / 60) : 0;
  const initMins = editEntry?.duration_minutes ? editEntry.duration_minutes % 60 : 0;
  
  const [hours, setHours] = useState(initHours);
  const [minutes, setMinutes] = useState(initMins);
  const [note, setNote] = useState(editEntry?.description || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!taskId) { setError('Select a task'); return; }
    if (!date) { setError('Date is required'); return; }
    
    const duration = hours * 60 + minutes;
    if (duration <= 0) { setError('Duration must be greater than zero'); return; }
    
    setBusy(true);
    const t = tasks.find(x => x.id === taskId);
    
    const payload = {
      workspace_id: workspaceId,
      user_id: userId,
      task_id: taskId,
      project_id: t?.project_id || null,
      log_date: date,
      duration_minutes: duration,
      description: note,
    };

    let opError;
    if (editEntry) {
      const { error: updErr } = await supabase.from('task_time_logs').update(payload).eq('id', editEntry.id);
      opError = updErr;
    } else {
      const { error: insErr } = await supabase.from('task_time_logs').insert({
        ...payload,
        is_billable: true,
        approval_status: 'pending'
      });
      opError = insErr;
    }

    if (opError) { setError(describeDbError(opError)); setBusy(false); return; }
    onLogged();
  };

  return (
    <Modal open={true} title={editEntry ? "Edit Time Entry" : "Log Time"} onClose={onClose}>
      <div className="space-y-4">
        {error && <ErrorState message={error} />}
        <Field label="Task">
          <Select value={taskId} onChange={e => setTaskId(e.target.value)}>
            <option value="">Select task...</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.task_number} - {t.title}</option>)}
          </Select>
        </Field>
        <Field label="Date">
          <TextInput type="date" value={date} onChange={e => setDate(e.target.value)} max={todayISO()} />
        </Field>
        
        <div className="flex gap-4">
          <div className="flex-1">
            <Field label="Hours">
              <TextInput type="number" min="0" max="23" value={hours} onChange={e => setHours(parseInt(e.target.value) || 0)} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Minutes">
              <TextInput type="number" min="0" max="59" value={minutes} onChange={e => setMinutes(parseInt(e.target.value) || 0)} />
            </Field>
          </div>
        </div>

        <Field label="Note (optional)">
          <TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="Describe work done" />
        </Field>
        
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy || !taskId}>Save Entry</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------
// Today's Entries Modal
// ---------------------------------------------------------
export function TodayEntriesModal({
  workspaceId,
  userId,
  onClose,
  tasks,
  onEntriesChanged,
}: {
  workspaceId: string;
  userId: string;
  onClose: () => void;
  tasks: (Task & { project_title?: string | null })[];
  onEntriesChanged: () => void;
}) {
  const [entries, setEntries] = useState<(TaskTimeLog & { tasks?: { title: string; task_number: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editEntry, setEditEntry] = useState<TaskTimeLog | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadEntries = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('task_time_logs')
      .select('*, tasks(title, task_number)')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('log_date', todayISO())
      .not('end_time', 'is', null)
      .order('created_at', { ascending: false });
    
    setEntries(data || []);
    setLoading(false);
  };

  useEffect(() => { loadEntries(); }, [workspaceId, userId]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('task_time_logs').delete().eq('id', deleteId);
    setDeleteId(null);
    loadEntries();
    onEntriesChanged();
  };

  return (
    <Modal open={true} title="Today's Time Entries" onClose={onClose} size="lg">
      <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
        {loading ? <LoadingState /> : entries.length === 0 ? (
          <div className="py-8 text-center text-slate-500">No completed time entries today.</div>
        ) : (
          <div className="space-y-2">
            {entries.map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    <span className="font-mono text-slate-500 text-xs mr-2">{e.tasks?.task_number}</span>
                    {e.tasks?.title}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {Math.floor((e.duration_minutes || 0) / 60)}h {(e.duration_minutes || 0) % 60}m 
                    {e.description && <span className="ml-2 text-slate-400">· {e.description}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditEntry(e)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-white" title="Edit">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleteId(e.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-white" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editEntry && (
        <LogTimeModal
          tasks={tasks}
          workspaceId={workspaceId}
          userId={userId}
          editEntry={editEntry}
          onClose={() => setEditEntry(null)}
          onLogged={() => { setEditEntry(null); loadEntries(); onEntriesChanged(); }}
        />
      )}
      
      {deleteId && (
        <ConfirmDialog
          open={true}
          title="Delete Entry"
          message="Are you sure you want to delete this time entry? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onClose={() => setDeleteId(null)}
          danger
        />
      )}
    </Modal>
  );
}
