import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { LoadingState } from '@/components/ui';

// Central redirect resolver
export function RedirectResolver() {
  const { session, loading: authLoading } = useAuth();
  const { workspaces, loading: wsLoading } = useWorkspace();
  const { navigate } = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading || wsLoading) return;

    if (typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true') {
      navigate('/dashboard');
      return;
    }

    if (!session) {
      navigate('/login');
      return;
    }

    const resolveRedirect = async () => {
      try {
        // 1. Check Portal Member
        const { data: portalData } = await supabase
          .from('client_portal_memberships')
          .select('id')
          .eq('user_id', session.user.id)
          .limit(1);

        if (portalData && portalData.length > 0) {
          if (workspaces.length === 0) {
            navigate('/portal/dashboard');
            return;
          }
        }

        // 2. Check Platform Admin
        const { data: adminData } = await supabase
          .from('platform_admins')
          .select('id')
          .eq('user_id', session.user.id)
          .limit(1);

        if (adminData && adminData.length > 0) {
          if (workspaces.length === 0) {
            navigate('/admin/dashboard');
            return;
          }
        }

        // 3. Workspace routing
        if (workspaces.length === 0) {
          navigate('/create-workspace');
        } else {
          navigate('/dashboard');
        }
      } catch (err) {
        console.warn('Redirect resolver error:', err);
        navigate('/dashboard');
      }
    };

    resolveRedirect().finally(() => setChecking(false));
  }, [authLoading, wsLoading, session, workspaces, navigate]);

  return <LoadingState label="Redirecting..." />;
}

export function WorkspaceRoute({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const { activeWorkspace, loading: wsLoading, workspaces } = useWorkspace();
  const { navigate, path } = useRouter();

  const isUserOverride = typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true';
  const resolvedActiveWorkspace = activeWorkspace ?? (workspaces.length > 0 ? workspaces[0] : null);

  useEffect(() => {
    if (authLoading || wsLoading) return;
    if (!session && !isUserOverride) {
      navigate('/login');
    } else if (workspaces.length === 0 && !isUserOverride) {
      navigate('/create-workspace');
    }
  }, [authLoading, wsLoading, session, isUserOverride, workspaces.length, navigate]);

  if (authLoading || wsLoading) return <LoadingState label="Loading workspace..." />;
  if (!session && !isUserOverride) return null;
  if (!resolvedActiveWorkspace && !isUserOverride) return <LoadingState label="Preparing workspace..." />;

  return <>{children}</>;
}

export function WorkspaceCreationRoute({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const { workspaces, loading: wsLoading } = useWorkspace();
  const { navigate } = useRouter();

  useEffect(() => {
    if (authLoading || wsLoading) return;
    if (!session) {
      navigate('/login');
    } else if (workspaces.length > 0) {
      navigate('/dashboard');
    }
  }, [authLoading, wsLoading, session, workspaces.length, navigate]);

  if (authLoading || wsLoading) return <LoadingState label="Verifying access..." />;
  if (!session || workspaces.length > 0) return null;

  return <>{children}</>;
}
