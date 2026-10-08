import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import type { AutomationTemplate } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, type BadgeTone, Modal } from '@/components/ui';
import { Zap, Copy, Eye, Trash2, CheckCircle2 } from 'lucide-react';
import { can } from '@/lib/permissions';
import { formatTriggerType, CATEGORY_LABELS } from '@/lib/automation';
import { classNames } from '@/lib/format';

const CAT_TONE: Record<string, BadgeTone> = { quotation: 'info', invoice: 'info', payment: 'success', project: 'warning', task: 'warning', renewal: 'warning', client_onboarding: 'info', client_communication: 'info', work_report: 'neutral', internal_notification: 'neutral', lead_management: 'info', custom: 'neutral' };

export function AutomationTemplates() {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'default' | 'mine'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [preview, setPreview] = useState<AutomationTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canUse = can(role, 'automation_template.use');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    const { data, error: err } = await supabase.from('automation_templates').select('*').or(`workspace_id.is.null,workspace_id.eq.${activeWorkspace.id}`).order('is_default', { ascending: false }).order('name');
    if (err) { setError(describeDbError(err)); setLoading(false); return; }
    setTemplates((data ?? []) as AutomationTemplate[]); setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const useTemplate = async (tmpl: AutomationTemplate) => {
    if (!activeWorkspace) return;
    setBusy(true);
    const { data, error: e } = await supabase.from('automations').insert({
      workspace_id: activeWorkspace.id, name: tmpl.name, description: tmpl.description, category: tmpl.category,
      trigger_type: tmpl.trigger_type, trigger_config: tmpl.trigger_config, conditions: tmpl.conditions,
      actions: tmpl.actions, execution_config: tmpl.execution_config, status: 'draft', created_by: user?.id ?? null,
    }).select().single();
    if (e) { setError(describeDbError(e)); setBusy(false); return; }
    await supabase.from('audit_logs').insert({ workspace_id: activeWorkspace.id, actor_id: user?.id ?? null, entity_type: 'automation', entity_id: data.id, action: 'create', change_summary: `Created from template: ${tmpl.name}` });
    setSuccessMsg(`Automation "${tmpl.name}" created as draft`); setTimeout(() => setSuccessMsg(null), 3000);
    setBusy(false); navigate(`/automations/${data.id}/edit`);
  };

  const deleteTemplate = async (tmpl: AutomationTemplate) => {
    if (!activeWorkspace) return;
    await supabase.from('automation_templates').delete().eq('id', tmpl.id).eq('workspace_id', activeWorkspace.id);
    load();
  };

  const filtered = templates.filter((t) => {
    if (tab === 'default' && !t.is_default) return false;
    if (tab === 'mine' && (!t.workspace_id || t.is_default)) return false;
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    return true;
  });
  const categories = Array.from(new Set(templates.map((t) => t.category)));

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Automation Templates" description="Pre-built workflows you can activate with one click." />
      {successMsg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4" />{successMsg}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(['all', 'default', 'mine'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={classNames('rounded-lg px-3 py-1.5 text-sm font-medium', tab === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{t === 'all' ? 'All' : t === 'default' ? 'Default' : 'My Templates'}</button>
          ))}
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] || c.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? <EmptyState icon={<Zap className="h-10 w-10" />} title="No templates found" description="Try a different filter or tab." /> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tmpl) => (
            <Card key={tmpl.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1"><h3 className="font-semibold text-slate-900">{tmpl.name}</h3>{tmpl.is_default && <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Default</span>}</div>
                <StatusBadge status={CATEGORY_LABELS[tmpl.category] || tmpl.category.replace(/_/g, ' ')} tone={CAT_TONE[tmpl.category] ?? 'neutral'} />
              </div>
              <p className="mt-2 text-sm text-slate-600 line-clamp-2">{tmpl.description}</p>
              <div className="mt-3 space-y-1 text-xs text-slate-500">
                <div>Trigger: <span className="font-medium text-slate-700">{formatTriggerType(tmpl.trigger_type)}</span></div>
                <div>Actions: <span className="font-medium text-slate-700">{tmpl.actions.length}</span></div>
                {tmpl.required_modules.length > 0 && <div className="flex flex-wrap gap-1 pt-1">{tmpl.required_modules.map((m) => <span key={m} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{m}</span>)}</div>}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setPreview(tmpl)}><Eye className="h-4 w-4" /> Preview</Button>
                {canUse && tmpl.is_protected && <Button size="sm" onClick={() => useTemplate(tmpl)} disabled={busy}><Copy className="h-4 w-4" /> Use</Button>}
                {canUse && !tmpl.is_default && <Button size="sm" variant="danger" onClick={() => deleteTemplate(tmpl)}><Trash2 className="h-4 w-4" /> Delete</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {preview && (
        <Modal open={true} onClose={() => setPreview(null)} title={preview.name} size="lg">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{preview.description}</p>
            <div className="rounded-lg border border-slate-200 p-3"><h4 className="mb-2 text-xs font-semibold uppercase text-slate-400">Trigger</h4><p className="text-sm text-slate-700">{formatTriggerType(preview.trigger_type)}</p><pre className="mt-2 text-xs text-slate-500 overflow-x-auto">{JSON.stringify(preview.trigger_config, null, 2)}</pre></div>
            {preview.conditions.length > 0 && <div className="rounded-lg border border-slate-200 p-3"><h4 className="mb-2 text-xs font-semibold uppercase text-slate-400">Conditions</h4><pre className="text-xs text-slate-500 overflow-x-auto">{JSON.stringify(preview.conditions, null, 2)}</pre></div>}
            <div className="rounded-lg border border-slate-200 p-3"><h4 className="mb-2 text-xs font-semibold uppercase text-slate-400">Actions ({preview.actions.length})</h4><div className="space-y-2">{preview.actions.map((action, i) => <div key={i} className="rounded bg-slate-50 px-3 py-2 text-sm"><span className="font-medium text-slate-700">{i + 1}. {formatTriggerType(action.type as string)}</span><pre className="mt-1 text-xs text-slate-500 overflow-x-auto">{JSON.stringify(action.config, null, 2)}</pre></div>)}</div></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPreview(null)}>Close</Button>{canUse && <Button onClick={() => { useTemplate(preview); setPreview(null); }} disabled={busy}><Copy className="h-4 w-4" /> Use this template</Button>}</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
