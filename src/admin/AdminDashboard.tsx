import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState } from '@/components/ui';
import { Building2, Users, CreditCard, TrendingUp } from 'lucide-react';

export function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalWorkspaces: 0,
    activeSubscriptions: 0,
    mrr: 0,
    totalRevenue: 0
  });

  useEffect(() => {
    async function loadStats() {
      // 1. Total Workspaces
      const { count: wsCount } = await supabase
        .from('workspaces')
        .select('*', { count: 'exact', head: true });

      // 2. Active Subscriptions & MRR
      const { data: subs } = await supabase
        .from('workspace_subscriptions')
        .select('*, saas_plan_versions(monthly_price)')
        .in('status', ['active', 'past_due']);

      let mrr = 0;
      let activeSubs = 0;
      if (subs) {
        activeSubs = subs.length;
        mrr = subs.reduce((acc, sub) => acc + Number(sub.saas_plan_versions?.monthly_price || 0), 0);
      }

      // 3. Total Revenue
      const { data: payments } = await supabase
        .from('platform_payments')
        .select('amount')
        .eq('status', 'success');

      let revenue = 0;
      if (payments) {
        revenue = payments.reduce((acc, p) => acc + Number(p.amount), 0);
      }

      setStats({
        totalWorkspaces: wsCount || 0,
        activeSubscriptions: activeSubs,
        mrr,
        totalRevenue: revenue
      });
      setLoading(false);
    }
    
    loadStats();

    // REAL-TIME SUPABASE WEBSOCKET CHANNEL LISTENER
    const channel = supabase
      .channel('admin_realtime_metrics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspaces' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_subscriptions' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_payments' }, () => loadStats())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) return <LoadingState label="Loading overview..." />;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const statCards = [
    { label: 'Total Workspaces', value: stats.totalWorkspaces, icon: Building2, color: 'text-admin-info', bg: 'bg-admin-primary-bg' },
    { label: 'Active Subscriptions', value: stats.activeSubscriptions, icon: Users, color: 'text-admin-success', bg: 'bg-green-50' },
    { label: 'Estimated MRR', value: formatCurrency(stats.mrr), icon: TrendingUp, color: 'text-admin-accent', bg: 'bg-orange-50' },
    { label: 'Total Revenue', value: formatCurrency(stats.totalRevenue), icon: CreditCard, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-admin-text-primary">Platform Overview</h1>
        <p className="mt-1 text-sm text-admin-text-secondary">Monitor your Kanishk One SaaS metrics.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="overflow-hidden rounded-xl bg-admin-bg-surface p-6 shadow-sm border border-admin-border-subtle hover:border-admin-border-default transition-colors">
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.bg}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-admin-text-secondary">{stat.label}</p>
                <p className="text-2xl font-bold text-admin-text-primary mt-1">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
