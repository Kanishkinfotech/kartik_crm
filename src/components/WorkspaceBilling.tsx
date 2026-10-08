import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useEntitlements } from '@/lib/entitlements';
import { Button, LoadingState } from '@/components/ui';
import { CreditCard, CheckCircle2, AlertTriangle, Download } from 'lucide-react';

export function WorkspaceBilling() {
  const { activeWorkspace } = useWorkspace();
  const { features, loading: entLoading } = useEntitlements();
  const [subscription, setSubscription] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgradeBusy, setUpgradeBusy] = useState(false);

  useEffect(() => {
    async function loadBilling() {
      if (!activeWorkspace) return;

      // 1. Load active subscription
      const { data: subData } = await supabase
        .from('workspace_subscriptions')
        .select('*, saas_plan_versions(*, saas_plans(*))')
        .eq('workspace_id', activeWorkspace.id)
        .in('status', ['trial', 'active', 'past_due'])
        .maybeSingle();

      if (subData) {
        setSubscription(subData);
        setPlan(subData.saas_plan_versions?.saas_plans);
      }

      // 2. Load platform invoices
      const { data: invData } = await supabase
        .from('platform_invoices')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false });

      if (invData) {
        setInvoices(invData);
      }

      setLoading(false);
    }
    loadBilling();
  }, [activeWorkspace]);

  const handleUpgrade = async () => {
    if (!activeWorkspace || !subscription?.saas_plan_versions) return;
    setUpgradeBusy(true);

    try {
      // In a real flow, this would open a modal to select a plan and billing cycle.
      // For this demo, we'll assume upgrading to the next available version or a specific one.
      const planVersionId = subscription.saas_plan_versions.id; 
      
      const res = await supabase.functions.invoke('saas-create-subscription', {
        body: {
          workspaceId: activeWorkspace.id,
          planVersionId: planVersionId,
          billingCycle: 'monthly'
        }
      });

      if (res.error) throw new Error(res.error.message || 'Failed to initialize upgrade');

      const { subscriptionId } = res.data;

      // Load Razorpay checkout here (simulated)
      alert(`Razorpay checkout initialized for subscription: ${subscriptionId}`);

    } catch (err: any) {
      alert(err.message || 'An error occurred during upgrade.');
    } finally {
      setUpgradeBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!activeWorkspace || !subscription?.razorpay_subscription_id) return;
    
    if (!confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing cycle.')) return;

    try {
      const res = await supabase.functions.invoke('saas-cancel-subscription', {
        body: {
          workspaceId: activeWorkspace.id,
          cancelAtPeriodEnd: true
        }
      });

      if (res.error) throw new Error(res.error.message);
      
      alert('Subscription canceled successfully.');
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'An error occurred while canceling.');
    }
  };

  if (loading || entLoading) return <LoadingState label="Loading billing info..." />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-slate-900">Subscription & Billing</h2>
        <p className="mt-1 text-sm text-slate-500">
          Manage your Kanishk One plan, check feature limits, and download past invoices.
        </p>
      </div>

      {/* Current Plan Overview */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-xl font-bold text-slate-900">{plan?.name || 'Free Trial'}</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider ${
                subscription?.status === 'active' ? 'bg-green-100 text-green-700' :
                subscription?.status === 'past_due' ? 'bg-rose-100 text-rose-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {subscription?.status}
              </span>
            </div>
            <p className="text-sm text-slate-600">
              {subscription?.cancel_at_period_end 
                ? `Your subscription will cancel on ${new Date(subscription.current_period_end).toLocaleDateString()}`
                : `Next billing date: ${subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : 'N/A'}`
              }
            </p>
          </div>
          <div className="flex gap-3">
            {subscription?.status !== 'trial' && !subscription?.cancel_at_period_end && (
              <Button variant="outline" onClick={handleCancel}>Cancel Plan</Button>
            )}
            <Button onClick={handleUpgrade} disabled={upgradeBusy}>
              {upgradeBusy ? 'Processing...' : 'Upgrade Plan'}
            </Button>
          </div>
        </div>
        
        {/* Usage Limits */}
        <div className="bg-slate-50 p-6 sm:p-8">
          <h4 className="text-sm font-semibold text-slate-900 mb-4 uppercase tracking-wider">Current Usage</h4>
          <div className="grid sm:grid-cols-2 gap-6">
            
            {/* Example Usage Meter for Users */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
              <div className="flex justify-between items-end mb-2">
                <span className="font-medium text-slate-700">Team Members</span>
                <span className="text-sm text-slate-500">
                  <strong className="text-slate-900">4</strong> / {features['users']?.limit_amount || 'Unlimited'}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '80%' }}></div>
              </div>
            </div>

            {/* Example Usage Meter for Clients */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
              <div className="flex justify-between items-end mb-2">
                <span className="font-medium text-slate-700">Clients</span>
                <span className="text-sm text-slate-500">
                  <strong className="text-slate-900">12</strong> / {features['clients']?.limit_amount || 'Unlimited'}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: '10%' }}></div>
              </div>
            </div>
            
          </div>
        </div>
      </div>

      {/* Invoice History */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <h3 className="text-base font-medium text-slate-900">Billing History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">
                    No billing history found.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {new Date(invoice.issued_at || invoice.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {new Intl.NumberFormat('en-IN', { style: 'currency', currency: invoice.currency }).format(invoice.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        invoice.status === 'paid' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {invoice.status === 'paid' && <CheckCircle2 className="h-3.5 w-3.5" />}
                        <span className="capitalize">{invoice.status}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {invoice.invoice_url ? (
                        <a href={invoice.invoice_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-900 inline-flex items-center gap-1">
                          <Download className="h-4 w-4" /> Download
                        </a>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
