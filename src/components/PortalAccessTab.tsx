import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { Card, Button, StatusBadge, EmptyState, LoadingState, Field, Select, ConfirmDialog, TextInput } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { toast } from 'sonner';
import { Mail, Shield, UserX, UserCheck, RefreshCw } from 'lucide-react';

export function PortalAccessTab({ clientId }: { clientId: string }) {
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviting, setInviting] = useState(false);
  const [selectedContact, setSelectedContact] = useState('');
  const [selectedRole, setSelectedRole] = useState('viewer');
  const [generatedLink, setGeneratedLink] = useState<{url: string, email: string} | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);

    const [c, m, i] = await Promise.all([
      supabase.from('client_contacts').select('*').eq('client_id', clientId).eq('is_deleted', false),
      supabase.from('client_portal_memberships').select('*, client_contacts(first_name, last_name, email, phone)').eq('client_id', clientId),
      supabase.from('client_portal_invitations').select('*, client_contacts(first_name, last_name, email)').eq('client_id', clientId).order('created_at', { ascending: false }),
    ]);

    setContacts(c.data || []);
    setMemberships(m.data || []);
    setInvitations(i.data || []);
    setLoading(false);
  }, [activeWorkspace, clientId]);

  useEffect(() => { load(); }, [load]);

  const handleInvite = async () => {
    if (!activeWorkspace || !selectedContact) return;
    setInviting(true);
    
    // Check if membership or pending invite already exists
    const exists = memberships.find(m => m.client_contact_id === selectedContact) || 
                   invitations.find(i => i.client_contact_id === selectedContact && i.status === 'sent');
                   
    if (exists) {
      toast.error("Contact already has portal access or a pending invitation.");
      setInviting(false);
      return;
    }

    try {
      // Create invitation record
      const token = crypto.randomUUID(); // Simplistic token for now
      
      const { error } = await supabase.from('client_portal_invitations').insert({
        workspace_id: activeWorkspace.id,
        client_id: clientId,
        client_contact_id: selectedContact,
        portal_role: selectedRole,
        token_hash: token, // Real app would hash this
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      });
      
      if (error) throw error;
      
      const contactObj = contacts.find(c => c.id === selectedContact);
      const email = contactObj?.email || '';
      
      const origin = window.location.origin;
      const inviteUrl = `${origin}/portal/accept-invite?token=${token}&email=${encodeURIComponent(email)}`;
      
      setGeneratedLink({ url: inviteUrl, email });
      
      toast.success("Invitation generated successfully.");
      setSelectedContact('');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
    setInviting(false);
  };

  const handleStatusChange = async (membershipId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('client_portal_memberships').update({ status: newStatus }).eq('id', membershipId);
      if (error) throw error;
      toast.success(`Access ${newStatus}`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) return <LoadingState />;

  const cols: Column<any>[] = [
    { key: 'contact', header: 'Contact', render: (m) => <span className="font-medium text-slate-700">{m.client_contacts?.first_name} {m.client_contacts?.last_name}</span> },
    { key: 'email', header: 'Email', render: (m) => <span className="text-slate-500">{m.client_contacts?.email}</span> },
    { key: 'role', header: 'Portal Role', render: (m) => <span className="capitalize">{m.portal_role.replace('_', ' ')}</span> },
    { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} tone={m.status === 'active' ? 'success' : m.status === 'suspended' ? 'danger' : 'warning'} /> },
    { key: 'actions', header: '', render: (m) => (
        <div className="flex justify-end gap-2">
          {m.status === 'active' ? (
            <Button variant="outline" size="sm" onClick={() => handleStatusChange(m.id, 'suspended')} className="text-rose-600 border-rose-200 hover:bg-rose-50">Suspend</Button>
          ) : m.status === 'suspended' ? (
            <Button variant="outline" size="sm" onClick={() => handleStatusChange(m.id, 'active')} className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">Restore</Button>
          ) : null}
        </div>
      ) 
    },
  ];

  const invCols: Column<any>[] = [
    { key: 'contact', header: 'Contact', render: (i) => <span className="font-medium text-slate-700">{i.client_contacts?.first_name} {i.client_contacts?.last_name}</span> },
    { key: 'email', header: 'Email', render: (i) => <span className="text-slate-500">{i.client_contacts?.email}</span> },
    { key: 'role', header: 'Role', render: (i) => <span className="capitalize">{i.portal_role.replace('_', ' ')}</span> },
    { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} tone={i.status === 'accepted' ? 'success' : i.status === 'expired' ? 'danger' : 'info'} /> },
    { key: 'sent', header: 'Sent At', render: (i) => <span className="text-slate-500">{new Date(i.created_at).toLocaleDateString()}</span> },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h3 className="mb-4 text-lg font-semibold text-slate-800 flex items-center gap-2"><Shield className="w-5 h-5 text-indigo-600"/> Grant Portal Access</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <Field label="Client Contact">
            <Select value={selectedContact} onChange={e => setSelectedContact(e.target.value)}>
              <option value="">Select a contact...</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.email})</option>)}
            </Select>
          </Field>
          <Field label="Portal Role">
            <Select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
              <option value="owner">Client Owner</option>
              <option value="billing">Billing Contact</option>
              <option value="project_approver">Project Approver</option>
              <option value="contributor">Contributor</option>
              <option value="viewer">Viewer</option>
            </Select>
          </Field>
          <div>
            <Button onClick={handleInvite} disabled={!selectedContact || inviting} className="w-full">
              <Mail className="w-4 h-4 mr-2" /> {inviting ? 'Generating...' : 'Generate Invite Link'}
            </Button>
          </div>
        </div>
        
        {generatedLink && (
          <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-lg p-4">
            <h4 className="font-semibold text-indigo-900 flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4" />
              Invitation Link Generated
            </h4>
            <p className="text-sm text-indigo-700 mb-3">
              Copy this secure link and send it to <strong>{generatedLink.email}</strong>. When they open it, they will be prompted to set a password.
            </p>
            <div className="flex gap-2">
              <TextInput value={generatedLink.url} readOnly className="font-mono text-sm" />
              <Button onClick={() => {
                navigator.clipboard.writeText(generatedLink.url);
                toast.success("Link copied to clipboard");
              }} variant="outline" className="shrink-0 bg-white hover:bg-slate-50">
                Copy Link
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-4 text-md font-semibold text-slate-800 px-2">Active Memberships</h3>
        {memberships.length === 0 ? <EmptyState icon={<UserX className="w-8 h-8"/>} title="No active portal users" /> : (
          <DataTable columns={cols} rows={memberships} rowKey={m => m.id} />
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-4 text-md font-semibold text-slate-800 px-2">Pending Invitations</h3>
        {invitations.length === 0 ? <EmptyState icon={<RefreshCw className="w-8 h-8"/>} title="No invitations" /> : (
          <DataTable columns={invCols} rows={invitations} rowKey={i => i.id} />
        )}
      </Card>
    </div>
  );
}
