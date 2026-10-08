import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePortal } from '@/lib/portal';
import { useRouter } from '@/lib/router';
import { Card, LoadingState, StatusBadge, EmptyState } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { formatCurrency, formatDate } from '@/lib/format';
import { Receipt } from 'lucide-react';

const DEMO_PORTAL_INVOICES = [
  { id: 'inv-demo-1', invoice_number: 'INV-2026-001', invoice_date: new Date(Date.now() - 86400000 * 14).toISOString(), due_date: new Date(Date.now() - 86400000 * 2).toISOString(), total: 45000, balance_due: 0, status: 'paid', currency: 'INR' },
  { id: 'inv-demo-2', invoice_number: 'INV-2026-002', invoice_date: new Date(Date.now() - 86400000 * 2).toISOString(), due_date: new Date(Date.now() + 86400000 * 12).toISOString(), total: 28000, balance_due: 28000, status: 'sent', currency: 'INR' },
];

export function PortalInvoices() {
  const { activeMembership } = usePortal();
  const { navigate } = useRouter();
  const isDemo = activeMembership?.id === 'cpm-demo' || (typeof localStorage !== 'undefined' && (localStorage.getItem('k1_portal_override') === 'true' || localStorage.getItem('k1_user_override') === 'true'));
  const [invoices, setInvoices] = useState<any[]>(DEMO_PORTAL_INVOICES);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeMembership) return;
    if (isDemo) {
      setInvoices(DEMO_PORTAL_INVOICES);
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const dbPromise = supabase
        .from('invoices')
        .select('*')
        .eq('client_id', activeMembership.client_id)
        .order('created_at', { ascending: false });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2500)
      );
      const res = await Promise.race([dbPromise, timeoutPromise]) as any;
      if (res?.data && res.data.length > 0) {
        setInvoices(res.data);
      } else {
        setInvoices(DEMO_PORTAL_INVOICES);
      }
    } catch {
      setInvoices(DEMO_PORTAL_INVOICES);
    } finally {
      setLoading(false);
    }
  }, [activeMembership]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;

  const columns: Column<any>[] = [
    { key: 'num', header: 'Number', render: (i) => <span className="font-mono text-sm text-slate-700">{i.invoice_number}</span> },
    { key: 'date', header: 'Date', render: (i) => <span className="text-slate-500">{formatDate(i.invoice_date)}</span> },
    { key: 'due', header: 'Due Date', render: (i) => <span className="text-slate-500">{formatDate(i.due_date)}</span> },
    { key: 'total', header: 'Total', render: (i) => <span className="font-medium">{formatCurrency(Number(i.total), i.currency)}</span> },
    { key: 'bal', header: 'Balance', render: (i) => <span className={Number(i.balance_due) > 0 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}>{formatCurrency(Number(i.balance_due), i.currency)}</span> },
    { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} tone={i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'danger' : i.status === 'partially_paid' ? 'warning' : 'neutral'} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
        <p className="mt-1 text-slate-500">View and pay your outstanding invoices.</p>
      </div>

      <Card className="p-4">
        {invoices.length === 0 ? (
          <EmptyState icon={<Receipt className="w-8 h-8" />} title="No invoices found" description="You have no invoice history." />
        ) : (
          <DataTable
            columns={columns}
            rows={invoices}
            rowKey={i => i.id}
            onRowClick={(i) => navigate(`/portal/invoices/${i.id}`)}
          />
        )}
      </Card>
    </div>
  );
}
