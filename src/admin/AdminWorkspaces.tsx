import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState } from '@/components/ui';

export function AdminWorkspaces() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      // 1. Get workspaces
      const { data: wsData } = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: false });

      if (!wsData) {
        setLoading(false);
        return;
      }

      // 2. Get subscriptions for all workspaces
      const wsIds = wsData.map(w => w.id);
      const { data: subsData } = await supabase
        .from('workspace_subscriptions')
        .select('workspace_id, status, saas_plan_versions(saas_plans(name))')
        .in('workspace_id', wsIds);

      const subMap = new Map();
      if (subsData) {
        for (const sub of subsData as any[]) {
          subMap.set(sub.workspace_id, {
            status: sub.status,
            planName: sub.saas_plan_versions?.saas_plans?.name || 'Unknown'
          });
        }
      }

      const formatted = wsData.map(w => ({
        ...w,
        subscription: subMap.get(w.id) || { status: 'none', planName: 'None' }
      }));

      setWorkspaces(formatted);
      setLoading(false);
    }

    loadData();
  }, []);

  if (loading) return <LoadingState label="Loading workspaces..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-admin-text-primary">Workspaces</h1>
        <p className="mt-1 text-sm text-admin-text-secondary">Directory of all customers using Kanishk One.</p>
      </div>

      <div className="bg-admin-bg-surface rounded-xl shadow-sm border border-admin-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-admin-border-default">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-admin-text-secondary uppercase tracking-wider">Workspace</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-admin-text-secondary uppercase tracking-wider">Industry</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-admin-text-secondary uppercase tracking-wider">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-admin-text-secondary uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-admin-text-secondary uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="bg-admin-bg-surface divide-y divide-admin-border-default">
              {workspaces.map((ws) => (
                <tr key={ws.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-admin-text-primary">{ws.name}</div>
                    <div className="text-xs text-admin-text-secondary">{ws.slug}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-admin-text-secondary capitalize">
                    {ws.industry || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-admin-text-primary font-medium">
                    {ws.subscription.planName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider ${
                      ws.subscription.status === 'active' ? 'bg-green-100 text-admin-success' :
                      ws.subscription.status === 'trial' ? 'bg-blue-100 text-admin-info' :
                      ws.subscription.status === 'past_due' ? 'bg-red-100 text-admin-danger' :
                      'bg-slate-100 text-admin-text-secondary'
                    }`}>
                      {ws.subscription.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-admin-text-secondary">
                    {new Date(ws.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
