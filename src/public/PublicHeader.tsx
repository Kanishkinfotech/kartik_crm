import { useEffect, useState } from 'react';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';

export function PublicHeader() {
  const { navigate } = useRouter();
  const { session, loginAsDemo } = useAuth();
  
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    
    // Check if user is admin
    supabase.from('platform_admins').select('id').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setIsAdmin(true);
      });
  }, [session]);

  const handleOpenUserPanel = () => {
    loginAsDemo();
    navigate('/dashboard');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 px-6 py-4 backdrop-blur-md shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        {/* Brand Logo */}
        <div 
          className="flex items-center gap-2.5 cursor-pointer group"
          onClick={() => navigate('/')}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 font-bold text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
            K1
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
            Kanishk One
          </span>
        </div>
        
        {/* Main Navigation Menu */}
        <nav className="hidden items-center gap-8 md:flex">
          <button onClick={() => navigate('/')} className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">
            Product
          </button>
          <a href="#features" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">
            Features
          </a>
          <a href="#workflow" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">
            How It Works
          </a>
          <button onClick={() => navigate('/pricing')} className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">
            Pricing
          </button>
        </nav>

        {/* Auth & Panel Buttons */}
        <div className="flex items-center gap-4">
          {!session ? (
            <>
              <button 
                onClick={() => navigate('/login')} 
                className="text-sm font-semibold text-slate-700 hover:text-blue-600 transition-colors"
              >
                Sign In
              </button>
              <Button 
                onClick={handleOpenUserPanel} 
                className="rounded-full px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-500/20 transition-all hover:shadow-lg hover:shadow-blue-500/30"
              >
                Open User Panel
              </Button>
            </>
          ) : (
            <>
              {isAdmin && (
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/admin')} 
                  className="rounded-full border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Platform Admin
                </Button>
              )}
              <Button 
                onClick={() => navigate('/dashboard')} 
                className="rounded-full px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-500/20"
              >
                Open Dashboard
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
