import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState, Button } from '@/components/ui';
import { Clock, Shield, User, Building2, RefreshCw } from 'lucide-react';
import { formatDateTime } from '@/lib/format';

export function AdminAudit() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAuditLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_logs')
      .select('*, workspaces(name)')
      .order('created_at', { ascending: false })
      .limit(100);

    setLogs(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  if (loading) return <LoadingState label="Loading Platform Audit Logs..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary flex items-center gap-2">
            <Clock className="h-7 w-7 text-admin-primary" /> Platform Audit Trail
          </h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            Cross-tenant system audit logs for security, configuration changes, and compliance.
          </p>
        </div>
        <Button variant="outline" onClick={loadAuditLogs} className="gap-2 text-xs">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="bg-admin-bg-surface rounded-xl shadow-sm border border-admin-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-admin-text-secondary">
            <thead className="bg-slate-50 text-admin-text-primary border-b border-admin-border-subtle font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Timestamp</th>
                <th className="px-6 py-3.5">Workspace</th>
                <th className="px-6 py-3.5">Action / Entity</th>
                <th className="px-6 py-3.5">Event Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 text-xs font-mono text-slate-500 whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-admin-text-primary flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-slate-400" />
                        <span>{log.workspaces?.name || 'Platform Level'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-800 capitalize">{log.entity_type}</span>
                      <span className="ml-2 px-2 py-0.5 rounded bg-slate-100 text-[10px] uppercase font-mono text-slate-600">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600 font-mono">
                      {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '—')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-xs text-slate-400">
                    No platform audit events logged yet.
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