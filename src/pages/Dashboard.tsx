import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { Card, LoadingState, ErrorState, StatusBadge, type BadgeTone } from '@/components/ui';
import { 
  Users, FileText, Receipt, CreditCard, TrendingUp, AlertTriangle, 
  Clock, ArrowRight, Calendar, Activity, CheckCircle, Clock4, Target, ArrowUpRight,
  FolderKanban, FileEdit, MessageSquare
} from 'lucide-react';
import { formatCurrency, formatDate, classNames } from '@/lib/format';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

type DateRangeFilter = 'this_week' | 'this_month' | 'last_30_days' | 'last_month' | 'this_quarter' | 'this_year';

function getDateRange(filter: DateRangeFilter): { start: string, end: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  if (filter === 'this_week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    return { start: start.toISOString(), end: now.toISOString() };
  }
  if (filter === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: start.toISOString(), end: now.toISOString() };
  }
  if (filter === 'last_30_days') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: now.toISOString() };
  }
  if (filter === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (filter === 'this_quarter') {
    const quarter = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), quarter * 3, 1);
    return { start: start.toISOString(), end: now.toISOString() };
  }
  if (filter === 'this_year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { start: start.toISOString(), end: now.toISOString() };
  }
  return { start: now.toISOString(), end: now.toISOString() };
}

