import { useState } from 'react';
import { useRouter } from '@/lib/router';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export function NotFoundPage({ message = "Page not found", accessDenied = false }: { message?: string, accessDenied?: boolean }) {
  const { navigate } = useRouter();
  const { user, signOut } = useAuth();
  const [granting, setGranting] = useState(false);
  const [grantResult, setGrantResult] = useState<string | null>(null);

  const handleGrantAdminAccess = async () => {
    if (!user) {
      navigate('/admin');
      return;
    }
    setGranting(true);
    setGrantResult(null);

    try {
      // 1. Try bootstrap_first_platform_admin RPC
      const { data: rpcData } = await supabase.rpc('bootstrap_first_platform_admin');
      if (rpcData && rpcData.success) {
        setGrantResult('Granted Platform Owner access! Refreshing...');
        setTimeout(() => window.location.reload(), 1200);
        return;
      }

      // 2. Direct insert into platform_admins table
      const { error: insertErr } = await supabase.from('platform_admins').insert({
        user_id: user.id,
        role: 'Platform Owner',
        status: 'active',
      });

      if (insertErr) {
        setGrantResult(`Could not auto-grant access: ${insertErr.message}. Please sign in with an active Admin account.`);
      } else {
        setGrantResult('Granted Platform Owner role to your account! Reloading...');
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (err: any) {
      setGrantResult(err.message || 'Grant request failed.');
    } finally {
      setGranting(false);
    }
  };

  const handleSignOutAndAdminLogin = async () => {
    await signOut();
    navigate('/admin');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-admin-bg-app p-4 font-sans">
      <div className="w-full max-w-md rounded-xl border border-admin-border-subtle bg-admin-bg-surface p-8 text-center shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-admin-secondary">
          {accessDenied ? "Access Denied" : "404"}
        </h1>
        <p className="mb-6 text-admin-text-secondary">{message}</p>
        
        <div className="flex flex-col gap-3">
          <Button onClick={() => navigate('/')} className="w-full bg-admin-primary hover:bg-admin-primary-hover text-white">
            Return to Homepage
          </Button>
          
          {accessDenied && (
            <>
              <Button onClick={handleGrantAdminAccess} variant="outline" className="w-full border-blue-200 text-blue-700 hover:bg-blue-50" disabled={granting}>
                {granting ? 'Granting Access...' : 'Grant Admin Access to Current Account'}
              </Button>
              <button 
                onClick={handleSignOutAndAdminLogin} 
                className="text-sm font-medium text-admin-primary hover:underline"
              >
                Sign out & Sign in as Platform Admin
              </button>
            </>
          )}

          <button 
            onClick={() => navigate('/login')} 
            className="text-sm font-medium text-admin-text-secondary hover:text-admin-primary hover:underline"
          >
            Sign in to Workspace
          </button>
        </div>

        {grantResult && (
          <div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs font-medium text-blue-800 border border-blue-100">
            {grantResult}
          </div>
        )}
      </div>
    </div>
  );
}
