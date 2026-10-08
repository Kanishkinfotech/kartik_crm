import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState, StatusBadge, Button } from '@/components/ui';
import { CreditCard, Receipt, Building2, RefreshCw, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { formatDateTime } from '@/lib/format';

export function AdminPayments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPayments = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('platform_payments')
      .select('*, workspaces(name, slug)')
      .order('created_at', { ascending: false });

    setPayments(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadPayments();
  }, []);

  if (loading) return <LoadingState label="Loading SaaS Payments..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary flex items-center gap-2">
            <CreditCard className="h-7 w-7 text-admin-primary" /> Platform SaaS Payments
          </h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            Audit payment receipts, Razorpay transaction IDs, and subscription charges.
          </p>
        </div>
        <Button variant="outline" onClick={loadPayments} className="gap-2 text-xs">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="bg-admin-bg-surface rounded-xl shadow-sm border border-admin-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-admin-text-secondary">
            <thead className="bg-slate-50 text-admin-text-primary border-b border-admin-border-subtle font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Workspace</th>
                <th className="px-6 py-3.5">Amount</th>
                <th className="px-6 py-3.5">Payment Method</th>
                <th className="px-6 py-3.5">Gateway Reference</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {payments.length > 0 ? (
                payments.map((p) => {
                  const wsName = p.workspaces?.name || 'Unnamed Workspace';
                  const amountFormatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: p.currency || 'INR' }).format(p.amount);

                  let statusBadge = 'bg-emerald-100 text-emerald-800';
                  if (p.status === 'failed') statusBadge = 'bg-rose-100 text-rose-800';
                  if (p.status === 'pending') statusBadge = 'bg-amber-100 text-amber-800';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-admin-text-primary flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400" />
                          <span>{wsName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-900">
                        {amountFormatted}
                      </td>
                      <td className="px-6 py-4 text-xs capitalize text-slate-600">
                        {p.payment_method || 'Razorpay / Card'}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-600 select-all">
                        {p.provider_payment_id || p.provider_order_id || '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs rounded-full uppercase font-bold tracking-wider ${statusBadge}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-xs text-slate-500">
                        {formatDateTime(p.created_at)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs text-slate-400">
                    No platform payments recorded yet.
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