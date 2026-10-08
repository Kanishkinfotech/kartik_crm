import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button, Field, TextInput } from '@/components/ui';
import { useRouter } from '@/lib/router';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';

export function PortalAcceptInvite() {
  const { navigate } = useRouter();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    const e = params.get('email');
    if (!t) {
      toast.error('Invalid invitation link.');
      navigate('/portal/login');
    } else {
      setToken(t);
      if (e) setEmail(e);
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !email) return;
    
    setLoading(true);

    try {
      // 1. Try to sign up
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        // If they already exist, we need to sign them in
        if (authError.message.includes('already registered')) {
          const { error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password
          });
          if (loginError) {
            throw new Error('Account exists, but password was incorrect. Please try logging in normally first.');
          }
        } else {
          throw authError;
        }
      }

      // 2. Call the RPC to accept invitation
      const { error: rpcError } = await supabase.rpc('accept_portal_invitation', { p_token: token });
      
      if (rpcError) {
        throw new Error(`Failed to accept invitation: ${rpcError.message}`);
      }

      toast.success("Welcome to the Client Portal!");
      navigate('/portal/dashboard');
      
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) return null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 mb-4">
            <ShieldCheck className="h-6 w-6 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Accept Portal Invitation
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Set a password for your account <strong>{email}</strong> to access your secure client portal.
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <Field label="Password" required>
            <TextInput
              type="password"
              required
              value={password}
              onChange={(e: any) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
            />
          </Field>

          <Button type="submit" disabled={loading} className="w-full flex justify-center">
            {loading ? 'Creating account...' : 'Create Account & Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}
