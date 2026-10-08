import { useState, useEffect } from "react";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase";
import { Save, Lock, Bot, Shield, FileText, Database, Activity } from "lucide-react";
import { toast } from "sonner";
import { Button, TextInput, LoadingState } from "@/components/ui";

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={`block w-10 h-6 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}></div>
        <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}></div>
      </div>
    </label>
  );
}

export function AISettings() {
  const { activeWorkspace } = useWorkspace();
  const [activeTab, setActiveTab] = useState<"providers" | "privacy" | "limits">("providers");
  const [loading, setLoading] = useState(true);

  // Providers State
  const [providers, setProviders] = useState<any[]>([]);
  const [newProvider, setNewProvider] = useState({ provider_name: "openai", connection_name: "OpenAI Main", api_key: "", default_model: "gpt-4o-mini" });

  // Privacy State
  const [privacy, setPrivacy] = useState<any>({
    ai_enabled: true,
    allow_client_communications: true,
    allow_invoice_narrative: true,
    allow_internal_notes: false,
    allow_uploaded_documents: true,
    store_prompt_history: true,
    store_response_history: true,
  });

  useEffect(() => {
    if (activeWorkspace) {
      loadData();
    }
  }, [activeWorkspace]);

  const loadData = async () => {
    setLoading(true);
    if (!activeWorkspace) return;

    // Load Providers
    const { data: provs } = await supabase
      .from("ai_providers")
      .select("*")
      .eq("workspace_id", activeWorkspace.id);
    if (provs) setProviders(provs);

    // Load Privacy
    const { data: priv } = await supabase
      .from("ai_privacy_settings")
      .select("*")
      .eq("workspace_id", activeWorkspace.id)
      .maybeSingle();
    
    if (priv) setPrivacy(priv);
    setLoading(false);
  };

  const handleSaveProvider = async () => {
    if (!activeWorkspace) return;
    try {
      // 1. Insert Provider
      const { data: prov, error: provErr } = await supabase
        .from("ai_providers")
        .insert({
          workspace_id: activeWorkspace.id,
          provider_name: newProvider.provider_name,
          connection_name: newProvider.connection_name,
          default_model: newProvider.default_model,
        })
        .select()
        .single();
      
      if (provErr) throw provErr;

      // 2. Encrypt API Key via RPC
      if (newProvider.api_key) {
        const { error: rpcErr } = await supabase.rpc("store_ai_secret", {
          p_workspace_id: activeWorkspace.id,
          p_provider_id: prov.id,
          p_key_name: "api_key",
          p_raw_value: newProvider.api_key,
        });
        if (rpcErr) throw rpcErr;
      }

      toast.success("AI Provider saved securely!");
      setNewProvider({ provider_name: "openai", connection_name: "OpenAI Main", api_key: "", default_model: "gpt-4o-mini" });
      loadData();
    } catch (e: any) {
      toast.error(e.message || "Failed to save provider");
    }
  };

  const handleSavePrivacy = async () => {
    if (!activeWorkspace) return;
    try {
      const { error } = await supabase
        .from("ai_privacy_settings")
        .upsert({
          workspace_id: activeWorkspace.id,
          ...privacy
        });
      
      if (error) throw error;
      toast.success("Privacy settings updated");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Bot className="w-6 h-6 text-indigo-600" />
          AI & Assistant Settings
        </h1>
        <p className="text-slate-500 mt-1">Configure models, credentials, and data privacy limits.</p>
      </div>

      <div className="flex gap-6 border-b border-slate-200 mb-8">
        {[
          { id: "providers", label: "Providers & Models", icon: Database },
          { id: "privacy", label: "Privacy & Isolation", icon: Shield },
          { id: "limits", label: "Usage Limits", icon: Activity },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`pb-3 px-1 border-b-2 font-medium flex items-center gap-2 ${activeTab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "providers" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Add New Provider</h3>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Provider Type</label>
                <select 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  value={newProvider.provider_name}
                  onChange={e => setNewProvider({...newProvider, provider_name: e.target.value})}
                >
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="claude">Anthropic Claude</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Connection Name</label>
                <TextInput 
                  value={newProvider.connection_name}
                  onChange={(e: any) => setNewProvider({...newProvider, connection_name: e.target.value})}
                  placeholder="e.g. My OpenAI Key"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center justify-between">
                  API Key
                  <span className="flex items-center gap-1 text-xs text-emerald-600"><Lock className="w-3 h-3"/> Encrypted in DB</span>
                </label>
                <TextInput 
                  type="password"
                  value={newProvider.api_key}
                  onChange={(e: any) => setNewProvider({...newProvider, api_key: e.target.value})}
                  placeholder="sk-..."
                />
              </div>
              <div className="col-span-2 flex justify-end mt-2">
                <Button onClick={handleSaveProvider}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Provider securely
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Configured Providers</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {providers.length === 0 ? (
                <div className="p-6 text-center text-slate-500">No providers configured.</div>
              ) : (
                providers.map(p => (
                  <div key={p.id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-900 flex items-center gap-2">
                        {p.connection_name}
                        {p.is_active && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">Active</span>}
                      </div>
                      <div className="text-sm text-slate-500 mt-1 capitalize">{p.provider_name} • Model: {p.default_model}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "privacy" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
           <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">AI Privacy & Data Boundaries</h3>
            </div>
            <div className="p-6 space-y-6">
              <Switch 
                label="Enable AI Features Globally" 
                checked={privacy.ai_enabled}
                onChange={(v: boolean) => setPrivacy({...privacy, ai_enabled: v})}
              />
              <Switch 
                label="Allow AI in Client Communications" 
                checked={privacy.allow_client_communications}
                onChange={(v: boolean) => setPrivacy({...privacy, allow_client_communications: v})}
              />
              <Switch 
                label="Allow AI to Read Internal Notes" 
                checked={privacy.allow_internal_notes}
                onChange={(v: boolean) => setPrivacy({...privacy, allow_internal_notes: v})}
              />
              <Switch 
                label="Store Prompt/Response History (Audit Trail)" 
                checked={privacy.store_prompt_history}
                onChange={(v: boolean) => setPrivacy({...privacy, store_prompt_history: v})}
              />
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <Button onClick={handleSavePrivacy}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Privacy Rules
                </Button>
              </div>
            </div>
        </div>
      )}

      {activeTab === "limits" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-500">
          <Activity className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p>Usage Dashboard and token limits will be displayed here as data aggregates.</p>
        </div>
      )}
    </div>
  );
}
