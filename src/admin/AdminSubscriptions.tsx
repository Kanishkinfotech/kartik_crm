import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState, StatusBadge, Button, Modal, Field, Select, TextInput } from '@/components/ui';
import { FileText, Building2, CheckCircle2, XCircle, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { formatDateTime } from '@/lib/format';

export function AdminSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Edit Subscription Modal
  const [editingSub, setEditingSub] = useState<any | null>(null);
  const [targetStatus, setTargetStatus] = useState<'trial' | 'active' | 'past_due' | 'canceled' | 'expired'>('active');
  const [selectedPlanVersionId, setSelectedPlanVersionId] = useState<string>('');

  const loadSubscriptions = async () => {
    setLoading(true);
    // 1. Fetch all subscriptions with workspace & plan details
    const { data: subData } = await supabase
      .from('workspace_subscriptions')
      .select('*, workspaces(name, slug), saas_plan_versions(*, saas_plans(name))')
      .order('created_at', { ascending: false });

    // 2. Fetch all plan versions for upgrade/downgrade selection
    const { data: planData } = await supabase
      .from('saas_plan_versions')
      .select('*, saas_plans(name)')
      .eq('status', 'published');

    setSubscriptions(subData || []);
    setPlans(planData || []);
    setLoading(false);
  };

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const handleUpdateSubscription = async () => {
    if (!editingSub) return;
    setActionBusy(editingSub.id);

    const updatePayload: any = {
      status: targetStatus,
      updated_at: new Date().toISOString(),
    };

    if (selectedPlanVersionId) {
      updatePayload.plan_version_id = selectedPlanVersionId;
    }

    const { error } = await supabase
      .from('workspace_subscriptions')
      .update(updatePayload)
      .eq('id', editingSub.id);

    setActionBusy(null);
    if (!error) {
      setEditingSub(null);
      loadSubscriptions();
    } else {
      alert(`Failed to update subscription: ${error.message}`);
    }
  };

  if (loading) return <LoadingState label="Loading SaaS Subscriptions..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary flex items-center gap-2">
            <FileText className="h-7 w-7 text-admin-primary" /> SaaS Subscriptions
          </h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            View, manage, upgrade, and override subscription statuses across all SaaS workspaces.
          </p>
        </div>
        <Button variant="outline" onClick={loadSubscriptions} className="gap-2 text-xs">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="bg-admin-bg-surface rounded-xl shadow-sm border border-admin-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-admin-text-secondary">
            <thead className="bg-slate-50 text-admin-text-primary border-b border-admin-border-subtle font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Workspace</th>
                <th className="px-6 py-3.5">Plan Tier</th>
                <th className="px-6 py-3.5">Billing Cycle</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Current Period Ends</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {subscriptions.length > 0 ? (
                subscriptions.map((sub) => {
                  const wsName = sub.workspaces?.name || 'Unnamed Workspace';
                  const planName = sub.saas_plan_versions?.saas_plans?.name || 'Standard Plan';
                  const monthlyPrice = sub.saas_plan_versions?.monthly_price || 0;
                  const currency = sub.saas_plan_versions?.currency || 'INR';

                  let statusBadgeClass = 'bg-slate-100 text-slate-700';
                  if (sub.status === 'active') statusBadgeClass = 'bg-emerald-100 text-emerald-800 font-bold';
                  if (sub.status === 'trial') statusBadgeClass = 'bg-blue-100 text-blue-800 font-bold';
                  if (sub.status === 'past_due') statusBadgeClass = 'bg-amber-100 text-amber-800 font-bold';
                  if (sub.status === 'canceled' || sub.status === 'expired') statusBadgeClass = 'bg-rose-100 text-rose-800 font-bold';

                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-admin-text-primary flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400" />
                          <span>{wsName}</span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{sub.workspace_id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-admin-text-primary capitalize">{planName}</span>
                        <div className="text-xs text-slate-500">
                          ₹{Number(monthlyPrice).toLocaleString('en-IN')}/mo
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs capitalize text-slate-600">
                        {sub.billing_cycle || 'monthly'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs rounded-full uppercase tracking-wider ${statusBadgeClass}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {sub.current_period_end ? formatDateTime(sub.current_period_end) : 'Never'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingSub(sub);
                            setTargetStatus(sub.status);
                            setSelectedPlanVersionId(sub.plan_version_id);
                          }}
                          className="text-xs"
                        >
                          Manage Sub
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs text-slate-400">
                    No active workspace subscriptions registered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MANAGE SUBSCRIPTION MODAL */}
      {editingSub && (
        <Modal
          open={!!editingSub}
          onClose={() => setEditingSub(null)}
          title={`Manage Subscription: ${editingSub.workspaces?.name || 'Workspace'}`}
        >
          <div className="space-y-4 py-2">
            <Field label="Subscription Status">
              <Select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as any)}
              >
                <option value="active">Active (Full Access)</option>
                <option value="trial">Trialing</option>
                <option value="past_due">Past Due (Grace Period)</option>
                <option value="canceled">Canceled</option>
                <option value="expired">Expired</option>
              </Select>
            </Field>

            <Field label="Switch SaaS Plan Tier">
              <Select
                value={selectedPlanVersionId}
                onChange={(e) => setSelectedPlanVersionId(e.target.value)}
              >
                {plans.map((pv) => (
                  <option key={pv.id} value={pv.id}>
                    {pv.saas_plans?.name || 'Plan'} — ₹{pv.monthly_price}/mo ({pv.version_name || 'v1'})
                  </option>
                ))}
              </Select>
            </Field>

            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> Instant Payment Activation Override
                </div>
                <div className="text-[11px] text-emerald-700 mt-0.5">
                  Extends active status by 30 days and grants full module entitlements immediately.
                </div>
              </div>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs shrink-0"
                onClick={async () => {
                  setActionBusy(editingSub.id);
                  const nextPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                  await supabase
                    .from('workspace_subscriptions')
                    .update({
                      status: 'active',
                      current_period_end: nextPeriodEnd,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', editingSub.id);
                  setActionBusy(null);
                  setEditingSub(null);
                  loadSubscriptions();
                }}
              >
                Force Activate (30 Days)
              </Button>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="outline" onClick={() => setEditingSub(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateSubscription} disabled={actionBusy === editingSub.id}>
                {actionBusy === editingSub.id ? 'Updating...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}