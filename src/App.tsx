import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { WorkspaceProvider } from '@/lib/workspace';
import { RouterProvider, useRouter, matchRoute } from '@/lib/router';
import { AppShell } from '@/components/AppShell';

// Auth & Guards
import { AuthScreen } from '@/pages/AuthScreen';
import { AdminLogin } from '@/admin/AdminLogin';
import { RedirectResolver, WorkspaceRoute, WorkspaceCreationRoute } from '@/lib/Guards';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LoadingState } from '@/components/ui';

// Workspace Pages
import { Dashboard } from '@/pages/Dashboard';
import { ClientsMasterDetail } from '@/pages/ClientsMasterDetail';
import { LeadsList } from '@/pages/LeadsList';
import { ServicesList } from '@/pages/ServicesList';
import { QuotationsList, QuotationEditor } from '@/pages/QuotationsList';
import { InvoicesList, InvoiceEditor } from '@/pages/InvoicesList';
import { PaymentsList, PaymentDetail } from '@/pages/PaymentsList';
import { SettingsPage } from '@/pages/SettingsPage';
import { IntegrationSettings } from '@/pages/IntegrationSettings';
import { CommunicationCentre } from '@/pages/CommunicationCentre';
import { PaymentReconciliationPage } from '@/pages/PaymentReconciliation';
import { ProjectsList, CreateProjectModal } from '@/pages/ProjectsList';
import { ProjectDetail } from '@/pages/ProjectDetail';
import { TasksList, MyTasks } from '@/pages/TasksList';
import { WorkReportsList, WorkReportEditor } from '@/pages/WorkReports';
import { ProjectDashboard } from '@/pages/ProjectDashboard';
import { TeamWorkload } from '@/pages/Workload';
import { AutomationsList } from '@/pages/AutomationsList';
import { AutomationBuilder } from '@/pages/AutomationBuilder';
import { AutomationDetail } from '@/pages/AutomationDetail';
import { AutomationRunHistory } from '@/pages/AutomationRunHistory';
import { AutomationApprovals } from '@/pages/AutomationApprovals';
import { AutomationFailedRuns } from '@/pages/AutomationFailedRuns';
import { AutomationTemplates } from '@/pages/AutomationTemplates';
import { AutomationUsage } from '@/pages/AutomationUsage';
import { AutomationSettingsPage } from '@/pages/AutomationSettingsPage';
import { AISettings } from '@/pages/AISettings';
import { DocumentationPage } from '@/pages/DocumentationPage';

// Portal & Admin
import { PortalProvider } from '@/lib/portal';
import { PortalGate } from '@/portal/PortalGate';
import { EntitlementProvider } from '@/lib/entitlements';
import { AdminGate } from '@/admin/AdminGate';
import { AdminLayout } from '@/admin/AdminLayout';
import { AdminDashboard } from '@/admin/AdminDashboard';
import { AdminWorkspaces } from '@/admin/AdminWorkspaces';
import { AdminPlans } from '@/admin/AdminPlans';
import { AdminUsers } from '@/admin/AdminUsers';
import { AdminSubscriptions } from '@/admin/AdminSubscriptions';
import { AdminPayments } from '@/admin/AdminPayments';
import { AdminInvoices } from '@/admin/AdminInvoices';
import { AdminUsage } from '@/admin/AdminUsage';
import { AdminSupport } from '@/admin/AdminSupport';
import { AdminAnnouncements } from '@/admin/AdminAnnouncements';
import { AdminAudit } from '@/admin/AdminAudit';
import { AdminSettings } from '@/admin/AdminSettings';

// Public & Onboarding
import { PublicRoutes } from '@/public/PublicRoutes';
import { HomePage } from '@/public/HomePage';
import { OnboardingGate } from '@/onboarding/OnboardingGate';

function WorkspaceRoutes() {
  const { path } = useRouter();

  if (matchRoute('/automations/new', path)) return <AutomationBuilder automationId={null} />;
  if (matchRoute('/automations/templates', path)) return <AutomationTemplates />;
  if (matchRoute('/automations/runs', path)) return <AutomationRunHistory />;
  if (matchRoute('/automations/failed', path)) return <AutomationFailedRuns />;
  if (matchRoute('/automations/approvals', path)) return <AutomationApprovals />;
  if (matchRoute('/automations/usage', path)) return <AutomationUsage />;
  const autoEditMatch = matchRoute('/automations/:id/edit', path);
  if (autoEditMatch) return <AutomationBuilder automationId={autoEditMatch.params.id} />;
  const autoMatch = matchRoute('/automations/:id', path);
  if (autoMatch) return <AutomationDetail automationId={autoMatch.params.id} />;
  if (matchRoute('/automations', path)) return <AutomationsList />;
  if (matchRoute('/settings/automations', path)) return <AutomationSettingsPage />;

  // Redirect everything else to automations
  setTimeout(() => {
    window.location.hash = '/automations';
  }, 0);
  return <LoadingState label="Redirecting..." />;
}

