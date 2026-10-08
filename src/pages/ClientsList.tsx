import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { addTimelineEvent, addAuditLog, nextEntityNumber } from '@/lib/data';
import type { Client, ClientStatus } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, type BadgeTone, Modal, Field, TextInput, TextArea, Select, ConfirmDialog } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { Plus, Users, Search } from 'lucide-react';
import { ClientEditModal } from '@/components/ClientEditModal';
import { formatCurrency, formatDate } from '@/lib/format';

const STATUS_TONE: Record<ClientStatus, BadgeTone> = {
  prospect: 'info',
  active: 'success',
  inactive: 'neutral',
  on_hold: 'warning',
  completed: 'brand',
  lost: 'neutral',
  blacklisted: 'danger',
};

const STATUS_OPTIONS: ClientStatus[] = ['prospect', 'active', 'inactive', 'on_hold', 'completed', 'lost', 'blacklisted'];

const EMPTY_FORM = {
  client_type: 'business' as 'individual' | 'business',
  business_name: '',
  contact_person: '',
  primary_phone: '',
  whatsapp_number: '',
  primary_email: '',
  secondary_email: '',
  website: '',
  industry: '',
  lead_source: '',
  status: 'prospect' as ClientStatus,
  billing_address: '',
  shipping_address: '',
  city: '',
  state: '',
  country: 'India',
  pincode: '',
  gst_registered: false,
  gstin: '',
  pan: '',
  tax_treatment: '',
  default_currency: 'INR',
  payment_terms: '',
  internal_notes: '',
  tags: '',
};



export function ClientsList() {
  const { activeWorkspace } = useWorkspace();
  const { navigate } = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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
    let merged = clientList;

    setClients(merged);
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const columns: Column<Client>[] = [
    {
      key: 'name', header: 'Client',
      sortValue: (c) => c.contact_person ?? c.business_name,
      render: (c) => (
        <div>
          <div className="font-semibold text-slate-900">{c.contact_person || c.business_name}</div>
          <div className="text-xs text-slate-500 font-medium">{c.business_name && c.business_name !== c.contact_person ? c.business_name : c.primary_phone}</div>
        </div>
      ),
    },
    { key: 'number', header: 'Number', sortValue: (c) => c.client_number, render: (c) => <span className="font-mono text-xs text-slate-500">{c.client_number}</span> },
    { key: 'phone', header: 'Phone', render: (c) => <span className="text-slate-600">{c.primary_phone}</span> },
    { key: 'email', header: 'Email', render: (c) => <span className="text-slate-600">{c.primary_email ?? '—'}</span> },
    { key: 'city', header: 'City', sortValue: (c) => c.city ?? '', render: (c) => <span className="text-slate-600">{c.city ?? '—'}</span> },
    { key: 'status', header: 'Status', sortValue: (c) => c.status, render: (c) => <StatusBadge status={c.status} tone={STATUS_TONE[c.status]} /> },
    { key: 'created', header: 'Created', sortValue: (c) => c.created_at, render: (c) => <span className="text-slate-500">{formatDate(c.created_at)}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Manage your client profiles, contacts and relationships."
        actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New client</Button>}
      />

      {loading ? <LoadingState /> :
        error ? <ErrorState message={error} onRetry={load} /> :
        clients.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="No clients yet"
            description="Create your first client to start building quotations and invoices."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New client</Button>}
          />
        ) : (
          <Card className="p-4">
            <DataTable
              columns={columns}
              rows={clients}
              rowKey={(c) => c.id}
              onRowClick={(c) => navigate(`/clients/${c.id}`)}
              searchKeys={(c) => `${c.business_name ?? ''} ${c.contact_person} ${c.primary_phone} ${c.primary_email ?? ''} ${c.client_number} ${c.city ?? ''}`}
              empty="No clients match your search."
            />
          </Card>
        )
      }

      {showCreate && activeWorkspace && (
        <ClientEditModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onSaved={(c) => { setShowCreate(false); navigate(`/clients/${c.id}`); }}
          workspaceId={activeWorkspace.id}
        />
      )}
    </div>
  );
}

export { formatCurrency };

