import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePortal } from '@/lib/portal';
import { useRouter } from '@/lib/router';
import { Card, LoadingState, StatusBadge, Button, ConfirmDialog } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/format';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export function PortalQuotationDetail({ quotationId }: { quotationId: string }) {
  const { activeMembership } = usePortal();
  const { navigate } = useRouter();
  const [quotation, setQuotation] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);

  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  const load = useCallback(async () => {
    if (!activeMembership || !quotationId) return;
    setLoading(true);

    const [qRes, iRes] = await Promise.all([
      supabase.from('quotations').select('*').eq('id', quotationId).eq('client_id', activeMembership.client_id).maybeSingle(),
      supabase.from('quotation_items').select('*').eq('quotation_id', quotationId).order('position', { ascending: true })
    ]);

    if (!qRes.data) {
      toast.error('Quotation not found.');
      navigate('/portal/quotations');
      return;
    }

    setQuotation(qRes.data);
    setItems(iRes.data || []);
    
    // If it was 'sent', mark it as 'viewed' - wait, RLS might prevent updating status directly. We could use an RPC for "mark viewed".
    // For now, if the status is 'sent', it's fine. 

    setLoading(false);
  }, [activeMembership, quotationId, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    setActioning(true);
    try {
      const { error } = await supabase.rpc('portal_decide_quotation', {
        p_quotation_id: quotation.id,
        p_decision: decision
      });

      if (error) throw error;
      
      toast.success(`Quotation ${decision === 'approved' ? 'approved' : 'rejected'}`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
    setActioning(false);
    setConfirmApprove(false);
    setConfirmReject(false);
  };

  if (loading || !quotation) return <LoadingState />;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/portal/quotations')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-slate-900">Quotation {quotation.quotation_number}</h1>
            <StatusBadge status={quotation.status} tone={quotation.status === 'approved' || quotation.status === 'converted' ? 'success' : quotation.status === 'rejected' || quotation.status === 'expired' ? 'danger' : 'info'} />
          </div>
          <p className="mt-1 text-slate-500">{quotation.subject}</p>
        </div>
      </div>

      {(quotation.status === 'sent' || quotation.status === 'viewed') && (
        <Card className="p-4 bg-indigo-50 border-indigo-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-indigo-900">Action Required</h3>
            <p className="text-sm text-indigo-700 mt-1">Please review the quotation below and approve or reject it.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="bg-white text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setConfirmReject(true)}>
              <XCircle className="w-4 h-4 mr-2" /> Reject
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setConfirmApprove(true)}>
              <CheckCircle className="w-4 h-4 mr-2" /> Approve Quotation
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-8">
        <div className="flex justify-between border-b pb-8 border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wider mb-4">Quotation</h2>
            <div className="text-sm text-slate-600">
              <p><span className="font-medium">Date:</span> {formatDate(quotation.quotation_date)}</p>
              {quotation.valid_until && <p><span className="font-medium">Valid Until:</span> {formatDate(quotation.valid_until)}</p>}
            </div>
          </div>
          <div className="text-right">
             <div className="text-2xl font-bold text-slate-900 mb-2">{formatCurrency(Number(quotation.total), quotation.currency)}</div>
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
                    <p className="font-medium text-slate-900">{item.item_name}</p>
                    {item.description && <p className="text-slate-500 mt-1 text-xs">{item.description}</p>}
                  </td>
                  <td className="py-4 text-right text-slate-700">{item.quantity}</td>
                  <td className="py-4 text-right text-slate-700">{formatCurrency(Number(item.unit_price), quotation.currency)}</td>
                  <td className="py-4 text-right text-slate-700">{item.tax_rate}%</td>
                  <td className="py-4 text-right font-medium text-slate-900">{formatCurrency(Number(item.total), quotation.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="py-8 flex justify-end">
          <div className="w-64 space-y-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatCurrency(Number(quotation.subtotal), quotation.currency)}</span>
            </div>
            {Number(quotation.discount_total) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Discount</span>
                <span>-{formatCurrency(Number(quotation.discount_total), quotation.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Tax Total</span>
              <span>{formatCurrency(Number(quotation.tax_total), quotation.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 text-lg pt-3 border-t border-slate-200">
              <span>Total</span>
              <span>{formatCurrency(Number(quotation.total), quotation.currency)}</span>
            </div>
          </div>
        </div>

        {quotation.notes && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Notes & Terms</h4>
            <div className="text-sm text-slate-600 whitespace-pre-wrap">{quotation.notes}</div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmApprove}
        title="Approve Quotation"
        message="Are you sure you want to approve this quotation? This indicates your agreement to the terms and costs."
        confirmLabel="Approve"
        onConfirm={() => handleDecision('approved')}
        onClose={() => setConfirmApprove(false)}
      />

      <ConfirmDialog
        open={confirmReject}
        title="Reject Quotation"
        message="Are you sure you want to reject this quotation? You can also ask for revisions outside the portal."
        confirmLabel="Reject"
        danger={true}
        onConfirm={() => handleDecision('rejected')}
        onClose={() => setConfirmReject(false)}
      />
    </div>
  );
}
