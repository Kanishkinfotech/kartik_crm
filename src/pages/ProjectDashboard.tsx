import { useCallback, useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { Card, ErrorState, StatusBadge, type BadgeTone, Select, Button } from '@/components/ui';
import { FolderKanban, AlertTriangle, Clock, CheckCircle2, ListTodo, Eye, FileCheck, PackageOpen, Activity, TrendingUp, TrendingDown, Minus, IndianRupee, RefreshCw, Calendar, Users, Briefcase, ChevronRight } from 'lucide-react';
import { formatDateTime, formatDate, formatCurrency, classNames } from '@/lib/format';
import type { Project, Task, Invoice, Payment, ClientRequirement, InternalReview, ClientApproval, ProjectActivity, Client } from '@/lib/types';
import { ResponsiveContainer, LineChart, Line, Area, AreaChart, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear, isWithinInterval, endOfDay, subDays, subWeeks, subMonths, subQuarters, subYears, parseISO, format } from 'date-fns';

const BRAND = {
  deepBlue: '#123B7A',
  electricBlue: '#2563EB',
  hoverBlue: '#1D4ED8',
  darkHeading: '#102A56',
  orange: '#F59E0B',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#D97706',
  info: '#0284C7',
  purple: '#7C3AED',
  neutral: '#64748B',
  border: '#E5EAF1',
  bg: '#F6F8FC',
  white: '#FFFFFF',
};

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'text-slate-600 bg-slate-50',
  success: 'text-emerald-700 bg-emerald-50',
  warning: 'text-amber-700 bg-amber-50',
  danger: 'text-rose-700 bg-rose-50',
  info: 'text-sky-700 bg-sky-50',
  brand: 'text-blue-700 bg-blue-50',
};

type DateRange = 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'this_year' | 'all';

