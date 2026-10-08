import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { Activity, CheckCircle2, XCircle, Mail, MessageCircle, CreditCard, Webhook, Clock, Zap, TrendingUp, AlertTriangle } from 'lucide-react';

export function AutomationUsage() {
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ total_runs: number; successful_runs: number; failed_runs: number; email_actions: number; whatsapp_actions: number; payment_actions: number; webhook_actions: number; active_automations: number; queue_size: number } | null>(null);
  const [mostUsed, setMostUsed] = useState<{ automation_id: string; automation_name: string; count: number }[]>([]);
  const [mostFailed, setMostFailed] = useState<{ automation_id: string; automation_name: string; count: number }[]>([]);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    const month = new Date().toISOString().slice(0, 7);
    const [usageRes, activeRes, queueRes, runsRes, failRes, autoRes] = await Promise.all([
      supabase.from('automation_usage').select('*').eq('workspace_id', activeWorkspace.id).eq('period', month).maybeSingle(),
      supabase.from('automations').select('*', { count: 'exact', head: true }).eq('workspace_id', activeWorkspace.id).eq('status', 'active'),
      supabase.from('automation_jobs').select('*', { count: 'exact', head: true }).eq('workspace_id', activeWorkspace.id).in('status', ['pending', 'scheduled']),
      supabase.from('automation_runs').select('automation_id, automations(name)').eq('workspace_id', activeWorkspace.id).gte('started_at', `${month}-01T00:00:00Z`),
      supabase.from('automation_failures').select('automation_id, automations(name)').eq('workspace_id', activeWorkspace.id).gte('failure_time', `${month}-01T00:00:00Z`),
      supabase.from('automations').select('id, name').eq('workspace_id', activeWorkspace.id),
    ]);
    if (usageRes.error) { setError(describeDbError(usageRes.error)); setLoading(false); return; }
    const u = usageRes.data;
    setUsage({ total_runs: u?.total_runs ?? 0, successful_runs: u?.successful_runs ?? 0, failed_runs: u?.failed_runs ?? 0, email_actions: u?.email_actions ?? 0, whatsapp_actions: u?.whatsapp_actions ?? 0, payment_actions: u?.payment_actions ?? 0, webhook_actions: u?.webhook_actions ?? 0, active_automations: activeRes.count ?? 0, queue_size: queueRes.count ?? 0 });
    const names = new Map<string, string>(); (autoRes.data ?? []).forEach((a: { id: string; name: string }) => names.set(a.id, a.name));
    const runCounts = new Map<string, number>(); (runsRes.data ?? []).forEach((r: { automation_id: string }) => runCounts.set(r.automation_id, (runCounts.get(r.automation_id) ?? 0) + 1));
    setMostUsed(Array.from(runCounts.entries()).map(([id, count]) => ({ automation_id: id, automation_name: names.get(id) ?? 'Unknown', count })).sort((a, b) => b.count - a.count).slice(0, 5));
    const failCounts = new Map<string, number>(); (failRes.data ?? []).forEach((f: { automation_id: string }) => failCounts.set(f.automation_id, (failCounts.get(f.automation_id) ?? 0) + 1));
    setMostFailed(Array.from(failCounts.entries()).map(([id, count]) => ({ automation_id: id, automation_name: names.get(id) ?? 'Unknown', count })).sort((a, b) => b.count - a.count).slice(0, 5));
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!usage) return <EmptyState title="No usage data" description="Usage data will appear once automations start running." />;

  const successRate = usage.total_runs > 0 ? Math.round((usage.successful_runs / usage.total_runs) * 100) : 0;
  const timeSavedHours = Math.round((usage.total_runs * 5) / 60);

  const METRICS = [
    { label: 'Total Runs', value: usage.total_runs, icon: Activity, tone: 'text-blue-600' },
    { label: 'Successful', value: usage.successful_runs, icon: CheckCircle2, tone: 'text-emerald-600' },
    { label: 'Failed', value: usage.failed_runs, icon: XCircle, tone: 'text-rose-600' },
    { label: 'Success Rate', value: `${successRate}%`, icon: TrendingUp, tone: 'text-emerald-600' },
    { label: 'Email Actions', value: usage.email_actions, icon: Mail, tone: 'text-blue-600' },
    { label: 'WhatsApp Actions', value: usage.whatsapp_actions, icon: MessageCircle, tone: 'text-emerald-600' },
    { label: 'Payment Actions', value: usage.payment_actions, icon: CreditCard, tone: 'text-amber-600' },
    { label: 'Webhook Actions', value: usage.webhook_actions, icon: Webhook, tone: 'text-slate-600' },
    { label: 'Active Automations', value: usage.active_automations, icon: Zap, tone: 'text-blue-600' },
    { label: 'Queue Backlog', value: usage.queue_size, icon: Clock, tone: 'text-amber-600' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Automation Usage" description={`Metrics for ${new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' })}`} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {METRICS.map((m) => <Card key={m.label} className="p-4"><div className="flex items-center gap-2"><m.icon className={`h-5 w-5 ${m.tone}`} /><span className="text-2xl font-bold text-slate-900">{m.value}</span></div><div className="mt-1 text-xs text-slate-500">{m.label}</div></Card>)}
      </div>
      <Card className="p-5"><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-blue-600" /><span className="text-2xl font-bold text-slate-900">{timeSavedHours}h</span></div><div className="mt-1 text-xs text-slate-500">Estimated time saved (assumes 5 min per run)</div></Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5"><h3 className="mb-3 text-sm font-semibold text-slate-700">Most Used Automations</h3>{mostUsed.length === 0 ? <p className="text-sm text-slate-400">No runs yet this month.</p> : <div className="space-y-2">{mostUsed.map((m, i) => <div key={m.automation_id} className="flex items-center justify-between text-sm"><span className="text-slate-700">{i + 1}. {m.automation_name}</span><span className="font-medium text-slate-900">{m.count} runs</span></div>)}</div>}</Card>
        <Card className="p-5"><h3 className="mb-3 text-sm font-semibold text-slate-700">Most Failed Automations</h3>{mostFailed.length === 0 ? <p className="text-sm text-emerald-600">No failures this month.</p> : <div className="space-y-2">{mostFailed.map((m, i) => <div key={m.automation_id} className="flex items-center justify-between text-sm"><span className="text-slate-700">{i + 1}. {m.automation_name}</span><span className="font-medium text-rose-600">{m.count} failures</span></div>)}</div>}</Card>
      </div>
    </div>
  );
}
