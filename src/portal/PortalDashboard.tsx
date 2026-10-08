import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePortal } from '@/lib/portal';
import { Card, LoadingState, StatusBadge } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/format';
import { Receipt, FolderKanban, FileText, ArrowRight } from 'lucide-react';
import { useRouter } from '@/lib/router';



export function PortalDashboard() {
  const { activeMembership } = usePortal();
  const { navigate } = useRouter();
  const isDemo = activeMembership?.id === 'cpm-demo' || (typeof localStorage !== 'undefined' && (localStorage.getItem('k1_portal_override') === 'true' || localStorage.getItem('k1_user_override') === 'true'));
  const [loading, setLoading] = useState(false);
  
  const [metrics, setMetrics] = useState({ outstanding: 0, activeProjects: 0, pendingQuotes: 0 });
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [recentProjects, setRecentProjects] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!activeMembership) return;
    if (isDemo) {
      setMetrics({ outstanding: 0, activeProjects: 0, pendingQuotes: 0 });
      setRecentInvoices([]);
      setRecentProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const clientId = activeMembership.client_id;

    try {
      const dbPromise = Promise.all([
        supabase.from('invoices').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
        supabase.from('projects').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
        supabase.from('quotations').select('*').eq('client_id', clientId).in('status', ['sent', 'viewed'])
      ]);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2500)
      );

      const [invRes, projRes, quoteRes] = await Promise.race([dbPromise, timeoutPromise]) as any;

      const invoices = invRes?.data || [];
      const projects = projRes?.data || [];
      const quotes = quoteRes?.data || [];

      const outstanding = invoices.reduce((sum: number, inv: any) => sum + Number(inv.balance_due || 0), 0);
      const activeProjects = projects.filter((p: any) => !['completed', 'cancelled', 'on_hold'].includes(p.status)).length;
      const pendingQuotes = quotes.length;

      setMetrics({ outstanding, activeProjects, pendingQuotes });
      setRecentInvoices(invoices.slice(0, 5));
      setRecentProjects(projects.slice(0, 5));
    } catch {
      setMetrics({ outstanding: 0, activeProjects: 0, pendingQuotes: 0 });
      setRecentInvoices([]);
      setRecentProjects([]);
    } finally {
      setLoading(false);
    }
  }, [activeMembership]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;

  const clientName = activeMembership?.clients?.business_name || activeMembership?.clients?.contact_person;
  const currency = activeMembership?.clients?.default_currency || 'INR';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome back, {activeMembership?.client_contacts?.first_name || 'Client'}</h1>
        <p className="mt-1 text-slate-500">Here is an overview of your account with {clientName}.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <Receipt className="w-5 h-5" />
            <h3 className="font-medium">Outstanding Balance</h3>
          </div>
          <div className={`text-3xl font-bold ${metrics.outstanding > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {formatCurrency(metrics.outstanding, currency)}
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <FolderKanban className="w-5 h-5" />
            <h3 className="font-medium">Active Projects</h3>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {metrics.activeProjects}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <FileText className="w-5 h-5" />
            <h3 className="font-medium">Pending Quotations</h3>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {metrics.pendingQuotes}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">Recent Invoices</h3>
            <button onClick={() => navigate('/portal/invoices')} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center">
              View all <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentInvoices.length === 0 ? (
              <div className="p-5 text-center text-sm text-slate-500">No invoices found.</div>
            ) : (
              recentInvoices.map((inv) => (
                <div key={inv.id} className="p-4 hover:bg-slate-50 flex items-center justify-between cursor-pointer" onClick={() => navigate(`/portal/invoices/${inv.id}`)}>
                  <div>
                    <div className="font-medium text-slate-900">{inv.invoice_number}</div>
                    <div className="text-sm text-slate-500">{formatDate(inv.invoice_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-slate-900">{formatCurrency(Number(inv.total), inv.currency)}</div>
                    <StatusBadge status={inv.status} tone={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : 'warning'} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Projects */}
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">Active Projects</h3>
            <button onClick={() => navigate('/portal/projects')} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center">
              View all <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentProjects.length === 0 ? (
              <div className="p-5 text-center text-sm text-slate-500">No projects found.</div>
            ) : (
              recentProjects.map((proj) => (
                <div key={proj.id} className="p-4 hover:bg-slate-50 flex items-center justify-between cursor-pointer" onClick={() => navigate(`/portal/projects/${proj.id}`)}>
                  <div>
                    <div className="font-medium text-slate-900">{proj.name}</div>
                    <div className="text-sm text-slate-500">Due: {proj.end_date ? formatDate(proj.end_date) : 'No date set'}</div>
                  </div>
                  <StatusBadge status={proj.status} tone={proj.status === 'completed' ? 'success' : proj.status === 'active' ? 'info' : 'neutral'} />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