export function ProjectDashboard() {
  const { activeWorkspace } = useWorkspace();
  const { navigate } = useRouter();
  
  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [requirements, setRequirements] = useState<ClientRequirement[]>([]);
  const [internalReviews, setInternalReviews] = useState<InternalReview[]>([]);
  const [clientApprovals, setClientApprovals] = useState<ClientApproval[]>([]);
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  const load = useCallback(async (isManualRefresh = false) => {
    if (!activeWorkspace) return;
    if (isManualRefresh) setIsRefreshing(true);
    else setLoading(true);
    setError(null);
    const ws = activeWorkspace.id;

    try {
      const [
        resProjects,
        resTasks,
        resInvoices,
        resPayments,
        resReqs,
        resRev,
        resApp,
        resAct,
        resClients
      ] = await Promise.all([
        supabase.from('projects').select('*').eq('workspace_id', ws).neq('status', 'archived'),
        supabase.from('tasks').select('*').eq('workspace_id', ws).neq('status', 'archived'),
        supabase.from('invoices').select('*').eq('workspace_id', ws).eq('is_deleted', false),
        supabase.from('payments').select('*').eq('workspace_id', ws).eq('is_deleted', false),
        supabase.from('client_requirements').select('*').eq('workspace_id', ws),
        supabase.from('internal_reviews').select('*').eq('workspace_id', ws),
        supabase.from('client_approvals').select('*').eq('workspace_id', ws),
        supabase.from('project_activities').select('*').eq('workspace_id', ws).order('event_date', { ascending: false }).limit(50),
        supabase.from('clients').select('id, business_name, contact_person').eq('workspace_id', ws)
      ]);

      setProjects((resProjects.data as Project[]) || []);
      setTasks((resTasks.data as Task[]) || []);
      setInvoices((resInvoices.data as Invoice[]) || []);
      setPayments((resPayments.data as Payment[]) || []);
      setRequirements((resReqs.data as ClientRequirement[]) || []);
      setInternalReviews((resRev.data as InternalReview[]) || []);
      setClientApprovals((resApp.data as ClientApproval[]) || []);
      setActivities((resAct.data as ProjectActivity[]) || []);
      setClients((resClients.data as Client[]) || []);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    }
    setLoading(false);
    setIsRefreshing(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  // DATE RANGE LOGIC
  const { currentStart, currentEnd, previousStart, previousEnd } = useMemo(() => {
    const now = new Date();
    let cStart: Date, pStart: Date, pEnd: Date;
    const cEnd = endOfDay(now);

    switch (dateRange) {
      case 'today':
        cStart = startOfDay(now);
        pStart = subDays(cStart, 1);
        pEnd = endOfDay(pStart);
        break;
      case 'this_week':
        cStart = startOfWeek(now, { weekStartsOn: 1 });
        pStart = subWeeks(cStart, 1);
        pEnd = endOfDay(subDays(cStart, 1));
        break;
      case 'this_month':
        cStart = startOfMonth(now);
        pStart = subMonths(cStart, 1);
        pEnd = endOfDay(subDays(cStart, 1));
        break;
      case 'this_quarter':
        cStart = startOfQuarter(now);
        pStart = subQuarters(cStart, 1);
        pEnd = endOfDay(subDays(cStart, 1));
        break;
      case 'this_year':
        cStart = startOfYear(now);
        pStart = subYears(cStart, 1);
        pEnd = endOfDay(subDays(cStart, 1));
        break;
      case 'all':
      default:
        cStart = new Date(2000, 0, 1);
        pStart = new Date(1900, 0, 1);
        pEnd = new Date(1999, 11, 31);
        break;
    }
    return { currentStart: cStart, currentEnd: cEnd, previousStart: pStart, previousEnd: pEnd };
  }, [dateRange]);

  const isInCurrent = (dateStr: string | null) => dateStr && isWithinInterval(parseISO(dateStr), { start: currentStart, end: currentEnd });
  const isInPrevious = (dateStr: string | null) => dateStr && isWithinInterval(parseISO(dateStr), { start: previousStart, end: previousEnd });

  // 1. TOP SUMMARY KPIs
  const kpis = useMemo(() => {
    const activeStatuses = ['not_started','planning','in_progress','waiting_client','internal_review','client_review'];
    const activeProjects = projects.filter(p => activeStatuses.includes(p.status));
    
    const createdCurrent = projects.filter(p => isInCurrent(p.created_at));
    const createdPrevious = projects.filter(p => isInPrevious(p.created_at));
    const completedCurrent = projects.filter(p => p.status === 'completed' && isInCurrent(p.actual_completion_date || p.updated_at));
    const completedPrevious = projects.filter(p => p.status === 'completed' && isInPrevious(p.actual_completion_date || p.updated_at));

    const today = new Date().toISOString().slice(0,10);
    const overdueProjects = activeProjects.filter(p => p.target_completion_date && p.target_completion_date < today);
    const blockedProjects = activeProjects.filter(p => p.health === 'blocked');
    const waitingClient = activeProjects.filter(p => p.status === 'waiting_client');

    const overdueTasks = tasks.filter(t => !['completed','cancelled'].includes(t.status) && t.due_date && t.due_date < today);
    const tasksDueToday = tasks.filter(t => !['completed','cancelled'].includes(t.status) && t.due_date === today);

    const pendingReviews = internalReviews.filter(r => r.status === 'pending');
    const pendingApprovals = clientApprovals.filter(a => ['sent','ready_to_send'].includes(a.status));
    const missingReqs = requirements.filter(r => ['requested','partially_received'].includes(r.status) && r.due_date && r.due_date < today);

    const getTrend = (cur: number, prev: number) => {
      if (dateRange === 'all') return null;
      if (prev === 0 && cur === 0) return { diff: 0, pct: 0 };
      if (prev === 0) return { diff: cur, pct: 100 };
      const diff = cur - prev;
      return { diff, pct: Math.round((diff / prev) * 100) };
    };

    const createdTrend = getTrend(createdCurrent.length, createdPrevious.length);
    const completedTrend = getTrend(completedCurrent.length, completedPrevious.length);

    return {
      cards: [
        { label: 'Active Projects', count: activeProjects.length, icon: FolderKanban, tone: 'brand', bg: '#EFF6FF', color: BRAND.electricBlue, subtext: 'Currently active', route: '/projects' },
        { label: 'Projects Created', count: createdCurrent.length, icon: FolderKanban, tone: 'info', bg: '#EFF6FF', color: BRAND.info, trend: createdTrend, route: '/projects' },
        { label: 'Projects Completed', count: completedCurrent.length, icon: CheckCircle2, tone: 'success', bg: '#F0FDF4', color: BRAND.success, trend: completedTrend, route: '/projects' },
        { label: 'Overdue Tasks', count: overdueTasks.length, icon: AlertTriangle, tone: 'danger', bg: '#FEF2F2', color: BRAND.danger, subtext: 'Past due date', route: '/tasks' },
      ],
      actions: {
        overdueProjects,
        blockedProjects,
        waitingClient,
        overdueTasks,
        pendingReviews,
        pendingApprovals,
        missingReqs,
        tasksDueToday
      }
    };
  }, [projects, tasks, internalReviews, clientApprovals, requirements, currentStart, currentEnd, previousStart, previousEnd, dateRange]);

  // 2 & 3. PROJECT STATUS & HEALTH
  const { statusData, healthData } = useMemo(() => {
    const sMap: Record<string, number> = {};
    const hMap: Record<string, number> = {};
    projects.forEach(p => {
      sMap[p.status] = (sMap[p.status] || 0) + 1;
      hMap[p.health] = (hMap[p.health] || 0) + 1;
    });

    const statusFormat = (s: string) => s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    return {
      statusData: Object.entries(sMap).map(([k,v]) => ({ name: statusFormat(k), value: v, originalKey: k })).sort((a,b) => b.value - a.value),
      healthData: Object.entries(hMap).map(([k,v]) => ({ name: statusFormat(k), value: v, originalKey: k })).sort((a,b) => b.value - a.value)
    };
  }, [projects]);

  const STATUS_COLORS: Record<string, string> = {
    not_started: '#94A3B8', // Soft grey-blue
    planning: BRAND.purple,
    in_progress: BRAND.electricBlue,
    waiting_client: BRAND.purple, // Requested Purple for waiting_client in health mapping but prompt says "Waiting for Client: Purple" under Project Status chart. Wait, let me use Purple here.
    internal_review: BRAND.info,
    client_review: BRAND.info,
    completed: BRAND.success,
    cancelled: BRAND.neutral, // Grey for cancelled
    archived: BRAND.neutral,
    on_hold: BRAND.orange // On Hold: Orange
  };

  const HEALTH_COLORS: Record<string, string> = {
    on_track: BRAND.success,
    at_risk: BRAND.orange,
    delayed: BRAND.danger,
    blocked: '#991B1B', // Deep red
    not_assessed: BRAND.neutral
  };

  // 4. PROJECT TREND OVER TIME
  const projectTrendData = useMemo(() => {
    const formatStr = (dateRange === 'this_year' || dateRange === 'all') ? 'MMM yyyy' : 'MMM dd';
    const grouped: Record<string, { name: string; created: number; completed: number }> = {};
    
    projects.forEach(p => {
      if (isInCurrent(p.created_at)) {
        const k = format(parseISO(p.created_at), formatStr);
        if(!grouped[k]) grouped[k] = { name: k, created: 0, completed: 0 };
        grouped[k].created++;
      }
      if (p.status === 'completed' && p.actual_completion_date && isInCurrent(p.actual_completion_date)) {
        const k = format(parseISO(p.actual_completion_date), formatStr);
        if(!grouped[k]) grouped[k] = { name: k, created: 0, completed: 0 };
        grouped[k].completed++;
      }
    });
    
    return Object.values(grouped).sort((a, b) => {
       const d1 = new Date(a.name).getTime();
       const d2 = new Date(b.name).getTime();
       return d1 - d2;
    });
  }, [projects, dateRange, currentStart, currentEnd]);

  // 5. TASK PERFORMANCE ANALYTICS
  const { taskStatusData, taskPriorityData, taskCompletionRate } = useMemo(() => {
    const sMap: Record<string, number> = {};
    const pMap: Record<string, number> = {};
    let totalCompleted = 0;
    
    tasks.forEach(t => {
      sMap[t.status] = (sMap[t.status] || 0) + 1;
      pMap[t.priority] = (pMap[t.priority] || 0) + 1;
      if (t.status === 'completed') totalCompleted++;
    });

    const statusFormat = (s: string) => s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    const taskStatusOrdered = ['todo', 'in_progress', 'in_review', 'client_review', 'completed', 'blocked', 'cancelled'];
    
    const mappedStatus = taskStatusOrdered.map(k => {
       if (sMap[k] !== undefined) {
         return { name: statusFormat(k), value: sMap[k], originalKey: k };
       }
       return null;
    }).filter(Boolean) as { name: string, value: number, originalKey: string }[];

    // Add any others not in ordered array
    Object.keys(sMap).forEach(k => {
      if (!taskStatusOrdered.includes(k)) {
        mappedStatus.push({ name: statusFormat(k), value: sMap[k], originalKey: k });
      }
    });

    return {
      taskStatusData: mappedStatus,
      taskPriorityData: Object.entries(pMap).map(([k,v]) => ({ name: statusFormat(k), value: v, originalKey: k })).sort((a,b) => b.value - a.value),
      taskCompletionRate: tasks.length > 0 ? Math.round((totalCompleted / tasks.length) * 100) : 0,
    };
  }, [tasks]);

  const TASK_STATUS_COLORS: Record<string, string> = {
    todo: BRAND.neutral,
    in_progress: BRAND.electricBlue,
    in_review: BRAND.info,
    client_review: BRAND.purple,
    completed: BRAND.success,
    cancelled: BRAND.danger,
    blocked: BRAND.danger,
  };

  const TASK_PRIORITY_COLORS: Record<string, string> = {
    low: BRAND.neutral,
    medium: BRAND.info,
    high: BRAND.orange,
    urgent: BRAND.danger,
  };

  // 7. CLIENT & WORKLOAD INSIGHTS
  const { topClients, pmWorkload } = useMemo(() => {
    const cMap: Record<string, number> = {};
    const pmMap: Record<string, { active: number, overdueTasks: number }> = {};
    
    projects.filter(p => !['completed','cancelled','archived'].includes(p.status)).forEach(p => {
      if (p.client_id) {
        cMap[p.client_id] = (cMap[p.client_id] || 0) + 1;
      }
      if (p.project_manager_id) {
        if (!pmMap[p.project_manager_id]) pmMap[p.project_manager_id] = { active: 0, overdueTasks: 0 };
        pmMap[p.project_manager_id].active++;
      }
    });

    const today = new Date().toISOString().slice(0, 10);
    tasks.filter(t => !['completed','cancelled'].includes(t.status) && t.due_date && t.due_date < today).forEach(t => {
      if (t.assigned_to) {
         if (!pmMap[t.assigned_to]) pmMap[t.assigned_to] = { active: 0, overdueTasks: 0 };
         pmMap[t.assigned_to].overdueTasks++;
      }
    });

    const tClients = Object.entries(cMap)
      .map(([id, count]) => {
        const c = clients.find(cl => cl.id === id);
        return { name: c?.business_name || c?.contact_person || 'Unknown', count, id };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    const workload = Object.entries(pmMap).map(([id, stats]) => {
      let status = 'Available Capacity';
      if (stats.active > 5 || stats.overdueTasks > 10) status = 'Attention Required';
      else if (stats.active > 3) status = 'High Workload';
      else if (stats.active > 1) status = 'Balanced';
      return { id, name: 'User ' + id.substring(0,4), ...stats, status };
    }).sort((a,b) => b.active - a.active).slice(0, 5);

    return { topClients: tClients, pmWorkload: workload };
  }, [projects, clients, tasks]);

  // 9. FINANCIAL ANALYTICS
  const financialData = useMemo(() => {
    let totalInvoiced = 0;
    let totalCollected = 0;
    let outstanding = 0;
    let overdueReceivable = 0;
    const today = new Date().toISOString().slice(0, 10);
    
    invoices.forEach(i => {
      if (dateRange === 'all' || isInCurrent(i.invoice_date || i.created_at)) {
        totalInvoiced += Number(i.total || 0);
        outstanding += Number(i.balance_due || 0);
        if (i.due_date && i.due_date < today) {
          overdueReceivable += Number(i.balance_due || 0);
        }
      }
    });

    payments.forEach(p => {
      if (p.verification_status === 'verified' && (dateRange === 'all' || isInCurrent(p.payment_date || p.created_at))) {
        totalCollected += Number(p.amount || 0);
      }
    });

    return { totalInvoiced, totalCollected, outstanding, overdueReceivable };
  }, [invoices, payments, dateRange, currentStart, currentEnd]);

  // 6 & 11. ACTION REQUIRED & DEADLINES
  const startingSoon = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    return projects
      .filter(p => p.start_date && p.start_date >= today && p.start_date <= nextWeek && p.status !== 'archived')
      .sort((a, b) => (a.start_date! > b.start_date! ? 1 : -1))
      .slice(0, 5);
  }, [projects]);

  const upcomingDeadlines = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    return projects
      .filter(p => p.target_completion_date && p.target_completion_date >= today && p.target_completion_date <= nextMonth && !['completed','cancelled','archived'].includes(p.status))
      .sort((a, b) => (a.target_completion_date! > b.target_completion_date! ? 1 : -1))
      .slice(0, 5);
  }, [projects]);

  if (loading) return (
    <div className="bg-[#F6F8FC] min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
      <div className="animate-pulse space-y-8 max-w-[1600px] mx-auto">
        <div className="h-16 bg-slate-200 rounded-lg w-full"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="h-32 bg-slate-200 rounded-[14px] w-full"></div>
          <div className="h-32 bg-slate-200 rounded-[14px] w-full"></div>
          <div className="h-32 bg-slate-200 rounded-[14px] w-full"></div>
          <div className="h-32 bg-slate-200 rounded-[14px] w-full"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-slate-200 rounded-[14px] w-full"></div>
          <div className="h-96 bg-slate-200 rounded-[14px] w-full"></div>
        </div>
      </div>
    </div>
  );
  
  if (error) return <ErrorState message={error} onRetry={() => load(false)} />;

  const TrendIndicator = ({ trend, subtext }: { trend?: { diff: number; pct: number } | null, subtext?: string }) => {
    if (trend) {
      const isPositive = trend.diff >= 0;
      const Icon = isPositive ? TrendingUp : TrendingDown;
      const color = isPositive ? 'text-emerald-600' : 'text-rose-600';
      return (
        <div className={`flex items-center gap-1 text-[13px] font-medium ${color}`}>
          <Icon className="h-4 w-4" />
          <span>{trend.diff > 0 ? '+' : ''}{trend.diff} ({trend.pct}%)</span>
          <span className="text-slate-400 font-normal ml-1">vs prev</span>
        </div>
      );
    }
    if (subtext) {
      return <div className="text-[13px] text-slate-500">{subtext}</div>;
    }
    return <div className="text-[13px] text-slate-400 flex items-center gap-1"><Minus className="h-4 w-4" /> No change</div>;
  };

  const actionItemsCount = kpis.actions.overdueProjects.length + kpis.actions.blockedProjects.length + kpis.actions.waitingClient.length + kpis.actions.overdueTasks.length + kpis.actions.missingReqs.length;

  return (
    <div className="bg-[#F6F8FC] min-h-screen px-4 md:px-6 lg:px-8 py-8 -m-4 md:-m-6 lg:-m-8">
      <div className="max-w-[1600px] mx-auto space-y-8">
        {/* HEADER & FILTERS */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#102A56] tracking-tight">Project Dashboard</h1>
            <p className="text-[#64748B] text-sm mt-1">Monitor delivery performance, deadlines, workload and client actions across active projects.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-[12px] border border-[#E5EAF1] shadow-sm">
            <Select value={dateRange} onChange={e => setDateRange(e.target.value as DateRange)} className="w-[180px] bg-transparent border-none focus:ring-0 text-[14px] font-medium text-[#172033]">
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="this_year">This Year</option>
              <option value="all">Lifetime</option>
            </Select>
            <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block"></div>
            <div className="text-[11px] text-[#94A3B8] hidden sm:block min-w-[100px] text-center">
              {lastRefreshed ? `Updated ${format(lastRefreshed, 'h:mm a')}` : ''}
            </div>
            <Button variant="ghost" size="sm" onClick={() => load(true)} className={`text-[#2563EB] hover:bg-blue-50 ${isRefreshing ? 'opacity-50' : ''}`} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="sr-only">Refresh</span>
            </Button>
          </div>
        </div>

        {/* SECTION: ACTION REQUIRED */}
        {actionItemsCount > 0 ? (
          <div className="bg-[#FEF2F2] border border-rose-200 rounded-[14px] p-6 shadow-sm flex flex-col md:flex-row gap-6 items-start">
            <div className="shrink-0 pt-1 w-full md:w-auto">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
                <h3 className="text-lg font-bold text-rose-900">Action Required</h3>
              </div>
              <p className="text-sm text-rose-700 max-w-xs">The following items require immediate operational attention to avoid delays.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
              {kpis.actions.overdueProjects.length > 0 && (
                <div onClick={() => navigate('/projects')} className="bg-white rounded-lg p-4 border border-rose-100 hover:border-rose-300 cursor-pointer shadow-sm transition-all group">
                  <div className="text-sm font-medium text-slate-600 mb-1 flex justify-between items-center">
                    Overdue Projects
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-rose-500 transition-colors" />
                  </div>
                  <div className="text-2xl font-bold text-rose-600">{kpis.actions.overdueProjects.length}</div>
                </div>
              )}
              {kpis.actions.overdueTasks.length > 0 && (
                <div onClick={() => navigate('/tasks')} className="bg-white rounded-lg p-4 border border-rose-100 hover:border-rose-300 cursor-pointer shadow-sm transition-all group">
                  <div className="text-sm font-medium text-slate-600 mb-1 flex justify-between items-center">
                    Overdue Tasks
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-rose-500 transition-colors" />
                  </div>
                  <div className="text-2xl font-bold text-rose-600">{kpis.actions.overdueTasks.length}</div>
                </div>
              )}
              {kpis.actions.blockedProjects.length > 0 && (
                <div onClick={() => navigate('/projects')} className="bg-white rounded-lg p-4 border border-rose-100 hover:border-rose-300 cursor-pointer shadow-sm transition-all group">
                  <div className="text-sm font-medium text-slate-600 mb-1 flex justify-between items-center">
                    Blocked Projects
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-rose-500 transition-colors" />
                  </div>
                  <div className="text-2xl font-bold text-rose-600">{kpis.actions.blockedProjects.length}</div>
                </div>
              )}
              {kpis.actions.waitingClient.length > 0 && (
                <div onClick={() => navigate('/projects')} className="bg-white rounded-lg p-4 border border-blue-100 hover:border-blue-300 cursor-pointer shadow-sm transition-all group">
                  <div className="text-sm font-medium text-slate-600 mb-1 flex justify-between items-center">
                    Waiting on Client
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                  <div className="text-2xl font-bold text-blue-600">{kpis.actions.waitingClient.length}</div>
                </div>
              )}
              {kpis.actions.missingReqs.length > 0 && (
                <div onClick={() => navigate('/projects')} className="bg-white rounded-lg p-4 border border-orange-100 hover:border-orange-300 cursor-pointer shadow-sm transition-all group">
                  <div className="text-sm font-medium text-slate-600 mb-1 flex justify-between items-center">
                    Overdue Reqs
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-orange-500 transition-colors" />
                  </div>
                  <div className="text-2xl font-bold text-orange-600">{kpis.actions.missingReqs.length}</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[#F0FDF4] border border-emerald-200 rounded-[14px] p-4 shadow-sm flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-800">You’re all caught up. No urgent project actions require attention.</span>
          </div>
        )}

        {/* SECTION: PRIMARY KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {kpis.cards.map((k, idx) => (
            <div key={idx} onClick={() => navigate(k.route)} className="block focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-[14px]">
              <Card className="p-5 h-full rounded-[14px] border-[#E5EAF1] hover:shadow-sm transition-all cursor-pointer group">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-[13px] font-medium text-[#64748B] mb-1">{k.label}</div>
                    <div className="text-[32px] font-bold text-[#172033] mb-2 leading-none">{k.count}</div>
                    <TrendIndicator trend={k.trend as any} subtext={k.subtext} />
                  </div>
                  <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[10px]" style={{ backgroundColor: k.bg, color: k.color }}>
                    <k.icon className="h-5 w-5" />
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>

        {/* SECTION: PROJECT STATUS & HEALTH */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 rounded-[14px] border-[#E5EAF1]">
            <h3 className="text-base font-semibold text-[#102A56] mb-1">Project Status Distribution</h3>
            <p className="text-[13px] text-[#64748B] mb-6">Proportion of active and closed projects.</p>
            {statusData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.originalKey] || BRAND.electricBlue} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => [value, 'Projects']} contentStyle={{ borderRadius: '12px', border: '1px solid #E5EAF1', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '13px', color: '#172033' }} />
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                      <tspan x="50%" dy="-0.5em" fontSize="24" fontWeight="bold" fill="#172033">{projects.length}</tspan>
                      <tspan x="50%" dy="1.5em" fontSize="12" fill="#64748B">Total</tspan>
                    </text>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center text-[#64748B]">
                <FolderKanban className="h-8 w-8 text-slate-300 mb-2" />
                <span className="text-sm">No projects are available for this period.</span>
              </div>
            )}
          </Card>

          <Card className="p-6 rounded-[14px] border-[#E5EAF1]">
            <h3 className="text-base font-semibold text-[#102A56] mb-1">Project Health Overview</h3>
            <p className="text-[13px] text-[#64748B] mb-6">Current delivery risk assessment.</p>
            {healthData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={healthData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
                      {healthData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={HEALTH_COLORS[entry.originalKey] || BRAND.electricBlue} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => [value, 'Projects']} contentStyle={{ borderRadius: '12px', border: '1px solid #E5EAF1', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '13px', color: '#172033' }} />
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                      <tspan x="50%" dy="-0.5em" fontSize="24" fontWeight="bold" fill="#172033">{projects.length}</tspan>
                      <tspan x="50%" dy="1.5em" fontSize="12" fill="#64748B">Total</tspan>
                    </text>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center text-[#64748B]">
                <Activity className="h-8 w-8 text-slate-300 mb-2" />
                <span className="text-sm">No project-health data available.</span>
              </div>
            )}
          </Card>
        </div>

        {/* SECTION: PROJECT VELOCITY TREND */}
        <Card className="p-6 rounded-[14px] border-[#E5EAF1]">
          <h3 className="text-base font-semibold text-[#102A56] mb-1">Project Velocity</h3>
          <p className="text-[13px] text-[#64748B] mb-6">Cadence of projects created vs completed over time.</p>
          {projectTrendData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={projectTrendData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BRAND.electricBlue} stopOpacity={0.1}/>
                      <stop offset="95%" stopColor={BRAND.electricBlue} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BRAND.success} stopOpacity={0.1}/>
                      <stop offset="95%" stopColor={BRAND.success} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5EAF1" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5EAF1', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }} />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '13px', color: '#172033' }} />
                  <Area type="monotone" dataKey="created" name="Projects Created" stroke={BRAND.electricBlue} strokeWidth={2} fillOpacity={1} fill="url(#colorCreated)" activeDot={{ r: 6 }} dot={false} />
                  <Area type="monotone" dataKey="completed" name="Projects Completed" stroke={BRAND.success} strokeWidth={2} fillOpacity={1} fill="url(#colorCompleted)" activeDot={{ r: 6 }} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center text-[#64748B]">
              <TrendingUp className="h-8 w-8 text-slate-300 mb-2" />
              <span className="text-sm">No trend data available for this period.</span>
            </div>
          )}
        </Card>

        {/* SECTION: TASK ANALYTICS */}
        <div>
          <h2 className="text-lg font-bold text-[#102A56] mb-4">Task Performance</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-6 lg:col-span-2 rounded-[14px] border-[#E5EAF1]">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-base font-semibold text-[#102A56]">Tasks by Status</h3>
                  <p className="text-[13px] text-[#64748B]">Current workflow bottleneck insights.</p>
                </div>
                <div className="bg-[#EFF6FF] text-[#2563EB] px-3 py-1.5 rounded-full text-[13px] font-medium border border-[#BFDBFE]">
                  {taskCompletionRate}% Completion Rate
                </div>
              </div>
              {taskStatusData.length > 0 ? (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={taskStatusData} layout="vertical" margin={{ top: 5, right: 30, left: 50, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E5EAF1" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} width={110} />
                      <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5EAF1', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }} />
                      <Bar dataKey="value" name="Tasks" radius={[0, 4, 4, 0]} barSize={24}>
                        {taskStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={TASK_STATUS_COLORS[entry.originalKey] || BRAND.electricBlue} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] flex flex-col items-center justify-center text-[#64748B]">
                  <ListTodo className="h-8 w-8 text-slate-300 mb-2" />
                  <span className="text-sm">Task activity will appear after tasks are created.</span>
                </div>
              )}
            </Card>
            
            <Card className="p-6 rounded-[14px] border-[#E5EAF1]">
              <h3 className="text-base font-semibold text-[#102A56] mb-1">Tasks by Priority</h3>
              <p className="text-[13px] text-[#64748B] mb-6">Distribution of task urgency.</p>
              {taskPriorityData.length > 0 ? (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={taskPriorityData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={2} dataKey="value">
                        {taskPriorityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={TASK_PRIORITY_COLORS[entry.originalKey] || BRAND.neutral} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => [value, 'Tasks']} contentStyle={{ borderRadius: '12px', border: '1px solid #E5EAF1', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '13px', color: '#172033' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] flex flex-col items-center justify-center text-[#64748B]">
                  <ListTodo className="h-8 w-8 text-slate-300 mb-2" />
                  <span className="text-sm">No task data available.</span>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* SECTION: DELIVERY & DEADLINES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-bold text-[#102A56] mb-4">Delivery & Deadlines</h2>
            <Card className="p-0 overflow-hidden rounded-[14px] border-[#E5EAF1]">
              <div className="p-5 border-b border-[#E5EAF1] bg-[#F8FAFC]">
                <h3 className="text-base font-semibold text-[#102A56]">Upcoming Deadlines</h3>
                <p className="text-[13px] text-[#64748B]">Projects due in the next 30 days.</p>
              </div>
              {upcomingDeadlines.length === 0 ? (
                <div className="p-8 text-center text-[#64748B] flex flex-col items-center">
                  <Calendar className="h-8 w-8 text-slate-300 mb-2" />
                  <span className="text-sm">No project deadlines approaching.</span>
                </div>
              ) : (
                <div className="divide-y divide-[#E5EAF1]">
                  {upcomingDeadlines.map(p => {
                    const diffDays = Math.ceil((new Date(p.target_completion_date!).getTime() - new Date().getTime()) / 86400000);
                    let badgeTone: BadgeTone = 'neutral';
                    if (diffDays < 0) badgeTone = 'danger';
                    else if (diffDays <= 3) badgeTone = 'warning';
                    else badgeTone = 'brand';
                    
                    return (
                      <div key={p.id} className="p-4 hover:bg-slate-50 cursor-pointer transition-colors flex justify-between items-center group" onClick={() => navigate(`/projects/${p.id}`)}>
                        <div className="flex flex-col">
                          <span className="text-[14px] font-semibold text-[#172033] truncate max-w-[200px] sm:max-w-[300px]">{p.title}</span>
                          <span className="text-[12px] text-[#64748B] mt-0.5">{p.project_number}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right flex flex-col items-end">
                            <span className="text-[13px] font-medium text-[#172033]">{formatDate(p.target_completion_date!)}</span>
                            <StatusBadge status={diffDays < 0 ? 'Overdue' : `${diffDays}d left`} tone={badgeTone} />
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-300 hidden sm:block group-hover:text-blue-500" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <div>
            <h2 className="text-lg font-bold text-[#102A56] mb-4">Starting Soon</h2>
            <Card className="p-0 overflow-hidden rounded-[14px] border-[#E5EAF1]">
              <div className="p-5 border-b border-[#E5EAF1] bg-[#F8FAFC]">
                <h3 className="text-base font-semibold text-[#102A56]">Projects Starting Soon</h3>
                <p className="text-[13px] text-[#64748B]">Kickoffs scheduled for the next 14 days.</p>
              </div>
              {startingSoon.length === 0 ? (
                <div className="p-8 text-center text-[#64748B] flex flex-col items-center">
                  <FolderKanban className="h-8 w-8 text-slate-300 mb-2" />
                  <span className="text-sm">No new projects starting soon.</span>
                </div>
              ) : (
                <div className="divide-y divide-[#E5EAF1]">
                  {startingSoon.map(p => (
                    <div key={p.id} className="p-4 hover:bg-slate-50 cursor-pointer transition-colors flex justify-between items-center group" onClick={() => navigate(`/projects/${p.id}`)}>
                      <div className="flex flex-col">
                        <span className="text-[14px] font-semibold text-[#172033] truncate max-w-[200px] sm:max-w-[300px]">{p.title}</span>
                        <span className="text-[12px] text-[#64748B] mt-0.5">{p.project_number}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right flex flex-col items-end">
                          <span className="text-[13px] font-medium text-[#172033]">{formatDate(p.start_date!)}</span>
                          <span className="text-[12px] text-[#64748B] capitalize">{p.status.replace('_', ' ')}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300 hidden sm:block group-hover:text-blue-500" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* SECTION: WORKLOAD & CLIENT INSIGHTS */}
        <div>
          <h2 className="text-lg font-bold text-[#102A56] mb-4">Workload & Client Insights</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6 rounded-[14px] border-[#E5EAF1]">
              <h3 className="text-base font-semibold text-[#102A56] mb-1">Top Clients</h3>
              <p className="text-[13px] text-[#64748B] mb-6">Clients with the most active projects.</p>
              {topClients.length > 0 ? (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topClients} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E5EAF1" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} width={120} />
                      <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5EAF1', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }} />
                      <Bar dataKey="count" name="Active Projects" fill={BRAND.electricBlue} radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] flex flex-col items-center justify-center text-[#64748B]">
                  <Briefcase className="h-8 w-8 text-slate-300 mb-2" />
                  <span className="text-sm">No client project data available.</span>
                </div>
              )}
            </Card>

            <Card className="p-0 overflow-hidden rounded-[14px] border-[#E5EAF1]">
              <div className="p-6 border-b border-[#E5EAF1] bg-[#F8FAFC]">
                <h3 className="text-base font-semibold text-[#102A56]">Project Manager Workload</h3>
                <p className="text-[13px] text-[#64748B]">Active projects and overdue tasks by manager.</p>
              </div>
              {pmWorkload.length === 0 ? (
                <div className="p-8 text-center text-[#64748B] flex flex-col items-center">
                  <Users className="h-8 w-8 text-slate-300 mb-2" />
                  <span className="text-sm">No project managers assigned.</span>
                </div>
              ) : (
                <div className="divide-y divide-[#E5EAF1]">
                  {pmWorkload.map(pm => (
                    <div key={pm.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-[#EFF6FF] rounded-full flex items-center justify-center text-[#2563EB] font-bold text-sm">
                          {pm.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-[14px] font-semibold text-[#172033]">{pm.name}</div>
                          <div className="text-[12px] text-[#64748B]">{pm.status}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex flex-col items-end">
                          <span className="text-[#64748B] text-[12px]">Active</span>
                          <span className="font-semibold text-[#172033]">{pm.active}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[#64748B] text-[12px]">Overdue Tasks</span>
                          <span className={`font-semibold ${pm.overdueTasks > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{pm.overdueTasks}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* SECTION: APPROVALS, REVIEWS, FINANCIALS */}
        <div>
          <h2 className="text-lg font-bold text-[#102A56] mb-4">Operations & Financials</h2>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div onClick={() => navigate('/projects')} className="block cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-[12px]">
                <Card className="p-5 flex items-center gap-4 rounded-[12px] border-[#E5EAF1] hover:border-[#BFDBFE] transition-colors">
                  <div className="bg-blue-50 p-3 rounded-xl text-[#2563EB]"><Eye className="h-5 w-5" /></div>
                  <div>
                    <div className="text-[24px] font-bold text-[#172033] leading-none mb-1">{kpis.actions.pendingReviews.length}</div>
                    <div className="text-[13px] font-medium text-[#64748B]">Pending Reviews</div>
                  </div>
                </Card>
              </div>
              <div onClick={() => navigate('/projects')} className="block cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-[12px]">
                <Card className="p-5 flex items-center gap-4 rounded-[12px] border-[#E5EAF1] hover:border-purple-200 transition-colors">
                  <div className="bg-purple-50 p-3 rounded-xl text-purple-600"><FileCheck className="h-5 w-5" /></div>
                  <div>
                    <div className="text-[24px] font-bold text-[#172033] leading-none mb-1">{kpis.actions.pendingApprovals.length}</div>
                    <div className="text-[13px] font-medium text-[#64748B]">Pending Approvals</div>
                  </div>
                </Card>
              </div>
              <div onClick={() => navigate('/projects')} className="block cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-[12px]">
                <Card className="p-5 flex items-center gap-4 rounded-[12px] border-[#E5EAF1] hover:border-orange-200 transition-colors">
                  <div className="bg-orange-50 p-3 rounded-xl text-orange-600"><PackageOpen className="h-5 w-5" /></div>
                  <div>
                    <div className="text-[24px] font-bold text-[#172033] leading-none mb-1">{requirements.filter(r => ['requested', 'partially_received'].includes(r.status)).length}</div>
                    <div className="text-[13px] font-medium text-[#64748B]">Missing Requirements</div>
                  </div>
                </Card>
              </div>
            </div>

            <Card className="p-8 lg:col-span-3 rounded-[14px] border-[#E5EAF1] flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-8">
                <IndianRupee className="h-6 w-6 text-[#16A34A]" />
                <h3 className="text-xl font-bold text-[#102A56]">Financial Snapshot</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                <div className="space-y-1 border-l-4 border-[#7C3AED] pl-4">
                  <div className="text-[14px] font-medium text-[#64748B]">Total Invoiced</div>
                  <div className="text-3xl font-bold text-[#172033]">{formatCurrency(financialData.totalInvoiced)}</div>
                </div>
                <div className="space-y-1 border-l-4 border-[#16A34A] pl-4">
                  <div className="text-[14px] font-medium text-[#64748B]">Total Collected</div>
                  <div className="text-3xl font-bold text-[#16A34A]">{formatCurrency(financialData.totalCollected)}</div>
                </div>
                <div className="space-y-1 border-l-4 border-[#F59E0B] pl-4">
                  <div className="text-[14px] font-medium text-[#64748B]">Outstanding</div>
                  <div className="text-3xl font-bold text-[#D97706]">{formatCurrency(financialData.outstanding)}</div>
                </div>
              </div>
              {financialData.overdueReceivable > 0 && (
                <div className="mt-8 bg-rose-50 text-rose-700 p-4 rounded-[10px] flex flex-col sm:flex-row sm:items-center justify-between border border-rose-100">
                  <div className="flex items-center gap-2 font-medium mb-2 sm:mb-0">
                    <AlertTriangle className="h-5 w-5" />
                    Overdue Receivables
                  </div>
                  <div className="font-bold text-lg">{formatCurrency(financialData.overdueReceivable)}</div>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* SECTION: RECENT ACTIVITY */}
        <Card className="p-6 rounded-[14px] border-[#E5EAF1]">
          <h3 className="text-base font-semibold text-[#102A56] mb-6 flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#64748B]" /> Recent Activity
          </h3>
          {activities.length === 0 ? (
            <div className="py-8 text-center text-[#64748B] flex flex-col items-center">
              <Activity className="h-8 w-8 text-slate-300 mb-2" />
              <span className="text-sm">No recent operational activity.</span>
            </div>
          ) : (
            <div className="relative border-l-2 border-[#E5EAF1] ml-3 space-y-6 pb-4">
              {activities.slice(0, 10).map((a) => (
                <div key={a.id} className="relative pl-6">
                  <div className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full bg-white border-2 border-[#2563EB]" />
                  <div className="bg-[#F8FAFC] rounded-[10px] p-3 hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-[#E5EAF1]" onClick={() => navigate(`/projects/${a.project_id}`)}>
                    <div className="text-[14px] font-medium text-[#172033]">{a.title || a.event_type.replace(/_/g, ' ')}</div>
                    <div className="text-[12px] text-[#64748B] mt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <span className="truncate">{a.description?.substring(0, 100) || 'Status updated'}</span>
                      <span className="font-medium shrink-0">{formatDateTime(a.event_date)}</span>
                    </div>
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
