import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button, Field, TextInput } from '@/components/ui';
import { LogIn, LayoutDashboard, ArrowLeft } from 'lucide-react';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export function PortalLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { navigate } = useRouter();
  const { loginAsDemo } = useAuth();

  const handleOpenDemo = () => {
    localStorage.setItem('k1_portal_override', 'true');
    localStorage.setItem('k1_user_override', 'true');
    loginAsDemo();
    toast.success("Welcome to the Client Portal demo!");
    navigate('/portal/dashboard');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const authPromise = supabase.auth.signInWithPassword({
        email,
        password,
      });
      const timeoutPromise = new Promise<{ data: any; error: any }>((_, reject) =>
        setTimeout(() => reject(new Error('Network connection timeout to Supabase')), 3500)
      );

      const res = await Promise.race([authPromise, timeoutPromise]);
      if (res.error) {
        toast.error(res.error.message);
        setLoading(false);
        return;
      }
      
      toast.success("Successfully logged in.");
      navigate('/portal/dashboard');
    } catch (err: any) {
      console.warn("Client portal login network error, falling back to demo:", err);
      toast.info("Supabase is unreachable (ISP network block). Opening Demo Client Portal.");
      handleOpenDemo();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <div>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-sm">
            CP
          </div>
          <h2 className="mt-2 text-center text-3xl font-bold tracking-tight text-slate-900">
            Client Portal
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Log in to view your projects, quotations, and invoices.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4 rounded-md shadow-sm">
            <Field label="Email address" required>
              <TextInput
                type="email"
                required
                value={email}
                onChange={(e: any) => setEmail(e.target.value)}
                placeholder="client@company.com"
              />
            </Field>
            <Field label="Password" required>
              <TextInput
                type="password"
                required
                value={password}
                onChange={(e: any) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <button
                type="button"
                onClick={() => navigate('/portal/reset-password')}
                className="font-medium text-indigo-600 hover:text-indigo-500"
              >
                Forgot your password?
              </button>
            </div>
          </div>

          <div>
            <Button type="submit" disabled={loading} className="w-full flex justify-center bg-indigo-600 hover:bg-indigo-700">
              {loading ? 'Signing in...' : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In
                </>
              )}
            </Button>
          </div>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400 font-medium">Or</span></div>
        </div>

        <button
          type="button"
          onClick={handleOpenDemo}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/90 py-2.5 px-4 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 shadow-sm"
        >
          <LayoutDashboard className="h-4 w-4 text-indigo-600" />
          Open Demo Client Portal (Instant Access)
        </button>

        <div className="mt-6 text-center border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Return to CRM Staff Login
          </button>
        </div>
      </div>
    </div>
  );
}
