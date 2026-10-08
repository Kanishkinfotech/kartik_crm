import { describeDbError } from '@/lib/dbError';
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import type { Client, CommunicationRecord } from '@/lib/types';
import { Button, Card, LoadingState, ErrorState, EmptyState, StatusBadge, Select, TextInput } from '@/components/ui';
import { Mail, MessageCircle, Send, Inbox, AlertCircle, Clock, Search } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { SendEmailModal } from './SendEmailModal';
import { SendWhatsAppModal } from './SendWhatsAppModal';

const STATUS_TONES: Record<string, 'info'|'success'|'neutral'|'warning'|'brand'|'danger'> = {
  sent: 'success',
  delivered: 'success',
  read: 'success',
  received: 'success',
  failed: 'danger',
  bounced: 'danger',
  queued: 'info',
  sending: 'info',
  draft: 'neutral',
  cancelled: 'neutral',
};

export function CommunicationTab({ client }: { client: Client }) {
  const { activeWorkspace } = useWorkspace();
  const [records, setRecords] = useState<CommunicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'whatsapp'>('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [search, setSearch] = useState('');

  const [showEmail, setShowEmail] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspace || !client) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('communication_records')
      .select('*')
      .eq('workspace_id', activeWorkspace.id)
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });

    if (error) setError(describeDbError(error));
    else setRecords((data ?? []) as CommunicationRecord[]);
    setLoading(false);
  }, [activeWorkspace, client]);

  useEffect(() => { load(); }, [load]);

  const filtered = records.filter(r => {
    if (channelFilter !== 'all' && r.channel !== channelFilter) return false;
    if (directionFilter !== 'all' && r.direction !== directionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.subject?.toLowerCase().includes(q) && !r.message_body?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const getIcon = (channel: string, direction: string) => {
    if (channel === 'email') return <Mail className="h-4 w-4" />;
    if (channel === 'whatsapp') return <MessageCircle className="h-4 w-4" />;
    if (direction === 'incoming') return <Inbox className="h-4 w-4" />;
    return <Send className="h-4 w-4" />;
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Communication History</h2>
          <p className="text-sm text-slate-500">Emails, WhatsApp messages, and portal interactions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowEmail(true)}>
            <Mail className="h-4 w-4 mr-2" /> Send Email
          </Button>
          <Button onClick={() => setShowWhatsApp(true)}>
            <MessageCircle className="h-4 w-4 mr-2" /> Send WhatsApp
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <TextInput 
          placeholder="Search subject or message..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          className="flex-1"
        />
        <Select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as any)}>
          <option value="all">All Channels</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
        </Select>
        <Select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value as any)}>
          <option value="all">All Directions</option>
          <option value="outgoing">Outgoing</option>
          <option value="incoming">Incoming</option>
        </Select>
      </div>

      <Card className="divide-y divide-slate-100 border border-slate-200">
        {loading ? (
          <div className="p-8">
            <LoadingState />
          </div>
        ) : error ? (
          <div className="p-8">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12">
            <EmptyState 
              icon={<MessageCircle className="h-12 w-12 text-slate-300" />}
              title="No communications yet"
              description="Send an email or WhatsApp message to start the conversation."
            />
          </div>
        ) : (
          filtered.map(r => (
            <div key={r.id} className="p-5 hover:bg-slate-50 transition-colors flex gap-4">
              <div className={`mt-1 h-10 w-10 shrink-0 rounded-full flex items-center justify-center
                ${r.direction === 'incoming' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}
              >
                {getIcon(r.channel, r.direction)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 capitalize">{r.channel}</span>
                      <span className="text-slate-500 text-sm">{r.direction === 'outgoing' ? 'to' : 'from'}</span>
                      <span className="font-medium text-slate-700 text-sm truncate">
                        {r.direction === 'outgoing' ? (client.primary_email || client.primary_phone) : 'Workspace'}
                      </span>
                    </div>
                    {r.subject && <div className="text-sm font-medium text-slate-900 mt-1">{r.subject}</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={r.status} tone={STATUS_TONES[r.status] || 'neutral'} />
                    <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(r.created_at)}</span>
                  </div>
                </div>
                <div className="mt-2 text-sm text-slate-600 line-clamp-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {r.message_body || 'No message content'}
                </div>
              </div>
            </div>
          ))
        )}
      </Card>

      {/* Modals */}
      {showEmail && client.primary_email && (
        <SendEmailModal
          open={showEmail}
          onClose={() => setShowEmail(false)}
          to={client.primary_email}
          toName={client.business_name || client.contact_person}
          onSent={() => { setShowEmail(false); load(); }}
        />
      )}
      {showEmail && !client.primary_email && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm p-6 shadow-xl relative overflow-hidden text-center">
             <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 mb-4">
               <AlertCircle className="h-6 w-6 text-amber-600" />
             </div>
             <h3 className="text-lg font-semibold text-slate-900 mb-2">No Email Address</h3>
             <p className="text-sm text-slate-500 mb-6">Please add an email address to this client before sending emails.</p>
             <Button onClick={() => setShowEmail(false)} className="w-full">Close</Button>
          </Card>
        </div>
      )}

      {showWhatsApp && (
        <SendWhatsAppModal
          open={showWhatsApp}
          onClose={() => setShowWhatsApp(false)}
          toPhone={client.whatsapp_number || client.primary_phone}
          clientId={client.id}
          onSent={() => { setShowWhatsApp(false); load(); }}
        />
      )}
    </div>
  );
}
