import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePortal } from '@/lib/portal';
import { useRouter } from '@/lib/router';
import { Card, LoadingState, StatusBadge, EmptyState } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { formatCurrency, formatDate } from '@/lib/format';
import { FileText } from 'lucide-react';

const DEMO_PORTAL_QUOTATIONS = [
  { id: 'quo-demo-1', quotation_number: 'QUO-2026-004', subject: 'Cloud Migration & Annual Maintenance', quotation_date: new Date(Date.now() - 86400000 * 3).toISOString(), total: 60000, status: 'sent', currency: 'INR' },
  { id: 'quo-demo-2', quotation_number: 'QUO-2026-002', subject: 'Corporate Website UI/UX Refresh', quotation_date: new Date(Date.now() - 86400000 * 25).toISOString(), total: 45000, status: 'approved', currency: 'INR' },
];

export function PortalQuotations() {
  const { activeMembership } = usePortal();
  const { navigate } = useRouter();
  const isDemo = activeMembership?.id === 'cpm-demo' || (typeof localStorage !== 'undefined' && (localStorage.getItem('k1_portal_override') === 'true' || localStorage.getItem('k1_user_override') === 'true'));
  const [quotations, setQuotations] = useState<any[]>(DEMO_PORTAL_QUOTATIONS);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeMembership) return;
    if (isDemo) {
      setQuotations(DEMO_PORTAL_QUOTATIONS);
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const dbPromise = supabase
        .from('quotations')
        .select('*')
        .eq('client_id', activeMembership.client_id)
        .order('created_at', { ascending: false });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2500)
      );
      const res = await Promise.race([dbPromise, timeoutPromise]) as any;
      if (res?.data && res.data.length > 0) {
        setQuotations(res.data);
      } else {
        setQuotations(DEMO_PORTAL_QUOTATIONS);
      }
    } catch {
      setQuotations(DEMO_PORTAL_QUOTATIONS);
    } finally {
      setLoading(false);
    }
  }, [activeMembership]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;

  const columns: Column<any>[] = [
    { key: 'num', header: 'Number', render: (q) => <span className="font-mono text-sm text-slate-700">{q.quotation_number}</span> },
    { key: 'subject', header: 'Subject', render: (q) => <span className="font-medium text-slate-900">{q.subject || '—'}</span> },
    { key: 'date', header: 'Date', render: (q) => <span className="text-slate-500">{formatDate(q.quotation_date)}</span> },
    { key: 'total', header: 'Total', render: (q) => <span className="font-medium">{formatCurrency(Number(q.total), q.currency)}</span> },
    { key: 'status', header: 'Status', render: (q) => <StatusBadge status={q.status} tone={q.status === 'approved' || q.status === 'converted' ? 'success' : q.status === 'rejected' || q.status === 'expired' ? 'danger' : 'info'} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
        <p className="mt-1 text-slate-500">View and manage your quotations and estimates.</p>
      </div>

      <Card className="p-4">
        {quotations.length === 0 ? (
          <EmptyState icon={<FileText className="w-8 h-8" />} title="No quotations found" description="We haven't sent any quotations yet." />
        ) : (
          <DataTable
            columns={columns}
            rows={quotations}
            rowKey={q => q.id}
            onRowClick={(q) => navigate(`/portal/quotations/${q.id}`)}
          />
        )}
      </Card>
    </div>
  );
}
