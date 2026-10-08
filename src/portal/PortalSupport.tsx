import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePortal } from '@/lib/portal';
import { useRouter } from '@/lib/router';
import { Card, LoadingState, StatusBadge, EmptyState, Button, Modal, TextInput } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { formatDate } from '@/lib/format';
import { LifeBuoy, Plus } from 'lucide-react';
import { toast } from 'sonner';

export function PortalSupport() {
  const { activeMembership } = usePortal();
  const { navigate } = useRouter();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New ticket state
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState('General');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    if (!activeMembership) return;
    setLoading(true);

    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('client_id', activeMembership.client_id)
      .order('created_at', { ascending: false });

    setTickets(data || []);
    setLoading(false);
  }, [activeMembership]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      toast.error('Subject and description are required.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('support_tickets').insert({
        workspace_id: activeMembership!.workspace_id,
        client_id: activeMembership!.client_id,
        created_by_membership: activeMembership!.id,
        ticket_number: `TKT-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`,
        category,
        subject,
        description,
        priority: 'medium',
        status: 'open'
      });
      if (error) throw error;
      toast.success('Ticket created successfully');
      setShowNew(false);
      setSubject('');
      setDescription('');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  const columns: Column<any>[] = [
    { key: 'num', header: 'ID', render: (t) => <span className="font-mono text-sm text-slate-700">{t.ticket_number}</span> },
    { key: 'subject', header: 'Subject', render: (t) => (
      <div>
        <div className="font-medium text-slate-900">{t.subject}</div>
        <div className="text-xs text-slate-500">{t.category}</div>
      </div>
    ) },
    { key: 'created', header: 'Created', render: (t) => <span className="text-slate-500">{formatDate(t.created_at)}</span> },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} tone={t.status === 'resolved' || t.status === 'closed' ? 'success' : t.status === 'open' ? 'warning' : 'info'} /> },
  ];

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Support Tickets</h1>
          <p className="mt-1 text-slate-500">Need help? Open a ticket and our team will get back to you.</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Ticket
        </Button>
      </div>

      <Card className="p-4">
        {tickets.length === 0 ? (
          <EmptyState icon={<LifeBuoy className="w-8 h-8" />} title="No support tickets" description="You haven't opened any support tickets yet." />
        ) : (
          <DataTable
            columns={columns}
            rows={tickets}
            rowKey={t => t.id}
            onRowClick={(t) => navigate(`/portal/support/${t.id}`)}
          />
        )}
      </Card>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New Support Ticket">
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full rounded-lg border-slate-300 border py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option>General</option>
              <option>Billing</option>
              <option>Technical Issue</option>
              <option>Project Clarification</option>
              <option>Access Issue</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
            <TextInput value={subject} onChange={e => setSubject(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
              rows={4}
              className="w-full rounded-lg border-slate-300 border py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Describe your issue or question..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Ticket'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