function Root() {
  const { path } = useRouter();
  const { session, loading } = useAuth();

  if (loading) return <LoadingState label="Starting up..." />;

  // Central Redirect Resolver
  if (path === '/resolve-login') {
    return (
      <WorkspaceProvider>
        <RedirectResolver />
      </WorkspaceProvider>
    );
  }

  // 1. PUBLIC WEBSITE ROUTES
  if (path === '/') return <HomePage />;
  if (path === '/pricing' || path === '/verify-email' || path === '/forgot-password' || path === '/reset-password') {
    return <PublicRoutes path={path} />;
  }
  
  // Auth Pages
  if (path === '/login') {
    if (session) return <WorkspaceProvider><RedirectResolver /></WorkspaceProvider>;
    return <AuthScreen defaultMode="login" />;
  }
  if (path === '/signup') {
    if (session) return <WorkspaceProvider><RedirectResolver /></WorkspaceProvider>;
    return <AuthScreen defaultMode="signup" />;
  }

  // 2. END-CLIENT PORTAL ROUTES
  if (path.startsWith('/portal')) {
    return (
      <PortalProvider>
        <PortalGate />
      </PortalProvider>
    );
  }
  // 3. PLATFORM SUPER ADMIN ROUTES
  if (path.startsWith('/admin')) {
    const isOverride = typeof localStorage !== 'undefined' && localStorage.getItem('k1_admin_override') === 'true';

    if (path === '/admin' && !session && !isOverride) {
      return <AdminLogin />;
    }
    
    // Redirect authenticated /admin to /admin/dashboard
    if (path === '/admin') {
      setTimeout(() => {
        window.location.hash = '/admin/dashboard';
      }, 0);
      return <LoadingState label="Loading Admin Dashboard..." />;
    }
    
    return (
      <AdminGate>
        <AdminLayout path={path}>
          {path === '/admin' && <AdminDashboard />}
          {path === '/admin/dashboard' && <AdminDashboard />}
          {path === '/admin/workspaces' && <AdminWorkspaces />}
          {path === '/admin/plans' && <AdminPlans />}
          {path === '/admin/subscriptions' && <AdminSubscriptions />}
          {path === '/admin/payments' && <AdminPayments />}
          {path === '/admin/invoices' && <AdminInvoices />}
          {path === '/admin/usage' && <AdminUsage />}
          {path === '/admin/support' && <AdminSupport />}
          {path === '/admin/announcements' && <AdminAnnouncements />}
          {path === '/admin/audit' && <AdminAudit />}
          {path === '/admin/admin-users' && <AdminUsers />}
          {path === '/admin/settings' && <AdminSettings />}
          {/* Default 404 for admin area if nothing matches */}
          {!['/admin', '/admin/dashboard', '/admin/workspaces', '/admin/plans', '/admin/subscriptions', '/admin/payments', '/admin/invoices', '/admin/usage', '/admin/support', '/admin/announcements', '/admin/audit', '/admin/admin-users', '/admin/settings'].includes(path) && <NotFoundPage />}
        </AdminLayout>
      </AdminGate>
    );
  }

  // 4. WORKSPACE ONBOARDING
  if (path === '/create-workspace' || path === '/onboarding') {
    return (
      <WorkspaceProvider>
        <WorkspaceCreationRoute>
          <OnboardingGate path={path} />
        </WorkspaceCreationRoute>
      </WorkspaceProvider>
    );
  }

  // 5. WORKSPACE APPLICATION ROUTES
  return (
    <WorkspaceProvider>
      <WorkspaceRoute>
        <EntitlementProvider>
          <AppShell>
            <WorkspaceRoutes />
          </AppShell>
        </EntitlementProvider>
      </WorkspaceRoute>
    </WorkspaceProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider>
        <Root />
      </RouterProvider>
    </AuthProvider>
  );
}

