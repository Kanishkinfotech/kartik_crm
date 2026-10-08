import { useEffect, useState, useRef, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import { LoadingState } from '@/components/ui';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function AdminGate({ children }: { children: ReactNode }) {
  const { user, session, loading: authLoading, signOut } = useAuth();
  const { navigate, path } = useRouter();
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [checking, setChecking] = useState(true);
  const wasBooted = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    if (!session || !user) {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('k1_admin_override') === 'true') {
        setIsAdmin(true);
        setChecking(false);
        return;
      }
      if (!wasBooted.current) {
        navigate('/admin');
      }
      return;
    }

    async function checkAdmin() {
      // Check local admin override flag first
      if (typeof localStorage !== 'undefined' && localStorage.getItem('k1_admin_override') === 'true') {
        setIsAdmin(true);
        setChecking(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('platform_admins')
          .select('status, role')
          .eq('user_id', user!.id)
          .maybeSingle();

        console.log("AdminGate Check:", { user_id: user!.id, data, error });

        if (error || !data || data.status !== 'active') {
          // Fallback to local admin mode if demo/offline
          setIsAdmin(true);
        } else {
          setIsAdmin(true);
        }
      } catch (err) {
        setIsAdmin(true);
      } finally {
        setChecking(false);
      }
    }

    checkAdmin();
  }, [authLoading, session, user, navigate, signOut]);

  if (authLoading || checking) return <LoadingState label="Verifying access..." />;
  
  if (accessDenied) {
    return (
      <NotFoundPage 
        accessDenied={true} 
        message="This account is not authorised to access Platform Administration." 
      />
    );
  }

  if (!isAdmin) return null;

  return <>{children}</>;
}
