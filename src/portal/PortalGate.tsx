import { useEffect } from 'react';
import { useRouter, matchRoute } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { usePortal } from '@/lib/portal';
import { LoadingState, Button } from '@/components/ui';
import { PortalLogin } from './PortalLogin';
import { PortalAcceptInvite } from './PortalAcceptInvite';
import { PortalResetPassword } from './PortalResetPassword';
import { PortalLayout } from './PortalLayout';
import { PortalDashboard } from './PortalDashboard';
import { PortalQuotations } from './PortalQuotations';
import { PortalQuotationDetail } from './PortalQuotationDetail';
import { PortalInvoices } from './PortalInvoices';
import { PortalInvoiceDetail } from './PortalInvoiceDetail';
import { PortalProjects } from './PortalProjects';
import { PortalProjectDetail } from './PortalProjectDetail';
import { PortalSupport } from './PortalSupport';
import { PortalSupportDetail } from './PortalSupportDetail';
import { PortalChangeRequests } from './PortalChangeRequests';
import { PortalSettings } from './PortalSettings';
import { supabase } from '@/lib/supabase';

function PortalRoutes() {
  const { path } = useRouter();
  const normalizedPath = (path || '').split('?')[0].replace(/\/$/, '');

  if (
    normalizedPath === '/portal' ||
    normalizedPath === '/portal/dashboard' ||
    normalizedPath === '/portal/login' ||
    normalizedPath === ''
  ) {
    return <PortalDashboard />;
  }
  
  if (matchRoute('/portal/quotations', normalizedPath)) return <PortalQuotations />;
  const qMatch = matchRoute('/portal/quotations/:id', normalizedPath);
  if (qMatch) return <PortalQuotationDetail quotationId={qMatch.params.id} />;

  if (matchRoute('/portal/invoices', normalizedPath)) return <PortalInvoices />;
  const iMatch = matchRoute('/portal/invoices/:id', normalizedPath);
  if (iMatch) return <PortalInvoiceDetail invoiceId={iMatch.params.id} />;

  if (matchRoute('/portal/projects', normalizedPath)) return <PortalProjects />;
  const pMatch = matchRoute('/portal/projects/:id', normalizedPath);
  if (pMatch) return <PortalProjectDetail projectId={pMatch.params.id} />;

  if (matchRoute('/portal/approvals', normalizedPath)) return <PortalChangeRequests />;

  if (matchRoute('/portal/support', normalizedPath)) return <PortalSupport />;
  const sMatch = matchRoute('/portal/support/:id', normalizedPath);
  if (sMatch) return <PortalSupportDetail ticketId={sMatch.params.id} />;

  if (matchRoute('/portal/change-requests', normalizedPath)) return <PortalChangeRequests />;
  if (matchRoute('/portal/settings', normalizedPath)) return <PortalSettings />;

  // Foolproof fallback: always show the portal dashboard instead of "Portal page not found"
  return <PortalDashboard />;
}

export function PortalGate() {
  const { session, loading: authLoading } = useAuth();
  const { activeMembership, loading: portalLoading, memberships } = usePortal();
  const { path, navigate } = useRouter();

  const isOverride = typeof localStorage !== 'undefined' && (localStorage.getItem('k1_portal_override') === 'true' || localStorage.getItem('k1_user_override') === 'true');

  useEffect(() => {
    const normalized = (path || '').split('?')[0].replace(/\/$/, '');
    if ((session || isOverride) && (normalized === '/portal/login' || normalized === '/portal' || normalized === '')) {
      navigate('/portal/dashboard');
    }
  }, [session, isOverride, path, navigate]);

  if (authLoading) return <LoadingState label="Starting up..." />;
  
  // Public unauthenticated routes
  if (path.startsWith('/portal/accept-invite')) {
    return <PortalAcceptInvite />;
  }
  if (path.startsWith('/portal/reset-password')) {
    return <PortalResetPassword />;
  }

  // If not logged in and not on a public portal route, show login
  if (!session) {
    return <PortalLogin />;
  }

  if (portalLoading) return <LoadingState label="Loading your portal..." />;

  // If logged in but no active membership, offer demo mode access
  if (!activeMembership || memberships.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-sm">
            CP
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Client Portal Demo</h2>
          <p className="text-slate-600 mb-6 text-sm">
            You are logged in, but no client membership was found in the database. You can explore the Client Portal demo mode.
          </p>
          <div className="space-y-3">
            <Button
              onClick={() => {
                localStorage.setItem('k1_portal_override', 'true');
                window.location.reload();
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              Enter Demo Client Portal
            </Button>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-sm text-indigo-600 hover:underline block w-full text-center"
            >
              Back to CRM User Panel
            </button>
            <div className="pt-2">
              <button onClick={() => supabase.auth.signOut()} className="text-xs text-slate-400 hover:text-slate-600">Sign out</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PortalLayout>
      <PortalRoutes />
    </PortalLayout>
  );
}
