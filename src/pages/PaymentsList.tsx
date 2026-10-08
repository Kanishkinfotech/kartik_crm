import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { addAuditLog } from '@/lib/data';
import type { Payment, PaymentMode, VerificationStatus, Client, PaymentAllocation, Invoice } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, type BadgeTone } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { CreditCard, ArrowLeft } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';

const MODE_TONE: Record<VerificationStatus, BadgeTone> = { pending: 'warning', verified: 'success', reversed: 'danger' };

export function PaymentsList() {
  const { activeWorkspace } = useWorkspace();
  const { navigate } = useRouter();
  const [rows, setRows] = useState<(Payment & { client_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('payments')
      .select('*, clients!inner(business_name, contact_person)')
      .eq('workspace_id', activeWorkspace.id)
      .order('payment_date', { ascending: false });
    if (error) { setError(describeDbError(error)); setLoading(false); return; }
    setRows((data ?? []).map((p: Payment & { clients?: { business_name: string | null; contact_person: string } }) => ({ ...p, client_name: p.clients?.business_name ?? p.clients?.contact_person ?? '—' })));
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const filtered = statusFilter === 'all' ? rows : rows.filter((r) => r.verification_status === statusFilter);

  const columns: Column<(Payment & { client_name?: string })>[] = [
    { key: 'num', header: 'Number', sortValue: (p) => p.payment_number, render: (p) => <span className="font-mono text-xs text-slate-600">{p.payment_number}</span> },
    { key: 'client', header: 'Client', sortValue: (p) => p.client_name ?? '', render: (p) => <span className="font-medium text-slate-900">{p.client_name}</span> },
    { key: 'date', header: 'Date', sortValue: (p) => p.payment_date, render: (p) => <span className="text-slate-500">{formatDate(p.payment_date)}</span> },
    { key: 'amount', header: 'Amount', sortValue: (p) => Number(p.amount), render: (p) => <span className="font-medium text-slate-700">{formatCurrency(Number(p.amount))}</span> },
    { key: 'mode', header: 'Mode', sortValue: (p) => p.payment_mode, render: (p) => <span className="capitalize text-slate-600">{p.payment_mode.replace(/_/g, ' ')}</span> },
    { key: 'ref', header: 'Reference', render: (p) => <span className="text-slate-500">{p.transaction_reference ?? '—'}</span> },
    { key: 'status', header: 'Status', sortValue: (p) => p.verification_status, render: (p) => <StatusBadge status={p.verification_status} tone={MODE_TONE[p.verification_status]} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Recorded payments and their verification status." />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? (
        <EmptyState icon={<CreditCard className="h-10 w-10" />} title="No payments yet" description="Record payments from invoice pages or create one here." />
      ) : (
        <Card className="p-4">
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/payments/${p.id}`)}
            searchKeys={(p) => `${p.payment_number} ${p.client_name} ${p.payment_mode} ${p.transaction_reference ?? ''}`}
            toolbar={<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">All statuses</option><option value="verified">Verified</option><option value="pending">Pending</option><option value="reversed">Reversed</option></select>}
            empty="No payments match your filters."
          />
        </Card>
      )}
    </div>
  );
}

export function PaymentDetail({ paymentId }: { paymentId: string }) {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [allocations, setAllocations] = useState<(PaymentAllocation & { invoice_number?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reversing, setReversing] = useState(false);
  const [reversalReason, setReversalReason] = useState('');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    const { data: p } = await supabase.from('payments').select('*').eq('id', paymentId).eq('workspace_id', activeWorkspace.id).maybeSingle();
    if (!p) { setError('Payment not found.'); setLoading(false); return; }
    const pay = p as Payment;
    setPayment(pay);
    if (pay.client_id) {
      const { data: c } = await supabase.from('clients').select('*').eq('id', pay.client_id).maybeSingle();
      setClient(c as Client);
    }
    const { data: allocs } = await supabase.from('payment_allocations').select('*').eq('payment_id', paymentId);
    const allocRows = (allocs ?? []) as PaymentAllocation[];
    if (allocRows.length) {
      const invIds = allocRows.map((a) => a.invoice_id);
      const { data: invs } = await supabase.from('invoices').select('id, invoice_number').in('id', invIds);
      const invMap = new Map((invs ?? []).map((i: { id: string; invoice_number: string }) => [i.id, i.invoice_number]));
      setAllocations(allocRows.map((a) => ({ ...a, invoice_number: invMap.get(a.invoice_id) })));
    } else {
      setAllocations([]);
    }
    setLoading(false);
  }, [activeWorkspace, paymentId]);

  useEffect(() => { load(); }, [load]);

  const reverse = async () => {
    if (!activeWorkspace || !payment || !reversalReason.trim()) return;
    setReversing(true);
    await supabase.from('payments').update({ verification_status: 'reversed', reversed_at: new Date().toISOString(), reversal_reason: reversalReason.trim() }).eq('id', payment.id).eq('workspace_id', activeWorkspace.id);

    for (const a of allocations) {
      const { data: inv } = await supabase.from('invoices').select('*').eq('id', a.invoice_id).maybeSingle();
      if (inv) {
        const iv = inv as Invoice;
        const newPaid = Math.max(0, Number(iv.amount_paid) - Number(a.amount));
        const newBalance = Number(iv.total) - newPaid;
        const newStatus = newBalance >= Number(iv.total) - 0.01 ? (iv.status === 'overdue' ? 'overdue' : 'sent') : 'partially_paid';
        await supabase.from('invoices').update({ amount_paid: newPaid, balance_due: newBalance, status: newStatus }).eq('id', iv.id).eq('workspace_id', activeWorkspace.id);
      }
    }

    await addAuditLog(activeWorkspace.id, user?.id ?? null, 'payment', payment.id, 'reverse', { changeSummary: `Reversed payment ${payment.payment_number}: ${reversalReason.trim()}` });
    setReversalReason('');
    setReversing(false);
    load();
  };

  if (loading) return <LoadingState label="Loading payment…" />;
  if (error || !payment) return <ErrorState message={error ?? 'Payment not found'} onRetry={() => navigate('/payments')} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/payments')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">{payment.payment_number}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{formatCurrency(Number(payment.amount))} · {formatDate(payment.payment_date)}</p>
        </div>
        <StatusBadge status={payment.verification_status} tone={MODE_TONE[payment.verification_status]} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Allocations</h3>
            {allocations.length === 0 ? <p className="text-sm text-slate-400">No invoice allocations recorded.</p> : (
              <div className="space-y-2">
                {allocations.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-slate-600">{a.invoice_number ?? a.invoice_id}</span>
                    <span className="font-medium text-slate-700">{formatCurrency(Number(a.amount))}</span>
                    <button onClick={() => navigate(`/invoices/${a.invoice_id}`)} className="text-xs text-blue-600 hover:underline">View invoice</button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-400">Client</span><p className="text-slate-700">{client?.business_name ?? client?.contact_person ?? '—'}</p></div>
              <div><span className="text-slate-400">Mode</span><p className="capitalize text-slate-700">{payment.payment_mode.replace(/_/g, ' ')}</p></div>
              <div><span className="text-slate-400">Reference</span><p className="text-slate-700">{payment.transaction_reference ?? '—'}</p></div>
              <div><span className="text-slate-400">Bank account</span><p className="text-slate-700">{payment.bank_account ?? '—'}</p></div>
              <div className="col-span-2"><span className="text-slate-400">Notes</span><p className="text-slate-700">{payment.notes ?? '—'}</p></div>
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">Actions</h3>
          {payment.verification_status === 'reversed' ? (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">This payment has been reversed.{payment.reversal_reason && <p className="mt-1 text-xs">Reason: {payment.reversal_reason}</p>}</div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Reversing a payment restores invoice balances and creates an audit trail. The payment record is retained.</p>
              <textarea value={reversalReason} onChange={(e) => setReversalReason(e.target.value)} placeholder="Reversal reason…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <Button variant="danger" className="w-full" onClick={reverse} disabled={reversing || !reversalReason.trim()}>{reversing ? 'Reversing…' : 'Reverse payment'}</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
