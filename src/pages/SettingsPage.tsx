import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { addAuditLog } from '@/lib/data';
import type { WorkspaceMember, WorkspaceBranding } from '@/lib/types';
import { Button, Card, ErrorState, LoadingState, PageHeader, Field, TextInput, TextArea } from '@/components/ui';
import { Save, Building2, Users } from 'lucide-react';
import { can } from '@/lib/permissions';
import { WorkspaceBilling } from '@/components/WorkspaceBilling';
import { ClientCustomizationsSettings } from '@/components/ClientCustomizationsSettings';

import { IntegrationSettings } from '@/pages/IntegrationSettings';
import { AutomationSettingsPage } from '@/pages/AutomationSettingsPage';
import { AISettings } from '@/pages/AISettings';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', accounts: 'Accounts', sales: 'Sales',
  project_manager: 'Project Manager', team_member: 'Team Member', viewer: 'Viewer',
};

export function SettingsPage({ initialTab = 'general' }: { initialTab?: 'general' | 'customizations' | 'integrations' | 'automations' | 'ai' | 'billing' }) {
  const { activeWorkspace, role, refresh } = useWorkspace();
  const { user } = useAuth();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [branding, setBranding] = useState<WorkspaceBranding>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'customizations' | 'integrations' | 'automations' | 'ai' | 'billing'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const canManage = can(role, 'settings.manage');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError(null);
    const { data: mbs } = await supabase.from('workspace_members').select('*').eq('workspace_id', activeWorkspace.id).order('joined_at');
    setMembers((mbs ?? []) as WorkspaceMember[]);
    setBranding((activeWorkspace.branding ?? {}) as WorkspaceBranding);
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const saveBranding = async () => {
    if (!activeWorkspace || !canManage) return;
    setSaving(true);
    const { error } = await supabase.from('workspaces').update({ branding }).eq('id', activeWorkspace.id);
    if (error) { setError(describeDbError(error)); setSaving(false); return; }
    await addAuditLog(activeWorkspace.id, user?.id ?? null, 'workspace_config', activeWorkspace.id, 'update', { changeSummary: 'Updated workspace branding' });
    await refresh();
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const set = <K extends keyof WorkspaceBranding>(k: K, v: WorkspaceBranding[K]) => setBranding((b) => ({ ...b, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Settings & Workspace Configuration" description="Workspace branding, integrations, automation safeguards, AI, and billing options." />
      </div>

      <div className="border-b border-slate-200 overflow-x-auto">
        <nav className="-mb-px flex space-x-6">
          <button
            onClick={() => setActiveTab('general')}
            className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${
              activeTab === 'general'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            General Branding
          </button>
          <button
            onClick={() => setActiveTab('customizations')}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === 'customizations'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            Global Custom Fields
          </button>
          <button
            onClick={() => setActiveTab('integrations')}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === 'integrations'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            Integrations
          </button>
          <button
            onClick={() => setActiveTab('automations')}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === 'automations'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            Automation Controls
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === 'ai'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            AI Settings
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === 'billing'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            Billing
          </button>
        </nav>
      </div>

      {activeTab === 'customizations' && <ClientCustomizationsSettings />}
      {activeTab === 'integrations' && <IntegrationSettings />}
      {activeTab === 'automations' && <AutomationSettingsPage />}
      {activeTab === 'ai' && <AISettings />}

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><Building2 className="h-4 w-4 text-slate-400" /> Workspace branding</h3>
          <p className="mb-4 text-xs text-slate-400">Appears on quotation and invoice PDFs.</p>
          <div className="space-y-4">
            <Field label="Company name"><TextInput value={branding.companyName ?? activeWorkspace?.name ?? ''} onChange={(e) => set('companyName', e.target.value)} disabled={!canManage} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone"><TextInput value={branding.phone ?? ''} onChange={(e) => set('phone', e.target.value)} disabled={!canManage} /></Field>
              <Field label="Email"><TextInput value={branding.email ?? ''} onChange={(e) => set('email', e.target.value)} disabled={!canManage} /></Field>
            </div>
            <Field label="Address"><TextArea value={branding.address ?? ''} onChange={(e) => set('address', e.target.value)} disabled={!canManage} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="GSTIN"><TextInput value={branding.gstin ?? ''} onChange={(e) => set('gstin', e.target.value)} disabled={!canManage} /></Field>
              <Field label="PAN"><TextInput value={branding.pan ?? ''} onChange={(e) => set('pan', e.target.value)} disabled={!canManage} /></Field>
            </div>
            <Field label="UPI ID"><TextInput value={branding.upiId ?? ''} onChange={(e) => set('upiId', e.target.value)} disabled={!canManage} /></Field>
            <Field label="Signatory name"><TextInput value={branding.signatoryName ?? ''} onChange={(e) => set('signatoryName', e.target.value)} disabled={!canManage} /></Field>
            <Field label="Footer text"><TextInput value={branding.footerText ?? ''} onChange={(e) => set('footerText', e.target.value)} disabled={!canManage} /></Field>
            {canManage && (
              <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
                <Button onClick={saveBranding} disabled={saving}>{saving ? 'Saving…' : <><Save className="h-4 w-4" /> Save branding</>}</Button>
                {savedMsg && <span className="text-sm text-emerald-600">Saved</span>}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><Users className="h-4 w-4 text-slate-400" /> Team members</h3>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">{m.user_id.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div className="font-medium text-slate-700">{m.user_id === user?.id ? 'You' : m.user_id.slice(0, 8)}</div>
                    <div className="text-xs text-slate-400">{ROLE_LABELS[m.role] ?? m.role}</div>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${m.member_status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{m.member_status}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-400">Member invitation and role management will be available in a later phase.</p>
        </Card>
      </div>
      )}

      {activeTab === 'billing' && (
        <WorkspaceBilling />
      )}
    </div>
  );
}
