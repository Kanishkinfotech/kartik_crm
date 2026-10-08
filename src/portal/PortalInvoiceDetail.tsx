import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePortal } from '@/lib/portal';
import { useRouter } from '@/lib/router';
import { Card, LoadingState, StatusBadge, Button } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/format';
import { ArrowLeft, CreditCard, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export function PortalInvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { activeMembership } = usePortal();
  const { navigate } = useRouter();
  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    if (!activeMembership || !invoiceId) return;
    setLoading(true);

    const [invRes, itemRes, payRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', invoiceId).eq('client_id', activeMembership.client_id).maybeSingle(),
      supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('sort_order', { ascending: true }),
      supabase.from('payment_allocations').select('amount, payments(*)').eq('invoice_id', invoiceId)
    ]);

    if (!invRes.data) {
      toast.error('Invoice not found.');
      navigate('/portal/invoices');
      return;
    }

    setInvoice(invRes.data);
    setItems(itemRes.data || []);
    
    // Extract payments safely
    const relatedPayments = (payRes.data || []).map(p => ({
      ...p.payments,
      allocated_amount: p.amount
    }));
    setPayments(relatedPayments);

    setLoading(false);
  }, [activeMembership, invoiceId, navigate]);

  useEffect(() => { load(); }, [load]);

  const handlePayNow = async () => {
    if (!invoice) return;
    
    // If it already has a payment link, just open it
    if (invoice.payment_link) {
      window.open(invoice.payment_link, '_blank');
      return;
    }

    setPaying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment-link`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workspace_id: invoice.workspace_id, invoice_id: invoice.id }),
      });
      const data = await resp.json();
      
      if (!resp.ok) throw new Error(data.error || data.details || `Failed to create payment link (${resp.status})`);
      
      const linkUrl = data.short_url || data.payment_link_url;
      if (linkUrl) {
        window.open(linkUrl, '_blank');
        // Reload to get the saved link
        load();
      } else {
        throw new Error('Payment link could not be generated.');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
    setPaying(false);
  };

  if (loading || !invoice) return <LoadingState />;

  const canPay = Number(invoice.balance_due) > 0 && invoice.status !== 'cancelled' && invoice.status !== 'written_off';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/portal/invoices')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Invoice {invoice.invoice_number}</h1>
            <p className="mt-1 text-slate-500">{invoice.invoice_type.replace(/_/g, ' ').toUpperCase()}</p>
          </div>
          <div className="flex gap-4 items-center">
            <StatusBadge status={invoice.status} tone={invoice.status === 'paid' ? 'success' : invoice.status === 'overdue' ? 'danger' : invoice.status === 'partially_paid' ? 'warning' : 'neutral'} />
            {canPay && (
              <Button onClick={handlePayNow} disabled={paying} className="bg-indigo-600 hover:bg-indigo-700">
                <CreditCard className="w-4 h-4 mr-2" />
                {paying ? 'Processing...' : 'Pay Now'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card className="p-8">
        <div className="flex justify-between border-b pb-8 border-slate-200">
          <div>
            <div className="text-sm text-slate-600 space-y-1">
              <p><span className="font-medium">Invoice Date:</span> {formatDate(invoice.invoice_date)}</p>
              {invoice.due_date && <p><span className="font-medium">Due Date:</span> {formatDate(invoice.due_date)}</p>}
              {invoice.client_gstin && <p><span className="font-medium">Your GSTIN:</span> {invoice.client_gstin}</p>}
            </div>
          </div>
          <div className="text-right">
             <p className="text-sm text-slate-500 uppercase tracking-wide font-semibold">Amount Due</p>
             <div className={`text-3xl font-bold mt-1 ${Number(invoice.balance_due) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
               {formatCurrency(Number(invoice.balance_due), invoice.currency)}
             </div>
          </div>
        </div>

        <div className="py-8 border-b border-slate-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="pb-3 font-medium">Description</th>
                <th className="pb-3 font-medium text-right">Qty</th>
                <th className="pb-3 font-medium text-right">Rate</th>
                <th className="pb-3 font-medium text-right">Tax</th>
                <th className="pb-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-4">
                    <p className="font-medium text-slate-900">{item.description}</p>
                    {item.hsn_sac && <p className="text-slate-500 mt-1 text-xs">HSN/SAC: {item.hsn_sac}</p>}
                  </td>
                  <td className="py-4 text-right text-slate-700">{item.quantity} {item.unit}</td>
                  <td className="py-4 text-right text-slate-700">{formatCurrency(Number(item.rate), invoice.currency)}</td>
                  <td className="py-4 text-right text-slate-700">{item.tax_rate}%</td>
                  <td className="py-4 text-right font-medium text-slate-900">{formatCurrency(Number(item.line_total), invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="py-8 flex justify-end">
          <div className="w-64 space-y-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatCurrency(Number(invoice.subtotal), invoice.currency)}</span>
            </div>
            {Number(invoice.discount_amount) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Discount</span>
                <span>-{formatCurrency(Number(invoice.discount_amount), invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Tax Total</span>
              <span>{formatCurrency(Number(invoice.tax_amount), invoice.currency)}</span>
            </div>
            {Number(invoice.round_off) !== 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Round Off</span>
                <span>{formatCurrency(Number(invoice.round_off), invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-900 text-lg pt-3 border-t border-slate-200">
              <span>Total</span>
              <span>{formatCurrency(Number(invoice.total), invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-emerald-600 font-medium">
              <span>Amount Paid</span>
              <span>-{formatCurrency(Number(invoice.amount_paid), invoice.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-amber-600 text-lg pt-3 border-t border-slate-200">
              <span>Balance Due</span>
              <span>{formatCurrency(Number(invoice.balance_due), invoice.currency)}</span>
            </div>
          </div>
        </div>

        {(invoice.notes || invoice.terms_and_conditions) && (
          <div className="mt-8 pt-8 border-t border-slate-200 space-y-6">
            {invoice.notes && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Notes</h4>
                <div className="text-sm text-slate-600 whitespace-pre-wrap">{invoice.notes}</div>
              </div>
            )}
            {invoice.terms_and_conditions && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Terms & Conditions</h4>
                <div className="text-sm text-slate-600 whitespace-pre-wrap">{invoice.terms_and_conditions}</div>
              </div>
            )}
          </div>
        )}
      </Card>

      {payments.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Payment History</h3>
          <div className="divide-y divide-slate-100">
            {payments.map(p => (
              <div key={p.id} className="py-3 flex justify-between items-center">
                <div>
                  <div className="font-medium text-slate-900">{formatCurrency(Number(p.allocated_amount), invoice.currency)}</div>
                  <div className="text-sm text-slate-500">{formatDate(p.payment_date)} via {p.payment_mode.replace(/_/g, ' ')}</div>
                </div>
                <StatusBadge status={p.verification_status} tone={p.verification_status === 'verified' ? 'success' : p.verification_status === 'reversed' ? 'danger' : 'warning'} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
