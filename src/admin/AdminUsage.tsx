import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState, Button } from '@/components/ui';
import { Activity, Building2, Zap, Database, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';

export function AdminUsage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsageData = async () => {
    setLoading(true);

    // 1. Fetch workspaces with subscriptions
    const { data: wsData } = await supabase
      .from('workspaces')
      .select('id, name, slug, created_at')
      .order('created_at', { ascending: false });

    if (!wsData) {
      setLoading(false);
      return;
    }

    // 2. Fetch counts per workspace
    const wsIds = wsData.map(w => w.id);
    const [clientsRes, leadsRes, invoicesRes, automationsRes] = await Promise.all([
      supabase.from('clients').select('workspace_id', { count: 'exact' }).in('workspace_id', wsIds),
      supabase.from('leads').select('workspace_id', { count: 'exact' }).in('workspace_id', wsIds),
      supabase.from('invoices').select('workspace_id', { count: 'exact' }).in('workspace_id', wsIds),
      supabase.from('automations').select('workspace_id', { count: 'exact' }).in('workspace_id', wsIds),
    ]);

    // Build metric counts map
    const countsMap = new Map();
    for (const w of wsData) {
      countsMap.set(w.id, { clients: 0, leads: 0, invoices: 0, automations: 0 });
    }

    (clientsRes.data || []).forEach((c: any) => {
      const entry = countsMap.get(c.workspace_id);
      if (entry) entry.clients++;
    });

    (leadsRes.data || []).forEach((l: any) => {
      const entry = countsMap.get(l.workspace_id);
      if (entry) entry.leads++;
    });

    (invoicesRes.data || []).forEach((i: any) => {
      const entry = countsMap.get(i.workspace_id);
      if (entry) entry.invoices++;
    });

    (automationsRes.data || []).forEach((a: any) => {
      const entry = countsMap.get(a.workspace_id);
      if (entry) entry.automations++;
    });

    const formatted = wsData.map(w => ({
      ...w,
      metrics: countsMap.get(w.id) || { clients: 0, leads: 0, invoices: 0, automations: 0 }
    }));

    setWorkspaces(formatted);
    setLoading(false);
  };

  useEffect(() => {
    loadUsageData();
  }, []);

  if (loading) return <LoadingState label="Loading usage & telemetry..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary flex items-center gap-2">
            <Activity className="h-7 w-7 text-admin-primary" /> Workspace Telemetry & Limits
          </h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            Monitor real-time data usage, record volume, and automation activity across tenant workspaces.
          </p>
        </div>
        <Button variant="outline" onClick={loadUsageData} className="gap-2 text-xs">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="bg-admin-bg-surface rounded-xl shadow-sm border border-admin-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-admin-text-secondary">
            <thead className="bg-slate-50 text-admin-text-primary border-b border-admin-border-subtle font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Workspace</th>
                <th className="px-6 py-3.5">Total Clients</th>
                <th className="px-6 py-3.5">Total Leads</th>
                <th className="px-6 py-3.5">Total Invoices</th>
                <th className="px-6 py-3.5">Active Workflows</th>
                <th className="px-6 py-3.5 text-right">Health Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {workspaces.length > 0 ? (
                workspaces.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-admin-text-primary flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-slate-400" />
                        <span>{w.name}</span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{w.slug}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-900 font-semibold">
                      {w.metrics.clients}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-900 font-semibold">
                      {w.metrics.leads}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-900 font-semibold">
                      {w.metrics.invoices}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-900 font-semibold">
                      {w.metrics.automations}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="px-2.5 py-1 text-xs rounded-full bg-emerald-100 text-emerald-800 font-bold uppercase tracking-wider">
                        Normal
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs text-slate-400">
                    No active workspaces found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}