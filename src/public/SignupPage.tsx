import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import { Button, Field, TextInput } from '@/components/ui';
import { CheckSquare, Square } from 'lucide-react';

export function SignupPage() {
  const { signUp } = useAuth();
  const { navigate } = useRouter();
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) {
      setError('You must accept the terms of service.');
      return;
    }
    setError(null);
    setBusy(true);
    
    // We pass phone in metadata as well, though the signUp signature might need to be adjusted or we just pass it to Supabase via metadata.
    // The current signUp in useAuth only takes email, password, fullName. We can pass phone as part of full name string or update the auth context later.
    // For now, let's just use what we have, and we'll update useAuth shortly.
    const { error: authError } = await signUp(email, password, fullName);
    
    setBusy(false);
    
    if (authError) {
      setError(authError);
    } else {
      navigate('/verify-email');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Create your account</h1>
          <p className="mt-2 text-slate-600">Start your 14-day free trial. No credit card required.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Full name" required>
              <TextInput 
                value={fullName} 
                onChange={(e) => setFullName(e.target.value)} 
                required 
                placeholder="John Doe" 
              />
            </Field>
            
            <Field label="Work email" required>
              <TextInput 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                placeholder="john@company.com" 
              />
            </Field>

            <Field label="Phone number">
              <TextInput 
                type="tel" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
                placeholder="+91 98765 43210" 
              />
            </Field>
            
            <Field label="Password" required>
              <TextInput 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                placeholder="••••••••" 
                minLength={8} 
              />
            </Field>

            <div 
              className="flex items-start gap-3 cursor-pointer" 
              onClick={() => setAcceptedTerms(!acceptedTerms)}
            >
              <div className="mt-0.5 text-blue-600">
                {acceptedTerms ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-slate-300" />}
              </div>
              <p className="text-sm text-slate-600 select-none">
                I agree to the Kanishk One <a href="#" className="text-blue-600 hover:underline">Terms of Service</a> and <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>.
              </p>
            </div>

            {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

            <Button type="submit" className="w-full h-11 text-base" disabled={busy}>
              {busy ? 'Creating account…' : 'Sign up for free'}
            </Button>
          </form>
        </div>
        
        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <button onClick={() => navigate('/')} className="font-semibold text-blue-600 hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
