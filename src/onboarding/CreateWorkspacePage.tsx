import { useState, useRef } from 'react';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { Button } from '@/components/ui';
import { Shield, Zap, Sparkles } from 'lucide-react';

export function CreateWorkspacePage() {
  const { bootstrapWorkspace } = useWorkspace();
  const { navigate } = useRouter();
  
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [timezone, setTimezone] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [currency, setCurrency] = useState('INR');
  
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36));

  // Dynamic logic for Country
  const handleCountryChange = (val: string) => {
    setCountry(val);
    if (val.toLowerCase() === 'india' || val.toLowerCase() === 'in') {
      setCurrency('INR');
      setTimezone('Asia/Kolkata');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      nameInputRef.current?.focus();
      return;
    }
    
    setError(null);
    setBusy(true);

    try {
      const { error: wsError } = await bootstrapWorkspace(
        name,
        industry,
        country,
        state,
        timezone,
        teamSize,
        currency,
        idempotencyKey
      );

      if (wsError) {
        // Safe error messages instead of raw DB errors
        console.error("Workspace Creation Error:", wsError);
        setError(typeof wsError === 'string' ? wsError : "Failed to create workspace. Please check your details and try again.");
        setBusy(false);
      } else {
        // Direct them to the onboarding wizard
        navigate('/onboarding');
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left Panel - Visuals & Value Prop */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between bg-slate-900 px-12 py-16 text-white relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]"></div>
        <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-blue-500 blur-3xl opacity-20"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-64 w-64 rounded-full bg-indigo-500 blur-3xl opacity-20"></div>

        <div className="relative z-10">
          <div className="mb-12 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-sm">K1</div>
          
          <h1 className="text-4xl font-bold tracking-tight mb-4 text-white">Welcome to Kanishk One</h1>
          <p className="text-lg text-slate-300 mb-12 max-w-md">
            Set up your organization's workspace in seconds and start managing your operations with our Smart Business Suite.
          </p>

          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="mt-1 bg-white/10 p-2 rounded-lg"><Sparkles className="w-5 h-5 text-blue-400" /></div>
              <div>
                <h3 className="font-semibold text-white">All-in-one platform</h3>
                <p className="text-sm text-slate-400 mt-1">Manage clients, projects, and billing from a single unified dashboard.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="mt-1 bg-white/10 p-2 rounded-lg"><Shield className="w-5 h-5 text-green-400" /></div>
              <div>
                <h3 className="font-semibold text-white">Enterprise-grade security</h3>
                <p className="text-sm text-slate-400 mt-1">Your data is isolated and protected with strict Row Level Security.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="mt-1 bg-white/10 p-2 rounded-lg"><Zap className="w-5 h-5 text-amber-400" /></div>
              <div>
                <h3 className="font-semibold text-white">Automated workflows</h3>
                <p className="text-sm text-slate-400 mt-1">Save time with smart automations and built-in client portals.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-12 text-sm text-slate-400">
          <p>Don't worry, you can easily update these settings later in your workspace preferences.</p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex w-full lg:w-[55%] items-center justify-center p-6 sm:p-12 bg-slate-50 lg:bg-white relative">
        <div className="w-full min-w-[320px] sm:min-w-[480px] max-w-[580px] rounded-2xl bg-white p-8 sm:p-10 shadow-xl lg:shadow-none lg:border-none border border-slate-200">
          
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Set up your workspace</h2>
            <p className="mt-2 text-sm text-slate-600">Tell us a bit about your business to get started.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">
                Business Name <span className="text-rose-500">*</span>
              </label>
              <input 
                ref={nameInputRef}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
                placeholder="Acme Corp" 
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Industry</label>
              <select 
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              >
                <option value="">Select industry</option>
                <option value="agency">Agency</option>
                <option value="software">Software / IT</option>
                <option value="consulting">Consulting</option>
                <option value="freelance">Freelance</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">Country</label>
                <input 
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  value={country} 
                  onChange={(e) => handleCountryChange(e.target.value)} 
                  placeholder="India" 
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">State / Region</label>
                <input 
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  value={state} 
                  onChange={(e) => setState(e.target.value)} 
                  placeholder="Maharashtra" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">Team Size</label>
                <select 
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white"
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                >
                  <option value="">Select size</option>
                  <option value="1">Just me (1)</option>
                  <option value="2-5">2 - 5</option>
                  <option value="6-20">6 - 20</option>
                  <option value="21+">21+</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">Currency</label>
                <select 
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 flex items-start gap-3">
                <svg className="w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>{error}</p>
              </div>
            )}

            <div className="pt-4">
              <Button 
                type="submit" 
                className="w-full rounded-lg py-2.5 text-base font-medium h-auto" 
                disabled={busy}
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor" />
                    </svg>
                    Creating Workspace...
                  </span>
                ) : (
                  'Create Workspace'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
