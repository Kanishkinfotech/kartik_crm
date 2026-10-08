import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Client, ClientStatus } from '@/lib/types';
import { Button, Card, LoadingState, ErrorState, EmptyState, StatusBadge, PageHeader, TextInput, Select, Modal, ConfirmDialog } from '@/components/ui';
import { Search, Plus, Users, ArrowLeft, MoreHorizontal, FileText, Briefcase, IndianRupee, MessageSquare, Shield, Activity, Clock, Bot, Sparkles } from 'lucide-react';
import { ClientDetailTabs } from './ClientDetailTabs';
import { ClientEditModal } from '@/components/ClientEditModal';
import { generateAIContent } from '@/lib/ai';
import { addTimelineEvent } from '@/lib/data';

const STATUS_TONE: Record<ClientStatus, 'info'|'success'|'neutral'|'warning'|'brand'|'danger'> = {
  prospect: 'info',
  active: 'success',
  inactive: 'neutral',
  on_hold: 'warning',
  completed: 'brand',
  lost: 'neutral',
  blacklisted: 'danger',
};



export function ClientsMasterDetail({ clientId }: { clientId?: string }) {
  const { activeWorkspace } = useWorkspace();
  const { navigate } = useRouter();
  const { user } = useAuth();
  
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [showStatusClient, setShowStatusClient] = useState(false);
  const [newStatus, setNewStatus] = useState<ClientStatus>('prospect');
  const [showArchiveClient, setShowArchiveClient] = useState(false);
  const [showDeleteClient, setShowDeleteClient] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ title: string; content: string } | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setError(null);
    if (activeWorkspace.id === '00000000-0000-0000-0000-000000000000' || (typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true')) {
      setClients([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let clientList: Client[] = [];
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (!error && data) {
        clientList = data as Client[];
      }
    } catch (e) {
      // ignore
    }

    setClients(clientList);
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdateStatus = async () => {
    if (!selectedClient || !activeWorkspace) return;
    setIsBusy(true);
    const { error } = await supabase
      .from('clients')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', selectedClient.id)
      .eq('workspace_id', activeWorkspace.id);
      
    if (error) {
      alert(error.message);
    } else {
      await addTimelineEvent(activeWorkspace.id, selectedClient.id, 'client_status_changed', {
        title: 'Status updated',
        description: `Status changed from ${selectedClient.status} to ${newStatus}`,
        actorId: user?.id ?? null,
      });
      await load();
      setShowStatusClient(false);
    }
    setIsBusy(false);
  };

  const handleArchive = async () => {
    if (!selectedClient || !activeWorkspace) return;
    setIsBusy(true);
    const { error } = await supabase
      .from('clients')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', selectedClient.id)
      .eq('workspace_id', activeWorkspace.id);
      
    if (error) {
      alert(error.message);
    } else {
      await addTimelineEvent(activeWorkspace.id, selectedClient.id, 'client_archived', {
        title: 'Client archived',
        description: 'The client was archived.',
        actorId: user?.id ?? null,
      });
      await load();
      navigate('/clients');
      setShowArchiveClient(false);
    }
    setIsBusy(false);
  };

  const handleDelete = async () => {
    if (!selectedClient || !activeWorkspace) return;
    setIsBusy(true);
    
    // Check dependencies
    const { count: invoiceCount, error: invError } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', selectedClient.id)
      .eq('workspace_id', activeWorkspace.id);
      
    const { count: paymentCount, error: payError } = await supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', selectedClient.id)
      .eq('workspace_id', activeWorkspace.id);
      
    if (invError || payError) {
      alert('Error checking dependencies.');
      setIsBusy(false);
      return;
    }
    
    if ((invoiceCount && invoiceCount > 0) || (paymentCount && paymentCount > 0)) {
      alert(`Cannot delete client. There are ${invoiceCount} invoices and ${paymentCount} payments linked to this client.`);
      setShowDeleteClient(false);
      setIsBusy(false);
      return;
    }
    
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', selectedClient.id)
      .eq('workspace_id', activeWorkspace.id);
      
    if (error) {
      alert(error.message);
    } else {
      await load();
      navigate('/clients');
      setShowDeleteClient(false);
    }
    setIsBusy(false);
  };


  useEffect(() => { load(); }, [load]);

  const runAI = async (action: 'summary' | 'suggest') => {
    if (!activeWorkspace || !selectedClient) return;
    setAiLoading(true);
    try {
      const context = JSON.stringify({
        client: { ...selectedClient, id: undefined, workspace_id: undefined }
      });
      const response = await generateAIContent({
        workspace_id: activeWorkspace.id,
        feature_name: `client_${action}`,
        module_name: "clients",
        userInstruction: action === 'summary' 
          ? "Summarise this client's profile, financial standing, and recent activity in 3-4 bullet points."
          : "Suggest the next best action for this client based on their recent activity and outstanding balances. Be concise.",
        context,
        systemInstruction: "You are a CRM assistant helping an account manager. Provide a concise, professional summary or suggested action based on the client data.",
      });
      if (response.success && response.content) {
        setAiResult({ title: action === 'summary' ? 'AI Client Summary' : 'AI Suggested Action', content: response.content });
      } else {
        throw new Error(response.error || "Failed to generate");
      }
    } catch (err: any) {
      alert(err.message);
    }
    setAiLoading(false);
  };

  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchesSearch = search === '' || 
        `${c.business_name ?? ''} ${c.contact_person} ${c.primary_phone} ${c.primary_email ?? ''} ${c.client_number} ${c.city ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [clients, search, statusFilter]);

  const selectedClient = useMemo(() => {
    if (!clientId) return null;
    return clients.find(c => c.id === clientId) || null;
  }, [clients, clientId]);

  const isMobileDetailView = !!clientId;

  return (
    <div className="flex flex-col h-full bg-[#F6F8FC]">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your client profiles, relationships and business activity.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New Client</Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        <div className={`w-full md:w-[370px] shrink-0 border-r border-slate-200 bg-white flex flex-col ${isMobileDetailView ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-slate-200 space-y-3 shrink-0">
            <TextInput
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex gap-2">
              <Select value={statusFilter} onChange={(v) => setStatusFilter(v as any)} className="w-full">
                <option value="all">All Clients</option>
                <option value="prospect">Prospect</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="lost">Lost</option>
                <option value="blacklisted">Blacklisted</option>
              </Select>
            </div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider pt-2">
              {filteredClients.length} {filteredClients.length === 1 ? 'Client' : 'Clients'}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="p-4 text-center text-slate-500 text-sm">Loading clients...</div>
            ) : error ? (
              <div className="p-4 text-center text-red-500 text-sm">{error}</div>
            ) : filteredClients.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                No clients match your criteria.
              </div>
            ) : (
              filteredClients.map(c => {
                const isSelected = c.id === clientId;
                return (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/clients/${c.id}`)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors flex items-start gap-3 relative overflow-hidden
                      ${isSelected ? 'bg-[#F1F7FF] border-blue-200 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50'}
                    `}
                  >
                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />}
                    
                    <div className="h-10 w-10 shrink-0 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-medium text-sm">
                      {(c.contact_person || c.business_name || 'Client').substring(0,2).toUpperCase()}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className={`truncate font-semibold text-sm ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>
                          {c.contact_person || c.business_name}
                        </h3>
                        <StatusBadge status={c.status} tone={STATUS_TONE[c.status]} />
                      </div>
                      
                      {c.business_name && c.business_name !== c.contact_person && (
                        <div className="text-xs font-medium text-slate-600 truncate">{c.business_name}</div>
                      )}
                      
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                        <span className="font-mono">{c.client_number}</span>
                      </div>
                      <div className="truncate text-xs text-slate-500 mt-0.5">
                        {c.primary_email || 'No email'} • {c.primary_phone || 'No phone'}
                      </div>
                      <div className="truncate text-xs text-slate-500 mt-0.5">
                        {c.city || 'No city'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className={`flex-1 flex flex-col bg-[#F6F8FC] min-w-0 ${!isMobileDetailView ? 'hidden md:flex' : 'flex'}`}>
          {!clientId ? (
             <div className="flex-1 flex items-center justify-center p-8">
               <EmptyState
                 icon={<Users className="h-12 w-12 text-slate-300" />}
                 title="Select a client"
                 description="Choose a client from the list to view their details, projects, quotations, and more."
               />
             </div>
          ) : !selectedClient && !loading ? (
             <div className="flex-1 flex items-center justify-center p-8">
               <ErrorState message="Client not found or you don't have access." onRetry={() => navigate('/clients')} />
             </div>
          ) : selectedClient ? (
             <div className="flex-1 flex flex-col min-h-0">
               <div className="md:hidden p-4 border-b border-slate-200 bg-white flex items-center">
                 <button onClick={() => navigate('/clients')} className="flex items-center text-sm font-medium text-slate-600 hover:text-slate-900">
                   <ArrowLeft className="h-4 w-4 mr-2" />
                   Back to Clients
                 </button>
               </div>
               
               <div className="bg-white border-b border-slate-200 p-6 shrink-0">
                 <div className="flex items-start justify-between gap-4">
                   <div className="flex items-start gap-4">
                     <div className="h-16 w-16 shrink-0 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xl">
                        {(selectedClient.contact_person || selectedClient.business_name || 'Client').substring(0,2).toUpperCase()}
                     </div>
                     <div>
                       <div className="flex items-center gap-3">
                         <h2 className="text-2xl font-bold text-slate-900">{selectedClient.contact_person || selectedClient.business_name}</h2>
                         <StatusBadge status={selectedClient.status} tone={STATUS_TONE[selectedClient.status]} />
                       </div>
                       {selectedClient.business_name && selectedClient.business_name !== selectedClient.contact_person && (
                         <div className="text-sm font-semibold text-slate-600 mt-0.5">{selectedClient.business_name}</div>
                       )}
                       <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                         <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">{selectedClient.client_number}</span>
                         {selectedClient.primary_email && <span>{selectedClient.primary_email}</span>}
                         {selectedClient.primary_phone && <span>{selectedClient.primary_phone}</span>}
                         {selectedClient.city && <span>{selectedClient.city}{selectedClient.state ? `, ${selectedClient.state}` : ''}</span>}
                       </div>
                     </div>
                   </div>
                   <div className="flex items-center gap-3">
                     <Button variant="outline" size="sm" onClick={() => setShowEditClient(true)}>
                       Edit Client
                     </Button>
                     <div className="relative group">
                       <Button variant="outline" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                       <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 shadow-lg rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 py-1">
                         <button onClick={() => { setNewStatus(selectedClient.status); setShowStatusClient(true); }} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 text-slate-700">Change Status</button>
                         <button onClick={() => setShowArchiveClient(true)} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 text-slate-700">Archive Client</button>
                         <button onClick={() => setShowDeleteClient(true)} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 text-red-600">Delete Permanently</button>
                       </div>
                     </div>
                   </div>
                 </div>
               </div>

               <div className="flex-1 overflow-y-auto bg-[#F6F8FC]">
                 <ClientDetailTabs client={selectedClient} />
               </div>
             </div>
          ) : (
             <div className="flex-1 flex items-center justify-center p-8">
               <LoadingState />
             </div>
          )}
        </div>

        {/* Create Modal */}
        {showCreate && activeWorkspace && (
          <ClientEditModal
            open={showCreate}
            onClose={() => setShowCreate(false)}
            onSaved={(c) => { 
              setShowCreate(false); 
              load(); // refresh list
              navigate(`/clients/${c.id}`); 
            }}
            workspaceId={activeWorkspace.id}
          />
        )}

        {/* Edit Modal */}
        {showEditClient && activeWorkspace && selectedClient && (
          <ClientEditModal
            open={showEditClient}
            onClose={() => setShowEditClient(false)}
            onSaved={(c) => { 
              setShowEditClient(false); 
              load(); 
            }}
            workspaceId={activeWorkspace.id}
            client={selectedClient}
          />
        )}
        
        {/* Status Modal */}
        {showStatusClient && activeWorkspace && selectedClient && (
          <Modal open={showStatusClient} onClose={() => !isBusy && setShowStatusClient(false)} title="Change Client Status">
            <div className="space-y-4">
              <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as ClientStatus)}>
                <option value="prospect">Prospect</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="lost">Lost</option>
                <option value="blacklisted">Blacklisted</option>
              </Select>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setShowStatusClient(false)} disabled={isBusy}>Cancel</Button>
                <Button onClick={handleUpdateStatus} disabled={isBusy}>{isBusy ? 'Saving...' : 'Update Status'}</Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Archive Modal */}
        {showArchiveClient && selectedClient && (
          <ConfirmDialog
            open={showArchiveClient}
            title="Archive Client"
            message={`Are you sure you want to archive ${selectedClient.business_name || selectedClient.contact_person}? You can restore them later.`}
            confirmLabel={isBusy ? 'Archiving...' : 'Archive Client'}
            onConfirm={handleArchive}
            onClose={() => setShowArchiveClient(false)}
            danger={false}
          />
        )}

        {/* Delete Modal */}
        {showDeleteClient && selectedClient && (
          <ConfirmDialog
            open={showDeleteClient}
            title="Permanently Delete Client"
            message={`Are you sure you want to permanently delete ${selectedClient.business_name || selectedClient.contact_person}? This action cannot be undone, and will fail if the client has associated invoices or payments.`}
            confirmLabel={isBusy ? 'Deleting...' : 'Delete Permanently'}
            onConfirm={handleDelete}
            onClose={() => setShowDeleteClient(false)}
            danger={true}
          />
        )}

        {aiResult && (
          <Modal open={true} onClose={() => setAiResult(null)} title={aiResult.title} size="md">
            <div className="space-y-4">
              <div className="rounded-lg bg-indigo-50/50 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed border border-indigo-100">
                {aiResult.content}
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setAiResult(null)}>Close</Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