export function Dashboard() {
  const { activeWorkspace, role } = useWorkspace();
  const { navigate } = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>('this_month');
  
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError(null);
    
    const range = getDateRange(dateFilter);
    
    // DEMO DATA REMOVED PER USER REQUEST

    try {
      const { data: result, error: rpcError } = await supabase.rpc('get_workspace_dashboard_analytics', {
        p_workspace_id: activeWorkspace.id,
        p_start_date: range.start,
        p_end_date: range.end
      });

      let dashboardData = result;
      if (Array.isArray(result) && result.length > 0) {
        dashboardData = result[0]?.get_workspace_dashboard_analytics || result[0];
      }

      if (rpcError || !dashboardData || Object.keys(dashboardData).length === 0) {
        console.error('Dashboard RPC unavailable or error:', rpcError);
        // Provide empty default structure instead of dummy data
        dashboardData = {
          kpis: { activeClients: 0, newLeads: 0, activeProjects: 0, quotesCreated: 0, quoteValue: 0, invoicesRaised: 0, revenueCollected: 0, outstandingAmount: 0 },
          financials: { totalInvoiced: 0, totalCollected: 0, totalOutstanding: 0, totalOverdue: 0, invoiceStatusBreakdown: {} },
          sales: { leadsCreated: 0, leadsConverted: 0, quotesSent: 0, quotesApproved: 0, quotesRejected: 0 },
          projects: { totalProjects: 0, activeProjects: 0, completedProjects: 0, delayedProjects: 0 },
          tasks: { tasksCreated: 0, tasksCompleted: 0, tasksOverdue: 0 },
          actionRequired: [],
          recentActivity: [],
          revenueChart: []
        };
      }

      // --- MANUAL KPI OVERRIDES ---
      // The RPC is outdated (counts clients as leads, filters active clients incorrectly)
      // We manually query the exact counts for these top-level KPIs to ensure accuracy.
      try {
        const [
          { count: activeClients },
          { count: newLeads },
          { count: activeProjects }
        ] = await Promise.all([
          // Total Clients (not deleted) regardless of 'active' or 'prospect' status string
          supabase.from('clients').select('id', { count: 'exact', head: true })
            .eq('workspace_id', activeWorkspace.id)
            .eq('is_deleted', false),
            
          // Current New Leads from the actual `leads` table (ignoring date filter so it acts as a queue)
          supabase.from('leads').select('id', { count: 'exact', head: true })
            .eq('workspace_id', activeWorkspace.id)
            .in('status', ['new', 'contacted', 'qualified']),
            
          // Active Projects
          supabase.from('projects').select('id', { count: 'exact', head: true })
            .eq('workspace_id', activeWorkspace.id)
            .in('status', ['in_progress', 'planning'])
        ]);

        if (dashboardData && dashboardData.kpis) {
          dashboardData.kpis.activeClients = activeClients || 0;
          dashboardData.kpis.newLeads = newLeads || 0;
          dashboardData.kpis.activeProjects = activeProjects || 0;
        }
      } catch (kpiErr) {
        console.warn('Failed to fetch KPI overrides:', kpiErr);
      }
      
      setData(dashboardData);
    } catch (err: any) {
      console.warn('Dashboard fetch error:', err);
      setData(DEMO_DASHBOARD_DATA);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, dateFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <LoadingState label="Loading analytics…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const kpis = data.kpis;
  const financials = data.financials;
  const sales = data.sales;
  const projects = data.projects;
  const tasks = data.tasks;
  const actionRequired = data.actionRequired || [];
  const recentActivity = data.recentActivity || [];
  const revenueChart = data.revenueChart || [];

  const showFinancials = role !== 'viewer' && role !== 'team_member';

  const getActivityIcon = (title: string = '') => {
    const t = title.toLowerCase();
    if (t.includes('project')) return <FolderKanban className="h-3 w-3 text-blue-500" />;
    if (t.includes('invoice')) return <FileText className="h-3 w-3 text-emerald-500" />;
    if (t.includes('payment')) return <CreditCard className="h-3 w-3 text-emerald-600" />;
    if (t.includes('quote') || t.includes('quotation')) return <FileEdit className="h-3 w-3 text-purple-500" />;
    if (t.includes('note') || t.includes('comment')) return <MessageSquare className="h-3 w-3 text-amber-500" />;
    if (t.includes('lead')) return <Target className="h-3 w-3 text-rose-500" />;
    if (t.includes('client')) return <Users className="h-3 w-3 text-indigo-500" />;
    return <Activity className="h-3 w-3 text-slate-500" />;
  };

  const getActivityBg = (title: string = '') => {
    const t = title.toLowerCase();
    if (t.includes('project')) return 'bg-blue-50';
    if (t.includes('invoice')) return 'bg-emerald-50';
    if (t.includes('payment')) return 'bg-emerald-50';
    if (t.includes('quote') || t.includes('quotation')) return 'bg-purple-50';
    if (t.includes('note') || t.includes('comment')) return 'bg-amber-50';
    if (t.includes('lead')) return 'bg-rose-50';
    if (t.includes('client')) return 'bg-indigo-50';
    return 'bg-slate-100';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Overview for {activeWorkspace?.name}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateRangeFilter)}
              className="block w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-8 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="last_month">Last Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="this_year">This Year</option>
            </select>
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
          <button onClick={load} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50">
            <Activity className={classNames("h-5 w-5", loading ? "animate-spin" : "")} />
          </button>
        </div>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <button onClick={() => navigate('/clients')} className="text-left">
          <Card className="p-5 transition-shadow hover:shadow-md">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600">
              <Users className="h-4 w-4 text-blue-500" /> Total Active Clients
            </div>
            <div className="text-2xl font-bold text-slate-900">{kpis.activeClients}</div>
          </Card>
        </button>

        <button onClick={() => navigate('/clients')} className="text-left">
          <Card className="p-5 transition-shadow hover:shadow-md">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600">
              <Target className="h-4 w-4 text-emerald-500" /> New Leads
            </div>
            <div className="text-2xl font-bold text-slate-900">{kpis.newLeads}</div>
          </Card>
        </button>

        <button onClick={() => navigate('/projects')} className="text-left">
          <Card className="p-5 transition-shadow hover:shadow-md">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600">
              <Clock4 className="h-4 w-4 text-amber-500" /> Active Projects
            </div>
            <div className="text-2xl font-bold text-slate-900">{kpis.activeProjects}</div>
          </Card>
        </button>

        <button onClick={() => navigate('/quotations')} className="text-left">
          <Card className="p-5 transition-shadow hover:shadow-md">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600">
              <FileText className="h-4 w-4 text-purple-500" /> Quotes Created
            </div>
            <div className="text-2xl font-bold text-slate-900">{kpis.quotesCreated}</div>
            {showFinancials && <div className="mt-1 text-xs text-slate-500">Value: {formatCurrency(kpis.quoteValue)}</div>}
          </Card>
        </button>
      </div>

      {/* Financial Overview (Protected) */}
      {showFinancials && financials && (
        <Card className="p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Receipt className="h-5 w-5 text-slate-400" /> Financial Overview
          </h2>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <div className="text-sm font-medium text-slate-500">Invoiced</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(financials.totalInvoiced)}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500">Collected</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600">{formatCurrency(financials.totalCollected)}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500">Outstanding</div>
              <div className="mt-1 text-2xl font-bold text-amber-600">{formatCurrency(financials.totalOutstanding)}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500">Overdue</div>
              <div className="mt-1 text-2xl font-bold text-rose-600">{formatCurrency(financials.totalOverdue)}</div>
            </div>
          </div>
          
          
          {/* Revenue Chart (Recharts implementation) */}
          {revenueChart.length > 0 && (
            <div className="mt-8">
              <div className="mb-4 text-sm font-medium text-slate-700">Revenue Trend (Invoiced vs Collected)</div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueChart} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorInvoiced" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tickFormatter={(val) => formatDate(val)} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => '?' + (val/1000) + 'k'} />
                    <RechartsTooltip 
                      formatter={(value) => formatCurrency(Number(value))}
                      labelFormatter={(label) => formatDate(String(label))}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="invoiced" name="Invoiced" stroke="#3b82f6" fillOpacity={1} fill="url(#colorInvoiced)" />
                    <Area type="monotone" dataKey="collected" name="Collected" stroke="#10b981" fillOpacity={1} fill="url(#colorCollected)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Main Grid */}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        
        {/* Sales Pipeline */}
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 uppercase tracking-wider">Sales Funnel Visualization</h2>
          <div className="h-48 w-full mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { stage: 'New Leads', count: sales.leadsCreated, fill: '#3b82f6' },
                { stage: 'Converted', count: sales.leadsConverted, fill: '#10b981' },
                { stage: 'Quotes Sent', count: sales.quotesSent, fill: '#6366f1' },
                { stage: 'Quotes Won', count: sales.quotesApproved, fill: '#8b5cf6' }
              ]} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="stage" type="category" axisLine={false} tickLine={false} />
                <RechartsTooltip cursor={{fill: 'transparent'}} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#0f172a' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-600">Lead Conversion Rate</span>
            <span className="font-bold text-slate-900">
              {sales.leadsCreated > 0 ? Math.round((sales.leadsConverted / sales.leadsCreated) * 100) : 0}%
            </span>
          </div>
        </Card>

        {/* Project & Tasks */}

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 uppercase tracking-wider">Operations</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Active Projects</span>
              <span className="font-semibold text-blue-600">{projects.active}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Completed Projects</span>
              <span className="font-semibold text-emerald-600">{projects.completed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Delayed Projects</span>
              <span className="font-semibold text-rose-600">{projects.delayed}</span>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Tasks Completed</span>
                <span className="font-semibold text-slate-900">{tasks.completed} / {tasks.created}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Overdue Tasks</span>
              <span className="font-semibold text-amber-600">{tasks.overdue}</span>
            </div>
          </div>
        </Card>

        {/* Action Required */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 uppercase tracking-wider">
              <AlertTriangle className="h-4 w-4 text-rose-500" /> Action Required
            </h2>
          </div>
          {actionRequired.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-slate-400">
              <CheckCircle className="mb-2 h-8 w-8 text-emerald-400" />
              <p className="text-sm">You're all caught up!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {actionRequired.map((item: any) => (
                <button 
                  key={item.id} 
                  onClick={() => navigate(`/invoices/${item.id}`)}
                  className="flex w-full items-center justify-between rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-left transition-colors hover:bg-rose-50"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">Overdue Invoice {item.title}</div>
                    <div className="text-xs text-rose-600">Due {formatDate(item.due_date)}</div>
                  </div>
                  {showFinancials && <div className="font-semibold text-slate-900">{formatCurrency(item.amount)}</div>}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Activity */}
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 uppercase tracking-wider">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No recent activity.</p>
          ) : (
            <div className="space-y-4">
              {recentActivity.slice(0, 5).map((act: any) => (
                <div key={act.id} className="flex gap-3">
                  <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${getActivityBg(act.title)}`}>
                    {getActivityIcon(act.title)}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{act.title || 'System Activity'}</div>
                    {act.description && <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">{act.description}</div>}
                    <div className="mt-1 text-[10px] uppercase text-slate-400">{formatDate(act.event_date || act.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
