import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { Button, Field, TextInput } from '@/components/ui';
import { LogIn, UserPlus, LayoutDashboard } from 'lucide-react';

export function AuthScreen({ defaultMode = 'login' }: { defaultMode?: 'login' | 'signup' }) {
  const { signIn, signUp, loginAsDemo } = useAuth();
  const { navigate } = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signupEnabled, setSignupEnabled] = useState(true);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    // supabase.from('platform_settings').select('public_signup_enabled').single().then(({ data }) => {
    //   if (data) setSignupEnabled(data.public_signup_enabled);
    // });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (mode === 'login') {
      const { error } = await signIn(email, password);
      setBusy(false);
      if (error) setError(error);
      else {
        // Redirection is handled by RedirectResolver in App.tsx!
      }
    } else {
      const { error } = await signUp(email, password, fullName);
      setBusy(false);
      if (error) setError(error);
      else {
        navigate('/verify-email');
      }
    }
  };

  const handleOpenUserPanel = () => {
    loginAsDemo();
    navigate('/dashboard');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-sm">K1</div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {mode === 'login' ? 'Sign in to Kanishk One' : 'Create your Kanishk One account'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'login' 
              ? 'Access your workspace and manage your business operations.' 
              : 'Start managing clients, quotations, invoices and projects from one workspace.'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => { navigate('/login'); setError(null); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LogIn className="h-4 w-4" /> Sign in
            </button>
            {signupEnabled && (
              <button
                onClick={() => { navigate('/signup'); setError(null); }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <UserPlus className="h-4 w-4" /> Sign up
              </button>
            )}
          </div>
          
          {!signupEnabled && mode === 'signup' && (
            <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Registration is temporarily unavailable.
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <Field label="Full name" required>
                <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" placeholder="Your name" />
              </Field>
            )}
            <Field label="Email" required>
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@business.com" />
            </Field>
            <Field label="Password" required>
              <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••" minLength={6} />
            </Field>

            {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

            <Button type="submit" className="w-full" disabled={busy || (!signupEnabled && mode === 'signup')}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400 font-medium">Or</span></div>
          </div>

          <button
            type="button"
            onClick={handleOpenUserPanel}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50/80 py-2.5 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 shadow-sm"
          >
            <LayoutDashboard className="h-4 w-4 text-blue-600" />
            Open User Panel (Instant Access)
          </button>
        </div>
        


        <p className="mt-4 text-center text-xs text-slate-400">
          By continuing you agree this is authorized business use.
        </p>
      </div>
    </div>
  );
}
