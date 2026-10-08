import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState, Button, Modal, Field, TextInput, Select, TextArea } from '@/components/ui';
import { HelpCircle, Building2, MessageSquare, CheckCircle2, Clock, AlertTriangle, Send, RefreshCw } from 'lucide-react';
import { formatDateTime } from '@/lib/format';

export function AdminSupport() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [newStatus, setNewStatus] = useState<'open' | 'in_progress' | 'resolved' | 'closed'>('resolved');
  const [busy, setBusy] = useState(false);

  const loadTickets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('support_tickets')
      .select('*, workspaces(name, slug)')
      .order('created_at', { ascending: false });

    setTickets(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const handleSendReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) return;
    setBusy(true);

    // Update ticket status and append reply note
    const existingNotes = selectedTicket.admin_notes || '';
    const updatedNotes = `${existingNotes}\n[${new Date().toLocaleString()}] Admin Reply: ${replyMessage.trim()}`.trim();

    const { error } = await supabase
      .from('support_tickets')
      .update({
        status: newStatus,
        admin_notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedTicket.id);

    setBusy(false);
    if (!error) {
      setSelectedTicket(null);
      setReplyMessage('');
      loadTickets();
    } else {
      alert(`Failed to send response: ${error.message}`);
    }
  };

  if (loading) return <LoadingState label="Loading Support Desk..." />;

  const filtered = tickets.filter((t) => statusFilter === 'all' || t.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary flex items-center gap-2">
            <HelpCircle className="h-7 w-7 text-admin-primary" /> Platform Help Desk & Support
          </h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            Triage, resolve, and respond to workspace customer enquiries and issues.
          </p>
        </div>
        <Button variant="outline" onClick={loadTickets} className="gap-2 text-xs">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-admin-border-subtle bg-white px-3 py-2 text-xs text-slate-700 shadow-sm"
        >
          <option value="all">All Ticket Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="bg-admin-bg-surface rounded-xl shadow-sm border border-admin-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-admin-text-secondary">
            <thead className="bg-slate-50 text-admin-text-primary border-b border-admin-border-subtle font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Ticket Details</th>
                <th className="px-6 py-3.5">Workspace</th>
                <th className="px-6 py-3.5">Priority</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Date Submitted</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.length > 0 ? (
                filtered.map((t) => {
                  const wsName = t.workspaces?.name || 'Workspace Customer';

                  let statusBadge = 'bg-blue-100 text-blue-800';
                  if (t.status === 'in_progress') statusBadge = 'bg-amber-100 text-amber-800';
                  if (t.status === 'resolved') statusBadge = 'bg-emerald-100 text-emerald-800';
                  if (t.status === 'closed') statusBadge = 'bg-slate-100 text-slate-700';

                  let priorityBadge = 'text-slate-600 bg-slate-100';
                  if (t.priority === 'high' || t.priority === 'urgent') priorityBadge = 'text-rose-700 bg-rose-100 font-bold';

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-admin-text-primary">{t.subject || 'Support Enquiry'}</div>
                        <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">{t.message}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400" />
                          <span>{wsName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 text-[11px] rounded-full uppercase tracking-wider ${priorityBadge}`}>
                          {t.priority || 'normal'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs rounded-full uppercase font-bold tracking-wider ${statusBadge}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {formatDateTime(t.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedTicket(t);
                            setNewStatus(t.status === 'open' ? 'in_progress' : t.status);
                          }}
                          className="gap-1.5 text-xs"
                        >
                          <MessageSquare className="h-3.5 w-3.5" /> Reply
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs text-slate-400">
                    No active support tickets found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTicket && (
        <Modal open={!!selectedTicket} onClose={() => setSelectedTicket(null)} title={`Support Ticket: ${selectedTicket.subject}`}>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-slate-900">Workspace: {selectedTicket.workspaces?.name}</div>
              <div className="text-slate-600">{selectedTicket.message}</div>
            </div>

            {selectedTicket.admin_notes && (
              <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-100 text-xs font-mono space-y-1 whitespace-pre-wrap">
                <div className="font-bold text-blue-900">Previous Replies:</div>
                <div className="text-blue-800">{selectedTicket.admin_notes}</div>
              </div>
            )}

            <Field label="Update Ticket Status">
              <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as any)}>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>

            <Field label="Admin Reply / Note">
              <TextArea
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder="Type resolution message to workspace owner..."
                rows={4}
              />
            </Field>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="outline" onClick={() => setSelectedTicket(null)}>
                Cancel
              </Button>
              <Button onClick={handleSendReply} disabled={busy}>
                {busy ? 'Sending...' : 'Send Reply & Update Status'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}