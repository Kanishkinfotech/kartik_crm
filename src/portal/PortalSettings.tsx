import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePortal } from '@/lib/portal';
import { Card, Button, TextInput, LoadingState } from '@/components/ui';
import { toast } from 'sonner';

export function PortalSettings() {
  const { activeMembership } = usePortal();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');

  const load = useCallback(async () => {
    if (!activeMembership?.client_contact_id) return;
    setLoading(true);
    const { data } = await supabase
      .from('client_contacts')
      .select('*')
      .eq('id', activeMembership.client_contact_id)
      .single();

    if (data) {
      setName(data.name || '');
      setTitle(data.title || '');
      setPhone(data.phone || '');
    }
    setLoading(false);
  }, [activeMembership]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.rpc('portal_update_profile', {
        p_name: name,
        p_title: title,
        p_phone: phone
      });
      if (error) throw error;
      toast.success('Profile updated successfully');
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  if (loading) return <LoadingState />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Portal Settings</h1>
        <p className="mt-1 text-slate-500">Manage your profile and communication preferences.</p>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Contact Profile</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <TextInput value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Job Title</label>
            <TextInput value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
            <TextInput value={phone} onChange={e => setPhone(e.target.value)} type="tel" />
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Security</h3>
        <p className="text-sm text-slate-600 mb-4">You are currently logged in securely via a magic link. To log out of all active sessions, use the sign out button below.</p>
        <Button variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => supabase.auth.signOut()}>
          Sign out of Portal
        </Button>
      </Card>
    </div>
  );
}
