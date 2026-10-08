import { useEffect, useState } from 'react';
import { useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { Button, LoadingState } from '@/components/ui';
import { Check } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  description: string;
  display_order: number;
  monthly_price: number;
  currency: string;
  features: string[]; // We can derive this or hardcode descriptions for now based on the plan code
  recommended?: boolean;
}

export function PricingPage() {
  const { navigate } = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPlans() {
      // Fetch public plans
      const { data: planData, error: planError } = await supabase
        .from('saas_plans')
        .select('*')
        .eq('is_public', true)
        .order('display_order');

      if (planError || !planData) {
        setLoading(false);
        return;
      }

      // Fetch published versions
      const { data: versionData, error: versionError } = await supabase
        .from('saas_plan_versions')
        .select('*')
        .eq('status', 'published');

      if (versionError || !versionData) {
        setLoading(false);
        return;
      }

      const formattedPlans: Plan[] = planData.map(p => {
        const version = versionData.find(v => v.plan_id === p.id);
        
        // Mock features for presentation, or fetch from saas_plan_features
        // In a real scenario, we might map feature_keys to user-friendly strings.
        const featureList = p.code === 'starter' 
          ? ['Up to 5 team members', 'Unlimited clients', 'Basic quotations & invoices', 'Client portal access', 'Email integration']
          : p.code === 'growth'
          ? ['Up to 15 team members', 'Everything in Starter', 'WhatsApp integration', 'Basic automations', 'AI Assistance (Bring Your Own Key)']
          : ['Unlimited team members', 'Everything in Growth', 'Advanced automations', 'Custom roles & permissions', 'Priority support'];

        return {
          id: p.id,
          name: p.name,
          description: p.description || '',
          display_order: p.display_order,
          monthly_price: version ? Number(version.monthly_price) : 0,
          currency: version ? version.currency : 'INR',
          features: featureList,
          recommended: p.code === 'growth'
        };
      });

      setPlans(formattedPlans);
      setLoading(false);
    }
    fetchPlans();
  }, []);

  if (loading) return <LoadingState label="Loading plans..." />;

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0
    }).format(price);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-20 px-4 sm:px-6 lg:px-8 text-slate-900">
      <div className="mx-auto max-w-7xl text-center">
        <h2 className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Transparent Plans</h2>
        <h3 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Simple, predictable pricing
        </h3>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-600">
          Everything you need to manage your clients, projects, quotations, and GST billing in one unified SaaS workspace.
        </p>
      </div>

      <div className="mx-auto mt-16 grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col justify-between rounded-3xl bg-white p-8 border shadow-sm ${
              plan.recommended ? 'border-blue-600 shadow-xl shadow-blue-500/10 ring-2 ring-blue-600' : 'border-slate-200'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-x-4">
                <h3 className={`text-xl font-bold ${plan.recommended ? 'text-blue-600' : 'text-slate-900'}`}>
                  {plan.name}
                </h3>
                {plan.recommended && (
                  <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-700">
                    Most Popular
                  </span>
                )}
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{plan.description}</p>
              <p className="mt-6 flex items-baseline gap-x-1">
                <span className="text-4xl font-extrabold tracking-tight text-slate-900">{formatPrice(plan.monthly_price, plan.currency)}</span>
                <span className="text-sm font-semibold leading-6 text-slate-500">/month</span>
              </p>
              <ul className="mt-8 space-y-3 text-sm leading-6 text-slate-700 font-medium">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <Check className="h-5 w-5 flex-none text-blue-600" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <Button
              onClick={() => navigate('/signup')}
              variant={plan.recommended ? 'primary' : 'outline'}
              className={`mt-8 w-full rounded-full py-6 font-bold shadow-md ${
                plan.recommended ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              Start 14-day free trial
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
