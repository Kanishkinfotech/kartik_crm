import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePortal } from '@/lib/portal';
import { useRouter } from '@/lib/router';
import { Card, LoadingState, StatusBadge, EmptyState } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { formatDate } from '@/lib/format';
import { FolderKanban } from 'lucide-react';

const DEMO_PORTAL_PROJECTS = [
  { id: 'proj-demo-1', project_number: 'PRJ-101', title: 'CRM Redesign & Client Portal', start_date: new Date(Date.now() - 86400000 * 15).toISOString(), target_completion_date: new Date(Date.now() + 86400000 * 20).toISOString(), progress: 65, status: 'in_progress' },
  { id: 'proj-demo-2', project_number: 'PRJ-102', title: 'Cloud Infrastructure Upgrade', start_date: new Date(Date.now() - 86400000 * 5).toISOString(), target_completion_date: new Date(Date.now() + 86400000 * 45).toISOString(), progress: 20, status: 'active' },
];

export function PortalProjects() {
  const { activeMembership } = usePortal();
  const { navigate } = useRouter();
  const isDemo = activeMembership?.id === 'cpm-demo' || (typeof localStorage !== 'undefined' && (localStorage.getItem('k1_portal_override') === 'true' || localStorage.getItem('k1_user_override') === 'true'));
  const [projects, setProjects] = useState<any[]>(DEMO_PORTAL_PROJECTS);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeMembership) return;
    if (isDemo) {
      setProjects(DEMO_PORTAL_PROJECTS);
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const dbPromise = supabase
        .from('projects')
        .select('*')
        .eq('client_id', activeMembership.client_id)
        .order('created_at', { ascending: false });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2500)
      );
      const res = await Promise.race([dbPromise, timeoutPromise]) as any;
      if (res?.data && res.data.length > 0) {
        setProjects(res.data);
      } else {
        setProjects(DEMO_PORTAL_PROJECTS);
      }
    } catch {
      setProjects(DEMO_PORTAL_PROJECTS);
    } finally {
      setLoading(false);
    }
  }, [activeMembership]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;

  const columns: Column<any>[] = [
    { key: 'num', header: 'ID', render: (p) => <span className="font-mono text-sm text-slate-700">{p.project_number}</span> },
    { key: 'title', header: 'Project Title', render: (p) => <span className="font-medium text-slate-900">{p.title}</span> },
    { key: 'start', header: 'Start Date', render: (p) => <span className="text-slate-500">{formatDate(p.start_date)}</span> },
    { key: 'due', header: 'Due Date', render: (p) => <span className="text-slate-500">{formatDate(p.target_completion_date)}</span> },
    { key: 'progress', header: 'Progress', render: (p) => (
      <div className="flex items-center gap-2">
        <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-500" style={{ width: `${p.progress}%` }} /></div>
        <span className="text-xs font-medium text-slate-600">{p.progress}%</span>
      </div>
    ) },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} tone={p.status === 'completed' ? 'success' : p.status === 'active' || p.status === 'in_progress' ? 'info' : 'neutral'} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
        <p className="mt-1 text-slate-500">Track progress, milestones, and deliverables for your projects.</p>
      </div>

      <Card className="p-4">
        {projects.length === 0 ? (
          <EmptyState icon={<FolderKanban className="w-8 h-8" />} title="No active projects" description="There are no projects visible to you yet." />
        ) : (
          <DataTable
            columns={columns}
            rows={projects}
            rowKey={p => p.id}
            onRowClick={(p) => navigate(`/portal/projects/${p.id}`)}
          />
        )}
      </Card>
    </div>
  );
}
