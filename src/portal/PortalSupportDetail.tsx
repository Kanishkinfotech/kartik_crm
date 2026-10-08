import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { usePortal } from '@/lib/portal';
import { useRouter } from '@/lib/router';
import { Card, LoadingState, StatusBadge, Button } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';

export function PortalSupportDetail({ ticketId }: { ticketId: string }) {
  const { activeMembership } = usePortal();
  const { navigate } = useRouter();
  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!activeMembership || !ticketId) return;

    const [tRes, cRes] = await Promise.all([
      supabase.from('support_tickets').select('*').eq('id', ticketId).eq('client_id', activeMembership.client_id).maybeSingle(),
      supabase.from('support_ticket_comments').select('*, created_by_user:auth.users(email)').eq('ticket_id', ticketId).eq('is_internal', false).order('created_at', { ascending: true })
    ]);

    if (!tRes.data) {
      toast.error('Ticket not found.');
      navigate('/portal/support');
      return;
    }

    setTicket(tRes.data);
    setComments(cRes.data || []);
    setLoading(false);
    setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [activeMembership, ticketId, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('support_ticket_comments').insert({
        ticket_id: ticketId,
        workspace_id: ticket.workspace_id,
        body: newComment,
        is_internal: false,
        created_by_membership: activeMembership!.id
      });
      if (error) throw error;
      setNewComment('');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  if (loading || !ticket) return <LoadingState />;

  return (
    <div className="space-y-6 max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center gap-3 flex-shrink-0">
        <button onClick={() => navigate('/portal/support')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 line-clamp-1">{ticket.subject}</h1>
            <StatusBadge status={ticket.status} tone={ticket.status === 'resolved' || ticket.status === 'closed' ? 'success' : ticket.status === 'open' ? 'warning' : 'info'} />
          </div>
          <p className="mt-1 text-slate-500 font-mono text-sm">{ticket.ticket_number} • {ticket.category}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Ticket original description */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
          <div className="flex gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">Me</div>
            <div>
              <div className="text-sm font-medium text-slate-900 mb-1">Me <span className="text-slate-400 font-normal ml-2">{formatDate(ticket.created_at)}</span></div>
              <div className="text-slate-700 whitespace-pre-wrap">{ticket.description}</div>
            </div>
          </div>
        </div>

        {/* Comments stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {comments.map((comment) => {
            const isClient = !!comment.created_by_membership;
            return (
              <div key={comment.id} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">{isClient ? 'ME' : 'SU'}</div>
                <div>
                  <div className="text-sm font-medium text-slate-900 mb-1">
                    {isClient ? 'Me' : 'Support Team'} 
                    <span className="text-slate-400 font-normal ml-2">{formatDate(comment.created_at)}</span>
                  </div>
                  <div className="text-slate-700 whitespace-pre-wrap">{comment.body}</div>
                </div>
              </div>
            );
          })}
          <div ref={commentsEndRef} />
        </div>

        {/* Reply box */}
        <div className="p-4 border-t border-slate-200 bg-white flex-shrink-0">
          {ticket.status === 'closed' || ticket.status === 'resolved' ? (
            <div className="text-center text-slate-500 text-sm py-2">
              This ticket is closed. Please open a new ticket if you need further assistance.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Type your reply..."
                className="flex-1 rounded-lg border-slate-300 border py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <Button type="submit" disabled={submitting || !newComment.trim()}>
                {submitting ? 'Sending...' : <Send className="w-4 h-4" />}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
