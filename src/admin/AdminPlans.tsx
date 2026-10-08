import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button, LoadingState } from '@/components/ui';
import { AdminPlanEditorModal } from '@/admin/AdminPlanEditorModal';
import { Plus, Edit2, Layers, CheckCircle2 } from 'lucide-react';

export function AdminPlans() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);

  const loadPlans = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('saas_plans')
      .select(`
        *,
        saas_plan_versions(
          *,
          saas_plan_features(*)
        )
      `)
      .order('display_order');
    
    if (data) {
      setPlans(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPlans();
  }, []);

  if (loading) return <LoadingState label="Loading SaaS Plans..." />;

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary flex items-center gap-2">
            <Layers className="h-7 w-7 text-admin-primary" /> SaaS Plans & Module Matrix
          </h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            Configure subscription tiers, feature toggles, and module-level access rules.
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedPlan(null);
            setShowEditor(true);
          }}
          className="gap-2 text-xs"
        >
          <Plus className="h-4 w-4" /> Create New Plan Tier
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => {
          const publishedVersions = plan.saas_plan_versions?.filter((v: any) => v.status === 'published') || [];
          const activeVersion = publishedVersions.length > 0 ? publishedVersions[publishedVersions.length - 1] : null;
          
          return (
            <div key={plan.id} className="bg-admin-bg-surface rounded-xl shadow-sm border border-admin-border-subtle overflow-hidden flex flex-col">
              <div className="p-6 border-b border-admin-border-subtle bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-admin-text-primary capitalize">{plan.name}</h3>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${plan.is_public ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                    {plan.is_public ? 'Public' : 'Hidden'}
                  </span>
                </div>
                <p className="text-xs text-admin-text-secondary">{plan.description}</p>
                {activeVersion && (
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-admin-text-primary">{formatCurrency(activeVersion.monthly_price, activeVersion.currency)}</span>
                    <span className="text-xs text-admin-text-secondary">/mo</span>
                  </div>
                )}
              </div>
              
              <div className="p-6 flex-1">
                <h4 className="text-xs font-bold text-admin-text-primary mb-3 uppercase tracking-wider">Enabled Modules & Limits</h4>
                <div className="space-y-2.5">
                  {activeVersion?.saas_plan_features?.map((f: any) => (
                    <div key={f.id} className="flex items-center justify-between text-xs">
                      <span className="text-admin-text-secondary capitalize font-medium">{f.feature_key.replace(/_/g, ' ')}</span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${!f.is_enabled ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {!f.is_enabled ? 'Disabled' : f.limit_amount === null ? 'Unlimited' : f.limit_amount}
                      </span>
                    </div>
                  ))}
                  {(!activeVersion?.saas_plan_features || activeVersion.saas_plan_features.length === 0) && (
                    <div className="text-xs text-slate-400 italic">No custom module limits configured.</div>
                  )}
                </div>
              </div>
              
              <div className="p-6 pt-0 mt-auto">
                <Button
                  variant="outline"
                  className="w-full text-xs gap-2"
                  onClick={() => {
                    setSelectedPlan(plan);
                    setShowEditor(true);
                  }}
                >
                  <Edit2 className="h-3.5 w-3.5" /> Edit Plan & Features
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {showEditor && (
        <AdminPlanEditorModal
          open={showEditor}
          onClose={() => setShowEditor(false)}
          plan={selectedPlan}
          onSaved={loadPlans}
        />
      )}
    </div>
  );
}
