import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { Button, LoadingState } from '@/components/ui';
import { CheckCircle2, ChevronRight, Server, MessageCircle, Mail, Bot, UserPlus } from 'lucide-react';

type Step = 'branding' | 'services' | 'integrations' | 'first_client';

export function OnboardingWizard() {
  const { activeWorkspace, refresh } = useWorkspace();
  const { navigate } = useRouter();
  
  const [currentStep, setCurrentStep] = useState<Step>('branding');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function loadState() {
      if (!activeWorkspace) return;
      const { data, error } = await supabase
        .from('workspace_onboarding')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .single();
      
      if (!error && data) {
        if (data.is_complete) {
          navigate('/');
        } else {
          setCurrentStep((data.current_step as Step) || 'branding');
        }
      }
      setLoading(false);
    }
    loadState();
  }, [activeWorkspace, navigate]);

  const saveStep = async (nextStep: Step | 'complete') => {
    if (!activeWorkspace) return;
    setBusy(true);
    
    await supabase.rpc('save_onboarding_step', {
      p_workspace_id: activeWorkspace.id,
      p_current_step: nextStep,
      p_completed_step: currentStep,
      p_data: {}
    });

    if (nextStep === 'complete') {
      await refresh();
      navigate('/');
    } else {
      setCurrentStep(nextStep);
    }
    setBusy(false);
  };

  if (loading) return <LoadingState label="Loading your setup..." />;

  const steps = [
    { id: 'branding', label: 'Branding & Details' },
    { id: 'services', label: 'Your Services' },
    { id: 'integrations', label: 'Connect Tools' },
    { id: 'first_client', label: 'First Client' },
  ];

  const currentIdx = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header / Progress bar */}
      <div className="bg-white border-b border-slate-200 py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="font-bold text-lg text-slate-900">Kanishk One Setup</div>
          <div className="flex items-center gap-2">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center gap-2">
                <div className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold ${
                  idx < currentIdx ? 'bg-blue-600 text-white' : 
                  idx === currentIdx ? 'border-2 border-blue-600 text-blue-600' : 
                  'bg-slate-100 text-slate-400'
                }`}>
                  {idx < currentIdx ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                </div>
                <span className={`text-sm hidden sm:block ${idx <= currentIdx ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
                  {step.label}
                </span>
                {idx < steps.length - 1 && <ChevronRight className="h-4 w-4 text-slate-300" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full max-w-2xl mx-auto p-6 flex flex-col justify-center">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          
          {currentStep === 'branding' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-900">Customize your workspace</h2>
                <p className="mt-1 text-slate-500">Upload your logo and add your GSTIN for invoices.</p>
              </div>
              <div className="h-40 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 bg-slate-50">
                [ Logo Upload Placeholder ]
              </div>
              <div className="flex justify-end">
                <Button onClick={() => saveStep('services')} disabled={busy}>Continue</Button>
              </div>
            </div>
          )}

          {currentStep === 'services' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-900">What services do you offer?</h2>
                <p className="mt-1 text-slate-500">Add a few services so you can start creating quotations faster.</p>
              </div>
              <div className="space-y-3">
                <div className="p-4 border rounded-lg border-slate-200 text-slate-500">
                  Example: Web Development (₹50,000)
                </div>
                <div className="p-4 border rounded-lg border-slate-200 text-slate-500">
                  Example: SEO Consulting (₹20,000)
                </div>
              </div>
              <div className="flex justify-between items-center">
                <Button variant="ghost" onClick={() => saveStep('integrations')} disabled={busy}>Skip for now</Button>
                <Button onClick={() => saveStep('integrations')} disabled={busy}>Continue</Button>
              </div>
            </div>
          )}

          {currentStep === 'integrations' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-900">Connect your tools</h2>
                <p className="mt-1 text-slate-500">Kanishk One uses Bring Your Own Key (BYOK). You control your data and billing.</p>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 border border-slate-200 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-medium text-slate-900"><Mail className="h-5 w-5 text-blue-500" /> Email (SMTP/IMAP)</div>
                  <p className="text-xs text-slate-500 mb-2">Connect your own business mailbox to send and sync emails.</p>
                  <Button variant="outline" size="sm" className="mt-auto">Configure Later</Button>
                </div>
                <div className="p-4 border border-slate-200 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-medium text-slate-900"><MessageCircle className="h-5 w-5 text-green-500" /> WhatsApp Business</div>
                  <p className="text-xs text-slate-500 mb-2">Connect your official WhatsApp Business API credentials.</p>
                  <Button variant="outline" size="sm" className="mt-auto">Configure Later</Button>
                </div>
                <div className="p-4 border border-slate-200 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-medium text-slate-900"><Server className="h-5 w-5 text-indigo-500" /> Razorpay (Client Billing)</div>
                  <p className="text-xs text-slate-500 mb-2">Connect your own Razorpay account to collect client payments.</p>
                  <Button variant="outline" size="sm" className="mt-auto">Configure Later</Button>
                </div>
                <div className="p-4 border border-slate-200 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-medium text-slate-900"><Bot className="h-5 w-5 text-purple-500" /> AI Provider</div>
                  <p className="text-xs text-slate-500 mb-2">Add your OpenAI or Gemini key to enable smart features.</p>
                  <Button variant="outline" size="sm" className="mt-auto">Configure Later</Button>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <Button variant="ghost" onClick={() => saveStep('first_client')} disabled={busy}>Skip all for now</Button>
                <Button onClick={() => saveStep('first_client')} disabled={busy}>Continue</Button>
              </div>
            </div>
          )}

          {currentStep === 'first_client' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <UserPlus className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Add your first client</h2>
                <p className="mt-1 text-slate-500">You're almost done! Let's get your first client into the system.</p>
              </div>
              
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-200">
                [ Client Form Placeholder ]
              </div>

              <div className="flex justify-between items-center">
                <Button variant="ghost" onClick={() => saveStep('complete')} disabled={busy}>Skip and go to Dashboard</Button>
                <Button onClick={() => saveStep('complete')} disabled={busy}>Finish Setup</Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
