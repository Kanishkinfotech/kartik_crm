import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import type { AutomationSettings } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Field, TextInput, Select, ConfirmDialog } from '@/components/ui';
import { Save, AlertTriangle, Pause, Play, Shield, Clock, Settings as SettingsIcon } from 'lucide-react';
import { can } from '@/lib/permissions';
import { ensureAutomationSettings } from '@/lib/automation';

export function AutomationSettingsPage() {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = useState(false);

  const canView = can(role, 'automation_settings.view');
  const canConfigure = can(role, 'automation_settings.configure');
  const canPauseAll = can(role, 'automation_settings.pause_all');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    await ensureAutomationSettings(activeWorkspace.id);
    const { data, error: err } = await supabase.from('automation_settings').select('*').eq('workspace_id', activeWorkspace.id).maybeSingle();
    if (err) { setError(describeDbError(err)); setLoading(false); return; }
    setSettings(data as AutomationSettings); setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!settings || !activeWorkspace) return;
    setSaving(true);
    const { error: e } = await supabase.from('automation_settings').update({
      timezone: settings.timezone, working_days: settings.working_days, working_hours_start: settings.working_hours_start,
      working_hours_end: settings.working_hours_end, holiday_dates: settings.holiday_dates,
      default_retry_limit: settings.default_retry_limit, default_failure_policy: settings.default_failure_policy,
      require_approval_client_messages: settings.require_approval_client_messages, require_approval_invoice_creation: settings.require_approval_invoice_creation,
      require_approval_project_cancellation: settings.require_approval_project_cancellation, max_automation_depth: settings.max_automation_depth,
      max_actions_per_workflow: settings.max_actions_per_workflow, log_retention_days: settings.log_retention_days,
      enable_outbound_webhooks: settings.enable_outbound_webhooks, updated_at: new Date().toISOString(),
    }).eq('id', settings.id);
    if (e) { setError(describeDbError(e)); setSaving(false); return; }
    await supabase.from('audit_logs').insert({ workspace_id: activeWorkspace.id, actor_id: user?.id ?? null, entity_type: 'automation_settings', entity_id: settings.id, action: 'update', change_summary: 'Automation settings updated' });
    setSaving(false); setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2000);
  };

  const toggleEmergencyPause = async (pause: boolean) => {
    if (!settings || !activeWorkspace) return;
    await supabase.from('automation_settings').update({ emergency_pause_all: pause, emergency_paused_by: pause ? user?.id ?? null : null, emergency_paused_at: pause ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', settings.id);
    await supabase.from('audit_logs').insert({ workspace_id: activeWorkspace.id, actor_id: user?.id ?? null, entity_type: 'automation_settings', entity_id: settings.id, action: pause ? 'emergency_pause_activated' : 'emergency_pause_removed', change_summary: pause ? 'Emergency pause activated' : 'Emergency pause removed' });
    setShowPauseConfirm(false); setShowResumeConfirm(false); load();
  };

  if (!canView) return <ErrorState message="You don't have permission to view automation settings." />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings) return <EmptyState title="Settings not found" />;

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const toggleDay = (d: number) => { const cur = settings.working_days; setSettings({ ...settings, working_days: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() }); };

  return (
    <div className="space-y-6">
      <PageHeader title="Automation Settings" description="Configure workspace automation behaviour, limits, and safety controls." actions={canConfigure && <Button onClick={save} disabled={saving}><Save className="h-4 w-4" /> {saving ? 'Saving…' : savedMsg ? 'Saved!' : 'Save'}</Button>} />

      {canPauseAll && (
        <Card className={`p-5 ${settings.emergency_pause_all ? 'border-rose-300 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className={`h-6 w-6 ${settings.emergency_pause_all ? 'text-rose-600' : 'text-amber-600'}`} />
              <div><h3 className="font-semibold text-slate-900">Emergency Pause</h3><p className="text-sm text-slate-600">{settings.emergency_pause_all ? 'All automations are PAUSED. Payment webhooks are still processed.' : 'Stop all automations immediately. Payment webhooks continue to be verified.'}</p></div>
            </div>
            {settings.emergency_pause_all ? <Button variant="success" onClick={() => setShowResumeConfirm(true)}><Play className="h-4 w-4" /> Resume</Button> : <Button variant="danger" onClick={() => setShowPauseConfirm(true)}><Pause className="h-4 w-4" /> Pause All</Button>}
          </div>
          {settings.emergency_pause_all && settings.emergency_paused_at && <div className="mt-2 text-xs text-rose-600">Paused at: {new Date(settings.emergency_paused_at).toLocaleString()}</div>}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><Clock className="h-4 w-4" /> General</h3>
          <div className="space-y-4">
            <Field label="Timezone"><TextInput value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} disabled={!canConfigure} /></Field>
            <Field label="Working days"><div className="flex flex-wrap gap-2">{days.map((day, i) => <button key={i} onClick={() => canConfigure && toggleDay(i)} disabled={!canConfigure} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${settings.working_days.includes(i) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{day}</button>)}</div></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Working hours start"><TextInput type="time" value={settings.working_hours_start} onChange={(e) => setSettings({ ...settings, working_hours_start: e.target.value })} disabled={!canConfigure} /></Field>
              <Field label="Working hours end"><TextInput type="time" value={settings.working_hours_end} onChange={(e) => setSettings({ ...settings, working_hours_end: e.target.value })} disabled={!canConfigure} /></Field>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><SettingsIcon className="h-4 w-4" /> Failure & Retry</h3>
          <div className="space-y-4">
            <Field label="Default retry limit"><TextInput type="number" value={settings.default_retry_limit} onChange={(e) => setSettings({ ...settings, default_retry_limit: Number(e.target.value) })} disabled={!canConfigure} /></Field>
            <Field label="Default failure policy"><Select value={settings.default_failure_policy} onChange={(e) => setSettings({ ...settings, default_failure_policy: e.target.value as AutomationSettings['default_failure_policy'] })} disabled={!canConfigure}><option value="stop">Stop</option><option value="continue">Continue</option><option value="skip">Skip</option><option value="manual_review">Manual review</option><option value="notify_owner">Notify owner</option></Select></Field>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><Shield className="h-4 w-4" /> Approval Requirements</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={settings.require_approval_client_messages} onChange={(e) => setSettings({ ...settings, require_approval_client_messages: e.target.checked })} disabled={!canConfigure} className="rounded border-slate-300" /> Require approval for client-facing messages</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={settings.require_approval_invoice_creation} onChange={(e) => setSettings({ ...settings, require_approval_invoice_creation: e.target.checked })} disabled={!canConfigure} className="rounded border-slate-300" /> Require approval for invoice creation</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={settings.require_approval_project_cancellation} onChange={(e) => setSettings({ ...settings, require_approval_project_cancellation: e.target.checked })} disabled={!canConfigure} className="rounded border-slate-300" /> Require approval for project cancellation</label>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><SettingsIcon className="h-4 w-4" /> Limits & Webhooks</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Max automation depth"><TextInput type="number" value={settings.max_automation_depth} onChange={(e) => setSettings({ ...settings, max_automation_depth: Number(e.target.value) })} disabled={!canConfigure} /></Field>
              <Field label="Max actions per workflow"><TextInput type="number" value={settings.max_actions_per_workflow} onChange={(e) => setSettings({ ...settings, max_actions_per_workflow: Number(e.target.value) })} disabled={!canConfigure} /></Field>
            </div>
            <Field label="Log retention (days)"><TextInput type="number" value={settings.log_retention_days} onChange={(e) => setSettings({ ...settings, log_retention_days: Number(e.target.value) })} disabled={!canConfigure} /></Field>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={settings.enable_outbound_webhooks} onChange={(e) => setSettings({ ...settings, enable_outbound_webhooks: e.target.checked })} disabled={!canConfigure} className="rounded border-slate-300" /> Enable outbound webhooks</label>
          </div>
        </Card>
      </div>

      {showPauseConfirm && <ConfirmDialog open={true} onClose={() => setShowPauseConfirm(false)} onConfirm={() => toggleEmergencyPause(true)} title="Pause ALL automations?" message="This will stop all new automation runs. Payment webhooks will still be verified. Queued jobs will be preserved." confirmLabel="Pause All" danger />}
      {showResumeConfirm && <ConfirmDialog open={true} onClose={() => setShowResumeConfirm(false)} onConfirm={() => toggleEmergencyPause(false)} title="Resume automations?" message="This will allow new automation runs to start again." confirmLabel="Resume" />}
    </div>
  );
}
