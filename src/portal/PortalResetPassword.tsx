import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button, Field, TextInput } from '@/components/ui';
import { useRouter } from '@/lib/router';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';

export function PortalResetPassword() {
  const { navigate } = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/portal/update-password`,
      });

      if (error) {
        throw error;
      }

      setSent(true);
      toast.success("Password reset instructions sent.");
      
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center space-y-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <KeyRound className="h-6 w-6 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Check your email</h2>
          <p className="text-sm text-slate-600">
            We've sent password reset instructions to <strong>{email}</strong>.
          </p>
          <Button variant="outline" onClick={() => navigate('/portal/login')} className="w-full">
            Back to login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 mb-4">
            <KeyRound className="h-6 w-6 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Reset Password
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Enter your email address and we'll send you a link to reset your password.
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <Field label="Email address" required>
            <TextInput
              type="email"
              required
              value={email}
              onChange={(e: any) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </Field>

          <Button type="submit" disabled={loading} className="w-full flex justify-center">
            {loading ? 'Sending...' : 'Send Reset Link'}
          </Button>
          
          <div className="text-center mt-4">
             <button
                type="button"
                onClick={() => navigate('/portal/login')}
                className="font-medium text-sm text-indigo-600 hover:text-indigo-500"
              >
                Back to login
              </button>
          </div>
        </form>
      </div>
    </div>
  );
}
