import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePortal } from '@/lib/portal';
import { Card, LoadingState, StatusBadge, EmptyState, Button, Modal, TextInput } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { formatDate } from '@/lib/format';
import { FileEdit, Plus } from 'lucide-react';
import { toast } from 'sonner';

export function PortalChangeRequests() {
  const { activeMembership } = usePortal();
  const [requests, setRequests] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New CR state
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');

  const load = useCallback(async () => {
    if (!activeMembership) return;
    setLoading(true);

    const [crRes, pRes] = await Promise.all([
      supabase.from('change_requests').select('*, projects(title)').eq('client_id', activeMembership.client_id).order('created_at', { ascending: false }),
      supabase.from('projects').select('id, title').eq('client_id', activeMembership.client_id).eq('status', 'active')
    ]);

    setRequests(crRes.data || []);
    setProjects(pRes.data || []);
    if (pRes.data && pRes.data.length > 0) setProjectId(pRes.data[0].id);
    
    setLoading(false);
  }, [activeMembership]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !projectId) {
      toast.error('All fields are required.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('change_requests').insert({
        workspace_id: activeMembership!.workspace_id,
        project_id: projectId,
        client_id: activeMembership!.client_id,
        title,
        description,
        priority,
        status: 'draft',
        impact_analysis: '',
        requested_by_client: true,
        requester_name: 'Client Portal'
      });
      if (error) throw error;
      toast.success('Change request submitted successfully');
      setShowNew(false);
      setTitle('');
      setDescription('');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  const columns: Column<any>[] = [
    { key: 'title', header: 'Change Request', render: (cr) => (
      <div>
        <div className="font-medium text-slate-900">{cr.title}</div>
        <div className="text-xs text-slate-500">{cr.projects?.title}</div>
      </div>
    ) },
    { key: 'priority', header: 'Priority', render: (cr) => <span className="capitalize text-slate-600 text-sm">{cr.priority}</span> },
    { key: 'created', header: 'Requested On', render: (cr) => <span className="text-slate-500">{formatDate(cr.created_at)}</span> },
    { key: 'status', header: 'Status', render: (cr) => <StatusBadge status={cr.status} tone={cr.status === 'approved' ? 'success' : cr.status === 'rejected' ? 'danger' : 'neutral'} /> },
  ];

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Change Requests</h1>
          <p className="mt-1 text-slate-500">Request scope changes to active projects.</p>
        </div>
        <Button onClick={() => setShowNew(true)} disabled={projects.length === 0}>
          <Plus className="w-4 h-4 mr-2" />
          New Request
        </Button>
      </div>

      <Card className="p-4">
        {requests.length === 0 ? (
          <EmptyState icon={<FileEdit className="w-8 h-8" />} title="No change requests" description="You haven't requested any project changes yet." />
        ) : (
          <DataTable
            columns={columns}
            rows={requests}
            rowKey={cr => cr.id}
          />
        )}
      </Card>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Request a Change">
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full rounded-lg border-slate-300 border py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500"
              required
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="w-full rounded-lg border-slate-300 border py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Summary of Change</label>
            <TextInput value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g., Add e-commerce payment gateway" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Detailed Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
              rows={4}
              className="w-full rounded-lg border-slate-300 border py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Why is this change needed? What exactly needs to be changed?"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Request'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
