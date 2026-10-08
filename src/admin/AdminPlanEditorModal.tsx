import React, { useState, useEffect } from 'react';
import { Modal, Button, Field, TextInput, Select } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { Shield, Zap, Check, X, Layers } from 'lucide-react';

export const MODULE_FEATURE_KEYS = [
  { key: 'leads', label: 'Lead Intake & Webhooks', desc: 'Universal Lead Inbox, WordPress ingest, Meta Ads' },
  { key: 'quotations', label: 'Quotations & Tax Invoicing', desc: 'PDF Generation, IGST/CGST/SGST, AI Drafts' },
  { key: 'invoices', label: 'Invoices & Razorpay Collect', desc: 'Client payment links & Razorpay reconciliation' },
  { key: 'automations', label: 'Visual Flow Automations', desc: 'n8n-style visual workflow builder & delay nodes' },
  { key: 'ai_assistant', label: 'Global AI Assistant', desc: 'Gemini AI assistant integration' },
  { key: 'custom_fields', label: 'Global Custom Fields', desc: 'Custom metadata fields for clients and leads' },
];

interface AdminPlanEditorModalProps {
  open: boolean;
  onClose: () => void;
  plan: any | null;
  onSaved: () => void;
}

export function AdminPlanEditorModal({ open, onClose, plan, onSaved }: AdminPlanEditorModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [monthlyPrice, setMonthlyPrice] = useState('999');
  const [currency, setCurrency] = useState('INR');
  const [busy, setBusy] = useState(false);

  // Features configuration state map
  const [featureConfig, setFeatureConfig] = useState<Record<string, { is_enabled: boolean; limit_amount: string }>>({
    leads: { is_enabled: true, limit_amount: '' },
    quotations: { is_enabled: true, limit_amount: '' },
    invoices: { is_enabled: true, limit_amount: '' },
    automations: { is_enabled: true, limit_amount: '' },
    ai_assistant: { is_enabled: true, limit_amount: '' },
    custom_fields: { is_enabled: true, limit_amount: '' },
  });

  useEffect(() => {
    if (plan) {
      setName(plan.name || '');
      setDescription(plan.description || '');
      setIsPublic(plan.is_public ?? true);

      const publishedVersions = plan.saas_plan_versions?.filter((v: any) => v.status === 'published') || [];
      const activeVersion = publishedVersions.length > 0 ? publishedVersions[publishedVersions.length - 1] : null;

      if (activeVersion) {
        setMonthlyPrice(String(activeVersion.monthly_price || 0));
        setCurrency(activeVersion.currency || 'INR');

        if (activeVersion.saas_plan_features) {
          const cfgMap: Record<string, { is_enabled: boolean; limit_amount: string }> = { ...featureConfig };
          for (const f of activeVersion.saas_plan_features) {
            cfgMap[f.feature_key] = {
              is_enabled: f.is_enabled,
              limit_amount: f.limit_amount !== null && f.limit_amount !== undefined ? String(f.limit_amount) : '',
            };
          }
          setFeatureConfig(cfgMap);
        }
      }
    } else {
      setName('');
      setDescription('');
      setIsPublic(true);
      setMonthlyPrice('999');
      setCurrency('INR');
    }
  }, [plan, open]);

  const toggleFeature = (key: string) => {
    setFeatureConfig((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        is_enabled: !prev[key]?.is_enabled,
      },
    }));
  };

  const updateLimit = (key: string, limit: string) => {
    setFeatureConfig((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        limit_amount: limit,
      },
    }));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Please enter a plan name.');
      return;
    }
    setBusy(true);

    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      let planId = plan?.id;

      if (!planId) {
        // 1. Create new saas_plan
        const { data: newPlan, error: planErr } = await supabase
          .from('saas_plans')
          .insert({
            name: name.trim(),
            slug,
            description: description.trim(),
            is_public: isPublic,
            display_order: 10,
          })
          .select()
          .single();

        if (planErr) throw planErr;
        planId = newPlan.id;
      } else {
        // Update existing plan
        await supabase
          .from('saas_plans')
          .update({
            name: name.trim(),
            description: description.trim(),
            is_public: isPublic,
          })
          .eq('id', planId);
      }

      // 2. Insert new published version
      const { data: newVer, error: verErr } = await supabase
        .from('saas_plan_versions')
        .insert({
          plan_id: planId,
          version_name: `v_${Date.now()}`,
          monthly_price: Number(monthlyPrice) || 0,
          annual_price: (Number(monthlyPrice) || 0) * 10,
          currency,
          status: 'published',
        })
        .select()
        .single();

      if (verErr) throw verErr;

      // 3. Save feature limits
      const featureRows = MODULE_FEATURE_KEYS.map((mf) => {
        const conf = featureConfig[mf.key] || { is_enabled: true, limit_amount: '' };
        return {
          plan_version_id: newVer.id,
          feature_key: mf.key,
          is_enabled: conf.is_enabled,
          limit_amount: conf.limit_amount.trim() ? Number(conf.limit_amount) : null,
        };
      });

      await supabase.from('saas_plan_features').insert(featureRows);

      onSaved();
      onClose();
    } catch (err: any) {
      alert(`Failed to save plan: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={plan ? `Edit Plan: ${plan.name}` : 'Create New SaaS Plan Tier'}>
      <div className="space-y-4 py-2 max-h-[80vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Plan Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Professional Plan" />
          </Field>
          <Field label="Monthly Price (₹)">
            <TextInput value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} placeholder="999" />
          </Field>
        </div>

        <Field label="Description">
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Suitable for growing teams" />
        </Field>

        <div className="flex items-center gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="rounded text-blue-600" />
            Make Plan Publicly Visible on Pricing Page
          </label>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" /> 360° Module Access & Limit Controller
          </h4>

          <div className="space-y-3">
            {MODULE_FEATURE_KEYS.map((mf) => {
              const conf = featureConfig[mf.key] || { is_enabled: true, limit_amount: '' };
              return (
                <div key={mf.key} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleFeature(mf.key)}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        conf.is_enabled ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-transparent'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{mf.label}</div>
                      <div className="text-[11px] text-slate-500">{mf.desc}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">Limit:</span>
                    <TextInput
                      value={conf.limit_amount}
                      onChange={(e) => updateLimit(mf.key, e.target.value)}
                      placeholder="Unlimited"
                      disabled={!conf.is_enabled}
                      className="w-24 text-xs py-1"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? 'Saving Plan...' : 'Save & Publish Version'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
